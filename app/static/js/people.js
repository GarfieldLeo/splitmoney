const USERNAME_LIMIT = 40;
const PHONE_LIMIT = 40;
let focusAddAfterRefresh = false;

function text(context, tag, value, options = {}) {
  return context.element(tag, { ...options, text: value });
}

function appendError(context, form, message, id = "people-form-error") {
  form.querySelector("[role='alert']")?.remove();
  const error = context.inlineError(message, id);
  error.setAttribute("tabindex", "-1");
  const actions = form.querySelector(".people-form-actions");
  form.insertBefore(error, actions || null);
  return error;
}

function errorMessage(error, { deletingName } = {}) {
  if (deletingName && error?.status === 409 && error?.code === "user_in_use") {
    return `${error.message} ${deletingName} is linked to an expense or payment, or an Everyone expense includes every current member. Remove those records first.`;
  }
  return error?.message || "The change could not be saved. Please try again.";
}

function ensurePeopleStyles() {
  if (document.querySelector("link[data-people-styles]")) return;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/static/people.css";
  stylesheet.dataset.peopleStyles = "";
  document.head.append(stylesheet);
}

function restoreFocus(root, action, username = "") {
  if (action === "add") {
    root.querySelector("[data-people-add]")?.focus({ preventScroll: true });
    return;
  }
  const label = `Edit ${username}`;
  [...root.querySelectorAll("button[aria-label]")]
    .find((button) => button.getAttribute("aria-label") === label)
    ?.focus({ preventScroll: true });
}

async function reloadAfterSave(context) {
  const result = await context.refreshUsers();
  if (!context.isCurrent() || result.state !== "ready") return;
  focusAddAfterRefresh = true;
  await context.refreshData();
}

function setWritePending(root, writeState, pending) {
  writeState.pending = pending;
  for (const control of root.querySelectorAll("[data-people-write-control]")) {
    control.disabled = pending;
  }
}

function addReloadPeopleButton(context, form) {
  const retry = text(context, "button", "Reload people", {
    className: "secondary-button",
    attributes: { type: "button" },
  });
  retry.addEventListener("click", async () => {
    if (!context.isCurrent() || retry.disabled) return;
    retry.disabled = true;
    try {
      await reloadAfterSave(context);
    } catch (error) {
      if (!context.isCurrent()) return;
      retry.disabled = false;
      appendError(context, form, `The group list could not be reloaded. ${error?.message || "Try again."}`);
    }
  });
  form.insertBefore(retry, form.querySelector(".people-form-actions") || null);
  return retry;
}

