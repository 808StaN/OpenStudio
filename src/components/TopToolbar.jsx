import { useState } from "react";
import { Circle, Play, Square } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { DraggableBpm } from "./top-toolbar/DraggableBpm";
import { ProjectMenu } from "./top-toolbar/ProjectMenu";
import { OptionsMenu } from "./top-toolbar/OptionsMenu";
import { WindowToggleButtons } from "./top-toolbar/WindowToggleButtons";
import { UserMenu } from "./auth/UserMenu";
import { AuthDialog } from "./auth/AuthDialog";
import {
  setBpm,
  setPlaying,
  setRecording,
  setTransportMode,
} from "../store";

export function TopToolbar() {
  const dispatch = useDispatch();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });

  return (
    <header className="transport-shell">
      <div className="transport-main">
        {/* Left group: project actions, options, auth */}
        <div className="transport-left">
          <ProjectMenu />
          <OptionsMenu />
          <UserMenu onOpenAuth={function () { setAuthDialogOpen(true); }} />
        </div>

        {/* Center group: transport controls */}
        <div className="transport-center">
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
        </div>

        {/* Right group: window toggles (mirrors left so center stays true) */}
        <div className="transport-right">
          <WindowToggleButtons />
        </div>
      </div>

      {authDialogOpen ? (
        <AuthDialog onClose={function () { setAuthDialogOpen(false); }} />
      ) : null}
    </header>
  );
}
