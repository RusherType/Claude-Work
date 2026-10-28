import { expect, test, type Page } from "@playwright/test";
import { e2eDatabaseUrl, withLocalDb } from "./db";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";
import { REVISION, seedTariff } from "./tariff";

// CD-040 to CD-042: work through the review queue with the keyboard (answer a question, confirm a
// suggestion), see the evidence on the card, then override a code on the product page. The agent
// is not built yet, so its output is seeded straight into the local database (CI).

async function seedAgentOutput(
  skuSuggested: string,
  skuQuestion: string,
  skuReview: string,
) {
  await withLocalDb(async (db) => {
    await db.query(
      `insert into public.classifications
         (workspace_id, product_id, code, status, confidence, reasoning, gri_path, alternatives,
          citations, tariff_revision_id, created_at)
       select workspace_id, id, '6109100012', 'suggested', 0.92,
         'A knitted cotton T-shirt for men falls in heading 6109 by GRI 1. It is all white, so the statistical suffix for white T-shirts applies. The fabric is knitted jersey, not woven, which rules out chapter 62. Cotton is the main fibre by weight.',
         '["GRI 1", "GRI 6"]',
         '[{"code": "6109100040", "why": "For T-shirts that are not all white"}]',
         '[{"kind": "ruling", "number": "N300100", "note": "Same garment"}, {"kind": "note", "ref": "Chapter 61 note 9"}]',
         $2, now() - interval '1 hour'
       from public.products where sku = $1`,
      [skuSuggested, REVISION],
    );
    await db.query(
      `insert into public.classifications (workspace_id, product_id, status)
       select workspace_id, id, 'needs_answer' from public.products where sku = $1`,
      [skuQuestion],
    );
    await db.query(
      `insert into public.classifications
         (workspace_id, product_id, code, status, confidence, tariff_revision_id)
       select workspace_id, id, '6109100040', 'in_review', 0.45, $2
       from public.products where sku = $1`,
      [skuReview, REVISION],
    );
    await db.query(
      `insert into public.agent_questions (workspace_id, product_id, question, options)
       select workspace_id, id, 'Is the fabric knitted or woven?', '["Knitted", "Woven"]'
       from public.products where sku = $1`,
      [skuQuestion],
    );
  });
}

const card = (page: Page) =>
  page.getByRole("complementary", { name: "Tariff code" });

