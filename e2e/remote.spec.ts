import { expect, test } from '@playwright/test';
import { currentTurn, next, row, seed, setInitiative, turnOrder } from './helpers';

test('players join from their own device with a code, set initiative and conditions, and follow the turn', async ({ page, context }) => {
  // Same-browser stand-in for the peer-to-peer link, so the test never touches the network.
  await context.addInitScript(() => {
    (window as { __DMCT_TRANSPORT__?: string }).__DMCT_TRANSPORT__ = 'broadcast';
  });
  page.on('dialog', (d) => void d.accept());
  await seed(page);

  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page).toHaveURL(/#\/combats\/[^/]+$/);
  await setInitiative(page, 'Goblin 1', 15);
  await setInitiative(page, 'Goblin 2', 14);
  await setInitiative(page, 'Dragon 1', 12);

  // ---- DM shares ----
  await page.getByRole('button', { name: /Players' devices/ }).click();
  await page.getByRole('button', { name: 'Start sharing' }).click();
  const code = (await page.getByLabel('Join code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(page.getByRole('status', { name: 'Sharing status' })).toHaveText('0 devices connected');

  // ---- A player joins by typing the code ----
  const phone = await context.newPage();
  await phone.goto('#/join');
  await phone.getByRole('textbox', { name: 'Join code' }).fill(code.toLowerCase());
  await phone.getByRole('button', { name: 'Join' }).click();
  await expect(phone.getByRole('status', { name: 'Connection' })).toContainText('Connected');
  await expect(phone.getByText('Waiting for the DM to start the combat.')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Sharing status' })).toHaveText('1 device connected');

  // ---- DM starts; the player picks their character ----
  await page.getByRole('button', { name: 'Start combat…' }).click();
  for (const [name, n] of [['Aria', 10], ['Brom', 9], ['Cass', 8], ['Dain', 7]] as const) {
    await page.getByRole('textbox', { name: `Initiative for ${name}` }).fill(String(n));
  }
  await page.getByRole('button', { name: 'Roll for initiative!' }).click();
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 1');

  await phone.getByRole('region', { name: 'Choose your character' }).getByRole('button', { name: 'Aria' }).click();
  const mine = phone.getByRole('region', { name: 'Your character' });
  await expect(mine).toContainText('Aria');
  await expect(phone.getByRole('region', { name: 'Now' })).toContainText('Goblin 1');
  await expect(phone.getByRole('region', { name: 'Turn order' }).getByRole('listitem')).toHaveCount(7);
  // Nothing the DM keeps hidden reaches the phone.
  await expect(phone.locator('body')).not.toContainText('HP');

  // ---- The player moves themselves up the order and goes prone ----
  const init = mine.getByRole('textbox', { name: 'Your initiative' });
  await init.fill('13');
  await init.press('Enter');
  const order = () => turnOrder(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await expect.poll(order).toEqual(['Goblin 1', 'Goblin 2', 'Aria', 'Dragon 1', 'Brom', 'Cass', 'Dain']);
  await expect(currentTurn(page)).toHaveAttribute('aria-label', 'Goblin 1');
  await expect(page.getByRole('textbox', { name: 'Initiative for Aria' })).toHaveValue('13');

  await mine.getByRole('button', { name: 'prone' }).click();
  await expect(row(page, 'Aria').getByLabel('Conditions')).toContainText('prone');
  await expect(mine.getByRole('button', { name: 'prone' })).toHaveAttribute('aria-pressed', 'true');

  // ---- Following the turn ----
  await next(page); // Goblin 2; Aria is up next
  await expect(phone.getByLabel('Up next')).toContainText('You');
  await next(page); // Aria
  await expect(phone.getByRole('region', { name: 'Now' })).toContainText('Your turn!');

  // ---- Reloading the phone keeps the code and the character ----
  await phone.reload();
  await expect(phone.getByRole('region', { name: 'Your character' })).toContainText('Aria');

  // ---- DM stops ----
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(phone.getByRole('status', { name: 'Connection' })).toContainText('The DM stopped sharing.');
});
