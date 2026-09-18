# Website Toolkit

A local Chrome & Firefox extension for developers and QA engineers.

Inspect the current webpage for:

* **Technology / CMS detection** — Contao, WordPress, React, Vue, and more (evidence + confidence)
* **Performance** — navigation timing, Core Web Vitals where available, resources, image audit
* **Accessibility** — automated heuristic checks (not a full WCAG certification)
* **Bug Reporter** — structured Markdown/JSON reports with optional local screenshot
* **Contao** — frontend Contao detection and diagnostics

No AI. No analytics. No tracking. No backend. Nothing is uploaded.

## Build

```bash
node scripts/build.js
```

Creates:

* `dist/chrome/` — load unpacked in Chrome
* `dist/firefox/` — load temporary add-on in Firefox

Or build one target:

```bash
node scripts/build.js chrome
node scripts/build.js firefox
```

## Load in Chrome

1. `node scripts/build.js chrome` (or use the repo root after a chrome build)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select `dist/chrome` (or the repository root)
5. Open a normal `http(s)` page → click the extension icon → **Scan page**

## Load in Firefox

1. `node scripts/build.js firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…** → select `dist/firefox/manifest.json`
4. Open a normal `http(s)` page → click the extension icon → **Scan page**

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Access the tab you are inspecting after you open the toolkit / click Scan or Capture |
| `scripting` | Inject/reconnect the content script when needed |
| `storage` | Persist latest scan + bug-report drafts locally |
| `http://*/*`, `https://*/*` | Content script + screenshots on normal websites |

## Privacy

* Analysis runs in your browser against the current page.
* Latest scan and bug drafts stay in `storage.local` on your device.
* Screenshots/reports leave the browser only if you copy or download them.
* No telemetry, accounts, or uploads.

## Persistence

* Closing the popup restores the last scan for the **same page URL**.
* A scan from another page is not shown as the current page; you can choose **View previous scan**.
* Bug Reporter drafts persist until you click **Clear draft**.

## Limitations

* Restricted pages (`chrome://`, `about:`, Web Store / AMO, extension pages) cannot be inspected.
* Console/network hooks start after the content script loads.
* Some Web Vitals may be unavailable until the browser exposes entries.
* Accessibility results are heuristics, not WCAG certification.
* Technology/CMS detection uses frontend signals only; versions are never guessed.
* Temporary Firefox installs unload on browser restart.

## Temporary icons

`src/assets/icons/` contains temporary development placeholders.
