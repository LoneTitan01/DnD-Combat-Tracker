import { expect, test } from "@playwright/test";
import { addTestSpells, row } from "./helpers";

test("spell slots: a stat block tracks slots instead of per-spell uses in combat", async ({
  page,
}) => {
  await addTestSpells(page);
  // ---- Stat block: link spells, switch to spell slots, set 4 × 1st and 2 × 3rd ----
  await page.goto("#/bestiary/new");
  await page.getByLabel("Name", { exact: true }).fill("Archmage");
  const find = page.getByRole("searchbox", { name: "Find a spell to link" });
  await find.fill("fireball");
  await page.getByRole("button", { name: "Link Fireball" }).click();
  await find.fill("shield");
  await page.getByRole("button", { name: /^Link Shield\s*1st/ }).click();
  await find.fill("fire bolt");
  await page.getByRole("button", { name: /^Link Fire Bolt/ }).click();

  const linked = page.getByRole("list", { name: "Linked spells" });
  const fireball = linked.getByRole("listitem").filter({ hasText: "Fireball" });
  await fireball.getByRole("checkbox", { name: "Limited uses" }).check();

  const resource = page.getByRole("group", { name: "Track spells by" });
  await expect(resource.getByRole("button", { name: "Uses per spell" })).toHaveAttribute("aria-pressed", "true");
  await resource.getByRole("button", { name: "Spell slots" }).click();
  await expect(resource.getByRole("button", { name: "Spell slots" })).toHaveAttribute("aria-pressed", "true");
  // Per-spell limits are hidden while tracking slots.
  await expect(fireball.getByRole("checkbox", { name: "Limited uses" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "1st-level slots" }).fill("4");
  await page.getByRole("textbox", { name: "3rd-level slots" }).fill("2");
  await page.getByRole("button", { name: "Save stat block" }).click();
  await expect(page.getByRole("heading", { name: "Archmage", level: 2 })).toBeVisible();

  // ---- Encounter and combat ----
  await page.goto("#/encounters/new");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Archmage fight");
  await page.getByRole("button", { name: "Add Archmage" }).click();
  await page.getByRole("button", { name: "Save encounter" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("button", { name: "Stage" }).click();
  await page.getByRole("button", { name: "Start combat…" }).click();
  await page.getByRole("button", { name: "Roll for initiative!" }).click();

  await row(page, "Archmage 1").click();
  // Slots replace the per-spell tracker.
  await expect(page.getByRole("region", { name: "Spell uses" })).toHaveCount(0);
  const slots = page.getByRole("region", { name: "Spell slots" });
  const first = slots.getByRole("group", { name: /^1st-level/ });
  const third = slots.getByRole("group", { name: /^3rd-level/ });
  await expect(first).toHaveAccessibleName("1st-level slots: 4 of 4 left");
  await expect(first).toContainText("Shield");
  await expect(third).toHaveAccessibleName("3rd-level slots: 2 of 2 left");
  await expect(third).toContainText("Fireball");
  await expect(slots.getByRole("group", { name: /^2nd-level/ })).toHaveCount(0);
  await expect(slots).toContainText("Cantrips (at will): Fire Bolt");

  await third.getByRole("button", { name: "Use a 3rd-level slot" }).click();
  await third.getByRole("button", { name: "Use a 3rd-level slot" }).click();
  await expect(third).toHaveAccessibleName("3rd-level slots: 0 of 2 left");
  await expect(third.getByRole("button", { name: "Use a 3rd-level slot" })).toBeDisabled();
  const log = page.getByRole("list", { name: "Combat log" });
  await expect(log).toContainText("Archmage 1 uses a 3rd-level spell slot (2 used)");

  await third.getByRole("button", { name: "Give back a 3rd-level slot" }).click();
  await expect(third).toHaveAccessibleName("3rd-level slots: 1 of 2 left");
  await expect(log).toContainText("Archmage 1: 3rd-level spell slot given back (1 used)");

  await page.reload();
  await row(page, "Archmage 1").click();
  await expect(
    page.getByRole("region", { name: "Spell slots" }).getByRole("group", { name: /^3rd-level/ }),
  ).toHaveAccessibleName("3rd-level slots: 1 of 2 left");
});
