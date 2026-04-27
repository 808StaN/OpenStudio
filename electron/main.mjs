import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "openstudio",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

app.setName("OpenStudio");
if (process.platform === "win32") {
  app.setAppUserModelId("com.openstudio.app");
  app.commandLine.appendSwitch("application-name", "OpenStudio");
}

const iconFileName =
  process.platform === "win32" ? "favicon.ico" : "favicon.png";
const appIconPath = isDev
  ? path.resolve(__dirname, "..", "public", iconFileName)
  : path.resolve(__dirname, "..", "dist", iconFileName);

const PACK_MEDIA_EXTENSIONS = new Set([
  ".wav",
  ".wave",
  ".aif",
  ".aiff",
  ".mp3",
  ".ogg",
  ".flac",
  ".mid",
  ".midi",
]);

function getUserPacksDir() {
  if (isDev) {
    return path.resolve(__dirname, "..", "public", "packs");
  }

  return path.resolve(path.dirname(process.execPath), "Packs");
}

function buildPackUrlFromRelative(relativePath) {
  const encoded = String(relativePath || "")
    .split(path.sep)
    .join("/")
    .split("/")
    .filter(Boolean)
    .map(function (segment) {
      return encodeURIComponent(segment);
    })
    .join("/");

  return "openstudio://packs/" + encoded;
}

async function walkPackFiles(dirPath, rootPath, output) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await walkPackFiles(fullPath, rootPath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!PACK_MEDIA_EXTENSIONS.has(ext)) {
      continue;
    }

    output.push(path.relative(rootPath, fullPath));
  }
}

async function buildPacksManifest() {
  const packsRoot = getUserPacksDir();
  await fs.mkdir(packsRoot, { recursive: true });

  const mediaRelativePaths = [];
  await walkPackFiles(packsRoot, packsRoot, mediaRelativePaths);

  const folderMap = new Map();
  mediaRelativePaths.forEach(function (relativePath) {
    const normalized = relativePath.split(path.sep).join("/");
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);
    const folder = folderSegments.length > 0 ? folderSegments.join("/") : "Root";

    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }

    folderMap.get(folder).push({
      name: fileName,
      path: buildPackUrlFromRelative(normalized),
    });
  });

  const folders = Array.from(folderMap.entries())
    .map(function ([folder, items]) {
      return {
        folder,
        items: items.sort(function (a, b) {
          return a.name.localeCompare(b.name);
        }),
      };
    })
    .sort(function (a, b) {
      return a.folder.localeCompare(b.folder);
    });

  return {
    generatedAt: new Date().toISOString(),
    folders,
  };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav" || ext === ".wave") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".flac") return "audio/flac";
  if (ext === ".aif" || ext === ".aiff") return "audio/aiff";
  if (ext === ".mid" || ext === ".midi") return "audio/midi";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function registerPacksProtocol() {
  protocol.handle("openstudio", async function (request) {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "packs") {
        return new Response("Not found", { status: 404 });
      }

      const pathname = decodeURIComponent(url.pathname || "/");
      if (pathname === "/manifest.json") {
        const manifest = await buildPacksManifest();
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const relative = pathname.replace(/^\/+/, "");
      if (!relative) {
        return new Response("Not found", { status: 404 });
      }

      const packsRoot = getUserPacksDir();
      const resolved = path.resolve(packsRoot, relative);
      const rootWithSep = packsRoot.endsWith(path.sep)
        ? packsRoot
        : packsRoot + path.sep;
      if (
        resolved !== packsRoot &&
        !resolved.toLowerCase().startsWith(rootWithSep.toLowerCase())
      ) {
        return new Response("Forbidden", { status: 403 });
      }

      const data = await fs.readFile(resolved);
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": getMimeType(resolved),
          "cache-control": "no-cache",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0d1320",
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.resolve(__dirname, "preload.mjs"),
    },
  });

  window.maximize();

  window.webContents.setWindowOpenHandler(function (details) {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (isDev) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const indexPath = path.resolve(__dirname, "..", "dist", "index.html");
    void window.loadFile(indexPath);
  }

  window.on("maximize", function () {
    window.webContents.send("window:maximized", true);
  });

  window.on("unmaximize", function () {
    window.webContents.send("window:maximized", false);
  });
}

ipcMain.on("window:control", function (event, action) {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) {
    return;
  }

  if (action === "minimize") {
    targetWindow.minimize();
    return;
  }

  if (action === "toggle-maximize") {
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
      return;
    }

    targetWindow.maximize();
    return;
  }

  if (action === "close") {
    targetWindow.close();
  }
});

ipcMain.handle("window:is-maximized", function (event) {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  return Boolean(targetWindow?.isMaximized());
});

app.whenReady().then(function () {
  registerPacksProtocol();
  createMainWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
