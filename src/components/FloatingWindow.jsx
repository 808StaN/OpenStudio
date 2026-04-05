import { Maximize2, Minimize2, X } from "lucide-react";
import { Rnd } from "react-rnd";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  bringWindowToFront,
  closeWindow,
  setWindowRect,
  toggleWindowMaximize,
} from "../store";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function FloatingWindow({
  id,
  title,
  minWidth = 420,
  minHeight = 220,
  modal = false,
  centerOnOpen = false,
  disableDrag = false,
  disableResize = false,
  hideMaximize = false,
  children,
}) {
  const dispatch = useDispatch();
  const win = useSelector(function (state) {
    return state.daw.ui.windows[id];
  });

  useEffect(
    function () {
      if (!win?.open) {
        return;
      }

      const keepWindowInsideWorkspace = function () {
        const workspace = document.querySelector(".workspace-surface");
        const viewportWidth = Math.max(
          1,
          workspace?.clientWidth || window.innerWidth,
        );
        const viewportHeight = Math.max(
          1,
          workspace?.clientHeight || window.innerHeight,
        );

        const effectiveMinWidth = Math.min(minWidth, viewportWidth);
        const effectiveMinHeight = Math.min(minHeight, viewportHeight);
        const nextWidth = clamp(win.width, effectiveMinWidth, viewportWidth);
        const nextHeight = clamp(
          win.height,
          effectiveMinHeight,
          viewportHeight,
        );
        const maxX = Math.max(0, viewportWidth - nextWidth);
        const maxY = Math.max(0, viewportHeight - nextHeight);
        const nextX = clamp(win.x, 0, maxX);
        const nextY = clamp(win.y, 0, maxY);

        if (
          nextX === win.x &&
          nextY === win.y &&
          nextWidth === win.width &&
          nextHeight === win.height
        ) {
          return;
        }

        dispatch(
          setWindowRect({
            id,
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
          }),
        );
      };

      keepWindowInsideWorkspace();
      window.addEventListener("resize", keepWindowInsideWorkspace);

      return function () {
        window.removeEventListener("resize", keepWindowInsideWorkspace);
      };
    },
    [
      dispatch,
      id,
      minHeight,
      minWidth,
      win?.height,
      win?.open,
      win?.width,
      win?.x,
      win?.y,
    ],
  );

  useEffect(
    function () {
      if (!win?.open || !centerOnOpen) {
        return;
      }

      const centerWindow = function () {
        const workspace = document.querySelector(".workspace-surface");
        const viewportWidth = workspace?.clientWidth || window.innerWidth;
        const viewportHeight = workspace?.clientHeight || window.innerHeight;
        const nextX = Math.max(0, Math.round((viewportWidth - win.width) / 2));
        const nextY = Math.max(
          0,
          Math.round((viewportHeight - win.height) / 2),
        );

        dispatch(
          setWindowRect({
            id,
            x: nextX,
            y: nextY,
            width: win.width,
            height: win.height,
          }),
        );
      };

      centerWindow();
      window.addEventListener("resize", centerWindow);

      return function () {
        window.removeEventListener("resize", centerWindow);
      };
    },
    [centerOnOpen, dispatch, id, win?.height, win?.open, win?.width],
  );

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
    if (modal || disableResize || hideMaximize) {
      return;
    }

    if (event.target.closest(".window-controls")) {
      return;
    }

    onToggleMaximize(event);
  };

  return (
    <>
      {modal ? (
        <div
          className="window-modal-backdrop"
          style={{ zIndex: Math.max(1, win.z - 1) }}
          onMouseDown={function (event) {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ) : null}

      <Rnd
        size={{ width: win.width, height: win.height }}
        position={{ x: win.x, y: win.y }}
        bounds="parent"
        disableDragging={Boolean(win.isMaximized) || disableDrag || modal}
        enableResizing={!win.isMaximized && !disableResize && !modal}
        minWidth={minWidth}
        minHeight={minHeight}
        dragHandleClassName="window-title"
        cancel=".window-controls, .window-control-btn"
        className="window-frame"
        style={{ zIndex: modal ? Math.max(1000, win.z) : win.z }}
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
            {!modal && !hideMaximize ? (
              <button
                className="window-control-btn"
                onClick={onToggleMaximize}
                title={win.isMaximized ? "Restore" : "Fullscreen"}
                aria-label={win.isMaximized ? "Restore" : "Fullscreen"}
              >
                {win.isMaximized ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </button>
            ) : null}

            <button
              className="window-control-btn close"
              onClick={onCloseWindow}
              title="Close"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="window-content">{children}</div>
      </Rnd>
    </>
  );
}
