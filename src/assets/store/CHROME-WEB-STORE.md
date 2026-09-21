# Chrome Web Store — listing copy & assets

Fill the Developer Dashboard **Store listing** form with the text below.
Upload graphics from `src/assets/store/chrome-web-store/`.

Regenerate graphics:

```bash
python3 scripts/generate-store-listing-assets.py
```

---

## Product details

### Title
Website Toolkit

### Summary
(from package — keep as-is, or shorten if the form allows editing)

Local developer & QA toolkit: technology detection, performance, accessibility, bug reports, and Contao helpers.

### Description
(paste into Description)

```
Website Toolkit is a local Chrome extension for developers, QA engineers, and agencies who need a fast answer to: “What is this website built with — and what should I check next?”

Click Scan page and the toolkit inspects the current tab in your browser. Nothing is uploaded. There is no AI, no account, no analytics, and no backend.

WHAT YOU GET

• Technology & CMS detection
  Recognizes common CMS platforms (WordPress, Contao, TYPO3, Drupal, Shopify, and more) plus frameworks and libraries such as React, Vue, Angular, jQuery, Bootstrap, and Tailwind — with confidence and evidence, not guesses.

• Fonts & colors
  Shows typefaces actually used on visible text and common text/background colors.

• Performance overview
  Navigation timing, Core Web Vitals when available, resource totals, and image issues.

• Accessibility audit
  Automated heuristic checks to catch common problems early (not a full WCAG certification).

• Bug Reporter
  Build structured Markdown/JSON bug reports with page URL, environment, steps, and an optional local screenshot. Drafts stay on your device until you clear them.

• CMS toolkit
  The fifth tab renames itself to the detected CMS. Contao sites get deeper frontend diagnostics; other CMS platforms show signals and related assets.

WHY INSTALL IT

• One scan covers stack, performance, accessibility, and bug capture
• Results restore when you reopen the popup on the same page
• Works entirely locally — page content never leaves your browser
• Built for real QA workflows, not marketing fluff

PERMISSIONS

• activeTab / scripting — analyze the page you choose to scan
• storage — save the latest scan and bug drafts locally
• Host access to http(s) pages — content script and screenshots on normal websites

LIMITATIONS

Restricted pages (chrome://, Web Store, extension pages) cannot be inspected. Technology versions are only shown when the page exposes them. Accessibility results are heuristics, not certification.

Privacy-first. Local-only. Built for people who ship and test websites.
```

### Category
**Developer Tools**  
(If that exact label differs in the dropdown, pick the closest: “Productivity” is a fallback.)

### Language
**English**

### Mature content
**No**

---

## Graphic assets (upload these files)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128, RGB, no alpha |
| Screenshot 1 | `screenshot-01.png` | 1280×800 — Google overview scan |
| Screenshot 2 | `screenshot-02.png` | 1280×800 — WordPress CMS detection |
| Screenshot alt | `screenshot-02-640x400.png` | 640×400 (optional size) |
| Small promo tile | `small-promo-440x280.png` | 440×280 |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 |

Folder: `src/assets/store/chrome-web-store/`

### Global promo video
Leave empty unless you have a YouTube demo.

### Official / Homepage / Support URL
Optional. Use your site or GitHub repo if you have one; otherwise leave blank.

---

## Note

Screenshots are real popup captures framed on a 1280×800 RGB canvas (no transparency), ready for Chrome Web Store upload.
