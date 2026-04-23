/**
 * @fileoverview useVisualTail — Smooth fade-out of mixer VU meters and
 * maximizer visuals after playback stops.
 *
 * Extracted from useTransportScheduler.js to decouple visual tail logic
 * from the scheduling engine.
 */

import { useRef } from "react";
import { clamp } from "../../store/utils";
import { setInsertMeter } from "../../store";

export function useVisualTail() {
  const stopVisualTailUntilRef = useRef(0);
  const stopVisualTailStartedAtRef = useRef(0);
  const stopVisualTailStateRef = useRef(new Map());

  function resetVisualTail() {
    stopVisualTailUntilRef.current = 0;
    stopVisualTailStartedAtRef.current = 0;
    stopVisualTailStateRef.current.clear();
  }

  function startVisualTail(nowPerf, mixerSettingsRef, meterRefs) {
    const {
      lastMeterLevelsRef,
      lastMeterWaveformRef,
      lastMaximizerReductionRef,
      lastMaximizerOutputDbRef,
      lastMaximizerStereoMeterRef,
    } = meterRefs;

    const waveformTailDurationMs = 2500;
    stopVisualTailStartedAtRef.current = nowPerf;
    stopVisualTailUntilRef.current = nowPerf + waveformTailDurationMs;
    stopVisualTailStateRef.current = new Map();
    mixerSettingsRef.current.forEach(function (insert) {
      const insertId = insert.id;
      const outDb = Number(
        lastMaximizerOutputDbRef.current.get(insertId) || -96,
      );
      const stereo =
        lastMaximizerStereoMeterRef.current.get(insertId) || {
          leftVolumeDb: -96,
          leftReductionDb: 0,
          rightReductionDb: 0,
          rightVolumeDb: -96,
        };
      const lastWaveform = lastMeterWaveformRef.current.get(insertId);
      stopVisualTailStateRef.current.set(insertId, {
        meter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
        reduction: Number(
          lastMaximizerReductionRef.current.get(insertId) || 0,
        ),
        outDb,
        stereo,
        initialMeter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
        initialReduction: Number(
          lastMaximizerReductionRef.current.get(insertId) || 0,
        ),
        initialOutDb: outDb,
        initialLeftDb: Number(stereo.leftVolumeDb || -96),
        initialRightDb: Number(stereo.rightVolumeDb || -96),
        initialLeftReduction: Number(stereo.leftReductionDb || 0),
        initialRightReduction: Number(stereo.rightReductionDb || 0),
        waveform: Array.isArray(lastWaveform)
          ? lastWaveform.slice(0, 220)
          : Array.from({ length: 220 }).map(function () {
              return 0;
            }),
      });
    });
  }

  function runVisualTailTick({
    nowPerfTick,
    audioCtxRef,
    mixerSettingsRef,
    resetMeterState,
    dispatch,
    rafIdRef,
  }) {
    const nowCtx = audioCtxRef.current;
    if (!nowCtx) {
      resetMeterState();
      resetVisualTail();
      rafIdRef.current = null;
      return false;
    }

    const tailDuration = Math.max(
      1,
      stopVisualTailUntilRef.current - stopVisualTailStartedAtRef.current,
    );
    const waveformProgress = clamp(
      (nowPerfTick - stopVisualTailStartedAtRef.current) / tailDuration,
      0,
      1,
    );
    const barProgress = clamp(
      (nowPerfTick - stopVisualTailStartedAtRef.current) / 900,
      0,
      1,
    );
    const fade = 1 - barProgress;

    mixerSettingsRef.current.forEach(function (insert) {
      const state = stopVisualTailStateRef.current.get(insert.id);
      if (!state) {
        return;
      }
      state.meter = state.initialMeter * fade;
      state.reduction = state.initialReduction * fade;
      state.outDb =
        state.initialOutDb + (-96 - state.initialOutDb) * barProgress;
      state.stereo = {
        leftVolumeDb:
          state.initialLeftDb +
          (-96 - state.initialLeftDb) * barProgress,
        leftReductionDb: state.initialLeftReduction * fade,
        rightReductionDb: state.initialRightReduction * fade,
        rightVolumeDb:
          state.initialRightDb +
          (-96 - state.initialRightDb) * barProgress,
      };
      state.waveform = [0, 0].concat(state.waveform.slice(0, 218));

      dispatch(
        setInsertMeter({
          insertId: insert.id,
          meter: state.meter,
          waveform: state.waveform,
          maximizerReduction: state.reduction,
          maximizerOutputDb: state.outDb,
          maximizerStereoMeter: state.stereo,
        }),
      );
    });

    if (waveformProgress < 1) {
      rafIdRef.current = requestAnimationFrame(function () {
        runVisualTailTick({
          audioCtxRef,
          mixerSettingsRef,
          resetMeterState,
          dispatch,
          rafIdRef,
        });
      });
      return true;
    }

    resetMeterState();
    resetVisualTail();
    rafIdRef.current = null;
    return false;
  }

  return {
    stopVisualTailUntilRef,
    stopVisualTailStartedAtRef,
    startVisualTail,
    runVisualTailTick,
    resetVisualTail,
  };
}
