import { escapeHtml, copyText } from "../../shared/utils.js";

export function renderContao(root, report, { onReportFinding } = {}) {
  if (!report) {
    root.innerHTML = `<div class="card"><p class="empty">Scan the page to run Contao detection.</p></div>`;
    return;
  }

  const c = report.contao;
  root.innerHTML = `
    <div class="card">
      <h2>Contao Developer Toolkit</h2>
      <p class="muted">Browser-side detection only. Server-side Contao internals are not accessible from an extension.</p>
      <div class="grid-2" style="margin-top:8px">
        <div class="stat">
          <div class="label">Status</div>
          <div class="value" style="font-size:14px">${c.detected ? "Contao detected" : "Contao not detected"}</div>
          <div class="meta"><span class="pill ${c.confidence === "High" ? "ok" : c.confidence === "Medium" ? "warn" : "muted"}">${escapeHtml(c.confidence)}</span></div>
        </div>
        <div class="stat">
          <div class="label">Version</div>
          <div class="value" style="font-size:14px">${c.version ? escapeHtml(c.version) : "Unknown"}</div>
          <div class="meta">Never guessed — only shown when explicitly exposed</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Signals</h2>
      <ul class="list" id="contao-signals"></ul>
    </div>

    <div class="card">
      <h2>Contao-related assets</h2>
      <h3>JavaScript</h3>
      <ul class="list" id="contao-js"></ul>
      <h3>CSS</h3>
      <ul class="list" id="contao-css"></ul>
      <h3>Possible modules / elements</h3>
      <ul class="list" id="contao-mods"></ul>
      <div class="actions-bar">
        <button type="button" class="btn small" id="copy-contao">Copy detected Contao information</button>
        <button type="button" class="btn small" id="copy-assets">Copy relevant asset URLs</button>
        <button type="button" class="btn small" id="copy-diag">Copy page diagnostics</button>
        <button type="button" class="btn small" id="report-contao">Generate bug report</button>
      </div>
    </div>
  `;

  const signals = root.querySelector("#contao-signals");
  if (!c.signals.length) {
    signals.innerHTML = `<li class="empty">No Contao frontend signals matched.</li>`;
  } else {
    for (const signal of c.signals) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="row"><span class="pill info">${escapeHtml(signal.confidence)}</span><strong>${escapeHtml(signal.label)}</strong></div>
        <div class="finding-meta">${escapeHtml(signal.detail || "")}</div>
      `;
      signals.appendChild(li);
    }
  }

  function fillList(el, items, emptyText) {
    el.textContent = "";
    if (!items.length) {
      el.innerHTML = `<li class="empty">${escapeHtml(emptyText)}</li>`;
      return;
    }
    for (const item of items.slice(0, 30)) {
      const li = document.createElement("li");
      if (typeof item === "string") {
        li.innerHTML = `<div class="mono finding-meta">${escapeHtml(item)}</div>`;
      } else {
        li.innerHTML = `<div class="finding-title">${escapeHtml(item.className || item.tag)}</div>
          <div class="mono finding-meta">${escapeHtml(item.selector || "")}</div>`;
      }
      el.appendChild(li);
    }
  }

  fillList(root.querySelector("#contao-js"), c.assets.scripts, "No Contao-related scripts detected.");
  fillList(root.querySelector("#contao-css"), c.assets.styles, "No Contao-related stylesheets detected.");
  fillList(root.querySelector("#contao-mods"), c.modules, "No mod_/ce_ class patterns found.");

  const diagnostics = {
    url: report.page.url,
    title: report.page.title,
    contao: {
      detected: c.detected,
      version: c.version,
      confidence: c.confidence,
      signals: c.signals,
      assets: {
        scripts: c.assets.scripts,
        styles: c.assets.styles
      },
      modules: c.modules
    }
  };

  root.querySelector("#copy-contao").addEventListener("click", async () => {
    await copyText(JSON.stringify(diagnostics.contao, null, 2));
  });
  root.querySelector("#copy-assets").addEventListener("click", async () => {
    const urls = [...c.assets.scripts, ...c.assets.styles].join("\n");
    await copyText(urls || "No Contao-related asset URLs.");
  });
  root.querySelector("#copy-diag").addEventListener("click", async () => {
    await copyText(JSON.stringify(diagnostics, null, 2));
  });
  root.querySelector("#report-contao").addEventListener("click", () => {
    onReportFinding?.({
      title: c.detected ? `Contao page issue (${c.version || "version unknown"})` : "Contao-related page issue",
      description: `Contao toolkit diagnostics for ${report.page.url}`,
      actual: JSON.stringify(diagnostics.contao, null, 2),
      notes: c.detected ? "Contao frontend signals were detected." : "Contao was not detected; report still includes page diagnostics."
    });
  });
}