test.describe("review queue", () => {
  test.skip(
    !hasSupabase || !e2eDatabaseUrl,
    "needs a local Supabase and its database (CI)",
  );

  test("answers, confirms and overrides codes", async ({
    page,
    request,
  }, testInfo) => {
    const run = `${testInfo.project.name}-${Date.now()}`;
    const teeSku = `TEE-${run}`;
    const mugSku = `MUG-${run}`;
    const sockSku = `SOCK-${run}`;
    await page.goto("/app");
    await signInFromSignInPage(
      page,
      request,
      uniqueEmail("review", testInfo.project.name),
    );
    await page.getByLabel("Company name").fill(`Review ${Date.now()}`);
    await page.getByLabel("Home country").selectOption("US");
    await page.getByLabel("I sell to US shoppers from abroad").check();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: /^Welcome to/ }),
    ).toBeVisible();

    // Empty state first.
    await page.goto("/app/review");
    await expect(page.getByText("Nothing to review.")).toBeVisible();

    await page.goto("/app/catalog/import");
    await page.getByLabel("CSV file").setInputFiles({
      name: "three.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `sku,title,origin_country\n${teeSku},Crew T-shirt,CN\n${mugSku},Knit cup cosy,IN\n${sockSku},Printed tee,VN\n`,
      ),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Check rows" }).click();
    await page.getByRole("button", { name: "Import 3 products" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();

    await seedTariff();
    await seedAgentOutput(teeSku, mugSku, sockSku);

    // Questions come first. Q focuses the first answer; choosing it moves on.
    await page.goto("/app/review");
    await expect(
      page.getByRole("link", { name: /Review queue/ }),
    ).toContainText("3");
    await expect(page.getByText("1 of 3")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Knit cup cosy" }),
    ).toBeVisible();
    await expect(
      page.getByText("Is the fabric knitted or woven?"),
    ).toBeVisible();
    await page.keyboard.press("q");
    await expect(page.getByRole("button", { name: "Knitted" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Answer saved.");

    // Low confidence next; J and K move through the queue.
    await expect(page.getByText("1 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Printed tee" }),
    ).toBeVisible();
    await expect(card(page)).toContainText(
      "Low confidence, needs a closer look",
    );
    await page.keyboard.press("j");
    await expect(page.getByText("2 of 2")).toBeVisible();
    await page.keyboard.press("k");
    await expect(page.getByText("1 of 2")).toBeVisible();
    await page.keyboard.press("j");

    // The suggestion, with its evidence.
    await expect(page.getByText("2 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Crew T-shirt" }),
    ).toBeVisible();
    await expect(card(page)).toContainText("Suggested, not confirmed");
    await expect(card(page)).toContainText("92% sure");
    await expect(
      page.getByRole("navigation", {
        name: "Where this code sits in the tariff",
      }),
    ).toContainText("Of cotton");
    await page.getByRole("button", { name: "Show all reasoning" }).click();
    await expect(card(page)).toContainText("Cotton is the main fibre");
    await expect(card(page)).toContainText("Rules applied: GRI 1, GRI 6");
    await expect(card(page)).toContainText("6109.10.0040");
    await page.getByRole("button", { name: "Rulings (1)" }).click();
    const drawer = page.getByRole("dialog", { name: "Rulings cited" });
    await expect(drawer).toContainText("men's cotton T-shirt");
    await expect(
      drawer.getByRole("link", { name: /Read ruling N300100/ }),
    ).toHaveAttribute("href", "https://rulings.cbp.gov/ruling/N300100");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // A confirms and moves on; E opens the product, with a way back to the queue.
    await page.keyboard.press("a");
    await expect(page.getByRole("status")).toHaveText("Confirmed.");
    await expect(page.getByText("1 of 1")).toBeVisible();
    await page.keyboard.press("e");
    await expect(page).toHaveURL(/\/app\/catalog\/[0-9a-f-]{36}\?from=review$/);
    await expect(
      page.getByRole("heading", { name: "Printed tee" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "← Review queue" }).click();
    await expect(page.getByText("1 of 1")).toBeVisible();

    // The shortcuts can be turned off (and stay off). Focus leaves the checkbox first, since
    // keys typed into a form control are ignored anyway.
    await page.getByLabel("Keyboard shortcuts").uncheck();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press("e");
    // The same key navigated above; give a navigation, if any, time to start.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/app\/review/);
    await expect(page.getByText("1 of 1")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Keyboard shortcuts")).not.toBeChecked();
    await page.getByLabel("Keyboard shortcuts").check();

    // The chips everywhere say Confirmed.
    await page.goto(`/app/catalog?q=${teeSku}`);
    // A table on desktop, stacked cards on a phone.
    await expect(
      page.getByRole("table").or(page.getByRole("list", { name: "Products" })),
    ).toContainText("Confirmed");

    // Override on the product page: a bad code is reported on its field, then a good one saves.
    await page.getByRole("link", { name: "Crew T-shirt" }).first().click();
    await expect(card(page)).toContainText("Confirmed by");
    await page.getByRole("button", { name: "Use a different code" }).click();
    await page.getByLabel("HTS code (10 digits)").fill("6109.10");
    await page.getByLabel("Your reason").fill("It has a printed logo");
    await page.getByRole("button", { name: "Save my code" }).click();
    await expect(card(page)).toContainText("Enter all 10 digits");
    await expect(page.getByLabel("Your reason")).toHaveValue(
      "It has a printed logo",
    );
    await page.getByLabel("HTS code (10 digits)").fill("6109.10.0040");
    await page.getByRole("button", { name: "Save my code" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your code is saved and confirmed.",
    );
    await expect(card(page)).toContainText("Set by your team");
    await expect(card(page)).toContainText("It has a printed logo");
    await card(page).getByText("Earlier codes (1)").click();
    await expect(card(page)).toContainText("6109.10.0012");
  });
});
