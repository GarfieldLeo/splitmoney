import { test, expect } from "./fixtures.js";

const SESSION_KEY = "splitmoney.selectedUserId";

test("login preserves 21- and 40-codepoint emoji names and rejects 41", async ({ page, appServer }) => {
  const twentyOne = "😀".repeat(21);
  const forty = "🧑".repeat(40);
  const fortyOne = "🐍".repeat(41);
  expect(Array.from(twentyOne)).toHaveLength(21);
  expect(Array.from(forty)).toHaveLength(40);
  expect(Array.from(fortyOne)).toHaveLength(41);

  await page.goto(appServer.url);
  const input = page.getByLabel("Your username");
  await input.fill(twentyOne);
  await expect(input).toHaveValue(twentyOne);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#account-name")).toHaveText(twentyOne);
  await page.reload();
  await expect(page.locator("#account-name")).toHaveText(twentyOne);

  await page.getByRole("button", { name: "Switch user" }).click();
  await page.getByLabel("Your username").fill(forty);
  await expect(page.getByLabel("Your username")).toHaveValue(forty);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#account-name")).toHaveText(forty);
  const selectedId = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(selectedId).toBeTruthy();

  await page.getByRole("button", { name: "Switch user" }).click();
  let loginRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/login")) loginRequests += 1;
  });
  await page.getByLabel("Your username").fill(fortyOne);
  await expect(page.getByLabel("Your username")).toHaveValue(fortyOne);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("Use no more than 40 Unicode characters for a username.");
  expect(loginRequests).toBe(0);
  const users = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
  expect(users.map((user) => user.username).sort()).toEqual([forty, twentyOne].sort());
});

test("People accepts 21/40 codepoint names, rejects 41, and counts phone codepoints", async ({ page, appServer }) => {
  const twentyOne = "😃".repeat(21);
  const forty = "🧑".repeat(40);
  const fortyOne = "🐍".repeat(41);
  const fortyPhone = "📞".repeat(40);
  const fortyOnePhone = "☎".repeat(41);

  await page.goto(appServer.url);
  await page.getByLabel("Your username").fill("Alice");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.goto(`${appServer.url}/#people`);
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username").fill(twentyOne);
  await page.getByLabel("Phone number (optional)").fill(fortyPhone);
  await expect(page.getByLabel("Username")).toHaveValue(twentyOne);
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("heading", { name: twentyOne, exact: true })).toBeVisible();
  await expect(page.getByText(fortyPhone, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${twentyOne}` }).click();
  await page.getByLabel("Username").fill(forty);
  await page.getByLabel("Phone number (optional)").fill(fortyOnePhone);
  await expect(page.getByLabel("Username")).toHaveValue(forty);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("Use no more than 40 Unicode characters for a phone number.");
  await expect(page.getByLabel("Username")).toHaveValue(forty);
  await expect(page.getByLabel("Phone number (optional)")).toHaveValue(fortyOnePhone);

  await page.getByLabel("Phone number (optional)").fill(fortyPhone);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: forty, exact: true })).toBeVisible();
  await expect(page.getByText(fortyPhone, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: forty, exact: true })).toBeVisible();
  await expect(page.getByText(fortyPhone, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username").fill(fortyOne);
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("alert")).toHaveText("Use no more than 40 Unicode characters for a username.");
  await expect(page.getByLabel("Username")).toHaveValue(fortyOne);
  const users = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
  expect(users.some((user) => user.username === fortyOne)).toBe(false);
});
