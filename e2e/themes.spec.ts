import { expect, test } from '@playwright/test';

const bodyBg = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('themes: pick one under Settings, it recolours the app and survives a reload', async ({ page }) => {
  await page.goto('#/settings');
  const group = page.getByRole('radiogroup', { name: 'Theme' });
  await expect(group.getByRole('radio', { name: /Tavern/ })).toHaveAttribute('aria-checked', 'true');
  const darkBg = await bodyBg(page);

  await group.getByRole('radio', { name: /Daylight/ }).click();
  await expect(group.getByRole('radio', { name: /Daylight/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');
  const lightBg = await bodyBg(page);
  expect(lightBg).not.toBe(darkBg);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');
  expect(await bodyBg(page)).toBe(lightBg);

  await group.getByRole('radio', { name: /Midnight/ }).click();
  expect(await bodyBg(page)).not.toBe(lightBg);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
});
