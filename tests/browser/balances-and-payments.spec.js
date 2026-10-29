import { test, expect } from "./fixtures.js";

async function signIn(page, baseUrl, username = "Alice") {
  await page.goto(baseUrl + "/");
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
}

async function createUser(page, baseUrl, username) {
  const response = await page.request.post(baseUrl + "/api/users", { data: { username } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createExpense(page, baseUrl, { payerId, targetUserIds = null, amount }) {
  const response = await page.request.post(baseUrl + "/api/expenses", {
    data: { payer_id: payerId, target_user_ids: targetUserIds, amount },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createSettlement(page, baseUrl, { payerId, recipientId, amount }) {
  const response = await page.request.post(baseUrl + "/api/settlements", {
    data: { payer_id: payerId, target_user_id: recipientId, amount },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function openPayments(page, baseUrl) {
  await page.goto(baseUrl + "/#payments");
  await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
}

function personRow(page, userId) {
  return page.locator('[data-overview-user="' + userId + '"]');
}

test("overview shows the exact three-person balances and suggestions; cancel is read-only and recording settles the group", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  const cara = await createUser(page, appServer.url, "Cara");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "60.00" });
  await createExpense(page, appServer.url, { payerId: bob.id, amount: "30.00" });
  await createSettlement(page, appServer.url, { payerId: bob.id, recipientId: aliceId, amount: "15.00" });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.locator("#overview-personal-heading")).toHaveText("You should receive $15.00");
  await expect(page.locator(".overview-total-value")).toHaveText("$90.00");
  await expect(personRow(page, aliceId).locator(".overview-net")).toHaveText("Should receive $15.00");
  await expect(personRow(page, bob.id).locator(".overview-net")).toHaveText("Should receive $15.00");
  await expect(personRow(page, cara.id).locator(".overview-net")).toHaveText("Should pay $30.00");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("Expense paid");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("$60.00");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("Expense share");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("$30.00");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("Payments received");
  await expect(personRow(page, aliceId).locator(".overview-components")).toContainText("$15.00");

  const aliceSuggestion = page.getByRole("button", { name: "Record payment: Cara pays Alice $15.00" });
  await aliceSuggestion.click();
  await expect(page.getByRole("heading", { name: "Review suggested payment" })).toBeVisible();
  await expect(page.getByLabel("Sender")).toHaveValue(cara.id);
  await expect(page.getByLabel("Recipient")).toHaveValue(aliceId);
  await expect(page.getByLabel("Amount")).toHaveValue("15.00");
  await expect(page.getByText(/nothing is sent from here/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Record payment: Cara pays Alice $15.00" })).toBeVisible();

  await page.getByRole("button", { name: "Record payment: Cara pays Alice $15.00" }).click();
  await page.locator(".settlement-editor").getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(personRow(page, aliceId).locator(".overview-net")).toHaveText("Settled up");
  await expect(personRow(page, bob.id).locator(".overview-net")).toHaveText("Should receive $15.00");
  await expect(personRow(page, cara.id).locator(".overview-net")).toHaveText("Should pay $15.00");
  await expect(page.getByRole("button", { name: "Record payment: Cara pays Bob $15.00" })).toBeVisible();
  await page.getByRole("button", { name: "Record payment: Cara pays Bob $15.00" }).click();
  await page.locator(".settlement-editor").getByRole("button", { name: "Record payment", exact: true }).click();

  await expect(personRow(page, aliceId).locator(".overview-net")).toHaveText("Settled up");
  await expect(personRow(page, bob.id).locator(".overview-net")).toHaveText("Settled up");
  await expect(personRow(page, cara.id).locator(".overview-net")).toHaveText("Settled up");
  await expect(page.getByText("Everyone is settled up")).toBeVisible();
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(3);
});

test("payments can be added manually, edited, and deleted with balance reversals and overpayment credit", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "20.00" });
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(page.getByRole("heading", { name: "Add a payment" })).toBeVisible();
  await expect(page.getByLabel("Sender")).toHaveValue(aliceId);
  await page.getByLabel("Amount").fill("15.00");
  await page.getByLabel("Sender").selectOption(bob.id);
  await page.getByLabel("Recipient").selectOption(aliceId);
  await page.getByRole("button", { name: "Record payment" }).click();

  const row = page.locator(".settlement-card");
  await expect(row).toContainText("Bob paid Alice");
  await expect(row).toContainText("$15.00");
  await expect(page.getByText(/Total recorded: \$15\.00/)).toBeVisible();
  const balances = await page.request.get(appServer.url + "/api/balances").then((response) => response.json());
  expect(balances.users.find((user) => user.user_id === aliceId).net).toBe("-5.00");
  expect(balances.users.find((user) => user.user_id === bob.id).net).toBe("5.00");
  await page.goto(appServer.url + "/#overview");
  await expect(page.locator("#overview-personal-heading")).toHaveText("You should pay $5.00");
  await expect(personRow(page, bob.id).locator(".overview-net")).toHaveText("Should receive $5.00");

  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Edit payment from Bob to Alice for $15.00" }).click();
  await expect(page.getByRole("heading", { name: "Edit payment" })).toBeVisible();
  await expect(page.getByLabel("Sender")).toHaveValue(bob.id);
  await expect(page.getByLabel("Recipient")).toHaveValue(aliceId);
  await page.getByLabel("Amount").fill("10.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  const saved = await page.request.get(appServer.url + "/api/settlements").then((response) => response.json());
  expect(saved).toHaveLength(1);
  expect(saved[0].amount).toBe("10.00");
  const settledBalances = await page.request.get(appServer.url + "/api/balances").then((response) => response.json());
  expect(settledBalances.users.every((user) => user.net === "0.00")).toBe(true);

  const remove = page.getByRole("button", { name: "Delete payment from Bob to Alice for $10.00" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Bob");
    expect(dialog.message()).toContain("Alice");
    expect(dialog.message()).toContain("$10.00");
    await dialog.dismiss();
  });
  await remove.click();
  await expect(row).toBeVisible();
  page.once("dialog", async (dialog) => dialog.accept());
  await remove.click();
  await expect(page.getByText("No payments recorded yet")).toBeVisible();
  const reverted = await page.request.get(appServer.url + "/api/balances").then((response) => response.json());
  expect(reverted.users.find((user) => user.user_id === aliceId).net).toBe("10.00");
  expect(reverted.users.find((user) => user.user_id === bob.id).net).toBe("-10.00");
});

test("manual payment validation blocks self-payments and invalid exact-decimal amounts", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  await createUser(page, appServer.url, "Bob");
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  const amount = page.getByLabel("Amount");
  const record = page.getByRole("button", { name: "Record payment" });
  await amount.fill("0");
  await page.getByLabel("Sender").selectOption(aliceId);
  await page.getByLabel("Recipient").selectOption(aliceId);
  await record.click();
  await expect(page.getByRole("alert")).toHaveText("Enter an amount greater than $0.00.");
  await amount.fill("2.50");
  await record.click();
  await expect(page.getByRole("alert")).toHaveText("The sender and recipient must be different people.");
  await page.getByLabel("Recipient").selectOption("");
  for (const invalid of ["-1.00", "1.001", "not money", "1000000000.00"]) {
    await amount.fill(invalid);
    await record.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(amount).toHaveValue(invalid);
  }
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(0);
});

test("payments refresh reflects other people's changes and preserves an open editor on read failure", async ({ page, appServer }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Amount").fill("9.25");
  await page.getByLabel("Recipient").selectOption(bob.id);

  await createSettlement(page, appServer.url, { payerId: bob.id, recipientId: aliceId, amount: "5.00" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".settlement-card")).toContainText("Bob paid Alice");
  await expect(page.getByLabel("Amount")).toHaveValue("9.25");
  await expect(page.getByLabel("Recipient")).toHaveValue(bob.id);

  let failBalances = true;
  await page.route("**/api/balances", async (route) => {
    if (failBalances) {
      failBalances = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Balances are temporarily unavailable." } }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator("[data-settlement-view-status]")).toContainText("Balances are temporarily unavailable.");
  await expect(page.getByLabel("Amount")).toHaveValue("9.25");
  await expect(page.getByLabel("Recipient")).toHaveValue(bob.id);
  expect(pageErrors).toEqual([]);
});

test("overview foreground and manual refreshes coalesce without changing an open suggestion form", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "10.00" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByRole("button", { name: "Record payment: Bob pays Alice $5.00" }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("5.00");
  await page.getByLabel("Amount").fill("4.00");

  await createSettlement(page, appServer.url, { payerId: bob.id, recipientId: aliceId, amount: "1.00" });
  let releaseBalance;
  let balanceReads = 0;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  await page.route("**/api/balances", async (route) => {
    balanceReads += 1;
    notifyStarted();
    await new Promise((resolve) => { releaseBalance = resolve; });
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await started;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(100);
  expect(balanceReads).toBe(1);
  releaseBalance();

  await expect(page.locator("#overview-personal-heading")).toHaveText("You should receive $4.00");
  await expect(page.locator(".settlement-editor").getByLabel("Amount")).toHaveValue("4.00");
  await expect(page.locator(".settlement-editor").getByLabel("Sender")).toHaveValue(bob.id);
  await expect(page.locator(".settlement-editor").getByLabel("Recipient")).toHaveValue(aliceId);
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(1);
  await page.locator(".settlement-editor").getByRole("button", { name: "Cancel" }).click();
});

test("an accepted payment with a failed balance refresh stays locked until the canonical list reloads", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Sender").selectOption(aliceId);
  await page.getByLabel("Recipient").selectOption(bob.id);
  await page.getByLabel("Amount").fill("12.50");
  let failNextBalance = true;
  let posts = 0;
  await page.route("**/api/balances", async (route) => {
    if (failNextBalance) {
      failNextBalance = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Balances are temporarily unavailable." } }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/settlements", async (route) => {
    if (route.request().method() === "POST") posts += 1;
    await route.continue();
  });
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("alert")).toContainText("The payment was saved, but the refreshed payment list or balances could not be loaded.");
  await expect(page.getByLabel("Amount")).toHaveValue("12.50");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add payment" })).toBeDisabled();
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Reload payments" }).click();
  await expect(page.locator(".settlement-card")).toContainText("$12.50");
  expect(posts).toBe(1);
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(1);
});

test("an ambiguous network response never automatically replays a payment", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Sender").selectOption(aliceId);
  await page.getByLabel("Recipient").selectOption(bob.id);
  await page.getByLabel("Amount").fill("8.00");
  let posts = 0;
  await page.route("**/api/settlements", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await route.fetch();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t confirm whether this payment was saved.");
  await expect(page.getByRole("alert")).toContainText("Check the refreshed list before retrying");
  await expect(page.locator(".settlement-card")).toContainText("$8.00");
  await expect(page.getByLabel("Amount")).toHaveValue("8.00");
  expect(posts).toBe(1);
  await page.waitForTimeout(100);
  expect(posts).toBe(1);
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(1);
});

test("a delayed save disables payment actions and double submission creates one record", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await createSettlement(page, appServer.url, { payerId: bob.id, recipientId: aliceId, amount: "2.00" });
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Recipient").selectOption(bob.id);
  await page.getByLabel("Amount").fill("18.00");
  let releasePost;
  let posts = 0;
  await page.route("**/api/settlements", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((resolve) => { releasePost = resolve; });
    }
    await route.continue();
  });
  const record = page.getByRole("button", { name: "Record payment" });
  await record.click();
  await expect(page.getByRole("button", { name: "Recording…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add payment" })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".settlement-card")).toContainText("Bob paid Alice");
  await expect(page.getByRole("button", { name: "Edit payment from Bob to Alice for $2.00" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete payment from Bob to Alice for $2.00" })).toBeDisabled();
  await page.evaluate(() => {
    document.querySelector(".settlement-form").requestSubmit();
    document.querySelector(".settlement-form").requestSubmit();
  });
  await page.waitForTimeout(100);
  expect(posts).toBe(1);
  releasePost();
  await expect(page.locator(".settlement-card").filter({ hasText: "$18.00" })).toBeVisible();
  expect(await page.request.get(appServer.url + "/api/settlements").then((response) => response.json())).toHaveLength(2);
  const apiRows = await page.request.get(appServer.url + "/api/settlements").then((response) => response.json());
  expect(apiRows[0].payer_id).toBe(aliceId);
});

test("one-person and no-expense states are clear, switching users changes only the personal summary", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Solo");
  const soloId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  await expect(page.locator("#overview-personal-heading")).toHaveText("You're settled up");
  await expect(page.getByText("Everyone is settled up")).toBeVisible();
  await openPayments(page, appServer.url);
  await expect(page.getByText("No payments recorded yet")).toBeVisible();

  const bob = await createUser(page, appServer.url, "Bob");
  await createExpense(page, appServer.url, { payerId: soloId, amount: "10.00" });
  await page.goto(appServer.url + "/#overview");
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  await expect(page.locator("#overview-personal-heading")).toHaveText("You should receive $5.00");
  await page.getByRole("button", { name: "Switch user" }).click();
  await page.getByLabel("Your username").fill("Bob");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#overview-personal-heading")).toHaveText("You should pay $5.00");
  await expect(personRow(page, soloId).locator(".overview-net")).toHaveText("Should receive $5.00");
  await expect(personRow(page, bob.id).locator(".overview-net")).toHaveText("Should pay $5.00");
});

test("overview and payment editor fit a 320px viewport without horizontal scrolling", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await signIn(page, appServer.url, "Avery-Cedar-Long-Last-Name");
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "A Long Recipient Name With Many Words");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "10.00" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: /Record payment: .* pays .* \$5\.00/ })).toBeVisible();
  let dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.getByRole("button", { name: /Record payment:/ }).click();
  await expect(page.locator(".settlement-editor").getByLabel("Recipient")).toHaveValue(aliceId);
  dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await openPayments(page, appServer.url);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Recipient").selectOption(bob.id);
  await page.getByLabel("Amount").fill("5.00");
  await page.locator(".settlement-editor").getByRole("button", { name: "Record payment", exact: true }).click();
  dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
