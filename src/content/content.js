/**
 * Content script: lightweight hooks + on-demand page analysis.
 * Runs at document_start to capture console/network signals after load.
 */

(() => {
  if (window.__websiteToolkitInjected) {
    return;
  }
  window.__websiteToolkitInjected = true;

  const api = typeof browser !== "undefined" && browser?.runtime?.id != null ? browser : chrome;

  const consoleErrors = [];
  const failedRequests = [];
  const MAX_LOG = 50;

  function pushCapped(list, item) {
    list.push(item);
    if (list.length > MAX_LOG) {
      list.shift();
    }
  }

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args) => {
    pushCapped(consoleErrors, {
      level: "error",
      message: args.map(stringifyArg).join(" "),
      time: new Date().toISOString()
    });
    originalError(...args);
  };

  console.warn = (...args) => {
    // Only keep warnings that look like failures; avoid noise
    const message = args.map(stringifyArg).join(" ");
    if (/failed|error|uncaught|cors/i.test(message)) {
      pushCapped(consoleErrors, {
        level: "warn",
        message,
        time: new Date().toISOString()
      });
    }
    originalWarn(...args);
  };

  window.addEventListener("error", (event) => {
    pushCapped(consoleErrors, {
      level: "error",
      message: event.message || "Script error",
      source: event.filename || "",
      line: event.lineno || 0,
      time: new Date().toISOString()
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushCapped(consoleErrors, {
      level: "error",
      message: `Unhandled rejection: ${stringifyArg(event.reason)}`,
      time: new Date().toISOString()
    });
  });

  // Capture failed fetches/XHR after script load (honest limitation: not historical)
  const originalFetch = window.fetch?.bind(window);
  if (originalFetch) {
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          pushCapped(failedRequests, {
            type: "fetch",
            url: String(args[0]?.url || args[0] || ""),
            status: response.status,
            time: new Date().toISOString()
          });
        }
        return response;
      } catch (error) {
        pushCapped(failedRequests, {
          type: "fetch",
          url: String(args[0]?.url || args[0] || ""),
          status: 0,
          error: String(error?.message || error),
          time: new Date().toISOString()
        });
        throw error;
      }
    };
  }

  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  XHR.open = function (method, url, ...rest) {
    this.__wtUrl = String(url || "");
    this.__wtMethod = String(method || "GET");
    return open.call(this, method, url, ...rest);
  };
  XHR.send = function (...args) {
    this.addEventListener("loadend", () => {
      if (this.status >= 400 || this.status === 0) {
        pushCapped(failedRequests, {
          type: "xhr",
          method: this.__wtMethod,
          url: this.__wtUrl,
          status: this.status,
          time: new Date().toISOString()
        });
      }
    });
    return send.apply(this, args);
  };

  function stringifyArg(value) {
    if (value == null) {
      return String(value);
    }
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) {
      return "";
    }
    if (el.id) {
      return `#${cssEscape(el.id)}`;
    }
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let part = node.tagName.toLowerCase();
      if (node.classList?.length) {
        part += `.${[...node.classList].slice(0, 2).map(cssEscape).join(".")}`;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function getNavTiming() {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (!nav) {
      return { available: false };
    }
    return {
      available: true,
      type: nav.type,
      dns: Math.max(0, nav.domainLookupEnd - nav.domainLookupStart),
      connect: Math.max(0, nav.connectEnd - nav.connectStart),
      ttfb: Math.max(0, nav.responseStart - nav.requestStart),
      response: Math.max(0, nav.responseEnd - nav.responseStart),
      domInteractive: Math.max(0, nav.domInteractive - nav.startTime),
      domContentLoaded: Math.max(0, nav.domContentLoadedEventEnd - nav.startTime),
      loadEvent: Math.max(0, nav.loadEventEnd - nav.startTime),
      transferSize: nav.transferSize || 0,
      encodedBodySize: nav.encodedBodySize || 0,
      decodedBodySize: nav.decodedBodySize || 0
    };
  }

  function getResources() {
    const entries = performance.getEntriesByType?.("resource") || [];
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.initiatorType || "other",
      duration: entry.duration,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      startTime: entry.startTime
    }));
  }

  function classifyResources(resources) {
    const buckets = {
      script: [],
      css: [],
      img: [],
      font: [],
      xhr: [],
      other: []
    };
    for (const res of resources) {
      const t = (res.type || "").toLowerCase();
      if (t === "script") {
        buckets.script.push(res);
      } else if (t === "link" || t === "css") {
        buckets.css.push(res);
      } else if (t === "img" || t === "image" || t === "cssimage" || t === "svg") {
        buckets.img.push(res);
      } else if (t === "font" || t === "cssfont") {
        buckets.font.push(res);
      } else if (t === "xmlhttprequest" || t === "fetch" || t === "beacon") {
        buckets.xhr.push(res);
      } else {
        buckets.other.push(res);
      }
    }
    return buckets;
  }

  function getWebVitalsSnapshot() {
    const paints = performance.getEntriesByType?.("paint") || [];
    const lcpEntries = performance.getEntriesByType?.("largest-contentful-paint") || [];
    const layoutShifts = performance.getEntriesByType?.("layout-shift") || [];

    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
    let cls = 0;
    for (const shift of layoutShifts) {
      if (!shift.hadRecentInput) {
        cls += shift.value || 0;
      }
    }

    // INP is not reliably available without PerformanceObserver long-lived session
    return {
      fcp: fcp
        ? { value: fcp.startTime, status: "measured", label: "First Contentful Paint" }
        : { value: null, status: "unavailable", label: "First Contentful Paint" },
      lcp: lcp
        ? { value: lcp.startTime, status: "measured", label: "Largest Contentful Paint" }
        : { value: null, status: "unavailable", note: "Not available yet — interact with the page or wait for LCP.", label: "LCP" },
      cls: {
        value: cls,
        status: layoutShifts.length ? "measured" : "estimated",
        note: layoutShifts.length ? "" : "No layout-shift entries observed yet.",
        label: "Cumulative Layout Shift"
      },
      inp: {
        value: null,
        status: "unavailable",
        note: "INP requires ongoing interaction observation and is not exposed as a one-shot metric here.",
        label: "Interaction to Next Paint"
      }
    };
  }

  function auditImages() {
    const images = [...document.images];
    return images.slice(0, 200).map((img) => {
      const rect = img.getBoundingClientRect();
      const naturalW = img.naturalWidth || 0;
      const naturalH = img.naturalHeight || 0;
      const displayW = Math.round(rect.width);
      const displayH = Math.round(rect.height);
      const issues = [];
      if (!img.hasAttribute("width") || !img.hasAttribute("height")) {
        issues.push("Missing dimensions");
      }
      if (!img.hasAttribute("alt")) {
        issues.push("Missing alt attribute");
      }
      if (img.loading !== "lazy" && !img.hasAttribute("loading")) {
        issues.push("Lazy loading not detected");
      }
      const transferHint = naturalW * naturalH;
      if (naturalW && displayW && naturalW > displayW * 2.5) {
        issues.push("Oversized dimensions vs display size");
      }
      if (transferHint > 2000 * 2000) {
        issues.push("Large resource (pixel area)");
      }
      return {
        src: img.currentSrc || img.src || "",
        alt: img.getAttribute("alt"),
        hasAlt: img.hasAttribute("alt"),
        loading: img.getAttribute("loading") || "",
        naturalWidth: naturalW,
        naturalHeight: naturalH,
        displayWidth: displayW,
        displayHeight: displayH,
        issues
      };
    });
  }

  function accessibleName(el) {
    if (!el) {
      return "";
    }
    const aria = el.getAttribute("aria-label");
    if (aria) {
      return aria.trim();
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
      if (text) {
        return text;
      }
    }
    if (el.labels && el.labels.length) {
      return [...el.labels].map((l) => l.textContent || "").join(" ").trim();
    }
    return (el.textContent || el.value || el.getAttribute("title") || el.getAttribute("alt") || "").trim();
  }

  function relativeLuminance(rgb) {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }

  function parseColor(str) {
    if (!str || str === "transparent") {
      return null;
    }
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = "#000";
    ctx.fillStyle = str;
    const computed = ctx.fillStyle;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(computed);
    if (!m) {
      return null;
    }
    const alpha = m[4] == null ? 1 : Number(m[4]);
    if (alpha < 0.85) {
      return null;
    }
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function contrastRatio(fg, bg) {
    const L1 = relativeLuminance(fg);
    const L2 = relativeLuminance(bg);
    const light = Math.max(L1, L2);
    const dark = Math.min(L1, L2);
    return (light + 0.05) / (dark + 0.05);
  }

  function runAccessibilityAudit() {
    const findings = [];
    const passed = [];

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const h1s = headings.filter((h) => h.tagName === "H1");
    if (h1s.length === 0) {
      findings.push({
        severity: "error",
        category: "headings",
        reason: "Missing H1",
        selector: "html",
        element: "document",
        fix: "Add a single descriptive H1 that names the main page content."
      });
    } else if (h1s.length > 1) {
      findings.push({
        severity: "warning",
        category: "headings",
        reason: "Multiple H1 elements",
        selector: "h1",
        element: `${h1s.length} × H1`,
        fix: "Prefer one H1 per page for clearer document structure."
      });
    } else {
      passed.push({ category: "headings", reason: "Single H1 present" });
    }

    let lastLevel = 0;
    for (const h of headings) {
      const level = Number(h.tagName[1]);
      if (lastLevel && level > lastLevel + 1) {
        findings.push({
          severity: "warning",
          category: "headings",
          reason: `Skipped heading level (H${lastLevel} → H${level})`,
          selector: buildSelector(h),
          element: h.tagName,
          snippet: (h.textContent || "").trim().slice(0, 80),
          fix: "Avoid skipping heading levels in the hierarchy."
        });
      }
      lastLevel = level;
    }

    const headingTree = headings.slice(0, 80).map((h) => ({
      level: Number(h.tagName[1]),
      text: (h.textContent || "").trim().slice(0, 120),
      selector: buildSelector(h)
    }));

    for (const img of [...document.images].slice(0, 150)) {
      if (!img.hasAttribute("alt")) {
        findings.push({
          severity: "error",
          category: "images",
          reason: "Image missing alt attribute",
          selector: buildSelector(img),
          element: "img",
          snippet: (img.currentSrc || img.src || "").slice(0, 120),
          fix: "Add alt text describing the image, or alt=\"\" only if it is decorative."
        });
      } else if ((img.getAttribute("alt") || "").trim() === "" && img.getAttribute("role") !== "presentation") {
        passed.push({ category: "images", reason: "Empty alt present (may be decorative)" });
      } else {
        const alt = (img.getAttribute("alt") || "").trim().toLowerCase();
        if (/^(image|img|photo|picture|graphic)\d*$/i.test(alt)) {
          findings.push({
            severity: "warning",
            category: "images",
            reason: "Suspicious generic alt text",
            selector: buildSelector(img),
            element: "img",
            snippet: alt,
            fix: "Replace generic alt text with a meaningful description."
          });
        }
      }
    }

    const controls = [...document.querySelectorAll("input, select, textarea")];
    for (const control of controls.slice(0, 200)) {
      const type = (control.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) {
        continue;
      }
      const name = accessibleName(control);
      if (!name) {
        findings.push({
          severity: "error",
          category: "forms",
          reason: "Form control without accessible name",
          selector: buildSelector(control),
          element: control.tagName.toLowerCase(),
          fix: "Associate a <label for>, or provide aria-label / aria-labelledby."
        });
      } else {
        passed.push({ category: "forms", reason: "Named form control" });
      }
    }

    for (const btn of [...document.querySelectorAll("button, [role='button']")].slice(0, 150)) {
      if (!accessibleName(btn)) {
        findings.push({
          severity: "error",
          category: "buttons",
          reason: "Button without accessible name",
          selector: buildSelector(btn),
          element: btn.tagName.toLowerCase(),
          fix: "Add visible text, aria-label, or an accessible child text node."
        });
      }
    }

    for (const link of [...document.querySelectorAll("a[href]")].slice(0, 200)) {
      const name = accessibleName(link);
      if (!name) {
        findings.push({
          severity: "error",
          category: "links",
          reason: "Link without accessible name",
          selector: buildSelector(link),
          element: "a",
          snippet: link.getAttribute("href") || "",
          fix: "Provide link text or an aria-label that describes the destination."
        });
      } else if (/^(click here|here|more|read more|link)$/i.test(name)) {
        findings.push({
          severity: "warning",
          category: "links",
          reason: "Generic link text",
          selector: buildSelector(link),
          element: "a",
          snippet: name,
          fix: "Use descriptive link text that makes sense out of context."
        });
      }
    }

    // High-confidence ARIA name check for common widgets
    for (const el of [...document.querySelectorAll("[role='dialog'], [role='tab'], [role='menuitem']")].slice(0, 80)) {
      if (!accessibleName(el)) {
        findings.push({
          severity: "warning",
          category: "aria",
          reason: `Element with role="${el.getAttribute("role")}" missing accessible name`,
          selector: buildSelector(el),
          element: el.tagName.toLowerCase(),
          fix: "Provide an accessible name via text content or ARIA labeling."
        });
      }
    }

    // Limited contrast sampling on text nodes' parents
    let contrastChecked = 0;
    for (const el of [...document.querySelectorAll("p, li, h1, h2, h3, h4, a, button, label, span")].slice(0, 80)) {
      if (contrastChecked >= 40) {
        break;
      }
      const text = (el.textContent || "").trim();
      if (text.length < 2) {
        continue;
      }
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") {
        continue;
      }
      const fg = parseColor(style.color);
      let bg = parseColor(style.backgroundColor);
      let parent = el.parentElement;
      while (!bg && parent) {
        bg = parseColor(getComputedStyle(parent).backgroundColor);
        parent = parent.parentElement;
      }
      contrastChecked += 1;
      if (!fg || !bg) {
        findings.push({
          severity: "info",
          category: "contrast",
          reason: "Unable to determine contrast",
          selector: buildSelector(el),
          element: el.tagName.toLowerCase(),
          fix: "Manual check recommended for transparent/gradient backgrounds."
        });
        continue;
      }
      const ratio = contrastRatio(fg, bg);
      const fontSize = parseFloat(style.fontSize) || 16;
      const bold = Number(style.fontWeight) >= 700;
      const needed = fontSize >= 24 || (fontSize >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < needed) {
        findings.push({
          severity: "error",
          category: "contrast",
          reason: `Contrast ${ratio.toFixed(2)}:1 below ${needed}:1`,
          selector: buildSelector(el),
          element: el.tagName.toLowerCase(),
          snippet: text.slice(0, 60),
          fix: "Increase contrast between text and background colors."
        });
      } else {
        passed.push({ category: "contrast", reason: "Sampled text contrast OK" });
      }
    }

    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;
    const infos = findings.filter((f) => f.severity === "info").length;

    return {
      disclaimer: "Automated checks only. Manual accessibility testing is still required. Not a full WCAG audit.",
      summary: {
        errors,
        warnings,
        infos,
        passed: passed.length
      },
      headingTree,
      findings: findings.slice(0, 200)
    };
  }

  function detectTechnologies() {
    const items = [];
    const scripts = [...document.scripts].map((s) => s.src || "").filter(Boolean);
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href || "").filter(Boolean);
    const generator = document.querySelector('meta[name="generator"]')?.content || "";
    const htmlHead = (document.head?.innerHTML || "").slice(0, 200000);
    const cookie = document.cookie || "";
    const assetBlob = `${scripts.join("\n")}\n${styles.join("\n")}\n${htmlHead}`;

    function add(name, category, confidence, evidence) {
      if (items.some((i) => i.name === name && i.category === category)) {
        return;
      }
      items.push({ name, category, confidence, evidence });
    }

    function hasAsset(re) {
      return re.test(assetBlob);
    }

    // --- CMS ---
    if (/contao/i.test(generator) || hasAsset(/\/assets\/contao\/|contao\.css|contao\.js|data-contao/i) || typeof window.Contao !== "undefined") {
      const versionMatch = generator.match(/Contao\s+([0-9]+(?:\.[0-9]+)*)/i);
      add(
        "Contao",
        "cms",
        /contao/i.test(generator) || typeof window.Contao !== "undefined" ? "High" : "Medium",
        versionMatch
          ? `generator="${generator}"`
          : typeof window.Contao !== "undefined"
            ? "window.Contao present"
            : "Contao asset/DOM markers"
      );
      if (versionMatch) {
        add("Contao", "cms-version", "High", `Exposed in meta generator: ${versionMatch[1]}`);
      }
    }
    if (
      /wordpress/i.test(generator) ||
      hasAsset(/\/wp-content\/|\/wp-includes\/|wp-emoji|wp-json/i) ||
      document.querySelector('link[rel="https://api.w.org/"]') ||
      typeof window.wp !== "undefined"
    ) {
      add(
        "WordPress",
        "cms",
        document.querySelector('link[rel="https://api.w.org/"]') || /wordpress/i.test(generator) ? "High" : "Medium",
        /wordpress/i.test(generator) ? `generator="${generator}"` : "wp-content / api.w.org / wp globals"
      );
    }
    if (/drupal/i.test(generator) || hasAsset(/\/sites\/default\/files\/|Drupal\.settings|drupal\.js/i) || typeof window.Drupal !== "undefined") {
      add("Drupal", "cms", typeof window.Drupal !== "undefined" || /drupal/i.test(generator) ? "High" : "Medium", "Drupal markers");
    }
    if (/joomla/i.test(generator) || hasAsset(/\/media\/system\/js\/|option=com_/i) || typeof window.Joomla !== "undefined") {
      add("Joomla", "cms", /joomla/i.test(generator) || typeof window.Joomla !== "undefined" ? "High" : "Medium", "Joomla markers");
    }
    if (hasAsset(/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i) || typeof window.Shopify !== "undefined") {
      add("Shopify", "cms", "High", "Shopify CDN / window.Shopify");
    }
    if (/typo3/i.test(generator) || hasAsset(/\/typo3conf\/|\/typo3temp\/|TYPO3\.settings/i)) {
      add("TYPO3", "cms", /typo3/i.test(generator) ? "High" : "Medium", "TYPO3 markers");
    }
    if (hasAsset(/static\.wixstatic\.com|X-Wix-|wix-warmup/i) || typeof window.wixBiSession !== "undefined") {
      add("Wix", "cms", "High", "Wix asset / session markers");
    }
    if (hasAsset(/squarespace\.com|static\.squarespace|squarespace-cdn/i)) {
      add("Squarespace", "cms", "High", "Squarespace assets");
    }
    if (hasAsset(/webpack-jsonp|wf-design|webflow\.js|uploads-ssl\.webflow/i) || document.documentElement.getAttribute("data-wf-site")) {
      add("Webflow", "cms", document.documentElement.getAttribute("data-wf-site") ? "High" : "Medium", "Webflow markers");
    }
    if (/ghost/i.test(generator) || hasAsset(/ghost-sdk|\/ghost\/api\//i) || typeof window.ghost !== "undefined") {
      add("Ghost", "cms", /ghost/i.test(generator) ? "High" : "Medium", "Ghost markers");
    }

    // --- Frameworks / libraries ---
    if (document.querySelector("[data-reactroot], [data-reactid]") || document.querySelector("#__next") || typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" || hasAsset(/react(-dom)?(\.production|\.development)?(\.min)?\.js/i)) {
      const next = document.querySelector("#__next") || hasAsset(/_next\/static/i) || typeof window.__NEXT_DATA__ !== "undefined";
      if (next) {
        add("Next.js", "framework", typeof window.__NEXT_DATA__ !== "undefined" ? "High" : "Medium", "__NEXT_DATA__ / _next/static / #__next");
      }
      add("React", "framework", document.querySelector("[data-reactroot], #__next") || typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" ? "High" : "Medium", "React DOM markers / assets");
    }
    {
      const hasVueGlobal = typeof window.__VUE__ !== "undefined" || typeof window.Vue !== "undefined";
      const hasVueDom =
        document.querySelector("[data-v-app]") ||
        /data-v-[a-f0-9]{4,}/i.test(htmlHead) ||
        hasAsset(/vue(\.runtime)?(\.esm-browser|\.esm|\.global)?(\.prod)?(\.min)?\.js/i);
      if (hasVueGlobal || hasVueDom) {
        const nuxt = typeof window.__NUXT__ !== "undefined" || document.querySelector("#__nuxt") || hasAsset(/_nuxt\//i);
        if (nuxt) {
          add("Nuxt", "framework", typeof window.__NUXT__ !== "undefined" ? "High" : "Medium", "__NUXT__ / #__nuxt");
        }
        add(
          "Vue",
          "framework",
          hasVueGlobal ? "High" : "Medium",
          hasVueGlobal ? "Vue globals" : "Vue DOM/asset markers"
        );
      }
    }
    if (typeof window.ng !== "undefined" || document.querySelector("[ng-version]") || hasAsset(/angular(\.min)?\.js|@angular/i)) {
      const ver = document.querySelector("[ng-version]")?.getAttribute("ng-version");
      add("Angular", "framework", "High", ver ? `ng-version=${ver}` : "Angular markers");
    }
    if (typeof window.__svelte !== "undefined" || document.querySelector("[class*='svelte-']") || hasAsset(/svelte(\.|\/)/i)) {
      add("Svelte", "framework", document.querySelector("[class*='svelte-']") ? "Medium" : "Low", "Svelte class/asset markers");
    }
    if (typeof window.jQuery !== "undefined" || typeof window.$ !== "undefined" && window.$.fn && window.$.fn.jquery || hasAsset(/jquery([.-]\d+)*(\.min)?\.js/i)) {
      const ver = window.jQuery?.fn?.jquery;
      add("jQuery", "library", typeof window.jQuery !== "undefined" ? "High" : "Medium", ver ? `jQuery ${ver}` : "jQuery asset/global");
    }
    if (typeof window.bootstrap !== "undefined" || hasAsset(/bootstrap(\.min)?\.(js|css)/i) || document.querySelector("[data-bs-toggle], .navbar-toggler")) {
      add("Bootstrap", "css", typeof window.bootstrap !== "undefined" || hasAsset(/bootstrap(\.min)?\.(js|css)/i) ? "High" : "Medium", "Bootstrap assets / data-bs-*");
    }
    if (
      hasAsset(/tailwindcss|tailwind(\.min)?\.js/i) ||
      document.querySelector('script[src*="tailwindcss"], script[src*="tailwind"]') ||
      [...document.querySelectorAll("style")].some((s) => /@tailwind|--tw-/i.test(s.textContent || ""))
    ) {
      add("Tailwind CSS", "css", "High", "tailwind asset or @tailwind/--tw- CSS");
    }
    if (typeof window.Alpine !== "undefined" || document.querySelector("[x-data], [x-show], [x-on\\:]") || hasAsset(/alpine(?:js)?(\.min)?\.js/i)) {
      add("Alpine.js", "library", typeof window.Alpine !== "undefined" || document.querySelector("[x-data]") ? "High" : "Medium", "Alpine globals / x-data");
    }

    // --- Platform / server hints (only from meta/generator/assets, not invented headers) ---
    if (/php/i.test(generator) || hasAsset(/\.php(\?|$)/i) || cookie.match(/PHPSESSID=/)) {
      add("PHP", "platform", cookie.includes("PHPSESSID=") || /php/i.test(generator) ? "Medium" : "Low", cookie.includes("PHPSESSID=") ? "PHPSESSID cookie" : "PHP generator/URL signals");
    }
    if (hasAsset(/aspnet|__VIEWSTATE|webkit\.js/i) || document.querySelector("input[name='__VIEWSTATE']") || cookie.match(/ASP\.NET_SessionId=/i)) {
      add("ASP.NET", "platform", document.querySelector("input[name='__VIEWSTATE']") ? "High" : "Medium", "ASP.NET markers");
    }
    if (hasAsset(/\/_next\/|nuxt|express/i) && (typeof window.__NEXT_DATA__ !== "undefined" || typeof window.__NUXT__ !== "undefined")) {
      add("Node.js", "platform", "Low", "Inferred from Next/Nuxt runtime markers only");
    }

    // --- Analytics ---
    if (hasAsset(/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i) || typeof window.google_tag_manager !== "undefined") {
      add("Google Tag Manager", "analytics", "High", "GTM script / google_tag_manager");
    }
    if (hasAsset(/google-analytics\.com\/analytics\.js|gtag\/js|www\.google-analytics\.com/i) || typeof window.ga !== "undefined" || typeof window.gtag !== "undefined") {
      add("Google Analytics", "analytics", "High", "GA/gtag script or globals");
    }
    if (hasAsset(/matomo\.js|piwik\.js|cdn\.matomo\.cloud/i) || typeof window.Matomo !== "undefined" || typeof window._paq !== "undefined") {
      add("Matomo", "analytics", "High", "Matomo/Piwik markers");
    }

    // Drop cms-version pseudo entries from main list presentation helpers
    const visible = items.filter((i) => i.category !== "cms-version");
    const versionItem = items.find((i) => i.category === "cms-version" && i.name === "Contao");

    const byCategory = {
      cms: visible.filter((i) => i.category === "cms"),
      framework: visible.filter((i) => i.category === "framework"),
      library: visible.filter((i) => i.category === "library"),
      css: visible.filter((i) => i.category === "css"),
      platform: visible.filter((i) => i.category === "platform"),
      analytics: visible.filter((i) => i.category === "analytics")
    };

    return {
      items: visible,
      byCategory,
      contaoVersionFromTech: versionItem ? versionItem.evidence.replace(/^Exposed in meta generator:\s*/i, "") : null,
      available: true
    };
  }

  function detectContao(technology) {
    const signals = [];
    let score = 0;

    const generator = document.querySelector('meta[name="generator"]')?.content || "";
    if (/contao/i.test(generator)) {
      signals.push({ id: "meta-generator", label: "meta generator", detail: generator, confidence: "High" });
      score += 5;
    }

    const html = document.documentElement.outerHTML.slice(0, 500000);
    const patterns = [
      { re: /\/assets\/contao\//i, label: "Contao assets path", confidence: "High", weight: 4 },
      { re: /\/system\/themes\//i, label: "system/themes path", confidence: "Medium", weight: 2 },
      { re: /contao\.css|contao\.js/i, label: "contao.css / contao.js", confidence: "High", weight: 4 },
      { re: /data-contao/i, label: "data-contao attribute", confidence: "High", weight: 4 },
      { re: /mod_article|mod_navigation|ce_text|ce_image|ce_headline/i, label: "Contao module/element classes", confidence: "Medium", weight: 3 },
      { re: /tl_files\//i, label: "tl_files path", confidence: "Medium", weight: 2 },
      { re: /Contao\.|window\.Contao/i, label: "Contao JS namespace", confidence: "High", weight: 4 }
    ];

    for (const pattern of patterns) {
      if (pattern.re.test(html)) {
        signals.push({
          id: pattern.label,
          label: pattern.label,
          detail: "Matched page HTML/assets",
          confidence: pattern.confidence
        });
        score += pattern.weight;
      }
    }

    if (typeof window.Contao !== "undefined") {
      signals.push({ id: "window-contao", label: "window.Contao", detail: "Global Contao object present", confidence: "High" });
      score += 4;
    }

    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter(Boolean);
    const contaoScripts = scripts.filter((u) => /contao|\/assets\/contao\//i.test(u));
    const contaoStyles = styles.filter((u) => /contao|\/assets\/contao\//i.test(u));

    if (contaoScripts.length) {
      signals.push({
        id: "scripts",
        label: "Contao-related scripts",
        detail: `${contaoScripts.length} script URL(s)`,
        confidence: "High"
      });
      score += 3;
    }
    if (contaoStyles.length) {
      signals.push({
        id: "styles",
        label: "Contao-related stylesheets",
        detail: `${contaoStyles.length} stylesheet URL(s)`,
        confidence: "High"
      });
      score += 3;
    }

    const techContao = technology?.byCategory?.cms?.find((i) => i.name === "Contao");
    if (techContao) {
      signals.push({
        id: "tech-detection",
        label: "Technology scanner",
        detail: techContao.evidence,
        confidence: techContao.confidence
      });
      score += techContao.confidence === "High" ? 3 : 2;
    }

    let version = null;
    const versionMatch = generator.match(/Contao\s+([0-9]+(?:\.[0-9]+)*)/i);
    if (versionMatch) {
      version = versionMatch[1];
    } else if (technology?.contaoVersionFromTech) {
      version = technology.contaoVersionFromTech;
    }

    const detected = score >= 4 || Boolean(techContao);
    return {
      detected,
      version: version || null,
      confidence: detected ? (score >= 8 || techContao?.confidence === "High" ? "High" : "Medium") : "Low",
      score,
      signals,
      fromTechnology: Boolean(techContao),
      assets: {
        scripts: contaoScripts.slice(0, 40),
        styles: contaoStyles.slice(0, 40),
        allScripts: scripts.slice(0, 60),
        allStyles: styles.slice(0, 60)
      },
      modules: [...document.querySelectorAll("[class*='mod_'], [class*='ce_']")]
        .slice(0, 40)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 120),
          selector: buildSelector(el)
        }))
    };
  }

  function collectPageMeta() {
    return {
      title: document.title || "",
      url: location.href,
      origin: location.origin,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      readyState: document.readyState,
      domElements: document.getElementsByTagName("*").length,
      selectedText: (window.getSelection?.()?.toString() || "").trim().slice(0, 2000),
      timestamp: new Date().toISOString(),
      language: document.documentElement.lang || "",
      charset: document.characterSet || ""
    };
  }

  function runFullScan() {
    const resources = getResources();
    const buckets = classifyResources(resources);
    const totalTransfer = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    const images = auditImages();

    let technology = { items: [], byCategory: {}, available: false, error: null };
    try {
      technology = detectTechnologies();
    } catch (error) {
      technology = {
        items: [],
        byCategory: { cms: [], framework: [], library: [], css: [], platform: [], analytics: [] },
        available: false,
        error: error?.message || "Detection unavailable"
      };
    }

    let contao;
    try {
      contao = detectContao(technology);
    } catch (error) {
      contao = {
        detected: false,
        version: null,
        confidence: "Low",
        score: 0,
        signals: [],
        assets: { scripts: [], styles: [], allScripts: [], allStyles: [] },
        modules: [],
        error: error?.message || "Contao detection unavailable"
      };
    }

    return {
      page: collectPageMeta(),
      technology,
      performance: {
        navigation: getNavTiming(),
        vitals: getWebVitalsSnapshot(),
        resources,
        buckets: {
          script: buckets.script.length,
          css: buckets.css.length,
          img: buckets.img.length,
          font: buckets.font.length,
          xhr: buckets.xhr.length,
          other: buckets.other.length
        },
        totals: {
          resourceCount: resources.length,
          transferSize: totalTransfer
        },
        images,
        imageIssueCount: images.filter((i) => i.issues.length).length
      },
      accessibility: runAccessibilityAudit(),
      contao,
      runtime: {
        consoleErrors: consoleErrors.slice(-30),
        failedRequests: failedRequests.slice(-30),
        note: "Console errors and failed requests are captured after this content script loads — not a full historical browser log."
      }
    };
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return undefined;
    }
    if (message.type === "wt-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "wt-scan") {
      try {
        const report = runFullScan();
        sendResponse({ ok: true, report });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Scan failed" });
      }
      return false;
    }
    if (message.type === "wt-page-meta") {
      sendResponse({ ok: true, page: collectPageMeta() });
      return false;
    }
    return undefined;
  });
})();
