import { test, expect } from "./fixtures.js";

async function signIn(page, baseUrl, username = "Alice") {
  await page.goto(`${baseUrl}/`);
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
}

async function openExpenses(page, baseUrl) {
  await page.goto(`${baseUrl}/#expenses`);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
}

async function createUser(page, baseUrl, username) {
  const response = await page.request.post(`${baseUrl}/api/users`, { data: { username } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createExpense(page, baseUrl, { payerId, targetUserIds = null, amount = "60.00" }) {
  const response = await page.request.post(`${baseUrl}/api/expenses`, {
    data: { payer_id: payerId, target_user_ids: targetUserIds, amount },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function saveExpenseAndWait(page, baseUrl, expenseId) {
  const patchResponse = page.waitForResponse((response) =>
    response.url() === `${baseUrl}/api/expenses/${expenseId}` && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await patchResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("Expense updated.");
}

test("creates an Everyone expense with the selected user as the default payer", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  await openExpenses(page, appServer.url);
  await expect(page.getByText("No expenses yet")).toBeVisible();

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  await expect(page.getByLabel("Paid by")).toHaveValue(await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId")));
  await expect(page.getByText("Includes everyone in the group, including people who join later.", { exact: true })).toBeVisible();
  await page.getByLabel("Amount").fill("60.00");
  await page.getByRole("button", { name: "Create expense" }).click();

  const card = page.locator(".expense-card");
  await expect(card).toContainText("$60.00");
  await expect(card).toContainText("Alice");
  await expect(card).toContainText("Everyone");
  await expect(page.getByRole("button", { name: "Add expense" })).toBeFocused();
  const expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
  expect(expenses).toHaveLength(1);
  expect(expenses[0].target_user_ids).toBeNull();
  expect(expenses[0].amount).toBe("60.00");
});

test("records explicit targets excluding the payer and edits only the amount", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const bob = await createUser(page, appServer.url, "Bob");
  const cara = await createUser(page, appServer.url, "Cara");
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  await openExpenses(page, appServer.url);

  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("25.50");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.getByRole("status")).toHaveText("Expense added.");

  let expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
  expect(expenses).toHaveLength(1);
  expect(expenses[0].payer_id).toBe(aliceId);
  expect(expenses[0].target_user_ids).toEqual([bob.id, cara.id].sort());
  await expect(page.locator(".expense-card")).toContainText("Selected people");
  await expect(page.locator(".expense-participant-names")).toContainText(/^(Bob, Cara|Cara, Bob)$/u);

  let patchBody;
  await page.route("**/api/expenses/*", async (route) => {
    if (route.request().method() === "PATCH") patchBody = route.request().postDataJSON();
    await route.continue();
  });
  await page.getByRole("button", { name: /Edit expense paid by Alice/ }).click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Selected people" })).toBeChecked();
  await expect(page.getByLabel("Bob", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Cara", { exact: true })).toBeChecked();
  await page.getByLabel("Amount").fill("27.75");
  await saveExpenseAndWait(page, appServer.url, expenses[0].id);

  expect(patchBody).toEqual({ amount: "27.75" });
  expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
  expect(expenses[0].amount).toBe("27.75");
  expect(expenses[0].target_user_ids).toEqual([bob.id, cara.id].sort());

  await page.getByRole("button", { name: /Edit expense paid by Alice/ }).click();
  await page.getByRole("radio", { name: "Everyone" }).check();
  await saveExpenseAndWait(page, appServer.url, expenses[0].id);
  expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
  expect(expenses[0].target_user_ids).toBeNull();

  await page.getByRole("button", { name: /Edit expense paid by Alice/ }).click();
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await saveExpenseAndWait(page, appServer.url, expenses[0].id);
  expenses = await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json());
  expect(expenses[0].target_user_ids).toEqual([bob.id, cara.id].sort());
});

test("an explicit split that currently includes everyone stays explicit when edited", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const bob = await createUser(page, appServer.url, "Bob");
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const expense = await createExpense(page, appServer.url, { payerId: aliceId, targetUserIds: [aliceId, bob.id], amount: "10.00" });
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: /Edit expense paid by Alice/ }).click();
  await expect(page.getByRole("radio", { name: "Selected people" })).toBeChecked();
  await expect(page.getByLabel("Alice", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Bob", { exact: true })).toBeChecked();
  await page.getByLabel("Amount").fill("11.00");
  await saveExpenseAndWait(page, appServer.url, expense.id);

  const saved = await page.request.get(`${appServer.url}/api/expenses/${expense.id}`).then((response) => response.json());
  expect(saved.amount).toBe("11.00");
  expect(saved.target_user_ids).toEqual([aliceId, bob.id].sort());
});

test("validates exact decimal strings and prevents an empty selected split", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  const amount = page.getByLabel("Amount");
  const create = page.getByRole("button", { name: "Create expense" });

  for (const value of ["0", "-1.00", "1.001", "not money", "1000000000.00"]) {
    await amount.fill(value);
    await create.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(amount).toHaveValue(value);
    expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(0);
  }

  await amount.fill("8.00");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await create.click();
  await expect(page.getByRole("alert")).toHaveText("Select at least one person, or choose Everyone.");
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(0);
});

test("uses the API error for a payer deleted after the editor loaded", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const bob = await createUser(page, appServer.url, "Bob");
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("9.00");
  await page.getByLabel("Paid by").selectOption(bob.id);
  expect((await page.request.delete(`${appServer.url}/api/users/${bob.id}`)).status()).toBe(204);

  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.getByRole("alert")).toContainText(/payer|person|user/i);
  await expect(page.getByLabel("Amount")).toHaveValue("9.00");
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(0);
});

test("an ambiguous network result refreshes the list without automatically replaying the write", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("14.25");
  let posts = 0;
  let balanceReads = 0;
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await route.fetch(); // Let the isolated API commit the row, then drop its response.
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.route("**/api/balances", async (route) => {
    balanceReads += 1;
    if (balanceReads === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Balances are temporarily unavailable." } }) });
    } else {
      await route.continue();
    }
  });

  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t confirm whether the expense was saved");
  await expect(page.locator(".expense-card")).toContainText("$14.25");
  await expect(page.getByLabel("Amount")).toHaveValue("14.25");
  expect(posts).toBe(1);
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(1);
  await page.waitForTimeout(100);
  expect(posts).toBe(1);

  const refresh = page.getByRole("button", { name: "Refresh list" });
  await refresh.click();
  await expect(page.getByRole("alert")).toContainText("The expense list and balances could not both be refreshed.");
  await expect(page.getByRole("alert")).not.toContainText("balances are refreshed");
  expect(balanceReads).toBe(1);
  await expect(refresh).toBeEnabled();

  await refresh.click();
  await expect(page.getByRole("alert")).toHaveText("The expense list and balances are refreshed. Check the list before retrying.");
  expect(balanceReads).toBe(2);
  expect(posts).toBe(1);
});

test("a failed expense load can be retried", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  let failed = false;
  await page.route("**/api/expenses", async (route) => {
    if (!failed && route.request().method() === "GET") {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Expenses are temporarily unavailable." } }) });
    } else {
      await route.continue();
    }
  });
  await page.goto(`${appServer.url}/#expenses`);
  await expect(page.getByRole("heading", { name: "Expenses couldn’t load" })).toBeVisible();
  await expect(page.getByText("Expenses are temporarily unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No expenses yet")).toBeVisible();
});

