import { useCallback, useEffect, useRef, useState } from "react";
import {
  SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
  SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
} from "./sampleSettingsConstants";

export function useSampleSettingsPreview({
  channelId,
  isPluginChannel,
  sampleRef,
}) {
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  // Keep sample/plugin preview refs separate to avoid cross-stop edge cases.
  const previewSampleContextRef = useRef(null);
  const previewSampleNodeRef = useRef(null);
  const previewSampleStopTimeoutRef = useRef(null);
  const previewPluginContextRef = useRef(null);
  const previewPluginNodeRef = useRef(null);
  const previewPluginStopTimeoutRef = useRef(null);
  const previewUiResetTimeoutRef = useRef(null);

  const stopSamplePreview = useCallback(function () {
    if (previewSampleStopTimeoutRef.current) {
      clearTimeout(previewSampleStopTimeoutRef.current);
      previewSampleStopTimeoutRef.current = null;
    }

    const node = previewSampleNodeRef.current;
    if (node && typeof node.stop === "function") {
      try {
        node.stop();
      } catch {
        // Ignore already-stopped audio node errors.
      }
    }

    previewSampleNodeRef.current = null;
  }, []);

  const stopPluginPreview = useCallback(function () {
    if (previewPluginStopTimeoutRef.current) {
      clearTimeout(previewPluginStopTimeoutRef.current);
      previewPluginStopTimeoutRef.current = null;
    }

    const node = previewPluginNodeRef.current;
    if (node && typeof node.stop === "function") {
      try {
        node.stop();
      } catch {
        // Ignore already-stopped audio node errors.
      }
    }

    previewPluginNodeRef.current = null;
  }, []);

  const stopPreview = useCallback(function () {
    if (previewUiResetTimeoutRef.current) {
      clearTimeout(previewUiResetTimeoutRef.current);
      previewUiResetTimeoutRef.current = null;
    }

    stopSamplePreview();
    stopPluginPreview();

    window.dispatchEvent(
      new CustomEvent(SAMPLE_SETTINGS_PREVIEW_STOP_EVENT, {
        detail: {
          channelId,
        },
      }),
    );

    setIsPreviewPlaying(false);
  }, [channelId, stopPluginPreview, stopSamplePreview]);

  const onPreviewClick = useCallback(function (clearError) {
    // Preview click only emits transport-independent sample-settings events.
    if (!isPluginChannel && !sampleRef) {
      return;
    }

    if (isPreviewPlaying) {
      stopPreview();
      return;
    }

    stopPreview();
    window.dispatchEvent(
      new CustomEvent(SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT, {
        detail: {
          channelId,
        },
      }),
    );

    setIsPreviewPlaying(true);
    if (typeof clearError === "function") {
      clearError("");
    }

    // Auto-reset preview state to keep UI synced with one-shot preview playback.
    previewUiResetTimeoutRef.current = setTimeout(function () {
      window.dispatchEvent(
        new CustomEvent(SAMPLE_SETTINGS_PREVIEW_STOP_EVENT, {
          detail: {
            channelId,
          },
        }),
      );
      setIsPreviewPlaying(false);
      previewUiResetTimeoutRef.current = null;
    }, 2600);
  }, [channelId, isPluginChannel, isPreviewPlaying, sampleRef, stopPreview]);

  useEffect(function () {
    // Cleanup when channel changes/unmounts.
    return function () {
      stopPreview();

      if (previewPluginContextRef.current) {
        try {
          previewPluginContextRef.current.close();
        } catch {
          // Ignore context close errors during teardown.
        }
        previewPluginContextRef.current = null;
      }

      if (previewSampleContextRef.current) {
        try {
          previewSampleContextRef.current.close();
        } catch {
          // Ignore context close errors during teardown.
        }
        previewSampleContextRef.current = null;
      }
    };
  }, [channelId, stopPreview]);

  return {
    isPreviewPlaying,
    onPreviewClick,
    stopPreview,
  };
}
