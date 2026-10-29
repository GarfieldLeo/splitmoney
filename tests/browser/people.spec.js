import { test, expect } from "./fixtures.js";

const SESSION_KEY = "splitmoney.selectedUserId";

async function signIn(page, baseUrl, username) {
  await page.goto(baseUrl);
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your group overview" })).toBeVisible();
}

async function openPeople(page, baseUrl) {
  await page.goto(`${baseUrl}/#people`);
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
}

async function createPerson(page, username, phone = "") {
  await page.getByRole("button", { name: "Add person" }).click();
  const usernameInput = page.getByLabel("Username");
  await expect(usernameInput).toBeFocused();
  await usernameInput.fill(username);
  if (phone) await page.getByLabel("Phone number (optional)").fill(phone);
  await page.getByRole("button", { name: "Create person" }).click();
}

test("people can be added, duplicate names show the API conflict, and profile edits persist", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  await openPeople(page, appServer.url);

  await expect(page.getByText(/Adding a person includes them in past expenses marked Everyone/)).toBeVisible();
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a username.");
  await page.getByLabel("Username").fill("Bob");
  await page.getByLabel("Phone number (optional)").fill("  212-555-0102  ");
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
  await expect(page.getByText("212-555-0102", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username").fill("ALICE");
  const duplicateCreate = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/api/users"));
  await page.getByRole("button", { name: "Create person" }).click();
  expect((await duplicateCreate).status()).toBe(409);
  await expect(page.getByRole("alert")).toHaveText("That username is already in use.");
  await expect(page.getByLabel("Username")).toHaveValue("ALICE");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Add person" })).toBeFocused();

  const duplicateResponse = await page.request.post(`${appServer.url}/api/users`, { data: { username: "ALICE" } });
  expect(duplicateResponse.status()).toBe(409);
  await page.getByRole("button", { name: "Edit Bob" }).click();
  await expect(page.getByRole("heading", { name: "Edit Bob" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeFocused();
  await page.getByLabel("Username").fill("ALICE");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("That username is already in use.");
  await expect(page.getByLabel("Username")).toHaveValue("ALICE");
  await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit Bob" })).toBeFocused();
  await page.getByRole("button", { name: "Edit Bob" }).click();

  await page.getByLabel("Username").fill("Robert");
  await page.getByLabel("Phone number (optional)").fill("  +1 (212) 555-0102  ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Robert", exact: true })).toBeVisible();
  await expect(page.getByText("+1 (212) 555-0102", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit Robert" }).click();
  await page.getByLabel("Phone number (optional)").fill("   ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".people-row").filter({ has: page.getByRole("heading", { name: "Robert", exact: true }) }).getByText("No phone number added", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Robert", exact: true })).toBeVisible();
  await expect(page.locator(".people-row").filter({ has: page.getByRole("heading", { name: "Robert", exact: true }) }).getByText("No phone number added", { exact: true })).toBeVisible();
});

test("renaming the current person preserves the selected UUID and refreshes the header", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const selectedId = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  await openPeople(page, appServer.url);
  await page.getByRole("button", { name: "Edit Alice" }).click();
  await page.getByLabel("Username").fill("Alicia");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.locator("#account-name")).toHaveText("Alicia");
  await expect(page.getByRole("heading", { name: "Alicia", exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(selectedId);
  await page.reload();
  await expect(page.locator("#account-name")).toHaveText("Alicia");
  await expect(page.getByRole("heading", { name: "Alicia", exact: true })).toBeVisible();
});

test("unused deletion works, cancel keeps the row, and referenced users stay visible", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  const aliceId = await page.evaluate(async () => {
    const selected = localStorage.getItem("splitmoney.selectedUserId");
    const users = await fetch("/api/users").then((response) => response.json());
    return users.find((user) => user.id === selected).id;
  });
  const bobResponse = await page.request.post(`${appServer.url}/api/users`, { data: { username: "Bob" } });
  const bob = await bobResponse.json();
  const caraResponse = await page.request.post(`${appServer.url}/api/users`, { data: { username: "Cara" } });
  const cara = await caraResponse.json();
  const expenseResponse = await page.request.post(`${appServer.url}/api/expenses`, {
    data: { payer_id: aliceId, target_user_ids: [bob.id], amount: "12.00" },
  });
  expect(expenseResponse.status()).toBe(201);

  await openPeople(page, appServer.url);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Cara");
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Delete Cara" }).click();
  await expect(page.getByRole("heading", { name: "Cara", exact: true })).toBeVisible();

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Cara");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete Cara" }).click();
  await expect(page.getByRole("heading", { name: "Cara", exact: true })).toHaveCount(0);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Bob");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete Bob" }).click();
  await expect(page.getByRole("alert")).toContainText("linked to an expense or payment, or an Everyone expense includes every current member");
  await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
  await expect(page.locator("#account-name")).toHaveText("Alice");
});

