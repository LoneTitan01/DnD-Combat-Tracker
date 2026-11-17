import { expect, test, type Page } from '@playwright/test';

async function newLocation(page: Page, name: string, inside?: string) {
  await page.goto('#/locations/new');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  if (inside) await page.getByRole('combobox', { name: 'Inside of' }).selectOption({ label: inside });
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function addNpc(page: Page, name: string, livesIn: string) {
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Lives in', exact: true }).selectOption({ label: livesIn });
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
}

test('NPCs live at locations: pick a place, see them there, search, move, delete', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await newLocation(page, 'Leilon');
  await newLocation(page, "Aubrey's Shoppe", 'Leilon');
  await newLocation(page, 'Neverwinter');

  await page.getByRole('link', { name: 'NPCs', exact: true }).click();
  await expect(page.getByText('No NPCs yet.')).toBeVisible();
  // Places show where they are, in outline order.
  await expect(page.getByRole('combobox', { name: 'Lives in' }).getByRole('option')).toHaveText([
    'No location',
    'Leilon',
    "Leilon › Aubrey's Shoppe",
    'Neverwinter',
  ]);
  await addNpc(page, 'Aubrey', "Leilon › Aubrey's Shoppe");
  // The place stays picked for the next NPC.
  await expect(page.getByRole('combobox', { name: 'Lives in' })).toHaveValue(/.+/);
  await addNpc(page, 'Sildar', 'Neverwinter');
  await addNpc(page, 'Stranger', 'No location');

  // Search covers where they live, including the places it's inside.
  const search = page.getByRole('searchbox', { name: 'Search NPCs' });
  await search.fill('leilon');
  await expect(page.getByRole('textbox', { name: /^Name for / })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Name for Aubrey' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();

  // The NPC links to their place, and the place lists them.
  await page.getByRole('link', { name: "Go to Leilon › Aubrey's Shoppe" }).click();
  await expect(page.getByRole('heading', { name: "Aubrey's Shoppe", level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'NPCs' }).getByRole('link')).toHaveText(['Aubrey']);
  // And the place's NPC links come back to the list, searched for them.
  await page.getByRole('region', { name: 'NPCs' }).getByRole('link', { name: 'Aubrey' }).click();
  await expect(page.getByRole('textbox', { name: /^Name for / })).toHaveCount(1);

  // Moving an NPC from the list updates both places.
  await page.goto('#/npcs');
  await page.getByRole('combobox', { name: 'Location for Sildar' }).selectOption({ label: 'Leilon' });
  await page.goto('#/locations');
  await expect(page.getByRole('list', { name: 'Locations' }).getByRole('listitem').first()).toContainText('1 NPC');
  await page.getByRole('link', { name: 'Leilon', exact: true }).click();
  await expect(page.getByRole('region', { name: 'NPCs' }).getByRole('link')).toHaveText(['Sildar']);

  // Editing a location: pick an existing NPC (moving them here) or type a new one.
  await page.goto('#/locations');
  await page.getByRole('link', { name: 'Neverwinter' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const field = page.getByRole('combobox', { name: 'NPCs' });
  await field.fill('aubrey');
  await field.press('Enter');
  await field.fill('Lord Neverember');
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await expect(page.getByRole('list', { name: 'NPCs' })).toContainText("Aubrey (moves from Leilon › Aubrey's Shoppe)");
  await expect(page.getByRole('list', { name: 'NPCs' })).toContainText('Lord Neverember (new)');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('region', { name: 'NPCs' }).getByRole('link')).toHaveText(['Aubrey', 'Lord Neverember']);

  // Deleting a place moves its NPCs up to the place it was inside.
  await page.goto('#/locations');
  await page.getByRole('link', { name: 'Leilon', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.goto('#/npcs');
  await expect(page.getByRole('combobox', { name: 'Location for Sildar' })).toHaveValue('');

  // NPCs count toward their campaign, and survive a reload; deleting removes them.
  await page.goto('#/campaigns');
  await expect(page.getByText(/4 NPCs/)).toBeVisible();
  await page.goto('#/npcs');
  await page.getByRole('row', { name: /Stranger/ }).getByRole('button', { name: 'Delete' }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Name for / })).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: 'Location for Aubrey' })).toHaveValue(/.+/);
});
