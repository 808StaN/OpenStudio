import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearPatternDragSession,
  setPatternDragSession,
} from "../utils/patternDragSession";
import { PatternListRow } from "./pattern-list/PatternListRow";
import { usePatternColorPicker } from "./pattern-list/usePatternColorPicker";
import { usePatternListClipboardShortcuts } from "./pattern-list/usePatternListClipboardShortcuts";
import {
  createPattern,
  duplicatePatterns,
  renamePattern,
  setActivePattern,
  setPatternClipboard,
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

  const {
    getPickerStateForPattern,
    updatePickerColor,
    startSvDrag,
    startHueDrag,
  } = usePatternColorPicker({
    dispatch,
    defaultPatternColor: DEFAULT_PATTERN_COLOR,
  });

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

      // Selection must be pruned when patterns are removed externally.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPatternIds(function (prev) {
        const filtered = prev.filter(function (patternId) {
          return validPatternIds.has(patternId);
        });

        return filtered.length === prev.length ? prev : filtered;
      });
    },
    [patterns],
  );

  usePatternListClipboardShortcuts({
    patternListRef,
    isPointerOverList,
    orderedSelectedPatternIds,
    clipboardPatternIds,
    onCopyPatterns: function (patternIds) {
      dispatch(
        setPatternClipboard({
          patternIds,
        }),
      );
    },
    onPastePatterns: function (patternIds) {
      dispatch(
        duplicatePatterns({
          patternIds,
        }),
      );
    },
  });

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
