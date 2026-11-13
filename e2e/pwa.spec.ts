import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Chromium reports the app as installable', async ({}, testInfo) => {
  // Test contexts are incognito, where Chromium refuses installs ("in-incognito"), so use a real
  // (temporary) profile for this check.
  const dir = await mkdtemp(join(tmpdir(), 'dm-tracker-pwa-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: testInfo.project.use.channel });
  try {
    const page = await ctx.newPage();
    await page.goto(testInfo.project.use.baseURL!);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await ctx.newCDPSession(page);
    await expect
      .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, { timeout: 15_000 })
      .toEqual([]);
  } finally {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('loads and keeps data offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Prep & Play' })).toBeVisible();

  // Wait for the service worker to install and take control (first load isn't controlled yet).
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`)).toEqual(
    expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
  );

  // Some data while online.
  await page.goto('#/party');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Aria');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('textbox', { name: 'Name for Aria' })).toBeVisible();

  // Done when (Milestone 1): the app loads offline and the DB persists across refresh.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name for Aria' })).toBeVisible();
  await page.getByRole('link', { name: 'Bestiary' }).click();
  await expect(page.getByRole('heading', { name: 'Bestiary' })).toBeVisible();

  // A brand-new tab opened while offline still gets the app, and the player page works too.
  const offlineTab = await context.newPage();
  await offlineTab.goto('./#/table?demo');
  await expect(offlineTab.getByText('Up next')).toBeVisible();
  await context.setOffline(false);
});
