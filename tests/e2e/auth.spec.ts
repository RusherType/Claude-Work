import { expect, test, type APIRequestContext } from "@playwright/test";

// CD-003. The redirect tests run anywhere; the magic-link flow needs a local Supabase and its
// test mailbox (CI sets NEXT_PUBLIC_SUPABASE_URL and MAILPIT_URL after `supabase start`).
const mailpit = process.env.MAILPIT_URL;
const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && mailpit);

test("signed-out visitors to /app are sent to sign-in and come back after", async ({
  page,
}) => {
  await page.goto("/app/catalog?status=suggested");
  await expect(page).toHaveURL(
    /\/sign-in\?next=%2Fapp%2Fcatalog%3Fstatus%3Dsuggested$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: /sign in/i }),
  ).toBeVisible();
});

test("a callback link without a valid code cannot redirect off-site", async ({
  page,
}) => {
  await page.goto("/auth/callback?code=bogus&next=https://evil.example");
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});

test("the landing page links to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

async function latestLinkFor(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const search = await request.get(`${mailpit}/api/v1/search`, {
      params: { query: `to:"${email}"` },
    });
    const { messages = [] } = (await search.json()) as {
      messages?: { ID: string }[];
    };
    if (messages.length > 0) {
      const msg = await (
        await request.get(`${mailpit}/api/v1/message/${messages[0].ID}`)
      ).json();
      const body = `${msg.Text ?? ""}\n${msg.HTML ?? ""}`.replace(
        /&amp;/g,
        "&",
      );
      const link = body.match(
        /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/,
      );
      if (link) return link[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}

test.describe("magic link", () => {
  test.skip(!hasSupabase, "needs a local Supabase (CI)");

  test("signs in with an emailed link, lands on the requested page, and signs out", async ({
    page,
    request,
  }, testInfo) => {
    const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;

    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp$/);
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");

    await page.goto(await latestLinkFor(request, email));
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: /you're signed in/i }),
    ).toBeVisible();

    // A signed-in visitor to /sign-in goes straight to the app.
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/app$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp$/);
  });

  test("rejects an invalid email address", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });
});
