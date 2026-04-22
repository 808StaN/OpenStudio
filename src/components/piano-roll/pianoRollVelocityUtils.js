// Convert pointer Y position into 0-100 velocity percent for the velocity lane.
export const getVelocityPercentFromClientY = function ({
  clientY,
  laneRect,
  clampFn,
}) {
  if (!laneRect) {
    return 0;
  }

  const laneHeight = Math.max(1, laneRect.height);
  const y = clampFn(clientY - laneRect.top, 0, laneHeight);
  const ratio = 1 - y / laneHeight;
  return Math.round(clampFn(ratio * 100, 0, 100));
};

// Resolve note candidates for velocity editing from pointer X in the lane.
// It prefers notes covering the pointer, then fallback note, then nearest note center.
export const findVelocityCandidatesAtClientX = function ({
  clientX,
  velocityWrapElement,
  selectedNotes,
  pianoNotes,
  stepWidth,
  patternLength,
  clampFn,
  fallbackNote,
  getSelectionId,
}) {
  if (!velocityWrapElement) {
    return fallbackNote ? [fallbackNote] : [];
  }

  const candidateNotes = selectedNotes.length > 0 ? selectedNotes : pianoNotes;
  if (candidateNotes.length === 0) {
    return [];
  }

  const rect = velocityWrapElement.getBoundingClientRect();
  const worldX = clientX - rect.left + Number(velocityWrapElement.scrollLeft || 0);
  const stepPosition = clampFn(worldX / Math.max(1, stepWidth), 0, patternLength);

  const covering = candidateNotes.filter(function (item) {
    const noteStart = Number(item.start || 0);
    const noteEnd = noteStart + Math.max(0.0625, Number(item.length || 1));
    return stepPosition >= noteStart && stepPosition <= noteEnd;
  });
  if (covering.length > 0) {
    return covering;
  }

  if (
    fallbackNote &&
    candidateNotes.some(function (item) {
      return getSelectionId(item) === getSelectionId(fallbackNote);
    })
  ) {
    return [fallbackNote];
  }

  const nearest = candidateNotes.reduce(function (best, item) {
    const center = Number(item.start || 0) + Number(item.length || 1) * 0.5;
    const distance = Math.abs(center - stepPosition);
    if (!best || distance < best.distance) {
      return {
        note: item,
        distance,
      };
    }
    return best;
  }, null);

  return nearest ? [nearest.note] : [];
};
