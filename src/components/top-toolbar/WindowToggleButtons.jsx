import {
  Grid2X2,
  ListMusic,
  Music2,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { useDispatch } from "react-redux";
import { openWindow } from "../../store";

const WINDOW_BUTTONS = [
  { id: "playlist", label: "Playlist", Icon: Rows3 },
  { id: "channelRack", label: "Channel Rack", Icon: Grid2X2 },
  { id: "patternList", label: "Patterns", Icon: ListMusic },
  { id: "pianoRoll", label: "Piano Roll", Icon: Music2 },
  { id: "mixer", label: "Mixer", Icon: SlidersHorizontal },
];

export function WindowToggleButtons() {
  const dispatch = useDispatch();

  return (
    <div className="transport-window-toggles">
      {WINDOW_BUTTONS.map(function (windowButton) {
        const IconComponent = windowButton.Icon;
        return (
          <button
            key={windowButton.id}
            className="transport-btn small"
            onClick={function () {
              dispatch(openWindow(windowButton.id));
            }}
          >
            <IconComponent size={14} />
            {windowButton.label}
          </button>
        );
      })}
    </div>
  );
}
