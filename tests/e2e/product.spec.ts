import { expect, test } from "@playwright/test";
import { e2eDatabaseUrl, withLocalDb } from "./db";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";

// CD-024: open a product from the catalog, correct its facts, and see a confirmed code become
// Outdated after an edit. Needs a local Supabase and its database (CI).
test.describe("product detail", () => {
  test.skip(
    !hasSupabase || !e2eDatabaseUrl,
    "needs a local Supabase and its database (CI)",
  );

  test("edits facts and marks a confirmed code Outdated", async ({
    page,
    request,
  }, testInfo) => {
    const sku = `TEE-${testInfo.project.name}-${Date.now()}`;
    await page.goto("/app");
    await signInFromSignInPage(
      page,
      request,
      uniqueEmail("product", testInfo.project.name),
    );
    await page.getByLabel("Company name").fill(`Product ${Date.now()}`);
    await page.getByLabel("Home country").selectOption("US");
    await page.getByLabel("I sell to US shoppers from abroad").check();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: /^Welcome to/ }),
    ).toBeVisible();

    await page.goto("/app/catalog/import");
    await page.getByLabel("CSV file").setInputFiles({
      name: "one.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`sku,title,origin_country\n${sku},Crew T-shirt,CN\n`),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Check rows" }).click();
    await page.getByRole("button", { name: "Import 1 product" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();

    await page.goto("/app/catalog");
    await page.getByRole("link", { name: "Crew T-shirt" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Crew T-shirt" }),
    ).toBeVisible();
    await expect(page.getByText("Not classified yet.")).toBeVisible();

    // A problem is reported on its field and what was typed stays.
    await page.getByLabel("Material 1", { exact: true }).fill("Cotton");
    await page.getByLabel("Material 1 share in percent").fill("120");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("between 0 and 100")).toBeVisible();
    await expect(page.getByLabel("Material 1", { exact: true })).toHaveValue(
      "Cotton",
    );
    await page.getByLabel("Material 1 share in percent").fill("100");
    await page.getByLabel("How it's made").fill("Knitted");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(page.getByLabel("How it's made")).toHaveValue("Knitted");

    // Give it a confirmed code (no UI for that until CD-041), then edit the facts again.
    await withLocalDb((db) =>
      db.query(
        `insert into public.classifications (workspace_id, product_id, code, status, is_current, confirmed_at)
         select workspace_id, id, '6109100012', 'confirmed', true, now()
         from public.products where sku = $1`,
        [sku],
      ),
    );
    await page.reload();
    await expect(page.getByText("6109.10.0012")).toBeVisible();
    await expect(page.getByText(/has a confirmed code/)).toBeVisible();
    await page.getByLabel("How it's made").fill("Woven");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Saved. The confirmed code is now Outdated and needs to be checked again.",
    );
    await expect(
      page.getByText("Outdated", { exact: true }).first(),
    ).toBeVisible();
  });
});
