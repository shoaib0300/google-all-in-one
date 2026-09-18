import { escapeHtml, hostnameOf, isRestrictedUrl } from "../shared/utils.js";
import { api, relativeTime, normalizePageUrl } from "../shared/browser.js";
import { saveLastScan, getLastScan } from "../shared/storage.js";
import { renderPerformance } from "../modules/performance/view.js";
import { renderAccessibility } from "../modules/accessibility/view.js";
import { renderBugReporter, prefillFromFinding } from "../modules/bug-reporter/view.js";
import { renderContao } from "../modules/contao/view.js";

const els = {
  host: document.getElementById("page-host"),
  url: document.getElementById("page-url"),
  status: document.getElementById("status"),
  banner: document.getElementById("restricted-banner"),
  previous: document.getElementById("previous-scan"),
  scan: document.getElementById("btn-scan"),
  openTab: document.getElementById("btn-open-tab"),
  views: {
    overview: document.getElementById("view-overview"),
    performance: document.getElementById("view-performance"),
    accessibility: document.getElementById("view-accessibility"),
    bugs: document.getElementById("view-bugs"),
    contao: document.getElementById("view-contao")
  }
};

let activeTab = null;
let report = null;
let previousScan = null;
let viewingPrevious = false;
let currentView = "overview";
let bugPrefill = null;
let storageWarning = "";

if (location.search.includes("expanded=1") || window.outerWidth > 500) {
  document.body.classList.add("expanded");
}

function setStatus(message, isError = false) {
  const extra = storageWarning ? ` · ${storageWarning}` : "";
  els.status.textContent = (message || "") + (message ? extra : storageWarning);
  els.status.classList.toggle("error", Boolean(isError));
  els.status.classList.toggle("ok", Boolean(message) && !isError);
}

function showView(name) {
  currentView = name;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  Object.entries(els.views).forEach(([key, node]) => {
    node.classList.toggle("active", key === name);
  });
  renderAll();
}

async function getTargetTab() {
  const params = new URLSearchParams(location.search);
  const tabIdParam = params.get("tabId");
  if (tabIdParam) {
    try {
      return await api.tabs.get(Number(tabIdParam));
    } catch {
      // fall through
    }
  }
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs?.[0];
  if (tab?.url?.startsWith("chrome-extension://") || tab?.url?.startsWith("moz-extension://")) {
    const all = await api.tabs.query({ lastFocusedWindow: true });
    const pageTab = all.find(
      (t) =>
        t.id !== tab.id &&
        t.url &&
        !t.url.startsWith("chrome-extension://") &&
        !t.url.startsWith("moz-extension://") &&
        !t.url.startsWith("chrome://") &&
        !t.url.startsWith("about:")
    );
    if (pageTab) {
      return pageTab;
    }
  }
  return tab || null;
}

async function ensureContentScript(tabId) {
  try {
    await api.tabs.sendMessage(tabId, { type: "wt-ping" });
    return true;
  } catch {
    try {
      await api.scripting.executeScript({
        target: { tabId },
        files: ["src/content/content.js"]
      });
      await api.tabs.sendMessage(tabId, { type: "wt-ping" });
      return true;
    } catch {
      return false;
    }
  }
}

function updatePreviousBanner() {
  if (!previousScan || viewingPrevious) {
    els.previous.classList.add("hidden");
    els.previous.innerHTML = "";
    return;
  }
  els.previous.classList.remove("hidden");
  els.previous.innerHTML = `
    <span>Previous scan available for <strong>${escapeHtml(hostnameOf(previousScan.page?.url || ""))}</strong></span>
    <button type="button" class="btn small" id="btn-view-previous">View previous scan</button>
  `;
  els.previous.querySelector("#btn-view-previous")?.addEventListener("click", () => {
    report = previousScan;
    viewingPrevious = true;
    updatePageHeader({ url: report.page.url, title: report.page.title });
    els.previous.classList.add("hidden");
    renderAll();
    setStatus(`Viewing previous scan · ${relativeTime(report.page.timestamp)}`);
  });
}

async function scanPage() {
  setStatus("Scanning…");
  storageWarning = "";
  els.scan.disabled = true;
  viewingPrevious = false;
  try {
    activeTab = await getTargetTab();
    if (!activeTab?.id) {
      throw new Error("No active tab.");
    }
    updatePageHeader(activeTab);

    if (isRestrictedUrl(activeTab.url || "")) {
      els.banner.classList.remove("hidden");
      report = null;
      renderAll();
      setStatus("Restricted page.", true);
      return;
    }
    els.banner.classList.add("hidden");

    const ready = await ensureContentScript(activeTab.id);
    if (!ready) {
      throw new Error("Could not reach this page. Restricted pages cannot be inspected.");
    }

    const response = await api.tabs.sendMessage(activeTab.id, { type: "wt-scan" });
    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }
    report = response.report;
    previousScan = null;
    updatePreviousBanner();

    const saved = await saveLastScan(report);
    if (!saved.ok) {
      storageWarning = "Scan not saved (storage warning)";
    }

    renderAll();
    setStatus(`Scan complete · ${relativeTime(report.page.timestamp)}`);
  } catch (error) {
    setStatus(error?.message || "Scan failed.", true);
  } finally {
    els.scan.disabled = false;
  }
}

function updatePageHeader(tab) {
  const url = tab?.url || report?.page?.url || "";
  els.host.textContent = hostnameOf(url);
  els.url.textContent = url || "—";
}

