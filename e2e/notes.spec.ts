import { expect, test } from '@playwright/test';
import { row, seed, select, setInitiative, turnOrder } from './helpers';

test('combat notes: per creature, saved when switching, persisted, never on the table view', async ({ page, context }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\/[^/]+$/);
  const combatId = page.url().split('/').pop()!;
  await setInitiative(page, 'Goblin 1', 15);
  await setInitiative(page, 'Goblin 2', 14);
  await setInitiative(page, 'Dragon 1', 12);
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const [name, init] of [['Aria', 20], ['Brom', 18], ['Cass', 10], ['Dain', 5]] as const)
    await page.getByRole('textbox', { name: `Initiative for ${name}` }).fill(String(init));
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await expect(turnOrder(page).getByRole('listitem')).toHaveCount(7);

  // Type, then switch creatures straight away: the note must not be lost.
  await select(page, 'Goblin 2');
  await page.getByRole('textbox', { name: 'Combat notes for Goblin 2' }).fill('Has the cellar key');
  await select(page, 'Dragon 1');
  await expect(page.getByRole('textbox', { name: 'Combat notes for Dragon 1' })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Combat notes for Dragon 1' }).fill('Hates Brom');

  // Players get notes too.
  await row(page, 'Aria').getByText('Aria').first().click();
  await page.getByRole('textbox', { name: 'Combat notes for Aria' }).fill('Concentrating on Bless');
  await page.getByRole('textbox', { name: 'Combat notes for Aria' }).blur();

  await expect(row(page, 'Goblin 2').getByLabel('Notes: Has the cellar key')).toBeVisible();
  await expect(row(page, 'Goblin 1').getByLabel(/^Notes:/)).toHaveCount(0);

  await page.reload();
  await select(page, 'Goblin 2');
  await expect(page.getByRole('textbox', { name: 'Combat notes for Goblin 2' })).toHaveValue('Has the cellar key');
  await select(page, 'Dragon 1');
  await expect(page.getByRole('textbox', { name: 'Combat notes for Dragon 1' })).toHaveValue('Hates Brom');

  const table = await context.newPage();
  await table.goto(`#/table?combat=${combatId}`);
  await expect(table.locator('main')).toContainText('Aria');
  await expect(table.locator('main')).not.toContainText('cellar key');
  await expect(table.locator('main')).not.toContainText('Bless');
});
