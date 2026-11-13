import { expect, test } from '@playwright/test';
import { currentTurn, damage, hp, next, row, seed, setInitiative, turnOrder } from './helpers';

test('combat: stage without players, reopen, start with 4, run 3 rounds, resume, end', async ({ page, context }) => {
  page.on('dialog', (d) => void d.accept());
  await seed(page);

  // ---- Stage (no players involved) ----
  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\/[^/]+$/);
  const combatUrl = page.url();
  const combatId = combatUrl.split('/').pop()!;
  await expect(page.getByText('Ready to run', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Token name for / })).toHaveCount(3);

  await page.getByRole('textbox', { name: 'Token name for Goblin 1' }).fill('Red cap');
  await page.getByRole('textbox', { name: 'HP for Dragon 1' }).fill('60');
  await setInitiative(page, 'Red cap', 25);
  await setInitiative(page, 'Goblin 2', 15);
  await setInitiative(page, 'Dragon 1', 12);

  // ---- Reopen later ----
  await page.goto('#/');
  await page.reload();
  await page.getByRole('link', { name: 'Combats' }).click();
  await page.getByRole('region', { name: 'Ready to run' }).getByRole('link', { name: 'Dragon and friends' }).click();
  await expect(page.getByRole('textbox', { name: 'Token name for Red cap' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'HP for Dragon 1' })).toHaveValue('60');
  await expect(page.getByRole('textbox', { name: 'Initiative for Red cap' })).toHaveValue('25');

  // ---- Player view, before the start ----
  const table = await context.newPage();
  await table.goto(`#/table?combat=${combatId}`);
  await expect(table.getByText('Waiting to start')).toBeVisible();

  // ---- Start with 4 players ----
  await page.getByRole('button', { name: 'Start combat…' }).click();
  await expect(page.getByRole('button', { name: 'Roll for initiative!' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Initiative for Aria' }).fill('20');
  await page.getByRole('textbox', { name: 'Initiative for Brom' }).fill('18');
  await page.getByRole('textbox', { name: 'Initiative for Cass' }).fill('10');
  await page.getByRole('textbox', { name: 'Initiative for Dain' }).fill('5');
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();

  // Order: Red cap 25, Aria 20, Brom 18, Goblin 2 15, Dragon 1 12, Cass 10, Dain 5.
  await expect(turnOrder(page).getByRole('listitem')).toHaveCount(7);
  const order = await turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(order).toEqual(['Red cap', 'Aria', 'Brom', 'Goblin 2', 'Dragon 1', 'Cass', 'Dain']);
  await expect(page.getByLabel('Round')).toHaveText('1');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Red cap');
  await expect(table.getByRole('listitem').filter({ hasText: 'Red cap' })).toBeVisible();

  // ---- Round 1 ----
  await next(page); // Aria (+ Brom back to back on the player view)
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');
  await expect(table.locator('main')).toContainText('Aria');
  await expect(table.locator('main')).toContainText('Brom');
  await expect(table.getByLabel('Up next')).toContainText('Goblin 2');

  // Aria hits Goblin 2: 7 resisted → 3 (7 → 4 HP), then 10 → dead.
  await damage(page, 'Goblin 2', 7, 'Resisted ½');
  await expect(hp(page, 'Goblin 2')).toHaveAttribute('aria-valuenow', '4');
  await damage(page, 'Goblin 2', 10, 'Normal');
  await expect(hp(page, 'Goblin 2')).toHaveAttribute('aria-valuenow', '0');
  await expect(row(page, 'Goblin 2')).toContainText('dead');
  await expect(page.getByLabel('XP earned')).toHaveText('50');

  // Undo the killing blow, then land it again.
  await page.getByRole('list', { name: 'Combat log' }).getByRole('button', { name: 'Undo' }).first().click();
  await expect(hp(page, 'Goblin 2')).toHaveAttribute('aria-valuenow', '4');
  await expect(page.getByLabel('XP earned')).toHaveText('0');
  await damage(page, 'Goblin 2', 4, 'Normal');
  await expect(page.getByLabel('XP earned')).toHaveText('50');

  await next(page); // Brom
  await next(page); // Goblin 2 is dead → skipped → Dragon 1
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Dragon 1');
  await row(page, 'Dragon 1').getByRole('button', { name: 'Use' }).click();
  await expect(row(page, 'Dragon 1')).toContainText('Recharge 5–6');
  await expect(page.getByRole('group', { name: /roll a d6/ })).toHaveCount(0); // no prompt on the use turn

  await next(page); // Cass
  await next(page); // Dain
  await next(page); // wraps → Red cap, round 2
  await expect(page.getByLabel('Round')).toHaveText('2');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Red cap');
  await expect(table.getByText('Round 2', { exact: false }).first()).toBeVisible();

  // ---- Resume after closing the tab mid-round ----
  await next(page); // Aria
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('All changes saved');
  await page.close();
  const resumed = await context.newPage();
  resumed.on('dialog', (d) => void d.accept());
  await resumed.goto('#/combats');
  await resumed.getByRole('region', { name: 'In progress' }).getByRole('link', { name: 'Dragon and friends' }).click();
  await expect(resumed.getByLabel('Round')).toHaveText('2');
  await expect(currentTurn(resumed)).toHaveAttribute('aria-label', 'Aria');
  await expect(resumed.getByLabel('XP earned')).toHaveText('50');

  // ---- Round 2: Dragon's recharge prompt ----
  await next(resumed); // Brom
  await next(resumed); // Dragon 1
  const prompt = resumed.getByRole('group', { name: 'Fire Breath (Recharge 5–6): roll a d6' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('textbox', { name: 'd6 roll' }).fill('3');
  await prompt.getByRole('button', { name: 'Confirm' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(row(resumed, 'Dragon 1')).toContainText('Recharge 5–6');

  await next(resumed); // Cass
  await next(resumed); // Dain
  await next(resumed); // Red cap, round 3
  await expect(resumed.getByLabel('Round')).toHaveText('3');
  await damage(resumed, 'Red cap', 7, 'Normal');
  await next(resumed); // Aria
  await next(resumed); // Brom
  await next(resumed); // Dragon 1 (Red cap and Goblin 2 skipped... Red cap was before Aria)
  await expect(currentTurn(resumed)).toHaveAttribute('aria-label', 'Dragon 1');
  const prompt3 = resumed.getByRole('group', { name: 'Fire Breath (Recharge 5–6): roll a d6' });
  await prompt3.getByRole('textbox', { name: 'd6 roll' }).fill('6');
  await prompt3.getByRole('button', { name: 'Confirm' }).click();
  await expect(row(resumed, 'Dragon 1')).toContainText('Fire Breath is ready');
  await expect(row(resumed, 'Dragon 1').getByRole('button', { name: 'Use' })).toBeVisible();

  // The party finishes the dragon (60 HP, vulnerable to the last 30).
  await damage(resumed, 'Dragon 1', 30, 'Vulnerable ×2');
  await expect(resumed.getByText('Every creature is down.')).toBeVisible();
  await resumed.getByRole('button', { name: 'End combat' }).first().click();

  // ---- Recap ----
  await expect(resumed.getByText('Ended in round 3.')).toBeVisible();
  await expect(resumed.getByLabel('XP earned')).toHaveText('1,900'); // 50 + 50 + 1,800
  await expect(resumed.getByText('475 each for 4 players')).toBeVisible();
  await expect(table.getByText('Combat over')).toBeVisible();

  await resumed.goto('#/combats');
  await expect(resumed.getByRole('region', { name: 'Ended' })).toContainText('Dragon and friends');
});

test('combat: players and creatures join and leave mid-combat; drag order; manual recharge', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await seed(page);
  await page.getByRole('button', { name: 'Stage' }).click();
  await setInitiative(page, 'Goblin 1', 14);
  await setInitiative(page, 'Goblin 2', 13);
  await setInitiative(page, 'Dragon 1', 12);
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const p of ['Brom', 'Cass', 'Dain']) await page.getByRole('checkbox', { name: p }).uncheck();
  await page.getByRole('textbox', { name: 'Initiative for Aria' }).fill('20');
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await expect(turnOrder(page).getByRole('listitem')).toHaveCount(4);

  // Brom joins with initiative 13.5 → between the goblins? Ties on 13 break by DEX approximation.
  await page.getByRole('button', { name: '+ Player' }).click();
  await page.getByRole('combobox', { name: 'Player to add' }).selectOption({ label: 'Brom' });
  await page.getByRole('textbox', { name: 'Initiative for joining player' }).fill('16');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  let order = await turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(order).toEqual(['Aria', 'Brom', 'Goblin 1', 'Goblin 2', 'Dragon 1']);
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');

  // A goblin reinforcement gets the next number.
  await page.getByRole('button', { name: '+ Creature' }).click();
  await page.getByRole('button', { name: 'Add Goblin' }).click();
  await expect(row(page, 'Goblin 3')).toBeVisible();
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');

  // Delay: move Dragon 1 to the top with the arrows (pointer stays on Aria).
  for (let i = 0; i < 5; i++) {
    const labels = await turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    if (labels[0] === 'Dragon 1') break;
    await page.getByRole('button', { name: 'Move Dragon 1 up' }).click();
  }
  order = await turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(order[0]).toBe('Dragon 1');
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Aria');

  // Drag Goblin 1 onto the top slot.
  await row(page, 'Goblin 1').dragTo(row(page, 'Dragon 1'));
  order = await turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(order[0]).toBe('Goblin 1');

  // Manual recharge adjust from the chip.
  await row(page, 'Dragon 1').getByRole('button', { name: 'Use' }).click();
  await row(page, 'Dragon 1').getByRole('button', { name: /Fire Breath: Recharge 5–6\. Adjust/ }).click();
  await row(page, 'Dragon 1').getByRole('button', { name: 'Mark ready' }).click();
  await expect(row(page, 'Dragon 1').getByRole('button', { name: 'Use' })).toBeVisible();

  // Brom leaves.
  await row(page, 'Brom').getByText('Brom').first().click();
  await page.getByRole('button', { name: 'Leaves the combat' }).click();
  await expect(row(page, 'Brom')).toHaveCount(0);
});
