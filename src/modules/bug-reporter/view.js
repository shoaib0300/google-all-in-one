import { escapeHtml, copyText, downloadText, hostnameOf } from "../../shared/utils.js";
import { api } from "../../shared/browser.js";
import { saveBugDraft, getBugDraft, clearBugDraft } from "../../shared/storage.js";

function buildMarkdown(data) {
  const lines = [
    "# Bug Report",
    "",
    "## Title",
    "",
    data.title || "(untitled)",
    "",
    "## Severity",
    "",
    data.severity || "—",
    "",
    "## Description",
    "",
    data.description || "—",
    "",
    "## URL",
    "",
    data.url || "—",
    "",
    "## Page title",
    "",
    data.pageTitle || "—",
    "",
    "## Steps to Reproduce",
    "",
    data.steps || "—",
    "",
    "## Expected Result",
    "",
    data.expected || "—",
    "",
    "## Actual Result",
    "",
    data.actual || "—",
    "",
    "## Additional notes",
    "",
    data.notes || "—",
    "",
    "## Environment",
    "",
    `Browser: ${data.browser || "—"}`,
    `Platform: ${data.platform || "—"}`,
    `Viewport: ${data.viewport || "—"}`,
    `Timestamp: ${data.timestamp || "—"}`,
    "",
    "## Selected text",
    "",
    data.selectedText || "—",
    "",
    "## Console errors",
    "",
    data.consoleErrors || "—",
    "",
    "## Failed requests",
    "",
    data.failedRequests || "—",
    "",
    "## Screenshot",
    "",
    data.screenshot ? "Attached as local PNG capture (see downloaded/copied workflow)." : "None",
    ""
  ];
  return lines.join("\n");
}

function collectEnv(report) {
  const ua = navigator.userAgent;
  return {
    browser: ua,
    platform: navigator.platform || "",
    viewport: report?.page
      ? `${report.page.viewport.width}×${report.page.viewport.height}`
      : `${window.innerWidth}×${window.innerHeight}`,
    timestamp: new Date().toISOString(),
    url: report?.page?.url || "",
    pageTitle: report?.page?.title || "",
    selectedText: report?.page?.selectedText || "",
    consoleErrors: (report?.runtime?.consoleErrors || [])
      .map((e) => `- [${e.level}] ${e.message}`)
      .join("\n") || "—",
    failedRequests: (report?.runtime?.failedRequests || [])
      .map((r) => `- ${r.status} ${r.url}`)
      .join("\n") || "—"
  };
}

