import { test, expect } from "./fixtures.js";

const SESSION_KEY = "splitmoney.selectedUserId";

function usd(amount) {
  return "$" + Number(amount).toFixed(2);
}

function cents(amount) {
  const match = /^(-?)(\d+)\.(\d{2})$/u.exec(String(amount));
  expect(match, `valid two-decimal amount: ${amount}`).toBeTruthy();
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 100 + Number(match[3]));
}

function amountFromCents(value) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function visibleNetLabel(amount) {
  const value = Number(amount);
  if (value > 0) return `Should receive ${usd(value)}`;
  if (value < 0) return `Should pay ${usd(Math.abs(value))}`;
  return "Settled up";
}

function observeBrowser(page) {
  const errors = { page: [], console: [], requests: [] };
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("requestfailed", (request) => {
    errors.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "request failed"}`);
  });
  return errors;
}

async function assertNoBrowserErrors(testInfo, errors, { expectedConflictResponses = 0 } = {}) {
  const body = Buffer.from(JSON.stringify(errors, null, 2));
  await testInfo.attach("browser-errors.json", { body, contentType: "application/json" });
  expect(errors.page, "uncaught browser exceptions").toEqual([]);
  const expectedConflicts = errors.console.filter((message) => /status of 409 \(Conflict\)/u.test(message));
  const unexpectedConsole = errors.console.filter((message) => !/status of 409 \(Conflict\)/u.test(message));
  expect(expectedConflicts, "expected conflict responses surfaced by Chromium").toHaveLength(expectedConflictResponses);
  expect(unexpectedConsole, "unexpected browser console errors").toEqual([]);
  expect(errors.requests, "failed browser requests").toEqual([]);
}

async function signIn(page, baseUrl, username = "Alice") {
  await page.goto(`${baseUrl}/`);
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  return page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
}

async function switchUser(page, baseUrl, username) {
  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  return page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
}

async function openRoute(page, baseUrl, route, heading) {
  await page.goto(`${baseUrl}/#${route}`);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

async function addPerson(page, baseUrl, username, phone = "") {
  await openRoute(page, baseUrl, "people", "People");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Add a person" })).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill(username);
  if (phone) await page.getByLabel("Phone number (optional)").fill(phone);
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.locator(".people-name").getByText(username, { exact: true })).toBeVisible();
}

async function createEveryoneExpense(page, baseUrl, { amount, payer = null }) {
  await openRoute(page, baseUrl, "expenses", "Expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  if (payer) await page.getByLabel("Paid by", { exact: true }).selectOption({ label: payer });
  await page.getByLabel("Amount", { exact: true }).fill(amount);
  await page.getByRole("radio", { name: "Everyone" }).check();
  await expect(page.getByText("Includes everyone in the group, including people who join later.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.locator(".expense-card").filter({ hasText: usd(amount) }).first()).toBeVisible();
}

async function editExpenseAmount(page, baseUrl, { payer, oldAmount, newAmount }) {
  await openRoute(page, baseUrl, "expenses", "Expenses");
  await page.getByRole("button", { name: `Edit expense paid by ${payer} for ${usd(oldAmount)}` }).click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill(newAmount);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".expense-card").filter({ hasText: usd(newAmount) }).first()).toBeVisible();
}

async function addPayment(page, baseUrl, { amount, sender, recipient }) {
  await openRoute(page, baseUrl, "payments", "Payments");
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(page.getByRole("heading", { name: "Add a payment" })).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill(amount);
  await page.getByLabel("Sender", { exact: true }).selectOption({ label: sender });
  await page.getByLabel("Recipient", { exact: true }).selectOption({ label: recipient });
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a payment" })).toHaveCount(0);
}

async function recordSuggestion(page, baseUrl, { sender, recipient, amount }) {
  await openRoute(page, baseUrl, "overview", "Your group overview");
  const review = page.getByRole("button", { name: `Record payment: ${sender} pays ${recipient} ${usd(amount)}` });
  await expect(review).toBeVisible();
  await review.click();
  await expect(page.getByRole("heading", { name: "Review suggested payment" })).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue(amount);
  await expect(page.getByLabel("Sender", { exact: true })).toHaveValue(await userId(page, baseUrl, sender));
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(await userId(page, baseUrl, recipient));
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.locator(".settlement-editor")).toHaveCount(0);
}

async function userId(page, baseUrl, username) {
  const users = await page.request.get(`${baseUrl}/api/users`).then((response) => response.json());
  const user = users.find((candidate) => candidate.username === username);
  expect(user, `API user ${username} exists`).toBeTruthy();
  return user.id;
}

async function assertLedgerAndView(page, baseUrl, expected, selectedUserId) {
  const [usersResponse, expensesResponse, settlementsResponse, balancesResponse] = await Promise.all([
    page.request.get(`${baseUrl}/api/users`),
    page.request.get(`${baseUrl}/api/expenses`),
    page.request.get(`${baseUrl}/api/settlements`),
    page.request.get(`${baseUrl}/api/balances`),
  ]);
  for (const response of [usersResponse, expensesResponse, settlementsResponse, balancesResponse]) {
    expect(response.ok(), `API request ${response.url()} returned ${response.status()}`).toBe(true);
  }
  const [users, expenses, settlements, balances] = await Promise.all([
    usersResponse.json(), expensesResponse.json(), settlementsResponse.json(), balancesResponse.json(),
  ]);
  expect(users).toHaveLength(Object.keys(expected.nets).length);
  expect(new Set(users.map((user) => user.username))).toEqual(new Set(Object.keys(expected.nets)));
  expect(expenses).toHaveLength(expected.expenseCount);
  expect(settlements).toHaveLength(expected.paymentCount);
  expect(balances.users).toHaveLength(Object.keys(expected.nets).length);
  expect(balances.totals).toEqual({ expenses: expected.expenseTotal, settlements: expected.paymentTotal });

  const byName = new Map(users.map((user) => [user.username, user]));
  const balanceById = new Map(balances.users.map((user) => [user.user_id, user]));
  for (const [username, net] of Object.entries(expected.nets)) {
    const user = byName.get(username);
    expect(user, `UUID returned for ${username}`).toBeTruthy();
    const balance = balanceById.get(user.id);
    expect(balance?.username).toBe(username);
    expect(balance?.net, `${username} net via API`).toBe(net);
  }

  await page.goto(`${baseUrl}/#overview`);
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  await expect(page.locator("[data-overview-expenses]")).toHaveText(usd(expected.expenseTotal));
  await expect(page.locator("[data-overview-settlements]")).toHaveText(usd(expected.paymentTotal));
  for (const [username, net] of Object.entries(expected.nets)) {
    const id = byName.get(username).id;
    const row = page.locator(`[data-overview-user="${id}"]`);
    await expect(row.locator(".overview-person-name")).toHaveText(username);
    await expect(row.locator(".overview-net")).toHaveText(visibleNetLabel(net));
  }
  const current = balances.users.find((user) => user.user_id === selectedUserId);
  expect(current, "selected UUID remains in the group").toBeTruthy();
  const personalText = Number(current.net) > 0
    ? `You should receive ${usd(current.net)}`
    : Number(current.net) < 0
      ? `You should pay ${usd(Math.abs(Number(current.net)))}`
      : "You're settled up";
  await expect(page.locator("#overview-personal-heading")).toHaveText(personalText);
  return { users, expenses, settlements, balances };
}

async function expectComponents(page, username, values) {
  const user = await page.request.get(`${page.url().split("/#")[0]}/api/users`).then((response) => response.json())
    .then((users) => users.find((candidate) => candidate.username === username));
  expect(user).toBeTruthy();
  const row = page.locator(`[data-overview-user="${user.id}"]`);
  const components = await row.locator(".overview-components").evaluate((node) => {
    const labels = [...node.querySelectorAll("dt")];
    return Object.fromEntries(labels.map((label) => [label.textContent, label.nextElementSibling.textContent]));
  });
  expect(components).toEqual(values);
}

async function assertNoHorizontalOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("three friends complete the mock expense and settlement journey through a backend restart", async ({ page, appServer }, testInfo) => {
  test.setTimeout(180_000);
  const browserErrors = observeBrowser(page);
  const aliceId = await signIn(page, appServer.url, "Alice");
  expect(aliceId).toBeTruthy();

  let state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const aliceUuid = state.users.find((user) => user.username === "Alice").id;
  expect(aliceId).toBe(aliceUuid);

  await addPerson(page, appServer.url, "Bob");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const bobId = state.users.find((user) => user.username === "Bob").id;

  await addPerson(page, appServer.url, "Cara");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const caraId = state.users.find((user) => user.username === "Cara").id;
  const idEvidence = { Alice: aliceUuid, Bob: bobId, Cara: caraId };

  const returningAliceId = await switchUser(page, appServer.url, " aLiCe ");
  expect(returningAliceId).toBe(aliceId);
  await expect(page.locator("#account-name")).toHaveText("Alice");
  await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);

  await createEveryoneExpense(page, appServer.url, { amount: "60.00", payer: "Alice" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "40.00", Bob: "-20.00", Cara: "-20.00" }, expenseTotal: "60.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.expenses[0].payer_id).toBe(aliceId);
  expect(state.expenses[0].target_user_ids).toBeNull();
  await expectComponents(page, "Alice", {
    "Expense paid": "$60.00", "Expense share": "$20.00", "Payments sent": "$0.00", "Payments received": "$0.00",
  });
  const aliceExpense = state.expenses[0];

  const bobSessionId = await switchUser(page, appServer.url, "Bob");
  expect(bobSessionId).toBe(bobId);
  await createEveryoneExpense(page, appServer.url, { amount: "30.00", payer: "Bob" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "30.00", Bob: "0.00", Cara: "-30.00" }, expenseTotal: "90.00", paymentTotal: "0.00", expenseCount: 2, paymentCount: 0,
  }, bobId);
  const bobExpense = state.expenses.find((expense) => expense.payer_id === bobId);
  expect(bobExpense).toBeTruthy();

  await editExpenseAmount(page, appServer.url, { payer: "Bob", oldAmount: "30.00", newAmount: "36.00" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "28.00", Bob: "4.00", Cara: "-32.00" }, expenseTotal: "96.00", paymentTotal: "0.00", expenseCount: 2, paymentCount: 0,
  }, bobId);
  expect(state.expenses.find((expense) => expense.id === bobExpense.id).amount).toBe("36.00");

  await editExpenseAmount(page, appServer.url, { payer: "Bob", oldAmount: "36.00", newAmount: "30.00" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "30.00", Bob: "0.00", Cara: "-30.00" }, expenseTotal: "90.00", paymentTotal: "0.00", expenseCount: 2, paymentCount: 0,
  }, bobId);
  expect(state.expenses.find((expense) => expense.id === bobExpense.id).amount).toBe("30.00");

  await addPayment(page, appServer.url, { amount: "15.00", sender: "Bob", recipient: "Alice" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "15.00", Bob: "15.00", Cara: "-30.00" }, expenseTotal: "90.00", paymentTotal: "15.00", expenseCount: 2, paymentCount: 1,
  }, bobId);
  const bobPayment = state.settlements[0];
  expect(bobPayment.payer_id).toBe(bobId);
  expect(bobPayment.target_user_id).toBe(aliceId);
  expect(state.balances.suggested_payments.map((item) => `${item.from_username}->${item.to_username}:${item.amount}`).sort()).toEqual([
    "Cara->Alice:15.00", "Cara->Bob:15.00",
  ].sort());
  await expectComponents(page, "Bob", {
    "Expense paid": "$30.00", "Expense share": "$30.00", "Payments sent": "$15.00", "Payments received": "$0.00",
  });

  const caraSessionId = await switchUser(page, appServer.url, "Cara");
  expect(caraSessionId).toBe(caraId);
  await openRoute(page, appServer.url, "overview", "Your group overview");
  await page.getByRole("button", { name: "Record payment: Cara pays Alice $15.00" }).click();
  await expect(page.getByRole("heading", { name: "Review suggested payment" })).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("15.00");
  await expect(page.getByLabel("Sender", { exact: true })).toHaveValue(caraId);
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(aliceId);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".settlement-editor")).toHaveCount(0);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "15.00", Bob: "15.00", Cara: "-30.00" }, expenseTotal: "90.00", paymentTotal: "15.00", expenseCount: 2, paymentCount: 1,
  }, caraId);
  expect(state.settlements).toHaveLength(1);

  await recordSuggestion(page, appServer.url, { sender: "Cara", recipient: "Alice", amount: "15.00" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "15.00", Cara: "-15.00" }, expenseTotal: "90.00", paymentTotal: "30.00", expenseCount: 2, paymentCount: 2,
  }, caraId);

  await recordSuggestion(page, appServer.url, { sender: "Cara", recipient: "Bob", amount: "15.00" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);
  await expect(page.getByText("Everyone is settled up", { exact: true })).toBeVisible();
  const caraBobPayment = state.settlements.find((payment) => payment.payer_id === caraId && payment.target_user_id === bobId);
  expect(caraBobPayment).toBeTruthy();

  await openRoute(page, appServer.url, "payments", "Payments");
  const deleteCaraBob = page.getByRole("button", { name: "Delete payment from Cara to Bob for $15.00" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Cara");
    expect(dialog.message()).toContain("Bob");
    expect(dialog.message()).toContain("$15.00");
    await dialog.accept();
  });
  await deleteCaraBob.click();
  await expect(page.locator(`[data-settlement-id="${caraBobPayment.id}"]`)).toHaveCount(0);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "15.00", Cara: "-15.00" }, expenseTotal: "90.00", paymentTotal: "30.00", expenseCount: 2, paymentCount: 2,
  }, caraId);
  expect(state.settlements.some((payment) => payment.id === caraBobPayment.id)).toBe(false);

  await recordSuggestion(page, appServer.url, { sender: "Cara", recipient: "Bob", amount: "15.00" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);

  await openRoute(page, appServer.url, "people", "People");
  await page.getByRole("button", { name: "Edit Bob" }).click();
  await expect(page.getByRole("heading", { name: "Edit Bob" })).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("Robert");
  await page.getByLabel("Phone number (optional)").fill("212-555-0101");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".people-name").getByText("Robert", { exact: true })).toBeVisible();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Robert: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);
  expect(state.users.find((user) => user.id === bobId)).toMatchObject({ username: "Robert", phone: "212-555-0101" });
  expect(state.expenses.find((expense) => expense.id === bobExpense.id).payer_id).toBe(bobId);
  expect(state.settlements.find((payment) => payment.id === bobPayment.id)).toMatchObject({ payer_id: bobId, target_user_id: aliceId });
  await openRoute(page, appServer.url, "expenses", "Expenses");
  await expect(page.locator(".expense-payer").filter({ hasText: "Robert" })).toBeVisible();
  await openRoute(page, appServer.url, "payments", "Payments");
  await expect(page.locator(".settlement-direction").filter({ hasText: "Robert paid Alice" })).toBeVisible();

  await openRoute(page, appServer.url, "people", "People");
  await page.getByRole("button", { name: "Edit Robert" }).click();
  await page.getByLabel("Phone number (optional)").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".people-row").filter({ has: page.locator(".people-name", { hasText: "Robert" }) })).toContainText("No phone number added");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Robert: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);
  expect(state.users.find((user) => user.id === bobId)).toMatchObject({ username: "Robert", phone: null });

  const desktopScreenshot = testInfo.outputPath("primary-settled-before-restart.png");
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  await testInfo.attach("primary-settled-before-restart.png", { path: desktopScreenshot, contentType: "image/png" });
  await testInfo.attach("primary-user-uuids.json", {
    body: Buffer.from(JSON.stringify({ ...idEvidence, Bob: bobId }, null, 2)),
    contentType: "application/json",
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  await expect(page.locator("#account-name")).toHaveText("Cara");
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(caraId);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Robert: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);

  await appServer.restart();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  await expect(page.locator("#account-name")).toHaveText("Cara");
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(caraId);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Robert: "0.00", Cara: "0.00" }, expenseTotal: "90.00", paymentTotal: "45.00", expenseCount: 2, paymentCount: 3,
  }, caraId);
  expect(state.expenses.map((expense) => expense.id)).toEqual(expect.arrayContaining([aliceExpense.id, bobExpense.id]));
  expect(state.settlements).toHaveLength(3);
  await openRoute(page, appServer.url, "payments", "Payments");
  await expect(page.locator(".settlement-direction").filter({ hasText: "Bob paid Alice" })).toHaveCount(0);
  await expect(page.locator(".settlement-direction").filter({ hasText: "Robert paid Alice" })).toBeVisible();
  await assertNoBrowserErrors(testInfo, browserErrors);
});

