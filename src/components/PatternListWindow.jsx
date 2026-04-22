import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearPatternDragSession,
  setPatternDragSession,
} from "../utils/patternDragSession";
import {
  clamp,
  hexToRgb,
  hsvToRgb,
  rgbToHex,
  rgbToHsv,
} from "./pattern-list/patternListColorUtils";
import { PatternListRow } from "./pattern-list/PatternListRow";
import {
  createPattern,
  duplicatePatterns,
  renamePattern,
  setActivePattern,
  setPatternClipboard,
  setPatternColor,
} from "../store";

const DEFAULT_PATTERN_COLOR = "#4bef9f";
const PATTERN_DRAG_MIME = "application/x-daw-pattern";

export function PatternListWindow() {
  const dispatch = useDispatch();
  const patternListRef = useRef(null);
  const [openColorPatternId, setOpenColorPatternId] = useState(null);
  const [draggingPatternId, setDraggingPatternId] = useState(null);
  const [selectedPatternIds, setSelectedPatternIds] = useState([]);
  const [isPointerOverList, setIsPointerOverList] = useState(false);
  const [pickerStateByPatternId, setPickerStateByPatternId] = useState({});
  const colorRafMapRef = useRef(new Map());
  const pendingColorMapRef = useRef(new Map());

  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const clips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });
  const clipboardPatternIds = useSelector(function (state) {
    return state.daw.ui.patternClipboardIds;
  });

  const clipCountByPattern = clips.reduce(function (acc, clip) {
    acc[clip.patternId] = (acc[clip.patternId] || 0) + 1;
    return acc;
  }, {});
  const selectedIdSet = new Set(selectedPatternIds);
  const orderedSelectedPatternIds = patterns
    .filter(function (pattern) {
      return selectedIdSet.has(pattern.id);
    })
    .map(function (pattern) {
      return pattern.id;
    });

  useEffect(
    function () {
      const activeSelectionId =
        orderedSelectedPatternIds.length > 0
          ? orderedSelectedPatternIds[orderedSelectedPatternIds.length - 1]
          : null;

      window.dispatchEvent(
        new CustomEvent("openstudio:pattern-list-selection-changed", {
          detail: {
            patternId: activeSelectionId,
          },
        }),
      );
    },
    [orderedSelectedPatternIds],
  );

  useEffect(function () {
    return function () {
      colorRafMapRef.current.forEach(function (rafId) {
        cancelAnimationFrame(rafId);
      });
      colorRafMapRef.current.clear();
      pendingColorMapRef.current.clear();
      clearPatternDragSession();
    };
  }, []);

  useEffect(function () {
    const onPlaylistAudioFocus = function () {
      setSelectedPatternIds([]);
      setOpenColorPatternId(null);
    };

    const onPlaylistPatternFocus = function (event) {
      const patternId = String(event?.detail?.patternId || "").trim();
      if (!patternId) {
        return;
      }

      setSelectedPatternIds(function (prev) {
        return prev.length === 1 && prev[0] === patternId ? prev : [patternId];
      });
    };

    window.addEventListener(
      "openstudio:playlist-audio-focus",
      onPlaylistAudioFocus,
    );
    window.addEventListener(
      "openstudio:playlist-pattern-focus",
      onPlaylistPatternFocus,
    );
    return function () {
      window.removeEventListener(
        "openstudio:playlist-audio-focus",
        onPlaylistAudioFocus,
      );
      window.removeEventListener(
        "openstudio:playlist-pattern-focus",
        onPlaylistPatternFocus,
      );
    };
  }, []);

  useEffect(
    function () {
      const validPatternIds = new Set(
        patterns.map(function (pattern) {
          return pattern.id;
        }),
      );

      setSelectedPatternIds(function (prev) {
        const filtered = prev.filter(function (patternId) {
          return validPatternIds.has(patternId);
        });

        return filtered.length === prev.length ? prev : filtered;
      });
    },
    [patterns],
  );

  useEffect(
    function () {
      const shouldIgnoreShortcutTarget = function (target) {
        if (!(target instanceof HTMLElement)) {
          return false;
        }

        if (target.isContentEditable) {
          return true;
        }

        return Boolean(
          target.closest("input, textarea, select, [contenteditable='true']"),
        );
      };

      const onKeyDown = function (event) {
        const isModifierPressed = event.ctrlKey || event.metaKey;
        const isCopyShortcut =
          isModifierPressed && !event.shiftKey && event.code === "KeyC";
        const isPasteShortcut =
          isModifierPressed && !event.shiftKey && event.code === "KeyV";

        if (!isCopyShortcut && !isPasteShortcut) {
          return;
        }

        const root = patternListRef.current;
        const activeElement = document.activeElement;
        const hasContext =
          isPointerOverList ||
          (root instanceof HTMLElement && root.contains(activeElement));

        if (!hasContext || shouldIgnoreShortcutTarget(event.target)) {
          return;
        }

        if (isCopyShortcut) {
          if (orderedSelectedPatternIds.length === 0) {
            return;
          }

          event.preventDefault();
          dispatch(
            setPatternClipboard({
              patternIds: orderedSelectedPatternIds,
            }),
          );
          return;
        }

        if (clipboardPatternIds.length === 0) {
          return;
        }

        event.preventDefault();
        dispatch(
          duplicatePatterns({
            patternIds: clipboardPatternIds,
          }),
        );
      };

      window.addEventListener("keydown", onKeyDown);
      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      clipboardPatternIds,
      dispatch,
      isPointerOverList,
      orderedSelectedPatternIds,
    ],
  );

  useEffect(function () {
    const onDocumentMouseDown = function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".pattern-list-color-wrap")) {
        return;
      }

      setOpenColorPatternId(null);
    };

    window.addEventListener("mousedown", onDocumentMouseDown);
    return function () {
      window.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, []);

  const queuePatternColorUpdate = function (patternId, color) {
    pendingColorMapRef.current.set(patternId, color);

    if (colorRafMapRef.current.has(patternId)) {
      return;
    }

    const rafId = requestAnimationFrame(function () {
      colorRafMapRef.current.delete(patternId);
      const nextColor = pendingColorMapRef.current.get(patternId);
      pendingColorMapRef.current.delete(patternId);
      if (!nextColor) {
        return;
      }

      dispatch(
        setPatternColor({
          patternId,
          color: nextColor,
        }),
      );
    });

    colorRafMapRef.current.set(patternId, rafId);
  };

  const getPickerStateForPattern = function (pattern) {
    const patternId = pattern.id;
    const existing = pickerStateByPatternId[patternId];
    if (existing) {
      return existing;
    }

    return rgbToHsv(hexToRgb(pattern.color || DEFAULT_PATTERN_COLOR));
  };

  const updatePickerColor = function (pattern, nextPartial) {
    const patternId = pattern.id;
    const current = getPickerStateForPattern(pattern);
    const next = {
      h: clamp(Number(nextPartial.h ?? current.h), 0, 360),
      s: clamp(Number(nextPartial.s ?? current.s), 0, 1),
      v: clamp(Number(nextPartial.v ?? current.v), 0, 1),
    };

    setPickerStateByPatternId(function (prev) {
      return {
        ...prev,
        [patternId]: next,
      };
    });

    const hex = rgbToHex(hsvToRgb(next.h, next.s, next.v));
    queuePatternColorUpdate(patternId, hex);
  };

  const startSvDrag = function (event, pattern) {
    event.preventDefault();
    event.stopPropagation();

    const element = event.currentTarget;

    const updateFromPointer = function (pointerEvent) {
      const rect = element.getBoundingClientRect();
      const x = clamp(pointerEvent.clientX - rect.left, 0, rect.width);
      const y = clamp(pointerEvent.clientY - rect.top, 0, rect.height);
      const nextS = rect.width > 0 ? x / rect.width : 0;
      const nextV = rect.height > 0 ? 1 - y / rect.height : 0;

      updatePickerColor(pattern, {
        s: nextS,
        v: nextV,
      });
    };

    updateFromPointer(event);

    const onMouseMove = function (moveEvent) {
      updateFromPointer(moveEvent);
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startHueDrag = function (event, pattern) {
    event.preventDefault();
    event.stopPropagation();

    const element = event.currentTarget;

    const updateFromPointer = function (pointerEvent) {
      const rect = element.getBoundingClientRect();
      const x = clamp(pointerEvent.clientX - rect.left, 0, rect.width);
      const nextHue = rect.width > 0 ? (x / rect.width) * 360 : 0;

      updatePickerColor(pattern, {
        h: nextHue,
      });
    };

    updateFromPointer(event);

    const onMouseMove = function (moveEvent) {
      updateFromPointer(moveEvent);
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const shouldStartPatternDrag = function (target) {
    if (!(target instanceof HTMLElement)) {
      return true;
    }

    return !target.closest(
      "input, textarea, select, .pattern-list-color-wrap, .pattern-list-color-popover",
    );
  };

  const onPatternRowClick = function (event, patternId) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(
        "input, textarea, select, .pattern-list-color-wrap, .pattern-list-color-popover",
      )
    ) {
      return;
    }

    const isMultiSelect = event.ctrlKey || event.metaKey;
    if (isMultiSelect) {
      setSelectedPatternIds(function (prev) {
        if (prev.includes(patternId)) {
          return prev.filter(function (id) {
            return id !== patternId;
          });
        }

        return [...prev, patternId];
      });
      dispatch(setActivePattern(patternId));
      return;
    }

    setSelectedPatternIds([patternId]);
    dispatch(setActivePattern(patternId));
  };

  const onPatternRowDragStart = function (event, pattern) {
    if (!shouldStartPatternDrag(event.target)) {
      event.preventDefault();
      return;
    }

    const draggedPatternIds = selectedPatternIds.includes(pattern.id)
      ? orderedSelectedPatternIds
      : [pattern.id];

    const payload = JSON.stringify({
      patternId: pattern.id,
      patternIds: draggedPatternIds,
    });

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(PATTERN_DRAG_MIME, payload);
    event.dataTransfer.setData("text/plain", pattern.id);
    setPatternDragSession(draggedPatternIds);
    setOpenColorPatternId(null);
    setSelectedPatternIds(function (prev) {
      return prev.includes(pattern.id) ? prev : [pattern.id];
    });
    setDraggingPatternId(pattern.id);
  };

  const onPatternRowDragEnd = function () {
    clearPatternDragSession();
    setDraggingPatternId(null);
  };

  const onPatternRename = function (patternId, name) {
    dispatch(
      renamePattern({
        patternId,
        name,
      }),
    );
  };

  return (
    <section
      ref={patternListRef}
      className="pattern-list-shell"
      onMouseEnter={function () {
        setIsPointerOverList(true);
      }}
      onMouseLeave={function () {
        setIsPointerOverList(false);
      }}
    >
      <header className="pattern-list-header">
        <strong>Project Patterns</strong>
        <button
          type="button"
          onClick={function () {
            dispatch(createPattern());
          }}
        >
          + New
        </button>
      </header>

      <div className="pattern-list-body">
        {patterns.map(function (pattern) {
          return (
            <PatternListRow
              key={pattern.id}
              pattern={pattern}
              isSelected={selectedIdSet.has(pattern.id)}
              isDragging={draggingPatternId === pattern.id}
              clipCount={clipCountByPattern[pattern.id] || 0}
              openColorPatternId={openColorPatternId}
              defaultPatternColor={DEFAULT_PATTERN_COLOR}
              getPickerStateForPattern={getPickerStateForPattern}
              setOpenColorPatternId={setOpenColorPatternId}
              startSvDrag={startSvDrag}
              startHueDrag={startHueDrag}
              updatePickerColor={updatePickerColor}
              onRowClick={onPatternRowClick}
              onRowDragStart={onPatternRowDragStart}
              onRowDragEnd={onPatternRowDragEnd}
              onRename={onPatternRename}
            />
          );
        })}
      </div>
    </section>
  );
}
