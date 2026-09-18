/**
 * Shared helpers (panel / background). Safe for extension pages.
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n < 1024) {
    return `${Math.round(n)} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n < 1000) {
    return `${Math.round(n)} ms`;
  }
  return `${(n / 1000).toFixed(2)} s`;
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url || "—";
  }
}

export function isRestrictedUrl(url) {
  if (!url) {
    return true;
  }
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("moz-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://") ||
    url.startsWith("view-source:") ||
    url.startsWith("resource://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com") ||
    url.startsWith("https://addons.mozilla.org")
  );
}

export function cssEscapeIdent(value) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function downloadText(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text) {
  const value = String(text ?? "");
  if (!value) {
    throw new Error("Nothing to copy");
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) {
    throw new Error("Clipboard write failed");
  }
}
