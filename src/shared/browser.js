/**
 * Tiny WebExtensions compatibility layer.
 * Prefer browser.* (Firefox); fall back to chrome.* (Chrome).
 * Keep browser-specific differences here — not scattered through modules.
 */

const raw =
  typeof globalThis.browser !== "undefined" && globalThis.browser?.runtime?.id != null
    ? globalThis.browser
    : globalThis.chrome;

/** Normalize callback-or-promise extension APIs to Promises. */
function asPromise(value) {
  if (value != null && typeof value.then === "function") {
    return value;
  }
  return Promise.resolve(value);
}

function callLocal(method, ...args) {
  return asPromise(method.call(raw.storage.local, ...args)).then((result) => {
    const err = raw.runtime?.lastError;
    if (err) {
      return Promise.reject(new Error(err.message || String(err)));
    }
    return result;
  });
}

const api = {
  runtime: {
    get id() {
      return raw.runtime.id;
    },
    getURL: (...args) => raw.runtime.getURL(...args),
    sendMessage: (...args) => asPromise(raw.runtime.sendMessage(...args)),
    onInstalled: raw.runtime.onInstalled,
    onMessage: raw.runtime.onMessage,
    get lastError() {
      return raw.runtime.lastError;
    }
  },
  tabs: {
    query: (...args) => asPromise(raw.tabs.query(...args)),
    get: (...args) => asPromise(raw.tabs.get(...args)),
    create: (...args) => asPromise(raw.tabs.create(...args)),
    update: (...args) => asPromise(raw.tabs.update(...args)),
    sendMessage: (...args) => asPromise(raw.tabs.sendMessage(...args)),
    captureVisibleTab: (...args) => asPromise(raw.tabs.captureVisibleTab(...args))
  },
  scripting: {
    executeScript: (...args) => asPromise(raw.scripting.executeScript(...args))
  },
  storage: {
    local: {
      get: (keys) => callLocal(raw.storage.local.get, keys),
      set: (items) => callLocal(raw.storage.local.set, items),
      remove: (keys) => callLocal(raw.storage.local.remove, keys)
    }
  }
};

export { api, raw };

export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "earlier";
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function normalizePageUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return String(url || "").split("#")[0];
  }
}
