import {
  Circle,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  ListMusic,
  Music2,
  Palette,
  Play,
  Rows3,
  Save,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  loadProjectFromFile,
  openWindow,
  resetToDefaultProject,
  setBpm,
  setPlaying,
  setRecording,
  setTheme,
  setTransportMode,
  setWindowRect,
  store,
  toggleWindowMaximize,
} from "../store";

const THEME_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "midnight", label: "Midnight" },
];

function DraggableBpm({ value, onChange, min, max }) {
  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(value);
  const isDraggingRef = useRef(false);

  const onMouseDown = function (event) {
    isDraggingRef.current = true;
    dragStartYRef.current = event.clientY;
    dragStartValueRef.current = value;

    const onMouseMove = function (moveEvent) {
      if (!isDraggingRef.current) {
        return;
      }
      const delta = dragStartYRef.current - moveEvent.clientY;
      const nextValue = dragStartValueRef.current + delta;
      onChange(Math.max(min, Math.min(max, nextValue)));
    };

    const onMouseUp = function () {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <button className="transport-bpm" onMouseDown={onMouseDown}>
      {Math.round(value)} BPM
    </button>
  );
}

export function TopToolbar() {
  const dispatch = useDispatch();
  const projectFileInputRef = useRef(null);
  const themeMenuRef = useRef(null);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
  });
  const suppressModeToggleSpace = function (event) {
    if (event.code !== "Space") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
  };

  const onSaveProjectClick = function () {
    const dawState = store.getState().daw;
    if (!dawState) {
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(dawState));
    if (snapshot.transport) {
      snapshot.transport.isPlaying = false;
      snapshot.transport.isRecording = false;
      snapshot.transport.currentStep16 = 0;
    }

    const payload = {
      format: "openstudio-project",
      version: 1,
      savedAt: new Date().toISOString(),
      daw: snapshot,
    };

    const serialized = JSON.stringify(payload, null, 2);
    const fileStamp = new Date().toISOString().replace(/[.:]/g, "-");
    const fileName = "openstudio-" + fileStamp + ".os";
    const blob = new Blob([serialized], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 0);
  };

  const onLoadProjectClick = function () {
    if (!projectFileInputRef.current) {
      return;
    }

    projectFileInputRef.current.click();
  };

  const onProjectFileSelected = async function (event) {
    const input = event.target;
    const file = input?.files?.[0] || null;
    if (!file) {
      if (input) {
        input.value = "";
      }
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const candidate =
        parsed && typeof parsed === "object" && parsed.daw
          ? parsed.daw
          : parsed;

      if (
        !candidate ||
        typeof candidate !== "object" ||
        !candidate.project ||
        !candidate.transport
      ) {
        throw new Error("Invalid project file");
      }

      dispatch(loadProjectFromFile(candidate));
    } catch {
      window.alert("Nie udalo sie wczytac pliku .os");
    }

    input.value = "";
  };

  useEffect(
    function () {
      if (!isThemeMenuOpen) {
        return;
      }

      const onPointerDown = function (event) {
        const root = themeMenuRef.current;
        if (!root) {
          return;
        }

        if (!root.contains(event.target)) {
          setIsThemeMenuOpen(false);
        }
      };

      const onKeyDown = function (event) {
        if (event.key !== "Escape") {
          return;
        }

        setIsThemeMenuOpen(false);
      };

      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [isThemeMenuOpen],
  );

  return (
    <header className="transport-shell">
      <div className="transport-main">
        <div className="transport-brand" title="OpenStudio">
          <img src="/openstudio-logo.png" alt="OpenStudio logo" />
        </div>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(resetToDefaultProject());

            const workspace = document.querySelector(".workspace-surface");
            const viewport = workspace
              ? {
                  width: workspace.clientWidth,
                  height: workspace.clientHeight,
                }
              : {
                  width: window.innerWidth,
                  height: window.innerHeight,
                };

            dispatch(toggleWindowMaximize({ id: "playlist", viewport }));

            const nextState = store.getState().daw;
            const rackWindow = nextState?.ui?.windows?.channelRack;
            if (rackWindow) {
              const centeredX = Math.max(
                0,
                Math.round((viewport.width - rackWindow.width) / 2),
              );
              const centeredY = Math.max(
                0,
                Math.round((viewport.height - rackWindow.height) / 2),
              );

              dispatch(
                setWindowRect({
                  id: "channelRack",
                  x: centeredX,
                  y: centeredY,
                  width: rackWindow.width,
                  height: rackWindow.height,
                }),
              );
            }
          }}
        >
          <FilePlus2 size={14} />
          New project
        </button>
        <button className="transport-btn small" onClick={onLoadProjectClick}>
          <FolderOpen size={14} />
          Load project
        </button>
        <button className="transport-btn small" onClick={onSaveProjectClick}>
          <Save size={14} />
          Save project
        </button>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("renderExport"));
          }}
        >
          <Download size={14} />
          Render
        </button>

        <button
          className="transport-btn"
          title={transport.isPlaying ? "Stop" : "Play"}
          aria-label={transport.isPlaying ? "Stop" : "Play"}
          onClick={function () {
            dispatch(setPlaying(!transport.isPlaying));
          }}
        >
          {transport.isPlaying ? <Square size={15} /> : <Play size={15} />}
        </button>
        <button
          className={"transport-btn" + (transport.isRecording ? " is-rec" : "")}
          onClick={function () {
            dispatch(setRecording(!transport.isRecording));
          }}
        >
          <Circle size={15} />
        </button>

        <DraggableBpm
          value={transport.bpm}
          min={40}
          max={300}
          onChange={function (next) {
            dispatch(setBpm(next));
          }}
        />

        <div className="mode-toggle">
          <button
            className={transport.mode === "pattern" ? "is-active" : ""}
            onKeyDown={suppressModeToggleSpace}
            onKeyUp={suppressModeToggleSpace}
            onClick={function () {
              dispatch(setTransportMode("pattern"));
            }}
          >
            Pattern
          </button>
          <button
            className={transport.mode === "song" ? "is-active" : ""}
            onKeyDown={suppressModeToggleSpace}
            onKeyUp={suppressModeToggleSpace}
            onClick={function () {
              dispatch(setTransportMode("song"));
            }}
          >
            Song
          </button>
        </div>

        <div
          ref={themeMenuRef}
          className={
            "theme-picker rack-modern-select" + (isThemeMenuOpen ? " is-open" : "")
          }
          title="App theme"
        >
          <button
            type="button"
            className="rack-modern-select-trigger"
            onClick={function () {
              setIsThemeMenuOpen(function (value) {
                return !value;
              });
            }}
          >
            <Palette size={14} />
            <span className="rack-modern-select-value">
              {THEME_OPTIONS.find(function (option) {
                return option.value === activeTheme;
              })?.label || "Theme"}
            </span>
            <span className="rack-modern-select-caret">v</span>
          </button>
          {isThemeMenuOpen ? (
            <div className="rack-modern-select-dropdown">
              {THEME_OPTIONS.map(function (option) {
                const isActive = option.value === activeTheme;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      "rack-modern-select-option" + (isActive ? " is-active" : "")
                    }
                    onClick={function () {
                      dispatch(setTheme(option.value));
                      setIsThemeMenuOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <input
          ref={projectFileInputRef}
          type="file"
          accept=".os,application/json,text/json"
          style={{ display: "none" }}
          onChange={function (event) {
            void onProjectFileSelected(event);
          }}
        />
      </div>

      <div className="transport-window-toggles">
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("playlist"));
          }}
        >
          <Rows3 size={14} />
          Playlist
        </button>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("channelRack"));
          }}
        >
          <Grid2X2 size={14} />
          Channel Rack
        </button>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("patternList"));
          }}
        >
          <ListMusic size={14} />
          Patterns
        </button>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("pianoRoll"));
          }}
        >
          <Music2 size={14} />
          Piano Roll
        </button>
        <button
          className="transport-btn small"
          onClick={function () {
            dispatch(openWindow("mixer"));
          }}
        >
          <SlidersHorizontal size={14} />
          Mixer
        </button>
      </div>
    </header>
  );
}

