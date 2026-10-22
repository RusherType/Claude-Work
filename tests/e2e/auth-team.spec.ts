import { expect, test } from "@playwright/test";
import { createWorkspace, signIn, testEmail } from "./helpers/auth";

// Needs the local Supabase stack (`supabase start`).

test("signed-out visitors are sent to sign-in and come back after the magic link", async ({
  page,
}) => {
  await page.goto("/app/settings/team");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings%2Fteam$/);

  await signIn(page, testEmail("owner"), "/app/settings/team");
  // No workspace yet, so the workspace guard sends the user to onboarding
  await expect(page).toHaveURL(/\/app\/onboarding$/);
});

test("a bad sign-in link shows a clear error", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
  ).toBeVisible();
});

test("owner creates a workspace, invites a member who accepts; sign-out ends the session", async ({
  page,
  browser,
}) => {
  test.slow(); // three browsers and five magic links
  const ownerEmail = testEmail("owner");
  const memberEmail = testEmail("member");
  const workspace = `Test Exports ${Date.now()}`;

  await signIn(page, ownerEmail);
  await createWorkspace(page, workspace);
  await expect(
    page.getByText("You are owner of this workspace."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Team" }).click();
  await page.getByLabel("Email", { exact: true }).fill(memberEmail);
  await page.getByLabel("Role").selectOption("member");
  await page.getByRole("button", { name: "Send invite" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await expect(
    page.getByRole("button", { name: `Revoke invite for ${memberEmail}` }),
  ).toBeVisible();

  // The member, in a separate browser, follows the link, signs in and accepts
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  const invitePath = new URL(link).pathname;
  await member.goto(invitePath);
  await expect(member).toHaveURL(/\/sign-in\?next=/);
  await signIn(member, memberEmail, invitePath);
  await expect(member).toHaveURL(new RegExp(`${invitePath}$`));
  await member.getByRole("button", { name: "Accept invite" }).click();
  await expect(
    member.getByRole("heading", { level: 1, name: workspace }),
  ).toBeVisible();
  await expect(
    member.getByText("You are member of this workspace."),
  ).toBeVisible();

  // Members can see the team but not manage it
  await member.getByRole("link", { name: "Team" }).click();
  await expect(
    member.getByRole("heading", { name: /Members \(2\)/ }),
  ).toBeVisible();
  await expect(member.getByRole("button", { name: "Send invite" })).toHaveCount(
    0,
  );

  // The link is single-use: a second account cannot reuse it
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, testEmail("other"), invitePath);
  await other.getByRole("button", { name: "Accept invite" }).click();
  await expect(
    other
      .getByRole("alert")
      .filter({ hasText: /already been used|different email/ }),
  ).toBeVisible();

  // Owner sees the member and the invite is no longer pending
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Members \(2\)/ }),
  ).toBeVisible();
  await expect(page.getByText("No pending invites.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp$/);

  await memberContext.close();
  await otherContext.close();
});

test("an invite only works for the invited address", async ({
  page,
  browser,
}) => {
  test.slow();
  await signIn(page, testEmail("owner"));
  await createWorkspace(page, `Wrong Email ${Date.now()}`);
  await page.getByRole("link", { name: "Team" }).click();
  await page.getByLabel("Email", { exact: true }).fill(testEmail("invitee"));
  await page.getByRole("button", { name: "Send invite" }).click();
  const invitePath = new URL(await page.getByLabel("Invite link").inputValue())
    .pathname;

  const context = await browser.newContext();
  const stranger = await context.newPage();
  await signIn(stranger, testEmail("stranger"), invitePath);
  await stranger.getByRole("button", { name: "Accept invite" }).click();
  await expect(
    stranger.getByRole("alert").filter({ hasText: "different email address" }),
  ).toBeVisible();
  await context.close();
});
