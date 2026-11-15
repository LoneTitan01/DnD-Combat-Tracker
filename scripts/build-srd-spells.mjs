// Builds src/data/srd-spells.json: the spells of the System Reference Document 5.2 (the 2024 rules),
// taken from the Open5e API and converted to this app's Spell shape.
//
//   node scripts/build-srd-spells.mjs
//
// SRD 5.2 is © Wizards of the Coast LLC and licensed under CC-BY-4.0, so it can be bundled with the
// app as long as the attribution below is kept (it is shown on the Spells page too).
import { writeFile } from 'node:fs/promises';

const API = 'https://api.open5e.com/v2/spells/?document__key=srd-2024&limit=100';
const OUT = new URL('../src/data/srd-spells.json', import.meta.url);

const ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, ' +
  'available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 ' +
  'International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

async function fetchAll() {
  const out = [];
  for (let url = API; url; ) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const page = await res.json();
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

const CASTING_TIMES = {
  action: 'Action',
  'bonus-action': 'Bonus Action',
  reaction: 'Reaction',
  '1minute': '1 minute',
  '10minutes': '10 minutes',
  '1hour': '1 hour',
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Tables arrive flattened onto one line: "Table: Title | h | h | |---|---| | 1 | x | Text after.".
 * The separator row gives the column count, so rows can be read off cell by cell.
 * Returns the table as lines ("h — h", "1 — x") plus whatever text follows it.
 */
function parseTable(rest) {
  const sep = rest.match(/\|((?:\s*:?-+:?\s*\|)+)/);
  if (!sep) return null;
  const cols = sep[1].split('|').length - 1;
  const rows = [];
  let i = 0;
  while (rest[i] === '|') {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const end = rest.indexOf('|', i + 1);
      if (end < 0) return null;
      cells.push(rest.slice(i + 1, end).trim());
      i = end;
    }
    i++; // the row's closing pipe
    while (rest[i] === ' ') i++;
    if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells.join(' — '));
  }
  return { lines: rows, after: rest.slice(i) };
}

function untable(s) {
  const at = s.search(/Table:\s/);
  if (at < 0) return s;
  const pipe = s.indexOf('|', at);
  const parsed = pipe < 0 ? null : parseTable(s.slice(pipe));
  if (!parsed) return s;
  const title = s.slice(at + 'Table:'.length, pipe).trim();
  const before = s.slice(0, at).trimEnd();
  return `${before}\n\n${title}\n${parsed.lines.join('\n')}\n\n${untable(parsed.after.trimStart())}`;
}

/** Open5e text is light Markdown; the app shows plain text with line breaks. */
function plain(md) {
  if (!md) return '';
  let s = untable(md.replace(/\r/g, ''))
    // Ordinary multi-line Markdown tables: drop the separator row, join cells with dashes.
    .replace(/^\|(?:\s*:?-+:?\s*\|)+[ \t]*\n/gm, '')
    .replace(/^\|(.*)\|[ \t]*$/gm, (_, row) => row.split('|').map((c) => c.trim()).join(' — '));
  s = s
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,;:)]|$)/g, '$1$2')
    .replace(/^- /gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function components(s) {
  const c = [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean).join(', ');
  return s.material && s.material_specified ? `${c} (${s.material_specified.replace(/\.$/, '')})` : c;
}

function duration(s) {
  const d = /^(until|special|instant)/.test(s.duration) ? capitalize(s.duration) : s.duration;
  return s.concentration ? `Concentration, up to ${d}` : d;
}

function castingTime(s) {
  const t = CASTING_TIMES[s.casting_time] ?? s.casting_time;
  const withRitual = s.ritual ? `${t} or Ritual` : t;
  return s.reaction_condition ? `${withRitual}, ${s.reaction_condition}` : withRitual;
}

function convert(s) {
  return {
    id: s.key,
    name: s.name,
    level: s.level,
    school: s.school.name.toLowerCase(),
    castingTime: castingTime(s),
    range: s.range_text,
    components: components(s),
    duration: duration(s),
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    description: plain(s.desc),
    higherLevels: plain(s.higher_level),
    // Seeded spells count as never edited, so any edit or deletion (on any device) beats them in sync.
    createdAt: 0,
    updatedAt: 0,
  };
}

const raw = await fetchAll();
const spells = raw.map(convert).sort((a, b) => a.name.localeCompare(b.name));
const leftover = spells.filter((s) => /\|\s*-{3}|\*\*/.test(s.description + s.higherLevels)).map((s) => s.name);
if (leftover.length) console.warn('Markup left in:', leftover.join(', '));
await writeFile(OUT, `${JSON.stringify({ source: 'SRD 5.2', attribution: ATTRIBUTION, spells }, null, 1)}\n`);
console.log(`Wrote ${spells.length} spells to ${OUT.pathname}`);
