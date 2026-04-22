import { useEffect, useRef } from "react";

export function useChannelRackPlayheadAnimation({
  rackShellRef,
  playheadStep,
  isPlaying,
  bpm,
  patternLength,
  stepsPerBeat,
  clampFn,
}) {
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);

  useEffect(
    function () {
      // Keep the "last committed" transport step/timestamp for smooth interpolation.
      if (playheadStepRef.current === playheadStep) {
        return;
      }

      playheadStepRef.current = playheadStep;
      playheadStepTimestampRef.current = performance.now();
    },
    [playheadStep],
  );

  useEffect(
    function () {
      const shellElement = rackShellRef.current;
      if (!shellElement) {
        return;
      }

      const setPlayheadRatio = function (ratio) {
        shellElement.style.setProperty(
          "--rack-playhead-ratio",
          String(clampFn(ratio, 0, 1)),
        );
      };

      const currentBaseStep =
        ((playheadStepRef.current % patternLength) + patternLength) %
        patternLength;

      if (!isPlaying) {
        setPlayheadRatio(currentBaseStep / patternLength);
        return;
      }

      if (playheadStepTimestampRef.current <= 0) {
        playheadStepTimestampRef.current = performance.now();
      }

      let rafId = 0;
      const stepDurationMs = (60 / Math.max(1, bpm) / stepsPerBeat) * 1000;

      const tick = function () {
        const elapsed = performance.now() - playheadStepTimestampRef.current;
        const progress = clampFn(elapsed / stepDurationMs, 0, 0.999);
        const baseStep =
          ((playheadStepRef.current % patternLength) + patternLength) %
          patternLength;

        setPlayheadRatio((baseStep + progress) / patternLength);
        rafId = requestAnimationFrame(tick);
      };

      tick();

      return function () {
        cancelAnimationFrame(rafId);
      };
    },
    [isPlaying, bpm, patternLength, stepsPerBeat, clampFn, rackShellRef],
  );
}
