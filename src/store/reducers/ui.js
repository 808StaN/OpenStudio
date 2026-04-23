// ------------------------------------------------------------------
// UI reducers — window management, theme, browser state, and editor
// targets. All of these are non-undoable by design (see store.js).
// ------------------------------------------------------------------

import { sanitizeUiTheme } from "../utils";

export const uiReducers = {
  openWindow(state, action) {
    const windowId = String(action.payload || "");
    if (!windowId || !state.ui.windows[windowId]) {
      return;
    }

    state.ui.nextZ += 1;
    state.ui.windows[windowId].open = true;
    state.ui.windows[windowId].z = state.ui.nextZ;
  },

  closeWindow(state, action) {
    state.ui.windows[action.payload].open = false;
  },

  bringWindowToFront(state, action) {
    const windowId = String(action.payload || "");
    if (!windowId || !state.ui.windows[windowId]) {
      return;
    }

    state.ui.nextZ += 1;
    state.ui.windows[windowId].z = state.ui.nextZ;
  },

  setWindowRect(state, action) {
    const win = state.ui.windows[action.payload.id];
    win.x = action.payload.x;
    win.y = action.payload.y;
    win.width = action.payload.width;
    win.height = action.payload.height;
  },

  toggleWindowMaximize(state, action) {
    const win = state.ui.windows[action.payload.id];
    if (!win) {
      return;
    }

    if (win.isMaximized) {
      if (win.restoreRect) {
        win.x = win.restoreRect.x;
        win.y = win.restoreRect.y;
        win.width = win.restoreRect.width;
        win.height = win.restoreRect.height;
      }
      win.isMaximized = false;
      win.restoreRect = null;
      return;
    }

    const viewportWidth = Math.max(
      320,
      Math.round(action.payload.viewport?.width || win.width),
    );
    const viewportHeight = Math.max(
      220,
      Math.round(action.payload.viewport?.height || win.height),
    );

    win.restoreRect = {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    };
    win.x = 0;
    win.y = 0;
    win.width = viewportWidth;
    win.height = viewportHeight;
    win.isMaximized = true;
  },

  setBrowserTab(state, action) {
    state.ui.browserTab = action.payload;
  },

  setTheme(state, action) {
    state.ui.theme = sanitizeUiTheme(action.payload);
  },

  setPatternClipboard(state, action) {
    const requestedIds = Array.isArray(action.payload?.patternIds)
      ? action.payload.patternIds
      : [];

    const existingIdSet = new Set(
      state.project.patterns.map(function (pattern) {
        return pattern.id;
      }),
    );

    const sanitized = requestedIds
      .map(function (patternId) {
        return String(patternId || "").trim();
      })
      .filter(function (patternId, index, arr) {
        return Boolean(patternId) && arr.indexOf(patternId) === index;
      })
      .filter(function (patternId) {
        return existingIdSet.has(patternId);
      });

    state.ui.patternClipboardIds = sanitized;
  },

  setPianoRollScale(state, action) {
    const root = String(action.payload?.root || "")
      .trim()
      .toUpperCase();
    const type = String(action.payload?.type || "")
      .trim()
      .toLowerCase();
    const allowedRoots = new Set([
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ]);

    state.ui.pianoRollScaleRoot = allowedRoots.has(root)
      ? root
      : state.ui.pianoRollScaleRoot || "C";
    state.ui.pianoRollScaleType = type === "major" ? "major" : "minor";
  },

  setFxEditorTarget(state, action) {
    const insertId = String(action.payload?.insertId || "").trim();
    const slotId = String(action.payload?.slotId || "").trim();

    if (!insertId || !slotId) {
      return;
    }

    const insert = state.mixer.inserts.find(function (item) {
      return item.id === insertId;
    });
    if (!insert) {
      return;
    }

    const hasSlot = Array.isArray(insert.fxSlots)
      ? insert.fxSlots.some(function (slot) {
          return slot.id === slotId;
        })
      : false;

    if (!hasSlot) {
      return;
    }

    state.ui.fxEditorTarget = {
      insertId,
      slotId,
    };
    state.mixer.selectedInsertId = insertId;
  },

  setChannelRackMode(state, action) {
    const nextMode = action.payload;
    if (nextMode !== "sequencer" && nextMode !== "melody") {
      return;
    }
    state.ui.channelRackMode = nextMode;
  },

  toggleBrowserFolder(state, action) {
    const key = action.payload;
    state.ui.browserCollapsedFolders[key] =
      !state.ui.browserCollapsedFolders[key];
  },
};
