/**
 * @fileoverview useMixerMeters — Real-time VU meters, spectrum, waveform
 * and maximizer visualisation read from the mixer graph's AnalyserNodes.
 *
 * This module was extracted from useAudioScheduler.js to decouple the
 * heavy visual metering loop (~440 lines) from transport scheduling.
 */

import { useRef } from "react";
import { clamp } from "../../store/utils";
import { setInsertMeter } from "../../store";
import { getActiveFxState } from "./getActiveFxState";

const MIXER_METER_RMS_GAIN = 4.2;
const MIXER_METER_PEAK_GAIN = 1.9;
const MIXER_METER_NOISE_GATE = 0.0016;
const MIXER_METER_RESPONSE_CURVE = 0.5;
const MIXER_METER_DECAY = 0.9;
const EQ_SPECTRUM_BINS = 112;
const EQ_SPECTRUM_MIN_FREQ = 20;
const EQ_SPECTRUM_MAX_FREQ = 20000;

/**
 * Converts raw ByteFrequencyData into a log-spaced, smoothed spectrum
 * array suitable for the EQ editor visualisation.
 */
function buildEqSpectrumFromAnalyserData(analyser, frequencyData) {
  if (!analyser || !frequencyData || frequencyData.length === 0) {
    return null;
  }

  const nyquist = Math.max(1, analyser.context.sampleRate * 0.5);
  const maxSourceIndex = frequencyData.length - 1;

  const rawBins = Array.from({ length: EQ_SPECTRUM_BINS }).map(
    function (_, index) {
      const t = EQ_SPECTRUM_BINS > 1 ? index / (EQ_SPECTRUM_BINS - 1) : 0;
      const targetFrequency =
        EQ_SPECTRUM_MIN_FREQ *
        Math.pow(EQ_SPECTRUM_MAX_FREQ / EQ_SPECTRUM_MIN_FREQ, t);
      const sourcePosition = Math.max(
        0,
        Math.min(maxSourceIndex, (targetFrequency / nyquist) * maxSourceIndex),
      );

      const baseIndex = Math.floor(sourcePosition);
      const blend = sourcePosition - baseIndex;

      const left = frequencyData[baseIndex] || 0;
      const right = frequencyData[Math.min(maxSourceIndex, baseIndex + 1)] || 0;
      const interpolated = left + (right - left) * blend;

      const averagingRadius =
        targetFrequency < 200 ? 3 : targetFrequency < 1200 ? 2 : 1;
      let weightedSum = 0;
      let weightTotal = 0;
      for (
        let offset = -averagingRadius;
        offset <= averagingRadius;
        offset += 1
      ) {
        const sampleIndex = Math.max(
          0,
          Math.min(maxSourceIndex, baseIndex + offset),
        );
        const sampleValue = frequencyData[sampleIndex] || 0;
        const weight = averagingRadius + 1 - Math.abs(offset);
        weightedSum += sampleValue * weight;
        weightTotal += weight;
      }

      const averaged =
        weightTotal > 0 ? weightedSum / weightTotal : interpolated;
      const combined = interpolated * 0.65 + averaged * 0.35;

      const normalized = clamp(combined / 255, 0, 1);
      return Math.pow(normalized, 1.03);
    },
  );

  // Mild temporal smoothing between neighboring visual bins for a cleaner fill.
  const smoothedBins = rawBins.map(function (value, index) {
    const prev = rawBins[Math.max(0, index - 1)] || value;
    const next = rawBins[Math.min(rawBins.length - 1, index + 1)] || value;
    return clamp(value * 0.58 + prev * 0.21 + next * 0.21, 0, 1);
  });

  // Extra smoothing pass to suppress single-bin spikes.
  return smoothedBins.map(function (value, index) {
    const prev = smoothedBins[Math.max(0, index - 1)] || value;
    const next = smoothedBins[Math.min(smoothedBins.length - 1, index + 1)] || value;
    return clamp(value * 0.72 + prev * 0.14 + next * 0.14, 0, 1);
  });
}

