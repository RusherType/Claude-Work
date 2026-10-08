import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Shared e2e helpers. Flows that need a real backend run only where a local Supabase and its
// test mailbox are available (CI sets NEXT_PUBLIC_SUPABASE_URL and MAILPIT_URL).
export const mailpit = process.env.MAILPIT_URL;
export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && mailpit,
);

export async function latestLinkFor(
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

/** From any page that redirected to /sign-in, request a link for `email` and follow it. */
export async function signInFromSignInPage(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto(await latestLinkFor(request, email));
}

export function uniqueEmail(tag: string, project: string) {
  return `e2e-${tag}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
