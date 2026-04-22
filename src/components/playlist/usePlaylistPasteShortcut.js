import { useEffect } from "react";

// Handle playlist-scoped Ctrl/Cmd+V paste behavior for patterns or audio clips.
export const usePlaylistPasteShortcut = function ({
  playlistShellRef,
  isPointerOverPlaylist,
  tracks,
  lastHoverPlacement,
  playlistBarCount,
  clipboardPatternIds,
  patternSelectionForInsertRef,
  normalizePatternIds,
  placePatternsOnTrack,
  lastTouchedAudioClipRef,
  clampFn,
  onPasteAudioClip,
}) {
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
        const isPasteShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          event.code === "KeyV";
        if (!isPasteShortcut) {
          return;
        }

        const root = playlistShellRef.current;
        const activeElement = document.activeElement;
        const hasContext =
          isPointerOverPlaylist ||
          (root instanceof HTMLElement && root.contains(activeElement));

        if (!hasContext || shouldIgnoreShortcutTarget(event.target)) {
          return;
        }

        const fallbackTrackId = tracks[0]?.id;
        const targetTrackId = lastHoverPlacement?.trackId || fallbackTrackId;
        if (!targetTrackId) {
          return;
        }

        const targetBarStart = clampFn(
          lastHoverPlacement?.barStart ?? 1,
          1,
          playlistBarCount,
        );

        const selectedPatternId = patternSelectionForInsertRef.current;
        if (selectedPatternId) {
          const patternIds = normalizePatternIds(clipboardPatternIds);
          const patternIdsToPaste =
            patternIds.length > 0
              ? patternIds
              : normalizePatternIds([selectedPatternId]);

          if (patternIdsToPaste.length > 0) {
            event.preventDefault();
            placePatternsOnTrack(targetTrackId, targetBarStart, patternIdsToPaste);
            return;
          }
        }

        const touchedAudioClip = lastTouchedAudioClipRef.current;
        if (!touchedAudioClip?.samplePath) {
          return;
        }

        event.preventDefault();
        onPasteAudioClip({
          trackId: targetTrackId,
          barStart: targetBarStart,
          barLength: touchedAudioClip.barLength,
          samplePath: touchedAudioClip.samplePath,
          clipName: touchedAudioClip.audioName,
          channelId: touchedAudioClip.channelId,
          sourceOffsetSteps: touchedAudioClip.sourceOffsetSteps,
        });
      };

      window.addEventListener("keydown", onKeyDown);
      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      clipboardPatternIds,
      isPointerOverPlaylist,
      lastHoverPlacement,
      tracks,
      placePatternsOnTrack,
      playlistBarCount,
      playlistShellRef,
      patternSelectionForInsertRef,
      normalizePatternIds,
      lastTouchedAudioClipRef,
      clampFn,
      onPasteAudioClip,
    ],
  );
};