function techLines(technology) {
  if (!technology?.available) {
    return `<p class="muted">${escapeHtml(technology?.error || "Detection unavailable")}</p>`;
  }
  const cats = [
    ["CMS", technology.byCategory?.cms],
    ["Framework", technology.byCategory?.framework],
    ["Libraries", technology.byCategory?.library],
    ["CSS", technology.byCategory?.css],
    ["Platform", technology.byCategory?.platform],
    ["Analytics", technology.byCategory?.analytics]
  ];
  const hasAny = cats.some(([, list]) => list?.length);
  if (!hasAny) {
    return `<p class="muted">No recognizable CMS or technology detected.</p>`;
  }
  return cats
    .filter(([, list]) => list?.length)
    .map(([label, list]) => {
      const rows = list
        .map(
          (item) => `
          <div class="tech-item">
            <div class="row">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="pill ${item.confidence === "High" ? "ok" : item.confidence === "Medium" ? "warn" : "muted"}">${escapeHtml(item.confidence)}</span>
            </div>
            <div class="finding-meta">${escapeHtml(item.evidence || "")}</div>
          </div>`
        )
        .join("");
      return `<div class="tech-group"><div class="label">${label}</div>${rows}</div>`;
    })
    .join("");
}

function renderOverview() {
  const root = els.views.overview;
  if (!report) {
    root.innerHTML = `<div class="card"><p class="empty">Click <strong>Scan page</strong> to inspect the current tab.</p>
      <p class="muted">Technology detection, Performance, Accessibility, Bug Reporter, and Contao tools run from one scan.</p></div>`;
    return;
  }
  const page = report.page;
  const perf = report.performance;
  const a11y = report.accessibility;
  const contao = report.contao;
  const tech = report.technology;

  root.innerHTML = `
    <div class="card">
      <h2>Website</h2>
      <p><strong>${escapeHtml(hostnameOf(page.url))}</strong></p>
      <p class="muted">${escapeHtml(page.title || "Untitled")}</p>
      <p class="muted mono">${escapeHtml(page.url)}</p>
      <div class="grid-2" style="margin-top:8px">
        <div class="stat"><div class="label">Viewport</div><div class="value">${page.viewport.width}×${page.viewport.height}</div></div>
        <div class="stat"><div class="label">DOM elements</div><div class="value">${page.domElements.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Scanned</div><div class="value" style="font-size:11px">${escapeHtml(relativeTime(page.timestamp))}</div></div>
        <div class="stat"><div class="label">Contao</div><div class="value" style="font-size:13px">${contao.detected ? "Detected" : "Not detected"}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Detected technology</h2>
      ${techLines(tech)}
      ${
        contao.detected
          ? `<p class="muted" style="margin-top:8px">Contao module available with diagnostics${contao.version ? ` · version ${escapeHtml(contao.version)}` : " · version unknown"}.</p>`
          : ""
      }
    </div>

    <div class="card">
      <h2>Module summaries</h2>
      <div class="grid-2">
        <div class="stat"><div class="label">LCP</div><div class="value" style="font-size:14px">${perf.vitals.lcp.value == null ? "N/A" : `${(perf.vitals.lcp.value / 1000).toFixed(2)}s`}</div><div class="meta">${escapeHtml(perf.vitals.lcp.status)}</div></div>
        <div class="stat"><div class="label">CLS</div><div class="value" style="font-size:14px">${perf.vitals.cls.value == null ? "N/A" : Number(perf.vitals.cls.value).toFixed(3)}</div><div class="meta">${escapeHtml(perf.vitals.cls.status)}</div></div>
        <div class="stat"><div class="label">A11y errors</div><div class="value">${a11y.summary.errors}</div><div class="meta">${a11y.summary.warnings} warnings</div></div>
        <div class="stat"><div class="label">Resources</div><div class="value" style="font-size:14px">${(perf.totals.transferSize / (1024 * 1024)).toFixed(2)} MB</div><div class="meta">${perf.totals.resourceCount} entries</div></div>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn small" data-goto="performance">Performance</button>
        <button type="button" class="btn small" data-goto="accessibility">Accessibility</button>
        <button type="button" class="btn small" data-goto="bugs">Bug Reporter</button>
        <button type="button" class="btn small" data-goto="contao">Contao</button>
      </div>
    </div>
  `;
  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-goto")));
  });
}

function reportFinding(finding) {
  bugPrefill = prefillFromFinding(finding);
  showView("bugs");
}

function renderAll() {
  renderOverview();
  renderPerformance(els.views.performance, report, { onReportFinding: reportFinding });
  renderAccessibility(els.views.accessibility, report, { onReportFinding: reportFinding });
  renderContao(els.views.contao, report, { onReportFinding: reportFinding });
  renderBugReporter(els.views.bugs, report, {
    prefill: bugPrefill,
    onStatus: setStatus
  }).then(() => {
    bugPrefill = null;
  });
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

els.scan.addEventListener("click", () => {
  scanPage();
});

els.openTab.addEventListener("click", async () => {
  const tab = await getTargetTab();
  const url = api.runtime.getURL(
    `src/panel/panel.html?expanded=1&tabId=${encodeURIComponent(tab?.id || "")}`
  );
  api.tabs.create({ url });
});

(async function init() {
  activeTab = await getTargetTab();
  updatePageHeader(activeTab);
  if (activeTab?.url && isRestrictedUrl(activeTab.url)) {
    els.banner.classList.remove("hidden");
  }

  const saved = await getLastScan();
  const currentUrl = normalizePageUrl(activeTab?.url || "");
  if (saved?.page?.url && currentUrl && normalizePageUrl(saved.page.url) === currentUrl) {
    report = saved;
    setStatus(`Last scan restored · ${relativeTime(saved.page.timestamp)}`);
  } else if (saved?.page?.url) {
    previousScan = saved;
    updatePreviousBanner();
  }

  renderAll();
})();
