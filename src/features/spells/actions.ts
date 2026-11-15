import { creaturesUsingSpell, deleteSpell, exportSpells, importSpells, type ImportResult } from '../../db';
import type { ID, Spell } from '../../models';
import { download, slug } from '../bestiary/backup';

/** Confirms (warning about stat blocks that link to it), then deletes. Returns whether it was deleted. */
export async function confirmAndDeleteSpell(s: Spell): Promise<boolean> {
  const used = await creaturesUsingSpell(s.id);
  const warning = used.length
    ? `\n\n${used.length} stat block${used.length === 1 ? ' links' : 's link'} to it (${used
        .slice(0, 3)
        .map((c) => c.name)
        .join(', ')}${used.length > 3 ? '…' : ''}); it will stop showing there.`
    : '';
  if (!confirm(`Delete ${s.name}?${warning}`)) return false;
  await deleteSpell(s.id);
  return true;
}

export async function downloadSpells(ids?: readonly ID[], name?: string): Promise<void> {
  const data = await exportSpells(ids);
  const date = new Date().toISOString().slice(0, 10);
  download(name ? `${slug(name)}.json` : `spells-${date}.json`, data);
}

export async function importSpellFile(file: File): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} isn't valid JSON.`);
  }
  return importSpells(data);
}

export function describeSpellImport(r: ImportResult): string {
  const parts = [`Imported ${r.added} new spell${r.added === 1 ? '' : 's'}`];
  if (r.replaced) parts.push(`replaced ${r.replaced}`);
  if (r.skipped) parts.push(`skipped ${r.skipped} without a name`);
  return `${parts.join(', ')}.`;
}
