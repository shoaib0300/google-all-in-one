#!/usr/bin/env node
/**
 * Build browser packages into dist/chrome and dist/firefox.
 * Shared source; only manifest.json differs.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SHARED = ["src", "README.md", "LICENSE"];

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
}

const arg = (process.argv[2] || "all").toLowerCase();
const targets = arg === "all" ? ["chrome", "firefox"] : [arg];
for (const target of targets) {
  if (target !== "chrome" && target !== "firefox") {
    throw new Error(`Unknown target: ${target}`);
  }
  build(target);
}
