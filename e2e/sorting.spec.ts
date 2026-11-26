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

/** The clickable header for a column, and its <th> (which carries aria-sort). */
const header = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const headerCell = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

test('bestiary: click Name, Type or CR to sort, again to reverse, and keep the choice across a visit', async ({ page }) => {
  await importJson(page, '#/bestiary', [
    { name: 'Owlbear', type: 'monstrosity', cr: '3' },
    { name: 'Wolf', type: 'beast', cr: '1/4' },
    { name: 'Young Red Dragon', type: 'dragon', cr: '10' },
    { name: 'Bear', type: 'beast', cr: '1' },
  ]);
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveCount(0);

  await expect(headerCell(page, 'Name')).toHaveAttribute('aria-sort', 'ascending');
  await expect(names(page)).toHaveText(['Bear', 'Owlbear', 'Wolf', 'Young Red Dragon']);
  await header(page, 'Name').click();
  await expect(headerCell(page, 'Name')).toHaveAttribute('aria-sort', 'descending');
  await expect(names(page)).toHaveText(['Young Red Dragon', 'Wolf', 'Owlbear', 'Bear']);

  await header(page, 'Type').click();
  await expect(headerCell(page, 'Name')).toHaveAttribute('aria-sort', 'none');
  await expect(headerCell(page, 'Type')).toHaveAttribute('aria-sort', 'ascending');
  await expect(names(page)).toHaveText(['Wolf', 'Bear', 'Young Red Dragon', 'Owlbear']);

  await header(page, 'CR').click();
  await expect(names(page)).toHaveText(['Wolf', 'Bear', 'Owlbear', 'Young Red Dragon']);
  await header(page, 'CR').click();
  await expect(headerCell(page, 'CR')).toHaveAttribute('aria-sort', 'descending');
  await expect(names(page)).toHaveText(['Young Red Dragon', 'Owlbear', 'Bear', 'Wolf']);

  await page.getByRole('link', { name: 'Owlbear' }).click();
  await page.goBack();
  await expect(headerCell(page, 'CR')).toHaveAttribute('aria-sort', 'descending');
  await expect(names(page)).toHaveText(['Young Red Dragon', 'Owlbear', 'Bear', 'Wolf']);

  // Clearing the filters leaves the sort alone.
  await page.getByRole('combobox', { name: 'Type' }).selectOption('beast');
  await expect(names(page)).toHaveText(['Bear', 'Wolf']);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(names(page)).toHaveText(['Young Red Dragon', 'Owlbear', 'Bear', 'Wolf']);
});

test('spells: click Level, Name, School or Casting time to sort, again to reverse', async ({ page }) => {
  await importJson(page, '#/spells', [
    { name: 'Fireball', level: 3, school: 'evocation', castingTime: '1 action' },
    { name: 'Shield', level: 1, school: 'abjuration', castingTime: '1 reaction' },
    { name: 'Misty Step', level: 2, school: 'conjuration', castingTime: '1 bonus action' },
    { name: 'Alarm', level: 1, school: 'abjuration', castingTime: '1 minute' },
  ]);

  await expect(headerCell(page, 'Level')).toHaveAttribute('aria-sort', 'ascending');
  await expect(names(page)).toHaveText(['Alarm', 'Shield', 'Misty Step', 'Fireball']);
  await header(page, 'Level').click();
  await expect(names(page)).toHaveText(['Fireball', 'Misty Step', 'Alarm', 'Shield']);
  await header(page, 'Name').click();
  await expect(names(page)).toHaveText(['Alarm', 'Fireball', 'Misty Step', 'Shield']);
  await header(page, 'School').click();
  await expect(names(page)).toHaveText(['Alarm', 'Shield', 'Misty Step', 'Fireball']);
  await header(page, 'Casting time').click();
  await expect(names(page)).toHaveText(['Shield', 'Misty Step', 'Fireball', 'Alarm']);
  await header(page, 'Casting time').click();
  await expect(names(page)).toHaveText(['Alarm', 'Fireball', 'Misty Step', 'Shield']);

  // The choice survives a reload, since it lives in the URL.
  await page.reload();
  await expect(headerCell(page, 'Casting time')).toHaveAttribute('aria-sort', 'descending');
  await expect(names(page)).toHaveText(['Alarm', 'Fireball', 'Misty Step', 'Shield']);
});
