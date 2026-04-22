import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { DEFAULT_SAMPLE_SETTINGS } from "../audio/domain/sampleSettings";
import { getPluginInstrument } from "../data/pluginInstruments";
import {
  SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
  SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
  STRETCH_MODE_OPTIONS,
  STRETCH_TIME_MODE_OPTIONS,
} from "./sample-settings/sampleSettingsConstants";
import { SettingValueEditor } from "./sample-settings/SettingValueEditor";
import { SampleSettingsTabs } from "./sample-settings/SampleSettingsTabs";
import { SampleWaveformCard } from "./sample-settings/SampleWaveformCard";
import {
  buildEnvelopePath,
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
          <>
            <label className="sample-setting-row">
              <span>Attack</span>
              <input
                type="range"
                min="0"
                max="400"
                step="1"
                value={settings.attackMs}
                onChange={function (event) {
                  onSettingChange({ attackMs: Number(event.target.value) });
                }}
              />
              <SettingValueEditor
                value={settings.attackMs}
                min={0}
                max={400}
                step={1}
                suffix="ms"
                isSigned={false}
                onCommit={function (nextValue) {
                  onSettingChange({ attackMs: nextValue });
                }}
              />
            </label>

            <label className="sample-setting-row">
              <span>Release</span>
              <input
                type="range"
                min="0"
                max="1000"
                step="1"
                value={settings.releaseMs}
                onChange={function (event) {
                  onSettingChange({ releaseMs: Number(event.target.value) });
                }}
              />
              <SettingValueEditor
                value={settings.releaseMs}
                min={0}
                max={1000}
                step={1}
                suffix="ms"
                isSigned={false}
                onCommit={function (nextValue) {
                  onSettingChange({ releaseMs: nextValue });
                }}
              />
            </label>

            <label className="sample-setting-row">
              <span>Pitch</span>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={settings.pitchCents}
                onChange={function (event) {
                  onSettingChange({
                    pitchCents: Number(event.target.value),
                  });
                }}
              />
              <SettingValueEditor
                value={settings.pitchCents}
                min={-100}
                max={100}
                step={1}
                suffix="c"
                isSigned={true}
                onCommit={function (nextValue) {
                  onSettingChange({ pitchCents: nextValue });
                }}
              />
            </label>

            <label className="sample-setting-row cut-toggle">
              <span>Mono mode</span>
              <input
                type="checkbox"
                checked={Boolean(settings.monoMode)}
                onChange={function (event) {
                  onSettingChange({ monoMode: event.target.checked });
                }}
              />
            </label>
          </>
        ) : (
          <>
            {activeSampleTab === "sample" ? (
              <>
                <div className="sample-setting-toggle-row">
                  <label className="sample-setting-row cut-toggle">
                    <span>Cut itself</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.cutItself)}
                      onChange={function (event) {
                        onSettingChange({ cutItself: event.target.checked });
                      }}
                    />
                  </label>

                  <label className="sample-setting-row cut-toggle">
                    <span>Normalize</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.normalize)}
                      onChange={function (event) {
                        onSettingChange({ normalize: event.target.checked });
                      }}
                    />
                  </label>
                </div>

                <label className="sample-setting-row">
                  <span>Length</span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="1"
                    value={settings.lengthPct}
                    onChange={function (event) {
                      onSettingChange({
                        lengthPct: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.lengthPct}
                    min={5}
                    max={100}
                    step={1}
                    suffix="%"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ lengthPct: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>In</span>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    step="1"
                    value={settings.fadeInPct}
                    onChange={function (event) {
                      onSettingChange({
                        fadeInPct: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.fadeInPct}
                    min={0}
                    max={95}
                    step={1}
                    suffix="%"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ fadeInPct: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Out</span>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    step="1"
                    value={settings.fadeOutPct}
                    onChange={function (event) {
                      onSettingChange({
                        fadeOutPct: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.fadeOutPct}
                    min={0}
                    max={95}
                    step={1}
                    suffix="%"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ fadeOutPct: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Pitch</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={settings.pitchCents}
                    onChange={function (event) {
                      onSettingChange({
                        pitchCents: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.pitchCents}
                    min={-100}
                    max={100}
                    step={1}
                    suffix="c"
                    isSigned={true}
                    onCommit={function (nextValue) {
                      onSettingChange({ pitchCents: nextValue });
                    }}
                  />
                </label>
              </>
            ) : activeSampleTab === "envelope" ? (
              <>
                <section className="sample-envelope-panel">
                  <header className="sample-envelope-header">
                    <span>Volume Envelope</span>
                    <label className="sample-envelope-enable">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.envEnabled)}
                        onChange={function (event) {
                          onSettingChange({ envEnabled: event.target.checked });
                        }}
                      />
                    </label>
                  </header>
                  <div className="sample-envelope-graph">
                    <svg viewBox="0 0 276 92" preserveAspectRatio="none">
                      <path d={buildEnvelopePath(settings)} />
                    </svg>
                  </div>
                </section>

                <label className="sample-setting-row">
                  <span>Delay</span>
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="1"
                    value={settings.envDelayMs}
                    onChange={function (event) {
                      onSettingChange({
                        envDelayMs: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envDelayMs}
                    min={0}
                    max={3000}
                    step={1}
                    suffix="ms"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envDelayMs: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Attack</span>
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="1"
                    value={settings.envAttackMs}
                    onChange={function (event) {
                      onSettingChange({
                        envAttackMs: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envAttackMs}
                    min={0}
                    max={3000}
                    step={1}
                    suffix="ms"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envAttackMs: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Hold</span>
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="1"
                    value={settings.envHoldMs}
                    onChange={function (event) {
                      onSettingChange({
                        envHoldMs: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envHoldMs}
                    min={0}
                    max={3000}
                    step={1}
                    suffix="ms"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envHoldMs: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Decay</span>
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="1"
                    value={settings.envDecayMs}
                    onChange={function (event) {
                      onSettingChange({
                        envDecayMs: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envDecayMs}
                    min={0}
                    max={3000}
                    step={1}
                    suffix="ms"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envDecayMs: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Sustain</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.envSustainPct}
                    onChange={function (event) {
                      onSettingChange({
                        envSustainPct: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envSustainPct}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envSustainPct: nextValue });
                    }}
                  />
                </label>

                <label className="sample-setting-row">
                  <span>Release</span>
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="1"
                    value={settings.envReleaseMs}
                    onChange={function (event) {
                      onSettingChange({
                        envReleaseMs: Number(event.target.value),
                      });
                    }}
                  />
                  <SettingValueEditor
                    value={settings.envReleaseMs}
                    min={0}
                    max={3000}
                    step={1}
                    suffix="ms"
                    isSigned={false}
                    onCommit={function (nextValue) {
                      onSettingChange({ envReleaseMs: nextValue });
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <section className="sample-time-stretch-panel">
                  <header className="sample-time-stretch-header">
                    <span>Time stretching</span>
                  </header>

                  <div className="sample-time-stretch-knobs">
                    <label className="sample-time-knob-row">
                      <span>PITCH</span>
                      <input
                        type="range"
                        min="-24"
                        max="24"
                        step="0.01"
                        value={Number(settings.stretchPitchSemitones || 0)}
                        onChange={function (event) {
                          onSettingChange({
                            stretchPitchSemitones: Number(event.target.value),
                          });
                        }}
                      />
                      <SettingValueEditor
                        value={Number(settings.stretchPitchSemitones || 0)}
                        min={-24}
                        max={24}
                        step={0.01}
                        suffix="st"
                        isSigned={true}
                        onCommit={function (nextValue) {
                          onSettingChange({ stretchPitchSemitones: nextValue });
                        }}
                      />
                    </label>

                    <label className="sample-time-knob-row">
                      <span>MUL</span>
                      <input
                        type="range"
                        min="0.25"
                        max="8"
                        step="0.01"
                        value={Number(settings.stretchMultiplier || 1)}
                        onChange={function (event) {
                          onSettingChange({
                            stretchMultiplier: Number(event.target.value),
                          });
                        }}
                      />
                      <SettingValueEditor
                        value={Number(settings.stretchMultiplier || 1)}
                        min={0.25}
                        max={8}
                        step={0.01}
                        suffix="x"
                        isSigned={false}
                        onCommit={function (nextValue) {
                          onSettingChange({ stretchMultiplier: nextValue });
                        }}
                      />
                    </label>
                  </div>

                  <div className="sample-time-stretch-selects" ref={stretchSelectsRef}>
                    <label className="sample-time-select-row">
                      <span>TIME</span>
                      <div
                        className={
                          "sample-time-select-control rack-modern-select" +
                          (openStretchSelect === "time" ? " is-open" : "")
                        }
                      >
                        <button
                          type="button"
                          className="rack-modern-select-trigger"
                          aria-label="Time stretch mode"
                          onClick={function () {
                            setOpenStretchSelect(function (value) {
                              return value === "time" ? null : "time";
                            });
                          }}
                        >
                          <span className="rack-modern-select-value">
                            {getOptionLabel(
                              STRETCH_TIME_MODE_OPTIONS,
                              String(settings.stretchTimeMode || "none"),
                            )}
                          </span>
                          <span className="rack-modern-select-caret">v</span>
                        </button>
                        {openStretchSelect === "time" ? (
                          <div className="rack-modern-select-dropdown">
                            {STRETCH_TIME_MODE_OPTIONS.map(function (option) {
                              const isActive =
                                option.value ===
                                String(settings.stretchTimeMode || "none");
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={
                                    "rack-modern-select-option" +
                                    (isActive ? " is-active" : "")
                                  }
                                  onClick={function () {
                                    const nextMode = option.value;
                                    const changes = {
                                      stretchTimeMode: nextMode,
                                    };

                                    if (nextMode === "project-tempo") {
                                      changes.stretchProjectTempoBpm = Number(
                                        bpm || 120,
                                      );
                                    }

                                    onSettingChange(changes);
                                    setOpenStretchSelect(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </label>

                    <label className="sample-time-select-row">
                      <span>Mode</span>
                      <div
                        className={
                          "sample-time-select-control rack-modern-select" +
                          (openStretchSelect === "mode" ? " is-open" : "")
                        }
                      >
                        <button
                          type="button"
                          className="rack-modern-select-trigger"
                          aria-label="Time stretch algorithm"
                          onClick={function () {
                            setOpenStretchSelect(function (value) {
                              return value === "mode" ? null : "mode";
                            });
                          }}
                        >
                          <span className="rack-modern-select-value">
                            {getOptionLabel(
                              STRETCH_MODE_OPTIONS,
                              String(settings.stretchMode || "resample"),
                            )}
                          </span>
                          <span className="rack-modern-select-caret">v</span>
                        </button>
                        {openStretchSelect === "mode" ? (
                          <div className="rack-modern-select-dropdown">
                            {STRETCH_MODE_OPTIONS.map(function (option) {
                              const isActive =
                                option.value ===
                                String(settings.stretchMode || "resample");
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={
                                    "rack-modern-select-option" +
                                    (isActive ? " is-active" : "")
                                  }
                                  onClick={function () {
                                    onSettingChange({ stretchMode: option.value });
                                    setOpenStretchSelect(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  </div>

                  {String(settings.stretchTimeMode || "none") === "set-bpm" ? (
                    <label className="sample-setting-row">
                      <span>Set BPM</span>
                      <input
                        type="range"
                        min="20"
                        max="300"
                        step="1"
                        value={Number(settings.stretchSourceBpm || 120)}
                        onChange={function (event) {
                          onSettingChange({
                            stretchSourceBpm: Number(event.target.value),
                          });
                        }}
                      />
                      <SettingValueEditor
                        value={Number(settings.stretchSourceBpm || 120)}
                        min={20}
                        max={300}
                        step={1}
                        suffix=" bpm"
                        isSigned={false}
                        onCommit={function (nextValue) {
                          onSettingChange({ stretchSourceBpm: nextValue });
                        }}
                      />
                    </label>
                  ) : null}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

