# Chrome Web Store — Privacy form answers

Paste these into the **Privacy** tab. Keep them accurate; do not claim features you do not ship.

Host this privacy policy at a public HTTPS URL (GitHub Pages, your site, or a raw GitHub link that stays stable), then paste that URL into **Privacy policy URL**.

File in repo: `PRIVACY.md`

---

## Single purpose description

```
Website Toolkit helps developers and QA engineers inspect the current webpage locally: detect CMS/technologies, review performance and accessibility signals, inspect fonts/colors, and create local bug reports. It does not provide unrelated browsing, shopping, or social features.
```

---

## Permission justifications

### activeTab

```
Used only when the user opens the extension or clicks Scan page / screenshot actions, so we can read the active tab’s URL and run the on-page analysis for that tab. We do not access tabs in the background without user action.
```

### scripting

```
Used to inject or reconnect our bundled content script on the active page so Scan page can collect technology, performance, accessibility, fonts/colors, and CMS diagnostics. All script code is included in the extension package; nothing is fetched remotely.
```

### storage

```
Used with chrome.storage.local to save the latest scan result and Bug Reporter drafts on the user’s device so closing the popup does not erase their work. Data stays local; we do not sync it to our servers (we do not operate a backend for this extension).
```

### Host permission justification

```
http://*/* and https://*/* are required so the content script can analyze normal websites the user chooses to inspect, and so tabs.captureVisibleTab can take an optional local screenshot for bug reports. The extension only analyzes pages after user action (open toolkit / Scan / capture). It does not need access to chrome:// or other restricted pages.
```

---

## Remote code

**Select:** No, I am not using Remote code

Leave the remote-code justification blank (not required when No is selected).

---

## Data usage — what to check

Because the extension **reads page content locally** to scan sites, disclose:

- [x] **Website content** — text/DOM/assets of the page being scanned (processed locally for detection, performance, a11y, fonts/colors, bug context). Not uploaded to developer servers.

Leave **unchecked** (you do not collect/transmit these):

- Personally identifiable information  
- Health information  
- Financial and payment information  
- Authentication information  
- Personal communications  
- Location  
- Web history *(you only see the current tab when the user scans; you do not collect browsing history)*  
- User activity *(no keylogging / click tracking / network monitoring products)*  

### Certify all three disclosures

Check all three:

1. I do not sell or transfer user data to third parties, outside of the approved use cases  
2. I do not use or transfer user data for purposes that are unrelated to my item's single purpose  
3. I do not use or transfer user data to determine creditworthiness or for lending purposes  

---

## Privacy policy URL

1. Publish `PRIVACY.md` on a public HTTPS page.  
2. Paste that URL here.

Examples:

- `https://YOUR_GITHUB_USER.github.io/google-all-in-one/PRIVACY.html`  
- `https://github.com/YOUR_USER/YOUR_REPO/blob/main/PRIVACY.md` *(works if Google accepts GitHub blob URLs; a dedicated pages URL is safer)*

If you do not have hosting yet, create a public GitHub repo file `PRIVACY.md`, enable GitHub Pages, and use the Pages URL.
