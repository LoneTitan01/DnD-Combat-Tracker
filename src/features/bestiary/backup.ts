import { exportCreatures, importCreatures, type ImportResult } from '../../db';
import type { ID } from '../../models';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creature';
}

function download(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the whole bestiary, or just the given stat blocks. */
export async function downloadBestiary(ids?: readonly ID[], name?: string): Promise<void> {
  const data = await exportCreatures(ids);
  const date = new Date().toISOString().slice(0, 10);
  download(name ? `${slug(name)}.json` : `bestiary-${date}.json`, data);
}

/** Reads a user-picked JSON file and imports its stat blocks. */
export async function importBestiaryFile(file: File): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} isn't valid JSON.`);
  }
  return importCreatures(data);
}

export function describeImport(r: ImportResult): string {
  const parts = [`Imported ${r.added} new stat block${r.added === 1 ? '' : 's'}`];
  if (r.replaced) parts.push(`replaced ${r.replaced}`);
  if (r.skipped) parts.push(`skipped ${r.skipped} without a name`);
  return `${parts.join(', ')}.`;
}
