import { useEffect } from "react";

// Keeps playlist-local "last selected pattern" ref in sync with Pattern List events.
// This allows drop/insert operations to use most recent explicit user selection.
export const usePlaylistPatternSelectionRef = function (
  patternSelectionForInsertRef,
) {
  useEffect(function () {
    const onPatternSelectionChanged = function (event) {
      const nextPatternId = String(event?.detail?.patternId || "").trim();
      patternSelectionForInsertRef.current = nextPatternId || null;
    };

    window.addEventListener(
      "openstudio:pattern-list-selection-changed",
      onPatternSelectionChanged,
    );

    return function () {
      window.removeEventListener(
        "openstudio:pattern-list-selection-changed",
        onPatternSelectionChanged,
      );
    };
  }, [patternSelectionForInsertRef]);
};