test("deleting the selected person returns to login and clears local selection", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Solo");
  await openPeople(page, appServer.url);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Solo");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete Solo" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
});

test("a saved person stays in the form when the canonical reload fails, then reloads without resubmitting", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  await openPeople(page, appServer.url);

  let failNextPost = true;
  let failNextList = false;
  await page.route("**/api/users**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      if (failNextPost) {
        failNextPost = false;
        await route.abort("failed");
        return;
      }
      const response = await route.fetch();
      await route.fulfill({ response });
      failNextList = response.status() === 201;
      return;
    }
    if (request.method() === "GET" && failNextList) {
      failNextList = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username").fill("Morgan");
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not reach Splitmoney");
  await expect(page.getByLabel("Username")).toHaveValue("Morgan");
  await expect(page.getByRole("button", { name: "Create person" })).toBeEnabled();
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("alert")).toContainText("Your change was saved, but the group list could not be reloaded.");
  await expect(page.getByLabel("Username")).toHaveValue("Morgan");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  await page.getByRole("button", { name: "Reload people" }).click();
  await expect(page.getByRole("heading", { name: "Morgan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add person" })).toBeFocused();
  const users = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
  expect(users.filter((user) => user.username === "Morgan")).toHaveLength(1);
});

test("a pending person save disables competing editors through the canonical reload", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Alice");
  await openPeople(page, appServer.url);
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Username").fill("Bob");

  let releasePost;
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  let postStarted;
  const postIntercepted = new Promise((resolve) => { postStarted = resolve; });
  let releaseList;
  const listGate = new Promise((resolve) => { releaseList = resolve; });
  let listStarted;
  const listIntercepted = new Promise((resolve) => { listStarted = resolve; });
  let holdCanonicalList = false;
  await page.route("**/api/users**", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      postStarted();
      await postGate;
      await route.continue();
      return;
    }
    if (method === "GET" && holdCanonicalList) {
      holdCanonicalList = false;
      listStarted();
      await listGate;
      await route.continue();
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Create person" }).click();
  await postIntercepted;
  const addPerson = page.getByRole("button", { name: "Add person" });
  await expect(addPerson).toBeDisabled();
  await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Phone number (optional)")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit Alice" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete Alice" })).toBeDisabled();

  holdCanonicalList = true;
  releasePost();
  const createResponse = await page.waitForResponse((response) =>
    response.url().endsWith("/api/users") && response.request().method() === "POST");
  expect(createResponse.status()).toBe(201);
  await listIntercepted;
  await expect(addPerson).toBeDisabled();
  await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();

  releaseList();
  await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
  await expect(addPerson).toBeEnabled();
  const users = await page.request.get(`${appServer.url}/api/users`).then((response) => response.json());
  expect(users.map((person) => person.username).sort()).toEqual(["Alice", "Bob"]);
});

test("retrying after selected-person deletion reconciles the deleted session", async ({ page, appServer }) => {
  await signIn(page, appServer.url, "Solo");
  await openPeople(page, appServer.url);

  let failNextList = false;
  await page.route("**/api/users**", async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      const response = await route.fetch();
      await route.fulfill({ response });
      failNextList = response.status() === 204;
      return;
    }
    if (request.method() === "GET" && failNextList) {
      failNextList = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete Solo" }).click();
  await expect(page.getByRole("alert")).toContainText("Deleted Solo, but the group list could not be reloaded.");
  await expect(page.locator("#account-name")).toHaveText("Solo");

  await page.getByRole("button", { name: "Reload people" }).click();
  await expect(page.getByLabel("Your username")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
});

test("HTML-like usernames render as text without creating elements or running handlers", async ({ page, appServer }) => {
  const maliciousName = "<img src=x onerror=window.peoplePwned=1>";
  await signIn(page, appServer.url, "Alice");
  await openPeople(page, appServer.url);
  await createPerson(page, maliciousName);

  await expect(page.locator(".people-name").getByText(maliciousName, { exact: true })).toBeVisible();
  await expect(page.locator(".people-row img")).toHaveCount(0);
  expect(await page.evaluate(() => window.peoplePwned ?? null)).toBeNull();
});

test("the People editor stays keyboard usable and fits a 390px viewport", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await signIn(page, appServer.url, "Avery-Cedar-Rowan-Linden-Brooks-TaylorXX");
  expect("Avery-Cedar-Rowan-Linden-Brooks-TaylorXX").toHaveLength(40);
  await openPeople(page, appServer.url);

  const addButton = page.getByRole("button", { name: "Add person" });
  await addButton.focus();
  await page.keyboard.press("Enter");
  const username = page.getByLabel("Username");
  await expect(username).toBeFocused();
  await username.fill("Keyboard Friend");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Phone number (optional)")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(addButton).toBeFocused();

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  expect(await page.getByRole("button", { name: "Add person" }).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.height >= 44;
  })).toBe(true);
});
