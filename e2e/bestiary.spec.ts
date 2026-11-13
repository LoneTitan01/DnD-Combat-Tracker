import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface NewCreature {
  name: string;
  size: string;
  cr: string;
  type?: string;
  recharge?: string;
}

async function createCreature(page: Page, c: NewCreature) {
  await page.goto('#/bestiary');
  await page.getByRole('button', { name: 'New stat block' }).click();
  await page.getByLabel('Name', { exact: true }).fill(c.name);
  await page.getByRole('combobox', { name: 'Size' }).selectOption(c.size);
  if (c.type) await page.getByRole('textbox', { name: 'Type', exact: true }).fill(c.type);
  await page.getByRole('combobox', { name: 'CR', exact: true }).selectOption(c.cr);
  if (c.recharge) {
    await page.getByRole('button', { name: '+ Add action' }).click();
    await page.getByPlaceholder('Name, e.g. Fire Breath').fill(c.recharge);
    await page.getByRole('checkbox', { name: 'Recharges' }).check();
  }
  await page.getByRole('button', { name: 'Save stat block' }).click();
  await expect(page).toHaveURL(/#\/bestiary\/[^/]+$/);
  await expect(page.getByRole('heading', { name: c.name, level: 2 })).toBeVisible();
  // The recharge shows on the stat block.
  if (c.recharge) await expect(page.getByText(`${c.recharge} (Recharge 5–6).`)).toBeVisible();
}

const rows = (page: Page) => page.locator('tbody tr');

test('bestiary: create 5, survive reload, search, filter, duplicate, export/import', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());

  // The form's auto-fill: CR → XP, size → hit die.
  await page.goto('#/bestiary/new');
  await page.getByRole('combobox', { name: 'CR', exact: true }).selectOption('3');
  await expect(page.getByRole('textbox', { name: /^XP/ })).toHaveValue('700');
  await page.getByRole('combobox', { name: 'Size' }).selectOption('Large');
  await expect(page.getByRole('combobox', { name: 'Die type' })).toHaveValue('d10');
  await page.getByRole('textbox', { name: /^CON/ }).fill('16');
  await expect(page.getByRole('textbox', { name: /^CON/ })).toHaveAccessibleName(/\+3/);
  await page.getByRole('button', { name: 'Cancel' }).click();

  const creatures: NewCreature[] = [
    { name: 'Goblin', size: 'Small', cr: '1/4' },
    { name: 'Owlbear', size: 'Large', cr: '3', type: 'monstrosity' },
    { name: 'Bandit', size: 'Medium', cr: '1/8' },
    { name: 'Young Red Dragon', size: 'Large', cr: '10', type: 'dragon', recharge: 'Fire Breath' },
    { name: 'Wolf', size: 'Medium', cr: '1/4', type: 'beast' },
  ];
  for (const c of creatures) await createCreature(page, c);

  // Done when: all 5 are there after a reload.
  await page.goto('#/bestiary');
  await page.reload();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first()).toContainText('Bandit');
  await expect(page.getByRole('row', { name: /Owlbear/ })).toContainText('700');

  // Search and filter.
  await page.getByLabel('Search by name').fill('gob');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByLabel('Minimum CR').selectOption('1');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Type').selectOption('dragon');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(rows(page)).toHaveCount(5);

  // Duplicate to make a variant.
  await page.getByRole('row', { name: /Young Red Dragon/ }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Young Red Dragon (copy)');
  await page.getByLabel('Name', { exact: true }).fill('Young Red Dragon (Elder)');
  await page.getByRole('button', { name: 'Save stat block' }).click();
  await expect(page.getByText('Fire Breath (Recharge 5–6).')).toBeVisible();
  await page.goto('#/bestiary');
  await expect(rows(page)).toHaveCount(6);

  // Export, delete one, import it back.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all' }).click();
  const file = await (await downloadPromise).path();
  const exported = JSON.parse(await readFile(file, 'utf-8'));
  expect(exported.creatures).toHaveLength(6);

  await page.getByRole('row', { name: /Goblin/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(rows(page)).toHaveCount(5);

  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Imported 1 new stat block, replaced 5.');
  await expect(rows(page)).toHaveCount(6);
});

test('stat block editor validates before saving', async ({ page }) => {
  await page.goto('#/bestiary/new');
  await page.getByRole('button', { name: 'Save stat block' }).click();
  await expect(page.getByText('Name is required.')).toBeVisible();
  await expect(page).toHaveURL(/#\/bestiary\/new$/);
});
