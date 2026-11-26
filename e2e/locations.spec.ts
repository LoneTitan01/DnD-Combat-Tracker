import { expect, test, type Page } from '@playwright/test';

async function save(page: Page, name: string) {
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('locations: nest places, link siblings and NPCs, navigate, delete', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('#/locations');
  await expect(page.getByText('No locations yet.')).toBeVisible();

  // A town with notes and an NPC.
  await page.getByRole('button', { name: 'New location' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Leilon');
  await page.getByRole('combobox', { name: 'NPCs' }).fill('Captain Rhinehart');
  await page.getByRole('combobox', { name: 'NPCs' }).press('Enter');
  await page.getByRole('textbox', { name: 'Notes' }).fill('A town rebuilding on the High Road.');
  await save(page, 'Leilon');
  await expect(page.getByText('A town rebuilding on the High Road.')).toBeVisible();

  // Two places inside it, made from the town's page.
  await page.getByRole('button', { name: 'Add a place inside' }).click();
  await expect(page.getByRole('combobox', { name: 'Inside of' })).toHaveValue(/.+/);
  await page.getByRole('textbox', { name: 'Name' }).fill("Aubrey's Peculiarities Shoppe");
  await page.getByRole('combobox', { name: 'NPCs' }).fill('Aubrey');
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await save(page, "Aubrey's Peculiarities Shoppe");
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Leilon');

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Leilon' }).click();
  await page.getByRole('button', { name: 'Add a place inside' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Town Hall');
  await save(page, 'Town Hall');

  // Places sharing a parent are siblings; clicking one goes there.
  const siblings = page.getByRole('region', { name: 'Sibling locations' });
  await siblings.getByRole('link', { name: "Aubrey's Peculiarities Shoppe" }).click();
  await expect(page.getByRole('heading', { name: "Aubrey's Peculiarities Shoppe", level: 1 })).toBeVisible();

  // NPC links lead to the NPC list, searched for that name.
  await page.getByRole('region', { name: 'NPCs' }).getByRole('link', { name: 'Aubrey' }).click();
  await expect(page).toHaveURL(/#\/npcs\?q=Aubrey$/);
  await page.goBack();

  // A separate town linked as a sibling shows on both sides.
  await page.goto('#/locations/new');
  await page.getByRole('textbox', { name: 'Name' }).fill('Neverwinter');
  await page.getByRole('combobox', { name: 'Sibling locations' }).selectOption({ label: 'Leilon' });
  await expect(page.getByRole('list', { name: 'Sibling locations' })).toContainText('Leilon');
  await save(page, 'Neverwinter');
  await page.getByRole('region', { name: 'Sibling locations' }).getByRole('link', { name: 'Leilon' }).click();
  const leilonSiblings = page.getByRole('region', { name: 'Sibling locations' });
  await expect(leilonSiblings.getByRole('link', { name: 'Neverwinter' })).toBeVisible();
  const inside = page.getByRole('region', { name: 'Places inside' });
  await expect(inside.getByRole('link')).toHaveText(["Aubrey's Peculiarities Shoppe", 'Town Hall']);

  // The list is an outline, and search covers NPCs.
  await page.goto('#/locations');
  await expect(page.getByRole('list', { name: 'Locations' }).getByRole('listitem')).toHaveText([
    /^Leilon/,
    /Aubrey's Peculiarities Shoppe/,
    /Town Hall/,
    /^Neverwinter/,
  ]);
  await page.getByRole('searchbox', { name: 'Search locations' }).fill('aubrey');
  await expect(page.getByRole('list', { name: 'Locations' }).getByRole('listitem')).toHaveText([/Aubrey's Peculiarities Shoppe\s*in Leilon/]);

  // Deleting the town moves its places to the top level.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('link', { name: 'Leilon', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/locations$/);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Locations' }).getByRole('listitem')).toHaveText([
    /^Aubrey's Peculiarities Shoppe/,
    /^Neverwinter/,
    /^Town Hall/,
  ]);
});

async function newItem(page: Page, name: string, category: string, cost: string) {
  await page.goto('#/items/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Category' }).selectOption(category);
  await page.getByRole('textbox', { name: 'Cost' }).fill(cost);
  await page.getByRole('button', { name: 'Save item' }).click();
  // Wait for the saved item's page, so the next navigation isn't undone by the editor's own.
  // (The editor's preview has the same heading, so look for the page's Edit button instead.)
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
}

test('locations: an optional shop table with items from the item list or shop-only, with stock', async ({ page }) => {
  // With nothing in the item list, the shop points there.
  await page.goto('#/locations/new');
  await expect(page.getByRole('region', { name: 'Shop' })).toContainText('the item list is empty, so items added here are shop-only');

  await newItem(page, 'Longsword', 'weapon', '15 gp');
  await newItem(page, 'Rope (50 ft)', 'gear', '1 gp');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Locations' }).click();
  await page.getByRole('button', { name: 'New location' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('The Gilded Anvil');
  await expect(page.getByRole('list', { name: 'Shop items' })).toHaveCount(0);

  // Items are picked by name and start at their list price, which the shop can change.
  await page.getByRole('combobox', { name: 'Add a shop' }).fill('longsword');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('textbox', { name: 'Item 1 cost' })).toHaveValue('15 gp');
  await page.getByRole('textbox', { name: 'Item 1 cost' }).fill('20 gp');
  await page.getByRole('textbox', { name: 'Item 1 description' }).fill('Dwarven steel, slightly used');

  // Names that aren't in the item list can be added as shop-only items, with their own name and description.
  const picker = page.getByRole('combobox', { name: 'Add an item' });
  await picker.fill('Bag of Holding');
  await expect(page.getByText("“Bag of Holding” isn't in the item list.")).toBeVisible();
  await picker.press('Enter'); // Enter only picks from the item list.
  await expect(page.getByRole('list', { name: 'Shop items' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add as shop-only item' }).click();
  await expect(page.getByRole('textbox', { name: 'Item 2 name' })).toHaveValue('Bag of Holding');
  await page.getByRole('textbox', { name: 'Item 2 cost' }).fill('500 gp');
  await page.getByRole('textbox', { name: 'Item 2 description' }).fill('Bigger inside');

  // Nothing can be added twice.
  await picker.fill('bag of holding');
  await expect(page.getByText('Bag of Holding is already for sale here.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add as shop-only item' })).toBeDisabled();
  await picker.fill('Longsword');
  await expect(page.getByText('Longsword is already for sale here.')).toBeVisible();
  await picker.fill('Rope (50 ft)');
  await picker.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Item 3 cost' })).toHaveValue('1 gp');

  // Stock is optional: the longswords are sold out until a restock; rope is counted but never restocked.
  await page.getByRole('spinbutton', { name: 'Item 1 in stock' }).fill('0');
  await page.getByRole('spinbutton', { name: 'Item 1 max stock' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Item 3 in stock' }).fill('10');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name: 'The Gilded Anvil', level: 1 })).toBeVisible();

  const shop = page.getByRole('region', { name: 'Shop' });
  await expect(shop.getByRole('row')).toHaveText([
    /Item\s*Cost\s*Stock\s*Description/,
    /Longsword\s*Simple melee weapon, 1d6 slashing\s*20 gp\s*0 \/ 3\s*sold out\s*Sell one\s*Dwarven steel, slightly used/,
    /Bag of Holding\s*Shop only\s*500 gp\s*Bigger inside/,
    /Rope \(50 ft\)\s*Adventuring gear\s*1 gp\s*10\s*Sell one/,
  ]);
  // Only counted items can be sold, and not once they're gone.
  await expect(shop.getByRole('button', { name: 'Sell one Bag of Holding' })).toHaveCount(0);
  await expect(shop.getByRole('button', { name: 'Sell one Longsword' })).toBeDisabled();

  // Restocking fills items back up to their maximum, and sticks.
  await shop.getByRole('button', { name: 'Restock' }).click();
  await expect(shop.getByRole('row').nth(1)).toContainText('3 / 3');
  await expect(shop.getByRole('row').nth(1)).not.toContainText('sold out');
  await expect(shop.getByRole('button', { name: 'Restock' })).toBeDisabled();
  await page.reload();
  await expect(shop.getByRole('row').nth(1)).toContainText('3 / 3');
  await expect(shop.getByRole('row').nth(3)).toContainText(/1 gp\s*10/);

  // Selling one takes it off the shelf; a restock puts it back.
  await shop.getByRole('button', { name: 'Sell one Longsword' }).click();
  await expect(shop.getByRole('row').nth(1)).toContainText('2 / 3');
  await expect(shop.getByRole('button', { name: 'Restock' })).toBeEnabled();
  await shop.getByRole('button', { name: 'Sell one Rope (50 ft)' }).click();
  await expect(shop.getByRole('row').nth(3)).toContainText(/1 gp\s*9/);
  await page.reload();
  await expect(shop.getByRole('row').nth(1)).toContainText('2 / 3');

  // Item names link to the item list.
  await shop.getByRole('link', { name: 'Longsword' }).click();
  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
  await page.goBack();

  // Search finds the place by what it sells.
  await page.goto('#/locations');
  await page.getByRole('searchbox', { name: 'Search locations' }).fill('longsword');
  await expect(page.getByRole('list', { name: 'Locations' }).getByRole('listitem')).toHaveText([/The Gilded Anvil/]);

  // Removing every item removes the shop.
  await page.getByRole('link', { name: 'The Gilded Anvil' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Remove item 3' }).click();
  await page.getByRole('button', { name: 'Remove item 2' }).click();
  await page.getByRole('button', { name: 'Remove item 1' }).click();
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name: 'The Gilded Anvil', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shop' })).toHaveCount(0);
});

test('locations: stock a shop with every item of some kinds within a price range', async ({ page }) => {
  await page.goto('#/items');
  await page.locator('input[type=file]').setInputFiles({
    name: 'items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        { name: 'Flute', category: 'tool', tool: { type: 'musical' }, cost: '2 gp' },
        { name: 'Lute', category: 'tool', tool: { type: 'musical' }, cost: '35 gp' },
        { name: 'Thieves’ Tools', category: 'tool', tool: { type: 'other' }, cost: '25 gp' },
        { name: 'Smith’s Tools', category: 'tool', tool: { type: 'artisan' }, cost: '20 gp' },
        { name: 'Rope', cost: '1 gp' },
        { name: 'Dagger', category: 'weapon', cost: '2 gp' },
      ]),
    ),
  });
  await expect(page.getByRole('status')).toContainText('Imported 6 new items');

  await page.goto('#/locations/new');
  await page.getByRole('textbox', { name: 'Name' }).fill('The Tinker’s Cart');
  await page.getByRole('combobox', { name: 'Add a shop' }).fill('Rope');
  await page.getByRole('button', { name: 'Add item' }).click();

  // Tools and instruments for 25 gp or under.
  await page.getByRole('button', { name: 'Stock by kind and price…' }).click();
  const kinds = page.getByRole('group', { name: 'Kinds of item' });
  await kinds.getByRole('button', { name: 'All tools' }).click();
  await expect(kinds.getByRole('button', { name: 'Musical instruments' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Max price' }).fill('25');
  const matches = page.getByRole('list', { name: 'Matching items' }).getByRole('listitem');
  await expect(matches).toHaveText([/Smith’s Tools/, /Flute/, /Thieves’ Tools/]);

  // Any match can be left out.
  await matches.filter({ hasText: 'Smith’s Tools' }).getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Add 2 items' }).click();
  await expect(page.getByRole('list', { name: 'Matching items' })).toHaveCount(0);
  await expect(page.getByLabel('Item 2', { exact: true })).toContainText('Flute');
  await expect(page.getByLabel('Item 3', { exact: true })).toContainText('Thieves’ Tools');
  await expect(page.getByRole('textbox', { name: 'Item 2 cost' })).toHaveValue('2 gp');

  // Items already for sale aren't offered again.
  await page.getByRole('button', { name: 'Stock by kind and price…' }).click();
  await page.getByRole('textbox', { name: 'Max price' }).fill('5 gp');
  await expect(page.getByRole('list', { name: 'Matching items' }).getByRole('listitem')).toHaveText([/Dagger/]);
  await page.getByRole('textbox', { name: 'Max price' }).fill('cheap');
  await expect(page.getByText('Prices are a number of gold pieces')).toBeVisible();
  await page.getByRole('region', { name: 'Stock by kind and price' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('region', { name: 'Stock by kind and price' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('region', { name: 'Shop' }).getByRole('row')).toHaveCount(4);
});