export async function renderBugReporter(root, report, { prefill = null, onStatus } = {}) {
  const env = collectEnv(report);
  const draft = prefill || (await getBugDraft()) || {};
  let screenshotDataUrl = draft.screenshotDataUrl || "";

  root.innerHTML = `
    <div class="card">
      <h2>Bug Reporter</h2>
      <p class="muted">Builds a local Markdown/JSON report from the current page. Nothing is uploaded.</p>
      ${report?.runtime?.note ? `<p class="muted">${escapeHtml(report.runtime.note)}</p>` : ""}
      <label class="field"><span>Title</span><input id="bug-title" maxlength="200" /></label>
      <label class="field"><span>Severity</span>
        <select id="bug-severity">
          <option value="">—</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>
      </label>
      <label class="field"><span>Description</span><textarea id="bug-desc"></textarea></label>
      <label class="field"><span>Steps to reproduce</span><textarea id="bug-steps"></textarea></label>
      <label class="field"><span>Expected result</span><textarea id="bug-expected"></textarea></label>
      <label class="field"><span>Actual result</span><textarea id="bug-actual"></textarea></label>
      <label class="field"><span>Additional notes</span><textarea id="bug-notes"></textarea></label>

      <h3>Automatically collected</h3>
      <p class="mono muted">${escapeHtml(env.url || "No page scan yet")}</p>
      <p class="muted">Viewport ${escapeHtml(env.viewport)} · ${escapeHtml(env.timestamp)}</p>

      <h3>Screenshot</h3>
      <div class="actions-bar">
        <button type="button" class="btn small" id="bug-capture">Capture screenshot</button>
        <button type="button" class="btn small" id="bug-retake">Retake</button>
        <button type="button" class="btn small" id="bug-remove-shot">Remove</button>
      </div>
      <div id="bug-shot-wrap" class="${screenshotDataUrl ? "" : "hidden"}" style="margin-top:8px">
        <img class="shot" id="bug-shot" alt="Bug screenshot preview" />
      </div>

      <div class="actions-bar">
        <button type="button" class="btn primary small" id="bug-copy">Copy Markdown</button>
        <button type="button" class="btn small" id="bug-dl-md">Download Markdown</button>
        <button type="button" class="btn small" id="bug-dl-json">Download JSON</button>
        <button type="button" class="btn small ghost" id="bug-clear">Clear draft</button>
      </div>
    </div>
  `;

  const $ = (id) => root.querySelector(id);
  $("#bug-title").value = draft.title || "";
  $("#bug-severity").value = draft.severity || "";
  $("#bug-desc").value = draft.description || "";
  $("#bug-steps").value = draft.steps || "";
  $("#bug-expected").value = draft.expected || "";
  $("#bug-actual").value = draft.actual || "";
  $("#bug-notes").value = draft.notes || "";
  if (screenshotDataUrl) {
    $("#bug-shot").src = screenshotDataUrl;
  }

  function readForm() {
    return {
      title: $("#bug-title").value.trim(),
      severity: $("#bug-severity").value.trim(),
      description: $("#bug-desc").value.trim(),
      steps: $("#bug-steps").value.trim(),
      expected: $("#bug-expected").value.trim(),
      actual: $("#bug-actual").value.trim(),
      notes: $("#bug-notes").value.trim(),
      ...env,
      screenshot: Boolean(screenshotDataUrl),
      screenshotDataUrl
    };
  }

  let persistTimer = null;

  async function persist() {
    const data = readForm();
    const result = await saveBugDraft({
      title: data.title,
      severity: data.severity,
      description: data.description,
      steps: data.steps,
      expected: data.expected,
      actual: data.actual,
      notes: data.notes,
      url: data.url,
      pageTitle: data.pageTitle,
      selectedText: data.selectedText,
      browser: data.browser,
      platform: data.platform,
      viewport: data.viewport,
      timestamp: data.timestamp,
      screenshotDataUrl
    });
    if (!result.ok) {
      onStatus?.(result.error || "Draft could not be saved", true);
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persist().catch(() => {});
    }, 250);
  }

  for (const id of ["#bug-title", "#bug-severity", "#bug-desc", "#bug-steps", "#bug-expected", "#bug-actual", "#bug-notes"]) {
    $(id).addEventListener("input", schedulePersist);
    $(id).addEventListener("change", schedulePersist);
  }

  async function capture() {
    onStatus?.("Capturing screenshot…");
    const params = new URLSearchParams(location.search);
    let windowId;
    if (params.get("tabId")) {
      try {
        const tab = await api.tabs.get(Number(params.get("tabId")));
        windowId = tab.windowId;
        await api.tabs.update(tab.id, { active: true });
      } catch {
        // fall through
      }
    }
    if (windowId == null) {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      windowId = tabs?.[0]?.windowId;
    }
    if (windowId == null) {
      throw new Error("No window available for screenshot capture.");
    }

    // Prefer background bridge (works in Chrome + Firefox popup contexts).
    let dataUrl = null;
    try {
      const response = await api.runtime.sendMessage({
        type: "wt-capture-visible",
        windowId
      });
      if (response?.ok && response.dataUrl) {
        dataUrl = response.dataUrl;
      } else if (response && response.ok === false) {
        throw new Error(response.error || "Screenshot capture failed");
      }
    } catch (error) {
      // Fallback: call tabs API directly when messaging is unavailable.
      try {
        dataUrl = await api.tabs.captureVisibleTab(windowId, { format: "png" });
      } catch {
        throw error;
      }
    }
    if (!dataUrl) {
      throw new Error("Screenshot capture failed");
    }

    screenshotDataUrl = dataUrl;
    $("#bug-shot").src = screenshotDataUrl;
    $("#bug-shot-wrap").classList.remove("hidden");
    await persist();
    onStatus?.("Screenshot captured locally.", false);
  }

  $("#bug-capture").addEventListener("click", () => {
    capture().catch((error) => onStatus?.(error.message || "Capture failed", true));
  });
  $("#bug-retake").addEventListener("click", () => {
    capture().catch((error) => onStatus?.(error.message || "Capture failed", true));
  });
  $("#bug-remove-shot").addEventListener("click", async () => {
    screenshotDataUrl = "";
    $("#bug-shot").removeAttribute("src");
    $("#bug-shot-wrap").classList.add("hidden");
    await persist();
  });

  $("#bug-copy").addEventListener("click", async () => {
    try {
      const data = readForm();
      await copyText(buildMarkdown(data));
      onStatus?.("Bug report Markdown copied.", false);
    } catch (error) {
      onStatus?.(error.message || "Copy failed", true);
    }
  });

  $("#bug-dl-md").addEventListener("click", () => {
    const data = readForm();
    const host = hostnameOf(data.url || "page");
    downloadText(`bug-report-${host}.md`, buildMarkdown(data), "text/markdown");
    onStatus?.("Markdown downloaded.", false);
  });

  $("#bug-dl-json").addEventListener("click", () => {
    const data = readForm();
    const payload = { ...data };
    // Keep screenshot optional in JSON to avoid huge files unless present
    if (!payload.screenshotDataUrl) {
      delete payload.screenshotDataUrl;
    }
    const host = hostnameOf(data.url || "page");
    downloadText(`bug-report-${host}.json`, `${JSON.stringify(payload, null, 2)}\n`, "application/json");
    onStatus?.("JSON downloaded.", false);
  });

  $("#bug-clear").addEventListener("click", async () => {
    await clearBugDraft();
    screenshotDataUrl = "";
    await renderBugReporter(root, report, { onStatus });
  });
}

export function prefillFromFinding(finding) {
  return {
    title: finding.title || "",
    description: finding.description || "",
    steps: finding.steps || "1. Open the page\n2. Observe the issue",
    expected: finding.expected || "No accessibility/performance/Contao issue",
    actual: finding.actual || "",
    notes: finding.notes || ""
  };
}