test("explicit targets, Everyone membership changes, and deletion safety stay exact", async ({ page, appServer }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = observeBrowser(page);
  const aliceId = await signIn(page, appServer.url, "Alice");
  await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  await addPerson(page, appServer.url, "Bob");
  let state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const bobId = state.users.find((user) => user.username === "Bob").id;
  await addPerson(page, appServer.url, "Cara");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const caraId = state.users.find((user) => user.username === "Cara").id;

  await openRoute(page, appServer.url, "expenses", "Expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("24.00");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.locator(".expense-card")).toContainText("Selected people");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "24.00", Bob: "-12.00", Cara: "-12.00" }, expenseTotal: "24.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(new Set(state.expenses[0].target_user_ids)).toEqual(new Set([bobId, caraId]));
  expect(state.expenses[0].payer_id).toBe(aliceId);
  const expenseId = state.expenses[0].id;

  await page.goto(`${appServer.url}/#expenses`);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit expense paid by Alice for $24.00" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("30.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "30.00", Bob: "-15.00", Cara: "-15.00" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.expenses[0].target_user_ids).toEqual(expect.arrayContaining([bobId, caraId]));

  await page.goto(`${appServer.url}/#expenses`);
  await page.getByRole("button", { name: "Edit expense paid by Alice for $30.00" }).click();
  await page.getByRole("radio", { name: "Everyone" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "20.00", Bob: "-10.00", Cara: "-10.00" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.expenses.find((expense) => expense.id === expenseId).target_user_ids).toBeNull();

  await addPerson(page, appServer.url, "Dan");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "22.50", Bob: "-7.50", Cara: "-7.50", Dan: "-7.50" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  const danId = state.users.find((user) => user.username === "Dan").id;
  await openRoute(page, appServer.url, "people", "People");
  await expect(page.getByText(/Adding a person includes them in past expenses marked Everyone/)).toBeVisible();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Dan" }).click();
  await expect(page.getByRole("alert")).toContainText(/Dan is linked to an expense or payment, or an Everyone expense includes every current member/);
  await expect(page.locator(".people-row").filter({ has: page.locator(".people-name", { hasText: "Dan" }) })).toBeVisible();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "22.50", Bob: "-7.50", Cara: "-7.50", Dan: "-7.50" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.users.find((user) => user.username === "Dan").id).toBe(danId);

  await openRoute(page, appServer.url, "expenses", "Expenses");
  await page.getByRole("button", { name: "Edit expense paid by Alice for $30.00" }).click();
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Alice", { exact: true }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "20.00", Bob: "-10.00", Cara: "-10.00", Dan: "0.00" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(new Set(state.expenses.find((expense) => expense.id === expenseId).target_user_ids)).toEqual(new Set([aliceId, bobId, caraId]));

  await openRoute(page, appServer.url, "people", "People");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Dan" }).click();
  await expect(page.locator(".people-row").filter({ has: page.locator(".people-name", { hasText: "Dan" }) })).toHaveCount(0);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "20.00", Bob: "-10.00", Cara: "-10.00" }, expenseTotal: "30.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.users.some((user) => user.id === danId)).toBe(false);
  await assertNoBrowserErrors(testInfo, browserErrors, { expectedConflictResponses: 1 });
});

