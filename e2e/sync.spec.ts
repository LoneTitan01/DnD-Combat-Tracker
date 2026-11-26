import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { seed } from './helpers';

/** Stand-ins for Google's sign-in script and the Drive API, shared by every "device" in a test. */
interface FakeDrive {
  body: string | null;
  exists: boolean;
  /** When set, Drive answers 401 as if the sign-in had expired. */
  expired: boolean;
  uploads: number;
}

const GIS = `
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken() { setTimeout(() => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }), 10); } };
  },
  hasGrantedAllScopes() { return true; },
  revoke(token, done) { if (done) done(); },
} } };`;

async function fakeGoogle(context: BrowserContext, drive: FakeDrive) {
  await context.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
  await context.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const method = req.method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    };
    const json = (body: unknown) =>
      route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (drive.expired || req.headers()['authorization'] !== 'Bearer fake-token') return route.fulfill({ status: 401, headers });
    if (pathname === '/drive/v3/about') return json({ user: { emailAddress: 'dm@example.com' } });
    if (pathname === '/drive/v3/files' && method === 'GET') return json({ files: drive.exists ? [{ id: 'f1' }] : [] });
    if (pathname === '/drive/v3/files' && method === 'POST') {
      drive.exists = true;
      return json({ id: 'f1' });
    }
    if (pathname === '/drive/v3/files/f1' && method === 'GET' && drive.exists) {
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: drive.body ?? '{}' });
    }
    if (pathname === '/upload/drive/v3/files/f1' && method === 'PATCH' && drive.exists) {
      drive.body = req.postData();
      drive.uploads++;
      return json({ id: 'f1' });
    }
    if (pathname === '/drive/v3/files/f1' && method === 'DELETE') {
      drive.exists = false;
      drive.body = null;
      return route.fulfill({ status: 204, headers });
    }
    return route.fulfill({ status: 404, headers });
  });
}

const status = (page: Page) => page.getByRole('status', { name: 'Sync status' });

async function connect(page: Page) {
  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Connect Google account' }).click();
  await expect(status(page)).toHaveText('Synced just now');
  await expect(page.getByText('dm@example.com')).toBeVisible();
}

async function syncNow(page: Page) {
  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(status(page)).toHaveText('Synced just now');
}

async function addPlayer(page: Page, name: string) {
  await page.goto('#/party');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
}

