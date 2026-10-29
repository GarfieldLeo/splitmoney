import { test, expect } from "./fixtures.js";

const SESSION_KEY = "splitmoney.selectedUserId";

async function signIn(page, username) {
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("new and returning users can join, reload, switch, and follow a direct route", async ({ page, appServer }) => {
  await page.goto(`${appServer.url}/`);
  await expect(page.getByRole("heading", { name: "Who’s sharing expenses?" })).toBeVisible();
  await expect(page.getByText(/Anyone can choose any username/)).toBeVisible();

  await signIn(page, "  Alice  ");
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  const firstId = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(firstId).toBeTruthy();
  await expect(page.locator("#account-name")).toHaveText("Alice");

  await page.goto(`${appServer.url}/#expenses`);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Expenses" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(page.locator("#account-name")).toHaveText("Alice");

  await page.evaluate(() => { window.location.hash = "#not-a-tab"; });
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();

  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  await signIn(page, "aLiCe");
  await expect(page.locator("#account-name")).toHaveText("Alice");
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(firstId);
});

test("removed remembered users return to the name form", async ({ page, appServer }) => {
  const response = await page.request.post(`${appServer.url}/api/login`, { data: { username: "Removed Person" } });
  const user = await response.json();
  expect(response.status()).toBe(200);
  const removed = await page.request.delete(`${appServer.url}/api/users/${user.id}`);
  expect(removed.status()).toBe(204);

  await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), { key: SESSION_KEY, id: user.id });
  await page.goto(`${appServer.url}/#people`);
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
});

test("a network failure while checking a remembered user keeps the selection for retry", async ({ page, appServer }) => {
  const response = await page.request.post(`${appServer.url}/api/login`, { data: { username: "Casey" } });
  const user = await response.json();
  let failedOnce = false;
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), { key: SESSION_KEY, id: user.id });
  await page.route("**/api/users", async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await page.goto(appServer.url);
  await expect(page.getByRole("heading", { name: "We couldn’t check your account" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(user.id);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#account-name")).toHaveText("Casey");
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
});

test("a failed login preserves the username and a retry creates one account", async ({ page, appServer }) => {
  let calls = 0;
  await page.route("**/api/login", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "service_unavailable", message: "Please try again." } }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto(appServer.url);
  const input = page.getByLabel("Your username");
  await input.fill("Morgan");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("Please try again.");
  await expect(input).toHaveValue("Morgan");

  await page.evaluate(() => {
    const form = document.querySelector("form");
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  expect(calls).toBe(2);
  const users = await page.request.get(`${appServer.url}/api/users`).then((result) => result.json());
  expect(users).toHaveLength(1);
  expect(users[0].username).toBe("Morgan");
});

test("a network failure during login keeps the typed username for retry", async ({ page, appServer }) => {
  let failedOnce = false;
  await page.route("**/api/login", async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.goto(appServer.url);
  const input = page.getByLabel("Your username");
  await input.fill("Riley");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Could not reach Splitmoney/);
  await expect(input).toHaveValue("Riley");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
  const users = await page.request.get(`${appServer.url}/api/users`).then((result) => result.json());
  expect(users).toHaveLength(1);
  expect(users[0].username).toBe("Riley");
});

test("late view work cannot repaint the screen after switching users", async ({ page, appServer }) => {
  await page.goto(appServer.url);
  await signIn(page, "Jamie");
  await page.evaluate(async () => {
    const { registerView } = await import("/static/js/app.js");
    registerView("people", async (root, context) => {
      const waiting = document.createElement("p");
      waiting.textContent = "Waiting for the people list…";
      root.replaceChildren(waiting);
      await new Promise((resolve) => { window.finishPeopleView = resolve; });
      if (context.isCurrent()) {
        const stale = document.createElement("p");
        stale.textContent = "Stale people result";
        root.append(stale);
      }
    });
  });

  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByText("Waiting for the people list…")).toBeVisible();
  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  await page.evaluate(() => window.finishPeopleView());
  await expect(page.getByRole("heading", { name: "Who’s sharing expenses?" })).toBeVisible();
  await expect(page.getByText("Stale people result")).toHaveCount(0);
});

test("the API client handles 204, validation envelopes, and network failures", async ({ page, appServer }) => {
  await page.route("**/api/no-content", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/client-validation", (route) => route.fulfill({
    status: 422,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "validation_error", message: "Enter a username." } }),
  }));
  await page.route("**/api/client-offline", (route) => route.abort("failed"));
  await page.goto(appServer.url);

  const result = await page.evaluate(async () => {
    const { apiRequest } = await import("/static/js/api.js");
    const noContent = await apiRequest("/api/no-content", { method: "DELETE" });
    let validation;
    try {
      await apiRequest("/api/client-validation", { method: "POST", body: {} });
    } catch (error) {
      validation = { name: error.name, status: error.status, code: error.code, message: error.message, network: error.network };
    }
    let offline;
    try {
      await apiRequest("/api/client-offline");
    } catch (error) {
      offline = { name: error.name, status: error.status, code: error.code, network: error.network };
    }
    return { noContent: noContent === undefined, validation, offline };
  });

  expect(result.noContent).toBe(true);
  expect(result.validation).toEqual({ name: "ApiError", status: 422, code: "validation_error", message: "Enter a username.", network: false });
  expect(result.offline).toEqual({ name: "ApiError", status: null, code: "network_error", network: true });
});

test("the login and navigation fit 320px and work from the keyboard", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appServer.url);
  const input = page.getByLabel("Your username");
  await input.fill("Avery-Cedar-Long-Last-Name");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navItems: [...document.querySelectorAll(".nav-item")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.navItems).toHaveLength(4);
  for (const item of dimensions.navItems) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }
});
