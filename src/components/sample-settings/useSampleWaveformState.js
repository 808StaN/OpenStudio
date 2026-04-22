import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { assignSampleToChannel } from "../../store";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import {
  computePeakAbs,
  computeWaveformPeaks,
  getNormalizeGainFromPeakAbs,
  getWaveformDecodeContext,
} from "./sampleSettingsUtils";

export function useSampleWaveformState({
  channelId,
  isPluginChannel,
  sampleRef,
  normalizeEnabled,
  stopPreview,
}) {
  const dispatch = useDispatch();
  const [peaks, setPeaks] = useState([]);
  const [waveformPeakAbs, setWaveformPeakAbs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  useEffect(
    function () {
      // Source switches should always clear preview and reload waveform data.
      stopPreview();

      if (isPluginChannel) {
        setPeaks([]);
        setWaveformPeakAbs(0);
        setError("");
        setIsLoading(false);
        setIsDropTargetActive(false);
        return function () {
          return;
        };
      }

      let cancelled = false;

      if (!sampleRef) {
        setPeaks([]);
        setWaveformPeakAbs(0);
        setError("Drop sample here from Browser");
        setIsLoading(false);
        return function () {
          cancelled = true;
        };
      }

      setIsLoading(true);
      setError("");

      const load = async function () {
        try {
          const safeSampleRef = toSafeSampleUrl(sampleRef);
          if (!safeSampleRef) {
            throw new Error("Sample path is empty");
          }

          const response = await fetch(safeSampleRef);
          if (!response.ok) {
            throw new Error("Sample fetch failed");
          }

          const buffer = await response.arrayBuffer();
          const decodeCtx = getWaveformDecodeContext();
          const decoded = await decodeCtx.decodeAudioData(buffer.slice(0));

          const primaryChannel = decoded.getChannelData(0);
          const waveformPeaks = computeWaveformPeaks(primaryChannel, 180);
          const peakAbs = computePeakAbs(primaryChannel);

          if (cancelled) {
            return;
          }

          setPeaks(waveformPeaks);
          setWaveformPeakAbs(peakAbs);
          setIsLoading(false);
        } catch {
          if (cancelled) {
            return;
          }
          setIsLoading(false);
          setPeaks([]);
          setWaveformPeakAbs(0);
          setError("Cannot read waveform for this sample");
        }
      };

      void load();

      return function () {
        cancelled = true;
      };
    },
    [isPluginChannel, sampleRef, stopPreview],
  );

  const onWaveformDragOver = function (event) {
    if (isPluginChannel) {
      return;
    }

    event.preventDefault();
    if (!isDropTargetActive) {
      setIsDropTargetActive(true);
    }
  };

  const onWaveformDragLeave = function () {
    setIsDropTargetActive(false);
  };

  const onWaveformDrop = function (event) {
    if (isPluginChannel) {
      return;
    }

    event.preventDefault();
    setIsDropTargetActive(false);

    const raw = event.dataTransfer.getData("application/x-daw-sample");
    if (!raw) {
      return;
    }

    try {
      const payload = JSON.parse(raw);
      const sampleRefValue = payload.samplePath || payload.file;
      if (!sampleRefValue) {
        return;
      }

      dispatch(
        assignSampleToChannel({
          channelId,
          sampleRef: sampleRefValue,
          sampleName: payload.file,
        }),
      );
      setError("");
    } catch {
      return;
    }
  };

  const waveformNormalizeGain = getNormalizeGainFromPeakAbs(
    waveformPeakAbs,
    Boolean(normalizeEnabled),
  );

  return {
    peaks,
    isLoading,
    error,
    setError,
    isDropTargetActive,
    onWaveformDragOver,
    onWaveformDragLeave,
    onWaveformDrop,
    waveformNormalizeGain,
  };
}
