const AMOUNT_PATTERN = /^[0-9]+(?:\.[0-9]{1,2})?$/u;
const MAX_AMOUNT_CENTS = 99_999_999_999n;

function node(context, tag, value, options = {}) {
  return context.element(tag, { ...options, text: value });
}

function ensureExpensesStyles() {
  if (document.querySelector("link[data-expenses-styles]")) return;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/static/expenses.css";
  stylesheet.dataset.expensesStyles = "";
  document.head.append(stylesheet);
}

function escapeSelectorValue(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/gu, "\\$&");
}

function restoreFocus(root, { action, expenseId } = {}) {
  if (action === "edit" && expenseId) {
    root.querySelector(`[data-expense-edit="${escapeSelectorValue(expenseId)}"]`)?.focus({ preventScroll: true });
    return;
  }
  root.querySelector("[data-expense-add]")?.focus({ preventScroll: true });
}

function appendFormError(context, form, message) {
  form.querySelector("[data-expense-form-error]")?.remove();
  const alert = context.inlineError(message, "expense-form-error");
  alert.dataset.expenseFormError = "";
  alert.tabIndex = -1;
  const actions = form.querySelector(".expense-form-actions");
  form.insertBefore(alert, actions || null);
  return alert;
}

function clearFieldError(form, field) {
  field?.removeAttribute("aria-invalid");
  form.querySelector("[data-expense-form-error]")?.remove();
}

function validateAmount(value) {
  if (!AMOUNT_PATTERN.test(value)) {
    return "Enter dollars using digits and up to two decimal places, such as 12.50.";
  }
  const [dollars, fraction = ""] = value.split(".");
  const cents = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n) return "Enter an amount greater than $0.00.";
  if (cents > MAX_AMOUNT_CENTS) return "The amount cannot be greater than $999,999,999.99.";
  return "";
}

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function targetSummary(expense) {
  if (expense.target_user_ids === null) return "Everyone";
  const names = expense.target_usernames || [];
  if (!names.length) return "No participants";
  return names.join(", ");
}

function findUser(users, id) {
  return users.find((user) => user.id === id);
}

function expenseWritePending(root) {
  return root?.dataset.expenseWritePending === "true";
}

function setExpenseWritePending(root, pending) {
  if (!root) return;
  if (pending) root.dataset.expenseWritePending = "true";
  else delete root.dataset.expenseWritePending;
  root.querySelectorAll([
    "[data-expense-add]",
    "[data-expense-edit]",
    "[data-expense-delete]",
    ".expense-form input",
    ".expense-form select",
    ".expense-form button:not([data-expense-read-retry])",
  ].join(", ")).forEach((control) => {
    control.disabled = pending;
  });
}

function renderExpenseList(context, list, expenses, users) {
  list.replaceChildren();
  if (!expenses.length) {
    list.append(context.element("li", {
      className: "expense-empty-state",
      children: [
        node(context, "h2", "No expenses yet"),
        node(context, "p", "Add the first shared cost to start the group ledger."),
      ],
    }));
    return;
  }

  for (const expense of expenses) {
    const item = context.element("li", { className: "expense-card", attributes: { "data-expense-id": expense.id } });
    const top = context.element("div", { className: "expense-card-top" });
    const details = context.element("div", { className: "expense-card-details" });
    const payer = expense.payer_username || findUser(users, expense.payer_id)?.username || "Unknown person";
    details.append(
      node(context, "p", "Paid by", { className: "expense-card-kicker" }),
      node(context, "h2", payer, { className: "expense-payer" }),
    );
    top.append(details, node(context, "p", context.formatUsd(expense.amount), { className: "expense-amount" }));

    const summary = context.element("div", { className: "expense-card-summary" });
    const mode = expense.target_user_ids === null ? "Everyone" : "Selected people";
    summary.append(
      node(context, "span", mode, { className: `expense-split-badge${expense.target_user_ids === null ? " expense-split-everyone" : ""}` }),
      node(context, "span", targetSummary(expense), { className: "expense-participant-names" }),
    );

    const footer = context.element("div", { className: "expense-card-footer" });
    const time = node(context, "time", localDate(expense.created_at), {
      className: "expense-date",
      attributes: { datetime: expense.created_at },
    });
    const actions = context.element("div", { className: "expense-actions" });
    const edit = node(context, "button", "Edit", {
      className: "secondary-button expense-action",
      attributes: { type: "button", "aria-label": `Edit expense paid by ${payer} for ${context.formatUsd(expense.amount)}`, "data-expense-edit": expense.id },
    });
    edit.addEventListener("click", () => {
      const viewRoot = item.closest(".expenses-view");
      if (!context.isCurrent() || expenseWritePending(viewRoot)) return;
      showEditor({ context, root: viewRoot, users, expense });
    });
    const remove = node(context, "button", "Delete", {
      className: "danger-button expense-action",
      attributes: { type: "button", "aria-label": `Delete expense paid by ${payer} for ${context.formatUsd(expense.amount)}`, "data-expense-delete": "" },
    });
    remove.addEventListener("click", () => void deleteExpense({ context, expense, payer, button: remove }));
    actions.append(edit, remove);
    footer.append(time, actions);
    item.append(top, summary, footer);
    list.append(item);
  }
}

