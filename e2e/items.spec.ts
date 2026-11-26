import { expect, test } from '@playwright/test';

test('items: create a weapon, browse by category, edit and delete', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Items' }).click();
  await expect(page.getByText('No items yet.')).toBeVisible();

  // Opening "New item" from the Weapons tab starts a weapon.
  await page.getByRole('tab', { name: /Weapons/ }).click();
  await page.getByRole('button', { name: 'New item' }).click();
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('weapon');
  await page.getByLabel('Name', { exact: true }).fill('Longsword');
  await page.getByRole('combobox', { name: 'Weapon class' }).selectOption('martial');
  await page.getByRole('textbox', { name: 'Damage', exact: true }).fill('1d8');
  await page.getByRole('textbox', { name: 'Properties' }).fill('Versatile (1d10)');
  await page.getByRole('textbox', { name: 'Cost' }).fill('15 gp');
  await page.getByRole('textbox', { name: 'Weight' }).fill('3 lb.');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
  const card = page.locator('article');
  await expect(card).toContainText('Martial melee weapon');
  await expect(card).toContainText('1d8 slashing');
  await expect(card).toContainText('Versatile (1d10)');

  // A piece of armor, made from the All tab.
  await page.goto('#/items/new');
  await page.getByLabel('Name', { exact: true }).fill('Chain Mail');
  await page.getByRole('combobox', { name: 'Category' }).selectOption('armor');
  await page.getByRole('combobox', { name: 'Armor type' }).selectOption('heavy');
  await page.getByRole('textbox', { name: 'Armor Class' }).fill('16');
  await page.getByRole('checkbox', { name: 'Disadvantage on Stealth' }).check();
  await page.getByRole('button', { name: 'Save item' }).click();
  // Wait for the item page: the editor's preview is an article too.
  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
  await expect(page.locator('article')).toContainText('Heavy armor');

  // The tabs filter the list and show counts.
  await page.goto('#/items');
  await expect(page.getByRole('tab', { name: 'All 2' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Armor 1' }).click();
  await expect(page.getByRole('link', { name: 'Chain Mail' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Longsword' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tools 0' }).click();
  await expect(page.getByText('No tools yet.')).toBeVisible();

  // Edit and delete.
  await page.getByRole('tab', { name: /Weapons/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Cost' }).fill('20 gp');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
  await expect(page.locator('article')).toContainText('20 gp');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/items$/);
  await expect(page.getByRole('link', { name: 'Longsword' })).toHaveCount(0);
});

test('items: import a JSON list and sort by cost', async ({ page }) => {
  await page.goto('#/items');
  await page.locator('input[type=file]').setInputFiles({
    name: 'items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        { name: 'Rope', cost: '1 gp' },
        { name: 'Thieves’ Tools', category: 'tool', cost: '25 gp' },
        { name: 'Dagger', category: 'weapon', cost: '2 gp', weapon: { damage: '1d4', damageType: 'piercing' } },
      ]),
    ),
  });
  await expect(page.getByRole('status')).toContainText('Imported 3 new items');
  const names = page.locator('tbody tr td:first-child');
  await page.getByRole('button', { name: 'Cost', exact: true }).click();
  await expect(names).toHaveText(['Rope', 'Dagger', 'Thieves’ Tools']);
  await expect(page.getByRole('row', { name: /Dagger/ })).toContainText('1d4 piercing');
});
