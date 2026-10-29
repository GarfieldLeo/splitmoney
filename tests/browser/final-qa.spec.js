import { test, expect } from "./fixtures.js";

async function signIn(page, baseUrl, username = "Alice") {
  await page.goto(`${baseUrl}/`);
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
}

async function createUser(page, baseUrl, username) {
  const response = await page.request.post(`${baseUrl}/api/users`, { data: { username } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createExpense(page, baseUrl, { payerId, targetUserIds = null, amount }) {
  const response = await page.request.post(`${baseUrl}/api/expenses`, {
    data: { payer_id: payerId, target_user_ids: targetUserIds, amount },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createPayment(page, baseUrl, { senderId, recipientId, amount }) {
  const response = await page.request.post(`${baseUrl}/api/settlements`, {
    data: { payer_id: senderId, target_user_id: recipientId, amount },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function expectNoHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(widths.document, widths.body)).toBeLessThanOrEqual(widths.viewport);
}

async function expectNamedControls(page) {
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, a, input, select, textarea, [role='button']")]
    .filter((element) => element.getClientRects().length > 0)
    .filter((element) => {
      const explicitName = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
      if (explicitName?.trim()) return false;
      if (element.matches("input, select, textarea")) return element.labels?.length !== 1;
      return !element.textContent?.trim();
    })
    .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`));
  expect(unnamed).toEqual([]);
}

async function expectTouchTargetsAtLeast44px(page, selector) {
  const heights = await page.locator(selector).evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => element.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
}

test("final live-ledger accessibility and screenshot review across primary pages", async ({ page, appServer }, testInfo) => {
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  const cara = await createUser(page, appServer.url, "Cara");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "60.00" });
  await createExpense(page, appServer.url, { payerId: bob.id, amount: "30.00" });
  await createPayment(page, appServer.url, { senderId: bob.id, recipientId: aliceId, amount: "15.00" });
  await page.getByRole("button", { name: "Refresh" }).click();

  const screenshotsEnabled = ["mobile-chromium", "desktop-chromium"].includes(testInfo.project.name);
  const routes = [
    { route: "overview", title: "Your group overview" },
    { route: "expenses", title: "Expenses" },
    { route: "payments", title: "Payments" },
    { route: "people", title: "People" },
  ];

  for (const { route, title } of routes) {
    if (route !== "overview") {
      const navigation = page.getByRole("navigation", { name: "Main navigation" });
      const link = navigation.getByRole("link", { name: route[0].toUpperCase() + route.slice(1), exact: true });
      if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) {
        await link.tap();
      } else {
        await link.click();
      }
    }

    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
      name: route[0].toUpperCase() + route.slice(1), exact: true,
    })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalOverflow(page);
    await expectNamedControls(page);
    if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) {
      await expectTouchTargetsAtLeast44px(page, ".nav-item");
    }

    if (route === "overview") {
      await expect(page.locator(`[data-overview-user="${aliceId}"] .overview-net`)).toHaveText("Should receive $15.00");
      await expect(page.locator(`[data-overview-user="${bob.id}"] .overview-net`)).toHaveText("Should receive $15.00");
      await expect(page.locator(`[data-overview-user="${cara.id}"] .overview-net`)).toHaveText("Should pay $30.00");
      await expect(page.locator("[data-overview-status]")).toHaveAttribute("aria-live", "polite");
    } else if (route === "expenses") {
      await expect(page.locator(".expense-card")).toHaveCount(2);
      if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) {
        await expectTouchTargetsAtLeast44px(page, ".expense-action");
      }
    } else if (route === "payments") {
      await expect(page.locator(".settlement-card")).toContainText("Bob paid Alice");
      await expect(page.locator(".settlement-card")).toContainText("$15.00");
      if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) {
        await expectTouchTargetsAtLeast44px(page, ".settlement-action");
      }
    } else {
      await expect(page.locator(".people-row")).toHaveCount(3);
      if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) {
        await expectTouchTargetsAtLeast44px(page, ".people-action");
      }
    }

    if (screenshotsEnabled) {
      const screenshotPath = testInfo.outputPath(`${testInfo.project.name}-${route}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      console.log(`[Q03 screenshot] ${screenshotPath}`);
    }
  }

  const addPerson = page.getByRole("button", { name: "Add person" });
  await addPerson.click();
  await expect(page.getByRole("heading", { name: "Add a person" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeFocused();
  await expect(page.getByLabel("Phone number (optional)")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(addPerson).toBeFocused();

  const expensesLink = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Expenses", exact: true });
  if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) await expensesLink.tap();
  else await expensesLink.click();
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  await expect(page.getByLabel("Amount")).toBeFocused();
  await expect(page.getByLabel("Amount")).toHaveCSS("outline-style", "solid");
  await expect(page.getByLabel("Amount")).toHaveCSS("outline-width", "3px");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Add expense" })).toBeFocused();

  const paymentsLink = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Payments", exact: true });
  if (["mobile-chromium", "narrow-chromium", "mobile-webkit"].includes(testInfo.project.name)) await paymentsLink.tap();
  else await paymentsLink.click();
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(page.getByRole("heading", { name: "Add a payment" })).toBeVisible();
  await expect(page.getByLabel("Amount")).toBeFocused();
  await expect(page.getByLabel("Amount")).toHaveCSS("outline-style", "solid");
  await expect(page.getByLabel("Amount")).toHaveCSS("outline-width", "3px");
  await expect(page.getByLabel("Amount")).toHaveAttribute("inputmode", "decimal");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Add payment" })).toBeFocused();
});

test("20-person lists and selected targets remain scroll-reachable on mobile widths", async ({ page, appServer }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "The desktop screenshot test covers the wide layout; this check is for mobile and narrow touch viewports.");
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  for (let index = 1; index <= 19; index += 1) {
    await createUser(page, appServer.url, `Member ${String(index).padStart(2, "0")}`);
  }
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "100.00" });
  await page.getByRole("button", { name: "Refresh" }).click();

  const overviewRows = page.locator(".overview-person-row");
  await expect(overviewRows).toHaveCount(20);
  const lastBalanceRow = overviewRows.last();
  await lastBalanceRow.scrollIntoViewIfNeeded();
  await expect(lastBalanceRow).toBeInViewport();
  await expect(lastBalanceRow.locator(".overview-net")).toContainText("Should pay");
  await expectNoHorizontalOverflow(page);

  const expensesLink = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Expenses", exact: true });
  await expensesLink.tap();
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("radio", { name: "Selected people" }).check();
  const targetList = page.locator("#expense-target-list");
  const targetChoices = targetList.locator(".expense-target-choice");
  await expect(targetChoices).toHaveCount(20);
  const lastTarget = targetChoices.last();
  await lastTarget.scrollIntoViewIfNeeded();
  await expect(lastTarget).toBeInViewport();
  await lastTarget.locator("input").check();
  await expect(lastTarget.locator("input")).toBeChecked();
  await expectNoHorizontalOverflow(page);

  const lastTargetBox = await lastTarget.boundingBox();
  expect(lastTargetBox.height).toBeGreaterThanOrEqual(44);
});

test("short mobile viewport simulation keeps expense actions reachable above bottom navigation", async ({ page, appServer }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "This is a reduced-height mobile viewport simulation, not a hardware keyboard test.");
  const width = testInfo.project.name === "narrow-chromium" ? 320 : 390;
  await page.setViewportSize({ width, height: 520 });
  await signIn(page, appServer.url);
  const aliceId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const bob = await createUser(page, appServer.url, "Bob");
  await createExpense(page, appServer.url, { payerId: aliceId, amount: "8.00" });
  const expensesLink = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Expenses", exact: true });
  await expensesLink.tap();
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("3.25");
  await page.getByRole("radio", { name: "Selected people" }).check();
  await page.getByLabel("Bob", { exact: true }).check();
  const submit = page.getByRole("button", { name: "Create expense" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  const submitBox = await submit.boundingBox();
  const navigationBox = await page.locator("#primary-navigation").boundingBox();
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(navigationBox.y);
  await expectNoHorizontalOverflow(page);
  console.log(`[Q03 simulated viewport] ${width} × 520; no software keyboard was opened.`);
});

test("reload clears a username selection deleted by another client", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const selectedId = await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"));
  const response = await page.request.delete(`${appServer.url}/api/users/${selectedId}`);
  expect(response.status()).toBe(204);

  await page.reload();
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("splitmoney.selectedUserId"))).toBeNull();
});