function buildPage(context, users, expenses) {
  const root = context.element("section", {
    className: "expenses-view",
    attributes: { "aria-labelledby": "expenses-heading" },
  });
  const heading = context.element("div", { className: "page-heading" });
  const copy = context.element("div", { className: "page-heading-copy" });
  copy.append(
    node(context, "p", "The shared tab", { className: "eyebrow" }),
    node(context, "h1", "Expenses", { className: "view-heading", attributes: { id: "expenses-heading" } }),
    node(context, "p", "Record shared costs and see who paid and who was included.", { className: "page-description" }),
  );
  const add = node(context, "button", "Add expense", {
    className: "primary-button",
    attributes: { type: "button", "data-expense-add": "" },
  });
  heading.append(copy, add);
  root.append(heading);

  root.append(context.element("p", {
    className: "expense-impact-note",
    children: [
      node(context, "strong", "Everyone includes future members."),
      node(context, "span", " An expense marked Everyone is shared with everyone in the group, including people who join later."),
    ],
  }));

  const editorSlot = context.element("div", { className: "expense-editor-slot" });
  const listHeading = node(context, "h2", "Recent expenses", { className: "expense-list-heading", attributes: { id: "expense-list-heading" } });
  const list = context.element("ul", { className: "expense-list", attributes: { "aria-labelledby": "expense-list-heading" } });
  renderExpenseList(context, list, expenses, users);
  root.append(editorSlot, listHeading, list);
  add.addEventListener("click", () => {
    if (!context.isCurrent() || expenseWritePending(root)) return;
    showEditor({ context, root, users, expense: null });
  });
  return root;
}

function userOptions(context, select, users, selectedId) {
  for (const user of users) {
    select.append(node(context, "option", user.username, { attributes: { value: user.id } }));
  }
  if (users.some((user) => user.id === selectedId)) select.value = selectedId;
  else if (users.length) select.value = users[0].id;
}

