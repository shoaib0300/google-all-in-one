/**
 * Local storage helpers (chrome.storage.local / browser.storage.local).
 */

import { api } from "./browser.js";

const KEYS = {
  bugDraft: "bugDraft",
  lastScan: "lastScan"
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Shrink scan payload before persistence (quota + privacy).
 */
export function sanitizeReportForStorage(report) {
  if (!report || typeof report !== "object") {
    return null;
  }
  const copy = cloneJson(report);

  if (copy.performance?.resources) {
    copy.performance.resources = copy.performance.resources.slice(0, 80);
  }
  if (copy.performance?.images) {
    copy.performance.images = copy.performance.images.slice(0, 80);
  }
  if (copy.accessibility?.findings) {
    copy.accessibility.findings = copy.accessibility.findings.slice(0, 120);
  }
  if (copy.design) {
    copy.design.fonts = (copy.design.fonts || []).slice(0, 16);
    copy.design.textColors = (copy.design.textColors || []).slice(0, 18);
    copy.design.backgroundColors = (copy.design.backgroundColors || []).slice(0, 18);
    copy.design.fontFiles = (copy.design.fontFiles || []).slice(0, 12);
    copy.design.fontStylesheets = (copy.design.fontStylesheets || []).slice(0, 8);
  }
  if (copy.runtime) {
    copy.runtime.consoleErrors = (copy.runtime.consoleErrors || []).slice(-20);
    copy.runtime.failedRequests = (copy.runtime.failedRequests || []).slice(-20);
  }
  if (copy.page?.selectedText) {
    copy.page.selectedText = String(copy.page.selectedText).slice(0, 500);
  }
  // Never persist screenshots inside scan blobs
  if (copy.bugDraft) {
    delete copy.bugDraft;
  }
  return copy;
}

export async function getBugDraft() {
  try {
    const data = await api.storage.local.get(KEYS.bugDraft);
    return data[KEYS.bugDraft] || null;
  } catch {
    return null;
  }
}

export async function saveBugDraft(draft) {
  try {
    const safe = draft ? cloneJson(draft) : null;
    if (safe?.screenshotDataUrl && String(safe.screenshotDataUrl).length > 1_500_000) {
      // Keep a flag but drop oversized inline screenshots from storage
      safe.screenshotTooLarge = true;
      delete safe.screenshotDataUrl;
    }
    await api.storage.local.set({ [KEYS.bugDraft]: safe });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Storage write failed" };
  }
}

export async function clearBugDraft() {
  try {
    await api.storage.local.remove(KEYS.bugDraft);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Storage clear failed" };
  }
}

export async function saveLastScan(report) {
  try {
    const sanitized = sanitizeReportForStorage(report);
    if (!sanitized) {
      return { ok: false, error: "Nothing to save" };
    }
    await api.storage.local.set({ [KEYS.lastScan]: sanitized });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not persist scan" };
  }
}

export async function getLastScan() {
  try {
    const data = await api.storage.local.get(KEYS.lastScan);
    return data[KEYS.lastScan] || null;
  } catch {
    return null;
  }
}

export async function clearLastScan() {
  try {
    await api.storage.local.remove(KEYS.lastScan);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not clear scan" };
  }
}

/** @deprecated kept for compatibility with older panel code paths */
export async function saveLastScanMeta(meta) {
  return saveLastScan(meta);
}

export async function getLastScanMeta() {
  const scan = await getLastScan();
  if (!scan?.page) {
    return null;
  }
  return {
    url: scan.page.url,
    title: scan.page.title,
    timestamp: scan.page.timestamp
  };
}
