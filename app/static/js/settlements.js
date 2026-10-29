const AMOUNT_PATTERN = /^[0-9]+(?:\.[0-9]{1,2})?$/u;
const MAX_AMOUNT_CENTS = 99_999_999_999n;

function text(context, tag, value, options = {}) {
  return context.element(tag, { ...options, text: value });
}

function ensureStyles() {
  if (document.querySelector("link[data-settlements-styles]")) return;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/static/settlements.css";
  stylesheet.dataset.settlementsStyles = "";
  document.head.append(stylesheet);
}

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function findUser(users, id) {
  return users.find((user) => user.id === id);
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

function appendFormError(context, form, message) {
  form.querySelector("[data-settlement-form-error]")?.remove();
  const alert = context.inlineError(message, "settlement-form-error");
  alert.dataset.settlementFormError = "";
  alert.tabIndex = -1;
  const actions = form.querySelector(".settlement-form-actions");
  form.insertBefore(alert, actions || null);
  return alert;
}

function userOptions(context, select, users, selectedId, placeholder = null) {
  if (placeholder) select.append(text(context, "option", placeholder, { attributes: { value: "" } }));
  for (const user of users) {
    select.append(text(context, "option", user.username, { attributes: { value: user.id } }));
  }
  if (users.some((user) => user.id === selectedId)) select.value = selectedId;
}

async function fetchCanonicalState(context) {
  const people = await context.refreshUsers();
  if (!context.isCurrent() || people.state !== "ready") return null;
  const [settlements, balances] = await Promise.all([
    context.api.listSettlements(),
    context.api.getBalances(),
  ]);
  if (!context.isCurrent()) return null;
  return { users: people.users, settlements, balances };
}

function renderList(context, list, settlements, users) {
  list.replaceChildren();
  const editorSlot = list.closest(".settlements-view")?.querySelector(".settlement-editor-slot");
  const editorPending = editorSlot?.dataset.settlementPending === "true";
  if (!settlements.length) {
    list.append(context.element("li", {
      className: "settlement-empty-state",
      children: [
        text(context, "h2", "No payments recorded yet"),
        text(context, "p", "When someone has already paid another group member back, record it here."),
      ],
    }));
    return;
  }

  for (const settlement of settlements) {
    const sender = settlement.payer_username || findUser(users, settlement.payer_id)?.username || "Unknown person";
    const recipient = settlement.target_username || findUser(users, settlement.target_user_id)?.username || "Unknown person";
    const item = context.element("li", {
      className: "settlement-card",
      attributes: { "data-settlement-id": settlement.id },
    });
    const details = context.element("div", { className: "settlement-details" });
    details.append(
      text(context, "p", "Payment recorded", { className: "settlement-card-kicker" }),
      text(context, "h2", sender + " paid " + recipient, { className: "settlement-direction" }),
      text(context, "time", localDate(settlement.created_at), {
        className: "settlement-date",
        attributes: { datetime: settlement.created_at },
      }),
    );
    const amount = text(context, "p", context.formatUsd(settlement.amount), { className: "settlement-amount" });
    const actions = context.element("div", { className: "settlement-actions" });
    const edit = text(context, "button", "Edit", {
      className: "secondary-button settlement-action",
      attributes: {
        type: "button",
        "aria-label": "Edit payment from " + sender + " to " + recipient + " for " + context.formatUsd(settlement.amount),
        "data-settlement-edit": settlement.id,
      },
    });
    edit.addEventListener("click", () => {
      if (!context.isCurrent()) return;
      const root = item.closest(".settlements-view");
      if (!root) return;
      mountSettlementEditor({
        context,
        slot: root.querySelector(".settlement-editor-slot"),
        users,
        settlement,
        returnFocus: () => list.querySelector('[data-settlement-edit="' + escapeSelector(settlement.id) + '"]')?.focus({ preventScroll: true }),
        onSaved: (state) => {
          if (!context.isCurrent() || !state) return;
          root._setSettlementUsers?.(state.users);
          renderList(context, list, state.settlements, state.users);
          updateTotal(context, root._listHeading, state.balances.totals.settlements);
        },
      });
    });
    const remove = text(context, "button", "Delete", {
      className: "danger-button settlement-action",
      attributes: {
        type: "button",
        "aria-label": "Delete payment from " + sender + " to " + recipient + " for " + context.formatUsd(settlement.amount),
        "data-settlement-delete": settlement.id,
      },
    });
    remove.addEventListener("click", () => void deleteSettlement({ context, settlement, sender, recipient, button: remove }));
    actions.append(edit, remove);
    if (editorPending) {
      edit.disabled = true;
      remove.disabled = true;
    }
    item.append(details, amount, actions);
    list.append(item);
  }
}

function escapeSelector(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/gu, "\\$&");
}

