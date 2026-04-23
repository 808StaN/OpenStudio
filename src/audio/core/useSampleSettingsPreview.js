/**
 * @fileoverview useSampleSettingsPreview — Handles sample-settings-window
 * preview playback (single note triggered when user edits sample settings).
 *
 * Extracted from useTransportScheduler.js to decouple preview event handling
 * from the transport scheduling loop.
 */

import { useRef, useEffect } from "react";
import { clamp } from "../../store/utils";
import { setInsertMeter } from "../../store";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import {
  getPluginInstrumentCacheKey,
} from "./usePluginInstruments";

const SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT =
  "openstudio:sample-settings-preview-play";
const SAMPLE_SETTINGS_PREVIEW_STOP_EVENT =
  "openstudio:sample-settings-preview-stop";
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;

export function useSampleSettingsPreview({
  dispatch,
  audioCtxRef,
  ensureContext,
  mixerGraphRef,
  mixerSettingsRef,
  ensureMixerGraph,
  applyMixerSettingsToGraph,
  getInsertInputNodeForChannel,
  updateMixerMeters,
  stopActiveChannelSamples,
  stopActiveChannelSynthVoices,
  channelsRef,
  pluginInstrumentRef,
  pluginInstrumentFailedRef,
  loadPluginInstrument,
  sampleBufferCacheRef,
  sampleLoadFailedRef,
  loadSampleBuffer,
  transportIsPlaying,
  scheduleSampleRef,
  schedulePluginInstrumentRef,
}) {
  const sampleSettingsPreviewMeterRafRef = useRef(null);
  const sampleSettingsPreviewMeterInsertIdRef = useRef(null);

  useEffect(
    function () {
      const onSampleSettingsPreviewPlay = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId) {
          return;
        }

        const channel = (channelsRef.current || []).find(function (item) {
          return item.id === channelId;
        });
        if (!channel) {
          return;
        }

        const previewContext = ensureContext();
        if (previewContext.state === "suspended") {
          void previewContext.resume();
        }

        ensureMixerGraph();
        applyMixerSettingsToGraph();

        const outputNode = getInsertInputNodeForChannel(channel);
        const targetInsertId =
          String(channel.mixerInsertId || "master").trim() || "master";
        sampleSettingsPreviewMeterInsertIdRef.current = targetInsertId;

        const stopSampleSettingsPreviewMeterLoop = function () {
          if (sampleSettingsPreviewMeterRafRef.current) {
            cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
            sampleSettingsPreviewMeterRafRef.current = null;
          }
        };

        const startSampleSettingsPreviewMeterLoop = function () {
          if (transportIsPlaying) {
            return;
          }

          stopSampleSettingsPreviewMeterLoop();

          const tickPreviewMeters = function () {
            if (transportIsPlaying) {
              stopSampleSettingsPreviewMeterLoop();
              return;
            }

            const nowCtx = audioCtxRef.current || ensureContext();
            updateMixerMeters(nowCtx.currentTime);
            sampleSettingsPreviewMeterRafRef.current =
              requestAnimationFrame(tickPreviewMeters);
          };

          sampleSettingsPreviewMeterRafRef.current =
            requestAnimationFrame(tickPreviewMeters);
        };

        startSampleSettingsPreviewMeterLoop();

        const pluginRef = String(channel.pluginRef || "").trim();
        const plugin = getPluginInstrument(pluginRef);
        const hasPluginInstrument = Boolean(plugin && plugin.soundfont);

        const gainAmount =
          BASE_CHANNEL_TRIGGER_GAIN *
          clamp(Number(channel.volume ?? 1), 0, 1);

        const schedulePreview = function () {
          const nowCtx = audioCtxRef.current || previewContext;
          const startAt = nowCtx.currentTime + 0.002;

          stopActiveChannelSamples(channel.id, startAt);
          stopActiveChannelSynthVoices(channel.id, startAt);

          if (
            hasPluginInstrument &&
            typeof schedulePluginInstrumentRef.current === "function"
          ) {
            schedulePluginInstrumentRef.current(
              pluginRef,
              startAt,
              gainAmount,
              channel.pan,
              channel,
              outputNode,
            );
            return;
          }

          if (typeof scheduleSampleRef.current === "function") {
            const safeSampleRef = toSafeSampleUrl(channel.sampleRef);
            if (!safeSampleRef) {
              return;
            }
            const cached = sampleBufferCacheRef.current.get(safeSampleRef);
            if (cached) {
              scheduleSampleRef.current(
                cached,
                startAt,
                gainAmount,
                channel.pan,
                channel,
                outputNode,
              );
              return;
            }
            if (!sampleLoadFailedRef.current.has(safeSampleRef)) {
              void loadSampleBuffer(safeSampleRef).then(function (buffer) {
                if (buffer && typeof scheduleSampleRef.current === "function") {
                  scheduleSampleRef.current(
                    buffer,
                    startAt,
                    gainAmount,
                    channel.pan,
                    channel,
                    outputNode,
                  );
                }
              });
            }
          }
        };

        if (hasPluginInstrument) {
          const key = getPluginInstrumentCacheKey(pluginRef, channel.id);
          const cachedInstrument = pluginInstrumentRef.current.get(key);
          if (cachedInstrument) {
            schedulePreview();
            return;
          }

          void loadPluginInstrument(pluginRef, channel.id, outputNode).then(
            function (loadedInstrument) {
              if (!loadedInstrument) {
                return;
              }
              schedulePreview();
            },
          );
          return;
        }

        schedulePreview();
      };

      const onSampleSettingsPreviewStop = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId || !audioCtxRef.current) {
          return;
        }

        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        const stopAt = audioCtxRef.current.currentTime;
        stopActiveChannelSamples(channelId, stopAt);
        stopActiveChannelSynthVoices(channelId, stopAt);

        const insertId =
          sampleSettingsPreviewMeterInsertIdRef.current ||
          String(
            (channelsRef.current || []).find(function (item) {
              return item.id === channelId;
            })?.mixerInsertId || "master",
          );
        sampleSettingsPreviewMeterInsertIdRef.current = null;

        dispatch(
          setInsertMeter({
            insertId,
            meter: 0,
          }),
        );
        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: 0,
          }),
        );
      };

      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
        onSampleSettingsPreviewPlay,
      );
      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
        onSampleSettingsPreviewStop,
      );

      return function () {
        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
          onSampleSettingsPreviewPlay,
        );
        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
          onSampleSettingsPreviewStop,
        );
      };
    },
    [
      audioCtxRef,
      ensureContext,
      mixerGraphRef,
      mixerSettingsRef,
      ensureMixerGraph,
      applyMixerSettingsToGraph,
      getInsertInputNodeForChannel,
      updateMixerMeters,
      stopActiveChannelSamples,
      stopActiveChannelSynthVoices,
      channelsRef,
      pluginInstrumentRef,
      pluginInstrumentFailedRef,
      loadPluginInstrument,
      sampleBufferCacheRef,
      sampleLoadFailedRef,
      loadSampleBuffer,
      transportIsPlaying,
      dispatch,
      scheduleSampleRef,
      schedulePluginInstrumentRef,
    ],
  );
}
