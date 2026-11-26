import { expect, test } from '@playwright/test';
import { next, row, seed, select, setInitiative, turnOrder } from './helpers';

test('player view: kind of creature under the name, real or the DM’s fake', async ({ page, context }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\/[^/]+$/);
  const combatId = page.url().split('/').pop()!;
  await setInitiative(page, 'Goblin 1', 25);
  await setInitiative(page, 'Goblin 2', 3);
  await setInitiative(page, 'Dragon 1', 22);
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const [name, init] of [['Aria', 20], ['Brom', 18], ['Cass', 10], ['Dain', 5]] as const)
    await page.getByRole('textbox', { name: `Initiative for ${name}` }).fill(String(init));
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await expect(turnOrder(page).getByRole('listitem')).toHaveCount(7);

  const table = await context.newPage();
  await table.goto(`#/table?combat=${combatId}`);
  const main = table.locator('main');
  const upNext = table.getByLabel('Up next');
  // Goblin 1 is up, Dragon 1 next.
  await expect(main.getByLabel('Creature', { exact: true })).toHaveText('Goblin');
  await expect(upNext.getByLabel('Creature', { exact: true })).toHaveText('Dragon');

  // Disguise the dragon: typing the fake alone changes nothing until Fake is on.
  await select(page, 'Dragon 1');
  await page.getByRole('textbox', { name: 'Fake creature for Dragon 1' }).fill('Orc');
  await expect(upNext.getByLabel('Creature', { exact: true })).toHaveText('Dragon');
  await page.getByRole('button', { name: 'Fake', exact: true }).click();
  await expect(upNext.getByLabel('Creature', { exact: true })).toHaveText('Orc');
  await expect(row(page, 'Dragon 1')).toContainText('shown as Orc');

  await next(page);
  await expect(main).toContainText('Dragon 1');
  await expect(main.getByLabel('Creature', { exact: true })).toHaveText('Orc');

  // A freshly opened player view gets the disguise too, and the reveal goes live.
  await table.reload();
  await expect(table.locator('main').getByLabel('Creature', { exact: true })).toHaveText('Orc');
  await page.getByRole('button', { name: /^Real/ }).click();
  await expect(table.locator('main').getByLabel('Creature', { exact: true })).toHaveText('Dragon');

  // Players never show one.
  await next(page);
  await expect(table.locator('main')).toContainText('Aria');
  await expect(table.locator('main').getByLabel('Creature', { exact: true })).toHaveCount(0);
});

test('player view: an allied creature’s name is green instead of red', async ({ page, context }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\/[^/]+$/);
  const combatId = page.url().split('/').pop()!;
  await setInitiative(page, 'Goblin 1', 25);
  await setInitiative(page, 'Goblin 2', 3);
  await setInitiative(page, 'Dragon 1', 22);
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const [name, init] of [['Aria', 20], ['Brom', 18], ['Cass', 10], ['Dain', 5]] as const)
    await page.getByRole('textbox', { name: `Initiative for ${name}` }).fill(String(init));
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();

  const table = await context.newPage();
  await table.goto(`#/table?combat=${combatId}`);
  const name = table.locator('main ul');
  await expect(name).toContainText('Goblin 1');
  await expect(name).toHaveClass(/text-red-300/);

  await select(page, 'Goblin 1');
  await page.getByRole('checkbox', { name: /Ally of the players/ }).check();
  await expect(row(page, 'Goblin 1')).toContainText('ally');
  await expect(name).toHaveClass(/text-emerald-300/);

  await page.getByRole('checkbox', { name: /Ally of the players/ }).uncheck();
  await expect(name).toHaveClass(/text-red-300/);
});
