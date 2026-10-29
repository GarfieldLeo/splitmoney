import { api, ApiError } from "./api.js";
import {
  clearSelectedUser,
  getCurrentUser,
  getSelectedUserId,
  getSessionGeneration,
  loadSession,
  refreshUsers,
  session,
  setSelectedUser,
} from "./session.js";
import { element, formatUsd, inlineError, loadingPanel, setStatus } from "./ui.js";

const ROUTES = ["overview", "expenses", "payments", "people"];
const VIEW_MODULES = {
  overview: "./overview.js",
  expenses: "./expenses.js",
  payments: "./settlements.js",
  people: "./people.js",
};

const contentRoot = document.querySelector("#content-root");
const globalStatus = document.querySelector("#global-status");
const accountArea = document.querySelector("#account-area");
const accountName = document.querySelector("#account-name");
const navigation = document.querySelector("#primary-navigation");
const navItems = [...document.querySelectorAll(".nav-item[data-route]")];

const viewRegistry = new Map();
const moduleLoads = new Map();
let activeRoute = "overview";
let authenticated = false;
let renderRevision = 0;

function routeFromHash() {
  const candidate = window.location.hash.slice(1).toLowerCase();
  return ROUTES.includes(candidate) ? candidate : "overview";
}

function setRouteHash(route, { replace = false } = {}) {
  const hash = `#${route}`;
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, "", hash);
  else window.location.hash = hash;
}

