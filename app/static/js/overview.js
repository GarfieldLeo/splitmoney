import { mountSettlementEditor } from "./settlements.js";

function text(context, tag, value, options = {}) {
  return context.element(tag, { ...options, text: value });
}

function ensureStyles() {
  if (document.querySelector("link[data-overview-styles]")) return;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/static/overview.css";
  stylesheet.dataset.overviewStyles = "";
  document.head.append(stylesheet);
}

function statusLabel(context, net) {
  const value = Number(net);
  if (value > 0) return "Should receive " + context.formatUsd(net);
  if (value < 0) return "Should pay " + context.formatUsd(net.replace(/^-/, ""));
  return "Settled up";
}

function statusClass(net) {
  const value = Number(net);
  if (value > 0) return "overview-net overview-net-positive";
  if (value < 0) return "overview-net overview-net-negative";
  return "overview-net overview-net-zero";
}

function buildOverview(context) {
  const root = context.element("section", {
    className: "overview-view",
    attributes: { "aria-labelledby": "overview-heading" },
  });
  const heading = context.element("div", { className: "page-heading" });
  const copy = context.element("div", { className: "page-heading-copy" });
  copy.append(
    text(context, "p", "Your shared ledger", { className: "eyebrow" }),
    text(context, "h1", "Your group overview", { className: "view-heading", attributes: { id: "overview-heading" } }),
    text(context, "p", "See where everyone stands and review the group’s current suggestions.", { className: "page-description" }),
  );
  const refresh = text(context, "button", "Refresh", {
    className: "secondary-button",
    attributes: { type: "button", "data-overview-refresh": "" },
  });
  heading.append(copy, refresh);

  const status = context.element("p", {
    className: "overview-view-status",
    attributes: { role: "status", "aria-live": "polite", "data-overview-status": "" },
  });
  status.hidden = true;

  const personal = context.element("section", {
    className: "overview-personal-card",
    attributes: { "aria-labelledby": "overview-personal-heading" },
  });
  personal.append(
    text(context, "p", "Your current balance", { className: "overview-card-kicker" }),
    text(context, "h2", "Loading your balance…", {
      className: "overview-personal-state",
      attributes: { id: "overview-personal-heading", "data-overview-personal": "" },
    }),
    text(context, "p", "A positive balance means the group should pay you back. A negative balance means you should pay the group.", {
      className: "overview-personal-help",
    }),
  );

  const totalCard = context.element("section", {
    className: "overview-total-card",
    attributes: { "aria-labelledby": "overview-total-heading" },
  });
  totalCard.append(
    text(context, "p", "Group activity", { className: "overview-card-kicker" }),
    text(context, "h2", "Total expenses", { className: "overview-total-label", attributes: { id: "overview-total-heading" } }),
    text(context, "p", "—", { className: "overview-total-value", attributes: { "data-overview-expenses": "" } }),
    text(context, "p", "Recorded payments", { className: "overview-total-caption" }),
    text(context, "p", "—", { className: "overview-total-payments", attributes: { "data-overview-settlements": "" } }),
  );

  const groupSection = context.element("section", {
    className: "overview-group-section",
    attributes: { "aria-labelledby": "overview-group-heading" },
  });
  const groupHeading = text(context, "h2", "Group balances", {
    className: "overview-section-heading",
    attributes: { id: "overview-group-heading" },
  });
  const groupList = context.element("ul", {
    className: "overview-group-list",
    attributes: { "aria-labelledby": "overview-group-heading", "data-overview-group": "" },
  });
  groupList.append(context.element("li", {
    className: "overview-empty-state",
    children: [text(context, "p", "Loading group balances…")],
  }));
  groupSection.append(groupHeading, groupList);

  const suggestionsSection = context.element("section", {
    className: "overview-suggestions-section",
    attributes: { "aria-labelledby": "overview-suggestions-heading" },
  });
  const suggestionsHeading = text(context, "h2", "Suggested payments", {
    className: "overview-section-heading",
    attributes: { id: "overview-suggestions-heading" },
  });
  const suggestionsDescription = text(context, "p", "Suggestions show a possible way to settle the current balances. They are not payments until someone records money already sent.", {
    className: "overview-section-description",
  });
  const suggestionsList = context.element("ul", {
    className: "overview-suggestions-list",
    attributes: { "aria-labelledby": "overview-suggestions-heading", "data-overview-suggestions": "" },
  });
  suggestionsList.append(context.element("li", {
    className: "overview-empty-state",
    children: [text(context, "p", "Loading suggestions…")],
  }));
  const editorSlot = context.element("div", { className: "overview-editor-slot" });
  suggestionsSection.append(suggestionsHeading, suggestionsDescription, suggestionsList, editorSlot);

  root.append(heading, status, personal, totalCard, groupSection, suggestionsSection);
  root._personalBalance = personal.querySelector("[data-overview-personal]");
  root._expenseTotal = totalCard.querySelector("[data-overview-expenses]");
  root._settlementTotal = totalCard.querySelector("[data-overview-settlements]");
  root._groupList = groupList;
  root._suggestionsList = suggestionsList;
  root._editorSlot = editorSlot;
  root._status = status;
  root._refresh = null;
  return root;
}