function showEditor({ context, root, users, expense }) {
  if (!context.isCurrent() || expenseWritePending(root)) return;
  const editing = Boolean(expense);
  const editorSlot = root.querySelector(".expense-editor-slot");
  const editor = context.element("section", {
    className: "expense-editor",
    attributes: { "aria-labelledby": "expense-editor-heading" },
  });
  editor.append(
    node(context, "p", editing ? "Correct a shared cost" : "New shared cost", { className: "eyebrow" }),
    node(context, "h2", editing ? "Edit expense" : "Add an expense", { attributes: { id: "expense-editor-heading" } }),
  );

  const form = context.element("form", { className: "expense-form", attributes: { novalidate: "" } });
  const amountField = context.element("div", { className: "field expense-amount-field" });
  const amountId = "expense-amount";
  const amountLabel = node(context, "label", "Amount", { className: "field-label", attributes: { for: amountId } });
  const amountInput = context.element("input", {
    className: "text-input",
    attributes: {
      id: amountId,
      name: "amount",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      placeholder: "0.00",
      required: "",
      "aria-describedby": "expense-amount-hint",
    },
  });
  amountInput.value = expense?.amount || "";
  amountField.append(amountLabel, amountInput, node(context, "p", "Enter a positive USD amount, with up to two decimal places.", { className: "field-hint", attributes: { id: "expense-amount-hint" } }));

  const payerField = context.element("div", { className: "field expense-payer-field" });
  const payerLabel = node(context, "label", "Paid by", { className: "field-label", attributes: { for: "expense-payer" } });
  const payerSelect = context.element("select", {
    className: "select-input",
    attributes: { id: "expense-payer", name: "payer_id", required: "" },
  });
  userOptions(context, payerSelect, users, expense?.payer_id || context.getSelectedUserId());
  payerField.append(payerLabel, payerSelect);

  const splitField = context.element("fieldset", { className: "expense-split-field" });
  splitField.append(node(context, "legend", "Who shares this?", { className: "field-label" }));
  const isEveryone = expense ? expense.target_user_ids === null : true;
  const radioGroup = context.element("div", { className: "expense-mode-options" });
  const everyoneLabel = context.element("label", { className: "expense-mode-option" });
  const everyoneRadio = context.element("input", { attributes: { type: "radio", name: "target-mode", value: "everyone", "aria-controls": "expense-target-list" } });
  everyoneRadio.checked = isEveryone;
  everyoneLabel.append(everyoneRadio, node(context, "span", "Everyone"));
  const selectedLabel = context.element("label", { className: "expense-mode-option" });
  const selectedRadio = context.element("input", { attributes: { type: "radio", name: "target-mode", value: "selected", "aria-controls": "expense-target-list" } });
  selectedRadio.checked = !isEveryone;
  selectedLabel.append(selectedRadio, node(context, "span", "Selected people"));
  radioGroup.append(everyoneLabel, selectedLabel);

  const everyoneHint = node(context, "p", "Includes everyone in the group, including people who join later.", {
    className: "field-hint expense-everyone-hint",
    attributes: { id: "expense-everyone-hint" },
  });
  const targetList = context.element("div", {
    className: "expense-target-list",
    attributes: { id: "expense-target-list", "aria-label": "People included in this expense" },
  });
  targetList.hidden = isEveryone;
  const targetChoices = [];
  for (const [index, user] of users.entries()) {
    const choice = context.element("label", { className: "expense-target-choice" });
    const checkbox = context.element("input", {
      attributes: { type: "checkbox", name: "target_user_ids", value: user.id, id: `expense-target-${index}` },
    });
    checkbox.checked = Boolean(expense && expense.target_user_ids?.includes(user.id));
    choice.append(checkbox, node(context, "span", user.username));
    targetList.append(choice);
    targetChoices.push(checkbox);
  }
  const targetHint = node(context, "p", "Choose one or more people. The payer is included only if selected.", { className: "field-hint", attributes: { id: "expense-target-hint" } });
  targetList.setAttribute("aria-describedby", "expense-target-hint");
  splitField.append(radioGroup, everyoneHint, targetList, targetHint);

  const actions = context.element("div", { className: "expense-form-actions" });
  const submit = node(context, "button", editing ? "Save changes" : "Create expense", {
    className: "primary-button",
    attributes: { type: "submit" },
  });
  const cancel = node(context, "button", "Cancel", { className: "secondary-button", attributes: { type: "button" } });
  actions.append(submit, cancel);
  form.append(amountField, payerField, splitField, actions);
  editor.append(form);
  editorSlot.replaceChildren(editor);

  const originalTargets = expense?.target_user_ids === null || expense?.target_user_ids === undefined
    ? null
    : [...expense.target_user_ids].sort();
  const originalAmount = expense?.amount || "";
  const originalPayerId = expense?.payer_id || "";
  let pending = false;
  let writeAccepted = false;

  const selectedTargetIds = () => targetChoices.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value).sort();
  const setMode = () => {
    const everyone = everyoneRadio.checked;
    targetList.hidden = everyone;
    everyoneHint.hidden = !everyone;
    targetHint.hidden = everyone;
    if (everyone) splitField.removeAttribute("aria-invalid");
  };
  everyoneRadio.addEventListener("change", setMode);
  selectedRadio.addEventListener("change", setMode);
  for (const checkbox of targetChoices) {
    checkbox.addEventListener("change", () => {
      splitField.removeAttribute("aria-invalid");
      clearFieldError(form, splitField);
    });
  }
  form.addEventListener("input", (event) => {
    if (event.target === amountInput) amountInput.removeAttribute("aria-invalid");
    if (event.target === payerSelect) payerSelect.removeAttribute("aria-invalid");
    form.querySelector("[data-expense-form-error]")?.remove();
  });
  cancel.addEventListener("click", () => {
    if (pending || writeAccepted || !context.isCurrent()) return;
    editorSlot.replaceChildren();
    restoreFocus(root, editing ? { action: "edit", expenseId: expense.id } : { action: "add" });
  });

  const showLoadRetry = (message) => {
    if (!context.isCurrent()) return;
    pending = false;
    writeAccepted = true;
    submit.disabled = true;
    submit.textContent = "Saved";
    const alert = appendFormError(context, form, message);
    const retry = node(context, "button", "Reload expenses", { className: "secondary-button", attributes: { type: "button" } });
    retry.addEventListener("click", () => {
      if (!context.isCurrent()) return;
      void reloadAfterAcceptedWrite({ context, root, expenseId: expense?.id, action: editing ? "edit" : "add" });
    });
    const actionsNode = form.querySelector(".expense-form-actions");
    actionsNode.insertBefore(retry, submit);
    alert.focus({ preventScroll: true });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || writeAccepted || !context.isCurrent()) return;
    const amount = amountInput.value;
    const amountError = validateAmount(amount);
    if (amountError) {
      amountInput.setAttribute("aria-invalid", "true");
      appendFormError(context, form, amountError).focus({ preventScroll: true });
      amountInput.focus({ preventScroll: true });
      return;
    }
    if (!payerSelect.value || !findUser(users, payerSelect.value)) {
      payerSelect.setAttribute("aria-invalid", "true");
      appendFormError(context, form, "Choose someone from the current group as the payer.").focus({ preventScroll: true });
      payerSelect.focus({ preventScroll: true });
      return;
    }

    const everyone = everyoneRadio.checked;
    const targetIds = everyone ? null : selectedTargetIds();
    if (!everyone && targetIds.length === 0) {
      splitField.setAttribute("aria-invalid", "true");
      appendFormError(context, form, "Select at least one person, or choose Everyone.").focus({ preventScroll: true });
      targetChoices[0]?.focus({ preventScroll: true });
      return;
    }

    const payerId = payerSelect.value;
    let payload;
    if (!editing) {
      payload = { payer_id: payerId, target_user_ids: targetIds, amount };
    } else {
      payload = {};
      if (payerId !== originalPayerId) payload.payer_id = payerId;
      const targetsChanged = targetIds === null
        ? originalTargets !== null
        : originalTargets === null || targetIds.join("\u0000") !== originalTargets.join("\u0000");
      if (targetsChanged) payload.target_user_ids = targetIds;
      if (amount !== originalAmount) payload.amount = amount;
      if (!Object.keys(payload).length) {
        editorSlot.replaceChildren();
        restoreFocus(root, { action: "edit", expenseId: expense.id });
        context.announce("No changes to save.");
        return;
      }
    }

    pending = true;
    setExpenseWritePending(root, true);
    submit.disabled = true;
    cancel.disabled = true;
    submit.textContent = editing ? "Saving…" : "Adding…";
    try {
      if (editing) await context.api.updateExpense(expense.id, payload);
      else await context.api.createExpense(payload);
      if (!context.isCurrent()) return;
      writeAccepted = true;
      const refreshed = await fetchCanonicalState(context, { includeBalances: true });
      if (!context.isCurrent() || !refreshed) return;
      const newRoot = buildPage(context, refreshed.users, refreshed.expenses);
      root.replaceWith(newRoot);
      restoreFocus(newRoot, editing ? { action: "edit", expenseId: expense.id } : { action: "add" });
      context.announce(editing ? "Expense updated." : "Expense added.", "success");
    } catch (error) {
      if (!context.isCurrent()) return;
      if (writeAccepted) {
        showLoadRetry(`The expense was saved, but the refreshed list or balances could not be loaded. ${error?.message || "Reload before making another change."}`);
        return;
      }
      let message = error?.message || "The expense could not be saved. Please try again.";
      if (error?.network) {
        message = "We couldn’t confirm whether the expense was saved. Check the refreshed list before retrying; Splitmoney will not automatically repeat a money change.";
        try {
          const state = await fetchCanonicalState(context);
          if (!context.isCurrent()) return;
          if (state) renderExpenseList(context, root.querySelector(".expense-list"), state.expenses, state.users);
          else message += " The list refresh did not finish.";
        } catch {
          if (!context.isCurrent()) return;
          message += " The list refresh did not finish.";
        }
      }
      pending = false;
      setExpenseWritePending(root, false);
      submit.disabled = false;
      cancel.disabled = false;
      submit.textContent = editing ? "Save changes" : "Create expense";
      const alert = appendFormError(context, form, message);
      if (error?.network) addReadRefreshButton({ context, root, alert, form });
      alert.focus({ preventScroll: true });
    }
  });

  amountInput.focus({ preventScroll: true });
}

