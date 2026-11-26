import { expect, type Page } from '@playwright/test';

export const bestiary = [
  { name: 'Goblin', cr: '1/4', size: 'Small', maxHP: 7, hitDice: { count: 2, dieType: 'd6', bonus: 0 }, abilities: { dex: 14 } },
  {
    name: 'Dragon',
    cr: '5',
    size: 'Large',
    maxHP: 50,
    hitDice: { count: 6, dieType: 'd10', bonus: 17 },
    abilities: { dex: 10 },
    damageResistances: ['slashing'],
    damageVulnerabilities: ['cold'],
    damageImmunities: ['fire'],
    actions: [
      { name: 'Bite', description: 'Melee attack.' },
      { name: 'Fire Breath', description: 'Cone of fire.', recharge: { mode: 'threshold', minRoll: 5 } },
    ],
  },
];

/** Test spells with placeholder text. The app ships none, so tests that link spells import these first. */
export const testSpells = [
  { name: 'Fireball', level: 3, school: 'evocation', range: '150 feet', description: 'Test spell: a burst of flame.' },
  { name: 'Fire Bolt', level: 0, school: 'evocation', range: '120 feet', description: 'Test spell: a mote of fire.' },
  { name: 'Shield', level: 1, school: 'abjuration', castingTime: 'Reaction', range: 'Self', description: 'Test spell: a ward.' },
  { name: 'Counterspell', level: 3, school: 'abjuration', castingTime: 'Reaction', range: '60 feet', description: 'Test spell: interrupts a casting.' },
];

export async function addTestSpells(page: Page) {
  await page.goto('#/spells');
  await page.locator('input[type=file]').setInputFiles({
    name: 'spells.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(testSpells)),
  });
  await expect(page.getByRole('status')).toContainText(`Imported ${testSpells.length} new spells`);
}

export async function seed(page: Page) {
  await page.goto('#/bestiary');
  await page.locator('input[type=file]').setInputFiles({
    name: 'seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bestiary)),
  });
  await expect(page.getByRole('status')).toContainText('Imported 2');

  await page.goto('#/party');
  for (const name of ['Aria', 'Brom', 'Cass', 'Dain']) {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Level', exact: true }).fill('3');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
  }

  await page.goto('#/encounters/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Dragon and friends');
  await page.getByRole('button', { name: 'Add Goblin' }).click();
  await page.getByRole('button', { name: 'Add Goblin' }).click();
  await page.getByRole('button', { name: 'Add Dragon' }).click();
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
}

export const turnOrder = (page: Page) => page.getByRole('list', { name: 'Turn order' });
export const currentTurn = (page: Page) => turnOrder(page).locator('[aria-current="step"]');
export const row = (page: Page, name: string) => turnOrder(page).getByRole('listitem', { name, exact: true });
export const next = (page: Page) => page.getByRole('button', { name: 'Next turn →' }).click();
export const hp = (page: Page, name: string) => turnOrder(page).getByRole('meter', { name: `${name} HP` });

export async function select(page: Page, name: string) {
  await row(page, name).getByText(name).first().click();
  await expect(page.getByRole('textbox', { name: `Amount for ${name}` })).toBeFocused();
}

export async function damage(page: Page, name: string, amount: number, button: 'Normal' | 'Resisted ½' | 'Vulnerable ×2') {
  await select(page, name);
  await page.getByRole('textbox', { name: `Amount for ${name}` }).fill(String(amount));
  await page.getByRole('button', { name: button, exact: true }).click();
}

export async function setInitiative(page: Page, name: string, value: number) {
  const box = page.getByRole('textbox', { name: `Initiative for ${name}` });
  await box.fill(String(value));
  await box.press('Enter');
  await expect(box).toHaveValue(String(value));
}
