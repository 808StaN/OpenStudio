import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import rcedit from "rcedit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const exePath = path.resolve(rootDir, "release", "win-unpacked", "OpenStudio.exe");
const iconPath = path.resolve(rootDir, "public", "favicon.ico");
const packageJsonPath = path.resolve(rootDir, "package.json");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const appVersion = String(packageJson.version || "1.0.0");
const appName = "OpenStudio";

await rcedit(exePath, {
  icon: iconPath,
  "file-version": appVersion,
  "product-version": appVersion,
  "version-string": {
    ProductName: appName,
    FileDescription: appName,
    OriginalFilename: "OpenStudio.exe",
    InternalName: appName,
    CompanyName: "OpenStudio",
    LegalCopyright: "Copyright (c) OpenStudio",
  },
});

console.log("Patched EXE resources:", exePath);