async function fetchCanonicalState(context, { includeBalances = false } = {}) {
  const people = await context.refreshUsers();
  if (!context.isCurrent() || people.state !== "ready") return null;
  const [expenses, balances] = includeBalances
    ? await Promise.all([context.api.listExpenses(), context.api.getBalances()])
    : [await context.api.listExpenses(), null];
  if (!context.isCurrent()) return null;
  return { users: people.users, expenses, balances };
}

function addReadRefreshButton({ context, root, alert, form = null }) {
  root.querySelector("[data-expense-read-retry]")?.remove();
  const button = node(context, "button", "Refresh list", {
    className: "secondary-button",
    attributes: { type: "button", "data-expense-read-retry": "" },
  });
  button.addEventListener("click", async () => {
    if (!context.isCurrent()) return;
    button.disabled = true;
    button.textContent = "Refreshing…";
    try {
      const refreshed = await fetchCanonicalState(context, { includeBalances: true });
      if (!context.isCurrent() || !refreshed) return;
      renderExpenseList(context, root.querySelector(".expense-list"), refreshed.expenses, refreshed.users);
      alert.textContent = "The expense list and balances are refreshed. Check the list before retrying.";
      button.textContent = "Refreshed";
      button.disabled = true;
    } catch (error) {
      if (!context.isCurrent()) return;
      alert.textContent = `The expense list and balances could not both be refreshed. ${error?.message || "Try again before retrying the money change."}`;
      button.disabled = false;
      button.textContent = "Refresh list";
    }
  });
  if (form) {
    const actions = form.querySelector(".expense-form-actions");
    form.insertBefore(button, actions || null);
  } else {
    alert.insertAdjacentElement("afterend", button);
  }
  return button;
}