function buildPage(context, users) {
  const writeState = { pending: false };
  const root = context.element("section", {
    className: "people-view",
    attributes: { "aria-labelledby": "people-heading" },
  });
  const currentId = context.getSelectedUserId();
  const currentUser = context.getCurrentUser();
  const heading = context.element("div", { className: "page-heading" });
  const headingCopy = context.element("div", { className: "page-heading-copy" });
  headingCopy.append(
    text(context, "p", "Your group", { className: "eyebrow" }),
    text(context, "h1", "People", { className: "view-heading", attributes: { id: "people-heading" } }),
    text(context, "p", "Keep the group’s names and optional phone details up to date.", { className: "page-description" }),
  );
  const addButton = text(context, "button", "Add person", {
    className: "primary-button",
    attributes: { type: "button", "data-people-add": "", "data-people-write-control": "" },
  });
  heading.append(headingCopy, addButton);
  root.append(heading);

  root.append(context.element("p", {
    className: "people-impact-note",
    children: [
      text(context, "strong", "Everyone expenses change with the group."),
      text(context, "span", " Adding a person includes them in past expenses marked Everyone, because those splits include every current member."),
    ],
  }));

  const editorSlot = context.element("div", { className: "people-editor-slot" });
  root.append(editorSlot);

  const listHeading = text(context, "h2", "Group members", { className: "people-list-heading" });
  const list = context.element("ul", { className: "people-list", attributes: { "aria-labelledby": "people-list-heading" } });
  listHeading.id = "people-list-heading";
  if (!users.length) {
    list.append(context.element("li", {
      className: "people-empty-state",
      children: [
        text(context, "h3", "No one is in the group yet"),
        text(context, "p", "Add the first person to start organizing the shared ledger."),
      ],
    }));
  }

  for (const user of users) {
    const item = context.element("li", { className: "people-row" });
    const person = context.element("div", { className: "people-person" });
    const nameLine = context.element("div", { className: "people-name-line" });
    nameLine.append(text(context, "h3", user.username, { className: "people-name" }));
    if (user.id === currentId) {
      nameLine.append(text(context, "span", "You", { className: "people-current-badge", attributes: { "aria-label": `${currentUser?.username || user.username} is the current user` } }));
    }
    person.append(nameLine, text(context, "p", user.phone || "No phone number added", { className: user.phone ? "people-phone" : "people-phone people-phone-empty" }));

    const actions = context.element("div", { className: "people-actions" });
    const editButton = text(context, "button", "Edit", {
      className: "secondary-button people-action",
      attributes: { type: "button", "aria-label": `Edit ${user.username}`, "data-people-write-control": "" },
    });
    editButton.addEventListener("click", () => {
      if (!context.isCurrent() || writeState.pending) return;
      showEditor({ root, editorSlot, users, context, person: user, returnAction: "edit", writeState });
    });
    const deleteButton = text(context, "button", "Delete", {
      className: "danger-button people-action",
      attributes: { type: "button", "aria-label": `Delete ${user.username}`, "data-people-write-control": "" },
    });
    deleteButton.addEventListener("click", () => void deletePerson({ root, users, context, person: user, button: deleteButton, writeState }));
    actions.append(editButton, deleteButton);
    item.append(person, actions);
    list.append(item);
  }

  root.append(listHeading, list);
  addButton.addEventListener("click", () => {
    if (!context.isCurrent() || writeState.pending) return;
    showEditor({ root, editorSlot, users, context, person: null, returnAction: "add", writeState });
  });

  return root;
}

