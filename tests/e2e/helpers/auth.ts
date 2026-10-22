import { expect, type Page } from "@playwright/test";

// Local Supabase captures auth emails in Mailpit (`supabase status` → MAILPIT_URL).
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function testEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@clearduty.test`;
}

async function latestLinkFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const href = /href="([^"]+)"/.exec(HTML)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link arrived for ${email}`);
}

/** Signs in through the real magic-link flow; ends on the page `next` points to. */
export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  // Sending goes through the local mail relay, which is slow under parallel runs
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15_000 });
  await page.goto(await latestLinkFor(email));
}

export async function createWorkspace(page: Page, name: string) {
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  await page.getByLabel("Company name").fill(name);
  await page.getByLabel("Home country").selectOption("IN");
  await page.getByText("I sell to US shoppers").click();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 15_000 });
}
