import { describe, it, expect } from "vitest";
import { uiReducers } from "./ui";

function createUiState() {
  return {
    ui: {
      windows: {
        browser: { open: false, z: 1, x: 10, y: 10, width: 200, height: 200, isMaximized: false },
        playlist: { open: false, z: 2, x: 20, y: 20, width: 300, height: 300, isMaximized: false },
      },
      nextZ: 2,
      browserTab: "packs",
      theme: "default",
      fxEditorTarget: null,
    },
    project: {
      patterns: [{ id: "pat-1" }],
    },
  };
}

describe("uiReducers", () => {
  describe("openWindow", () => {
    it("opens a closed window and bumps z-index", () => {
      const state = createUiState();
      uiReducers.openWindow(state, { payload: "browser" });
      expect(state.ui.windows.browser.open).toBe(true);
      expect(state.ui.windows.browser.z).toBe(3);
      expect(state.ui.nextZ).toBe(3);
    });

    it("ignores unknown window ids", () => {
      const state = createUiState();
      uiReducers.openWindow(state, { payload: "unknown" });
      expect(state.ui.nextZ).toBe(2);
    });
  });

  describe("closeWindow", () => {
    it("closes an open window", () => {
      const state = createUiState();
      state.ui.windows.browser.open = true;
      uiReducers.closeWindow(state, { payload: "browser" });
      expect(state.ui.windows.browser.open).toBe(false);
    });
  });

  describe("bringWindowToFront", () => {
    it("bumps z-index of existing window", () => {
      const state = createUiState();
      uiReducers.bringWindowToFront(state, { payload: "browser" });
      expect(state.ui.windows.browser.z).toBe(3);
    });

    it("ignores unknown window ids", () => {
      const state = createUiState();
      uiReducers.bringWindowToFront(state, { payload: "unknown" });
      expect(state.ui.nextZ).toBe(2);
    });
  });

  describe("setWindowRect", () => {
    it("updates window position and size", () => {
      const state = createUiState();
      uiReducers.setWindowRect(state, { payload: { id: "browser", x: 50, y: 60, width: 400, height: 300 } });
      expect(state.ui.windows.browser.x).toBe(50);
      expect(state.ui.windows.browser.y).toBe(60);
      expect(state.ui.windows.browser.width).toBe(400);
      expect(state.ui.windows.browser.height).toBe(300);
    });
  });

  describe("toggleWindowMaximize", () => {
    it("maximizes window and stores restore rect", () => {
      const state = createUiState();
      uiReducers.toggleWindowMaximize(state, { payload: { id: "browser", viewport: { width: 1920, height: 1080 } } });
      expect(state.ui.windows.browser.isMaximized).toBe(true);
      expect(state.ui.windows.browser.restoreRect).toEqual({ x: 10, y: 10, width: 200, height: 200 });
      expect(state.ui.windows.browser.width).toBe(1920);
    });

    it("restores window from maximized state", () => {
      const state = createUiState();
      uiReducers.toggleWindowMaximize(state, { payload: { id: "browser", viewport: { width: 1920, height: 1080 } } });
      uiReducers.toggleWindowMaximize(state, { payload: { id: "browser" } });
      expect(state.ui.windows.browser.isMaximized).toBe(false);
      expect(state.ui.windows.browser.width).toBe(200);
    });
  });

  describe("setBrowserTab", () => {
    it("sets the active browser tab", () => {
      const state = createUiState();
      uiReducers.setBrowserTab(state, { payload: "plugins" });
      expect(state.ui.browserTab).toBe("plugins");
    });
  });

  describe("setTheme", () => {
    it("sets a valid theme", () => {
      const state = createUiState();
      uiReducers.setTheme(state, { payload: "tealslate" });
      expect(state.ui.theme).toBe("tealslate");
    });

    it("falls back to default for invalid theme", () => {
      const state = createUiState();
      uiReducers.setTheme(state, { payload: "invalid" });
      expect(state.ui.theme).toBe("default");
    });
  });

  describe("setPatternClipboard", () => {
    it("stores valid pattern ids", () => {
      const state = createUiState();
      uiReducers.setPatternClipboard(state, { payload: { patternIds: ["pat-1"] } });
      expect(state.ui.patternClipboard).toEqual(["pat-1"]);
    });

    it("ignores unknown pattern ids", () => {
      const state = createUiState();
      uiReducers.setPatternClipboard(state, { payload: { patternIds: ["unknown"] } });
      expect(state.ui.patternClipboard).toEqual([]);
    });
  });
});
