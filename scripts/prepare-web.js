const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "www");
const filesToCopy = [
  "index.html",
  "style.css",
  "script.js",
  "manifest.webmanifest",
  "sw.js"
];
const directoriesToCopy = ["icons"];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(outDir, relativePath);
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(outDir, relativePath);
  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);

filesToCopy.forEach(copyFile);
directoriesToCopy.forEach(copyDirectory);

console.log(`Web assets copied to ${outDir}`);
