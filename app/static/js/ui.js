/** Small DOM helpers used by the shell and feature modules. */
export function element(tagName, { className, text, attributes = {}, children = [] } = {}) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (value === true) node.setAttribute(name, "");
    else node.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

export function setStatus(node, message, tone = "info") {
  node.textContent = message || "";
  node.dataset.tone = tone;
  node.hidden = !message;
}

export function inlineError(message, id) {
  return element("p", {
    className: "form-error",
    text: message,
    attributes: { role: "alert", ...(id ? { id } : {}) },
  });
}

export function loadingPanel(label = "Loading…") {
  return element("div", {
    className: "loading-panel",
    attributes: { role: "status", "aria-live": "polite" },
    children: [
      element("span", { className: "spinner", attributes: { "aria-hidden": "true" } }),
      element("span", { text: label }),
    ],
  });
}

export function formatUsd(amount) {
  // Keep API decimal strings exact, even when aggregate totals exceed a
  // single record's limit and cannot be represented by a JavaScript Number.
  const match = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/u.exec(String(amount));
  if (!match) return "$0.00";
  const dollars = BigInt(match[2]);
  const cents = (match[3] || "").padEnd(2, "0");
  const negative = match[1] && (dollars !== 0n || cents !== "00");
  const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(dollars);
  return `${negative ? "-" : ""}$${grouped}.${cents}`;
}
