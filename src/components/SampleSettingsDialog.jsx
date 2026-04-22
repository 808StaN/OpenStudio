import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { DEFAULT_SAMPLE_SETTINGS } from "../audio/domain/sampleSettings";
import { getPluginInstrument } from "../data/pluginInstruments";
import { EnvelopeTabSection } from "./sample-settings/EnvelopeTabSection";
import { PluginSettingsSection } from "./sample-settings/PluginSettingsSection";
import { SampleTabSection } from "./sample-settings/SampleTabSection";
import { SampleSettingsTabs } from "./sample-settings/SampleSettingsTabs";
import { SampleWaveformCard } from "./sample-settings/SampleWaveformCard";
import { TimeStretchTabSection } from "./sample-settings/TimeStretchTabSection";
import { useSampleSettingsPreview } from "./sample-settings/useSampleSettingsPreview";
import { useSampleWaveformState } from "./sample-settings/useSampleWaveformState";
import { getSampleFileNameWithExtension } from "./sample-settings/sampleSettingsUtils";
import { setChannelSampleSettings } from "../store";

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

  const [sampleTabState, setSampleTabState] = useState(function () {
    return {
      channelId: channel.id,
      tab: "sample",
    };
  });
  const [stretchSelectState, setStretchSelectState] = useState(function () {
    return {
      channelId: channel.id,
      value: null,
    };
  });
  const stretchSelectsRef = useRef(null);
  const { isPreviewPlaying, onPreviewClick, stopPreview } = useSampleSettingsPreview({
    channelId: channel.id,
    isPluginChannel,
    sampleRef,
  });
  const {
    peaks,
    isLoading,
    error,
    setError,
    isDropTargetActive,
    onWaveformDragOver,
    onWaveformDragLeave,
    onWaveformDrop,
    waveformNormalizeGain,
  } = useSampleWaveformState({
    channelId: channel.id,
    isPluginChannel,
    sampleRef,
    normalizeEnabled: settings.normalize,
    stopPreview,
  });
  const activeSampleTab =
    sampleTabState.channelId === channel.id ? sampleTabState.tab : "sample";
  const openStretchSelect =
    stretchSelectState.channelId === channel.id ? stretchSelectState.value : null;

  const setActiveSampleTab = function (nextTab) {
    // Scope UI tab state per-channel so switching channels auto-resets to default.
    setSampleTabState({
      channelId: channel.id,
      tab: nextTab,
    });
  };

  const setOpenStretchSelect = function (nextValue) {
    // Scope dropdown state per-channel to avoid stale open menus after channel switch.
    setStretchSelectState({
      channelId: channel.id,
      value: nextValue,
    });
  };

  const onPreviewClickHandler = function () {
    onPreviewClick(setError);
  };

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
          setStretchSelectState({
            channelId: channel.id,
            value: null,
          });
        }
      };

      window.addEventListener("mousedown", onPointerDown);
      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [channel.id, openStretchSelect],
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
        onPreviewClick={onPreviewClickHandler}
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

