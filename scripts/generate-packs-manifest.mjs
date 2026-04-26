import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const packsDir = path.join(projectRoot, "public", "packs");
const manifestPath = path.join(packsDir, "manifest.json");

const audioExtensions = new Set([
  ".wav",
  ".wave",
  ".aif",
  ".aiff",
  ".mp3",
  ".ogg",
  ".flac",
]);
const midiExtensions = new Set([".mid", ".midi"]);
const packExtensions = new Set([...audioExtensions, ...midiExtensions]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toWebPathFromRelative(relPath) {
  const parts = String(relPath || "")
    .split("/")
    .filter(Boolean)
    .map(function (part) {
      return encodeURIComponent(part);
    });

  return "/packs/" + parts.join("/");
}

async function walkPackFiles(dirPath, baseDir, output) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await walkPackFiles(absolute, baseDir, output);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!packExtensions.has(ext)) {
      continue;
    }

    const relative = toPosixPath(path.relative(baseDir, absolute));
    output.push(relative);
  }
}

async function generateManifest() {
  await fs.mkdir(packsDir, { recursive: true });

  const files = [];
  await walkPackFiles(packsDir, packsDir, files);

  const folderMap = new Map();

  for (const relPath of files) {
    const folderPath = path.posix.dirname(relPath);
    const folder = folderPath === "." ? "Root" : folderPath;
    const name = path.posix.basename(relPath);
    const webPath = toWebPathFromRelative(relPath);

    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }

    folderMap.get(folder).push({
      name,
      path: webPath,
    });
  }

  const folders = Array.from(folderMap.entries())
    .sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    })
    .map(function ([folder, items]) {
      return {
        folder,
        items: items.sort(function (a, b) {
          return a.name.localeCompare(b.name);
        }),
      };
    });

  const manifest = {
    generatedAt: new Date().toISOString(),
    folders,
  };

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  const filesCount = folders.reduce(function (acc, group) {
    return acc + group.items.length;
  }, 0);

  console.log("Packs manifest updated:", filesCount, "media files");
}

generateManifest().catch(function (error) {
  console.error("Failed to generate packs manifest");
  console.error(error);
  process.exitCode = 1;
});

