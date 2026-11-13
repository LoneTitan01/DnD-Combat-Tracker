import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  // Bestiary via JSON import (partial stat blocks are filled with defaults).
  await page.goto('#/bestiary');
  await page.locator('input[type=file]').setInputFiles({
    name: 'seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        { name: 'Goblin', cr: '1/4', size: 'Small' },
        { name: 'Owlbear', cr: '3', size: 'Large' },
        { name: 'Wolf', cr: '1/4' },
      ]),
    ),
  });
  await expect(page.getByRole('status')).toContainText('Imported 3');

  await page.goto('#/party');
  for (const name of ['Aria', 'Brom', 'Cass', 'Dain']) {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Level', exact: true }).fill('3');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByRole('textbox', { name: `Name for ${name}` })).toBeVisible();
  }
}

const count = (page: Page, name: string) => page.getByRole('textbox', { name: `Number of ${name}` });
const adjusted = (page: Page) => page.getByText('Adjusted XP').locator('..');

test('encounter builder: build, totals, difficulty, save, reopen, duplicate, tags, delete', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await seed(page);

  await page.goto('#/encounters');
  await page.getByRole('button', { name: 'New encounter' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Goblin Ambush');
  await page.getByRole('textbox', { name: /^Tags/ }).fill('Session 1');

  // Add from the bestiary picker; + and typed counts.
  await page.getByRole('button', { name: 'Add Goblin' }).click();
  await page.getByRole('button', { name: 'Add Goblin' }).click();
  await page.getByRole('button', { name: 'One more Goblin' }).click();
  await expect(count(page, 'Goblin')).toHaveValue('3');
  await count(page, 'Goblin').fill('4');
  await page.getByRole('searchbox', { name: 'Search the bestiary' }).fill('owl');
  await expect(page.getByRole('button', { name: 'Add Wolf' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Owlbear' }).click();

  // Live totals: 4×50 + 700 = 900; 5 monsters → ×2 = 1,800. Four level-3 PCs: deadly at 1,600.
  await expect(page.getByText('(5 total)')).toBeVisible();
  await expect(adjusted(page)).toContainText('1,800');
  await expect(page.getByText('×2', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Party thresholds')).toContainText('1,600');
  await expect(page.getByText('Difficulty:')).toContainText('deadly');

  // Preview against fewer players: a party under 3 steps the multiplier up to ×2.5.
  await page.getByRole('checkbox', { name: /Cass/ }).uncheck();
  await page.getByRole('checkbox', { name: /Dain/ }).uncheck();
  await expect(adjusted(page)).toContainText('2,250');
  await expect(page.getByLabel('Party thresholds')).toContainText('800');
  await page.getByRole('checkbox', { name: /Cass/ }).check();
  await page.getByRole('checkbox', { name: /Dain/ }).check();
  await expect(adjusted(page)).toContainText('1,800');

  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await expect(page).toHaveURL(/#\/encounters\/[^/]+$/);

  // Done when: reopens with the same creatures and counts.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Goblin Ambush');
  await expect(count(page, 'Goblin')).toHaveValue('4');
  await expect(count(page, 'Owlbear')).toHaveValue('1');
  await expect(page.getByRole('textbox', { name: /^Tags/ })).toHaveValue('Session 1');
  await expect(page.getByRole('button', { name: 'Save encounter' })).toBeDisabled();

  // Listed under its tag with a summary and difficulty.
  await page.getByRole('button', { name: 'Back' }).click();
  const session1 = page.getByRole('region', { name: 'Session 1' });
  await expect(session1).toContainText('Goblin Ambush');
  await expect(session1).toContainText('4× Goblin, Owlbear');
  await expect(session1).toContainText('deadly');

  // Duplicate, rename, change, retag.
  await session1.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Goblin Ambush (copy)');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Wolf Pack');
  await page.getByRole('button', { name: 'Remove Owlbear' }).click();
  await page.getByRole('button', { name: 'Remove Goblin' }).click();
  await page.getByRole('button', { name: 'Add Wolf' }).click();
  await page.getByRole('textbox', { name: /^Tags/ }).fill('Session 2');
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('region', { name: 'Session 2' })).toContainText('Wolf Pack');
  await expect(page.getByRole('region', { name: 'Session 1' })).toContainText('Goblin Ambush'); // original untouched

  // Filter by tag and search.
  await page.getByRole('combobox', { name: 'Tag' }).selectOption('Session 2');
  await expect(page.getByRole('region')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Tag' }).selectOption('');
  await page.getByRole('searchbox', { name: 'Search encounters' }).fill('goblin');
  await expect(page.getByText('Wolf Pack')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search encounters' }).fill('');

  // Unsaved changes prompt on cancel (auto-accepted here), and nothing is saved.
  await page.getByRole('link', { name: 'Wolf Pack' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Changed my mind');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: 'Wolf Pack' })).toBeVisible();

  // Delete.
  await page.getByRole('region', { name: 'Session 2' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Wolf Pack')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Goblin Ambush' })).toBeVisible();
  await expect(page.getByText('Wolf Pack')).toHaveCount(0);
});

test('encounters warn about deleted stat blocks', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await seed(page);
  await page.goto('#/encounters/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Owl trouble');
  await page.getByRole('button', { name: 'Add Owlbear' }).click();
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');

  await page.goto('#/bestiary');
  await page.getByRole('row', { name: /Owlbear/ }).getByRole('button', { name: 'Delete' }).click();
  // Delete looks up encounters before confirming; wait for it to finish before navigating away.
  await expect(page.getByRole('row', { name: /Owlbear/ })).toHaveCount(0);
  await page.goto('#/encounters');
  await expect(page.getByText('Uses 1 deleted stat block.')).toBeVisible();
});
