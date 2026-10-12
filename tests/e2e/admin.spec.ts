import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { totp } from "../support/totp";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";

// CD-014: a platform admin sets up an authenticator, then drafts, publishes and end-dates a fee.
// Needs a local Supabase (CI) and its database URL, used only to make the test user an admin.
const dbUrl = process.env.E2E_DATABASE_URL;

async function makeAdmin(email: string) {
  const host = new URL(dbUrl!).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("E2E_DATABASE_URL must be a local database");
  }
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  try {
    await db.query(
      "update public.profiles set is_platform_admin = true where id = (select id from auth.users where email = $1)",
      [email],
    );
  } finally {
    await db.end();
  }
}

test.describe("admin editors", () => {
  test.skip(
    !hasSupabase || !dbUrl,
    "needs a local Supabase and its database (CI)",
  );

  test("admin with a second factor drafts, publishes and end-dates a fee", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("admin", testInfo.project.name);
    await page.goto("/app");
    await signInFromSignInPage(page, request, email);
    await expect(page).toHaveURL(/\/app$/);

    // Not an admin yet: the page does not exist for them.
    await page.goto("/app/admin");
    await expect(page.getByText("This page could not be found")).toBeVisible();

    await makeAdmin(email);
    await page.goto("/app/admin");
    await expect(
      page.getByRole("heading", { name: "Confirm it's you" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Set up an authenticator app" })
      .click();
    const secret = (await page
      .getByTestId("totp-secret")
      .textContent())!.trim();
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/That code didn't work/)).toBeVisible();
    await page.getByLabel("6-digit code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(
      page.getByRole("heading", { name: "Reference data" }),
    ).toBeVisible();

    // Draft a fee; the form reports problems per field.
    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Fees" })
      .click();
    await page.getByRole("link", { name: "New fee" }).click();
    await page.getByLabel("Fee").selectOption("informal_entry_limit");
    await page.getByLabel("Flat amount (USD)").fill("2500.00");
    await page.getByLabel("Effective from").fill("2026-01-01");
    await page
      .getByLabel("Notes")
      .fill(`e2e ${testInfo.project.name} ${Date.now()}`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByText("Use an https link to the source."),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Source (required)" })
      .fill("https://www.cbp.gov/trade/basic-import-export");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("heading", { name: "Draft fee" }),
    ).toBeVisible();

    // Publish (with confirmation), then end-date it.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("heading", { name: "Fee", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await page.getByLabel("End date (last day it applies)").fill("2026-12-31");
    await page.getByRole("button", { name: "Set end date" }).click();
    await expect(page.getByText(/Ends 2026-12-31/)).toBeVisible();

    await page.getByRole("link", { name: "Change log" }).click();
    await expect(
      page.getByRole("table", { name: /Latest 200 changes/ }),
    ).toContainText("Fee");
  });
});
