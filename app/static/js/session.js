import { api as defaultApi } from "./api.js";

export const SESSION_STORAGE_KEY = "splitmoney.selectedUserId";

let memorySelection = null;
let currentUser = null;
let generation = 0;

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getSelectedUserId() {
  const local = storage();
  if (local) {
    try {
      return local.getItem(SESSION_STORAGE_KEY);
    } catch {
      // Fall back to the in-memory selection when browser storage is unavailable.
    }
  }
  return memorySelection;
}

export function getCurrentUser() {
  return currentUser;
}

export function getSessionGeneration() {
  return generation;
}

export function setSelectedUser(user) {
  currentUser = user || null;
  memorySelection = user?.id || null;
  const local = storage();
  if (local) {
    try {
      if (user?.id) local.setItem(SESSION_STORAGE_KEY, user.id);
      else local.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Keep the selection for this tab even if localStorage is blocked.
    }
  }
  generation += 1;
  return generation;
}

export function clearSelectedUser() {
  currentUser = null;
  memorySelection = null;
  const local = storage();
  if (local) {
    try {
      local.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // A fresh page load will still offer the username form.
    }
  }
  generation += 1;
  return generation;
}

/** Update the selected display name after an authoritative users list refresh. */
export function replaceUsers(users) {
  const selectedId = getSelectedUserId();
  if (!selectedId) {
    currentUser = null;
    return { state: "login", users };
  }
  const replacement = users.find((user) => user.id === selectedId);
  if (!replacement) {
    clearSelectedUser();
    return { state: "login", users };
  }
  currentUser = replacement;
  return { state: "ready", user: currentUser, users };
}

/**
 * Validate a remembered UUID on startup. A failed request preserves the UUID and
 * returns `error`; a successful list without it clears the preference and returns
 * `login`. Generation checks prevent old requests from undoing a user switch.
 */
export async function loadSession(client = defaultApi) {
  const requestGeneration = generation;
  const selectedId = getSelectedUserId();
  if (!selectedId) return { state: "login", generation };

  let users;
  try {
    users = await client.listUsers();
  } catch (error) {
    if (requestGeneration !== generation) return { state: "stale", generation };
    return { state: "error", error, generation };
  }

  if (requestGeneration !== generation || selectedId !== getSelectedUserId()) {
    return { state: "stale", generation };
  }

  const found = users.find((user) => user.id === selectedId);
  if (!found) {
    clearSelectedUser();
    return { state: "login", users, generation };
  }
  currentUser = found;
  return { state: "ready", user: found, users, generation };
}

/** Fetch canonical user labels and keep selection attached to its UUID. */
export async function refreshUsers(client = defaultApi) {
  const requestGeneration = generation;
  const users = await client.listUsers();
  if (requestGeneration !== generation) return { state: "stale", users, generation };
  const result = replaceUsers(users);
  return { ...result, generation };
}

export const session = Object.freeze({
  getSelectedUserId,
  getCurrentUser,
  getGeneration: getSessionGeneration,
  setSelectedUser,
  clearSelectedUser,
  replaceUsers,
  loadSession,
  refreshUsers,
});