function buildPage(context, users, settlements) {
  const root = context.element("section", {
    className: "settlements-view",
    attributes: { "aria-labelledby": "payments-heading" },
  });
  const heading = context.element("div", { className: "page-heading" });
  const copy = context.element("div", { className: "page-heading-copy" });
  copy.append(
    text(context, "p", "Settling up", { className: "eyebrow" }),
    text(context, "h1", "Payments", { className: "view-heading", attributes: { id: "payments-heading" } }),
    text(context, "p", "Record money group members have already paid one another and review the latest entries.", { className: "page-description" }),
  );
  const add = text(context, "button", "Add payment", {
    className: "primary-button",
    attributes: { type: "button", "data-settlement-add": "" },
  });
  const refresh = text(context, "button", "Refresh", {
    className: "secondary-button",
    attributes: { type: "button", "data-settlement-refresh": "" },
  });
  const headingActions = context.element("div", { className: "settlement-heading-actions" });
  headingActions.append(add, refresh);
  heading.append(copy, headingActions);

  const note = context.element("p", {
    className: "settlement-impact-note",
    children: [
      text(context, "strong", "Record what has happened."),
      text(context, "span", " Add a payment only after money has already been sent. Suggestions are a guide and never create a record by themselves."),
    ],
  });
  const status = context.element("p", {
    className: "settlement-view-status",
    attributes: { role: "status", "aria-live": "polite", "data-settlement-view-status": "" },
  });
  status.hidden = true;
  const editorSlot = context.element("div", { className: "settlement-editor-slot" });
  const listHeading = text(context, "h2", "Recorded payments", { className: "settlement-list-heading", attributes: { id: "settlement-list-heading" } });
  const list = context.element("ul", {
    className: "settlement-list",
    attributes: { "aria-labelledby": "settlement-list-heading" },
  });
  renderList(context, list, settlements, users);
  root.append(heading, note, status, editorSlot, listHeading, list);

  let inFlight = null;
  const refreshData = async ({ button = null, message = "" } = {}) => {
    if (!context.isCurrent()) return;
    if (inFlight) return inFlight;
    if (button) {
      button.disabled = true;
      button.textContent = "Refreshing…";
    }
    inFlight = (async () => {
      try {
        const state = await fetchCanonicalState(context);
        if (!context.isCurrent() || !state) return;
        users = state.users;
        renderList(context, list, state.settlements, users);
        root.querySelector("[data-settlement-count]")?.remove();
        const total = text(context, "p", "Total recorded: " + context.formatUsd(state.balances.totals.settlements), {
          className: "settlement-total",
          attributes: { "data-settlement-count": "" },
        });
        listHeading.insertAdjacentElement("afterend", total);
        setViewStatus(context, status, message, "success");
        if (button) {
          button.disabled = false;
          button.textContent = "Refresh";
        }
        return state;
      } catch (error) {
        if (!context.isCurrent()) return;
        setViewStatus(context, status, error?.message || "Payments could not be refreshed. Try again.", "error");
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

  add.addEventListener("click", () => {
    if (!context.isCurrent()) return;
    mountSettlementEditor({
      context,
      slot: editorSlot,
      users,
      draft: { payer_id: context.getSelectedUserId() },
      returnFocus: () => add.focus({ preventScroll: true }),
      onSaved: (state) => {
        if (!context.isCurrent() || !state) return;
        users = state.users;
        renderList(context, list, state.settlements, users);
        updateTotal(context, listHeading, state.balances.totals.settlements);
      },
    });
  });
  refresh.addEventListener("click", () => void refreshData({ button: refresh }).catch(() => {}));
  root._refreshSettlements = refreshData;
  root._setSettlementUsers = (nextUsers) => { users = nextUsers; };
  root._list = list;
  root._listHeading = listHeading;
  root._status = status;
  return root;
}

function updateTotal(context, listHeading, amount) {
  listHeading.parentElement?.querySelector("[data-settlement-count]")?.remove();
  const total = text(context, "p", "Total recorded: " + context.formatUsd(amount), {
    className: "settlement-total",
    attributes: { "data-settlement-count": "" },
  });
  listHeading.insertAdjacentElement("afterend", total);
}

function setViewStatus(context, node, message, tone = "info") {
  if (!context.isCurrent()) return;
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = !message;
}

function observeForRouteRemoval(context, root) {
  const host = root.parentNode;
  if (!host) return;
  const refreshOnReturn = () => {
    if (!context.isCurrent() || document.visibilityState !== "visible") return;
    void root._refreshSettlements?.().catch(() => {});
  };
  document.addEventListener("visibilitychange", refreshOnReturn);
  const observer = new MutationObserver(() => {
    if (root.parentNode === host) return;
    document.removeEventListener("visibilitychange", refreshOnReturn);
    observer.disconnect();
  });
  observer.observe(host, { childList: true });
}

async function canonicalAfterWrite(context) {
  return fetchCanonicalState(context);
}

export function mountSettlementEditor({ context, slot, users, settlement = null, draft = null, returnFocus = null, onSaved = null }) {
  if (!context.isCurrent() || !slot) return;
  if (slot.querySelector(".settlement-editor")) {
    slot.querySelector(".settlement-editor")?.querySelector("input, select, button")?.focus({ preventScroll: true });
    return null;
  }
  if (slot.dataset.settlementPending === "true") return null;
  ensureStyles();
  const editing = Boolean(settlement);
  const suggested = Boolean(draft?.suggested);
  const editor = context.element("section", {
    className: "settlement-editor",
    attributes: { "aria-labelledby": "settlement-editor-heading" },
  });
  editor.append(
    text(context, "p", suggested ? "Review suggested payment" : editing ? "Correct a payment record" : "Record a payment already sent", { className: "eyebrow" }),
    text(context, "h2", suggested ? "Review suggested payment" : editing ? "Edit payment" : "Add a payment", { attributes: { id: "settlement-editor-heading" } }),
  );
  if (suggested) {
    editor.append(text(context, "p", "This suggestion is current as of now. Saving records it in the ledger; nothing is sent from here.", { className: "settlement-suggestion-note" }));
  }

  const form = context.element("form", { className: "settlement-form", attributes: { novalidate: "" } });
  const amountField = context.element("div", { className: "field settlement-amount-field" });
  const amountLabel = text(context, "label", "Amount", { className: "field-label", attributes: { for: "settlement-amount" } });
  const amountInput = context.element("input", {
    className: "text-input",
    attributes: {
      id: "settlement-amount",
      name: "amount",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      placeholder: "0.00",
      required: "",
      "aria-describedby": "settlement-amount-hint",
    },
  });
  amountInput.value = settlement?.amount || draft?.amount || "";
  amountField.append(amountLabel, amountInput, text(context, "p", "Enter a positive USD amount with up to two decimal places. Payments may be partial or greater than the current suggestion.", {
    className: "field-hint",
    attributes: { id: "settlement-amount-hint" },
  }));

  const senderField = context.element("div", { className: "field settlement-sender-field" });
  const senderLabel = text(context, "label", "Sender", { className: "field-label", attributes: { for: "settlement-sender" } });
  const senderSelect = context.element("select", {
    className: "select-input",
    attributes: { id: "settlement-sender", name: "payer_id", required: "" },
  });
  userOptions(context, senderSelect, users, settlement?.payer_id || draft?.payer_id || context.getSelectedUserId(), "Choose a sender");
  senderField.append(senderLabel, senderSelect, text(context, "p", "The person who already sent the money.", { className: "field-hint" }));

  const recipientField = context.element("div", { className: "field settlement-recipient-field" });
  const recipientLabel = text(context, "label", "Recipient", { className: "field-label", attributes: { for: "settlement-recipient" } });
  const recipientSelect = context.element("select", {
    className: "select-input",
    attributes: { id: "settlement-recipient", name: "target_user_id", required: "" },
  });
  userOptions(context, recipientSelect, users, settlement?.target_user_id || draft?.target_user_id, "Choose a recipient");
  recipientField.append(recipientLabel, recipientSelect);

  const actions = context.element("div", { className: "settlement-form-actions" });
  const submitLabel = editing ? "Save changes" : "Record payment";
  const submit = text(context, "button", submitLabel, { className: "primary-button", attributes: { type: "submit" } });
  const cancel = text(context, "button", "Cancel", { className: "secondary-button", attributes: { type: "button" } });
  actions.append(submit, cancel);
  form.append(amountField, senderField, recipientField, actions);
  editor.append(form);
  slot.replaceChildren(editor);

  const originalPayer = settlement?.payer_id || "";
  const originalRecipient = settlement?.target_user_id || "";
  const originalAmount = settlement?.amount || "";
  let pending = false;
  let writeAccepted = false;
  let hasEdited = false;
  const setActionButtonsDisabled = (disabled) => {
    const root = slot.closest("section");
    for (const button of root?.querySelectorAll(
      "[data-settlement-add], [data-settlement-edit], [data-settlement-delete], [data-overview-record]",
    ) || []) button.disabled = disabled;
  };
  const setEditorPending = (locked) => {
    if (locked) slot.dataset.settlementPending = "true";
    else delete slot.dataset.settlementPending;
  };

  const changed = () => { hasEdited = true; };
  form.addEventListener("input", (event) => {
    changed();
    event.target.removeAttribute?.("aria-invalid");
    form.querySelector("[data-settlement-form-error]")?.remove();
  });
  form.addEventListener("change", (event) => {
    changed();
    event.target.removeAttribute?.("aria-invalid");
    form.querySelector("[data-settlement-form-error]")?.remove();
    if (event.target === senderSelect && senderSelect.value === recipientSelect.value) {
      recipientSelect.value = "";
    }
  });
  cancel.addEventListener("click", () => {
    if (pending || writeAccepted || !context.isCurrent()) return;
    slot.replaceChildren();
    setEditorPending(false);
    setActionButtonsDisabled(false);
    returnFocus?.();
  });

  const appendReloadButton = (message) => {
    const alert = appendFormError(context, form, message);
    const reload = text(context, "button", "Reload payments", {
      className: "secondary-button",
      attributes: { type: "button", "data-settlement-reload": "" },
    });
    reload.addEventListener("click", async () => {
      if (!context.isCurrent()) return;
      reload.disabled = true;
      reload.textContent = "Refreshing…";
      try {
        const state = await canonicalAfterWrite(context);
        if (!context.isCurrent() || !state) return;
        onSaved?.(state);
        slot.replaceChildren();
        setEditorPending(false);
        setActionButtonsDisabled(false);
        alert.textContent = "Payments and balances are refreshed. Check the list before changing this record again.";
        reload.textContent = "Refreshed";
        context.announce("Payments and balances refreshed.", "success");
      } catch (error) {
        if (!context.isCurrent()) return;
        reload.disabled = false;
        reload.textContent = "Reload payments";
        alert.textContent = "The saved payment is still confirmed, but the list could not be refreshed. " + (error?.message || "Try again.");
      }
    });
    form.querySelector(".settlement-form-actions").insertBefore(reload, submit);
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
    const payerId = senderSelect.value;
    const recipientId = recipientSelect.value;
    if (!findUser(users, payerId)) {
      senderSelect.setAttribute("aria-invalid", "true");
      appendFormError(context, form, "Choose a sender from the current group.").focus({ preventScroll: true });
      senderSelect.focus({ preventScroll: true });
      return;
    }
    if (!findUser(users, recipientId)) {
      recipientSelect.setAttribute("aria-invalid", "true");
      appendFormError(context, form, "Choose a recipient from the current group.").focus({ preventScroll: true });
      recipientSelect.focus({ preventScroll: true });
      return;
    }
    if (payerId === recipientId) {
      recipientSelect.setAttribute("aria-invalid", "true");
      appendFormError(context, form, "The sender and recipient must be different people.").focus({ preventScroll: true });
      recipientSelect.focus({ preventScroll: true });
      return;
    }

    let payload;
    if (!editing) {
      payload = { payer_id: payerId, target_user_id: recipientId, amount };
    } else {
      payload = {};
      if (payerId !== originalPayer) payload.payer_id = payerId;
      if (recipientId !== originalRecipient) payload.target_user_id = recipientId;
      if (amount !== originalAmount) payload.amount = amount;
      if (!Object.keys(payload).length) {
        slot.replaceChildren();
        returnFocus?.();
        context.announce("No changes to save.");
        return;
      }
    }

    pending = true;
    setEditorPending(true);
    setActionButtonsDisabled(true);
    submit.disabled = true;
    cancel.disabled = true;
    submit.textContent = editing ? "Saving…" : "Recording…";
    try {
      if (editing) await context.api.updateSettlement(settlement.id, payload);
      else await context.api.createSettlement(payload);
      if (!context.isCurrent()) return;
      writeAccepted = true;
      const state = await canonicalAfterWrite(context);
      if (!context.isCurrent()) return;
      if (!state) throw new Error("The selected group member is no longer available.");
      onSaved?.(state);
      slot.replaceChildren();
      setEditorPending(false);
      setActionButtonsDisabled(false);
      context.announce(editing ? "Payment record updated." : "Payment recorded.", "success");
      returnFocus?.();
    } catch (error) {
      if (!context.isCurrent()) return;
      if (writeAccepted) {
        pending = false;
        submit.textContent = "Saved";
        submit.disabled = true;
        cancel.disabled = true;
        appendReloadButton("The payment was saved, but the refreshed payment list or balances could not be loaded. " + (error?.message || "Reload before making another change."));
        return;
      }
      pending = false;
      setEditorPending(false);
      submit.disabled = false;
      cancel.disabled = false;
      submit.textContent = submitLabel;
      setActionButtonsDisabled(false);
      let message = error?.message || "The payment could not be saved. Please try again.";
      if (error?.network) {
        message = "We couldn’t confirm whether this payment was saved. Check the refreshed list before retrying; Splitmoney will not automatically repeat a money change.";
        try {
          const state = await canonicalAfterWrite(context);
          if (!context.isCurrent()) return;
          if (state) onSaved?.(state);
          else message += " The list refresh did not finish.";
        } catch {
          if (!context.isCurrent()) return;
          message += " The list refresh did not finish.";
        }
      }
      const alert = appendFormError(context, form, message);
      if (error?.network) {
        const refresh = text(context, "button", "Refresh payments", {
          className: "secondary-button",
          attributes: { type: "button", "data-settlement-reload": "" },
        });
        refresh.addEventListener("click", async () => {
          if (!context.isCurrent()) return;
          refresh.disabled = true;
          refresh.textContent = "Refreshing…";
          try {
            const state = await canonicalAfterWrite(context);
            if (!context.isCurrent() || !state) return;
            onSaved?.(state);
            setActionButtonsDisabled(false);
            alert.textContent = "Payments and balances are refreshed. Check the list before retrying.";
            refresh.textContent = "Refreshed";
          } catch (refreshError) {
            if (!context.isCurrent()) return;
            alert.textContent = "The payment list could not be refreshed. " + (refreshError?.message || "Try again before retrying.");
            refresh.disabled = false;
            refresh.textContent = "Refresh payments";
          }
        });
        form.querySelector(".settlement-form-actions").insertBefore(refresh, submit);
      }
      alert.focus({ preventScroll: true });
    }
  });

  if (!editing && draft?.suggested) amountInput.value = draft.amount;
  amountInput.focus({ preventScroll: true });
  return {
    isDirty: () => hasEdited,
    isPending: () => pending || writeAccepted,
    form,
  };
}

async function deleteSettlement({ context, settlement, sender, recipient, button }) {
  if (!context.isCurrent()) return;
  const confirmation = "Delete the " + context.formatUsd(settlement.amount) + " payment record from " + sender + " to " + recipient + "? This changes the shared ledger.";
  if (!globalThis.confirm(confirmation)) return;
  if (!context.isCurrent()) return;
  button.disabled = true;
  let accepted = false;
  try {
    await context.api.deleteSettlement(settlement.id);
    if (!context.isCurrent()) return;
    accepted = true;
    const state = await canonicalAfterWrite(context);
    if (!context.isCurrent() || !state) return;
    const root = button.closest(".settlements-view");
    if (!root) return;
    root._setSettlementUsers?.(state.users);
    renderList(context, root._list, state.settlements, state.users);
    updateTotal(context, root._listHeading, state.balances.totals.settlements);
    context.announce("Payment record deleted.", "success");
  } catch (error) {
    if (!context.isCurrent()) return;
    const root = button.closest(".settlements-view");
    if (accepted) {
      button.disabled = true;
      button.textContent = "Deleted";
      const alert = context.inlineError("The payment was deleted, but the refreshed list or balances could not be loaded. Check the list before making another change. " + (error?.message || "Try reloading."), "settlement-delete-refresh-error");
      alert.tabIndex = -1;
      root?.prepend(alert);
      const reload = text(context, "button", "Reload payments", {
        className: "secondary-button",
        attributes: { type: "button", "data-settlement-reload": "" },
      });
      reload.addEventListener("click", async () => {
        if (!context.isCurrent()) return;
        reload.disabled = true;
        try {
          const state = await canonicalAfterWrite(context);
          if (!context.isCurrent() || !state || !root) return;
          root._setSettlementUsers?.(state.users);
          renderList(context, root._list, state.settlements, state.users);
          updateTotal(context, root._listHeading, state.balances.totals.settlements);
          alert.textContent = "Payments and balances are refreshed.";
          reload.textContent = "Refreshed";
        } catch (refreshError) {
          if (!context.isCurrent()) return;
          reload.disabled = false;
          alert.textContent = "The payment list still could not be refreshed. " + (refreshError?.message || "Try again.");
        }
      });
      root?.insertBefore(reload, alert.nextSibling);
      alert.focus({ preventScroll: true });
      return;
    }
    let message = error?.message || "The payment record could not be deleted. Please try again.";
    if (error?.network) {
      button.disabled = true;
      message = "We couldn’t confirm whether the payment record was deleted. Check the refreshed list before retrying; Splitmoney will not automatically repeat a money change.";
      try {
        const state = await canonicalAfterWrite(context);
        if (!context.isCurrent()) return;
        if (state && root) {
          root._setSettlementUsers?.(state.users);
          renderList(context, root._list, state.settlements, state.users);
          updateTotal(context, root._listHeading, state.balances.totals.settlements);
        } else {
          message += " The list refresh did not finish.";
        }
      } catch (refreshError) {
        if (!context.isCurrent()) return;
        message += " " + (refreshError?.message || "The list refresh did not finish.");
      }
    } else {
      button.disabled = false;
    }
    const alert = context.inlineError(message, "settlement-delete-error");
    alert.tabIndex = -1;
    root?.prepend(alert);
    alert.focus({ preventScroll: true });
  }
}

export async function renderView(contentRoot, context) {
  ensureStyles();
  const root = context.element("section", { className: "settlements-view" });
  contentRoot.replaceChildren(root);
  root.append(context.loadingPanel("Loading payments…"));
  try {
    const [people, settlements] = await Promise.all([
      context.refreshUsers(),
      context.api.listSettlements(),
    ]);
    if (!context.isCurrent() || people.state !== "ready") return;
    const page = buildPage(context, people.users, settlements);
    contentRoot.replaceChildren(page);
    try {
      const balances = await context.api.getBalances();
      if (!context.isCurrent()) return;
      updateTotal(context, page._listHeading, balances.totals.settlements);
    } catch (error) {
      if (!context.isCurrent()) return;
      setViewStatus(context, page._status, "Payments loaded, but the group totals could not be refreshed. " + (error?.message || ""), "error");
    }
    observeForRouteRemoval(context, page);
  } catch (error) {
    if (!context.isCurrent()) return;
    const page = buildPage(context, [], []);
    const alert = context.inlineError(error?.message || "Payments could not be loaded.", "settlements-load-error");
    alert.classList.add("settlements-load-error");
    const retry = text(context, "button", "Try again", { className: "secondary-button", attributes: { type: "button" } });
    retry.addEventListener("click", () => {
      if (context.isCurrent()) void renderView(contentRoot, context);
    });
    page.prepend(alert, retry);
    contentRoot.replaceChildren(page);
    observeForRouteRemoval(context, page);
  }
}

export default renderView;
