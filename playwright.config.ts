import { defineConfig } from '@playwright/test';

const channel = process.env.PW_CHANNEL ?? 'msedge';

// Override these when several worktrees run e2e tests at once, so each one gets its own servers.
const appPort = Number(process.env.E2E_APP_PORT ?? 5199);
const pwaPort = Number(process.env.E2E_PWA_PORT ?? 4199);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    // Uses the system Edge/Chrome, so no separate browser download is needed.
    channel,
  },
  projects: [
    {
      // Screens, against the dev server.
      name: 'app',
      testIgnore: /pwa\.spec\.ts/,
      use: { baseURL: `http://localhost:${appPort}/` },
    },
    {
      // Offline and install checks need the service worker, which only exists in the production build.
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { baseURL: `http://localhost:${pwaPort}/` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${appPort} --strictPort`,
      url: `http://localhost:${appPort}/`,
      // A dummy client ID turns sync on; the sync test replaces Google's script and Drive with fakes.
      env: { VITE_GOOGLE_CLIENT_ID: 'e2e-client-id' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && npx vite preview --port ${pwaPort} --strictPort`,
      url: `http://localhost:${pwaPort}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
