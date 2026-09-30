import { expect, test } from "@playwright/test";

test("landing page shows the promise, a formatted code and the legal note", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /know your us duty/i }),
  ).toBeVisible();
  await expect(page.getByText("6109.10.0012")).toBeVisible();
  await expect(page.getByText(/not a licensed customs broker/i)).toBeVisible();
});
