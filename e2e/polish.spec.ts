import { expect, test, type Page } from '@playwright/test';
import { currentTurn, hp, row, seed, setInitiative, turnOrder } from './helpers';

/** Seeded encounter staged and started: Goblin 1 (14), Goblin 2 (13), Dragon 1 (12), Aria (20), Brom (8). */
async function runningCombat(page: Page) {
  page.on('dialog', (d) => void d.accept());
  await seed(page);
  await page.getByRole('button', { name: 'Stage' }).click();
  await setInitiative(page, 'Goblin 1', 14);
  await setInitiative(page, 'Goblin 2', 13);
  await setInitiative(page, 'Dragon 1', 12);
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const p of ['Cass', 'Dain']) await page.getByRole('checkbox', { name: p }).uncheck();
  await page.getByRole('textbox', { name: 'Initiative for Aria' }).fill('20');
  await page.getByRole('textbox', { name: 'Initiative for Brom' }).fill('8');
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');
}

test('multi-target damage: same roll, separate modifiers, separate undo', async ({ page }) => {
  await runningCombat(page);

  await page.getByRole('button', { name: 'Multi-target' }).click();
  await expect(page.getByRole('heading', { name: 'Multi-target damage' })).toBeVisible();
  // Rows toggle as targets; players can't be targeted.
  await row(page, 'Goblin 1').getByText('Goblin 1').first().click();
  await row(page, 'Goblin 2').getByRole('checkbox', { name: 'Target Goblin 2' }).check();
  await row(page, 'Dragon 1').getByText('Dragon 1').first().click();
  await expect(row(page, 'Aria').getByRole('checkbox')).toHaveCount(0);
  await row(page, 'Aria').getByText('Aria').first().click();

  const targets = page.getByRole('list', { name: 'Targets' });
  await expect(targets.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('radiogroup', { name: 'Modifier for Goblin 2' }).getByRole('radio', { name: 'Resisted' }).click();
  await page.getByRole('radiogroup', { name: 'Modifier for Dragon 1' }).getByRole('radio', { name: 'Vulnerable' }).click();

  // Fireball for 5: goblins 7 → 2 and 7 → 5 (½ = 2), dragon 50 → 40 (×2).
  await page.getByRole('textbox', { name: 'Damage to all targets' }).fill('5');
  await page.getByRole('button', { name: 'Apply to 3 targets' }).click();
  await expect(page.getByText('5 damage applied to 3 targets.')).toBeVisible();
  await expect(hp(page, 'Goblin 1')).toHaveAttribute('aria-valuenow', '2');
  await expect(hp(page, 'Goblin 2')).toHaveAttribute('aria-valuenow', '5');
  await expect(hp(page, 'Dragon 1')).toHaveAttribute('aria-valuenow', '40');

  // A second hit kills Goblin 1, which then drops out of the target list.
  await page.getByRole('textbox', { name: 'Damage to all targets' }).fill('2');
  await page.getByRole('button', { name: 'Apply to 3 targets' }).click();
  await expect(row(page, 'Goblin 1')).toContainText('dead');
  await expect(targets.getByRole('listitem')).toHaveCount(2);

  // Each target was logged separately and undoes on its own.
  const log = page.getByRole('list', { name: 'Combat log' });
  await expect(log.getByRole('listitem')).toHaveCount(6);
  await log.getByRole('listitem').filter({ hasText: 'Goblin 1 takes 2 damage' }).getByRole('button', { name: 'Undo' }).click();
  await expect(hp(page, 'Goblin 1')).toHaveAttribute('aria-valuenow', '2');
  await expect(hp(page, 'Dragon 1')).toHaveAttribute('aria-valuenow', '36');

  // Esc leaves multi-target mode; clicking a row selects again.
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Multi-target damage' })).toHaveCount(0);
  await row(page, 'Dragon 1').getByText('Dragon 1').first().click();
  await expect(page.getByRole('textbox', { name: 'Amount for Dragon 1' })).toBeFocused();
});

test('damage type picks resisted / vulnerable / immune from the stat block', async ({ page }) => {
  await runningCombat(page);
  const log = page.getByRole('list', { name: 'Combat log' });
  const amount = page.getByRole('textbox', { name: 'Amount for Dragon 1' });
  const type = page.getByRole('combobox', { name: 'Damage type', exact: true });

  // Dragon: immune to fire, vulnerable to cold, resists slashing. Enter applies the suggestion.
  await row(page, 'Dragon 1').getByText('Dragon 1').first().click();
  await type.selectOption('fire');
  await expect(page.getByRole('status', { name: 'Damage type suggestion' })).toContainText('Dragon 1 is immune (0)');
  await amount.fill('10');
  await amount.press('Enter');
  await expect(log.getByRole('listitem').first()).toContainText('Dragon 1 takes 0 fire damage (10 immune) → 50 HP');
  await expect(type).toHaveValue(''); // back to untyped after each hit

  await type.selectOption('cold');
  await amount.fill('6');
  await amount.press('Enter');
  await expect(hp(page, 'Dragon 1')).toHaveAttribute('aria-valuenow', '38');
  await expect(log.getByRole('listitem').first()).toContainText('12 cold damage (6 vulnerable)');

  // The buttons still override: magical slashing ignores the resistance.
  await type.selectOption('slashing');
  await amount.fill('9');
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(hp(page, 'Dragon 1')).toHaveAttribute('aria-valuenow', '29');

  // Multi-target: each target follows its own stat block for the chosen type.
  await page.getByRole('button', { name: 'Multi-target' }).click();
  await row(page, 'Goblin 1').getByText('Goblin 1').first().click();
  await row(page, 'Dragon 1').getByText('Dragon 1').first().click();
  const dragonMod = page.getByRole('radiogroup', { name: 'Modifier for Dragon 1' });
  await page.getByRole('combobox', { name: 'Damage type for all targets' }).selectOption('fire');
  await expect(dragonMod.getByRole('radio', { name: 'Immune' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('list', { name: 'Targets' })).toContainText('Immune from stat block');
  await page.getByRole('textbox', { name: 'Damage to all targets' }).fill('4');
  await page.getByRole('button', { name: 'Apply to 2 targets' }).click();
  await expect(page.getByText('4 fire damage applied to 2 targets.')).toBeVisible();
  await expect(hp(page, 'Goblin 1')).toHaveAttribute('aria-valuenow', '3');
  await expect(hp(page, 'Dragon 1')).toHaveAttribute('aria-valuenow', '29');

  // A hand-picked override is dropped when the damage type changes.
  await dragonMod.getByRole('radio', { name: 'Normal' }).click();
  await expect(dragonMod.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('combobox', { name: 'Damage type for all targets' }).selectOption('cold');
  await expect(dragonMod.getByRole('radio', { name: 'Vulnerable' })).toHaveAttribute('aria-checked', 'true');
});

test('conditions on creatures and players, with immunities', async ({ page }) => {
  await runningCombat(page);

  // Make Goblin 2 prone and poisoned; badges show on the row in standard order.
  await row(page, 'Goblin 2').getByText('Goblin 2').first().click();
  const goblinConditions = page.getByRole('group', { name: 'Conditions for Goblin 2' });
  await goblinConditions.getByRole('button', { name: 'prone' }).click();
  await goblinConditions.getByRole('button', { name: 'poisoned' }).click();
  await expect(goblinConditions.getByRole('button', { name: 'prone' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveText('poisonedprone');

  // Players get conditions too.
  await row(page, 'Aria').getByText('Aria').first().click();
  await page.getByRole('group', { name: 'Conditions for Aria' }).getByRole('button', { name: 'frightened' }).click();
  await expect(row(page, 'Aria').getByLabel('Conditions')).toHaveText('frightened');

  // Conditions survive a reload, and Clear removes them.
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('All changes saved');
  await page.reload();
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveText('poisonedprone');
  await row(page, 'Goblin 2').getByText('Goblin 2').first().click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveCount(0);
});

test('a stat block condition immunity is shown and cannot be applied', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('#/bestiary');
  await page.locator('input[type=file]').setInputFiles({
    name: 'skeleton.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ name: 'Skeleton', cr: '1/4', maxHP: 13, conditionImmunities: ['poisoned', 'exhaustion'] }])),
  });
  await page.goto('#/encounters/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Crypt');
  await page.getByRole('button', { name: 'Add Skeleton' }).click();
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Start combat…' }).click();
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await row(page, 'Skeleton 1').getByText('Skeleton 1').first().click();
  const group = page.getByRole('group', { name: 'Conditions for Skeleton 1' });
  await expect(group.getByText('poisoned · immune')).toBeVisible();
  await expect(group.getByRole('button', { name: 'poisoned' })).toHaveCount(0);
  await expect(group.getByRole('button', { name: 'prone' })).toBeVisible();
});

test('keyboard shortcuts: N next turn (not while typing), M multi-target, Esc closes', async ({ page }) => {
  await runningCombat(page);
  // Order: Aria 20, Goblin 1 14, Goblin 2 13, Dragon 1 12, Brom 8.
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 1');
  await page.keyboard.press('N');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 2');

  // Typing "n" into a box doesn't advance the turn.
  await row(page, 'Dragon 1').getByText('Dragon 1').first().click();
  const amount = page.getByRole('textbox', { name: 'Amount for Dragon 1' });
  await expect(amount).toBeFocused();
  await page.keyboard.type('n5');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 2');

  // Esc leaves the box, a second Esc closes the panel, then N works again.
  await page.keyboard.press('Escape');
  await expect(amount).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(amount).toHaveCount(0);
  await page.keyboard.press('n');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Dragon 1');

  // Ctrl+N is left to the browser.
  await page.keyboard.press('Control+n').catch(() => {});
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Dragon 1');

  // M toggles multi-target.
  await page.keyboard.press('m');
  await expect(page.getByRole('heading', { name: 'Multi-target damage' })).toBeVisible();
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('m');
  await expect(page.getByRole('heading', { name: 'Multi-target damage' })).toHaveCount(0);
  await expect(turnOrder(page).getByRole('listitem')).toHaveCount(5);
});

test('shortcuts can be rebound on the Settings page, and a clash swaps the two keys', async ({ page }) => {
  await page.goto('#/settings');
  const shortcut = (name: string) => page.getByLabel(`Shortcut for ${name}`, { exact: true });
  await expect(shortcut('Next turn')).toHaveText('N');

  // Next turn → T.
  await page.getByRole('button', { name: 'Change shortcut for Next turn' }).click();
  await page.keyboard.press('Shift');
  await expect(page.getByText('Shift can’t be a shortcut.')).toBeVisible();
  await page.keyboard.press('t');
  await expect(shortcut('Next turn')).toHaveText('T');

  // Multi-target → T takes it from Next turn, which gets M.
  await page.getByRole('button', { name: 'Change shortcut for Multi-target damage' }).click();
  await page.keyboard.press('T');
  await expect(shortcut('Multi-target damage')).toHaveText('T');
  await expect(shortcut('Next turn')).toHaveText('M');

  // Esc cancels without changing anything.
  await page.getByRole('button', { name: 'Change shortcut for Next turn' }).click();
  await page.keyboard.press('Escape');
  await expect(shortcut('Next turn')).toHaveText('M');
  await expect(page.getByRole('button', { name: 'Change shortcut for Next turn' })).toBeVisible();

  // The tracker uses the new keys and shows them.
  await runningCombat(page);
  await expect(page.getByRole('button', { name: 'Next turn →' })).toHaveAttribute('aria-keyshortcuts', 'M');
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');
  await page.keyboard.press('m');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 1');
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Multi-target damage' })).toBeVisible();

  // Reset all brings the defaults back, and they survive a reload.
  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Reset all to defaults' }).click();
  await page.reload();
  await expect(shortcut('Next turn')).toHaveText('N');
  await expect(shortcut('Multi-target damage')).toHaveText('M');
  await expect(page.getByRole('button', { name: 'Reset all to defaults' })).toBeDisabled();
});

test('condition durations count down on the right turns and announce when they end', async ({ page }) => {
  await runningCombat(page);
  // Order: Aria 20, Goblin 1 14, Goblin 2 13, Dragon 1 12, Brom 8. It's Aria's turn.
  const nextTurn = () => page.getByRole('button', { name: 'Next turn →' }).click();

  // Aria knocks Goblin 2 prone until the end of its next turn.
  await row(page, 'Goblin 2').getByText('Goblin 2').first().click();
  await page.getByRole('group', { name: 'Conditions for Goblin 2' }).getByRole('button', { name: 'prone' }).click();
  const rounds = page.getByRole('textbox', { name: 'Rounds of prone' });
  await rounds.fill('1');
  await rounds.press('Enter');
  await expect(page.getByRole('combobox', { name: 'When prone ends' })).toHaveValue('end');
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveText('prone · 1');

  // A 3-round condition on Goblin 1, counted on Brom's turns (e.g. Brom's spell).
  await row(page, 'Goblin 1').getByText('Goblin 1').first().click();
  await page.getByRole('group', { name: 'Conditions for Goblin 1' }).getByRole('button', { name: 'restrained' }).click();
  await page.getByRole('textbox', { name: 'Rounds of restrained' }).fill('3');
  await page.getByRole('textbox', { name: 'Rounds of restrained' }).press('Enter');
  await page.getByRole('combobox', { name: 'Whose turn restrained counts on' }).selectOption({ label: 'Brom' });
  await expect(row(page, 'Goblin 1').getByLabel('Conditions')).toHaveText('restrained · 3');

  // Durations survive a reload.
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('All changes saved');
  await page.reload();
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveText('prone · 1');

  await nextTurn(); // Goblin 1
  await nextTurn(); // Goblin 2's turn: still prone
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 2');
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveText('prone · 1');
  await nextTurn(); // end of Goblin 2's turn → prone ends
  await expect(row(page, 'Goblin 2').getByLabel('Conditions')).toHaveCount(0);
  const notice = page.getByRole('status', { name: 'Conditions ended' });
  await expect(notice).toHaveText('Goblin 2 is no longer prone');
  await expect(page.getByRole('list', { name: 'Combat log' })).toContainText('Goblin 2 is no longer prone');

  // The notice clears on the next turn change; Goblin 1's condition only ticks on Brom's turns.
  await nextTurn(); // Brom's turn
  await expect(notice).toHaveCount(0);
  await expect(row(page, 'Goblin 1').getByLabel('Conditions')).toHaveText('restrained · 3');
  await nextTurn(); // end of Brom's turn → 2
  await expect(row(page, 'Goblin 1').getByLabel('Conditions')).toHaveText('restrained · 2');

  // Clearing the rounds box makes it last until removed.
  await row(page, 'Goblin 1').getByText('Goblin 1').first().click();
  await page.getByRole('textbox', { name: 'Rounds of restrained' }).fill('');
  await page.getByRole('textbox', { name: 'Rounds of restrained' }).press('Enter');
  await expect(row(page, 'Goblin 1').getByLabel('Conditions')).toHaveText('restrained');
  await expect(page.getByRole('listitem', { name: 'restrained duration' })).toContainText('until removed');
});

test('the stat block follows the turn: opens for creatures, closes for players', async ({ page }) => {
  await runningCombat(page);
  // Order: Aria 20, Goblin 1 14, Goblin 2 13, Dragon 1 12, Brom 8.
  const amount = (name: string) => page.getByRole('textbox', { name: `Amount for ${name}` });
  await expect(page.getByRole('textbox', { name: /^Amount for / })).toHaveCount(0);

  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(amount('Goblin 1')).toBeVisible();
  // Opening by itself doesn't grab the keyboard, so N keeps working.
  await expect(amount('Goblin 1')).not.toBeFocused();
  await page.keyboard.press('n');
  await expect(amount('Goblin 2')).toBeVisible();
  await page.keyboard.press('n');
  await expect(amount('Dragon 1')).toBeVisible();
  await page.keyboard.press('n');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Brom');
  await expect(page.getByRole('textbox', { name: /^Amount for / })).toHaveCount(0);
});
