import { expect, test } from "@playwright/test";
import { hasSupabase, signInFromSignInPage, uniqueEmail } from "./helpers";

// CD-004: create a workspace, invite a teammate by link, the teammate signs in and joins, and
// the owner changes their role. Needs a local Supabase (CI).
test.describe("workspaces and invitations", () => {
  test.skip(!hasSupabase, "needs a local Supabase (CI)");

  test("owner creates a workspace, invites a member who joins, then changes their role", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const ownerEmail = uniqueEmail("owner", testInfo.project.name);
    const memberEmail = uniqueEmail("member", testInfo.project.name);
    const company = `Acme ${testInfo.project.name} ${Date.now()}`;

    // Owner signs in and sees the empty state.
    await page.goto("/app");
    await signInFromSignInPage(page, request, ownerEmail);
    await expect(
      page.getByRole("heading", { name: /create your workspace/i }),
    ).toBeVisible();

    // Validation error, then create.
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Enter a workspace name.")).toBeVisible();
    await page.getByLabel("Company name").fill(company);
    await page.getByLabel("Home country").selectOption("IN");
    await page.getByLabel("I sell to US shoppers from abroad").check();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: `Welcome to ${company}` }),
    ).toBeVisible();

    // Team page: owner is listed; create an invitation link.
    await page.getByRole("link", { name: "Manage team" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    // The header hides the email on narrow screens; check the member list itself.
    await expect(
      page.getByRole("listitem").filter({ hasText: ownerEmail }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Invite as").selectOption("viewer");
    await page.getByRole("button", { name: "Create invitation" }).click();
    const link = await page.getByLabel("Invitation link").inputValue();
    expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
    await expect(page.getByText(`${memberEmail} · Viewer`)).toBeVisible();

    // The invitee opens the link in their own browser, signs in, and accepts.
    const other = await browser.newContext();
    const invitee = await other.newPage();
    await invitee.goto(link);
    await signInFromSignInPage(invitee, other.request, memberEmail);
    await expect(invitee).toHaveURL(/\/invite\/[0-9a-f]{64}$/);
    await invitee.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      invitee.getByRole("heading", { name: `Welcome to ${company}` }),
    ).toBeVisible();
    await expect(invitee.getByText(`Viewer · ${company}`)).toBeVisible();

    // The same link cannot be used again.
    await invitee.goto(link);
    await invitee.getByRole("button", { name: "Accept invitation" }).click();
    await expect(invitee.getByText(/no longer valid/)).toBeVisible();
    await other.close();

    // Owner sees the new viewer and makes them a member.
    await page.reload();
    const row = page.getByRole("listitem").filter({ hasText: memberEmail });
    await expect(row).toBeVisible();
    await row
      .getByLabel(`Role for ${memberEmail}`, { exact: true })
      .selectOption("member");
    await row
      .getByRole("button", { name: `Save role for ${memberEmail}` })
      .click();
    await expect(row.getByRole("status")).toContainText("Role updated");

    // The last owner cannot leave.
    page.once("dialog", (d) => d.accept());
    const me = page.getByRole("listitem").filter({ hasText: ownerEmail });
    await me.getByRole("button", { name: "Leave this workspace" }).click();
    await expect(me.getByRole("alert")).toContainText("at least one owner");
  });
});

test("the team page and invitations require sign-in", async ({ page }) => {
  await page.goto("/app/settings/team");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings%2Fteam$/);
  await page.goto(`/invite/${"a".repeat(64)}`);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite%2Fa{64}$/);
  await page.goto("/invite/not-a-token");
  await expect(page.getByText(/invitation link is not valid/)).toBeVisible();
});
