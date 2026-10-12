import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";

// CD-022: upload a CSV, map columns, see per-row problems, import, then re-import the same file.
// Needs a local Supabase (CI).
const CSV = [
  "Variant SKU,Title,Country of Origin,Cost per item,Tags",
  'TEE-1,"Crew T-shirt, black",CN,4.20,"cotton, menswear"',
  "MUG-1,Ceramic mug,china,$2.10,",
  "BAD-1,Mystery item,Atlantis,12,50",
  "TEE-1,Duplicate tee,CN,4.20,",
].join("\n");

async function upload(page: Page, name: string, text: string) {
  await page.getByLabel("CSV file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
  await page.getByRole("button", { name: "Continue" }).click();
}

async function newWorkspace(
  page: Page,
  request: APIRequestContext,
  tag: string,
  project: string,
) {
  await page.goto("/app");
  await signInFromSignInPage(page, request, uniqueEmail(tag, project));
  await page.getByLabel("Company name").fill(`Import ${Date.now()}`);
  await page.getByLabel("Home country").selectOption("US");
  await page.getByLabel("I sell to US shoppers from abroad").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome to/ }),
  ).toBeVisible();
  await page.goto("/app/catalog/import");
}

test.describe("CSV import", () => {
  test.skip(!hasSupabase, "needs a local Supabase (CI)");

  test("imports valid rows, reports problems per row, and updates on re-import", async ({
    page,
    request,
  }, testInfo) => {
    await newWorkspace(page, request, "import", testInfo.project.name);
    await expect(
      page.getByRole("heading", { name: "Import products" }),
    ).toBeVisible();

    // A file that is not CSV-shaped gets a plain error.
    await upload(page, "broken.csv", 'sku,title\n"never closed,x');
    // Next's route announcer is also role=alert, so match the text.
    await expect(page.getByText(/couldn't read this file/)).toBeVisible();

    // Columns from a Shopify-style export are matched automatically.
    await upload(page, "products.csv", CSV);
    await expect(
      page.getByRole("combobox", { name: "SKU (required)" }),
    ).toHaveValue("0");
    await expect(page.getByLabel("Country of origin")).toHaveValue("2");
    await page.getByRole("button", { name: "Check rows" }).click();

    await expect(page.getByRole("status")).toContainText("2 of 4 products");
    const problems = page.getByRole("table", { name: "Rows with problems" });
    await expect(problems.getByRole("row", { name: /^4 / })).toContainText(
      '"Atlantis" is not a country',
    );
    await expect(problems.getByRole("row", { name: /^5 / })).toContainText(
      "same SKU as line 2",
    );

    await page.getByRole("button", { name: "Import 2 products" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();
    await expect(page.getByTestId("import-added")).toHaveText("2");

    // Same file again: nothing new, nothing changed.
    await page.getByRole("button", { name: "Import another file" }).click();
    await upload(page, "products.csv", CSV);
    await page.getByRole("button", { name: "Check rows" }).click();
    await page.getByRole("button", { name: "Import 2 products" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible();
    await expect(page.getByTestId("import-added")).toHaveText("0");
    await expect(page.getByTestId("import-unchanged")).toHaveText("2");
  });

  test("imports 5,000 rows in under 60 seconds", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    await newWorkspace(page, request, "bulk", testInfo.project.name);
    const rows = Array.from(
      { length: 5000 },
      (_, i) =>
        `BULK-${i},"Cotton T-shirt ${i}, crew neck",100% cotton knit,CN,4.20`,
    );
    await upload(
      page,
      "bulk.csv",
      ["sku,title,description,origin_country,customs_value", ...rows].join(
        "\n",
      ),
    );
    await page.getByRole("button", { name: "Check rows" }).click();
    const start = Date.now();
    await page.getByRole("button", { name: "Import 5,000 products" }).click();
    await expect(page.getByText("Import finished.")).toBeVisible({
      timeout: 60_000,
    });
    expect(Date.now() - start).toBeLessThan(60_000);
    await expect(page.getByTestId("import-added")).toHaveText("5,000");
  });
});
