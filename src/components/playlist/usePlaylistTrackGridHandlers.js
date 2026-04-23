// Builds per-track grid event handlers for click/drag/drop interactions.
// Keeping this outside PlaylistWindow reduces map() inline complexity.
export const usePlaylistTrackGridHandlers = function ({
  patternsById,
  patternSelectionForInsertRef,
  lastTouchedAudioClipRef,
  dispatch,
  setLastHoverPlacement,
  setDropPreview,
  addPlaylistPatternClipAction,
  addPlaylistAudioClipAction,
  hasDraggedSampleData,
  getDraggedSamplePayload,
  hasDraggedPatternData,
  resolveBarStartFromPointer,
  buildDropPlacements,
  normalizePatternIds,
  getDraggedPatternIdsWithFallback,
  placeAudioClipOnTrack,
  placePatternsOnTrack,
  dropPreview,
}) {
  const createTrackGridHandlers = function (trackId) {
    const onTrackGridMouseDown = function (event) {
      if (event.button !== 0) {
        return;
      }

      const hasClipTarget = event.target.closest(".clip");
      if (hasClipTarget) {
        return;
      }

      const barStart = resolveBarStartFromPointer(event, event.currentTarget);
      setLastHoverPlacement({
        trackId,
        barStart,
      });

      const selectedPatternId = patternSelectionForInsertRef.current;
      if (selectedPatternId && patternsById[selectedPatternId]) {
        dispatch(
          addPlaylistPatternClipAction({
            patternId: selectedPatternId,
            trackId,
            barStart,
          }),
        );
        return;
      }

      const touchedAudioClip = lastTouchedAudioClipRef.current;
      if (!touchedAudioClip?.samplePath) {
        return;
      }

      dispatch(
        addPlaylistAudioClipAction({
          trackId,
          barStart,
          barLength: touchedAudioClip.barLength,
          samplePath: touchedAudioClip.samplePath,
          clipName: touchedAudioClip.audioName,
          channelId: touchedAudioClip.channelId,
          sourceOffsetSteps: touchedAudioClip.sourceOffsetSteps,
        }),
      );
    };

    const onTrackGridDragOver = function (event) {
      const acceptsSample = hasDraggedSampleData(event);
      const draggedSample = acceptsSample ? getDraggedSamplePayload(event) : null;
      const acceptsPattern = hasDraggedPatternData(event);

      if (!acceptsSample && !acceptsPattern) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";

      const barStart = resolveBarStartFromPointer(event, event.currentTarget);

      const placements = draggedSample
        ? [
            {
              clipType: "audio",
              trackId,
              barStart,
              barLength: 2,
              clipName: draggedSample.clipName,
              samplePath: draggedSample.samplePath,
            },
          ]
        : acceptsSample
          ? [
              {
                clipType: "audio",
                trackId,
                barStart,
                barLength: 2,
                clipName: "Audio",
                samplePath: "",
              },
            ]
          : buildDropPlacements(
              trackId,
              barStart,
              normalizePatternIds(getDraggedPatternIdsWithFallback(event)),
            ).map(function (placement) {
              return {
                ...placement,
                clipType: "pattern",
              };
            });

      if (placements.length === 0) {
        return;
      }

      setDropPreview(function (prev) {
        const samePlacements =
          prev &&
          prev.placements.length === placements.length &&
          prev.placements.every(function (item, index) {
            const next = placements[index];
            return (
              item.trackId === next.trackId &&
              item.barStart === next.barStart &&
              item.barLength === next.barLength &&
              item.clipType === next.clipType &&
              item.patternId === next.patternId &&
              item.samplePath === next.samplePath
            );
          });

        if (
          prev &&
          prev.trackId === trackId &&
          samePlacements &&
          Math.abs(prev.barStart - barStart) <= 0.0001
        ) {
          return prev;
        }

        return {
          trackId,
          barStart,
          placements,
        };
      });
    };

    const onTrackGridMouseMove = function (event) {
      const barStart = resolveBarStartFromPointer(event, event.currentTarget);
      setLastHoverPlacement(function (prev) {
        if (
          prev &&
          prev.trackId === trackId &&
          Math.abs(prev.barStart - barStart) <= 0.0001
        ) {
          return prev;
        }

        return {
          trackId,
          barStart,
        };
      });
    };

    const onTrackGridDragLeave = function (event) {
      const pointerX = event.clientX;
      const pointerY = event.clientY;

      requestAnimationFrame(function () {
        const hoveredElement = document.elementFromPoint(pointerX, pointerY);
        if (hoveredElement?.closest(".track-grid")) {
          return;
        }

        setDropPreview(function (prev) {
          if (!prev || prev.trackId !== trackId) {
            return prev;
          }

          return null;
        });
      });
    };

    const onTrackGridDrop = function (event) {
      const acceptsSample = hasDraggedSampleData(event);
      const draggedSample = acceptsSample ? getDraggedSamplePayload(event) : null;
      const acceptsPattern = hasDraggedPatternData(event);

      if (!acceptsSample && !acceptsPattern) {
        return;
      }

      event.preventDefault();

      const barStart = resolveBarStartFromPointer(event, event.currentTarget);

      if (acceptsSample) {
        if (!draggedSample) {
          setDropPreview(null);
          return;
        }

        placeAudioClipOnTrack(trackId, barStart, draggedSample);
      } else {
        const patternIds = normalizePatternIds(
          getDraggedPatternIdsWithFallback(event),
        );
        if (patternIds.length === 0) {
          return;
        }

        placePatternsOnTrack(trackId, barStart, patternIds);
      }

      setDropPreview(null);
    };

    const dropPlacementsOnTrack = (dropPreview?.placements || []).filter(
      function (placement) {
        return placement.trackId === trackId;
      },
    );

    return {
      onTrackGridMouseDown,
      onTrackGridMouseMove,
      onTrackGridDragOver,
      onTrackGridDragLeave,
      onTrackGridDrop,
      dropPlacementsOnTrack,
    };
  };

  return {
    createTrackGridHandlers,
  };
};
