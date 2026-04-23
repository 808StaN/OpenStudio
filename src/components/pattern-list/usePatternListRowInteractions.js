import { useCallback } from "react";
import { clearPatternDragSession, setPatternDragSession } from "../../utils/patternDragSession";

const PATTERN_DRAG_MIME = "application/x-daw-pattern";

// Handles row click/drag interactions for Pattern List items.
export function usePatternListRowInteractions({
  selectedPatternIds,
  orderedSelectedPatternIds,
  setSelectedPatternIds,
  setOpenColorPatternId,
  setDraggingPatternId,
  dispatch,
  setActivePatternAction,
}) {
  const isInteractiveEditorTarget = function (target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      target.closest(
        "input, textarea, select, .pattern-list-color-wrap, .pattern-list-color-popover",
      ),
    );
  };

  const shouldStartPatternDrag = useCallback(function (target) {
    return !isInteractiveEditorTarget(target);
  }, []);

  const onPatternRowClick = useCallback(
    function (event, patternId) {
      if (isInteractiveEditorTarget(event.target)) {
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
        dispatch(setActivePatternAction(patternId));
        return;
      }

      setSelectedPatternIds([patternId]);
      dispatch(setActivePatternAction(patternId));
    },
    [dispatch, setActivePatternAction, setSelectedPatternIds],
  );

  const onPatternRowDragStart = useCallback(
    function (event, pattern) {
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
    },
    [
      orderedSelectedPatternIds,
      selectedPatternIds,
      setDraggingPatternId,
      setOpenColorPatternId,
      setSelectedPatternIds,
      shouldStartPatternDrag,
    ],
  );

  const onPatternRowDragEnd = useCallback(function () {
    clearPatternDragSession();
    setDraggingPatternId(null);
  }, [setDraggingPatternId]);

  return {
    shouldStartPatternDrag,
    onPatternRowClick,
    onPatternRowDragStart,
    onPatternRowDragEnd,
  };
}