function setViewStatus(context, root, message, tone = "info") {
  if (!context.isCurrent()) return;
  root._status.textContent = message || "";
  root._status.dataset.tone = tone;
  root._status.hidden = !message;
}

function renderGroup(context, list, users, selectedId) {
  list.replaceChildren();
  if (!users.length) {
    list.append(context.element("li", {
      className: "overview-empty-state",
      children: [
        text(context, "h3", "No one is in the group yet"),
        text(context, "p", "Add a person and a shared expense to start the group ledger."),
      ],
    }));
    return;
  }

  for (const user of users) {
    const item = context.element("li", {
      className: "overview-person-row",
      attributes: { "data-overview-user": user.user_id },
    });
    const person = context.element("div", { className: "overview-person-details" });
    const nameLine = context.element("div", { className: "overview-name-line" });
    nameLine.append(text(context, "h3", user.username, { className: "overview-person-name" }));
    if (user.user_id === selectedId) {
      nameLine.append(text(context, "span", "You", { className: "overview-current-badge" }));
    }
    const net = text(context, "p", statusLabel(context, user.net), {
      className: statusClass(user.net),
      attributes: { "aria-label": "Net balance: " + statusLabel(context, user.net) },
    });
    person.append(nameLine, net);

    const components = context.element("dl", {
      className: "overview-components",
      attributes: { "aria-label": user.username + " balance details" },
    });
    const values = [
      ["Expense paid", user.expense_paid],
      ["Expense share", user.expense_share],
      ["Payments sent", user.settlement_sent],
      ["Payments received", user.settlement_received],
    ];
    for (const [label, amount] of values) {
      components.append(
        text(context, "dt", label),
        text(context, "dd", context.formatUsd(amount)),
      );
    }
    item.append(person, components);
    list.append(item);
  }
}

function renderSuggestions(context, root, suggestions, users, balances) {
  const list = root._suggestionsList;
  list.replaceChildren();
  if (!suggestions.length) {
    const allSettled = balances.users.every((user) => Number(user.net) === 0);
    list.append(context.element("li", {
      className: "overview-empty-state",
      children: [
        text(context, "h3", allSettled ? "Everyone is settled up" : "No suggested payments"),
        text(context, "p", allSettled
          ? "There are no suggested payments right now. New shared activity can change these balances."
          : "The current balances do not have a suggested transfer."),
      ],
    }));
    return;
  }
  for (const suggestion of suggestions) {
    const item = context.element("li", { className: "overview-suggestion-row" });
    const description = text(
      context,
      "p",
      suggestion.from_username + " pays " + suggestion.to_username + " " + context.formatUsd(suggestion.amount),
      { className: "overview-suggestion-description" },
    );
    const record = text(context, "button", "Record payment", {
      className: "secondary-button overview-record-button",
      attributes: {
        type: "button",
        "data-overview-record": "",
        "data-overview-suggestion": suggestion.from_user_id + ":" + suggestion.to_user_id,
        "aria-label": "Record payment: " + suggestion.from_username + " pays " + suggestion.to_username + " " + context.formatUsd(suggestion.amount),
      },
    });
    record.disabled = root._editorSlot?.dataset.settlementPending === "true";
    record.addEventListener("click", () => void reviewSuggestion({ context, root, suggestion, users }));
    item.append(description, record);
    list.append(item);
  }
}

function applyBalances(context, root, balances, users) {
  if (!context.isCurrent()) return;
  const selectedId = context.getSelectedUserId();
  const mine = balances.users.find((user) => user.user_id === selectedId);
  if (mine) {
    const state = Number(mine.net) > 0
      ? "You should receive " + context.formatUsd(mine.net)
      : Number(mine.net) < 0
        ? "You should pay " + context.formatUsd(mine.net.replace(/^-/, ""))
        : "You're settled up";
    root._personalBalance.textContent = state;
    root._personalBalance.dataset.balance = Number(mine.net) > 0 ? "receive" : Number(mine.net) < 0 ? "pay" : "settled";
  } else {
    root._personalBalance.textContent = "Your balance is unavailable";
  }
  root._expenseTotal.textContent = context.formatUsd(balances.totals.expenses);
  root._settlementTotal.textContent = context.formatUsd(balances.totals.settlements);
  renderGroup(context, root._groupList, balances.users, selectedId);
  renderSuggestions(context, root, balances.suggested_payments, users, balances);
  root._balances = balances;
  root._users = users;
}

function observeForRouteRemoval(context, root) {
  const host = root.parentNode;
  if (!host) return;
  const refreshOnReturn = () => {
    if (!context.isCurrent() || document.visibilityState !== "visible") return;
    void root._refresh?.().catch(() => {});
  };
  document.addEventListener("visibilitychange", refreshOnReturn);
  const observer = new MutationObserver(() => {
    if (root.parentNode === host) return;
    document.removeEventListener("visibilitychange", refreshOnReturn);
    observer.disconnect();
  });
  observer.observe(host, { childList: true });
}

