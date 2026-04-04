let activePatternIds = [];

export function setPatternDragSession(patternIds) {
  activePatternIds = Array.isArray(patternIds)
    ? patternIds
        .map(function (patternId) {
          return String(patternId || "").trim();
        })
        .filter(Boolean)
    : [];
}

export function getPatternDragSession() {
  return activePatternIds.slice();
}

export function clearPatternDragSession() {
  activePatternIds = [];
}