test('sync through a Google account: two devices merge, deletions spread, reconnect, disconnect', async ({ browser }) => {
  const drive: FakeDrive = { body: null, exists: false, expired: false, uploads: 0 };

  // Laptop: existing data, then connect. The first sync uploads it.
  const laptopCtx = await browser.newContext();
  await fakeGoogle(laptopCtx, drive);
  const laptop = await laptopCtx.newPage();
  laptop.on('dialog', (d) => void d.accept());
  await seed(laptop);
  await laptop.goto('#/sync'); // old link redirects to Settings
  await expect(laptop).toHaveURL(/#\/settings$/);
  await expect(status(laptop)).toHaveText('Off');
  await expect(laptop.getByRole('link', { name: /^Sync:/ })).toHaveCount(0); // no header badge while off
  await connect(laptop);
  await expect(laptop.getByRole('link', { name: 'Sync: Synced just now' })).toBeVisible();
  expect(drive.uploads).toBe(1);

  // Tablet: its own player, then connect. Both sides end up with everything.
  const tabletCtx = await browser.newContext();
  await fakeGoogle(tabletCtx, drive);
  const tablet = await tabletCtx.newPage();
  tablet.on('dialog', (d) => void d.accept());
  await addPlayer(tablet, 'Eve');
  await connect(tablet);
  await tablet.goto('#/bestiary');
  await expect(tablet.getByRole('link', { name: 'Goblin' })).toBeVisible();
  await expect(tablet.getByRole('link', { name: 'Dragon' })).toBeVisible();
  await tablet.goto('#/encounters');
  await expect(tablet.getByText('Dragon and friends')).toBeVisible();

  await syncNow(laptop);
  await laptop.goto('#/party');
  for (const name of ['Aria', 'Brom', 'Cass', 'Dain', 'Eve']) {
    await expect(laptop.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
  }

  // A deletion on the tablet uploads by itself a few seconds later and reaches the laptop.
  const uploads = drive.uploads;
  await tablet.goto('#/party');
  await tablet
    .getByRole('row')
    .filter({ has: tablet.getByRole('textbox', { name: 'Name for Dain' }) })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(tablet.getByRole('textbox', { name: 'Name for Dain' })).toHaveCount(0);
  await expect.poll(() => drive.uploads, { timeout: 15_000 }).toBeGreaterThan(uploads);
  await syncNow(laptop);
  await laptop.goto('#/party');
  await expect(laptop.getByRole('textbox', { name: 'Name for Dain' })).toHaveCount(0);

  // An expired Google sign-in pauses sync; the header's Reconnect button resumes it.
  drive.expired = true;
  await laptop.goto('#/settings');
  await laptop.getByRole('button', { name: 'Sync now' }).click();
  await expect(status(laptop)).toHaveText('Paused: Google needs you to sign in again');
  drive.expired = false;
  await laptop.getByRole('button', { name: '☁ Reconnect sync' }).click();
  await expect(status(laptop)).toHaveText('Synced just now');

  // Disconnecting keeps this device's data and stops syncing.
  await laptop.getByRole('button', { name: 'Disconnect' }).click();
  await expect(status(laptop)).toHaveText('Off');
  await expect(laptop.getByRole('link', { name: /^Sync:/ })).toHaveCount(0);
  await laptop.goto('#/party');
  await expect(laptop.getByRole('textbox', { name: 'Name for Eve' })).toBeVisible();

  // Deleting the synced copy removes the Drive file.
  await tablet.goto('#/settings');
  await tablet.getByRole('button', { name: 'Delete synced copy' }).click();
  await expect(status(tablet)).toHaveText('Off');
  expect(drive.exists).toBe(false);

  await laptopCtx.close();
  await tabletCtx.close();
});

test('keyboard shortcuts sync only between devices that turn it on', async ({ browser }) => {
  const drive: FakeDrive = { body: null, exists: false, expired: false, uploads: 0 };
  const open = async () => {
    const ctx = await browser.newContext();
    await fakeGoogle(ctx, drive);
    const page = await ctx.newPage();
    return { ctx, page };
  };
  const toggle = (page: Page) => page.getByRole('checkbox', { name: /Sync keyboard shortcuts/ });
  const nextTurnKey = (page: Page) => page.getByLabel('Shortcut for Next turn', { exact: true });

  // Laptop: shortcut sync on, Next turn → T.
  const laptop = await open();
  await connect(laptop.page);
  await expect(toggle(laptop.page)).not.toBeChecked();
  await toggle(laptop.page).check();
  await laptop.page.getByRole('button', { name: 'Change shortcut for Next turn' }).click();
  await laptop.page.keyboard.press('t');
  await expect(nextTurnKey(laptop.page)).toHaveText('T');
  await syncNow(laptop.page);

  // Tablet with it off keeps its own keys.
  const tablet = await open();
  await connect(tablet.page);
  await expect(nextTurnKey(tablet.page)).toHaveText('N');

  // Turning it on brings in the laptop's.
  await toggle(tablet.page).check();
  await expect(nextTurnKey(tablet.page)).toHaveText('T');
  await expect(tablet.page.getByText('They sync to your other devices')).toBeVisible();

  // The setting survives a reload and disconnecting.
  await tablet.page.reload();
  await expect(toggle(tablet.page)).toBeChecked();
  await tablet.page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(toggle(tablet.page)).toBeChecked();

  await laptop.ctx.close();
  await tablet.ctx.close();
});
