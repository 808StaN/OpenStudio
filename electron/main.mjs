import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0d1320",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

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
}

app.whenReady().then(function () {
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