test("odd cents follow UUID order and suggested payment records settle every cent", async ({ page, appServer }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = observeBrowser(page);
  const aliceId = await signIn(page, appServer.url, "Alice");
  await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  await addPerson(page, appServer.url, "Bob");
  let state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  await addPerson(page, appServer.url, "Cara");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);

  await createEveryoneExpense(page, appServer.url, { amount: "10.00", payer: "Alice" });
  const users = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
  const ordered = [...users].sort((left, right) => left.id.localeCompare(right.id));
  const aliceShareCents = aliceId === ordered[0].id ? 334 : 333;
  const expectedSettlementTotalCents = 1000 - aliceShareCents;
  const expectedNets = Object.fromEntries(ordered.map((user) => {
    const share = user.id === ordered[0].id ? 334 : 333;
    const net = (user.id === aliceId ? 1000 : 0) - share;
    return [user.username, `${net < 0 ? "-" : ""}${Math.floor(Math.abs(net) / 100)}.${String(Math.abs(net) % 100).padStart(2, "0")}`];
  }));
  state = await assertLedgerAndView(page, appServer.url, {
    nets: expectedNets, expenseTotal: "10.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  const expenseShares = state.balances.users.map((user) => ({
    id: user.user_id,
    username: user.username,
    share: user.expense_share,
  })).sort((left, right) => left.id.localeCompare(right.id));
  expect(expenseShares.map(({ share }) => share)).toEqual(["3.34", "3.33", "3.33"]);
  expect(expenseShares[0].id).toBe(ordered[0].id);
  expect(expenseShares[0].share).toBe("3.34");

  let paymentCount = 0;
  let paymentTotalCents = 0;
  const expectedNetsInCents = Object.fromEntries(
    Object.entries(expectedNets).map(([username, net]) => [username, cents(net)]),
  );
  while (true) {
    const current = await page.request.get(`${appServer.url}/api/balances`).then((response) => response.json());
    if (!current.suggested_payments.length) break;
    const suggestion = current.suggested_payments[0];
    const amountCents = cents(suggestion.amount);
    const senderNet = expectedNetsInCents[suggestion.from_username];
    const recipientNet = expectedNetsInCents[suggestion.to_username];
    expect(senderNet, `${suggestion.from_username} is an expected debtor`).toBeLessThan(0);
    expect(recipientNet, `${suggestion.to_username} is an expected creditor`).toBeGreaterThan(0);
    expect(amountCents).toBe(Math.min(-senderNet, recipientNet));
    await recordSuggestion(page, appServer.url, {
      sender: suggestion.from_username, recipient: suggestion.to_username, amount: suggestion.amount,
    });
    paymentCount += 1;
    expectedNetsInCents[suggestion.from_username] += amountCents;
    expectedNetsInCents[suggestion.to_username] -= amountCents;
    paymentTotalCents += amountCents;
    state = await assertLedgerAndView(page, appServer.url, {
      nets: Object.fromEntries(
        Object.entries(expectedNetsInCents).map(([username, net]) => [username, amountFromCents(net)]),
      ),
      expenseTotal: "10.00", paymentTotal: amountFromCents(paymentTotalCents),
      expenseCount: 1, paymentCount,
    }, aliceId);
  }
  expect(paymentCount).toBe(2);
  expect(state.balances.users.map((user) => user.net)).toEqual(["0.00", "0.00", "0.00"]);
  expect(paymentTotalCents).toBe(expectedSettlementTotalCents);
  expect(state.balances.totals.settlements).toBe(amountFromCents(expectedSettlementTotalCents));
  await expect(page.getByText("Everyone is settled up", { exact: true })).toBeVisible();
  await assertNoBrowserErrors(testInfo, browserErrors);
});

