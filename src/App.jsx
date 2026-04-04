import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAudioScheduler } from "./audio/useAudioScheduler";
import { BrowserPanel } from "./components/BrowserPanel";
import { ChannelRackWindow } from "./components/ChannelRackWindow";
import { FloatingWindow } from "./components/FloatingWindow";
import { MixerWindow } from "./components/MixerWindow";
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
  return inputType !== "range";
}

function App() {
  const dispatch = useDispatch();
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const windows = useSelector(function (state) {
    return state.daw.ui.windows;
  });

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
            title="Sample Settings"
            minWidth={460}
            minHeight={280}
          >
            <SampleSettingsWindow />
          </FloatingWindow>
        </main>
      </div>
    </div>
  );
}

export default App;