test("double tapping while a create is pending sends one expense request", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("19.00");
  let continueRequest;
  let posts = 0;
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((resolve) => { continueRequest = resolve; });
    }
    await route.continue();
  });
  const create = page.getByRole("button", { name: "Create expense" });
  await create.click();
  await expect(page.getByRole("button", { name: "Adding…" })).toBeDisabled();
  await page.evaluate(() => {
    document.querySelector(".expense-form").requestSubmit();
    document.querySelector(".expense-form").requestSubmit();
  });
  await page.waitForTimeout(100);
  expect(posts).toBe(1);
  continueRequest();
  await expect(page.locator(".expense-card")).toContainText("$19.00");
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(1);
});

test("a pending write locks competing expense actions until canonical refresh finishes", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "5.00" });
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("10.00");

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
  await expect(page.getByRole("button", { name: "Add expense" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit expense paid by Alice for $5.00" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete expense paid by Alice for $5.00" })).toBeDisabled();
  await expect(page.getByLabel("Amount")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();

  const balancesRead = page.waitForResponse((response) => response.url().endsWith("/api/balances") && response.request().method() === "GET");
  release();
  await balancesRead;
  await expect(page.getByRole("button", { name: "Add expense" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Edit expense paid by Alice for $5.00" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete expense paid by Alice for $5.00" })).toBeEnabled();
  await expect(page.locator(".expense-card").filter({ hasText: "$10.00" })).toHaveCount(1);
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(2);
});

