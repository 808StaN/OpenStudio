import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const sourcePngPath = path.resolve(rootDir, "public", "favicon.png");
const buildDir = path.resolve(rootDir, "build");
const outputIcoPath = path.resolve(buildDir, "icon.ico");

await mkdir(buildDir, { recursive: true });

const iconBuffer = await pngToIco(sourcePngPath);
await writeFile(outputIcoPath, iconBuffer);

console.log("Electron icon generated:", outputIcoPath);
