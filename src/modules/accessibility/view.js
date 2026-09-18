import { escapeHtml } from "../../shared/utils.js";

function renderHeadingTree(tree) {
  if (!tree?.length) {
    return "(no headings found)";
  }
  return tree
    .map((h) => `${"  ".repeat(Math.max(0, h.level - 1))}H${h.level}  ${h.text || "(empty)"}`)
    .join("\n");
}

export function renderAccessibility(root, report, { onReportFinding } = {}) {
  if (!report) {
    root.innerHTML = `<div class="card"><p class="empty">Scan the page to run automated accessibility checks.</p></div>`;
    return;
  }

  const a11y = report.accessibility;
  root.innerHTML = `
    <div class="card">
      <h2>Accessibility</h2>
      <p class="muted">${escapeHtml(a11y.disclaimer)}</p>
      <div class="grid-2" style="margin-top:8px">
        <div class="stat"><div class="label">Errors</div><div class="value">${a11y.summary.errors}</div></div>
        <div class="stat"><div class="label">Warnings</div><div class="value">${a11y.summary.warnings}</div></div>
        <div class="stat"><div class="label">Info</div><div class="value">${a11y.summary.infos}</div></div>
        <div class="stat"><div class="label">Passed checks</div><div class="value">${a11y.summary.passed}</div></div>
      </div>
      <p class="muted" style="margin-top:8px">High-confidence heuristic findings only.</p>
    </div>
    <div class="card">
      <h2>Heading hierarchy</h2>
      <pre class="tree">${escapeHtml(renderHeadingTree(a11y.headingTree))}</pre>
    </div>
    <div class="card">
      <h2>Findings</h2>
      <ul class="list" id="a11y-list"></ul>
    </div>
  `;

  const list = root.querySelector("#a11y-list");
  if (!a11y.findings.length) {
    list.innerHTML = `<li class="empty">No automated findings in the sampled checks.</li>`;
    return;
  }

  for (const finding of a11y.findings.slice(0, 80)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="row">
        <span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
        <span class="pill muted">${escapeHtml(finding.category)}</span>
      </div>
      <div class="finding-title">${escapeHtml(finding.reason)}</div>
      <div class="finding-meta mono">${escapeHtml(finding.selector || "")}</div>
      <div class="finding-meta">${escapeHtml(finding.fix || "")}</div>
      <div class="actions-bar">
        <button type="button" class="btn small report">Report Bug</button>
      </div>
    `;
    li.querySelector(".report").addEventListener("click", () => {
      onReportFinding?.({
        title: `A11y: ${finding.reason}`,
        description: `Accessibility finding on ${report.page.url}`,
        actual: `${finding.reason}\nSelector: ${finding.selector}\n${finding.snippet || ""}`,
        notes: finding.fix || "",
        selector: finding.selector || ""
      });
    });
    list.appendChild(li);
  }
}
