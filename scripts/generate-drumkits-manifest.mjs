import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const drumkitsDir = path.join(projectRoot, "public", "drumkits");
const manifestPath = path.join(drumkitsDir, "manifest.json");
const safeAliasRoot = "__safe__";

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
const drumkitExtensions = new Set([...audioExtensions, ...midiExtensions]);

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

  return "/drumkits/" + parts.join("/");
}

function toSafeAliasRelativePath(relPath) {
  const safeRel = String(relPath || "").replace(/#/g, "_hash_");
  return toPosixPath(path.posix.join(safeAliasRoot, safeRel));
}

async function walkDrumkitFiles(dirPath, baseDir, output) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await walkDrumkitFiles(absolute, baseDir, output);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!drumkitExtensions.has(ext)) {
      continue;
    }

    const relative = toPosixPath(path.relative(baseDir, absolute));
    output.push(relative);
  }
}

async function generateManifest() {
  await fs.mkdir(drumkitsDir, { recursive: true });

  const safeAliasDir = path.join(drumkitsDir, safeAliasRoot);
  await fs.rm(safeAliasDir, { recursive: true, force: true });

  const files = [];
  await walkDrumkitFiles(drumkitsDir, drumkitsDir, files);

  const folderMap = new Map();

  for (const relPath of files) {
    if (relPath.startsWith(safeAliasRoot + "/")) {
      continue;
    }

    const folderPath = path.posix.dirname(relPath);
    const folder = folderPath === "." ? "Root" : folderPath;
    const name = path.posix.basename(relPath);
    let targetRelativePath = relPath;

    if (relPath.includes("#")) {
      targetRelativePath = toSafeAliasRelativePath(relPath);
      const sourceAbsolute = path.join(drumkitsDir, ...relPath.split("/"));
      const targetAbsolute = path.join(
        drumkitsDir,
        ...targetRelativePath.split("/"),
      );
      await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
      await fs.copyFile(sourceAbsolute, targetAbsolute);
    }

    const webPath = toWebPathFromRelative(targetRelativePath);

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

  console.log("Drumkits manifest updated:", filesCount, "media files");
}

generateManifest().catch(function (error) {
  console.error("Failed to generate drumkits manifest");
  console.error(error);
  process.exitCode = 1;
});
