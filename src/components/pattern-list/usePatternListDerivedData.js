import { useMemo } from "react";

// Provides memoized Pattern List view data derived from patterns/clips/selection.
export function usePatternListDerivedData({ patterns, clips, selectedPatternIds }) {
  const clipCountByPattern = useMemo(function () {
    return clips.reduce(function (acc, clip) {
      acc[clip.patternId] = (acc[clip.patternId] || 0) + 1;
      return acc;
    }, {});
  }, [clips]);

  const selectedIdSet = useMemo(function () {
    return new Set(selectedPatternIds);
  }, [selectedPatternIds]);

  const orderedSelectedPatternIds = useMemo(
    function () {
      return patterns
        .filter(function (pattern) {
          return selectedIdSet.has(pattern.id);
        })
        .map(function (pattern) {
          return pattern.id;
        });
    },
    [patterns, selectedIdSet],
  );

  return {
    clipCountByPattern,
    selectedIdSet,
    orderedSelectedPatternIds,
  };
}
