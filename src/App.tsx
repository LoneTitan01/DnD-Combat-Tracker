import { HashRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { HomePage } from './features/home/HomePage';
import { BestiaryPage } from './features/bestiary/BestiaryPage';
import { CreatureEditor } from './features/bestiary/CreatureEditor';
import { CreaturePage } from './features/bestiary/CreaturePage';
import { EncounterEditor } from './features/encounters/EncounterEditor';
import { EncountersPage } from './features/encounters/EncountersPage';
import { CombatPage } from './features/combat/CombatPage';
import { CombatsPage } from './features/combat/CombatsPage';
import { PartyPage } from './features/party/PartyPage';
import { TablePage } from './features/table/TablePage';

/** Hash routing so the static build works on GitHub Pages and offline without server rewrites. */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Player-facing page: no DM chrome. */}
        <Route path="/table" element={<TablePage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="bestiary" element={<BestiaryPage />} />
          <Route path="bestiary/new" element={<CreatureEditor />} />
          <Route path="bestiary/:id" element={<CreaturePage />} />
          <Route path="bestiary/:id/edit" element={<CreatureEditor key="edit" />} />
          <Route path="encounters" element={<EncountersPage />} />
          <Route path="encounters/new" element={<EncounterEditor />} />
          <Route path="encounters/:id" element={<EncounterEditor key="edit" />} />
          <Route path="combats" element={<CombatsPage />} />
          <Route path="combats/:id" element={<CombatPage />} />
          <Route path="party" element={<PartyPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
