import { parseSyncFile } from '../logic/sync';
import type { SyncFile } from '../models';
import type { SyncRemote } from './engine';

/*
 * Google sign-in (Google Identity Services token flow) and the Drive app data folder. Everything
 * runs in the browser, so it works from GitHub Pages without a server. The `drive.appdata` scope
 * only lets the app see its own hidden folder, not the rest of the user's Drive.
 */

export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'dm-combat-tracker.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

/** Thrown when the access token is missing or expired; the user needs to reconnect. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Google sign-in expired.');
  }
}

let gis: Promise<void> | null = null;

/** Loads the Google sign-in script once. It must be ready before a click asks for a token. */
export function loadGoogleSignIn(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gis = null;
      s.remove();
      reject(new Error('Couldn’t load Google sign-in. Check the internet connection.'));
    };
    document.head.appendChild(s);
  });
  return gis;
}

export const googleSignInReady = (): boolean => !!window.google?.accounts?.oauth2;

export interface AccessToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Opens Google's sign-in popup and resolves with an access token. Call it straight from a click
 * handler (after `loadGoogleSignIn`), or the browser blocks the popup.
 */
export function requestAccessToken(loginHint?: string): Promise<AccessToken> {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('Sync isn’t set up for this copy of the app.'));
  if (!oauth2) return Promise.reject(new Error('Google sign-in hasn’t loaded yet.'));
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in failed.'));
        if (!oauth2.hasGrantedAllScopes(r, SCOPE)) {
          return reject(new Error('Google Drive access wasn’t allowed, so there’s nowhere to keep the synced data.'));
        }
        resolve({ accessToken: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 });
      },
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? 'The Google sign-in window was closed.' : e.message || 'Google sign-in failed.')),
    });
    client.requestAccessToken({ prompt: '', ...(loginHint ? { login_hint: loginHint } : {}) });
  });
}

export function revokeAccessToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return resolve();
    oauth2.revoke(token, () => resolve());
  });
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Couldn’t reach Google Drive. Check the internet connection.');
  }
  if (res.status === 401) throw new AuthExpiredError();
  if (!res.ok) throw new Error(`Google Drive returned an error (${res.status}).`);
  return res;
}

/** The signed-in account's email, for display. Not essential, so failures return undefined. */
export async function googleAccountEmail(token: string): Promise<string | undefined> {
  try {
    const res = await call(token, `${DRIVE}/about?fields=user(emailAddress)`);
    return ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress;
  } catch {
    return undefined;
  }
}

/** The sync file in the account's Drive app data folder. */
export class DriveRemote implements SyncRemote {
  private fileId: string | null = null;

  constructor(private readonly token: () => string) {}

  private async findFile(): Promise<string | null> {
    if (this.fileId) return this.fileId;
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const res = await call(this.token(), `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
    const files = ((await res.json()) as { files?: Array<{ id: string }> }).files ?? [];
    this.fileId = files[0]?.id ?? null;
    return this.fileId;
  }

  async load(): Promise<SyncFile | null> {
    const id = await this.findFile();
    if (!id) return null;
    const res = await call(this.token(), `${DRIVE}/files/${id}?alt=media`);
    return parseSyncFile(await res.json());
  }

  async save(file: SyncFile): Promise<void> {
    let id = await this.findFile();
    if (!id) {
      const res = await call(this.token(), `${DRIVE}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }),
      });
      id = ((await res.json()) as { id: string }).id;
      this.fileId = id;
    }
    await call(this.token(), `${UPLOAD}/files/${id}?uploadType=media&fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
  }

  /** Removes the synced copy from Drive. This device's data is untouched. */
  async deleteFile(): Promise<void> {
    const id = await this.findFile();
    if (id) await call(this.token(), `${DRIVE}/files/${id}`, { method: 'DELETE' });
    this.fileId = null;
  }
}
