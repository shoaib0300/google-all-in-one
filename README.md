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

| Output | Purpose |
| --- | --- |
| `dist/chrome/` | Load unpacked in Chrome |
| `dist/firefox/` | Load temporary add-on in Firefox |
| `packages/website-toolkit-chrome.zip` | **Upload to Chrome Web Store** |
| `packages/website-toolkit-firefox.zip` | **Upload to Firefox Add-ons (AMO)** |

Or build one target:

```bash
node scripts/build.js chrome
node scripts/build.js firefox
```

### Store upload (important)

Upload **only** the zip from `packages/` for that browser.

Do **not** zip the whole repository — it contains multiple `manifest.json` files and stores will reject it.

Each package zip has a single `manifest.json` at the archive root.
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
| `activeTab` | Temporary access to the tab you are inspecting after you open the toolkit / click Scan or Capture |
| `scripting` | Inject the analyzer into that tab on demand (no always-on access to all sites) |
| `storage` | Persist latest scan + bug-report drafts locally |

The extension does **not** request broad host permissions (`http://*/*` / `https://*/*`). Analysis runs only after an explicit user gesture (opening the extension / scanning).
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
* The analyzer is injected when you open/scan — it is not injected into every site in the background.
* Console/network hooks start after the analyzer is injected (not a full historical browser log).
* Some Web Vitals may be unavailable until the browser exposes entries.
* Accessibility results are heuristics, not WCAG certification.
* Technology/CMS detection uses frontend signals only; versions are never guessed.
* Temporary Firefox installs unload on browser restart.

## Icons & store assets

Brand icons live in `src/assets/icons/` (`16` / `32` / `48` / `128`).

Full logo and store-ready images are in `src/assets/store/`:

* `store-icon-128.png` — Chrome Web Store listing icon
* `logo-512.png` / `logo-1024.png` — full wordmark logo
