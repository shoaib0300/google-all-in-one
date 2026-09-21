# Privacy Policy — Website Toolkit

**Last updated:** September 21, 2026

Website Toolkit (“the Extension”) is a browser extension for developers and QA engineers. This policy explains what the Extension does with data on your device.

## Summary

- The Extension analyzes the **current webpage** only after you choose to open it and/or click **Scan page** (or related actions such as capturing a screenshot for a bug report).
- Analysis runs **locally in your browser**.
- We do **not** operate a backend that receives your browsing data.
- We do **not** sell user data.
- We do **not** use analytics, advertising trackers, or remote code.

## Data the Extension accesses on your device

When you scan a page or use a module, the Extension may read information from that page in order to provide its features, for example:

- Page URL and title  
- HTML structure, scripts, stylesheets, and other page assets visible to the page  
- Performance and accessibility-related signals available in the browser  
- Fonts and colors derived from the rendered page  
- Optional bug-report fields you type, and an optional screenshot you capture  

This is **website content and page metadata** used solely to power the Extension’s single purpose: local website inspection and QA tooling.

## Data stored locally

The Extension may store on your device (using browser `storage.local`):

- The latest scan result for a page (so closing the popup does not erase it)  
- Bug Reporter draft text you enter  

This data stays in your browser profile. It is **not uploaded** to our servers (we do not run servers for this product). Clearing extension storage or uninstalling the Extension removes it according to your browser’s behavior.

## Data we do not collect

The Extension developer does **not** collect or receive:

- Names, emails, or account information  
- Passwords or authentication secrets  
- Payment or financial information  
- Health information  
- Your full browsing history  
- Keystrokes, mouse tracking, or background monitoring of other sites  

The Extension does not require an account.

## Permissions

- **activeTab** — access the tab you are using when you open the Extension or trigger a scan/screenshot.  
- **scripting** — inject/reconnect the local content script so scanning works on the active page.  
- **storage** — save scan results and bug drafts on your device.  
- **Host access to http(s) pages** — run the content script and capture a visible-tab screenshot on normal websites you choose to inspect.

## Remote code

The Extension does **not** use remote code. All JavaScript ships inside the Extension package.

## Sharing

We do not sell or transfer user data to third parties. Page content is not sent to us. If you copy or download a bug report or diagnostics, that file leaves the browser only through **actions you take**.

## Children’s privacy

The Extension is not directed at children and is intended for professional developer/QA use.

## Changes

We may update this policy when the Extension changes. The “Last updated” date at the top will change accordingly.

## Contact

For privacy questions about Website Toolkit, contact the publisher through the Chrome Web Store / Firefox Add-ons support channel listed on the Extension’s store listing.