/**
 * Hook that maintains all transient state for mixer visualisation and
 * exposes a single `updateMixerMeters(now)` function meant to be called
 * from the transport requestAnimationFrame loop.
 *
 * @param {Function} dispatch — Redux dispatch
 * @param {React.Ref} mixerGraphRef — ref to the current mixer graph
 * @param {React.Ref} mixerSettingsRef — ref to current mixer settings array
 * @param {React.Ref} spectrumTargetInsertIdRef — ref to the insert id whose
 *   spectrum / waveform should be captured for the FX editor UI.
 */
export function useMixerMeters(
  dispatch,
  mixerGraphRef,
  mixerSettingsRef,
  spectrumTargetInsertIdRef,
) {
  const lastMeterDispatchAtRef = useRef(0);
  const lastMeterLevelsRef = useRef(new Map());
  const lastMeterSpectrumRef = useRef(new Map());
  const lastMeterWaveformRef = useRef(new Map());
  const lastMaximizerReductionRef = useRef(new Map());
  const lastMaximizerOutputDbRef = useRef(new Map());
  const lastMaximizerStereoMeterRef = useRef(new Map());
  const maximizerTraceHistoryRef = useRef(new Map());
  const lastMaximizerVisualKeyRef = useRef(new Map());

  /**
   * Resets all meter state when playback stops so stale values don't
   * persist across sessions.
   */
  function resetMeterState() {
    lastMeterDispatchAtRef.current = 0;
    lastMeterLevelsRef.current.clear();
    lastMeterSpectrumRef.current.clear();
    lastMeterWaveformRef.current.clear();
    lastMaximizerReductionRef.current.clear();
    lastMaximizerOutputDbRef.current.clear();
    lastMaximizerStereoMeterRef.current.clear();
    maximizerTraceHistoryRef.current.clear();
    lastMaximizerVisualKeyRef.current.clear();
  }

  /**
   * Reads every insert's analyser, computes VU meters, optional spectrum
   * and maximizer visual data, and dispatches Redux actions only when a
   * value has changed by more than its threshold (keeps rAF loop lean).
   */
  function updateMixerMeters(now) {
    if (now - lastMeterDispatchAtRef.current < 1 / 45) {
      return;
    }
    lastMeterDispatchAtRef.current = now;

    const graph = mixerGraphRef.current;
    if (!graph) {
      return;
    }

    graph.inserts.forEach(function (node, insertId) {
      node.analyser.getByteTimeDomainData(node.meterData);

      let squareSum = 0;
      let peak = 0;
      for (let i = 0; i < node.meterData.length; i += 1) {
        const centered = (node.meterData[i] - 128) / 128;
        squareSum += centered * centered;

        const absolute = Math.abs(centered);
        if (absolute > peak) {
          peak = absolute;
        }
      }

      const rms = Math.sqrt(squareSum / node.meterData.length);
      const blended = Math.max(
        rms * MIXER_METER_RMS_GAIN,
        peak * MIXER_METER_PEAK_GAIN,
      );
      const gated = blended < MIXER_METER_NOISE_GATE ? 0 : blended;
      const instantMeter = Math.min(
        1,
        Math.pow(gated, MIXER_METER_RESPONSE_CURVE),
      );
      node.meterLevel = Math.max(
        instantMeter,
        node.meterLevel * MIXER_METER_DECAY,
      );

      const prevMeter = lastMeterLevelsRef.current.get(insertId);
      const isSpectrumTarget =
        insertId === spectrumTargetInsertIdRef.current;
      let nextSpectrum = null;
      let spectrumChanged = false;
      let nextWaveform = null;
      let waveformChanged = false;
      let maximizerReduction = 0;
      let maximizerOutputDb = -96;
      let maximizerStereoMeter = {
        leftVolumeDb: -96,
        leftReductionDb: 0,
        rightReductionDb: 0,
        rightVolumeDb: -96,
      };
      let reductionChanged = false;
      let outputDbChanged = false;
      let stereoChanged = false;

      if (
        node.maximizerCompressor &&
        Number.isFinite(Number(node.maximizerCompressor.reduction))
      ) {
        maximizerReduction = clamp(
          Math.max(0, -Number(node.maximizerCompressor.reduction)),
          0,
          36,
        );
      }

      if (node.maximizerAnalyser && node.maximizerMeterWaveform) {
        node.maximizerAnalyser.getByteTimeDomainData(node.maximizerMeterWaveform);
        let meterPeak = 0;
        for (
          let meterIndex = 0;
          meterIndex < node.maximizerMeterWaveform.length;
          meterIndex += 1
        ) {
          const normalized = Math.abs(
            (Number(node.maximizerMeterWaveform[meterIndex] || 128) - 128) /
              128,
          );
          if (normalized > meterPeak) {
            meterPeak = normalized;
          }
        }
        maximizerOutputDb = clamp(
          20 * Math.log10(Math.max(meterPeak, 0.0001)),
          -96,
          6,
        );
      }

      const calcPeakFromWaveform = function (waveform) {
        let peak = 0;
        for (let index = 0; index < waveform.length; index += 1) {
          const normalized = Math.abs(
            (Number(waveform[index] || 128) - 128) / 128,
          );
          if (normalized > peak) {
            peak = normalized;
          }
        }
        return peak;
      };

      if (
        node.maximizerPreLeftAnalyser &&
        node.maximizerPreRightAnalyser &&
        node.maximizerPostLeftAnalyser &&
        node.maximizerPostRightAnalyser &&
        node.maximizerOutLeftAnalyser &&
        node.maximizerOutRightAnalyser &&
        node.maximizerPreLeftWaveform &&
        node.maximizerPreRightWaveform &&
        node.maximizerPostLeftWaveform &&
        node.maximizerPostRightWaveform &&
        node.maximizerOutLeftWaveform &&
        node.maximizerOutRightWaveform
      ) {
        node.maximizerPreLeftAnalyser.getByteTimeDomainData(
          node.maximizerPreLeftWaveform,
        );
        node.maximizerPreRightAnalyser.getByteTimeDomainData(
          node.maximizerPreRightWaveform,
        );
        node.maximizerPostLeftAnalyser.getByteTimeDomainData(
          node.maximizerPostLeftWaveform,
        );
        node.maximizerPostRightAnalyser.getByteTimeDomainData(
          node.maximizerPostRightWaveform,
        );
        node.maximizerOutLeftAnalyser.getByteTimeDomainData(
          node.maximizerOutLeftWaveform,
        );
        node.maximizerOutRightAnalyser.getByteTimeDomainData(
          node.maximizerOutRightWaveform,
        );

        const preLeftDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerPreLeftWaveform), 0.0001),
          );
        const preRightDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerPreRightWaveform), 0.0001),
          );
        const postLeftDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerPostLeftWaveform), 0.0001),
          );
        const postRightDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerPostRightWaveform), 0.0001),
          );
        const outLeftDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerOutLeftWaveform), 0.0001),
          );
        const outRightDb =
          20 * Math.log10(
            Math.max(calcPeakFromWaveform(node.maximizerOutRightWaveform), 0.0001),
          );

        maximizerStereoMeter = {
          leftVolumeDb: clamp(outLeftDb, -96, 6),
          leftReductionDb: clamp(preLeftDb - postLeftDb, 0, 36),
          rightReductionDb: clamp(preRightDb - postRightDb, 0, 36),
          rightVolumeDb: clamp(outRightDb, -96, 6),
        };
      }

      if (isSpectrumTarget && node.spectrumData) {
        node.analyser.getByteFrequencyData(node.spectrumData);
        nextSpectrum = buildEqSpectrumFromAnalyserData(
          node.analyser,
          node.spectrumData,
        );

        if (nextSpectrum) {
          const prevSpectrum = lastMeterSpectrumRef.current.get(insertId);
          if (
            !Array.isArray(prevSpectrum) ||
            prevSpectrum.length !== nextSpectrum.length
          ) {
            spectrumChanged = true;
          } else {
            for (
              let spectrumIndex = 0;
              spectrumIndex < nextSpectrum.length;
              spectrumIndex += 1
            ) {
              if (
                Math.abs(
                  nextSpectrum[spectrumIndex] - prevSpectrum[spectrumIndex],
                ) > 0.028
              ) {
                spectrumChanged = true;
                break;
              }
            }
          }
        }
      }

      if (
        isSpectrumTarget &&
        node.maximizerAnalyser &&
        node.maximizerWaveform
      ) {
        const fxInsert = mixerSettingsRef.current.find(function (item) {
          return item.id === insertId;
        });
        const activeFxState = getActiveFxState(fxInsert);
        const visualKey = JSON.stringify({
          thresholdDb: Number(activeFxState.maximizerParams?.thresholdDb ?? 0),
          ceilingDb: Number(activeFxState.maximizerParams?.ceilingDb ?? -1),
          character: Number(activeFxState.maximizerParams?.character ?? 0.5),
          truePeakEnabled: Boolean(
            activeFxState.maximizerParams?.truePeakEnabled,
          ),
          enabled: Boolean(activeFxState.maximizerEnabled),
        });
        const prevVisualKey = lastMaximizerVisualKeyRef.current.get(insertId);
        if (prevVisualKey !== visualKey) {
          lastMaximizerVisualKeyRef.current.set(insertId, visualKey);
        }

        node.maximizerAnalyser.getByteTimeDomainData(node.maximizerWaveform);

        if (node.maximizerPreAnalyser && node.maximizerPreWaveform) {
          node.maximizerPreAnalyser.getByteTimeDomainData(
            node.maximizerPreWaveform,
          );
        }
        if (node.maximizerPostAnalyser && node.maximizerPostWaveform) {
          node.maximizerPostAnalyser.getByteTimeDomainData(
            node.maximizerPostWaveform,
          );
        }

        const tracePointsPerFrame = 24;
        const nextTraceSamples = [];
        const traceStep = Math.max(
          1,
          Math.floor(node.maximizerWaveform.length / tracePointsPerFrame),
        );
        for (
          let traceIndex = 0;
          traceIndex < tracePointsPerFrame;
          traceIndex += 1
        ) {
          const sourceIndex = Math.min(
            node.maximizerWaveform.length - 1,
            traceIndex * traceStep,
          );
          nextTraceSamples.push(
            clamp(
              (Number(node.maximizerWaveform[sourceIndex] || 128) - 128) /
                128,
              -1,
              1,
            ),
          );
        }

        const previousTrace =
          maximizerTraceHistoryRef.current.get(insertId) || [];
        const maxTraceLength = 18000;
        const nextTrace = previousTrace
          .concat(nextTraceSamples)
          .slice(-maxTraceLength);
        maximizerTraceHistoryRef.current.set(insertId, nextTrace);

        const bins = 220;
        const prevDisplayWaveform =
          lastMeterWaveformRef.current.get(insertId);
        const shiftBins = 2;

        const buildInjectedBins = function () {
          const samplesPerInjectedBin = Math.max(
            1,
            Math.floor(nextTraceSamples.length / shiftBins),
          );

          return Array.from({ length: shiftBins }).map(function (_, index) {
            const start = index * samplesPerInjectedBin;
            const end = Math.min(
              nextTraceSamples.length,
              start + samplesPerInjectedBin,
            );
            if (end <= start) {
              return 0;
            }

            let strongest = 0;
            for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
              const sample = Number(nextTraceSamples[sampleIndex] || 0);
              if (Math.abs(sample) > Math.abs(strongest)) {
                strongest = sample;
              }
            }
            return clamp(strongest, -1, 1);
          });
        };

        if (
          Array.isArray(prevDisplayWaveform) &&
          prevDisplayWaveform.length === bins
        ) {
          const injected = buildInjectedBins();
          nextWaveform = injected.concat(
            prevDisplayWaveform.slice(0, bins - shiftBins),
          );
        } else {
          const chunkSize = Math.max(1, Math.floor(nextTrace.length / bins));
          const seeded = Array.from({ length: bins }).map(function (_, index) {
            const start = index * chunkSize;
            const end = Math.min(nextTrace.length, start + chunkSize);
            if (start >= nextTrace.length || end <= start) {
              return 0;
            }

            let strongest = 0;
            for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
              const sample = Number(nextTrace[sampleIndex] || 0);
              if (Math.abs(sample) > Math.abs(strongest)) {
                strongest = sample;
              }
            }
            return clamp(strongest, -1, 1);
          });

          nextWaveform = seeded.map(function (value, index) {
            const prev = seeded[Math.max(0, index - 1)];
            const next = seeded[Math.min(seeded.length - 1, index + 1)];
            return clamp(prev * 0.08 + value * 0.84 + next * 0.08, -1, 1);
          });
        }

        const calcPeak = function (buffer) {
          let peak = 0;
          for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
            const normalized = Math.abs(
              (Number(buffer[sampleIndex] || 128) - 128) / 128,
            );
            if (normalized > peak) {
              peak = normalized;
            }
          }
          return peak;
        };

        const postPeak = calcPeak(node.maximizerWaveform);
        const postDb = 20 * Math.log10(Math.max(postPeak, 0.0001));
        const compressorReduction = maximizerReduction;

        if (node.maximizerPreWaveform && node.maximizerPostWaveform) {
          const prePeak = calcPeak(node.maximizerPreWaveform);
          const postLimiterPeak = calcPeak(node.maximizerPostWaveform);
          const preDb = 20 * Math.log10(Math.max(prePeak, 0.0001));
          const postLimiterDb = 20 * Math.log10(
            Math.max(postLimiterPeak, 0.0001),
          );
          const peakReduction = clamp(preDb - postLimiterDb, 0, 36);
          maximizerReduction = clamp(
            compressorReduction * 0.75 + peakReduction * 0.25,
            0,
            36,
          );
        } else {
          maximizerReduction = clamp(compressorReduction, 0, 36);
        }
        maximizerOutputDb = clamp(postDb, -96, 6);

        waveformChanged = true;
      }

      const prevReduction = lastMaximizerReductionRef.current.get(insertId);
      reductionChanged =
        prevReduction === undefined ||
        Math.abs((prevReduction || 0) - maximizerReduction) > 0.14;
      const prevOutputDb = lastMaximizerOutputDbRef.current.get(insertId);
      outputDbChanged =
        prevOutputDb === undefined ||
        Math.abs((prevOutputDb || -96) - maximizerOutputDb) > 0.2;
      const prevStereo = lastMaximizerStereoMeterRef.current.get(insertId);
      stereoChanged =
        !prevStereo ||
        Math.abs(
          Number(prevStereo.leftVolumeDb || -96) -
            Number(maximizerStereoMeter.leftVolumeDb || -96),
        ) > 0.2 ||
        Math.abs(
          Number(prevStereo.leftReductionDb || 0) -
            Number(maximizerStereoMeter.leftReductionDb || 0),
        ) > 0.15 ||
        Math.abs(
          Number(prevStereo.rightReductionDb || 0) -
            Number(maximizerStereoMeter.rightReductionDb || 0),
        ) > 0.15 ||
        Math.abs(
          Number(prevStereo.rightVolumeDb || -96) -
            Number(maximizerStereoMeter.rightVolumeDb || -96),
        ) > 0.2;

      const meterChanged =
        prevMeter === undefined ||
        Math.abs(prevMeter - node.meterLevel) > 0.018 ||
        (node.meterLevel < 0.01 && prevMeter >= 0.01);

      if (
        meterChanged ||
        spectrumChanged ||
        waveformChanged ||
        reductionChanged ||
        outputDbChanged ||
        stereoChanged
      ) {
        lastMeterLevelsRef.current.set(insertId, node.meterLevel);
        if (isSpectrumTarget && nextSpectrum) {
          lastMeterSpectrumRef.current.set(insertId, nextSpectrum);
        }
        if (isSpectrumTarget && nextWaveform) {
          lastMeterWaveformRef.current.set(insertId, nextWaveform);
        }
        lastMaximizerReductionRef.current.set(insertId, maximizerReduction);
        lastMaximizerOutputDbRef.current.set(insertId, maximizerOutputDb);
        lastMaximizerStereoMeterRef.current.set(
          insertId,
          maximizerStereoMeter,
        );

        dispatch(
          setInsertMeter({
            insertId,
            meter: node.meterLevel,
            spectrum:
              isSpectrumTarget && nextSpectrum ? nextSpectrum : undefined,
            waveform:
              isSpectrumTarget && nextWaveform ? nextWaveform : undefined,
            maximizerReduction,
            maximizerOutputDb,
            maximizerStereoMeter,
          }),
        );
      }
    });
  }

  return {
    updateMixerMeters,
    resetMeterState,
  };
}
