import { expect, test } from '@playwright/test';
import { addTestSpells } from './helpers';

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
  await addTestSpells(page);
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
  // fireball, named in its text, was linked from the spell list.
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

test('bulk add stat blocks: spell slots in a Spellcasting trait are read and tracked as slots', async ({ page }) => {
  await page.goto('#/bestiary');
  await page.getByRole('button', { name: 'Bulk add' }).click();
  await page.getByRole('textbox', { name: 'Stat block 1' }).fill(`Court Mage
Medium humanoid (any race), any alignment
Armor Class 12 (15 with mage armor)
Hit Points 40 (9d8)
Speed 30 ft.
STR DEX CON INT WIS CHA
9 (-1) 14 (+2) 11 (+0) 17 (+3) 12 (+1) 11 (+0)
Challenge 6 (2,300 XP)
Spellcasting. The mage is a 9th-level spellcaster. It has the following wizard spells prepared:
Cantrips (at will): fire bolt, light
1st level (4 slots): magic missile, shield
3rd level (3 slots): counterspell, fireball`);
  await page.getByRole('button', { name: 'Read stat block' }).click();

  // The review form switches to spell slots with the printed counts.
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Court Mage');
  const resource = page.getByRole('group', { name: 'Track spells by' });
  await expect(resource.getByRole('button', { name: 'Spell slots' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '1st-level slots' })).toHaveValue('4');
  await expect(page.getByRole('textbox', { name: '2nd-level slots' })).toHaveValue('0');
  await expect(page.getByRole('textbox', { name: '3rd-level slots' })).toHaveValue('3');
  await page.getByRole('textbox', { name: '3rd-level slots' }).fill('2');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('All reviewed: 1 stat block added.')).toBeVisible();

  // Saved that way: the editor shows the same slots.
  await page.goto('#/bestiary');
  await page.getByRole('link', { name: 'Court Mage' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Track spells by' }).getByRole('button', { name: 'Spell slots' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '1st-level slots' })).toHaveValue('4');
  await expect(page.getByRole('textbox', { name: '3rd-level slots' })).toHaveValue('2');
});

test('bulk add items: a pasted table is split into rows, and it asks what an item is when it can’t tell', async ({ page }) => {
  await page.goto('#/items');
  await page.getByRole('button', { name: 'Bulk add' }).click();
  await expect(page.getByRole('heading', { name: 'Bulk add items' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Item 1' }).fill(`Name Cost Damage Weight Properties
Martial Melee Weapons
Longsword 15 gp 1d8 slashing 3 lb. Versatile (1d10)
Warhammer 15 gp 1d8 bludgeoning 2 lb. Versatile (1d10)`);
  await page.getByRole('textbox', { name: 'Item 2' }).fill(`Torch
1 cp, 1 lb.
A torch burns for 1 hour, providing bright light in a 20-foot radius.`);
  await page.getByRole('textbox', { name: 'Item 3' }).fill('Chain mail 75 gp 16 Str 13 Disadvantage 55 lb.');
  await page.getByRole('button', { name: 'Read 4 items' }).click();

  // The table's rows are read as martial melee weapons.
  const tabs = page.getByRole('navigation', { name: 'items to review' });
  await expect(tabs.getByRole('button')).toHaveCount(4);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Longsword');
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('weapon');
  await expect(page.getByRole('combobox', { name: 'Weapon class' })).toHaveValue('martial');
  await expect(page.getByRole('textbox', { name: 'Damage', exact: true })).toHaveValue('1d8');

  // The torch could be anything: Approve all adds the rest and stops on it with the question.
  await page.getByRole('button', { name: 'Approve all (4)' }).click();
  await expect(page.getByRole('status')).toContainText('Added 3 items. 1 item still needs fixing');
  const question = page.getByRole('group', { name: 'What kind of item is Torch?' });
  await expect(question).toBeVisible();
  await expect(page.getByText('Answer "What kind of item is Torch?" first.')).toBeVisible();
  await question.getByRole('button', { name: 'Adventuring gear' }).click();
  await expect(question).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('gear');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('All reviewed: 4 items added.')).toBeVisible();

  await page.getByRole('link', { name: 'Items', exact: true }).first().click();
  await page.getByRole('link', { name: 'Chain mail' }).click();
  await expect(page.getByText('Heavy armor')).toBeVisible();
  await expect(page.getByText('Str 13')).toBeVisible();
});

test('bulk add items: the table import reads every row as an item', async ({ page }) => {
  await page.goto('#/items/bulk');
  await page.getByRole('radio', { name: 'Table, one item per row' }).click();
  await page.getByRole('textbox', { name: 'Table' }).fill(`Name Cost Weight
Adventuring Gear
Torch
Rope, hempen (50 feet) 1 gp 10 lb.
Simple Melee Weapons
Dagger 2 gp 1d4 piercing 1 lb. Finesse, light, thrown (range 20/60)`);
  await page.getByRole('button', { name: 'Read 3 items' }).click();

  const tabs = page.getByRole('navigation', { name: 'items to review' });
  await expect(tabs.getByRole('button')).toHaveCount(3);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Torch');
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('gear');

  await page.getByRole('button', { name: 'Approve all (3)' }).click();
  await expect(page.getByText('All reviewed: 3 items added.')).toBeVisible();
  await page.getByRole('link', { name: 'Items', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Rope, hempen (50 feet)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dagger' })).toBeVisible();
});
