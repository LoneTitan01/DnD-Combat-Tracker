import { defineConfig } from '@playwright/test';

const channel = process.env.PW_CHANNEL ?? 'msedge';

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
      use: { baseURL: 'http://localhost:5199/' },
    },
    {
      // Offline and install checks need the service worker, which only exists in the production build.
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { baseURL: 'http://localhost:4199/' },
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npx vite preview --port 4199 --strictPort',
      url: 'http://localhost:4199/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
