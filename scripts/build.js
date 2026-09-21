#!/usr/bin/env node
/**
 * Build browser packages into dist/chrome and dist/firefox,
 * then create upload zips in packages/ (one manifest each).
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SHARED = ["src", "README.md", "LICENSE"];
const PACKAGE_DIR = path.join(ROOT, "packages");

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function build(target) {
  const outDir = path.join(ROOT, "dist", target);
  const manifestSrc = path.join(ROOT, "manifests", `${target}.json`);
  if (!fs.existsSync(manifestSrc)) {
    throw new Error(`Missing manifests/${target}.json`);
  }

  rmrf(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  for (const rel of SHARED) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing ${rel}`);
    }
    copyRecursive(src, path.join(outDir, rel));
  }

  fs.copyFileSync(manifestSrc, path.join(outDir, "manifest.json"));

  if (target === "chrome") {
    fs.copyFileSync(manifestSrc, path.join(ROOT, "manifest.json"));
  }

  console.log(`Built dist/${target}`);
  return outDir;
}

function zipPackage(target, outDir) {
  fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  const zipName = `website-toolkit-${target}.zip`;
  const zipPath = path.join(PACKAGE_DIR, zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Zip contents of outDir so manifest.json is at the archive root
  // (stores reject archives that contain multiple manifests).
  const result = spawnSync(
    "zip",
    ["-r", "-q", zipPath, ".", "-x", "*.DS_Store", "-x", "*__MACOSX*"],
    { cwd: outDir, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`zip failed for ${target}: ${result.stderr || result.stdout || "unknown error"}`);
  }

  // Sanity: exactly one manifest.json inside the zip
  const list = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (list.status !== 0) {
    throw new Error(`Could not inspect ${zipName}`);
  }
  const manifests = list.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /(^|\/)manifest\.json$/.test(l));
  if (manifests.length !== 1 || manifests[0] !== "manifest.json") {
    throw new Error(
      `${zipName} must contain exactly one root manifest.json (found: ${manifests.join(", ") || "none"})`
    );
  }

  const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
  console.log(`Packaged packages/${zipName} (${sizeKb} KB)`);
}

const arg = (process.argv[2] || "all").toLowerCase();
const targets = arg === "all" ? ["chrome", "firefox"] : [arg];
for (const target of targets) {
  if (target !== "chrome" && target !== "firefox") {
    throw new Error(`Unknown target: ${target}`);
  }
  const outDir = build(target);
  zipPackage(target, outDir);
}

console.log("\nUpload these files (do NOT zip the whole repository):");
console.log("  packages/website-toolkit-chrome.zip   → Chrome Web Store");
console.log("  packages/website-toolkit-firefox.zip  → Firefox Add-ons (AMO)");
