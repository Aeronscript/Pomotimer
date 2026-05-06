const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "cloudflare-site");

const filesToCopy = [
  "index.html",
  "style.css",
  "script.js",
  "manifest.webmanifest",
  "sw.js",
  "update-manifest.json"
];

const directoriesToCopy = ["icons", "downloads"];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(outDir, relativePath);

  if (!fs.existsSync(source)) {
    return;
  }

  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(outDir, relativePath);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);

filesToCopy.forEach(copyFile);
directoriesToCopy.forEach(copyDirectory);

fs.writeFileSync(
  path.join(outDir, "_headers"),
  [
    "/update-manifest.json",
    "  Cache-Control: no-store, no-cache, must-revalidate",
    "",
    "/downloads/*",
    "  Cache-Control: public, max-age=300"
  ].join("\n"),
  "utf8"
);

fs.writeFileSync(
  path.join(outDir, "README.txt"),
  [
    "Dossier pret pour Cloudflare Pages.",
    "Deploye le contenu de cloudflare-site/ avec un projet Pages nomme pomotimer.",
    "URL cible recommandee: https://pomotimer-4dt.pages.dev"
  ].join("\n"),
  "utf8"
);

console.log(`Cloudflare Pages assets copied to ${outDir}`);
