// Normalize pattern id arrays: trim, drop unknown ids, and remove duplicates.
export const normalizePatternIds = function (rawIds, patternsById) {
  const seen = new Set();

  return (rawIds || [])
    .map(function (patternId) {
      return String(patternId || "").trim();
    })
    .filter(function (patternId) {
      if (!patternId || !patternsById?.[patternId] || seen.has(patternId)) {
        return false;
      }

      seen.add(patternId);
      return true;
    });
};

// Read dragged pattern ids from DataTransfer payloads.
export const getDraggedPatternIds = function ({
  event,
  patternDragMime,
  patternsById,
}) {
  const rawPayload = event.dataTransfer?.getData(patternDragMime);
  if (rawPayload) {
    try {
      const payload = JSON.parse(rawPayload);
      const fromArray = normalizePatternIds(payload.patternIds, patternsById);
      if (fromArray.length > 0) {
        return fromArray;
      }

      const patternId = String(payload.patternId || "").trim();
      if (patternId && patternsById?.[patternId]) {
        return [patternId];
      }
    } catch {
      return [];
    }
  }

  const textPatternId = String(
    event.dataTransfer?.getData("text/plain") || "",
  ).trim();
  if (textPatternId && patternsById?.[textPatternId]) {
    return [textPatternId];
  }

  return [];
};

// Prefer multi-pattern session drag data when available, otherwise fall back to DataTransfer.
export const getDraggedPatternIdsWithFallback = function ({
  event,
  patternDragMime,
  patternsById,
  sessionPatternIds,
}) {
  const idsFromSession = normalizePatternIds(sessionPatternIds, patternsById);
  const idsFromDataTransfer = getDraggedPatternIds({
    event,
    patternDragMime,
    patternsById,
  });

  if (idsFromSession.length > 1) {
    return idsFromSession;
  }

  if (idsFromDataTransfer.length > 0) {
    return idsFromDataTransfer;
  }

  return idsFromSession;
};

// Detect if current drag operation can place one or more pattern clips.
export const hasDraggedPatternData = function ({
  event,
  patternDragMime,
  patternsById,
  sessionPatternIds,
}) {
  const types = Array.from(event.dataTransfer?.types || []);
  if (types.includes(patternDragMime)) {
    return true;
  }

  return normalizePatternIds(sessionPatternIds, patternsById).length > 0;
};

// Read dragged sample payload from dedicated mime or plain text fallback.
export const getDraggedSamplePayload = function ({ event, sampleDragMime }) {
  const rawPayloads = [
    String(event.dataTransfer?.getData(sampleDragMime) || ""),
    String(event.dataTransfer?.getData("text/plain") || ""),
  ].filter(Boolean);

  for (let index = 0; index < rawPayloads.length; index += 1) {
    try {
      const payload = JSON.parse(rawPayloads[index]);
      const samplePath = String(payload.samplePath || "").trim();
      if (!samplePath) {
        continue;
      }

      return {
        samplePath,
        clipName: String(payload.file || "").trim() || "Audio",
      };
    } catch {
      continue;
    }
  }

  return null;
};

// Detect if drag includes a sample payload.
export const hasDraggedSampleData = function ({ event, sampleDragMime }) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes(sampleDragMime);
};

// Convert pointer position into a snapped playlist bar start value.
export const resolveBarStartFromPointer = function ({
  event,
  trackElement,
  playlistBarCount,
  snapBarSize,
  clampFn,
  quantizeFn,
}) {
  const rect = trackElement.getBoundingClientRect();
  const x = clampFn(event.clientX - rect.left, 0, rect.width);
  const rawBarStart = (x / Math.max(1, rect.width)) * playlistBarCount + 1;
  const snappedBarStart = quantizeFn(rawBarStart, snapBarSize);
  return clampFn(snappedBarStart, 1, playlistBarCount);
};