test("a saved write with a failed canonical refresh preserves the editor and blocks duplicate submit", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("18.75");
  let failBalance = false;
  let posts = 0;
  await page.route("**/api/balances", async (route) => {
    if (failBalance) {
      failBalance = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Balances are temporarily unavailable." } }) });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() === "POST") posts += 1;
    await route.continue();
  });
  failBalance = true;
  await page.getByRole("button", { name: "Create expense" }).click();

  await expect(page.getByRole("alert")).toContainText("The expense was saved, but the refreshed list or balances could not be loaded.");
  await expect(page.getByLabel("Amount")).toHaveValue("18.75");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Reload expenses" }).click();
  await expect(page.locator(".expense-card")).toContainText("$18.75");
  expect(posts).toBe(1);
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(1);
});

test("delete cancellation keeps an expense; confirmation refreshes the list and balances", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const expense = await createExpense(page, appServer.url, { payerId: aliceId, amount: "35.00" });
  await openExpenses(page, appServer.url);
  const remove = page.getByRole("button", { name: "Delete expense paid by Alice for $35.00" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("$35.00");
    expect(dialog.message()).toContain("Alice");
    await dialog.dismiss();
  });
  await remove.click();
  await expect(page.locator(`[data-expense-id="${expense.id}"]`)).toBeVisible();

  page.once("dialog", async (dialog) => dialog.accept());
  await remove.click();
  await expect(page.getByText("No expenses yet")).toBeVisible();
  expect((await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json()))).toHaveLength(0);
  const balances = await page.request.get(`${appServer.url}/api/balances`).then((response) => response.json());
  expect(balances.totals.expenses).toBe("0.00");
});

test("many long target names fit a 320px viewport and labels remain usable", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await signIn(page, appServer.url, "Avery With A Longer Name");
  const longNames = [];
  for (let index = 0; index < 18; index += 1) longNames.push(`Group Member ${String(index + 1).padStart(2, "0")} With A Long Last Name`);
  for (const username of longNames) await createUser(page, appServer.url, username);
  await openExpenses(page, appServer.url);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("radio", { name: "Selected people" }).check();
  const target = page.getByLabel(longNames[0], { exact: true });
  await expect(target).toBeVisible();
  await target.check();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    checkboxHeight: document.querySelector(".expense-target-choice").getBoundingClientRect().height,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.checkboxHeight).toBeGreaterThanOrEqual(42);
});

test("a late expenses response cannot overwrite another active route", async ({ page, appServer }) => {
  await signIn(page, appServer.url);
  let releaseExpenseRequest;
  let delayed = false;
  await page.route("**/api/expenses", async (route) => {
    if (!delayed && route.request().method() === "GET") {
      delayed = true;
      await new Promise((resolve) => { releaseExpenseRequest = resolve; });
    }
    await route.continue();
  });

  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(page.getByRole("status")).toContainText("Loading expenses");
  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  releaseExpenseRequest();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toHaveCount(0);
});