function updateNavigation(route) {
  for (const item of navItems) {
    if (item.dataset.route === route) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
}

function updateAccount() {
  const user = getCurrentUser();
  accountArea.hidden = !authenticated || !user;
  navigation.hidden = !authenticated || !user;
  accountName.textContent = user?.username || "";
}

function clearGlobalStatus() {
  setStatus(globalStatus, "");
}

function announce(message, tone = "info") {
  setStatus(globalStatus, message, tone);
}

function focusViewHeading() {
  const heading = contentRoot.querySelector(".view-heading, h1, h2");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function loadingScreen(label = "Checking your account…") {
  contentRoot.replaceChildren(loadingPanel(label));
  accountArea.hidden = true;
  navigation.hidden = true;
}

function retryScreen(error) {
  const section = element("section", {
    className: "error-card",
    attributes: { "aria-labelledby": "session-retry-heading" },
  });
  section.append(
    element("p", { className: "eyebrow", text: "Your group ledger" }),
    element("h2", { className: "view-heading", text: "We couldn’t check your account", attributes: { id: "session-retry-heading" } }),
    element("p", {
      text: error?.network
        ? "Your saved username is still here. Check your connection and try again."
        : "Your saved username is still here. The group list could not be loaded, so we haven’t signed you out.",
    }),
  );
  const retry = element("button", { className: "primary-button", text: "Try again", attributes: { type: "button" } });
  retry.addEventListener("click", () => void checkRememberedUser(retry));
  section.append(retry);
  contentRoot.replaceChildren(section);
  accountArea.hidden = true;
  navigation.hidden = true;
  focusViewHeading();
}

function showLogin({ error = "", focus = false } = {}) {
  authenticated = false;
  updateAccount();
  clearGlobalStatus();

  const layout = element("div", { className: "login-layout" });
  const card = element("section", {
    className: "login-card",
    attributes: { "aria-labelledby": "login-heading" },
  });
  const icon = element("div", {
    className: "login-icon",
    attributes: { "aria-hidden": "true" },
  });
  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  iconSvg.setAttribute("viewBox", "0 0 24 24");
  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0");
  iconSvg.append(iconPath);
  icon.append(iconSvg);

  const heading = element("h1", { text: "Who’s sharing expenses?", attributes: { id: "login-heading" } });
  const description = element("p", {
    className: "login-copy",
    text: "Enter the username your group knows you by. We’ll bring you to the same shared ledger.",
  });
  const trusted = element("p", {
    className: "trusted-note",
    children: [
      element("span", { text: "ⓘ", attributes: { "aria-hidden": "true" } }),
      element("span", { text: "This is a trusted group space. Anyone can choose any username; there are no passwords or private accounts." }),
    ],
  });
  const form = element("form", { attributes: { novalidate: "" } });
  const field = element("div", { className: "field" });
  const label = element("label", { className: "field-label", text: "Your username", attributes: { for: "username" } });
  const input = element("input", {
    className: "text-input",
    attributes: {
      id: "username",
      name: "username",
      type: "text",
      autocomplete: "username",
      autocapitalize: "none",
      spellcheck: "false",
      enterkeyhint: "go",
      required: "",
      "aria-describedby": "username-hint",
    },
  });
  const hint = element("p", { className: "field-hint", text: "Use the name your group recognizes.", attributes: { id: "username-hint" } });
  field.append(label, input, hint);
  const submit = element("button", { className: "primary-button full-width", text: "Continue", attributes: { type: "submit" } });
  form.append(field);
  if (error) form.append(inlineError(error, "login-error"));
  form.append(submit);
  card.append(
    icon,
    element("p", { className: "eyebrow", text: "Your shared ledger" }),
    heading,
    description,
    trusted,
    form,
  );
  layout.append(card);
  contentRoot.replaceChildren(layout);

  let pending = false;
  form.addEventListener("input", () => {
    const currentError = form.querySelector("[role='alert']");
    if (currentError) currentError.remove();
    input.removeAttribute("aria-invalid");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const username = input.value.trim();
    if (!username) {
      input.focus();
      input.setAttribute("aria-invalid", "true");
      if (!form.querySelector("[role='alert']")) form.insertBefore(inlineError("Enter your username to continue.", "login-error"), submit);
      return;
    }
    if (Array.from(username).length > 40) {
      input.focus();
      input.setAttribute("aria-invalid", "true");
      const message = "Use no more than 40 Unicode characters for a username.";
      const currentError = form.querySelector("[role='alert']");
      if (currentError) currentError.textContent = message;
      else form.insertBefore(inlineError(message, "login-error"), submit);
      return;
    }
    input.removeAttribute("aria-invalid");
    pending = true;
    submit.disabled = true;
    submit.textContent = "Joining…";
    try {
      const result = await api.login(username);
      const user = result?.user || result;
      if (!user?.id || !user?.username) {
        throw new ApiError({ code: "invalid_response", message: "The server returned an incomplete user. Please try again." });
      }
      setSelectedUser(user);
      authenticated = true;
      activeRoute = routeFromHash();
      updateAccount();
      updateNavigation(activeRoute);
      clearGlobalStatus();
      setRouteHash(activeRoute, { replace: true });
      await renderActiveView({ focusHeading: true });
    } catch (requestError) {
      pending = false;
      submit.disabled = false;
      submit.textContent = "Continue";
      const message = requestError?.message || "Could not join the group. Please try again.";
      const currentError = form.querySelector("[role='alert']");
      if (currentError) currentError.textContent = message;
      else form.insertBefore(inlineError(message, "login-error"), submit);
      input.focus();
    }
  });

  if (focus) input.focus({ preventScroll: true });
}

function defaultPlaceholder(route) {
  const content = {
    overview: {
      eyebrow: "Your shared ledger",
      title: "Your group overview",
      description: "See how the group is doing, with a clear view of who should pay whom.",
      note: "Balances will show after the group ledger is connected.",
    },
    expenses: {
      eyebrow: "The shared tab",
      title: "Expenses",
      description: "Keep shared costs together and make it clear who paid and who was included.",
      note: "Expense entries will appear here when expense tracking is available.",
    },
    payments: {
      eyebrow: "Settling up",
      title: "Payments",
      description: "Record money the group has already paid back and review suggested next steps.",
      note: "Recorded payments and suggestions will appear here when settlement tracking is available.",
    },
    people: {
      eyebrow: "Your group",
      title: "People",
      description: "Keep everyone in the group in one place so shared expenses stay easy to follow.",
      note: "Group member details will appear here when people management is available.",
    },
  }[route];

  const card = element("section", { className: "placeholder-card", attributes: { "aria-labelledby": "page-heading" } });
  card.append(
    element("span", { className: "placeholder-kicker", text: content.eyebrow }),
    element("h1", { className: "view-heading", text: content.title, attributes: { id: "page-heading" } }),
    element("p", { text: content.description }),
    element("div", { className: "placeholder-rule", attributes: { "aria-hidden": "true" } }),
    element("div", {
      className: "placeholder-note",
      children: [
        element("span", { text: "✳", attributes: { "aria-hidden": "true" } }),
        element("span", { text: content.note }),
      ],
    }),
  );
  return card;
}

function createViewContext(route, revision, sessionGeneration) {
  const isCurrent = () =>
    revision === renderRevision &&
    route === activeRoute &&
    sessionGeneration === getSessionGeneration() &&
    Boolean(getSelectedUserId());
  const context = {
    route,
    api,
    session,
    getCurrentUser,
    getSelectedUserId,
    refreshUsers: async () => {
      if (!isCurrent()) return { state: "stale", generation: getSessionGeneration() };
      const result = await refreshUsers(api);
      if (result.state === "stale") return result;
      if (result.state === "login") {
        authenticated = false;
        renderRevision += 1;
        updateAccount();
        setRouteHash("overview", { replace: true });
        showLogin();
      } else if (result.state === "ready") {
        updateAccount();
      }
      return result;
    },
    isCurrent,
    refreshData: async () => {
      if (!isCurrent()) return false;
      await renderActiveView();
      return true;
    },
    setStatus: (message, tone = "info") => {
      if (isCurrent()) announce(message, tone);
    },
    announce: (message, tone = "info") => {
      if (isCurrent()) announce(message, tone);
    },
    element,
    inlineError,
    loadingPanel,
    formatUsd,
  };
  return Object.freeze(context);
}

/**
 * Register an async or sync view renderer. Signature: render(contentRoot, context).
 * A feature module may also export `renderView` (or a default renderer); the shell
 * discovers it lazily when the matching tab is opened.
 */
export function registerView(route, renderer) {
  if (!ROUTES.includes(route)) throw new TypeError(`Unknown Splitmoney route: ${route}`);
  if (typeof renderer !== "function") throw new TypeError("A view renderer must be a function.");
  viewRegistry.set(route, renderer);
  if (authenticated && route === activeRoute) void renderActiveView();
}

async function ensureView(route, revision) {
  if (viewRegistry.has(route)) return viewRegistry.get(route);
  if (!moduleLoads.has(route)) {
    const promise = import(VIEW_MODULES[route])
      .then((module) => {
        const renderer = module.renderView || module.default;
        if (typeof renderer === "function") viewRegistry.set(route, renderer);
        return renderer || null;
      })
      .catch(() => null);
    moduleLoads.set(route, promise);
  }
  const renderer = await moduleLoads.get(route);
  if (revision !== renderRevision) return null;
  return viewRegistry.get(route) || renderer;
}

async function renderActiveView({ focusHeading = false } = {}) {
  if (!authenticated || !getSelectedUserId()) return;
  const route = activeRoute;
  const revision = ++renderRevision;
  const sessionGeneration = getSessionGeneration();
  updateNavigation(route);
  updateAccount();
  clearGlobalStatus();
  contentRoot.replaceChildren(loadingPanel(`Loading ${route === "overview" ? "overview" : route}…`));

  const renderer = await ensureView(route, revision);
  if (revision !== renderRevision || route !== activeRoute || sessionGeneration !== getSessionGeneration()) return;
  if (renderer) {
    try {
      await renderer(contentRoot, createViewContext(route, revision, sessionGeneration));
    } catch (error) {
      if (revision !== renderRevision || sessionGeneration !== getSessionGeneration()) return;
      const card = element("section", { className: "error-card", attributes: { role: "alert" } });
      card.append(
        element("h2", { text: "This view couldn’t load" }),
        element("p", { text: error?.message || "Please try again." }),
        element("button", { className: "secondary-button", text: "Retry", attributes: { type: "button" } }),
      );
      card.querySelector("button").addEventListener("click", () => void renderActiveView());
      contentRoot.replaceChildren(card);
    }
  } else {
    contentRoot.replaceChildren(defaultPlaceholder(route));
  }
  if (focusHeading && revision === renderRevision && sessionGeneration === getSessionGeneration()) focusViewHeading();
}

async function checkRememberedUser(button = null) {
  if (button) {
    button.disabled = true;
    button.textContent = "Checking…";
  }
  loadingScreen("Checking your account…");
  const result = await loadSession(api);
  if (result.state === "stale") {
    if (getCurrentUser() && getSelectedUserId()) {
      authenticated = true;
      activeRoute = routeFromHash();
      updateAccount();
      await renderActiveView({ focusHeading: true });
    }
    return;
  }
  if (result.state === "error") {
    retryScreen(result.error);
    return;
  }
  if (result.state === "ready") {
    authenticated = true;
    activeRoute = routeFromHash();
    updateAccount();
    await renderActiveView({ focusHeading: true });
    return;
  }
  activeRoute = routeFromHash();
  showLogin();
}

document.querySelector("#switch-user").addEventListener("click", () => {
  clearSelectedUser();
  authenticated = false;
  setRouteHash("overview", { replace: true });
  showLogin({ focus: true });
});

window.addEventListener("hashchange", () => {
  if (!authenticated || !getSelectedUserId()) return;
  const route = routeFromHash();
  if (window.location.hash !== `#${route}`) setRouteHash(route, { replace: true });
  if (route !== activeRoute) {
    activeRoute = route;
    void renderActiveView({ focusHeading: true });
  }
});

activeRoute = routeFromHash();
if (!ROUTES.includes(window.location.hash.slice(1).toLowerCase())) setRouteHash("overview", { replace: true });
loadingScreen();
void checkRememberedUser();
