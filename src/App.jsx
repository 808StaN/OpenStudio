import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAudioScheduler } from "./audio/useAudioScheduler";
import { BrowserPanel } from "./components/BrowserPanel";
import { ChannelRackWindow } from "./components/ChannelRackWindow";
import { FxPluginWindow } from "./components/FxPluginWindow";
import { FloatingWindow } from "./components/FloatingWindow";
import { MixerWindow } from "./components/MixerWindow";
import { PatternListWindow } from "./components/PatternListWindow";
import { PianoRollWindow } from "./components/PianoRollWindow";
import { PlaylistWindow } from "./components/PlaylistWindow";
import { SampleSettingsWindow } from "./components/SampleSettingsWindow";
import { TopToolbar } from "./components/TopToolbar";
import { setPlaying, setTransportMode, undoLastChange } from "./store";
import "./styles/app-shell.css";
import "./styles/browser.css";
import "./styles/channel-rack.css";
import "./styles/piano-roll.css";
import "./styles/playlist.css";
import "./styles/mixer.css";
import "./styles/pattern-list.css";

function getActiveWindowId(windows) {
  const openWindows = Object.entries(windows).filter(function (_entry) {
    return _entry[1].open;
  });

  if (openWindows.length === 0) {
    return null;
  }

  openWindows.sort(function (a, b) {
    return b[1].z - a[1].z;
  });

  return openWindows[0][0];
}

function shouldIgnoreSpaceShortcut(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest("textarea, select, [contenteditable='true']")) {
    return true;
  }

  const inputElement = target.closest("input");
  if (!inputElement) {
    return false;
  }

  const inputType = inputElement.getAttribute("type");
  return inputType !== "range" && inputType !== "checkbox";
}

function getSampleWindowTitle(activeChannel) {
  if (!activeChannel) {
    return "Sample Settings";
  }

  const rawSampleRef = String(activeChannel.sampleRef || "").trim();
  let baseName = String(activeChannel.name || "Sample").trim() || "Sample";

  if (rawSampleRef) {
    const leaf = rawSampleRef.split("/").pop() || rawSampleRef;
    const withoutExtension = leaf.replace(/\.[^.]+$/, "");

    try {
      baseName = decodeURIComponent(withoutExtension);
    } catch {
      baseName = withoutExtension;
    }
  }

  const insertRaw = String(activeChannel.mixerInsertId || "").trim();
  const insertMatch = insertRaw.match(/insert[-_\s]?(\d+)/i);
  const insertLabel = insertMatch
    ? "insert" + insertMatch[1]
    : insertRaw.toLowerCase() || "insert?";

  return baseName + " (" + insertLabel + ")";
}

function getFxWindowTitle(activeInsert, activeSlot) {
  if (!activeInsert || !activeSlot) {
    return "FX Plugin";
  }

  const effectLabel =
    activeSlot.effectType === "graphic-eq"
      ? "Parametric EQ 2"
      : String(activeSlot.name || "FX Plugin").trim() || "FX Plugin";

  if (activeInsert.isMaster) {
    return effectLabel + " (Master)";
  }

  const insertMatch = String(activeInsert.id || "").match(/insert-(\d+)/i);
  const insertLabel = insertMatch
    ? "Insert " + insertMatch[1]
    : String(activeInsert.name || "Insert").trim() || "Insert";

  return effectLabel + " (" + insertLabel + ")";
}

function App() {
  const dispatch = useDispatch();
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const windows = useSelector(function (state) {
    return state.daw.ui.windows;
  });
  const activeChannelId = useSelector(function (state) {
    return state.daw.project.activeChannelId;
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  const activeChannel = channels.find(function (channel) {
    return channel.id === activeChannelId;
  });
  const sampleWindowTitle = getSampleWindowTitle(activeChannel);
  const fxWindowInsert = inserts.find(function (insert) {
    return insert.id === fxEditorTarget?.insertId;
  });
  const fxWindowSlot = Array.isArray(fxWindowInsert?.fxSlots)
    ? fxWindowInsert.fxSlots.find(function (slot) {
        return slot.id === fxEditorTarget?.slotId;
      })
    : null;
  const fxWindowTitle = getFxWindowTitle(fxWindowInsert, fxWindowSlot);

  useAudioScheduler();

  useEffect(
    function () {
      const onKeyDown = function (event) {
        const isUndoShortcut =
          event.code === "KeyZ" &&
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey;

        if (isUndoShortcut) {
          if (shouldIgnoreSpaceShortcut(event.target)) {
            return;
          }

          event.preventDefault();
          dispatch(undoLastChange());
          return;
        }

        if (event.code !== "Space" || event.repeat) {
          return;
        }

        if (shouldIgnoreSpaceShortcut(event.target)) {
          return;
        }

        event.preventDefault();

        if (isPlaying) {
          dispatch(setPlaying(false));
          return;
        }

        const activeWindowId = getActiveWindowId(windows);
        if (activeWindowId === "playlist") {
          dispatch(setTransportMode("song"));
        } else if (activeWindowId === "channelRack") {
          dispatch(setTransportMode("pattern"));
        }

        dispatch(setPlaying(true));
      };

      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [dispatch, isPlaying, windows],
  );

  const onAppContextMenu = function (event) {
    event.preventDefault();
  };

  return (
    <div className="app-shell" onContextMenu={onAppContextMenu}>
      <TopToolbar />

      <div className="app-body">
        <BrowserPanel />

        <main className="workspace-surface">
          <FloatingWindow
            id="playlist"
            title="Playlist"
            minWidth={560}
            minHeight={270}
          >
            <PlaylistWindow />
          </FloatingWindow>

          <FloatingWindow
            id="channelRack"
            title="Channel Rack"
            minWidth={620}
            minHeight={250}
          >
            <ChannelRackWindow />
          </FloatingWindow>

          <FloatingWindow
            id="pianoRoll"
            title="Piano Roll"
            minWidth={560}
            minHeight={260}
          >
            <PianoRollWindow />
          </FloatingWindow>

          <FloatingWindow
            id="mixer"
            title="Mixer"
            minWidth={530}
            minHeight={450}
          >
            <MixerWindow />
          </FloatingWindow>

          <FloatingWindow
            id="sampleSettings"
            title={sampleWindowTitle}
            minWidth={460}
            minHeight={280}
          >
            <SampleSettingsWindow />
          </FloatingWindow>

          <FloatingWindow
            id="fxPlugin"
            title={fxWindowTitle}
            minWidth={480}
            minHeight={340}
          >
            <FxPluginWindow />
          </FloatingWindow>

          <FloatingWindow
            id="patternList"
            title="Pattern List"
            minWidth={300}
            minHeight={320}
          >
            <PatternListWindow />
          </FloatingWindow>
        </main>
      </div>
    </div>
  );
}

export default App;
