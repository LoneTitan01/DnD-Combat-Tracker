import { expect, test, type Page } from '@playwright/test';

async function addPlayer(page: Page, name: string, level: string, init: string, passive = '') {
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Level', exact: true }).fill(level);
  await page.getByRole('textbox', { name: 'Init bonus', exact: true }).fill(init);
  await page.getByRole('textbox', { name: 'Passive Perception', exact: true }).fill(passive);
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
}

test('party roster: add, edit with clamping, warn on duplicates, thresholds, persist, remove', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('#/party');

  await addPlayer(page, 'Aria', '3', '+2', '14');
  await addPlayer(page, 'Brom', '3', '-1');
  await addPlayer(page, 'Cass', '', '0');
  await addPlayer(page, 'Dain', '1', '+4');

  // Thresholds count only levelled players: 3 + 3 + 1 → easy 75+75+25.
  await expect(page.getByText('3 players, average level 2.3')).toBeVisible();
  await expect(page.getByText('175 XP', { exact: true })).toBeVisible(); // easy
  await expect(page.getByText('900 XP', { exact: true })).toBeVisible(); // deadly 400+400+100
  await expect(page.getByText("1 player has no level and isn't counted.")).toBeVisible();

  // Edit: out-of-range level is clamped to 20, junk passive Perception clears it.
  const level = page.getByRole('textbox', { name: 'Level for Cass' });
  await level.fill('25');
  await level.press('Enter');
  await expect(level).toHaveValue('20');
  const passive = page.getByRole('textbox', { name: 'Passive Perception for Aria' });
  await passive.fill('lots');
  await passive.press('Tab');
  await expect(passive).toHaveValue('');

  // Blank name reverts.
  const name = page.getByRole('textbox', { name: 'Name for Dain' });
  await name.fill('');
  await name.press('Tab');
  await expect(name).toHaveValue('Dain');

  // Duplicate names are flagged (they'd clash as token names).
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('aria');
  await expect(page.getByText("There's already a player with this name.")).toBeVisible();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('');
  // Labels follow the name, so keep a handle on Dain's own input across the rename.
  const dainInput = (await name.elementHandle())!;
  await dainInput.fill('Brom');
  await dainInput.press('Tab');
  await expect(page.getByText('Another player has this name.')).toHaveCount(2);
  await dainInput.fill('Dain');
  await dainInput.press('Tab');
  await expect(page.getByText('Another player has this name.')).toHaveCount(0);

  // Everything survives a reload.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Level for Cass' })).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: 'Initiative bonus for Brom' })).toHaveValue('-1');
  await expect(page.getByRole('textbox', { name: 'Passive Perception for Aria' })).toHaveValue('');
  await expect(page.locator('tbody tr')).toHaveCount(4);

  // Remove.
  await page.getByRole('row', { name: /Cass/ }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText('3 players, average level 2.3')).toBeVisible();
});
