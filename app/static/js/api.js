/** Same-origin API client shared by the shell and feature views. */
export class ApiError extends Error {
  constructor({ status = null, code = "request_failed", message = "The request could not be completed.", fields = null, network = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.message = message;
    this.fields = fields;
    this.network = network;
  }
}

async function readJson(response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Send a same-origin JSON request.
 * Network errors have `network === true`; API/validation errors retain HTTP status.
 */
export async function apiRequest(path, { method = "GET", body, signal, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError({
      code: "network_error",
      message: "Could not reach Splitmoney. Check your connection and try again.",
      network: true,
    });
  }

  const data = await readJson(response);
  if (!response.ok) {
    const details = data?.error;
    throw new ApiError({
      status: response.status,
      code: details?.code || "request_failed",
      message: details?.message || `The request failed (${response.status}).`,
      fields: details?.fields || null,
    });
  }
  if (data === undefined && response.status !== 204 && response.status !== 205) {
    throw new ApiError({
      status: response.status,
      code: "invalid_response",
      message: "The server returned an unreadable response. Please try again.",
    });
  }
  return data;
}

const json = (path, method, body, options = {}) => apiRequest(path, { ...options, method, body });
const entity = (name, id) => `/api/${name}/${encodeURIComponent(id)}`;

export const login = (username, options) => json("/api/login", "POST", { username }, options);
export const listUsers = (options) => apiRequest("/api/users", options);
export const createUser = (user, options) => json("/api/users", "POST", user, options);
export const getUser = (id, options) => apiRequest(entity("users", id), options);
export const updateUser = (id, patch, options) => json(entity("users", id), "PATCH", patch, options);
export const deleteUser = (id, options) => json(entity("users", id), "DELETE", undefined, options);

export const listExpenses = (options) => apiRequest("/api/expenses", options);
export const createExpense = (expense, options) => json("/api/expenses", "POST", expense, options);
export const getExpense = (id, options) => apiRequest(entity("expenses", id), options);
export const updateExpense = (id, patch, options) => json(entity("expenses", id), "PATCH", patch, options);
export const deleteExpense = (id, options) => json(entity("expenses", id), "DELETE", undefined, options);

export const listSettlements = (options) => apiRequest("/api/settlements", options);
export const createSettlement = (settlement, options) => json("/api/settlements", "POST", settlement, options);
export const getSettlement = (id, options) => apiRequest(entity("settlements", id), options);
export const updateSettlement = (id, patch, options) => json(entity("settlements", id), "PATCH", patch, options);
export const deleteSettlement = (id, options) => json(entity("settlements", id), "DELETE", undefined, options);

export const getBalances = (options) => apiRequest("/api/balances", options);

/** Stable object passed to feature render callbacks. */
export const api = Object.freeze({
  request: apiRequest,
  login,
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  listSettlements,
  createSettlement,
  getSettlement,
  updateSettlement,
  deleteSettlement,
  getBalances,
});
