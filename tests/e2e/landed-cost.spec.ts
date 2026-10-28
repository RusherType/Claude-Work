import { expect, test } from "@playwright/test";
import { e2eDatabaseUrl, withLocalDb } from "./db";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";
import { seedTariff } from "./tariff";

// CD-051: price 100 T-shirts from China by express, see each figure with its source, find a
// formal entry goes to review without an MPF row, save the quote and download its PDF.
// Hand-worked: $420.00 value; 16.5% duty $69.30; Section 301 7.5% $31.50; informal MPF $2.69;
// landed cost $523.49.

test.describe("landed cost", () => {
  test.skip(
    !hasSupabase || !e2eDatabaseUrl,
    "needs a local Supabase and its database (CI)",
  );

  test("prices, saves and downloads a quote", async ({
    page,
    request,
  }, testInfo) => {
    const sku = `LC-${testInfo.project.name}-${Date.now()}`;
    await page.goto("/app");
    await signInFromSignInPage(
      page,
      request,
      uniqueEmail("landed", testInfo.project.name),
    );
    await page.getByLabel("Company name").fill(`Landed ${Date.now()}`);
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
      buffer: Buffer.from(
        `sku,title,origin_country,customs_value,currency\n${sku},Crew T-shirt,CN,4.20,USD\n`,
      ),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Check rows" }).click();
    await page.getByRole("button", { name: "Import 1 product" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();

    await seedTariff();
    await withLocalDb((db) =>
      db.query(
        `insert into public.classifications
           (workspace_id, product_id, code, status, confirmed_at)
         select workspace_id, id, '6109100012', 'confirmed', now()
         from public.products where sku = $1`,
        [sku],
      ),
    );

    await page.goto("/app/landed-cost");
    await expect(page.getByText("No quotes yet.")).toBeVisible();
    await page.getByLabel("Find products").fill(sku);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Add Crew T-shirt" }).click();
    // Origin and value come from the product.
    await expect(page.getByLabel("Country of origin")).toHaveValue("CN");
    await expect(
      page.getByLabel("Value per item of Crew T-shirt, in USD"),
    ).toHaveValue("4.20");
    await page.getByLabel("Quantity of Crew T-shirt").fill("100");
    await page.getByLabel("How it ships").selectOption("express");
    await page.getByRole("button", { name: "Calculate" }).click();

    await expect(page.getByTestId("landed-cost-total")).toHaveText("$523.49");
    const line = page.getByRole("article", { name: "Crew T-shirt" });
    await expect(line).toContainText("$69.30");
    await expect(line).toContainText("Section 301");
    await expect(line).toContainText("$31.50");
    await expect(line).toContainText("In force from 2026-01-02");
    await expect(
      page.getByText("Shipment fees (informal entry)"),
    ).toBeVisible();

    // Changing an input marks the figures stale; a formal entry with no MPF row needs review.
    await page.getByLabel("Quantity of Crew T-shirt").fill("1000");
    await expect(page.getByText(/You changed the quote/)).toBeVisible();
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText(/^Needs review:/)).toBeVisible();
    await expect(page.getByText("Shipment fees (formal entry)")).toBeVisible();

    // A bad value is reported on its field.
    await page
      .getByLabel("Value per item of Crew T-shirt, in USD")
      .fill("4.205");
    await page.getByRole("button", { name: /Calculate/ }).click();
    await expect(page.getByText("A value like 4.20.")).toBeVisible();

    await page
      .getByLabel("Value per item of Crew T-shirt, in USD")
      .fill("4.20");
    await page.getByLabel("Quantity of Crew T-shirt").fill("100");
    await page.getByRole("button", { name: /Calculate/ }).click();
    await expect(page.getByTestId("landed-cost-total")).toHaveText("$523.49");

    await page.getByLabel("Quote name").fill("November order");
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(
      page.getByRole("heading", { name: "November order" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Quote saved.");
    await expect(page.getByTestId("landed-cost-total")).toHaveText("$523.49");

    const href = await page
      .getByRole("link", { name: "Download PDF" })
      .getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await page.getByRole("link", { name: "← Landed cost" }).click();
    await expect(
      page
        .getByRole("complementary", { name: "Saved quotes" })
        .getByRole("link", { name: "November order" }),
    ).toBeVisible();
  });
});
