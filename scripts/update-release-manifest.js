const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const gradlePath = path.join(rootDir, "android", "app", "build.gradle");
const manifestPath = path.join(rootDir, "update-manifest.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const gradle = fs.readFileSync(gradlePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);

manifest.latestVersion = versionNameMatch?.[1] || packageJson.version;
manifest.versionCode = Number(versionCodeMatch?.[1] || 1);
manifest.releasedAt = new Date().toISOString();
manifest.apkPath = "/downloads/pomotimer-release.apk";

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `Updated update-manifest.json -> version ${manifest.latestVersion} (${manifest.versionCode})`
);
