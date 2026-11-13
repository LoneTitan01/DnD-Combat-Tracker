# DM Combat Tracker — Implementation Plan

> Nov 12, 2026 · @Nathan Roalkvam · updated Nov 13, 2026

## Status

All seven milestones are built and tested, and v1 is feature-complete. 161 unit tests and 15 browser tests (Playwright, in Edge) cover the logic and every screen, including installing the app and using it offline. Next are the ideas under [Later ideas](#later-ideas).

Where the build differs from the original plan, this document now describes what was built. Those changes are also listed under [Decisions and later ideas](#decisions-and-later-ideas).

## Overview

Build a single-page web app that lets a DM prepare encounters ahead of time and run them at the table: a bestiary of reusable stat blocks, saved encounters made from them, and a live tracker for initiative, damage, and XP.

## In scope for v1

- A bestiary: create, edit, and delete creature stat blocks, each with an XP value.
- Saved encounters: named combats holding creatures in chosen quantities, which can be staged ahead of time without players; the party is added when the fight starts.
- Running a combat: a token name per creature instance (for example, "Goblin A" or "Red cap"), damage with normal, resisted (half), vulnerable (double) and immune (none) modifiers, picked from the damage type and the stat block, and death at 0 HP.
- Turn order: every combatant, players included, sorted by initiative, with a current-turn pointer, round counter, and countdowns for monster abilities that recharge after a fixed or rolled number of turns, or on a Recharge 5–6 roll.
- An XP tally of defeated creatures, split across the party.

## Out of scope for v1

- Maps and grids
- Dice-rolling animations
- Multi-user sync
- Importing the official SRD in bulk
- Spell slot tracking
- Desktop or mobile app wrappers
- An immunity damage button

## Data model

The key split is template vs. instance: a stat block is defined once in the bestiary, and each creature in a running combat is a separate instance with its own token name and current HP.

### Core entities

| Entity | Key fields | Notes |
| --- | --- | --- |
| `CreatureTemplate` | `id`, `name`, `size`, `type`, `alignment`, `AC`, `acNote`, `maxHP`, `hitDice { count, dieType: d4 / d6 / d8 / d10 / d12 / d20, bonus }` (for example, `7d10 + 14`), `speed`, `abilities { str, dex, con, int, wis, cha }`, `saves`, `skills`, `damageResistances[]`, `damageVulnerabilities[]`, `damageImmunities[]`, `conditionImmunities[]`, `senses`, `languages`, `CR`, `xp`, `traits[]`, `actions[]`, `notes`, `createdAt`, `updatedAt` | Lives in the bestiary; reusable across encounters. All actions share one `actions[]` list, and each has a `kind`: `action`, `bonus`, `reaction` or `legendary`. CR is stored as a string, so fractions such as `1/4` stay exact. |
| `Player` | `id`, `name`, `level`, `passivePerception`, `initiativeBonus` | Saved party roster; no AC or HP. Players track their own. Level is used only for encounter difficulty. |
| `Encounter` | `id`, `name`, `description`, `entries[{ templateId, count }]`, `tags[]`, `createdAt`, `updatedAt` | The plan: which creatures and how many. Holds no players. |
| `Combat` | `id`, `encounterId`, `name`, `round`, `turnIndex`, `combatants[]`, `log[]`, `status (staged / active / ended)`, `createdAt`, `updatedAt` | Created when an encounter is staged, with creature combatants only. Player combatants are added when it starts. Can be saved and resumed at any status. `combatants[]` is always kept in turn order, and `turnIndex` points into it. Combats keep their own copy of the name and creatures, so deleting the encounter does not affect them. |
| `Combatant` | `id`, `kind (creature / player)`, `templateId` or `playerId`, `tokenName`, `initiative`, `initiativeBonus`, `dexScore (creatures only)`, `currentHP`, `tempHP`, `maxHP (creatures only)`, `isDead`, `conditions[{ name, rounds?, ends?: start / end, anchorId?, armed? }]`, `xp`, `abilityStates[]` | One per creature or player in the combat. `xp` is copied from the stat block at staging, so later edits to the bestiary don't change the tally. A condition with no `rounds` lasts until removed. |
| `LogEntry` | `id`, `type`, `round`, `combatantId`, `at`, `rawDamage`, `modifier (normal / resisted / vulnerable / immune)`, `damageType`, `appliedDamage`, `hpAfter`, `actionId`, `roll`, `before` | Gives undo and an end-of-combat recap. `before` is a copy of the combatant from before the event, which undo restores. Entries that can't be undone, such as `abilityReady`, have no `before`. |

Store damage types as a fixed enum (`acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`, `poison`, `psychic`, `radiant`, `slashing`, `thunder`) so the damage panel can pick resistances, vulnerabilities and immunities from the stat block. Conditions are a fixed enum too: the 15 standard 5e conditions, from `blinded` to `unconscious`. (Database version 2 converts conditions saved as plain names into the timed form.)

### Recharge fields

| Where | Fields |
| --- | --- |
| `Action` inside `CreatureTemplate` | `recharge?: { mode: fixed / rolled / threshold, turns?: number, dice?: string such as "1d6", minRoll?: 2–6 }`. Allowed on actions, bonus actions and reactions; legendary actions can't recharge. |
| `Combatant` | `abilityStates[{ actionId, status: ready / rollNeeded / counting / thresholdRoll, turnsRemaining?, armed?, promptPending?, justReady? }]`. `armed` marks a countdown as live, so a fixed-mode use doesn't count down on the turn it was used. `promptPending` shows the roll banner for this turn. `justReady` drives the "is ready" notice. |
| `LogEntry` | Adds `type: damage / heal / tempHP / abilityUsed / rechargeRolled / abilityReady / conditionEnded`, and `condition` for condition events |

## Feature specs

### 1. Stat blocks and XP

- Form with sections that mirror a printed stat block: header, defenses, abilities, traits, actions.
- Choosing a CR fills in the standard XP by default (`CR 1/4 = 50`, `CR 1 = 200`, `CR 5 = 1,800`, and so on); the DM can override it for homebrew. A custom XP is kept when the CR changes, and "Use standard" resets it.
- Ability modifiers are computed from scores, never typed. Hit dice are entered as count + die type + bonus. The die type defaults from size (`Tiny d4`, `Small d6`, `Medium d8`, `Large d10`, `Huge d12`, `Gargantuan d20`) but can be changed, and max HP can be filled with the average or rolled per instance when combat starts.
  - A die the DM picked by hand is kept when the size changes.
  - Max HP follows the average of the hit dice until the DM types a number; "Use average" puts it back.
  - A "Bonus from CON" button fills in the usual hit dice bonus (number of dice × CON modifier).
- Actions are free-text entries (`name + description`) in v1. Structured attack fields (to-hit, damage dice) can come later.
- Search and filter by name, type, and CR; duplicate a stat block to make variants. Filters are kept in the URL.
- JSON import/export so stat blocks can be backed up or shared.
  - Export the whole bestiary, only the stat blocks the current filters show, or a single stat block.
  - Import takes a full backup, a list, or a single stat block. Missing fields get default values, entries without a name are skipped, and a stat block with the same id is replaced. The result reports how many were added, replaced and skipped.
- Deleting a stat block warns when encounters use it. Those encounters flag the missing creature and leave it out of totals and staging.
- The form checks for errors before saving: name, AC, HP, hit dice, ability scores from 1 to 30, CR format and recharge settings. A live stat block preview sits beside the form.

### 2. Saved encounters

- Create a named encounter, add creatures from the bestiary with a count each. Players are not chosen here.
- Show live totals while building: total XP, the adjusted XP with the multiplier for the number of monsters, and a difficulty label against party levels (optional field on `Player`).
  - This is the 2014 DMG method. Each level has Easy / Medium / Hard / Deadly XP thresholds, which are added up across the party. The monster-count multiplier moves one step up for parties under 3 and one step down for parties of 6 or more.
  - Difficulty is rated against the party roster, and only players with a level count. Checkboxes in the builder let the DM preview a smaller group, for example if only 3 players come. The selection is never saved; players are still chosen when a combat starts.
- Duplicate, rename, and delete encounters. Group them by session or adventure with a simple tag.
  - Tags are typed comma-separated and compared ignoring case. Tags already in use are offered as one-click chips.
  - The list groups encounters by tag in natural order (Session 2 before Session 10), with untagged ones last. An encounter with several tags appears in each group. Search and a tag filter are available.

#### Staging a combat ahead of time

- Stage turns a saved encounter into a ready-to-run combat with no players in it. It can be done days before the session.
- While staging, the DM sets token names, sets or rolls each creature's HP, and optionally pre-rolls creature initiative. Reinforcements can be added or removed.
- Staged combats are listed on their own as "Ready to run" and stay saved until used. One encounter can be staged more than once (for example, two goblin ambushes).
- Start combat opens a short step: tick which players are present from the party roster, type in each player's initiative, then roll any creature initiative still missing. The turn order then forms and round 1 begins.
- Players can also join or leave mid-combat.

### 3. Token names

- Staging an encounter expands each entry into individual combatants (three goblins become three rows) before any players are involved.
- Default token names are auto-numbered (`Goblin 1`, `Goblin 2`); the DM can rename any of them inline to match a physical mini or token color.
- Token names must be unique within a combat; the UI warns on duplicates.
- The DM can add a creature mid-combat (reinforcements), and it gets the next number.

### 4. Damage

- Each creature row has a damage input, an optional damage type (untyped by default), and four modifier buttons: Normal, Resisted (½), Vulnerable (×2) and Immune (0).
- Applied damage is calculated as: normal = raw damage; resisted = floor(raw / 2) (5e rounds down); vulnerable = raw × 2; immune = 0.
- Picking a damage type highlights the modifier the stat block calls for, and Enter applies it. Immunity wins; resisting and being vulnerable to the same type count as normal. The buttons still override it (for example, magical slashing against "nonmagical" resistance). The type is logged ("takes 3 slashing damage (7 resisted)") and resets to untyped after each hit.
- Temp HP absorbs damage first, then current HP. HP never goes below 0.
- At 0 HP, the creature is marked dead: greyed out, struck through, skipped in turn order, and its XP added to the tally. The DM can revive it.
- A Heal action raises HP up to max. Healing a dead creature above 0 HP revives it. Temp HP doesn't stack: the higher value is kept.
- Every damage or heal event is logged with an undo button. Undo works on an event when it's the latest one of its kind for that combatant: the latest HP event, or the latest use or roll of that ability. It restores only those fields, so later turn changes and other combatants aren't rewound.
- Optional multi-target: select several rows and apply the same damage to all (such as fireball), each with its own modifier.

Applied damage formula:

`applied = normal: d; resisted: floor(d / 2); vulnerable: 2d; immune: 0`

### 5. Turn order

- Creature initiative (`d20 + DEX mod`) can be rolled while staging or left until the start. Player initiative is typed in when the combat starts.
- Combatants sort by initiative high to low. Ties break on DEX score, then a manual drag. Players have no DEX score on file, so their DEX is approximated as `10 + 2 × initiative bonus`. Combatants with no initiative yet sort last.
- One combatant is highlighted as current; Next Turn moves the pointer, skipping the dead, and wraps to Round +1 after the last.
- The list shows everyone in order so players see who is up and who is on deck. Players see the current turn on the player-facing page (see feature 7).
- Drag to reorder for delayed or readied actions.
- Reinforcements and players who join mid-combat are placed by initiative without moving the current turn. Removing the current combatant passes the turn to the next living one, starting a new round if needed.

### 6. Recharging abilities

Abilities like a dragon's breath can be marked as recharging in one of three ways: after a fixed number of turns, after a rolled number of turns (for example, ready in `1d6` turns), or by the standard 5e Recharge 5–6 roll. Only the monster's own turns count.

#### In the stat block editor

- Any action, bonus action, or reaction can be ticked as Recharges, then given a mode:
  - Fixed: a number of turns (for example, `3`)
  - Rolled: a dice expression (for example, `1d6`, `1d4+1`)
  - Recharge X–6: the lowest d6 result that recharges it (`5` for "Recharge 5–6", `6` for "Recharge 6")

#### In combat

- Each creature instance gets its own ability states, so Dragon A's breath and Dragon B's breath are tracked separately.
- Each rechargeable ability shows as a chip on the creature's row: Ready, Recharging — 2 turns, Roll needed, or Recharge 5–6.
- Clicking Use on a ready ability depends on the mode:
  - Fixed: the chip switches to Recharging with the fixed count.
  - Rolled: the chip switches to Roll needed.
  - Recharge X–6: the chip switches to Recharge 5–6 (or 6).
- Rolled mode prompt: at the start of that monster's next turn, a banner asks, "Fire Breath (1d6): turns until ready?" It has a number input and a Roll for me button that rolls the dice and fills in the result. Confirming sets the countdown.
- Counting turns (fixed and rolled): the countdown drops by 1 at the end of each of the monster's turns. It is ready at the start of its next turn after the count reaches 0.
  - The turn the roll is entered counts. Example: used in round 1, rolled 2 in round 2, so rounds 2 and 3 count and the ability is ready in round 4.
  - Fixed mode counts the same way, starting from the monster's first turn after the use. Fixed 2, used in round 1, is also ready in round 4.
- Recharge X–6 prompt: at the start of each of the monster's turns after the use, a banner asks, "Fire Breath (Recharge 5–6): roll a d6". It has a number input and Roll for me. On 5 or higher (or the set threshold), the ability is ready immediately and can be used that turn. Otherwise it asks again next turn.
- Prompts are banners on the current-turn row, not blocking dialogs. A dismissed prompt returns at the monster's following turn, and that turn doesn't count toward the countdown.
- When an ability becomes ready, its chip turns to Ready and the row shows a "Fire Breath is ready" notice.
- Dead or removed creatures don't count down or roll.
- The DM can click a chip to edit the count or mark the ability ready by hand. Uses, rolls, and recharges are written to the combat log and can be undone.

### 7. Player-facing page

A separate page for the players shows whose turn it is and who is up next. When several players go back to back, it shows all of them at once.

- Where it runs: a second route of the same app, `#/table?combat=<id>`, opened from the combat screen in a new window. It is meant for a TV, a second monitor, or a laptop turned around. With no backend, it must be on the same computer as the DM's window.
- Live updates: the DM's window publishes the current-turn state through `BroadcastChannel`; the page re-renders on every Next Turn with no refresh needed.
  - The DM's window works out the player view (names and round only) before sending it, so HP, stats and recharge state never reach the player page.
  - On opening, the page shows the last saved state from IndexedDB, then asks the DM's window for the live view.
  - `#/table?demo` shows sample data for checking the layout (→ or Space moves to the next turn).
- What it shows:
  - If the current combatant is a player, the page shows that player plus every player directly after them in turn order until the next creature. Example: order is Aria, Brom, Goblin 2, Cass. On Aria's turn the page shows Aria + Brom. On Brom's turn it shows Brom.
  - If the current combatant is a creature, the page shows its token name only (for example, "Goblin 2"). No HP, stats, or recharge state.
  - Up Next banner along the bottom: the group that acts after the current one, using the same grouping rule (a creature alone, or a run of players together). It shows a "Round N+1" tag when that group is in the next round. It is hidden when no one else can act.
  - Example with the order above: on Goblin 2's turn, Up Next shows Cass + Aria + Brom (a run of players can continue into the next round).
  - Always visible: the round number. Dead creatures never appear and don't break up a run of players.
- Before and after combat: a staged combat shows "Waiting to start"; an ended one shows "Combat over".
- Design: large type readable across a table, high contrast, no controls. Creature names are drawn in red so players can tell monsters from players at a glance.

## Architecture and tech stack

Recommendation: a local-first browser app with no backend, so it works offline at the table and costs nothing to host.

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19 + TypeScript, built with Vite 7; React Router 7 with hash routes (`#/bestiary`, `#/table`) | Typed models catch stat-block mistakes; fast dev loop. Hash routes work on static hosting and offline without server rewrites. |
| State | Pure functions in `src/logic` plus Dexie live queries; the combat screen uses a small `useCombat` hook that keeps the combat in memory and writes every change to IndexedDB | Small app; the combat logic is easy to unit-test. Zustand turned out not to be needed. |
| Persistence | IndexedDB via Dexie.js 4 | Holds hundreds of stat blocks and survives refreshes; autosaves the running combat. The app asks the browser to make storage persistent. |
| Styling | Tailwind CSS 4 | Fast to build dense table-side layouts. |
| Tests | Vitest for logic (randomness is injected, so dice tests are repeatable); Playwright for browser tests of each screen, run on the system's Edge (`PW_CHANNEL=chrome` for Chrome). An `app` project runs against the dev server, and a `pwa` project runs against the production build to test offline use and installing. | Damage math and turn order must be right. |
| Hosting | Static build on GitHub Pages or Netlify; installable as a PWA (`vite-plugin-pwa`, already set up) | Offline at the game table. |

## Code layout

- `src/models/` — TypeScript types for every entity above.
- `src/logic/` — pure functions with no UI code, all unit-tested:
  - `damage.ts`: damage and healing; `initiative.ts`: sorting and reordering; `turns.ts`: turn start, turn end and recharge countdowns
  - `combat.ts`: logged events and undo; `staging.ts`: staging and starting combats
  - `xp.ts` and `dice.ts`: XP, difficulty and dice
  - `creature.ts`, `encounter.ts`, `party.ts`: rules for the bestiary, encounter and party screens
  - `table.ts`: the player-facing view
- `src/db/` — Dexie tables (creatures, players, encounters, combats) and JSON backup.
- `src/components/` — the app shell and shared form controls.
- `src/features/` — bestiary, encounters, combat, party and player-facing table screens.
- `e2e/` — Playwright browser tests (`helpers.ts` holds the shared setup).
- `scripts/make-icons.mjs` — renders the PNG app icons from `public/icon.svg` with Playwright.

If you later want to share across devices or with a co-DM, swap Dexie for a small backend (Supabase or Firebase) behind the same `db/` interface.

## Screens and UI flow

Seven steps, split between prep and play. Staging happens whenever you prep; Start combat is the hand-off on game night, when the players who showed up are added. The Combat screen is where most table time goes, so it gets the most care.

The Combat screen layout includes a header with the encounter name, round number, and a large Next Turn button; the main column is the initiative list (current combatant highlighted, dead rows struck through, HP bars on creatures); clicking a creature opens a side panel with its full stat block and the damage input with a damage type and Normal / Resisted / Vulnerable / Immune buttons; an XP counter and the damage log sit at the bottom.

## Milestones

Build in this order. Each milestone ends with something usable at the table.

1. Foundation — Vite + React + TS scaffold, models, Dexie schema, app shell with navigation.
   - Done when: the app loads offline and the DB persists across refresh.
   - ✅ Done Nov 13, 2026.
2. Combat logic core — `applyDamage`, `nextTurn`, `sortInitiative`, `xpForCR` with unit tests.
   - Done when: tests cover resisted odd numbers (`7 → 3`), temp HP, death at 0, skipping the dead, round wrap, and startTurn / endTurn steps that tick recharge countdowns (the entry turn counts) and return pending rolled and Recharge 5–6 prompts.
   - ✅ Done Nov 13, 2026. This milestone also built the staging, multi-target damage and undo logic ahead of Milestone 6.
3. Bestiary — stat block form, list, search, duplicate, CR→XP auto-fill, JSON import/export.
   - Done when: you can enter 5 creatures and see them after a reload.
   - ✅ Done Nov 13, 2026, with a Playwright test of that check.
4. Party roster — add and edit players (name, level, initiative bonus, passive Perception; no AC or HP).
   - Values are kept in range (level 1–20, initiative bonus −10 to +20, passive Perception 1–40), and duplicate names get a warning because they would clash as token names. The page also shows the party's XP thresholds.
   - ✅ Done Nov 13, 2026.
5. Encounter builder — named encounters, creature counts, XP totals, and difficulty against the party roster (with a preview-only choice of players).
   - Done when: a saved encounter reopens with the same creatures and counts.
   - ✅ Done Nov 13, 2026, with a Playwright test of that check. Staging moves to Milestone 6.
6. Combat tracker — stage a combat from an encounter without players (token names, HP, optional creature initiative), start it by adding the players present and their initiative, ordered list with current turn, damage panel with Normal / Resisted / Vulnerable, death state, log with undo, recharge chips, and the next-turn roll prompt, XP tally.
   - Done when: a full 3-round test combat is staged without players, reopened later, started with 4 players added, run start to finish, and resumed after closing the tab.
   - Includes the Stage button on encounters and the "Ready to run" list. The combat screen calls `useTablePublisher(combat)` to drive the player-facing page.
   - ✅ Done Nov 13, 2026, with a Playwright test of that check. It also covers the player view following along, undo, a recharge roll, and closing and resuming mid-round.
   - Built as: a Combats list (In progress / Ready to run / Ended) and a staging screen with HP and initiative for each creature, bulk Roll / Average buttons, and reinforcements. A start step ticks the players present and needs each one's initiative. The tracker has a sticky Next Turn bar, rows with HP bars and recharge chips, and roll banners on the current row. Clicking a creature opens the damage panel and its stat block. The tracker also has an XP tally, a log with undo, and buttons for players or creatures joining and leaving. Rows can be reordered with ↑/↓ or by dragging. An "every creature is down" prompt offers to end the combat, and an ended combat shows a recap that can be reopened.
   - Damage controls live in the side panel rather than on every row, to keep the turn list readable. Clicking a row always selects it and focuses the amount box, even when it's already selected, so hitting the same creature twice is quick.
   - The header shows "Saving…" / "All changes saved". A write takes a few milliseconds, and the combat can be resumed once it shows saved.
   - Temp HP grants are logged (`type: tempHP`) and can be undone along with that combatant's other HP events. Editing a combatant's initiative mid-combat moves only that combatant.
7. Polish — player-facing page with back-to-back player grouping, multi-target damage, conditions, keyboard shortcuts (`N` = next turn), PWA install.
   - ✅ Done Nov 13, 2026.
   - Multi-target damage: the Multi-target button (or `M`) turns the rows into checkboxes. The panel takes one damage roll and a Normal / ½ / ×2 / 0 choice for each target, with resistance hints from the stat block. Each target gets its own log entry and undo. Dead creatures drop out of the target list. Players can't be targeted, since they track their own HP.
   - Conditions: toggle chips in the side panel for creatures and players, shown as badges on the turn-order row and kept in the standard order. Condition immunities from the stat block are marked "immune" and can't be applied. A Clear button removes them all. Conditions aren't shown on the player page.
   - Durations (added Nov 13, 2026): each active condition can be given a number of rounds; blank means until removed. It can end at the **end** (default) or **start** of a turn, counted on a chosen combatant's turns. That's the affected creature by default, or for example the caster for "until the end of your next turn".
     - The countdown drops on each of that combatant's turns. An end-timed duration applied during that combatant's own turn doesn't count that turn, matching fixed recharges.
     - If the counting combatant leaves the combat, the affected creature's turns count instead. A dead combatant's turns are skipped, so its durations pause.
     - When a duration runs out, the condition is removed, logged ("Goblin 2 is no longer prone") and listed in a notice under the turn bar until the next turn change.
     - Row badges show the rounds left ("prone · 2").
   - Damage types (added Nov 13, 2026): the side panel and the multi-target panel take a damage type and pick each creature's modifier from its stat block's resistances, vulnerabilities and immunities. In multi-target, each target follows its own stat block ("Immune from stat block") until you pick its modifier by hand; changing the damage type drops those hand-picked choices.
   - Keyboard shortcuts: `N` next turn, `M` multi-target, `Esc` closes the panel or leaves multi-target. They're ignored while typing or with Ctrl, Alt or ⌘ held. `Esc` in a text box first leaves the box.
   - PWA install: 192 and 512 px PNG icons plus a maskable one, an Apple touch icon, and an "Install app" button in the header when the browser offers it. Browser tests confirm that Chromium reports no installability errors and that the app (including a new tab opened while offline) loads and keeps its data offline. That is the first in-browser check of Milestone 1's offline requirement.

## Decisions and later ideas

### Decided

- Web app only: no desktop or mobile wrapper.
- A player-facing page is in v1 (feature 7), opened in a second window on the same computer.
- Damage modifiers are Normal, Resisted, Vulnerable and Immune. (Immune was added with automatic damage types, Nov 13, 2026; it was originally left out.) Resistance and vulnerability to the same type cancel to normal rather than halving then doubling.
- Encounters never store players, and the builder's player selection is a preview only. (Milestone 5 originally said "attending players"; feature 2 and the data model said otherwise, and they win.)
- The player-facing page also shows an Up Next banner (added Nov 13, 2026).
- Encounter difficulty uses the 2014 DMG method, including the small- and large-party multiplier adjustment.
- Player initiative ties use an approximate DEX of `10 + 2 × initiative bonus`.
- Healing a dead creature above 0 HP revives it.
- Undo works per stream (HP events per combatant; ability events per combatant and ability) and restores only that stream's fields.
- Legendary actions can't be set to recharge.
- Adding, changing and removing conditions isn't logged or undoable; only a timed condition running out is logged. Durations count on one combatant's turns (start or end), rather than on a round counter.
- Multi-target damage only targets living creatures.

### Later ideas

- Add death saves for players.
- Add legendary action counters.
- Add SRD 5.2 import.
- Add dice rolling for attacks from structured actions.
