import {
  Circle,
  Download,
  FilePlus2,
  FolderOpen,
  Play,
  Save,
  Square,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { DraggableBpm } from "./top-toolbar/DraggableBpm";
import { ThemePicker } from "./top-toolbar/ThemePicker";
import { useProjectFileActions } from "./top-toolbar/useProjectFileActions";
import { WindowToggleButtons } from "./top-toolbar/WindowToggleButtons";
import {
  openWindow,
  resetToDefaultProject,
  setBpm,
  setPlaying,
  setRecording,
  setTransportMode,
  setWindowRect,
  store,
  toggleWindowMaximize,
} from "../store";

export function TopToolbar() {
  const dispatch = useDispatch();
  const {
    projectFileInputRef,
    onSaveProjectClick,
    onLoadProjectClick,
    onProjectFileSelected,
  } = useProjectFileActions();
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });

  return (
    <header className="transport-shell">
      <div className="transport-main">
        <button
          className="transport-btn small"
          onClick={function () {
            // Keep project reset behavior intact while preserving channel rack centering.
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
            onClick={function () {
              dispatch(setTransportMode("pattern"));
            }}
          >
            Pattern
          </button>
          <button
            className={transport.mode === "song" ? "is-active" : ""}
            onClick={function () {
              dispatch(setTransportMode("song"));
            }}
          >
            Song
          </button>
        </div>

        <ThemePicker />
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

      <WindowToggleButtons />
    </header>
  );
}

