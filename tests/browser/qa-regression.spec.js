import { test, expect } from "./fixtures.js";

test("group balance labels preserve aggregate cents", async ({ page, appServer }) => {
  await page.goto(appServer.url);
  await page.getByLabel("Your username").fill("Alice");
  await page.route("**/api/balances", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.users[0].net = "100000000000000.01";
    await route.fulfill({ response, json: data });
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".overview-person-row .overview-net")).toHaveText("Should receive $100,000,000,000,000.01");
});

test("USD formatting preserves cents in large aggregate balances", async ({ page, appServer }) => {
  await page.goto(appServer.url);
  const formatted = await page.evaluate(async () => {
    const { formatUsd } = await import("/static/js/ui.js");
    return ["100000000000000.01", "-100000000000000.01", "-0.01", "0.00", "00012.3"].map(formatUsd);
  });
  expect(formatted).toEqual([
    "$100,000,000,000,000.01", "-$100,000,000,000,000.01", "-$0.01", "$0.00", "$12.30",
  ]);
});

test("Unicode usernames up to 40 characters work in login and People", async ({ page, appServer }) => {
  const name = "😀".repeat(21);
  await page.goto(appServer.url);
  await page.getByLabel("Your username").fill(name);
  await expect(page.getByLabel("Your username")).toHaveValue(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#account-name")).toHaveText(name);
  await page.goto(`${appServer.url}/#people`);
  await page.getByRole("button", { name: "Add person" }).click();
  const second = "😃".repeat(21);
  await page.getByLabel("Username").fill(second);
  await expect(page.getByLabel("Username")).toHaveValue(second);
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
});

test("a pending person save does not discard another editor's draft", async ({ page, appServer }) => {
  await page.goto(appServer.url);
  await page.getByLabel("Your username").fill("Alice");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "People" }).click();
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username", { exact: true }).fill("Bob");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted;
  const started = new Promise((resolve) => { intercepted = resolve; });
  await page.route("**/api/users", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    intercepted();
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Create person" }).click();
  await started;
  const addPerson = page.getByRole("button", { name: "Add person" });
  if (await addPerson.isDisabled()) {
    // Preventing a second editor is a valid alternative to preserving its draft.
    await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
    await expect(addPerson).toBeEnabled();
    const people = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
    expect(people.map((person) => person.username).sort()).toEqual(["Alice", "Bob"]);
    return;
  }
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username", { exact: true }).fill("Cara");
  const userRead = page.waitForResponse((response) => response.url().endsWith("/api/users") && response.request().method() === "GET");
  release();
  await userRead;
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("Cara");
});

test("a pending expense save does not discard another editor's draft", async ({ page, appServer }) => {
  await page.goto(appServer.url);
  await page.getByLabel("Your username").fill("Alice");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Expenses" }).click();
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("10.00");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted;
  const started = new Promise((resolve) => { intercepted = resolve; });
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    intercepted();
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Create expense" }).click();
  await started;
  const addExpense = page.getByRole("button", { name: "Add expense" });
  if (await addExpense.isDisabled()) {
    await expect(page.getByLabel("Amount", { exact: true })).toBeDisabled();
    release();
    await expect(page.locator(".expense-card")).toHaveCount(1);
    await expect(addExpense).toBeEnabled();
    const expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
    expect(expenses.map((expense) => expense.amount)).toEqual(["10.00"]);
    return;
  }
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("25.00");
  const balanceRead = page.waitForResponse((response) => response.url().endsWith("/api/balances"));
  release();
  await balanceRead;
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25.00");
});
