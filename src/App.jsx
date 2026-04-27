import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAudioScheduler } from "./audio/useAudioScheduler";
import { BrowserPanel } from "./components/BrowserPanel";
import { AppTitleBar } from "./components/AppTitleBar";
import { ChannelRackWindow } from "./components/ChannelRackWindow";
import { FxPluginWindow } from "./components/FxPluginWindow";
import { FloatingWindow } from "./components/FloatingWindow";
import { MixerWindow } from "./components/MixerWindow";
import { PatternListWindow } from "./components/PatternListWindow";
import { PianoRollWindow } from "./components/PianoRollWindow";
import { PlaylistWindow } from "./components/PlaylistWindow";
import { RenderWindow } from "./components/RenderWindow";
import { SampleSettingsWindow } from "./components/SampleSettingsWindow";
import { TopToolbar } from "./components/TopToolbar";
import { setPlaying, undoLastChange, toggleWindowMaximize } from "./store";
import { setUser, clearUser } from "./store/userSlice";
import { supabase } from "./lib/supabase";
import { MIDI_FILE_DND_MIME } from "./utils/midiImport";
import { MIDI_PATTERN_DND_MIME } from "./utils/midiPattern";
import "./styles/theme-main.css";
import "./styles/app-shell.css";
import "./styles/browser.css";
import "./styles/channel-rack.css";
import "./styles/piano-roll.css";
import "./styles/playlist.css";
import "./styles/mixer.css";
import "./styles/pattern-list.css";
import "./styles/render-window.css";
import "./styles/auth.css";
import "./styles/main-theme-redesign.css";

import midnightThemeCss from "./styles/theme-midnight.css?raw";

function shouldIgnoreSpaceShortcut(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (
    target.closest(
      "input, textarea, select, button, [role='button'], [contenteditable='true']",
    )
  ) {
    return true;
  }
  return false;
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
      ? "Graphic EQ"
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

function shouldBlockNativeFileDrop(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types || []).map(function (type) {
    return String(type || "");
  });

  if (types.includes("Files")) {
    return true;
  }

  return (
    types.includes(MIDI_FILE_DND_MIME) ||
    types.includes(MIDI_PATTERN_DND_MIME) ||
    types.includes("application/x-daw-sample") ||
    types.includes("application/x-daw-plugin")
  );
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
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
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

  const autoMaxAppliedWindowsRef = useRef(new Set());

  useEffect(
    function () {
      autoMaxAppliedWindowsRef.current.forEach(function (winId) {
        const win = windows[winId];
        if (!win || !win.open || !win.startMaximized) {
          autoMaxAppliedWindowsRef.current.delete(winId);
        }
      });

      Object.keys(windows).forEach(function (winId) {
        const w = windows[winId];
        if (!w || !w.open || !w.startMaximized) {
          return;
        }

        if (autoMaxAppliedWindowsRef.current.has(winId)) {
          return;
        }

        if (w.isMaximized) {
          autoMaxAppliedWindowsRef.current.add(winId);
          return;
        }

        const workspace = document.querySelector(".workspace-surface");
        const viewport = workspace
          ? { width: workspace.clientWidth, height: workspace.clientHeight }
          : { width: window.innerWidth, height: window.innerHeight };

        autoMaxAppliedWindowsRef.current.add(winId);
        dispatch(toggleWindowMaximize({ id: winId, viewport }));
      });
    },
    [dispatch, windows],
  );

  useEffect(
    function () {
      const onKeyDown = function (event) {
        const isSelectAllShortcut =
          event.code === "KeyA" &&
          (event.ctrlKey || event.metaKey) &&
          !event.altKey;

        if (isSelectAllShortcut && !shouldIgnoreSpaceShortcut(event.target)) {
          event.preventDefault();
          return;
        }

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

        dispatch(setPlaying(true));
      };

      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [dispatch, isPlaying, windows],
  );

  useEffect(function () {
    const onWindowDragOver = function (event) {
      if (!shouldBlockNativeFileDrop(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
    };

    const onWindowDrop = function (event) {
      if (!shouldBlockNativeFileDrop(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);

    return function () {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, []);

  useEffect(function () {
    const syncUserProfile = async function (session) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username,nickname,email")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        dispatch(
          setUser({
            id: session.user.id,
            username: profile.username,
            nickname: profile.nickname,
            email: profile.email,
          }),
        );
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange(
      function (event, session) {
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
          window.setTimeout(function () {
            syncUserProfile(session);
          }, 0);
        } else if (event === "SIGNED_OUT") {
          dispatch(clearUser());
        }
      },
    );

    return function () {
      listener.subscription.unsubscribe();
    };
  }, [dispatch]);

  const onAppContextMenu = function (event) {
    event.preventDefault();
  };

  return (
    <div
      className={
        "app-shell " +
        (activeTheme === "midnight" ? "theme-midnight" : "theme-default")
      }
      onContextMenu={onAppContextMenu}
    >
      {activeTheme === "midnight" ? <style>{midnightThemeCss}</style> : null}
      <AppTitleBar />
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
            centerOnOpen
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
            minHeight={520}
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

          <FloatingWindow
            id="renderExport"
            title="Render"
            minWidth={460}
            minHeight={340}
            modal
            centerOnOpen
            disableDrag
            disableResize
            hideMaximize
          >
            <RenderWindow />
          </FloatingWindow>
        </main>
      </div>
    </div>
  );
}

export default App;

