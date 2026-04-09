import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const appIconPath = isDev
  ? path.resolve(__dirname, "..", "public", "favicon.png")
  : path.resolve(__dirname, "..", "dist", "favicon.png");

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
  app.setName("OpenStudio");

  if (process.platform === "win32") {
    app.setAppUserModelId("com.openstudio.app");
  }

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
