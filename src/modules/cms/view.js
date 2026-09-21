import { escapeHtml, copyText, formatBytes } from "../../shared/utils.js";
import { renderContao } from "../contao/view.js";

const CMS_ASSET_PATTERNS = {
  Contao: /contao|\/assets\/contao\/|tl_files|mod_article|ce_/i,
  WordPress: /wp-content|wp-includes|wp-json|wp-emoji/i,
  Drupal: /\/sites\/default\/|\/core\/misc\/|drupal/i,
  Joomla: /\/media\/system\/|option=com_|joomla/i,
  Shopify: /cdn\.shopify\.com|myshopify|shopify/i,
  TYPO3: /typo3conf|typo3temp|typo3\//i,
  Wix: /wixstatic|wix-/i,
  Squarespace: /squarespace/i,
  Webflow: /webflow/i,
  Ghost: /\/ghost\/|ghost-sdk/i
};

export function getPrimaryCms(report) {
  const cmsList = report?.technology?.byCategory?.cms || [];
  if (cmsList.length) {
    return cmsList[0];
  }
  if (report?.contao?.detected) {
    return {
      name: "Contao",
      category: "cms",
      confidence: report.contao.confidence || "Medium",
      evidence: "Contao frontend signals"
    };
  }
  return null;
}

export function cmsNavLabel(report) {
  const primary = getPrimaryCms(report);
  return primary?.name || "CMS";
}

function relatedAssets(report, cmsName) {
  const pattern = CMS_ASSET_PATTERNS[cmsName];
  const resources = report?.performance?.resources || [];
  if (!pattern || !resources.length) {
    return [];
  }
  return resources
    .filter((r) => pattern.test(r.name || r.url || ""))
    .slice(0, 40)
    .map((r) => ({
      url: r.name || r.url || "",
      type: r.initiatorType || r.type || "",
      transferSize: r.transferSize
    }));
}

function renderGenericCms(root, report, { onReportFinding } = {}) {
  const cmsItems = report?.technology?.byCategory?.cms || [];
  const primary = getPrimaryCms(report);
  const name = primary?.name || "CMS";
  const assets = primary ? relatedAssets(report, primary.name) : [];

  root.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(name)} Toolkit</h2>
      <p class="muted">Browser-side CMS detection from frontend signals only. Server internals are not accessible.</p>
      <div class="grid-2" style="margin-top:8px">
        <div class="stat">
          <div class="label">CMS</div>
          <div class="value" style="font-size:14px">${escapeHtml(primary ? primary.name : "None detected")}</div>
          <div class="meta">${
            primary
              ? `<span class="pill ${primary.confidence === "High" ? "ok" : primary.confidence === "Medium" ? "warn" : "muted"}">${escapeHtml(primary.confidence)}</span>`
              : ""
          }</div>
        </div>
        <div class="stat">
          <div class="label">Evidence</div>
          <div class="value" style="font-size:12px;font-weight:500">${escapeHtml(primary?.evidence || "—")}</div>
          <div class="meta">Never guessed from page text alone</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Detected CMS signals</h2>
      <ul class="list" id="cms-signals"></ul>
    </div>

    <div class="card">
      <h2>${escapeHtml(name)}-related assets</h2>
      <ul class="list" id="cms-assets"></ul>
      <div class="actions-bar">
        <button type="button" class="btn small" id="copy-cms">Copy CMS information</button>
        <button type="button" class="btn small" id="copy-cms-assets">Copy asset URLs</button>
        <button type="button" class="btn small" id="report-cms">Generate bug report</button>
      </div>
    </div>
  `;

  const signals = root.querySelector("#cms-signals");
  if (!cmsItems.length) {
    signals.innerHTML = `<li class="empty">No recognizable CMS detected on this page.</li>`;
  } else {
    for (const item of cmsItems) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="row">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="pill ${item.confidence === "High" ? "ok" : item.confidence === "Medium" ? "warn" : "muted"}">${escapeHtml(item.confidence)}</span>
        </div>
        <div class="finding-meta">${escapeHtml(item.evidence || "")}</div>
      `;
      signals.appendChild(li);
    }
  }

  const assetsEl = root.querySelector("#cms-assets");
  if (!assets.length) {
    assetsEl.innerHTML = `<li class="empty">No clearly related asset URLs found in the performance resource list.</li>`;
  } else {
    for (const asset of assets) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="finding-title">${escapeHtml(asset.type || "resource")}${
          asset.transferSize != null ? ` · ${escapeHtml(formatBytes(asset.transferSize))}` : ""
        }</div>
        <div class="mono finding-meta">${escapeHtml(asset.url)}</div>
      `;
      assetsEl.appendChild(li);
    }
  }

  const diagnostics = {
    url: report.page.url,
    title: report.page.title,
    cms: {
      primary: primary || null,
      items: cmsItems,
      assets
    }
  };

  root.querySelector("#copy-cms").addEventListener("click", async () => {
    await copyText(JSON.stringify(diagnostics.cms, null, 2));
  });
  root.querySelector("#copy-cms-assets").addEventListener("click", async () => {
    await copyText(assets.map((a) => a.url).join("\n") || "No related asset URLs.");
  });
  root.querySelector("#report-cms").addEventListener("click", () => {
    onReportFinding?.({
      title: primary ? `${primary.name} page issue` : "CMS-related page issue",
      description: `CMS toolkit diagnostics for ${report.page.url}`,
      actual: JSON.stringify(diagnostics.cms, null, 2),
      notes: primary
        ? `${primary.name} was detected (${primary.confidence} confidence).`
        : "No CMS was detected; report still includes page diagnostics."
    });
  });
}

export function renderCms(root, report, options = {}) {
  if (!report) {
    root.innerHTML = `<div class="card"><p class="empty">Scan the page to run CMS detection.</p></div>`;
    return;
  }

  const primary = getPrimaryCms(report);
  if (primary?.name === "Contao" || report.contao?.detected) {
    renderContao(root, report, options);
    return;
  }

  renderGenericCms(root, report, options);
}
