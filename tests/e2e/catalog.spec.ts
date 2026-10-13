import { expect, test } from "@playwright/test";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";

// CD-023: empty catalog, then an imported catalog with search, filters, paging and export.
// Needs a local Supabase (CI).
test.describe("catalog", () => {
  test.skip(!hasSupabase, "needs a local Supabase (CI)");

  test("lists imported products with search, filters and paging", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/app");
    await signInFromSignInPage(
      page,
      request,
      uniqueEmail("catalog", testInfo.project.name),
    );
    await page.getByLabel("Company name").fill(`Catalog ${Date.now()}`);
    await page.getByLabel("Home country").selectOption("US");
    await page.getByLabel("I sell to US shoppers from abroad").check();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: /^Welcome to/ }),
    ).toBeVisible();

    // Empty state points to the import.
    await page.goto("/app/catalog");
    await expect(page.getByText("No products yet.")).toBeVisible();

    // 60 products: 55 T-shirts from CN, 5 mugs from VN.
    const rows = Array.from({ length: 60 }, (_, i) =>
      i < 5
        ? `MUG-${i},Ceramic mug ${i},VN`
        : `TEE-${i},Cotton T-shirt ${i},CN`,
    );
    await page.goto("/app/catalog/import");
    await page.getByLabel("CSV file").setInputFiles({
      name: "catalog.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(["sku,title,origin_country", ...rows].join("\n")),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Check rows" }).click();
    await page.getByRole("button", { name: "Import 60 products" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();

    await page.goto("/app/catalog");
    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Showing" }),
    ).toHaveText("Showing 1–50 of 60");
    await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Showing" }),
    ).toHaveText("Showing 51–60 of 60");

    // Search and filters keep each other.
    await page.getByLabel("Search").fill("mug");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Showing" }),
    ).toHaveText("Showing 1–5 of 5");
    // Bulk select (on the 5 mugs) enables export; classification waits for the agent.
    await expect(
      page.getByRole("button", { name: "Classify selected" }),
    ).toBeDisabled();
    const exportButton = page.getByRole("button", {
      name: "Export selected (CSV)",
    });
    await expect(exportButton).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "Select Ceramic mug 0" })
      .first()
      .check();
    await expect(page.getByText("1 selected")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    expect((await downloadPromise).suggestedFilename()).toBe(
      "clearduty-catalog.csv",
    );
    await page.getByLabel("Origin").selectOption("CN");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(
      page.getByText("No products match these filters."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/app\/catalog$/);
    // The filter form shows the cleared filters, not the previous ones.
    await expect(page.getByLabel("Search")).toHaveValue("");
    await expect(page.getByLabel("Origin")).toHaveValue("");
    await page.getByLabel("Status").selectOption("unclassified");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Showing" }),
    ).toHaveText("Showing 1–50 of 60");
  });
});
