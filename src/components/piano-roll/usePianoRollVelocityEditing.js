import { useCallback, useRef, useState } from "react";
import {
  findVelocityCandidatesAtClientX as findVelocityCandidatesAtClientXFromUtils,
  getVelocityPercentFromClientY,
} from "./pianoRollVelocityUtils";

// Handles velocity lane interaction model:
// - lane resize
// - single-note velocity drag
// - multi-note "locked velocity" brush (Shift)
export const usePianoRollVelocityEditing = function ({
  activeChannel,
  dispatch,
  activePatternId,
  velocityWrapRef,
  selectedNotes,
  pianoNotes,
  stepWidth,
  patternLength,
  defaultNoteVelocity,
  minVelocityLaneHeight,
  maxVelocityLaneHeight,
  clampFn,
  midiVelocityToPercentFn,
  percentToMidiVelocityFn,
  ensureNoteIsPiano,
  lastTouchedVelocityRef,
  setPianoNoteVelocityAction,
  getSelectionId,
}) {
  const velocityBrushActiveRef = useRef(false);
  const [velocityLaneHeight, setVelocityLaneHeight] = useState(150);
  const [velocityReadout, setVelocityReadout] = useState(
    midiVelocityToPercentFn(defaultNoteVelocity),
  );
  const [isVelocityLaneHovered, setIsVelocityLaneHovered] = useState(false);
  const [isVelocityEditing, setIsVelocityEditing] = useState(false);

  const onVelocityResizeMouseDown = useCallback(
    function (event) {
      event.preventDefault();

      const originY = event.clientY;
      const originHeight = velocityLaneHeight;

      const onMouseMove = function (moveEvent) {
        const delta = originY - moveEvent.clientY;
        setVelocityLaneHeight(
          clampFn(
            originHeight + delta,
            minVelocityLaneHeight,
            maxVelocityLaneHeight,
          ),
        );
      };

      const onMouseUp = function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [
      velocityLaneHeight,
      clampFn,
      minVelocityLaneHeight,
      maxVelocityLaneHeight,
    ],
  );

  const applyVelocityAtPointer = useCallback(
    function (note, clientY) {
      if (!activeChannel || !velocityWrapRef.current) {
        return;
      }

      const rect = velocityWrapRef.current.getBoundingClientRect();
      const nextVelocityPercent = getVelocityPercentFromClientY({
        clientY,
        laneRect: rect,
        clampFn,
      });
      const nextVelocityMidi = percentToMidiVelocityFn(nextVelocityPercent);

      const pianoTarget = ensureNoteIsPiano(note);
      const currentVelocityPercent = midiVelocityToPercentFn(
        Number(pianoTarget.velocity || defaultNoteVelocity),
      );

      setVelocityReadout(nextVelocityPercent);
      if (currentVelocityPercent === nextVelocityPercent) {
        return;
      }

      dispatch(
        setPianoNoteVelocityAction({
          patternId: activePatternId,
          channelId: activeChannel.id,
          noteId: pianoTarget.id,
          start: pianoTarget.start,
          pitch: pianoTarget.pitch,
          velocity: nextVelocityMidi,
        }),
      );

      lastTouchedVelocityRef.current = nextVelocityMidi;
    },
    [
      activeChannel,
      velocityWrapRef,
      clampFn,
      percentToMidiVelocityFn,
      ensureNoteIsPiano,
      midiVelocityToPercentFn,
      defaultNoteVelocity,
      dispatch,
      setPianoNoteVelocityAction,
      activePatternId,
      lastTouchedVelocityRef,
    ],
  );

  const applyLockedVelocityPercent = useCallback(
    function (note, lockedVelocityPercent) {
      if (!activeChannel) {
        return;
      }

      const safePercent = Math.round(clampFn(lockedVelocityPercent, 0, 100));
      const nextVelocityMidi = percentToMidiVelocityFn(safePercent);
      const pianoTarget = ensureNoteIsPiano(note);
      const currentVelocityPercent = midiVelocityToPercentFn(
        Number(pianoTarget.velocity || defaultNoteVelocity),
      );

      setVelocityReadout(safePercent);
      if (currentVelocityPercent === safePercent) {
        return;
      }

      dispatch(
        setPianoNoteVelocityAction({
          patternId: activePatternId,
          channelId: activeChannel.id,
          noteId: pianoTarget.id,
          start: pianoTarget.start,
          pitch: pianoTarget.pitch,
          velocity: nextVelocityMidi,
        }),
      );

      lastTouchedVelocityRef.current = nextVelocityMidi;
    },
    [
      activeChannel,
      clampFn,
      percentToMidiVelocityFn,
      ensureNoteIsPiano,
      midiVelocityToPercentFn,
      defaultNoteVelocity,
      dispatch,
      setPianoNoteVelocityAction,
      activePatternId,
      lastTouchedVelocityRef,
    ],
  );

  const findVelocityCandidatesAtClientX = useCallback(
    function (clientX, fallbackNote) {
      return findVelocityCandidatesAtClientXFromUtils({
        clientX,
        velocityWrapElement: velocityWrapRef.current,
        selectedNotes,
        pianoNotes,
        stepWidth,
        patternLength,
        clampFn,
        fallbackNote,
        getSelectionId,
      });
    },
    [
      velocityWrapRef,
      selectedNotes,
      pianoNotes,
      stepWidth,
      patternLength,
      clampFn,
      getSelectionId,
    ],
  );

  const applyVelocityByPointer = useCallback(
    function (clientX, clientY, fallbackNote, isMultiBrush, lockedVelocityPercent) {
      const targets = findVelocityCandidatesAtClientX(clientX, fallbackNote);
      if (!targets || targets.length === 0) {
        return;
      }

      const applyTargets = isMultiBrush ? targets : [targets[0]];
      applyTargets.forEach(function (target) {
        if (Number.isFinite(lockedVelocityPercent)) {
          applyLockedVelocityPercent(target, lockedVelocityPercent);
        } else {
          applyVelocityAtPointer(target, clientY);
        }
      });
    },
    [
      findVelocityCandidatesAtClientX,
      applyLockedVelocityPercent,
      applyVelocityAtPointer,
    ],
  );

  // Starts drag/brush session and keeps updating velocity while pointer moves.
  const startVelocityBrush = useCallback(
    function (event, fallbackNote) {
      event.preventDefault();
      event.stopPropagation();

      const isMultiBrush = Boolean(event.shiftKey);
      const velocityRect = velocityWrapRef.current
        ? velocityWrapRef.current.getBoundingClientRect()
        : null;
      let lockVelocityPercent =
        isMultiBrush && velocityRect
          ? getVelocityPercentFromClientY({
              clientY: event.clientY,
              laneRect: velocityRect,
              clampFn,
            })
          : null;

      velocityBrushActiveRef.current = true;
      setIsVelocityEditing(true);

      applyVelocityByPointer(
        event.clientX,
        event.clientY,
        fallbackNote,
        isMultiBrush,
        lockVelocityPercent,
      );

      const onMouseMove = function (moveEvent) {
        const moveWantsLock = Boolean(moveEvent.shiftKey);
        if (moveWantsLock && !Number.isFinite(lockVelocityPercent)) {
          const moveRect = velocityWrapRef.current
            ? velocityWrapRef.current.getBoundingClientRect()
            : null;
          if (moveRect) {
            lockVelocityPercent = getVelocityPercentFromClientY({
              clientY: moveEvent.clientY,
              laneRect: moveRect,
              clampFn,
            });
          }
        }

        applyVelocityByPointer(
          moveEvent.clientX,
          moveEvent.clientY,
          null,
          moveWantsLock || isMultiBrush,
          lockVelocityPercent,
        );
      };

      const onMouseUp = function () {
        velocityBrushActiveRef.current = false;
        setIsVelocityEditing(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [velocityWrapRef, clampFn, applyVelocityByPointer],
  );

  const onVelocityBarMouseDown = useCallback(
    function (event, note) {
      startVelocityBrush(event, note);
    },
    [startVelocityBrush],
  );

  return {
    velocityBrushActiveRef,
    velocityLaneHeight,
    velocityReadout,
    isVelocityLaneHovered,
    isVelocityEditing,
    setIsVelocityLaneHovered,
    setVelocityReadout,
    onVelocityResizeMouseDown,
    startVelocityBrush,
    onVelocityBarMouseDown,
  };
};
