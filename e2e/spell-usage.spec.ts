import { expect, test } from "@playwright/test";
import { addTestSpells, row } from "./helpers";

test("spell usage: limit a linked spell, then spend and give back uses in combat", async ({
  page,
}) => {
  await addTestSpells(page);
  // ---- Stat block: link Fireball and limit it to 2 per long rest ----
  await page.goto("#/bestiary/new");
  await page.getByLabel("Name", { exact: true }).fill("Mage");
  await page
    .getByRole("searchbox", { name: "Find a spell to link" })
    .fill("fireball");
  await page.getByRole("button", { name: "Link Fireball" }).click();
  await page
    .getByRole("searchbox", { name: "Find a spell to link" })
    .fill("shield");
  await page.getByRole("button", { name: /^Link Shield\s*1st/ }).click();
  const linked = page.getByRole("list", { name: "Linked spells" });
  const fireball = linked.getByRole("listitem").filter({ hasText: "Fireball" });
  await expect(
    fireball.getByRole("textbox", { name: "Uses of Fireball" }),
  ).toBeHidden();
  await fireball.getByRole("checkbox", { name: "Limited uses" }).check();
  await fireball.getByRole("textbox", { name: "Uses of Fireball" }).fill("2");
  await expect(
    fireball.getByRole("combobox", { name: "Fireball refreshes on" }),
  ).toHaveValue("long");
  await fireball
    .getByRole("combobox", { name: "Fireball refreshes on" })
    .selectOption("short");
  await fireball
    .getByRole("combobox", { name: "Fireball refreshes on" })
    .selectOption("long");
  await page.getByRole("button", { name: "Save stat block" }).click();
  await expect(
    page.getByRole("heading", { name: "Mage", level: 2 }),
  ).toBeVisible();

  // ---- Encounter and combat ----
  await page.goto("#/encounters/new");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Mage fight");
  await page.getByRole("button", { name: "Add Mage" }).click();
  await page.getByRole("button", { name: "Save encounter" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("button", { name: "Stage" }).click();
  await page.getByRole("button", { name: "Start combat…" }).click();
  await page.getByRole("button", { name: "Roll for initiative!" }).click();

  // The tracker lives in the side panel next to the stat block, not on the initiative row.
  // Only the limited spell gets a tracker; Shield is at will.
  const mage = row(page, "Mage 1");
  await expect(mage).toContainText("Mage");
  await expect(mage.getByRole("group", { name: /^Fireball/ })).toHaveCount(0);
  await mage.click();
  const uses = page.getByRole("region", { name: "Spell uses" });
  await expect(uses.getByRole("group", { name: /^Shield/ })).toHaveCount(0);
  const chip = uses.getByRole("group", { name: /^Fireball/ });
  await expect(chip).toHaveAccessibleName(
    "Fireball: 2 of 2 uses left per long rest",
  );
  await expect(
    chip.getByRole("button", { name: "Give back a use of Fireball" }),
  ).toBeDisabled();

  await chip.getByRole("button", { name: "Cast Fireball" }).click();
  await chip.getByRole("button", { name: "Cast Fireball" }).click();
  await expect(chip).toHaveAccessibleName(
    "Fireball: 0 of 2 uses left per long rest",
  );
  await expect(
    chip.getByRole("button", { name: "Cast Fireball" }),
  ).toBeDisabled();
  const log = page.getByRole("list", { name: "Combat log" });
  await expect(log).toContainText("Mage 1 casts Fireball (2 used)");

  // A mistaken cast: give the use back.
  await chip
    .getByRole("button", { name: "Give back a use of Fireball" })
    .click();
  await expect(chip).toHaveAccessibleName(
    "Fireball: 1 of 2 uses left per long rest",
  );
  await expect(log).toContainText("Mage 1: Fireball use taken back (1 used)");

  // Undo in the log works too, and it all survives a reload.
  await log
    .getByRole("listitem")
    .first()
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(chip).toHaveAccessibleName(
    "Fireball: 0 of 2 uses left per long rest",
  );
  await page.reload();
  await row(page, "Mage 1").click();
  await expect(
    page
      .getByRole("region", { name: "Spell uses" })
      .getByRole("group", { name: /^Fireball/ }),
  ).toHaveAccessibleName("Fireball: 0 of 2 uses left per long rest");
});
