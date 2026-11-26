import { expect, test } from '@playwright/test';

test('sidebar: full names, icons only, hidden, and it remembers', async ({ page }) => {
  await page.goto('#/');
  const sidebar = page.getByTestId('sidebar');
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Full: names are readable.
  await expect(nav.getByText('Bestiary', { exact: true })).not.toHaveClass(/sr-only/);
  const fullWidth = (await sidebar.boundingBox())!.width;

  // Preview: icons only, names hidden but still the links' accessible names.
  await page.getByRole('button', { name: 'Show icons only' }).click();
  await expect(nav.getByText('Bestiary', { exact: true })).toHaveClass(/sr-only/);
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(80);
  expect(fullWidth).toBeGreaterThan(150);
  await nav.getByRole('link', { name: 'Bestiary' }).click();
  await expect(page).toHaveURL(/#\/bestiary$/);

  // Collapsed: gone, with a button in the top-left corner to bring it back.
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(sidebar).toHaveCount(0);
  const show = page.getByRole('button', { name: 'Show sidebar' });
  const box = (await show.boundingBox())!;
  expect(box.x).toBeLessThan(20);
  expect(box.y).toBeLessThan(20);

  // Survives a reload, then reopens to the state it was hidden from.
  await page.reload();
  await expect(sidebar).toHaveCount(0);
  await show.click();
  await expect(sidebar).toBeVisible();
  await expect(nav.getByText('Bestiary', { exact: true })).toHaveClass(/sr-only/);
  await page.getByRole('button', { name: 'Show names' }).click();
  await expect(nav.getByText('Bestiary', { exact: true })).not.toHaveClass(/sr-only/);
});
