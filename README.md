# DM Combat Tracker

A local-first web app for preparing D&D 5e encounters and running them at the table. There is no backend: data lives in IndexedDB, and the app works offline as a PWA. See [Plan.md](Plan.md) for the full spec.

## Features

### Bestiary
- Create, edit, duplicate and delete stat blocks with a full 5e layout: AC, HP and hit dice, speed, ability scores, saves, skills, damage resistances / vulnerabilities / immunities, condition immunities, senses, languages, CR and XP, traits, and actions.
- Actions are grouped as actions, bonus actions, reactions and legendary actions. Any non-legendary action can recharge: on a fixed number of turns, a rolled number of turns, or Recharge X–6.
- The editor fills in XP from CR and the CON bonus on hit dice, and checks the stat block before saving.
- Search and filter by name, type and CR.
- Export and import JSON backups, either all stat blocks or a selection. Imports fill in missing fields and replace stat blocks with the same id.
- Deleting a stat block warns about any encounters that use it.

### Party
- A roster of players with level and initiative bonus, plus warnings about duplicate names.
- Party XP thresholds (easy / medium / hard / deadly) for the selected players.

### Encounters
- Build encounters from the bestiary with counts per creature, and see total XP and difficulty for a chosen party (2014 DMG method, including the party-size multiplier).
- Tags, grouping and filtering by tag, and duplicating encounters.
- Players are never stored in an encounter. The party is picked when the combat starts.

### Running a combat
- **Staging:** stage an encounter ahead of time. Each creature gets a token name (Goblin 1, Goblin 2…), HP that can be rolled or set to average, and an optional initiative. Reinforcements can be added before the fight.
- **Starting:** tick the players present and enter their initiative. Missing creature initiative is rolled. Ties are broken by DEX, then by manual order.
- **Turn order:** a sticky Next Turn bar with the round counter. Dead creatures are skipped. You can reorder combatants with ↑/↓ or by dragging, and creatures or players can join or leave mid-fight.
- **Damage:**
  - Normal, Resisted (½, rounded down), Vulnerable (×2) and Immune (0).
  - Pick a damage type and the modifier is chosen from the stat block. Enter applies it, and the buttons override it.
  - Temp HP absorbs damage first and doesn't stack. Creatures die at 0 HP and can be healed or revived.
- **Multi-target damage:** one roll applied to several creatures, as with a fireball. Each creature has its own modifier from its stat block, and each gets its own log entry.
- **Recharge abilities:** chips on each row show what's ready. Countdowns tick on the creature's turns, and the start of its turn prompts for rolled recharges and Recharge X–6.
- **Conditions:**
  - The 15 standard conditions, for creatures and players, shown as badges on each row. Immunities from the stat block are blocked.
  - Optional durations in rounds, ending at the start or end of a chosen combatant's turn (such as the caster's). An expired condition is removed, logged and announced.
- **Combat log and undo:** every damage, heal, temp HP, ability use and recharge roll is logged. Each entry can be undone on its own, without rewinding the rest of the combat.
- **XP tally** for defeated creatures. When every creature is down, the app offers to end the combat. An ended combat keeps a recap.
- **Autosave:** every change is saved, and a "Saving… / All changes saved" indicator shows when it's done. Running combats can be resumed later from the Combats list.
- **Keyboard shortcuts:** `N` next turn, `M` multi-target, `Esc` closes the panel. Shortcuts are ignored while typing.

### Player-facing screen
- Open `#/table` in a second window on the same computer, for example on a TV. It shows the round, whose turn it is and an "Up Next" banner, updated live from the DM's screen.
- Players' turns that come back to back are grouped. Dead creatures disappear. HP, stats, recharge state and conditions are never shown.

### Offline and install
- Installable PWA with app icons and an "Install app" button. It works fully offline after the first load, and the app asks the browser not to evict its stored data.

## Commands

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run e2e        # browser tests (Playwright, uses the installed Edge; PW_CHANNEL=chrome for Chrome)
                   #   --project=app: screens on the dev server; --project=pwa: offline/install on the build
node scripts/make-icons.mjs   # re-render the PNG app icons after changing public/icon.svg
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

## Layout

- `src/models/`: TypeScript types for every entity (templates, players, encounters, combats, combatants, log).
- `src/logic/`: pure, unit-tested functions with no UI code.
  - `damage.ts`: Normal / Resisted / Vulnerable / Immune math, `modifierFor` (damage type vs. stat block), temp HP, death at 0, heal, revive.
  - `initiative.ts`: sort (initiative → DEX → manual order) and drag reorder.
  - `turns.ts`: `startTurn` / `endTurn` / `nextTurn`, round wrap, skipping the dead, recharge and condition countdowns.
  - `combat.ts`: logged damage/heal, ability use, rolled and Recharge X–6 prompts, undo, XP tally, log text.
  - `conditions.ts`: adding/removing conditions, durations and their countdown.
  - `staging.ts`: encounter → staged combat, token names, reinforcements, joining players, start combat.
  - `table.ts`: the player-facing view (order, current turn, Up Next) with nothing secret in it.
  - `creature.ts`, `encounter.ts`, `party.ts`: stat block editing, validation and import; encounter building and tags; the party roster.
  - `xp.ts`, `dice.ts`: CR → XP, encounter multiplier and difficulty, dice parsing and rolling, HP from hit dice.
- `src/db/`: Dexie tables (creatures, players, encounters, combats), schema migrations and JSON backup.
- `src/features/`: screens (home, bestiary, encounters, combats, party, and the player-facing `#/table`).
- `e2e/`: Playwright browser tests.

Randomness is injected (`Rng`) so tests are deterministic.
