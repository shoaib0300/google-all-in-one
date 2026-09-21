import { escapeHtml, hostnameOf, isRestrictedUrl } from "../shared/utils.js";
import { api, relativeTime, normalizePageUrl } from "../shared/browser.js";
import { saveLastScan, getLastScan } from "../shared/storage.js";
import { renderPerformance } from "../modules/performance/view.js";
import { renderAccessibility } from "../modules/accessibility/view.js";
import { renderBugReporter, prefillFromFinding } from "../modules/bug-reporter/view.js";
import { renderCms, cmsNavLabel } from "../modules/cms/view.js";

const els = {
  host: document.getElementById("page-host"),
  url: document.getElementById("page-url"),
  status: document.getElementById("status"),
  banner: document.getElementById("restricted-banner"),
  previous: document.getElementById("previous-scan"),
  scan: document.getElementById("btn-scan"),
  openTab: document.getElementById("btn-open-tab"),
  navCms: document.getElementById("nav-cms"),
  views: {
    overview: document.getElementById("view-overview"),
    performance: document.getElementById("view-performance"),
    accessibility: document.getElementById("view-accessibility"),
    bugs: document.getElementById("view-bugs"),
    cms: document.getElementById("view-cms")
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
  // Always reinject so window.__wtRunScan is updated to the latest analyzer.
  try {
    await api.scripting.executeScript({
      target: { tabId },
      files: ["src/content/content.js"]
    });
  } catch {
    // Fall through to ping — manifest content script may already be active
  }
  try {
    const ping = await api.tabs.sendMessage(tabId, { type: "wt-ping" });
    return Boolean(ping?.ok);
  } catch {
    return false;
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

    const response = await api.tabs.sendMessage(activeTab.id, { type: "wt-scan-v3" });
    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }
    report = response.report;
    if (!report.design) {
      report.design = {
        available: false,
        fonts: [],
        textColors: [],
        backgroundColors: [],
        error: "Fonts & colors missing — reload the extension, refresh the page, then Scan again."
      };
    }
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

function primaryCmsLabel(technology, contao) {
  const cmsList = technology?.byCategory?.cms || [];
  if (cmsList.length) {
    return cmsList.map((item) => item.name).join(", ");
  }
  if (contao?.detected) {
    return contao.version ? `Contao ${contao.version}` : "Contao";
  }
  if (technology && technology.available === false) {
    return "Unavailable";
  }
  return "None detected";
}

function designSections(design) {
  if (!design?.available) {
    return `<div class="card"><h2>Fonts &amp; colors</h2><p class="muted">${escapeHtml(
      design?.error || "Detection unavailable — reload the extension, refresh this page, then click Scan page."
    )}</p></div>`;
  }

  const fonts = design.fonts || [];
  const textColors = design.textColors || [];
  const bgColors = design.backgroundColors || [];

  const fontRows = fonts.length
    ? fonts
        .map((f) => {
          const safeFamily = String(f.family || "").replace(/[^a-zA-Z0-9 \-_]/g, "");
          return `
        <div class="design-font" style="font-family:${safeFamily ? `"${escapeHtml(safeFamily)}"` : "sans-serif"}, sans-serif">
          <strong>${escapeHtml(f.family)}</strong>
          <span class="muted">Sample preview</span>
        </div>`;
        })
        .join("")
    : `<p class="muted">No fonts detected.</p>`;

  function colorRows(list, emptyText) {
    if (!list.length) {
      return `<p class="muted">${emptyText}</p>`;
    }
    return `<div class="swatch-grid">${list
      .map(
        (c) => `
      <div class="swatch" title="${escapeHtml(c.hex)} · used ~${c.count}×">
        <span class="swatch-chip" style="background:${escapeHtml(c.hex)}"></span>
        <span class="mono">${escapeHtml(c.hex)}</span>
      </div>`
      )
      .join("")}</div>`;
  }

  return `
    <div class="card">
      <h2>Fonts</h2>
      <p class="muted">Families actually used on visible text (not every loaded @font-face).</p>
      <div class="design-font-list">${fontRows}</div>
      ${
        design.fontStylesheets?.length
          ? `<p class="muted" style="margin-top:8px">Font stylesheets: ${design.fontStylesheets.length}</p>`
          : ""
      }
    </div>
    <div class="card">
      <h2>Colors</h2>
      <p class="muted">Most common text and background colors sampled from visible elements.</p>
      <h3>Text</h3>
      ${colorRows(textColors, "No text colors detected.")}
      <h3>Backgrounds</h3>
      ${colorRows(bgColors, "No background colors detected.")}
    </div>
  `;
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
  const design = report.design;
  const cmsLabel = primaryCmsLabel(tech, contao);

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
        <div class="stat"><div class="label">CMS</div><div class="value" style="font-size:13px">${escapeHtml(cmsLabel)}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Detected technology</h2>
      ${techLines(tech)}
      ${
        contao.detected
          ? `<p class="muted" style="margin-top:8px">Contao diagnostics available in the ${escapeHtml(cmsNavLabel(report))} tab${contao.version ? ` · version ${escapeHtml(contao.version)}` : " · version unknown"}.</p>`
          : cmsLabel !== "None detected" && cmsLabel !== "Unavailable"
            ? `<p class="muted" style="margin-top:8px">Open the <strong>${escapeHtml(cmsLabel)}</strong> tab for CMS signals and related assets.</p>`
            : ""
      }
    </div>

    ${designSections(design)}

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
        <button type="button" class="btn small" data-goto="cms">${escapeHtml(cmsNavLabel(report))}</button>
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

function updateCmsNav() {
  if (els.navCms) {
    els.navCms.textContent = cmsNavLabel(report);
  }
}

function renderAll() {
  updateCmsNav();
  renderOverview();
  renderPerformance(els.views.performance, report, { onReportFinding: reportFinding });
  renderAccessibility(els.views.accessibility, report, { onReportFinding: reportFinding });
  renderCms(els.views.cms, report, { onReportFinding: reportFinding });
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
