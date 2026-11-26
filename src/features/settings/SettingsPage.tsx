import { PageHeader } from '../../components/ui';
import { HotkeySettings } from './HotkeySettings';
import { SyncSettings } from './SyncSettings';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex max-w-2xl flex-col gap-10">
        <SyncSettings />
        <HotkeySettings />
      </div>
    </>
  );
}
