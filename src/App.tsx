import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { HomePage } from './features/home/HomePage';
import { BestiaryPage } from './features/bestiary/BestiaryPage';
import { BulkAddCreatures } from './features/bestiary/BulkAddCreatures';
import { CreatureEditor } from './features/bestiary/CreatureEditor';
import { CreaturePage } from './features/bestiary/CreaturePage';
import { EncounterEditor } from './features/encounters/EncounterEditor';
import { EncountersPage } from './features/encounters/EncountersPage';
import { CampaignsPage } from './features/campaigns/CampaignsPage';
import { CombatPage } from './features/combat/CombatPage';
import { CombatsPage } from './features/combat/CombatsPage';
import { ItemEditor } from './features/items/ItemEditor';
import { ItemPage } from './features/items/ItemPage';
import { ItemsPage } from './features/items/ItemsPage';
import { LocationEditor } from './features/locations/LocationEditor';
import { LocationPage } from './features/locations/LocationPage';
import { LocationsPage } from './features/locations/LocationsPage';
import { NpcsPage } from './features/npcs/NpcsPage';
import { OrganizationsPage } from './features/organizations/OrganizationsPage';
import { PartyPage } from './features/party/PartyPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { BulkAddSpells } from './features/spells/BulkAddSpells';
import { SpellEditor } from './features/spells/SpellEditor';
import { SpellPage } from './features/spells/SpellPage';
import { SpellsPage } from './features/spells/SpellsPage';
import { JoinPage } from './features/remote/JoinPage';
import { TablePage } from './features/table/TablePage';

/** Hash routing so the static build works on GitHub Pages and offline without server rewrites. */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Player-facing page: no DM chrome. */}
        <Route path="/table" element={<TablePage />} />
        {/* Players' own devices: join the DM's combat with a code. */}
        <Route path="/join" element={<JoinPage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="bestiary" element={<BestiaryPage />} />
          <Route path="bestiary/new" element={<CreatureEditor />} />
          <Route path="bestiary/bulk" element={<BulkAddCreatures />} />
          <Route path="bestiary/:id" element={<CreaturePage />} />
          <Route path="bestiary/:id/edit" element={<CreatureEditor key="edit" />} />
          <Route path="spells" element={<SpellsPage />} />
          <Route path="spells/new" element={<SpellEditor />} />
          <Route path="spells/bulk" element={<BulkAddSpells />} />
          <Route path="spells/:id" element={<SpellPage />} />
          <Route path="spells/:id/edit" element={<SpellEditor key="edit" />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="items/new" element={<ItemEditor />} />
          <Route path="items/:id" element={<ItemPage />} />
          <Route path="items/:id/edit" element={<ItemEditor key="edit" />} />
          <Route path="encounters" element={<EncountersPage />} />
          <Route path="encounters/new" element={<EncounterEditor />} />
          <Route path="encounters/:id" element={<EncounterEditor key="edit" />} />
          <Route path="combats" element={<CombatsPage />} />
          <Route path="combats/:id" element={<CombatPage />} />
          <Route path="party" element={<PartyPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="locations/new" element={<LocationEditor />} />
          <Route path="locations/:id" element={<LocationPage />} />
          <Route path="locations/:id/edit" element={<LocationEditor key="edit" />} />
          <Route path="npcs" element={<NpcsPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Old bookmarks: sync now lives on the Settings page. */}
          <Route path="sync" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
