import { Maximize2, Minimize2, X } from "lucide-react";
import { Rnd } from "react-rnd";
import { useDispatch, useSelector } from "react-redux";
import {
  bringWindowToFront,
  closeWindow,
  setWindowRect,
  toggleWindowMaximize,
} from "../store";

export function FloatingWindow({
  id,
  title,
  minWidth = 420,
  minHeight = 220,
  children,
}) {
  const dispatch = useDispatch();
  const win = useSelector(function (state) {
    return state.daw.ui.windows[id];
  });

  if (!win || !win.open) {
    return null;
  }

  const onToggleMaximize = function (event) {
    event.stopPropagation();

    const workspaceElement = event.currentTarget.closest(".workspace-surface");
    const viewport = workspaceElement
      ? {
          width: workspaceElement.clientWidth,
          height: workspaceElement.clientHeight,
        }
      : {
          width: window.innerWidth,
          height: window.innerHeight,
        };

    dispatch(toggleWindowMaximize({ id, viewport }));
  };

  const onCloseWindow = function (event) {
    event.stopPropagation();
    dispatch(closeWindow(id));
  };

  const onTitleDoubleClick = function (event) {
    if (event.target.closest(".window-controls")) {
      return;
    }

    onToggleMaximize(event);
  };

  return (
    <Rnd
      size={{ width: win.width, height: win.height }}
      position={{ x: win.x, y: win.y }}
      disableDragging={Boolean(win.isMaximized)}
      enableResizing={!win.isMaximized}
      minWidth={minWidth}
      minHeight={minHeight}
      dragHandleClassName="window-title"
      cancel=".window-controls, .window-control-btn"
      className="window-frame"
      style={{ zIndex: win.z }}
      onMouseDown={function () {
        dispatch(bringWindowToFront(id));
      }}
      onDragStop={function (_event, data) {
        dispatch(
          setWindowRect({
            id,
            x: data.x,
            y: data.y,
            width: win.width,
            height: win.height,
          }),
        );
      }}
      onResizeStop={function (_event, _direction, ref, _delta, position) {
        dispatch(
          setWindowRect({
            id,
            x: position.x,
            y: position.y,
            width: parseInt(ref.style.width, 10),
            height: parseInt(ref.style.height, 10),
          }),
        );
      }}
    >
      <div className="window-title" onDoubleClick={onTitleDoubleClick}>
        <span className="window-title-text">{title}</span>

        <div className="window-controls">
          <button
            className="window-control-btn"
            onClick={onToggleMaximize}
            title={win.isMaximized ? "Przywroc" : "Fullscreen"}
            aria-label={win.isMaximized ? "Przywroc" : "Fullscreen"}
          >
            {win.isMaximized ? (
              <Minimize2 size={14} />
            ) : (
              <Maximize2 size={14} />
            )}
          </button>

          <button
            className="window-control-btn close"
            onClick={onCloseWindow}
            title="Zamknij"
            aria-label="Zamknij"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="window-content">{children}</div>
    </Rnd>
  );
}
