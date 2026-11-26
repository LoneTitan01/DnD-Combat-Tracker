import { expect, test } from '@playwright/test';

test('spells: the list starts empty, with no built-in spells', async ({ page }) => {
  await page.goto('#/spells');
  await expect(page.getByText('No spells yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore SRD spells' })).toHaveCount(0);
  // Nothing gets added after the first screen has loaded either.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('No spells yet.')).toBeVisible();
});

test('spells: create a spell, link it to a stat block, hover it there', async ({ page }) => {
  await page.goto('#/spells');
  await page.getByRole('button', { name: 'New spell' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Emberstorm');
  await page.getByRole('combobox', { name: 'Level' }).selectOption('3');
  await page.getByRole('textbox', { name: 'Range' }).fill('150 feet');
  await page.getByRole('textbox', { name: 'Description' }).fill('A bright streak flashes to a point you choose.');
  await page.getByRole('button', { name: 'Save spell' }).click();
  await expect(page).toHaveURL(/#\/spells\/[^/]+$/);
  await expect(page.getByText('3rd-level evocation')).toBeVisible();

  // A stat block naming the spell in a trait: the editor suggests linking it.
  await page.goto('#/bestiary/new');
  await page.getByLabel('Name', { exact: true }).fill('Mage');
  await page.getByRole('button', { name: '+ Add trait' }).click();
  await page.getByPlaceholder('Trait name, e.g. Pack Tactics').fill('Spellcasting');
  await page.getByPlaceholder('Description').first().fill('3rd level (3 slots): emberstorm, counterspell');
  await page.getByRole('button', { name: '+ Emberstorm' }).click();
  await expect(page.getByRole('list', { name: 'Linked spells' })).toContainText('Emberstorm');
  await page.getByRole('button', { name: 'Save stat block' }).click();
  await expect(page.getByRole('heading', { name: 'Mage', level: 2 })).toBeVisible();

  // Hovering the name in the trait shows the spell; moving away hides it.
  const mention = page.locator('article').getByRole('button', { name: 'emberstorm' });
  await mention.hover();
  const card = page.getByRole('tooltip');
  await expect(card).toContainText('A bright streak flashes');
  await expect(card).toContainText('150 feet');
  await page.mouse.move(0, 0);
  await expect(card).toBeHidden();

  // Clicking pins it; Escape closes it.
  await mention.click();
  await page.mouse.move(0, 0);
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();

  // The spell page lists the stat block that links to it.
  await page.goto('#/spells');
  await page.getByRole('link', { name: 'Emberstorm' }).click();
  await expect(page.getByRole('link', { name: 'Mage' })).toBeVisible();
});
