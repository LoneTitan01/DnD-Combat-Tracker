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
