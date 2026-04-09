import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronWindow", {
  isDesktop: true,
  minimize: function () {
    ipcRenderer.send("window:control", "minimize");
  },
  toggleMaximize: function () {
    ipcRenderer.send("window:control", "toggle-maximize");
  },
  close: function () {
    ipcRenderer.send("window:control", "close");
  },
  isMaximized: function () {
    return ipcRenderer.invoke("window:is-maximized");
  },
  onMaximizedChange: function (callback) {
    if (typeof callback !== "function") {
      return function () {};
    }

    const listener = function (_, isMaximized) {
      callback(Boolean(isMaximized));
    };
    ipcRenderer.on("window:maximized", listener);

    return function () {
      ipcRenderer.removeListener("window:maximized", listener);
    };
  },
});