function showEditor({ root, editorSlot, users, context, person, returnAction, writeState }) {
  if (!context.isCurrent() || writeState.pending) return;
  const editing = Boolean(person);
  const editor = context.element("section", {
    className: "people-editor",
    attributes: { "aria-labelledby": "people-editor-heading" },
  });
  const title = editing ? `Edit ${person.username}` : "Add a person";
  editor.append(
    text(context, "p", editing ? "Update group details" : "New group member", { className: "eyebrow" }),
    text(context, "h2", title, { attributes: { id: "people-editor-heading" } }),
  );

  const form = context.element("form", { className: "people-form", attributes: { novalidate: "" } });
  const usernameField = context.element("div", { className: "field" });
  const usernameLabel = text(context, "label", "Username", { className: "field-label", attributes: { for: "people-username" } });
  const usernameInput = context.element("input", {
    className: "text-input",
    attributes: {
      id: "people-username",
      name: "username",
      type: "text",
      autocomplete: "off",
      required: "",
      "data-people-write-control": "",
      "aria-describedby": "people-username-hint",
    },
  });
  usernameInput.value = person?.username || "";
  const usernameHint = text(context, "p", "Use 1–40 characters. Names are shared across the group.", { className: "field-hint", attributes: { id: "people-username-hint" } });
  usernameField.append(usernameLabel, usernameInput, usernameHint);

  const phoneField = context.element("div", { className: "field" });
  const phoneLabel = text(context, "label", "Phone number (optional)", { className: "field-label", attributes: { for: "people-phone" } });
  const phoneInput = context.element("input", {
    className: "text-input",
    attributes: {
      id: "people-phone",
      name: "phone",
      type: "tel",
      autocomplete: "tel",
      "data-people-write-control": "",
      "aria-describedby": "people-phone-hint",
    },
  });
  phoneInput.value = person?.phone || "";
  const phoneHint = text(context, "p", "Stored as group contact information; Splitmoney does not send messages.", { className: "field-hint", attributes: { id: "people-phone-hint" } });
  phoneField.append(phoneLabel, phoneInput, phoneHint);

  const actions = context.element("div", { className: "people-form-actions" });
  const submit = text(context, "button", editing ? "Save changes" : "Create person", {
    className: "primary-button",
    attributes: { type: "submit", "data-people-write-control": "" },
  });
  const cancel = text(context, "button", "Cancel", {
    className: "secondary-button",
    attributes: { type: "button", "data-people-write-control": "" },
  });
  actions.append(submit, cancel);
  form.append(usernameField, phoneField, actions);
  editor.append(form);
  editorSlot.replaceChildren(editor);

  let pending = false;
  form.addEventListener("input", () => {
    form.querySelector("[role='alert']")?.remove();
    usernameInput.removeAttribute("aria-invalid");
    phoneInput.removeAttribute("aria-invalid");
  });
  cancel.addEventListener("click", () => {
    if (!context.isCurrent() || writeState.pending) return;
    editorSlot.replaceChildren();
    restoreFocus(root, returnAction, person?.username || "");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || writeState.pending || !context.isCurrent()) return;
    const username = usernameInput.value.trim();
    const phone = phoneInput.value.trim() || null;
    if (!username) {
      usernameInput.setAttribute("aria-invalid", "true");
      const error = appendError(context, form, "Enter a username.");
      usernameInput.focus();
      return;
    }
    if (Array.from(username).length > USERNAME_LIMIT) {
      usernameInput.setAttribute("aria-invalid", "true");
      appendError(context, form, `Use no more than ${USERNAME_LIMIT} Unicode characters for a username.`);
      usernameInput.focus();
      return;
    }
    if (/[\u0000-\u001f\u007f]/u.test(username)) {
      usernameInput.setAttribute("aria-invalid", "true");
      appendError(context, form, "A username cannot contain control characters.");
      usernameInput.focus();
      return;
    }
    if (phone && Array.from(phone).length > PHONE_LIMIT) {
      phoneInput.setAttribute("aria-invalid", "true");
      appendError(context, form, `Use no more than ${PHONE_LIMIT} Unicode characters for a phone number.`);
      phoneInput.focus();
      return;
    }

    const patch = {};
    if (!editing || username !== person.username) patch.username = username;
    if (!editing || phone !== (person.phone || null)) patch.phone = phone;
    if (editing && Object.keys(patch).length === 0) {
      editorSlot.replaceChildren();
      restoreFocus(root, "edit", person.username);
      return;
    }

    pending = true;
    setWritePending(root, writeState, true);
    submit.textContent = editing ? "Saving…" : "Adding…";
    let mutationAccepted = false;
    try {
      if (editing) await context.api.updateUser(person.id, patch);
      else await context.api.createUser({ username, phone });
      if (!context.isCurrent()) return;
      mutationAccepted = true;
      let refreshed;
      try {
        refreshed = await context.refreshUsers();
      } catch (refreshError) {
        if (!context.isCurrent()) return;
        submit.textContent = "Saved";
        appendError(context, form, `Your change was saved, but the group list could not be reloaded. ${refreshError?.message || "Try again before making another change."}`);
        addReloadPeopleButton(context, form);
        return;
      }
      if (!context.isCurrent() || refreshed.state !== "ready") return;
      root.replaceWith(buildPage(context, refreshed.users || users));
      focusAddAfterRefresh = true;
      await context.refreshData();
    } catch (error) {
      if (!context.isCurrent()) return;
      if (mutationAccepted) {
        submit.textContent = "Saved";
        appendError(context, form, `Your change was saved, but the group list could not be reloaded. ${error?.message || "Try again before making another change."}`);
        if (!form.querySelector("button:not([type='submit']):not([data-people-write-control])")) addReloadPeopleButton(context, form);
        return;
      }
      pending = false;
      setWritePending(root, writeState, false);
      submit.textContent = editing ? "Save changes" : "Create person";
      appendError(context, form, errorMessage(error));
      (error?.fields?.username ? usernameInput : error?.fields?.phone ? phoneInput : usernameInput).focus();
    }
  });

  usernameInput.focus({ preventScroll: true });
}