test("overpayment correction, deletion, and reference safety remain visible through the UI", async ({ page, appServer }, testInfo) => {
  test.setTimeout(150_000);
  const browserErrors = observeBrowser(page);
  const aliceId = await signIn(page, appServer.url, "Alice");
  await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  await addPerson(page, appServer.url, "Bob");
  let state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const bobId = state.users.find((user) => user.username === "Bob").id;
  await createEveryoneExpense(page, appServer.url, { amount: "20.00", payer: "Alice" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "10.00", Bob: "-10.00" }, expenseTotal: "20.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  const expenseId = state.expenses[0].id;

  await addPayment(page, appServer.url, { amount: "15.00", sender: "Bob", recipient: "Alice" });
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "-5.00", Bob: "5.00" }, expenseTotal: "20.00", paymentTotal: "15.00", expenseCount: 1, paymentCount: 1,
  }, aliceId);
  const paymentId = state.settlements[0].id;
  expect(state.balances.suggested_payments.map((item) => `${item.from_username}->${item.to_username}:${item.amount}`)).toEqual(["Alice->Bob:5.00"]);

  await openRoute(page, appServer.url, "payments", "Payments");
  await page.getByRole("button", { name: "Edit payment from Bob to Alice for $15.00" }).click();
  await expect(page.getByRole("heading", { name: "Edit payment" })).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("10.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "20.00", paymentTotal: "10.00", expenseCount: 1, paymentCount: 1,
  }, aliceId);
  expect(state.settlements[0]).toMatchObject({ id: paymentId, amount: "10.00" });

  await openRoute(page, appServer.url, "payments", "Payments");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete payment from Bob to Alice for $10.00" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "10.00", Bob: "-10.00" }, expenseTotal: "20.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);

  await openRoute(page, appServer.url, "people", "People");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Alice" }).click();
  await expect(page.getByRole("alert")).toContainText(/Alice is linked to an expense or payment/);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "10.00", Bob: "-10.00" }, expenseTotal: "20.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);

  await openRoute(page, appServer.url, "people", "People");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Bob" }).click();
  await expect(page.getByRole("alert")).toContainText(/Bob is linked to an expense or payment/);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "10.00", Bob: "-10.00" }, expenseTotal: "20.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(state.users.find((user) => user.username === "Bob").id).toBe(bobId);

  await openRoute(page, appServer.url, "expenses", "Expenses");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete expense paid by Alice for $20.00" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  expect(state.expenses.some((expense) => expense.id === expenseId)).toBe(false);

  await openRoute(page, appServer.url, "people", "People");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Bob" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  expect(state.users.some((user) => user.id === bobId)).toBe(false);

  await openRoute(page, appServer.url, "people", "People");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Alice" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  const [users, expenses, settlements, balances] = await Promise.all([
    page.request.get(`${appServer.url}/api/users`).then((response) => response.json()),
    page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json()),
    page.request.get(`${appServer.url}/api/settlements`).then((response) => response.json()),
    page.request.get(`${appServer.url}/api/balances`).then((response) => response.json()),
  ]);
  expect(users).toHaveLength(0);
  expect(expenses).toHaveLength(0);
  expect(settlements).toHaveLength(0);
  expect(balances).toMatchObject({ users: [], totals: { expenses: "0.00", settlements: "0.00" }, suggested_payments: [] });
  await assertNoBrowserErrors(testInfo, browserErrors, { expectedConflictResponses: 2 });
});