async function reviewSuggestion({ context, root, suggestion }) {
  if (!context.isCurrent()) return;
  if (root._editorSlot.querySelector(".settlement-editor")) {
    setViewStatus(context, root, "Finish or cancel the payment form that is already open before reviewing another suggestion.", "info");
    return;
  }
  const recordLabel = "Record payment: " + suggestion.from_username + " pays " + suggestion.to_username + " " + context.formatUsd(suggestion.amount);
  const recordButton = [...root.querySelectorAll("[data-overview-record]")]
    .find((button) => button.getAttribute("aria-label") === recordLabel);
  if (recordButton) {
    recordButton.disabled = true;
    recordButton.textContent = "Checking…";
  }
  setViewStatus(context, root, "Checking the latest balances before opening this payment for review…");
  try {
    const [people, balances] = await Promise.all([context.refreshUsers(), context.api.getBalances()]);
    if (!context.isCurrent() || people.state !== "ready") return;
    applyBalances(context, root, balances, people.users);
    const current = balances.suggested_payments.find((item) =>
      item.from_user_id === suggestion.from_user_id && item.to_user_id === suggestion.to_user_id,
    );
    if (!current) {
      setViewStatus(context, root, "That suggestion changed after the latest refresh. Review the current suggestions before recording a payment.");
      return;
    }
    if (root._editorSlot.querySelector(".settlement-editor")) {
      setViewStatus(context, root, "A payment form is already open. Finish or cancel it before reviewing another suggestion.");
      return;
    }
    const editor = mountSettlementEditor({
      context,
      slot: root._editorSlot,
      users: people.users,
      draft: {
        suggested: true,
        payer_id: current.from_user_id,
        target_user_id: current.to_user_id,
        amount: current.amount,
      },
      returnFocus: () => root.querySelector('[data-overview-suggestion="' + current.from_user_id + ":" + current.to_user_id + '"]')?.focus({ preventScroll: true }),
      onSaved: (state) => {
        if (!context.isCurrent() || !state) return;
        applyBalances(context, root, state.balances, state.users);
      },
    });
    if (!editor) setViewStatus(context, root, "This payment form could not be opened. Refresh and try again.", "error");
    else setViewStatus(context, root, "Review the current suggestion below. It will only be recorded if you choose Record payment.");
  } catch (error) {
    if (!context.isCurrent()) return;
    setViewStatus(context, root, "The latest balances could not be loaded. " + (error?.message || "Please refresh and try again."), "error");
  } finally {
    if (context.isCurrent()) {
      const currentButtons = [...root.querySelectorAll("[data-overview-record]")];
      for (const button of currentButtons) {
        button.disabled = false;
        button.textContent = "Record payment";
      }
      if (recordButton?.isConnected) {
        recordButton.disabled = false;
        recordButton.textContent = "Record payment";
      }
    }
  }
}

export async function renderView(contentRoot, context) {
  ensureStyles();
  const root = buildOverview(context);
  contentRoot.replaceChildren(root);

  let inFlight = null;
  const refreshBalances = async ({ button = null, announce = false } = {}) => {
    if (!context.isCurrent()) return null;
    if (inFlight) return inFlight;
    if (button) {
      button.disabled = true;
      button.textContent = "Refreshing…";
    }
    inFlight = (async () => {
      try {
        const [people, balances] = await Promise.all([context.refreshUsers(), context.api.getBalances()]);
        if (!context.isCurrent() || people.state !== "ready") return null;
        applyBalances(context, root, balances, people.users);
        setViewStatus(context, root, announce ? "Balances and suggestions are up to date." : "");
        if (button) {
          button.disabled = false;
          button.textContent = "Refresh";
        }
        return balances;
      } catch (error) {
        if (!context.isCurrent()) return null;
        const existingForm = root._editorSlot.querySelector(".settlement-editor");
        setViewStatus(context, root, (existingForm ? "Your payment form is unchanged. " : "") + (error?.message || "Balances could not be loaded. Try again."), "error");
        if (button) {
          button.disabled = false;
          button.textContent = "Refresh";
        }
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
  root._refresh = refreshBalances;
  const refreshButton = root.querySelector("[data-overview-refresh]");
  refreshButton.addEventListener("click", () => void refreshBalances({ button: refreshButton, announce: true }).catch(() => {}));
  observeForRouteRemoval(context, root);

  try {
    await refreshBalances();
  } catch {
    if (!context.isCurrent()) return;
    root._groupList.replaceChildren(context.element("li", {
      className: "overview-empty-state",
      children: [
        text(context, "h3", "Balances couldn’t load"),
        text(context, "p", "Check your connection, then refresh to try again."),
      ],
    }));
    root._suggestionsList.replaceChildren(context.element("li", {
      className: "overview-empty-state",
      children: [text(context, "p", "Suggestions will appear after balances load.")],
    }));
  }
}

export default renderView;