function acceptedReloadButton(context, root, expenseId, action) {
  const button = node(context, "button", "Reload expenses", {
    className: "secondary-button",
    attributes: { type: "button", "data-expense-read-retry": "" },
  });
  button.addEventListener("click", () => {
    if (!context.isCurrent()) return;
    void reloadAfterAcceptedWrite({ context, root, expenseId, action });
  });
  return button;
}

async function reloadAfterAcceptedWrite({ context, root, expenseId, action }) {
  if (!context.isCurrent()) return;
  const button = root.querySelector("[data-expense-add]");
  button?.setAttribute("aria-busy", "true");
  try {
    const refreshed = await fetchCanonicalState(context, { includeBalances: true });
    if (!context.isCurrent() || !refreshed) return;
    const newRoot = buildPage(context, refreshed.users, refreshed.expenses);
    root.replaceWith(newRoot);
    restoreFocus(newRoot, { action, expenseId });
    context.announce("Expense list and balances refreshed.", "success");
  } catch (error) {
    if (!context.isCurrent()) return;
    const alert = context.inlineError(`The expense was saved, but the refreshed list or balances are still unavailable. ${error?.message || "Try again before changing this expense."}`, "expense-refresh-error");
    alert.tabIndex = -1;
    root.querySelector(".expense-refresh-error")?.remove();
    alert.classList.add("expense-refresh-error");
    root.prepend(alert);
    alert.focus({ preventScroll: true });
    button?.removeAttribute("aria-busy");
  }
}

