import { expect, test, type Page } from '@playwright/test';

async function addNpc(page: Page, name: string, notes?: string) {
  await page.goto('#/npcs');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
  if (!notes) return;
  await page.getByRole('button', { name: `Notes for ${name}` }).click();
  const box = page.getByRole('textbox', { name: `Notes text for ${name}` });
  await box.fill(notes);
  await box.blur();
}

async function addOrganization(page: Page, name: string, description: string) {
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add organization' }).click();
  const field = page.getByRole('textbox', { name: `Description for ${name}` });
  await field.fill(description);
  await field.blur();
}

test('organizations: describe them, add and remove members, delete', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await addNpc(page, 'Sister Garaele');
  await addNpc(page, 'Toblen');

  await page.getByRole('link', { name: 'Organizations', exact: true }).click();
  await expect(page.getByText('No organizations yet.')).toBeVisible();
  await addOrganization(page, 'The Harpers', 'Spies who fight tyranny.');
  await addOrganization(page, 'Zhentarim', 'The Black Network.');

  const harpers = page.getByRole('region', { name: 'The Harpers' });
  await expect(harpers.getByText('No members yet.')).toBeVisible();
  await harpers.getByRole('combobox', { name: 'Add a member to The Harpers' }).selectOption({ label: 'Sister Garaele' });
  await harpers.getByRole('combobox', { name: 'Add a member to The Harpers' }).selectOption({ label: 'Toblen' });
  await expect(page.getByRole('list', { name: 'Members of The Harpers' }).getByRole('link')).toHaveText(['Sister Garaele', 'Toblen']);
  // Everyone's in, so there's no one left to add.
  await expect(harpers.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Toblen from The Harpers' }).click();
  await expect(page.getByRole('list', { name: 'Members of The Harpers' }).getByRole('link')).toHaveText(['Sister Garaele']);

  // Search covers members; and it all survives a reload.
  await page.getByRole('searchbox', { name: 'Search organizations' }).fill('garaele');
  await expect(page.getByRole('region', { name: 'Zhentarim' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Description for The Harpers' })).toHaveValue('Spies who fight tyranny.');

  // The NPC list shows the organizations an NPC belongs to, linking back.
  await page.goto('#/npcs');
  await expect(page.getByLabel('Organizations of Sister Garaele').getByRole('link')).toHaveText(['The Harpers']);
  await expect(page.getByLabel('Organizations of Toblen')).toHaveCount(0);

  // Organizations count toward their campaign.
  await page.goto('#/campaigns');
  await expect(page.getByText(/2 organizations/)).toBeVisible();

  // Deleting one keeps its members.
  await page.goto('#/organizations');
  await page.getByRole('region', { name: 'The Harpers' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('region', { name: 'The Harpers' })).toHaveCount(0);
  await page.goto('#/npcs');
  await expect(page.getByRole('textbox', { name: 'Name for Sister Garaele' })).toBeVisible();
  await expect(page.getByLabel('Organizations of Sister Garaele')).toHaveCount(0);
});

test('an organization named in an NPC’s notes shows its description on hover', async ({ page }) => {
  await page.goto('#/organizations');
  await addOrganization(page, 'The Harpers', 'Spies who fight tyranny.');
  await addNpc(page, 'Sister Garaele', 'Secretly an agent of the harpers.\nWants Agatha found.');

  // Open notes are shown as text, with the organization's name hoverable.
  const mention = page.getByLabel('Notes of Sister Garaele').getByRole('button', { name: 'the harpers' });
  await mention.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('The Harpers');
  await expect(tip).toContainText('Spies who fight tyranny.');
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();

  // Closed, the first line under the name has it too.
  await page.getByRole('button', { name: 'Notes for Sister Garaele' }).click();
  await page.getByRole('row', { name: /Sister Garaele/ }).getByRole('button', { name: 'the harpers' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Spies who fight tyranny.');
});
