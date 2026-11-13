import { useEffect, useState } from 'react';
import { Button } from './ui';

/** Chromium's install prompt event (not in the TypeScript DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Shows "Install app" when the browser offers installation (Chrome, Edge, Android). Safari users
 * install with Share → Add to Home Screen instead, so nothing shows there.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!prompt) return null;
  return (
    <Button
      variant="ghost"
      className="ml-auto whitespace-nowrap"
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
    >
      Install app
    </Button>
  );
}
