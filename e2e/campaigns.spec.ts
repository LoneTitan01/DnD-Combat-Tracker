import { expect, test } from '@playwright/test';
import { seed } from './helpers';

test('campaigns keep their own party, encounters and combats; the bar switches between them', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await seed(page);

  // Everything so far went into the starting campaign, shown at the top of every page.
  await expect(page.getByText('My Campaign', { exact: true })).toBeVisible();
  await page.goto('#/encounters');
  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\//);
  await expect(page.getByText('My Campaign', { exact: true })).toBeVisible();

  // A second campaign starts empty and becomes the current one.
  await page.getByRole('link', { name: 'New campaign' }).click();
  await page.getByRole('textbox', { name: 'Campaign name' }).fill('Crimson Keep');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  const bar = page.getByRole('combobox', { name: 'Current campaign' });
  await expect(bar).toHaveValue(/.+/);
  await expect(bar.locator('option:checked')).toHaveText('Crimson Keep');

  await page.goto('#/party');
  await expect(page.getByText('No players yet.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Esme');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('textbox', { name: 'Name for Esme' })).toBeVisible();

  await page.goto('#/encounters');
  await expect(page.getByText('No encounters in this campaign yet.')).toBeVisible();
  await page.goto('#/combats');
  await expect(page.getByText('No combats in this campaign yet.')).toBeVisible();

  // Switch back with the bar: the original party and encounter are there, Esme isn't.
  await bar.selectOption({ label: 'My Campaign' });
  await expect(page.getByRole('link', { name: 'Dragon and friends' })).toBeVisible();
  await page.goto('#/party');
  await expect(page.getByRole('textbox', { name: 'Name for Aria' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name for Esme' })).toHaveCount(0);

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Current campaign' }).locator('option:checked')).toHaveText('My Campaign');

  // Move the encounter to the other campaign; its staged combat goes with it.
  await page.goto('#/encounters');
  await page.getByRole('link', { name: 'Dragon and friends' }).click();
  await page.getByRole('combobox', { name: /^Campaign/ }).selectOption({ label: 'Crimson Keep' });
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.goto('#/combats');
  await expect(page.getByText('No combats in this campaign yet.')).toBeVisible();

  // Deleting a campaign removes its contents but keeps the shared bestiary.
  await page.goto('#/campaigns');
  await page.getByRole('combobox', { name: 'Current campaign' }).selectOption({ label: 'Crimson Keep' });
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.getByRole('textbox', { name: 'Name of Crimson Keep' })).toHaveCount(0);
  await expect(page.getByText('My Campaign', { exact: true })).toBeVisible();
  await page.goto('#/bestiary');
  await expect(page.getByText('Dragon').first()).toBeVisible();
});
