import { expect, test, type Page } from '@playwright/test';

async function importJson(page: Page, path: string, data: unknown[]) {
  await page.goto(path);
  await page.locator('input[type=file]').setInputFiles({
    name: 'data.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole('status')).toContainText(`Imported ${data.length}`);
}

/** The first-column names of the list's rows, top to bottom. */
const names = (page: Page) => page.locator('tbody tr td:first-child a');

test('bestiary: sort by name, type and CR, and keep the choice across a visit to a stat block', async ({ page }) => {
  await importJson(page, '#/bestiary', [
    { name: 'Owlbear', type: 'monstrosity', cr: '3' },
    { name: 'Wolf', type: 'beast', cr: '1/4' },
    { name: 'Young Red Dragon', type: 'dragon', cr: '10' },
    { name: 'Bear', type: 'beast', cr: '1' },
  ]);
  const sort = page.getByRole('combobox', { name: 'Sort' });

  await expect(names(page)).toHaveText(['Bear', 'Owlbear', 'Wolf', 'Young Red Dragon']);
  await sort.selectOption('Sort by type');
  await expect(names(page)).toHaveText(['Wolf', 'Bear', 'Young Red Dragon', 'Owlbear']);
  await sort.selectOption('Sort by CR');
  await expect(names(page)).toHaveText(['Wolf', 'Bear', 'Owlbear', 'Young Red Dragon']);

  await page.getByRole('link', { name: 'Owlbear' }).click();
  await page.goBack();
  await expect(sort).toHaveValue('cr');
  await expect(names(page)).toHaveText(['Wolf', 'Bear', 'Owlbear', 'Young Red Dragon']);
});

test('spells: sort by level, name, school and casting time', async ({ page }) => {
  await importJson(page, '#/spells', [
    { name: 'Fireball', level: 3, school: 'evocation', castingTime: '1 action' },
    { name: 'Shield', level: 1, school: 'abjuration', castingTime: '1 reaction' },
    { name: 'Misty Step', level: 2, school: 'conjuration', castingTime: '1 bonus action' },
    { name: 'Alarm', level: 1, school: 'abjuration', castingTime: '1 minute' },
  ]);
  const sort = page.getByRole('combobox', { name: 'Sort' });

  await expect(sort).toHaveValue('level');
  await expect(names(page)).toHaveText(['Alarm', 'Shield', 'Misty Step', 'Fireball']);
  await sort.selectOption('Sort by name');
  await expect(names(page)).toHaveText(['Alarm', 'Fireball', 'Misty Step', 'Shield']);
  await sort.selectOption('Sort by school');
  await expect(names(page)).toHaveText(['Alarm', 'Shield', 'Misty Step', 'Fireball']);
  await sort.selectOption('Sort by casting time');
  await expect(names(page)).toHaveText(['Shield', 'Misty Step', 'Fireball', 'Alarm']);

  // The choice survives a reload, since it lives in the URL.
  await page.reload();
  await expect(sort).toHaveValue('castingTime');
  await expect(names(page)).toHaveText(['Shield', 'Misty Step', 'Fireball', 'Alarm']);
});
