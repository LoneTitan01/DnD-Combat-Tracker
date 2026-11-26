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
  await expect(page).toHaveURL(/#\/items\/[^/]+$/);
}

test('locations: an optional shop table with items from the item list', async ({ page }) => {
  // With nothing in the item list, the shop points there.
  await page.goto('#/locations/new');
  await expect(page.getByRole('region', { name: 'Shop' })).toContainText('the item list, which is empty');

  await newItem(page, 'Longsword', 'weapon', '15 gp');
  await newItem(page, 'Rope (50 ft)', 'gear', '1 gp');

  await page.goto('#/locations/new');
  await page.getByRole('textbox', { name: 'Name' }).fill('The Gilded Anvil');
  await expect(page.getByRole('list', { name: 'Shop items' })).toHaveCount(0);

  // Items are picked by name and start at their list price, which the shop can change.
  await page.getByRole('combobox', { name: 'Add a shop' }).fill('longsword');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('textbox', { name: 'Item 1 cost' })).toHaveValue('15 gp');
  await page.getByRole('textbox', { name: 'Item 1 cost' }).fill('20 gp');
  await page.getByRole('textbox', { name: 'Item 1 description' }).fill('Dwarven steel, slightly used');

  // Names that aren't in the item list can't be added, nor can an item twice.
  const picker = page.getByRole('combobox', { name: 'Add an item' });
  await picker.fill('Bag of Holding');
  await expect(page.getByText('No item called “Bag of Holding” in the item list.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add item' })).toBeDisabled();
  await picker.fill('Longsword');
  await expect(page.getByText('Longsword is already for sale here.')).toBeVisible();
  await picker.fill('Rope (50 ft)');
  await picker.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Item 2 cost' })).toHaveValue('1 gp');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name: 'The Gilded Anvil', level: 1 })).toBeVisible();

  const shop = page.getByRole('region', { name: 'Shop' });
  await expect(shop.getByRole('row')).toHaveText([
    /Item\s*Cost\s*Description/,
    /Longsword\s*Simple melee weapon, 1d6 slashing\s*20 gp\s*Dwarven steel, slightly used/,
    /Rope \(50 ft\)\s*Adventuring gear\s*1 gp/,
  ]);

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
  await page.getByRole('button', { name: 'Remove item 2' }).click();
  await page.getByRole('button', { name: 'Remove item 1' }).click();
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name: 'The Gilded Anvil', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shop' })).toHaveCount(0);
});