async function deletePerson({ root, users, context, person, button, writeState }) {
  if (!context.isCurrent() || writeState.pending) return;
  const confirmation = `Delete ${person.username}? This removes them from the group if no expense or payment depends on them.`;
  if (!globalThis.confirm(confirmation)) return;
  if (!context.isCurrent() || writeState.pending) return;
  setWritePending(root, writeState, true);
  let deletionAccepted = false;
  try {
    await context.api.deleteUser(person.id);
    if (!context.isCurrent()) return;
    deletionAccepted = true;
    // refreshUsers owns the selected-user decision. Let the shell show login if
    // the deleted UUID was current; clearing selection first would hide that fact.
    let result;
    try {
      result = await context.refreshUsers();
    } catch (refreshError) {
      if (!context.isCurrent()) return;
      button.closest(".people-row")?.remove();
      const alert = context.inlineError(`Deleted ${person.username}, but the group list could not be reloaded. ${refreshError?.message || "Try again before continuing."}`, "people-delete-error");
      alert.classList.add("people-delete-error");
      alert.setAttribute("tabindex", "-1");
      const retry = text(context, "button", "Reload people", { className: "secondary-button", attributes: { type: "button" } });
      retry.addEventListener("click", () => {
        if (!context.isCurrent() || retry.disabled) return;
        retry.disabled = true;
        void reloadAfterSave(context).catch(() => {
          if (!context.isCurrent()) return;
          retry.disabled = false;
          const currentAlert = root.querySelector(".people-delete-error");
          if (currentAlert) currentAlert.textContent = "The group list still could not be reloaded. Please try again.";
        });
      });
      const existing = root.querySelector(".people-delete-error");
      existing?.remove();
      root.prepend(alert, retry);
      alert.focus({ preventScroll: true });
      return;
    }
    if (!context.isCurrent() || result.state !== "ready") return;
    const remainingUsers = result.users || users.filter((user) => user.id !== person.id);
    root.replaceWith(buildPage(context, remainingUsers));
    await context.refreshData();
  } catch (error) {
    if (!context.isCurrent()) return;
    if (deletionAccepted) return;
    setWritePending(root, writeState, false);
    const message = errorMessage(error, { deletingName: person.username });
    const alert = context.inlineError(message, "people-delete-error");
    alert.classList.add("people-delete-error");
    alert.setAttribute("tabindex", "-1");
    root.querySelector(".people-delete-error")?.remove();
    root.prepend(alert);
    alert.focus({ preventScroll: true });
  }
}

export async function renderView(contentRoot, context) {
  ensurePeopleStyles();
  if (!context.isCurrent()) return;
  contentRoot.replaceChildren(context.loadingPanel("Loading people…"));
  try {
    const users = await context.api.listUsers();
    if (!context.isCurrent()) return;
    contentRoot.replaceChildren(buildPage(context, users));
    if (focusAddAfterRefresh && context.isCurrent()) {
      focusAddAfterRefresh = false;
      contentRoot.querySelector("[data-people-add]")?.focus({ preventScroll: true });
    }
  } catch (error) {
    if (!context.isCurrent()) return;
    const card = context.element("section", {
      className: "error-card",
      attributes: { "aria-labelledby": "people-load-error-heading" },
    });
    card.append(
      text(context, "p", "Your group", { className: "eyebrow" }),
      text(context, "h1", "People couldn’t load", { attributes: { id: "people-load-error-heading" } }),
      text(context, "p", error?.message || "The group member list could not be loaded."),
    );
    const retry = text(context, "button", "Try again", { className: "primary-button", attributes: { type: "button" } });
    retry.addEventListener("click", () => {
      if (context.isCurrent()) void renderView(contentRoot, context);
    });
    card.append(retry);
    contentRoot.replaceChildren(card);
  }
}

export default renderView;
