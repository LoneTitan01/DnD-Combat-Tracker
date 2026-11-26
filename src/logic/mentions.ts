export type MentionPart<T> = string | { text: string; item: T };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits text into plain runs and mentions of the given items by name (whole words, any case).
 * When two items share a name the first one wins; longer names win over names inside them.
 */
export function splitMentions<T extends { name: string }>(text: string, items: readonly T[]): MentionPart<T>[] {
  const byName = new Map<string, T>();
  for (const it of items) {
    const k = it.name.trim().toLowerCase();
    if (k && !byName.has(k)) byName.set(k, it);
  }
  if (!text || byName.size === 0) return text ? [text] : [];
  // Longest first, so "Greater Invisibility" wins over "Invisibility".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const parts: MentionPart<T>[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ text: m[0], item: byName.get(m[0].toLowerCase())! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