async function deleteExpense({ context, expense, payer, button }) {
  if (!context.isCurrent()) return;
  const root = button.closest(".expenses-view");
  if (expenseWritePending(root)) return;
  const confirmation = `Delete the ${context.formatUsd(expense.amount)} expense paid by ${payer}? This removes it from the shared ledger.`;
  if (!globalThis.confirm(confirmation)) return;
  if (!context.isCurrent()) return;
  setExpenseWritePending(root, true);
  button.disabled = true;
  let accepted = false;
  try {
    await context.api.deleteExpense(expense.id);
    if (!context.isCurrent()) return;
    accepted = true;
    const refreshed = await fetchCanonicalState(context, { includeBalances: true });
    if (!context.isCurrent() || !refreshed) return;
    if (!root) return;
    const newRoot = buildPage(context, refreshed.users, refreshed.expenses);
    root.replaceWith(newRoot);
    restoreFocus(newRoot, { action: "add" });
    context.announce("Expense deleted.", "success");
  } catch (error) {
    if (!context.isCurrent()) return;
    if (accepted) {
      button.disabled = true;
      button.textContent = "Deleted";
      const alert = context.inlineError(`The expense was deleted, but the refreshed list or balances could not be loaded. Check the list before trying another change. ${error?.message || "Try reloading."}`, "expense-delete-refresh-error");
      alert.tabIndex = -1;
      alert.classList.add("expense-delete-error");
      root?.prepend(alert);
      if (root) root.insertBefore(acceptedReloadButton(context, root, null, "add"), alert.nextSibling);
      alert.focus({ preventScroll: true });
      return;
    }
    let message = error?.message || "The expense could not be deleted. Please try again.";
    if (error?.network) {
      message = "We couldn’t confirm whether the expense was deleted. Check the refreshed list before retrying; Splitmoney will not automatically repeat a money change.";
      let refreshFailed = false;
      try {
        const refreshed = await fetchCanonicalState(context);
        if (!context.isCurrent()) return;
        if (refreshed && root) renderExpenseList(context, root.querySelector(".expense-list"), refreshed.expenses, refreshed.users);
        else { message += " The list refresh did not finish."; refreshFailed = true; }
      } catch {
        if (!context.isCurrent()) return;
        message += " The list refresh did not finish.";
        refreshFailed = true;
      }
      const alert = context.inlineError(message, "expense-delete-error");
      alert.classList.add("expense-delete-error");
      alert.tabIndex = -1;
      root?.querySelector(".expense-delete-error")?.remove();
      root?.prepend(alert);
      if (refreshFailed && root) addReadRefreshButton({ context, root, alert });
      setExpenseWritePending(root, false);
      alert.focus({ preventScroll: true });
      return;
    }
    setExpenseWritePending(root, false);
    button.disabled = false;
    if (!root) return;
    root.querySelector(".expense-delete-error")?.remove();
    const alert = context.inlineError(message, "expense-delete-error");
    alert.classList.add("expense-delete-error");
    alert.tabIndex = -1;
    root.prepend(alert);
    alert.focus({ preventScroll: true });
  }
}

export async function renderView(contentRoot, context) {
  ensureExpensesStyles();
  if (!context.isCurrent()) return;
  contentRoot.replaceChildren(context.loadingPanel("Loading expenses…"));
  try {
    const state = await fetchCanonicalState(context);
    if (!context.isCurrent() || !state) return;
    contentRoot.replaceChildren(buildPage(context, state.users, state.expenses));
  } catch (error) {
    if (!context.isCurrent()) return;
    const card = context.element("section", {
      className: "error-card",
      attributes: { "aria-labelledby": "expenses-load-error-heading" },
    });
    card.append(
      node(context, "p", "The shared tab", { className: "eyebrow" }),
      node(context, "h1", "Expenses couldn’t load", { attributes: { id: "expenses-load-error-heading" } }),
      node(context, "p", error?.message || "The expense list could not be loaded."),
    );
    const retry = node(context, "button", "Try again", { className: "primary-button", attributes: { type: "button" } });
    retry.addEventListener("click", () => {
      if (context.isCurrent()) void renderView(contentRoot, context);
    });
    card.append(retry);
    contentRoot.replaceChildren(card);
  }
}

export default renderView;
