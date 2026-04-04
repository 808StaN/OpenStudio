import {
  Circle,
  Grid2X2,
  ListMusic,
  Music2,
  Play,
  Rows3,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  openWindow,
  setBpm,
  setPlaying,
  setRecording,
  setTransportMode,
} from "../store";

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
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });

  return (
    <header className="transport-shell">
      <div className="transport-main">
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
