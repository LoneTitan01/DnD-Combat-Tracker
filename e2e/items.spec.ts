import { expect, test } from '@playwright/test';
import { addTestSpells } from './helpers';

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
  // Wait for the item page (not /items/new, which matches too): the editor's preview is an article too.
  await expect(page).toHaveURL(/#\/items\/(?!new$)[^/]+$/);
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

test('items: a magic weapon with a bonus, a spell, an action and a passive', async ({ page }) => {
  await addTestSpells(page);
  await page.goto('#/items/new?category=weapon');
  await page.getByLabel('Name', { exact: true }).fill('Flame Tongue +1');
  await page.getByRole('textbox', { name: 'Damage', exact: true }).fill('1d8');
  await page.getByRole('checkbox', { name: 'Magic item' }).check();
  await page.getByRole('combobox', { name: 'Rarity' }).selectOption('rare');
  await page.getByLabel(/Enchantment bonus/).fill('1');
  await page.getByRole('checkbox', { name: 'Requires attunement' }).check();

  // A spell from the spell list, with charges.
  await page.getByRole('button', { name: '+ Spell' }).click();
  const spell = page.getByRole('listitem', { name: 'Spell effect' });
  await spell.getByRole('searchbox', { name: 'Find a spell' }).fill('fire');
  await spell.getByRole('button', { name: /Fireball/ }).click();
  await expect(spell).toContainText('Casts Fireball');
  await spell.getByLabel(/^Uses/).fill('3');
  await spell.getByRole('textbox', { name: 'Recharges' }).fill('dawn');

  // An action, then a passive.
  await page.getByRole('button', { name: '+ Action' }).click();
  const action = page.getByRole('listitem', { name: 'Action effect' });
  await action.getByRole('textbox', { name: /Effect name/ }).fill('Ignite');
  await action.getByRole('textbox', { name: 'Effect description' }).fill('Bonus action: the blade bursts into flame, dealing an extra 2d6 fire damage.');
  await page.getByRole('button', { name: '+ Passive' }).click();

  // An unnamed passive blocks saving.
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByText('Every action and passive needs a name.')).toBeVisible();
  await page.getByRole('listitem', { name: 'Passive effect' }).getByRole('textbox', { name: /Effect name/ }).fill('Fire Resistance');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
  const card = page.locator('article');
  await expect(card).toContainText('Simple melee weapon, rare (requires attunement)');
  await expect(card).toContainText('1d8 + 1 slashing');
  await expect(card).toContainText('+1 to attack and damage rolls');
  await expect(card).toContainText('Fireball.(Spell, 3/dawn)');
  await expect(card).toContainText('Ignite.(Action)');
  await expect(card).toContainText('Fire Resistance.');

  // The list shows rarity and the bonus, and can show only magic items.
  await page.goto('#/items');
  await page.locator('input[type=file]').setInputFiles({
    name: 'items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ name: 'Rope', cost: '1 gp' }])),
  });
  const sword = page.getByRole('row', { name: /Flame Tongue/ });
  await expect(sword).toContainText('rare');
  await expect(sword).toContainText('+1 to hit, 1d8 + 1 slashing');
  await page.getByRole('button', { name: 'Magic items only' }).click();
  await expect(page.getByRole('link', { name: 'Rope' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Flame Tongue +1' })).toBeVisible();
});
