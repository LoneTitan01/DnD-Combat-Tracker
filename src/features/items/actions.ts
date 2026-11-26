import { deleteItem, exportItems, importItems, type ImportResult } from '../../db';
import type { ID, Item } from '../../models';
import { download, slug } from '../bestiary/backup';

/** Confirms, then deletes. Returns whether it was deleted. */
export async function confirmAndDeleteItem(i: Item): Promise<boolean> {
  if (!confirm(`Delete ${i.name}?`)) return false;
  await deleteItem(i.id);
  return true;
}

export async function downloadItems(ids?: readonly ID[], name?: string): Promise<void> {
  const data = await exportItems(ids);
  const date = new Date().toISOString().slice(0, 10);
  download(name ? `${slug(name)}.json` : `items-${date}.json`, data);
}

export async function importItemFile(file: File): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} isn't valid JSON.`);
  }
  return importItems(data);
}

export function describeItemImport(r: ImportResult): string {
  const parts = [`Imported ${r.added} new item${r.added === 1 ? '' : 's'}`];
  if (r.replaced) parts.push(`replaced ${r.replaced}`);
  if (r.skipped) parts.push(`skipped ${r.skipped} without a name`);
  return `${parts.join(', ')}.`;
}
