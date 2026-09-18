import { escapeHtml, formatBytes, formatMs } from "../../shared/utils.js";

function vitalCard(key, metric) {
  const value =
    metric?.value == null
      ? "Not available yet"
      : key === "cls"
        ? Number(metric.value).toFixed(3)
        : formatMs(metric.value);
  return `
    <div class="stat">
      <div class="label">${escapeHtml(metric?.label || key.toUpperCase())}</div>
      <div class="value" style="font-size:15px">${escapeHtml(value)}</div>
      <div class="meta"><span class="pill muted">${escapeHtml(metric?.status || "unavailable")}</span>
      ${metric?.note ? ` ${escapeHtml(metric.note)}` : ""}</div>
    </div>
  `;
}

export function renderPerformance(root, report, { onReportFinding } = {}) {
  if (!report) {
    root.innerHTML = `<div class="card"><p class="empty">Scan the page to collect performance data.</p></div>`;
    return;
  }

  const perf = report.performance;
  const nav = perf.navigation;
  const resources = [...perf.resources].sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));

  root.innerHTML = `
    <div class="card">
      <h2>Performance summary</h2>
      <div class="grid-2">
        ${vitalCard("lcp", perf.vitals.lcp)}
        ${vitalCard("cls", perf.vitals.cls)}
        ${vitalCard("inp", perf.vitals.inp)}
        ${vitalCard("fcp", perf.vitals.fcp)}
      </div>
      <div class="grid-2" style="margin-top:8px">
        <div class="stat"><div class="label">DOM</div><div class="value">${report.page.domElements.toLocaleString()}</div><div class="meta">elements</div></div>
        <div class="stat"><div class="label">Images</div><div class="value">${perf.buckets.img}</div></div>
        <div class="stat"><div class="label">Scripts</div><div class="value">${perf.buckets.script}</div></div>
        <div class="stat"><div class="label">Fonts</div><div class="value">${perf.buckets.font}</div></div>
        <div class="stat"><div class="label">Stylesheets</div><div class="value">${perf.buckets.css}</div></div>
        <div class="stat"><div class="label">Page resources</div><div class="value">${formatBytes(perf.totals.transferSize)}</div><div class="meta">${perf.totals.resourceCount} resources</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Navigation timing</h2>
      ${
        nav.available
          ? `<div class="grid-2">
              <div class="stat"><div class="label">DNS</div><div class="value">${formatMs(nav.dns)}</div></div>
              <div class="stat"><div class="label">Connect</div><div class="value">${formatMs(nav.connect)}</div></div>
              <div class="stat"><div class="label">TTFB</div><div class="value">${formatMs(nav.ttfb)}</div></div>
              <div class="stat"><div class="label">Response</div><div class="value">${formatMs(nav.response)}</div></div>
              <div class="stat"><div class="label">DOM interactive</div><div class="value">${formatMs(nav.domInteractive)}</div></div>
              <div class="stat"><div class="label">Load event</div><div class="value">${formatMs(nav.loadEvent)}</div></div>
            </div>`
          : `<p class="empty">Navigation timing unavailable in this context.</p>`
      }
    </div>

    <div class="card">
      <h2>Resources</h2>
      <div class="row" style="margin-bottom:8px">
        <label>Sort
          <select id="res-sort">
            <option value="size">Size</option>
            <option value="duration">Duration</option>
            <option value="type">Type</option>
          </select>
        </label>
      </div>
      <div style="max-height:220px;overflow:auto">
        <table class="table" id="res-table">
          <thead><tr><th>Type</th><th>Size</th><th>Duration</th><th>URL</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Image audit</h2>
      <p class="muted">${perf.imageIssueCount} image(s) with findings (factual checks, not speed claims).</p>
      <ul class="list" id="img-list"></ul>
    </div>
  `;

  const tbody = root.querySelector("#res-table tbody");
  const sortSelect = root.querySelector("#res-sort");
  const imgList = root.querySelector("#img-list");

  function paintResources(sortKey) {
    const rows = [...resources];
    if (sortKey === "duration") {
      rows.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else if (sortKey === "type") {
      rows.sort((a, b) => String(a.type).localeCompare(String(b.type)));
    } else {
      rows.sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));
    }
    tbody.textContent = "";
    for (const res of rows.slice(0, 80)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(res.type)}</td>
        <td>${formatBytes(res.transferSize)}</td>
        <td>${formatMs(res.duration)}</td>
        <td>${escapeHtml(res.name)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  paintResources("size");
  sortSelect.addEventListener("change", () => paintResources(sortSelect.value));

  imgList.textContent = "";
  const flagged = perf.images.filter((img) => img.issues.length).slice(0, 40);
  if (!flagged.length) {
    imgList.innerHTML = `<li class="empty">No image attribute/dimension findings in the sampled set.</li>`;
  } else {
    for (const img of flagged) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="finding-title">${escapeHtml(img.issues.join(" · "))}</div>
        <div class="finding-meta mono">${escapeHtml(img.src)}</div>
        <div class="finding-meta">${img.naturalWidth}×${img.naturalHeight} natural · ${img.displayWidth}×${img.displayHeight} display</div>
        <div class="actions-bar">
          <button type="button" class="btn small report-img">Report Bug</button>
        </div>
      `;
      li.querySelector(".report-img").addEventListener("click", () => {
        onReportFinding?.({
          title: `Image issue: ${img.issues[0]}`,
          description: `Image audit finding on ${report.page.url}`,
          actual: `${img.issues.join(", ")}\n${img.src}`,
          notes: `Natural ${img.naturalWidth}×${img.naturalHeight}; display ${img.displayWidth}×${img.displayHeight}`
        });
      });
      imgList.appendChild(li);
    }
  }
}
