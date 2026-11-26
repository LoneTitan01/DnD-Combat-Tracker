# DM Combat Tracker

A local-first web app for preparing D&D 5e encounters and running them at the table. There is no backend: data lives in IndexedDB, and the app works offline as a PWA. See [Plan.md](Plan.md) for the full spec.

## Features

### Bestiary
- Create, edit, duplicate and delete stat blocks with a full 5e layout: AC, HP and hit dice, speed, ability scores, saves, skills, damage resistances / vulnerabilities / immunities, condition immunities, senses, languages, CR and XP, traits, and actions.
- Actions are grouped as actions, bonus actions, reactions and legendary actions. Any non-legendary action can recharge: on a fixed number of turns, a rolled number of turns, or Recharge X–6.
- The editor fills in XP from CR and the CON bonus on hit dice, and checks the stat block before saving.
- Search and filter by name, type and CR.
- **Bulk add**: paste several stat blocks (2014 or 2024 layout, from a PDF, a website or your notes), one per box. Each is read as well as it can be, then you review them in an editable carousel, with warnings for anything it couldn't find, and approve them one at a time or all at once. Spells its text names are linked automatically.
- Export and import JSON backups, either all stat blocks or a selection. Imports fill in missing fields and replace stat blocks with the same id.
- Deleting a stat block warns about any encounters that use it.

### Spells
- Comes with the 339 spells of the SRD 5.2 (the free part of the 2024 rules). Edit or delete them like your own spells. **Restore SRD spells** brings back any you deleted.
- Create spells, link them to stat blocks, and hover a spell's name in a stat block to see its text.
- **Bulk add** spells the same way: paste one per box, review and fix each, then approve.

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
- **Keyboard shortcuts:** `N` next turn, `M` multi-target, `Esc` closes the panel. Shortcuts are ignored while typing, and can be changed under **Settings → Keyboard shortcuts** (saved per device, or shared between devices with **Settings → Sync → Sync keyboard shortcuts**).

### Player-facing screen
- Open `#/table` in a second window on the same computer, for example on a TV. It shows the round, whose turn it is and an "Up Next" banner, updated live from the DM's screen.
- Players' turns that come back to back are grouped. Dead creatures disappear. HP, stats, recharge state and conditions are never shown.

### Offline and install
- Installable PWA with app icons and an "Install app" button. It works fully offline after the first load, and the app asks the browser not to evict its stored data.

### Google sync (optional)
- Under **Settings → Sync**, connect a Google account to keep stat blocks, party, encounters and combats the same in every browser signed in to that account. Without it, everything stays on the one device.
- The data is stored as one file in the account's Google Drive app data folder: hidden, and visible only to this app (`drive.appdata` scope). There's no server.
- Sync runs a few seconds after each change, when the app is reopened or comes back online, and every 5 minutes. A header badge shows the status.
- For each item, the newest edit wins. Deletions sync too.
- Google sign-ins from a web page last about an hour, after which the header shows **Reconnect sync**.

## Commands

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run e2e        # browser tests (Playwright, uses the installed Edge; PW_CHANNEL=chrome for Chrome)
                   #   --project=app: screens on the dev server; --project=pwa: offline/install on the build
node scripts/build-srd-spells.mjs   # rebuild src/data/srd-spells.json from the Open5e API
node scripts/make-icons.mjs   # re-render the PNG app icons after changing public/icon.svg
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

## Deploying

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It runs the unit tests, builds the app and publishes `dist/` to GitHub Pages at `https://lonetitan01.github.io/DnD-Combat-Tracker/`. It can also be run by hand from the Actions tab. One-time setup: **Settings → Pages → Source → GitHub Actions**. Data lives in each browser's IndexedDB, so data from `localhost` doesn't carry over to the hosted copy. Use the bestiary's Export / Import to move stat blocks, or turn on Google sync.

### Google sync setup (one time)
Sync needs a Google OAuth client ID. It isn't a secret, because it only works from the web addresses you list. Without one, the app builds with sync off.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Under **Google Auth Platform**, set up the consent screen: choose External and enter the app name and your email. Add the scope `https://www.googleapis.com/auth/drive.appdata`, then either add your Google account as a test user or publish the app.
3. Under **Clients**, create a **Web application** client. Add these **Authorized JavaScript origins**: `https://lonetitan01.github.io` (and `http://localhost:5173` for local development). No redirect URIs are needed.
4. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add `GOOGLE_CLIENT_ID` with the client ID. The deploy workflow passes it to the build.
5. For local development, put `VITE_GOOGLE_CLIENT_ID=<client id>` in `.env.local` (git-ignored).

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
  - `creature.ts`, `encounter.ts`, `party.ts`: stat block editing, validation and import; `parseText.ts` reads pasted stat blocks and spells; encounter building and tags; the party roster.
  - `xp.ts`, `dice.ts`: CR → XP, encounter multiplier and difficulty, dice parsing and rolling, HP from hit dice.
- `src/db/`: Dexie tables (creatures, players, encounters, combats, deletions), schema migrations, JSON backup, and the sync merge into local data.
- `src/sync/`: Google sync. `google.ts` handles Google sign-in and the Drive file, `engine.ts` does one download → merge → upload round, and `manager.ts` handles when to sync and the status shown in the UI. The merge rules are in `src/logic/sync.ts`.
- `src/features/`: screens (home, bestiary, encounters, combats, party, and the player-facing `#/table`).
- `e2e/`: Playwright browser tests.

Randomness is injected (`Rng`) so tests are deterministic.

## Credits

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. The spell data was converted from the [Open5e](https://open5e.com/) API.
