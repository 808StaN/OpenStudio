import { useMemo } from "react";

const MAXIMIZER_GRAPH_WIDTH = 520;
const MAXIMIZER_GRAPH_HEIGHT = 152;

// Compute reusable visual metrics/paths for the Maximizer editor view.
export const useFxMaximizerMetrics = function ({
  activeInsert,
  maximizerParams,
  clampFn,
  buildWaveformPathFn,
  buildMaximizerTransferPathFn,
  buildWaveformReductionPathFn,
}) {
  const maximizerWaveformPath = useMemo(
    function () {
      return buildWaveformPathFn(
        Array.isArray(activeInsert?.meterWaveform) ? activeInsert.meterWaveform : null,
        MAXIMIZER_GRAPH_WIDTH,
        MAXIMIZER_GRAPH_HEIGHT,
      );
    },
    [activeInsert, buildWaveformPathFn],
  );

  const maximizerTransferPath = useMemo(
    function () {
      return buildMaximizerTransferPathFn(
        maximizerParams,
        MAXIMIZER_GRAPH_WIDTH,
        MAXIMIZER_GRAPH_HEIGHT,
      );
    },
    [buildMaximizerTransferPathFn, maximizerParams],
  );

  const maximizerThresholdWavePath = useMemo(
    function () {
      const thresholdAmplitude = clampFn(
        Math.pow(10, Number(maximizerParams.thresholdDb || 0) / 20),
        0,
        1,
      );
      return buildWaveformReductionPathFn(
        Array.isArray(activeInsert?.meterWaveform) ? activeInsert.meterWaveform : null,
        MAXIMIZER_GRAPH_WIDTH,
        MAXIMIZER_GRAPH_HEIGHT,
        thresholdAmplitude,
      );
    },
    [
      activeInsert,
      buildWaveformReductionPathFn,
      clampFn,
      maximizerParams.thresholdDb,
    ],
  );

  const maximizerOutDb = useMemo(
    function () {
      if (Number.isFinite(Number(activeInsert?.maximizerOutputDb))) {
        return clampFn(Number(activeInsert.maximizerOutputDb), -96, 6);
      }
      return -96;
    },
    [activeInsert, clampFn],
  );

  return {
    maximizerWaveformPath,
    maximizerTransferPath,
    maximizerThresholdWavePath,
    maximizerOutDb,
  };
};
