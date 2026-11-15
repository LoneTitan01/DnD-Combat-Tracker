import { expect, test } from '@playwright/test';

const GOBLIN = `Goblin Boss
Small humanoid (goblinoid), neutral evil
Armor Class 17 (chain shirt, shield)
Hit Points 21 (6d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
10 (+0) 14 (+2) 10 (+0) 10 (+0) 8 (-1) 10 (+0)
Challenge 1 (200 XP)
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.`;

const DRAKE = `Ember Drake
Medium dragon, chaotic evil
AC 14
HP 33 (6d8 + 6)
Str 14 +2 +2 Dex 12 +1 +3 Con 13 +1 +1 Int 6 -2 -2 Wis 10 +0 +0 Cha 8 -1 -1
CR 2 (XP 450; PB +2)
Actions
Ember Breath (Recharge 5-6). The drake exhales embers; it knows fireball.`;

test('bulk add stat blocks: paste several, review in the carousel, approve one and then the rest', async ({ page }) => {
  await page.goto('#/bestiary');
  await page.getByRole('button', { name: 'Bulk add' }).click();
  await expect(page.getByRole('heading', { name: 'Bulk add stat blocks' })).toBeVisible();

  // A new empty box appears after each one is filled.
  await page.getByRole('textbox', { name: 'Stat block 1' }).fill(GOBLIN);
  await page.getByRole('textbox', { name: 'Stat block 2' }).fill(DRAKE);
  await page.getByRole('textbox', { name: 'Stat block 3' }).fill('Nameless thing');
  await expect(page.getByRole('textbox', { name: 'Stat block 4' })).toHaveValue('');
  await page.getByRole('button', { name: 'Read 3 stat blocks' }).click();

  // First slide: the parsed goblin, editable, with a live preview.
  const tabs = page.getByRole('navigation', { name: 'stat blocks to review' });
  await expect(tabs.getByRole('button')).toHaveCount(3);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Goblin Boss');
  await expect(page.getByRole('combobox', { name: 'CR', exact: true })).toHaveValue('1');
  await page.getByLabel('Name', { exact: true }).fill('Goblin Chief');
  await expect(page.locator('aside').getByRole('heading', { name: 'Goblin Chief' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Added Goblin Chief.');

  // It moves on to the drake, with the recharge read and the save picked out of the 2024 table.
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ember Drake');
  await expect(page.getByRole('textbox', { name: 'Saving throws' })).toHaveValue('Dex +3');
  await expect(page.locator('aside')).toContainText('Ember Breath (Recharge 5–6).');

  // The third couldn't be read well: warnings show; Approve all adds the drake and stops on it.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('No ability scores found; they were left at 10.')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Approve all (2)' }).click();
  await expect(page.getByRole('status')).toContainText('Added 1 stat block. 1 stat block still needs fixing');
  await expect(page.getByText('Name is required.')).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('All reviewed: 2 stat blocks added, 1 discarded.')).toBeVisible();

  await page.getByRole('link', { name: 'Bestiary', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Goblin Chief' })).toBeVisible();
  await page.getByRole('link', { name: 'Ember Drake' }).click();
  await expect(page.getByText('33 (6d8 + 6)')).toBeVisible();
  // fireball, named in its text, was linked from the SRD spells.
  await expect(page.locator('article').getByRole('button', { name: 'fireball' })).toBeVisible();
});

test('bulk add spells: paste, fix, approve', async ({ page }) => {
  await page.goto('#/spells');
  await page.getByRole('button', { name: 'Bulk add' }).click();
  await page.getByRole('textbox', { name: 'Spell 1' }).fill(`Frost Lance
2nd-level evocation (ritual)
Casting Time: 1 action
Range: 90 feet
Components: V, S
Duration: Concentration, up to 1 minute
A lance of ice streaks toward a creature.
At Higher Levels. The damage increases by 1d8 for each slot level above 2nd.`);
  await page.getByRole('button', { name: 'Read spell' }).click();

  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Frost Lance');
  await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('2');
  await expect(page.getByRole('checkbox', { name: 'Ritual' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Concentration' })).toBeChecked();
  await page.getByRole('textbox', { name: 'Range' }).fill('120 feet');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('All reviewed: 1 spell added.')).toBeVisible();

  await page.getByRole('link', { name: 'Open Frost Lance' }).click();
  await expect(page.getByText('2nd-level evocation (ritual)')).toBeVisible();
  await expect(page.getByText('120 feet')).toBeVisible();
  await expect(page.getByText('The damage increases by 1d8')).toBeVisible();
});
