/**
 * Background service worker — screenshot bridge for Chrome + Firefox popups.
 */

import { api, raw } from "../shared/browser.js";

raw.runtime.onInstalled.addListener(() => {
  // Install hook
});

raw.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "wt-capture-visible") {
    return undefined;
  }

  (async () => {
    try {
      const windowId = message.windowId;
      const dataUrl = await api.tabs.captureVisibleTab(
        typeof windowId === "number" ? windowId : undefined,
        { format: "png" }
      );
      sendResponse({ ok: true, dataUrl });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Screenshot capture failed" });
    }
  })();
  return true;
});