test("validation and 390px/320px journeys cover target choice, suggestion review, and payment save", async ({ page, appServer }, testInfo) => {
  test.setTimeout(150_000);
  const browserErrors = observeBrowser(page);

  await page.setViewportSize({ width: 390, height: 780 });
  const aliceId = await signIn(page, appServer.url, "Alice");
  await assertNoHorizontalOverflow(page, 390);
  await addPerson(page, appServer.url, "Bob");
  let state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const bobId = state.users.find((user) => user.username === "Bob").id;
  await addPerson(page, appServer.url, "Cara");
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);
  const caraId = state.users.find((user) => user.username === "Cara").id;

  await openRoute(page, appServer.url, "people", "People");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username", { exact: true }).fill("ALICE");
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("alert")).toContainText(/already exists|already in the group|username/i);
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "0.00", Bob: "0.00", Cara: "0.00" }, expenseTotal: "0.00", paymentTotal: "0.00", expenseCount: 0, paymentCount: 0,
  }, aliceId);

  await openRoute(page, appServer.url, "expenses", "Expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Includes everyone in the group, including people who join later.", { exact: true })).toBeVisible();
  const amount = page.getByLabel("Amount", { exact: true });
  for (const invalid of ["0.00", "1.001"]) {
    await amount.fill(invalid);
    await page.getByRole("button", { name: "Create expense" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(amount).toHaveValue(invalid);
    expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(0);
  }
  await amount.fill("9.00");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByRole("button", { name: "Create expense" }).click();
  await expect(page.getByRole("alert")).toHaveText("Select at least one person, or choose Everyone.");
  expect(await page.request.get(`${appServer.url}/api/expenses`).then((response) => response.json())).toHaveLength(0);
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await expect(page.getByText("Includes everyone in the group, including people who join later.", { exact: true })).toBeHidden();
  await assertNoHorizontalOverflow(page, 390);
  await amount.fill("12.00");
  await page.getByRole("button", { name: "Create expense" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "12.00", Bob: "-6.00", Cara: "-6.00" }, expenseTotal: "12.00", paymentTotal: "0.00", expenseCount: 1, paymentCount: 0,
  }, aliceId);
  expect(new Set(state.expenses[0].target_user_ids)).toEqual(new Set([bobId, caraId]));

  await openRoute(page, appServer.url, "payments", "Payments");
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("1.00");
  await page.getByLabel("Sender", { exact: true }).selectOption(aliceId);
  await page.getByLabel("Recipient", { exact: true }).selectOption(aliceId);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The sender and recipient must be different people.");
  expect(await page.request.get(`${appServer.url}/api/settlements`).then((response) => response.json())).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  await openRoute(page, appServer.url, "overview", "Your group overview");
  await page.getByRole("button", { name: `Record payment: Bob pays Alice $6.00` }).click();
  await expect(page.getByRole("heading", { name: "Review suggested payment" })).toBeVisible();
  await expect(page.getByLabel("Sender", { exact: true })).toHaveValue(bobId);
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(aliceId);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("6.00");
  await assertNoHorizontalOverflow(page, 390);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "6.00", Bob: "0.00", Cara: "-6.00" }, expenseTotal: "12.00", paymentTotal: "6.00", expenseCount: 1, paymentCount: 1,
  }, aliceId);

  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  await page.getByLabel("Your username").fill(" aLiCe ");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(aliceId);
  await assertNoHorizontalOverflow(page, 320);

  await openRoute(page, appServer.url, "expenses", "Expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("6.00");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  await page.getByLabel("Cara", { exact: true }).check();
  await assertNoHorizontalOverflow(page, 320);
  await page.getByRole("button", { name: "Create expense" }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "12.00", Bob: "-3.00", Cara: "-9.00" }, expenseTotal: "18.00", paymentTotal: "6.00", expenseCount: 2, paymentCount: 1,
  }, aliceId);
  expect(state.expenses).toHaveLength(2);

  await page.getByRole("button", { name: "Record payment: Bob pays Alice $3.00" }).click();
  await expect(page.getByRole("heading", { name: "Review suggested payment" })).toBeVisible();
  await assertNoHorizontalOverflow(page, 320);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  state = await assertLedgerAndView(page, appServer.url, {
    nets: { Alice: "9.00", Bob: "0.00", Cara: "-9.00" }, expenseTotal: "18.00", paymentTotal: "9.00", expenseCount: 2, paymentCount: 2,
  }, aliceId);
  await assertNoHorizontalOverflow(page, 320);
  await assertNoBrowserErrors(testInfo, browserErrors, { expectedConflictResponses: 1 });
});
