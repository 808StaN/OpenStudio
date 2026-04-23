import { useEffect, useState } from "react";

// Keeps playlist audio clips in sync with current stretch settings and
// preloads waveform analysis so clips render envelopes without visible lag.
export const usePlaylistAudioClipMaintenance = function ({
  clips,
  channelsById,
  bpm,
  dispatch,
  audioAnalysisCache,
  getAudioAnalysis,
  minClipBarLength,
  getSafeSampleSettingsFn,
  toSafeSampleUrlFn,
  getTargetAudioClipBarLengthFn,
  clampFn,
  setPlaylistClipLengthAction,
}) {
  // Local state is used only to trigger a render after async warmup finishes.
  const [, setWaveformTick] = useState(0);

  // Synchronize audio clip bar lengths when auto-stretch is enabled.
  useEffect(
    function () {
      const audioClips = clips.filter(function (clip) {
        return (
          String(clip.clipType || "pattern").toLowerCase() === "audio" &&
          String(clip.channelId || "").trim()
        );
      });
      if (audioClips.length === 0) {
        return;
      }

      let isCanceled = false;

      const syncClipLengths = async function () {
        for (let index = 0; index < audioClips.length; index += 1) {
          if (isCanceled) {
            return;
          }

          const clip = audioClips[index];
          if (clip.autoStretchSync === false) {
            continue;
          }

          const channel = channelsById[String(clip.channelId || "").trim()];
          if (!channel) {
            continue;
          }

          const settings = getSafeSampleSettingsFn(channel.sampleSettings);
          const stretchMode = String(settings.stretchMode || "none").toLowerCase();
          const timeMode = String(settings.stretchTimeMode || "none").toLowerCase();
          if (stretchMode === "none" || timeMode === "none") {
            continue;
          }

          const safePath = toSafeSampleUrlFn(clip.samplePath || channel.sampleRef);
          if (!safePath) {
            continue;
          }

          let analysis = audioAnalysisCache.get(safePath);
          if (!analysis) {
            analysis = await getAudioAnalysis(safePath);
          }
          if (!analysis) {
            continue;
          }

          const targetBars = getTargetAudioClipBarLengthFn(
            analysis.durationSec,
            settings,
            bpm,
          );
          const currentBars = clampFn(Number(clip.barLength || 1), minClipBarLength, 64);

          // Skip micro-diffs to avoid noisy Redux updates.
          if (Math.abs(targetBars - currentBars) <= 0.0005) {
            continue;
          }

          dispatch(
            setPlaylistClipLengthAction({
              clipId: clip.id,
              barLength: targetBars,
            }),
          );
        }
      };

      void syncClipLengths();

      return function () {
        isCanceled = true;
      };
    },
    [
      clips,
      channelsById,
      bpm,
      dispatch,
      audioAnalysisCache,
      getAudioAnalysis,
      minClipBarLength,
      getSafeSampleSettingsFn,
      toSafeSampleUrlFn,
      getTargetAudioClipBarLengthFn,
      clampFn,
      setPlaylistClipLengthAction,
    ],
  );

  // Warm audio analysis cache for visible playlist clips to avoid first-open lag.
  useEffect(
    function () {
      const audioClips = clips.filter(function (clip) {
        return String(clip.clipType || "pattern").toLowerCase() === "audio";
      });

      if (audioClips.length === 0) {
        return;
      }

      let isCanceled = false;

      const warmup = async function () {
        await Promise.all(
          audioClips.map(async function (clip) {
            const samplePath = String(clip.samplePath || "").trim();
            if (!samplePath) {
              return;
            }

            const safePath = toSafeSampleUrlFn(samplePath);
            if (audioAnalysisCache.has(safePath)) {
              return;
            }

            await getAudioAnalysis(safePath);
          }),
        );

        if (!isCanceled) {
          setWaveformTick(function (value) {
            return value + 1;
          });
        }
      };

      void warmup();

      return function () {
        isCanceled = true;
      };
    },
    [clips, audioAnalysisCache, getAudioAnalysis, toSafeSampleUrlFn],
  );
};
