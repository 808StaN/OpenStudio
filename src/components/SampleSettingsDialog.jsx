import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { DEFAULT_SAMPLE_SETTINGS } from "../audio/domain/sampleSettings";
import { getPluginInstrument } from "../data/pluginInstruments";
import {
  SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
  SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
} from "./sample-settings/sampleSettingsConstants";
import { EnvelopeTabSection } from "./sample-settings/EnvelopeTabSection";
import { PluginSettingsSection } from "./sample-settings/PluginSettingsSection";
import { SampleTabSection } from "./sample-settings/SampleTabSection";
import { SampleSettingsTabs } from "./sample-settings/SampleSettingsTabs";
import { SampleWaveformCard } from "./sample-settings/SampleWaveformCard";
import { TimeStretchTabSection } from "./sample-settings/TimeStretchTabSection";
import {
  computePeakAbs,
  computeWaveformPeaks,
  getNormalizeGainFromPeakAbs,
  getSampleFileNameWithExtension,
  getWaveformDecodeContext,
} from "./sample-settings/sampleSettingsUtils";
import { assignSampleToChannel, setChannelSampleSettings } from "../store";
import { toSafeSampleUrl } from "../utils/sampleUrl";

export function SampleSettingsDialog({ channel }) {
  const dispatch = useDispatch();
  // BPM is required for displaying project-tempo aware stretch controls.
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const plugin = getPluginInstrument(channel.pluginRef);
  const isPluginChannel = Boolean(plugin && plugin.soundfont);
  const sampleRef = channel.sampleRef;
  const settings = {
    ...DEFAULT_SAMPLE_SETTINGS,
    ...(channel.sampleSettings || {}),
  };

  if (
    !Object.hasOwn(settings, "pitchCents") &&
    Object.hasOwn(settings, "pitchSemitones")
  ) {
    settings.pitchCents = Number(settings.pitchSemitones || 0) * 100;
  }

  const [peaks, setPeaks] = useState([]);
  const [waveformPeakAbs, setWaveformPeakAbs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [activeSampleTab, setActiveSampleTab] = useState("sample");
  const [openStretchSelect, setOpenStretchSelect] = useState(null);
  const stretchSelectsRef = useRef(null);
  // Preview refs are intentionally split so sample/plugin paths can be stopped independently.
  const previewSampleContextRef = useRef(null);
  const previewSampleNodeRef = useRef(null);
  const previewSampleStopTimeoutRef = useRef(null);
  const previewPluginContextRef = useRef(null);
  const previewPluginNodeRef = useRef(null);
  const previewPluginStopTimeoutRef = useRef(null);
  const previewUiResetTimeoutRef = useRef(null);

  const stopSamplePreview = function () {
    if (previewSampleStopTimeoutRef.current) {
      clearTimeout(previewSampleStopTimeoutRef.current);
      previewSampleStopTimeoutRef.current = null;
    }

    const node = previewSampleNodeRef.current;
    if (node && typeof node.stop === "function") {
      try {
        node.stop();
      } catch {
        // Node can already be stopped.
      }
    }

    previewSampleNodeRef.current = null;
  };

  const stopPluginPreview = function () {
    if (previewPluginStopTimeoutRef.current) {
      clearTimeout(previewPluginStopTimeoutRef.current);
      previewPluginStopTimeoutRef.current = null;
    }

    const node = previewPluginNodeRef.current;
    if (node && typeof node.stop === "function") {
      try {
        node.stop();
      } catch {
        // Node can already be stopped.
      }
    }

    previewPluginNodeRef.current = null;
  };

  const stopPreview = function () {
    if (previewUiResetTimeoutRef.current) {
      clearTimeout(previewUiResetTimeoutRef.current);
      previewUiResetTimeoutRef.current = null;
    }

    stopSamplePreview();
    stopPluginPreview();

    window.dispatchEvent(
      new CustomEvent(SAMPLE_SETTINGS_PREVIEW_STOP_EVENT, {
        detail: {
          channelId: channel.id,
        },
      }),
    );

    setIsPreviewPlaying(false);
  };

  useEffect(
    function () {
      // Dialog unmount cleanup: stop timers/nodes and close temporary AudioContexts.
      return function () {
        stopPreview();

        if (previewPluginContextRef.current) {
          try {
            previewPluginContextRef.current.close();
          } catch {
            // Ignore context close errors.
          }
          previewPluginContextRef.current = null;
        }

        if (previewSampleContextRef.current) {
          try {
            previewSampleContextRef.current.close();
          } catch {
            // Ignore context close errors.
          }
          previewSampleContextRef.current = null;
        }
      };
    },
    [channel.id],
  );

  useEffect(
    function () {
      // Whenever source changes, reset waveform state and preview lifecycle.
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
    [sampleRef, isPluginChannel],
  );

  useEffect(
    function () {
      // Reset UI tab/dropdown when target channel changes.
      setActiveSampleTab("sample");
      setOpenStretchSelect(null);
    },
    [channel.id, isPluginChannel],
  );

  useEffect(
    function () {
      // Close custom dropdown when user clicks outside of settings area.
      if (!openStretchSelect) {
        return;
      }

      const onPointerDown = function (event) {
        const root = stretchSelectsRef.current;
        if (!root) {
          return;
        }

        if (!root.contains(event.target)) {
          setOpenStretchSelect(null);
        }
      };

      window.addEventListener("mousedown", onPointerDown);
      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [openStretchSelect],
  );

  const fadeInWidthPct = useMemo(
    function () {
      return (settings.lengthPct * settings.fadeInPct) / 100;
    },
    [settings.fadeInPct, settings.lengthPct],
  );

  const fadeOutWidthPct = useMemo(
    function () {
      return (settings.lengthPct * settings.fadeOutPct) / 100;
    },
    [settings.fadeOutPct, settings.lengthPct],
  );

  const fadeOutStartPct = Math.max(0, settings.lengthPct - fadeOutWidthPct);
  const waveformNormalizeGain = getNormalizeGainFromPeakAbs(
    waveformPeakAbs,
    Boolean(settings.normalize),
  );

  const onSettingChange = function (changes) {
    // Centralized settings update keeps reducer payloads consistent.
    dispatch(
      setChannelSampleSettings({
        channelId: channel.id,
        changes,
      }),
    );
  };

  const getOptionLabel = function (options, value) {
    const safeValue = String(value || "");
    const match = options.find(function (option) {
      return option.value === safeValue;
    });
    return match?.label || safeValue;
  };

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
          channelId: channel.id,
          sampleRef: sampleRefValue,
          sampleName: payload.file,
        }),
      );
      setError("");
    } catch {
      return;
    }
  };

  const onPreviewClick = async function () {
    // Preview is event-driven to avoid interfering with main transport scheduler.
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
          channelId: channel.id,
        },
      }),
    );

    setIsPreviewPlaying(true);
    setError("");

    previewUiResetTimeoutRef.current = setTimeout(function () {
      window.dispatchEvent(
        new CustomEvent(SAMPLE_SETTINGS_PREVIEW_STOP_EVENT, {
          detail: {
            channelId: channel.id,
          },
        }),
      );
      setIsPreviewPlaying(false);
      previewUiResetTimeoutRef.current = null;
    }, 2600);
  };

  return (
    <section className="sample-settings-panel">
      {!isPluginChannel ? (
        <SampleSettingsTabs
          activeSampleTab={activeSampleTab}
          setActiveSampleTab={setActiveSampleTab}
        />
      ) : null}

      <SampleWaveformCard
        isPluginChannel={isPluginChannel}
        pluginName={plugin?.name}
        pluginDescription={plugin?.description}
        sampleRef={sampleRef}
        getSampleFileNameWithExtension={getSampleFileNameWithExtension}
        isPreviewPlaying={isPreviewPlaying}
        onPreviewClick={onPreviewClick}
        isDropTargetActive={isDropTargetActive}
        onWaveformDragOver={onWaveformDragOver}
        onWaveformDragLeave={onWaveformDragLeave}
        onWaveformDrop={onWaveformDrop}
        isLoading={isLoading}
        error={error}
        peaks={peaks}
        waveformNormalizeGain={waveformNormalizeGain}
        lengthPct={settings.lengthPct}
        fadeInWidthPct={fadeInWidthPct}
        fadeOutStartPct={fadeOutStartPct}
        fadeOutWidthPct={fadeOutWidthPct}
      />

      <div className="sample-settings-grid">
        {isPluginChannel ? (
          <PluginSettingsSection
            settings={settings}
            onSettingChange={onSettingChange}
          />
        ) : (
          <>
            {activeSampleTab === "sample" ? (
              <SampleTabSection
                settings={settings}
                onSettingChange={onSettingChange}
              />
            ) : activeSampleTab === "envelope" ? (
              <EnvelopeTabSection
                settings={settings}
                onSettingChange={onSettingChange}
              />
            ) : (
              <TimeStretchTabSection
                settings={settings}
                onSettingChange={onSettingChange}
                stretchSelectsRef={stretchSelectsRef}
                openStretchSelect={openStretchSelect}
                setOpenStretchSelect={setOpenStretchSelect}
                getOptionLabel={getOptionLabel}
                bpm={bpm}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

