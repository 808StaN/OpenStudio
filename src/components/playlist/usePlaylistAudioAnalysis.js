import { useCallback, useRef } from "react";
import { toSafeSampleUrl } from "../../utils/sampleUrl";

// Provides lazy AudioContext creation and cached waveform/duration analysis for samples.
// The cache avoids repeated decode work during drag/resize/repaint operations.
export const usePlaylistAudioAnalysis = function ({
  buildWaveformEnvelopeFn,
  waveformBins,
}) {
  const audioDecodeContextRef = useRef(null);
  const audioAnalysisCacheRef = useRef(new Map());
  const audioAnalysisPromiseRef = useRef(new Map());

  const ensureAudioDecodeContext = useCallback(function () {
    if (!audioDecodeContextRef.current) {
      audioDecodeContextRef.current = new AudioContext();
    }

    return audioDecodeContextRef.current;
  }, []);

  const getAudioAnalysis = useCallback(async function (samplePath) {
    const safePath = toSafeSampleUrl(samplePath);
    if (!safePath) {
      return null;
    }

    const cached = audioAnalysisCacheRef.current.get(safePath);
    if (cached) {
      return cached;
    }

    const pending = audioAnalysisPromiseRef.current.get(safePath);
    if (pending) {
      return pending;
    }

    const request = (async function () {
      const audioCtx = ensureAudioDecodeContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const response = await fetch(safePath);
      if (!response.ok) {
        throw new Error("Cannot load audio clip");
      }

      const data = await response.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(data.slice(0));
      const analysis = {
        durationSec: Math.max(0.01, Number(buffer.duration || 0.01)),
        waveformEnvelope: buildWaveformEnvelopeFn(buffer, waveformBins),
      };

      audioAnalysisCacheRef.current.set(safePath, analysis);
      return analysis;
    })();

    audioAnalysisPromiseRef.current.set(safePath, request);

    try {
      return await request;
    } catch {
      return null;
    } finally {
      audioAnalysisPromiseRef.current.delete(safePath);
    }
  }, [buildWaveformEnvelopeFn, waveformBins, ensureAudioDecodeContext]);

  return {
    getAudioAnalysis,
    audioAnalysisCache: audioAnalysisCacheRef.current,
  };
};
