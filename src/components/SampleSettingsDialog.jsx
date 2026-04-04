import Soundfont from "soundfont-player";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { getPluginInstrument } from "../data/pluginInstruments";
import { assignSampleToChannel, setChannelSampleSettings } from "../store";

let waveformDecodeContext = null;
const PREVIEW_C5_MIDI = 72;

const defaultChannelSettings = {
  cutItself: false,
  normalize: false,
  lengthPct: 100,
  fadeInPct: 0,
  fadeOutPct: 0,
  envDelayMs: 0,
  envAttackMs: 0,
  envHoldMs: 0,
  envDecayMs: 0,
  envSustainPct: 100,
  envReleaseMs: 0,
  attackMs: 8,
  releaseMs: 420,
  pitchCents: 0,
  monoMode: false,
};

function getWaveformDecodeContext() {
  if (!waveformDecodeContext) {
    waveformDecodeContext = new AudioContext();
  }
  return waveformDecodeContext;
}

function computeWaveformPeaks(channelData, bucketCount) {
  if (!channelData || channelData.length === 0 || bucketCount <= 0) {
    return [];
  }

  const samplesPerBucket = Math.max(
    1,
    Math.floor(channelData.length / bucketCount),
  );
  const peaks = [];

  for (let i = 0; i < bucketCount; i += 1) {
    const start = i * samplesPerBucket;
    const end =
      i === bucketCount - 1
        ? channelData.length
        : Math.min(channelData.length, start + samplesPerBucket);

    let peak = 0;
    for (let p = start; p < end; p += 1) {
      const value = Math.abs(channelData[p]);
      if (value > peak) {
        peak = value;
      }
    }

    peaks.push(peak);
  }

  return peaks;
}

function clampSettingValue(rawValue, min, max, step) {
  if (!Number.isFinite(rawValue)) {
    return min;
  }

  const clamped = Math.max(min, Math.min(max, rawValue));
  if (!Number.isFinite(step) || step <= 0) {
    return clamped;
  }

  const snapped = Math.round((clamped - min) / step) * step + min;
  return Number(snapped.toFixed(4));
}

function applyVolumeEnvelopeToGain(gainParam, startTime, duration, settings) {
  const minGain = 0.0001;
  const envDelay = Math.max(0, Number(settings.envDelayMs ?? 0) / 1000);
  const envAttack = Math.max(0, Number(settings.envAttackMs ?? 0) / 1000);
  const envHold = Math.max(0, Number(settings.envHoldMs ?? 0) / 1000);
  const envDecay = Math.max(0, Number(settings.envDecayMs ?? 0) / 1000);
  const envRelease = Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000);
  const envSustain = Math.max(
    minGain,
    Math.min(1, Number(settings.envSustainPct ?? 100) / 100),
  );

  const envelopeSegmentTotal =
    envDelay + envAttack + envHold + envDecay + envRelease;
  const envelopeScale =
    envelopeSegmentTotal > duration && envelopeSegmentTotal > 0
      ? duration / envelopeSegmentTotal
      : 1;

  const delaySec = envDelay * envelopeScale;
  const attackSec = envAttack * envelopeScale;
  const holdSec = envHold * envelopeScale;
  const decaySec = envDecay * envelopeScale;
  const releaseSec = envRelease * envelopeScale;
  const sustainSec = Math.max(
    0,
    duration - (delaySec + attackSec + holdSec + decaySec + releaseSec),
  );

  const delayEnd = startTime + delaySec;
  const attackEnd = delayEnd + attackSec;
  const holdEnd = attackEnd + holdSec;
  const decayEnd = holdEnd + decaySec;
  const sustainEnd = decayEnd + sustainSec;
  const releaseEnd = sustainEnd + releaseSec;

  gainParam.cancelScheduledValues(startTime);
  gainParam.setValueAtTime(minGain, startTime);

  if (delaySec > 0.0005) {
    gainParam.setValueAtTime(minGain, delayEnd);
  }

  if (attackSec > 0.0005) {
    gainParam.linearRampToValueAtTime(1, attackEnd);
  } else {
    gainParam.setValueAtTime(1, delayEnd);
  }

  if (holdSec > 0.0005) {
    gainParam.setValueAtTime(1, holdEnd);
  }

  if (decaySec > 0.0005) {
    gainParam.linearRampToValueAtTime(envSustain, decayEnd);
  } else {
    gainParam.setValueAtTime(envSustain, holdEnd);
  }

  gainParam.setValueAtTime(envSustain, sustainEnd);

  if (releaseSec > 0.0005) {
    gainParam.linearRampToValueAtTime(minGain, releaseEnd);
  } else {
    gainParam.setValueAtTime(minGain, sustainEnd);
  }
}

function buildEnvelopePath(settings) {
  const width = 276;
  const height = 92;
  const padX = 8;
  const padY = 8;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const sustain = Math.max(0, Math.min(1, Number(settings.envSustainPct ?? 100) / 100));

  const delay = Math.max(0, Number(settings.envDelayMs ?? 0));
  const attack = Math.max(0, Number(settings.envAttackMs ?? 0));
  const hold = Math.max(0, Number(settings.envHoldMs ?? 0));
  const decay = Math.max(0, Number(settings.envDecayMs ?? 0));
  const release = Math.max(0, Number(settings.envReleaseMs ?? 0));

  const sustainSlot = 280;
  const total = Math.max(1, delay + attack + hold + decay + sustainSlot + release);

  const x0 = 0;
  const x1 = delay / total;
  const x2 = (delay + attack) / total;
  const x3 = (delay + attack + hold) / total;
  const x4 = (delay + attack + hold + decay) / total;
  const x5 = (delay + attack + hold + decay + sustainSlot) / total;
  const x6 = 1;

  const yBottom = 1;
  const yTop = 0;
  const ySustain = 1 - sustain;

  const points = [
    [x0, yBottom],
    [x1, yBottom],
    [x2, yTop],
    [x3, yTop],
    [x4, ySustain],
    [x5, ySustain],
    [x6, yBottom],
  ];

  return points
    .map(function (point, index) {
      const px = padX + point[0] * plotW;
      const py = padY + point[1] * plotH;
      return (index === 0 ? "M " : "L ") + px.toFixed(2) + " " + py.toFixed(2);
    })
    .join(" ");
}

function getSampleFileNameWithExtension(sampleRef) {
  const raw = String(sampleRef || "").trim();
  if (!raw) {
    return "No sample loaded";
  }

  const leaf = raw.split("/").pop() || raw;

  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

function formatSettingValue(value, suffix, isSigned) {
  const rounded = Math.round(Number(value) || 0);
  if (isSigned) {
    return (rounded > 0 ? "+" : "") + rounded + suffix;
  }

  return rounded + suffix;
}

function SettingValueEditor({
  value,
  min,
  max,
  step,
  suffix,
  isSigned,
  onCommit,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(Number(value) || 0)));

  useEffect(
    function () {
      if (!isEditing) {
        setDraft(String(Math.round(Number(value) || 0)));
      }
    },
    [isEditing, value],
  );

  const commitDraft = function () {
    const parsed = Number(draft);
    const next = clampSettingValue(parsed, min, max, step);
    onCommit(next);
    setIsEditing(false);
  };

  if (isEditing) {
    const visibleChars = Math.max(1, String(draft || "").length);

    return (
      <input
        type="number"
        className="sample-setting-inline-input"
        style={{ "--digits": visibleChars }}
        min={min}
        max={max}
        step={step}
        value={draft}
        autoFocus
        onChange={function (event) {
          setDraft(event.target.value);
        }}
        onBlur={commitDraft}
        onKeyDown={function (event) {
          if (event.key === "Enter") {
            commitDraft();
            return;
          }

          if (event.key === "Escape") {
            setDraft(String(Math.round(Number(value) || 0)));
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <strong
      className="sample-setting-value"
      title="Double click to type value"
      onDoubleClick={function () {
        setDraft(String(Math.round(Number(value) || 0)));
        setIsEditing(true);
      }}
    >
      {formatSettingValue(value, suffix, isSigned)}
    </strong>
  );
}

export function SampleSettingsDialog({ channel }) {
  const dispatch = useDispatch();
  const plugin = getPluginInstrument(channel.pluginRef);
  const isPluginChannel = Boolean(plugin && plugin.soundfont);
  const sampleRef = channel.sampleRef;
  const settings = {
    ...defaultChannelSettings,
    ...(channel.sampleSettings || {}),
  };

  if (
    !Object.hasOwn(settings, "pitchCents") &&
    Object.hasOwn(settings, "pitchSemitones")
  ) {
    settings.pitchCents = Number(settings.pitchSemitones || 0) * 100;
  }

  const [peaks, setPeaks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [activeSampleTab, setActiveSampleTab] = useState("sample");
  const previewSampleContextRef = useRef(null);
  const previewSampleBufferCacheRef = useRef(new Map());
  const previewSamplePendingRef = useRef(new Map());
  const previewSampleGainRef = useRef(new WeakMap());
  const previewSampleNodeRef = useRef(null);
  const previewSampleStopTimeoutRef = useRef(null);
  const previewPluginContextRef = useRef(null);
  const previewPluginInstrumentsRef = useRef(new Map());
  const previewPluginPendingRef = useRef(new Map());
  const previewPluginNodeRef = useRef(null);
  const previewPluginStopTimeoutRef = useRef(null);

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
    stopSamplePreview();
    stopPluginPreview();
    setIsPreviewPlaying(false);
  };

  const ensurePluginPreviewContext = function () {
    if (!previewPluginContextRef.current) {
      previewPluginContextRef.current = new AudioContext();
    }

    return previewPluginContextRef.current;
  };

  const ensureSamplePreviewContext = function () {
    if (!previewSampleContextRef.current) {
      previewSampleContextRef.current = new AudioContext();
    }

    return previewSampleContextRef.current;
  };

  const getPreviewSampleBuffer = async function (sampleUrl) {
    const key = String(sampleUrl || "").trim();
    if (!key) {
      return null;
    }

    const cached = previewSampleBufferCacheRef.current.get(key);
    if (cached) {
      return cached;
    }

    const pending = previewSamplePendingRef.current.get(key);
    if (pending) {
      return pending;
    }

    const request = (async function () {
      const context = ensureSamplePreviewContext();
      const response = await fetch(key);
      if (!response.ok) {
        throw new Error("Sample fetch failed");
      }

      const payload = await response.arrayBuffer();
      const decoded = await context.decodeAudioData(payload.slice(0));
      previewSampleBufferCacheRef.current.set(key, decoded);
      return decoded;
    })()
      .catch(function () {
        return null;
      })
      .finally(function () {
        previewSamplePendingRef.current.delete(key);
      });

    previewSamplePendingRef.current.set(key, request);
    return request;
  };

  const getPreviewPluginInstrument = async function () {
    if (!plugin || !plugin.soundfont) {
      return null;
    }

    const key = plugin.pluginRef;
    const cached = previewPluginInstrumentsRef.current.get(key);
    if (cached) {
      return cached;
    }

    const pending = previewPluginPendingRef.current.get(key);
    if (pending) {
      return pending;
    }

    const context = ensurePluginPreviewContext();
    const request = Soundfont.instrument(context, plugin.soundfont, {
      destination: context.destination,
    })
      .then(function (instrument) {
        previewPluginInstrumentsRef.current.set(key, instrument);
        return instrument;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        previewPluginPendingRef.current.delete(key);
      });

    previewPluginPendingRef.current.set(key, request);
    return request;
  };

  useEffect(
    function () {
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
      stopPreview();

      if (isPluginChannel) {
        setPeaks([]);
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
          const response = await fetch(sampleRef);
          if (!response.ok) {
            throw new Error("Sample fetch failed");
          }

          const buffer = await response.arrayBuffer();
          const decodeCtx = getWaveformDecodeContext();
          const decoded = await decodeCtx.decodeAudioData(buffer.slice(0));
          const primaryChannel = decoded.getChannelData(0);
          const waveformPeaks = computeWaveformPeaks(primaryChannel, 180);

          if (cancelled) {
            return;
          }

          setPeaks(waveformPeaks);
          setIsLoading(false);
        } catch {
          if (cancelled) {
            return;
          }
          setIsLoading(false);
          setPeaks([]);
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
      setActiveSampleTab("sample");
    },
    [channel.id, isPluginChannel],
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
    dispatch(
      setChannelSampleSettings({
        channelId: channel.id,
        changes,
      }),
    );
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
    if (isPluginChannel) {
      if (isPreviewPlaying) {
        stopPreview();
        return;
      }

      stopPreview();

      const context = ensurePluginPreviewContext();
      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch {
          setError("Cannot preview this instrument");
          return;
        }
      }

      const instrument = await getPreviewPluginInstrument();
      if (!instrument) {
        setError("Cannot load this instrument");
        return;
      }

      const previewPitch = Math.max(
        0,
        Math.min(127, PREVIEW_C5_MIDI + Number(settings.pitchCents || 0) / 100),
      );
      const attackSec = Math.max(0, Number(settings.attackMs || 0) / 1000);
      const releaseSec = Math.max(0, Number(settings.releaseMs ?? 420) / 1000);
      const previewDuration = Math.max(0.18, 0.45 + releaseSec);

      if (settings.monoMode) {
        stopPluginPreview();
      }

      try {
        const node = instrument.play(previewPitch, context.currentTime, {
          duration: previewDuration,
          gain: Math.max(0.05, Number(channel.volume ?? 0.7) * 0.24),
          pan: Math.max(-1, Math.min(1, Number(channel.pan ?? 0))),
          attack: attackSec,
          release: releaseSec,
          destination: context.destination,
        });

        previewPluginNodeRef.current = node;
        setIsPreviewPlaying(true);
        setError("");

        previewPluginStopTimeoutRef.current = setTimeout(
          function () {
            previewPluginNodeRef.current = null;
            setIsPreviewPlaying(false);
          },
          Math.round(previewDuration * 1000) + 220,
        );
      } catch {
        setError("Cannot preview this instrument");
        stopPluginPreview();
        setIsPreviewPlaying(false);
      }

      return;
    }

    if (!sampleRef) {
      return;
    }

    if (isPreviewPlaying) {
      stopPreview();
      return;
    }

    stopPreview();

    try {
      const context = ensureSamplePreviewContext();
      if (context.state === "suspended") {
        await context.resume();
      }

      const sampleBuffer = await getPreviewSampleBuffer(sampleRef);
      if (!sampleBuffer) {
        setError("Cannot preview this sample");
        return;
      }

      let peak = 0;
      const normalizeCached = previewSampleGainRef.current.get(sampleBuffer);
      let normalizeGain = normalizeCached;

      if (!Number.isFinite(normalizeGain)) {
        const channelsCount = Math.max(
          1,
          Number(sampleBuffer.numberOfChannels || 1),
        );

        for (let ch = 0; ch < channelsCount; ch += 1) {
          const channelData = sampleBuffer.getChannelData(ch);
          const step = Math.max(1, Math.floor(channelData.length / 64000));

          for (let i = 0; i < channelData.length; i += step) {
            const abs = Math.abs(channelData[i]);
            if (abs > peak) {
              peak = abs;
            }
          }
        }

        normalizeGain =
          peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;
        previewSampleGainRef.current.set(sampleBuffer, normalizeGain);
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      const envelopeGain = context.createGain();
      const panner = context.createStereoPanner();

      const sampleReadDuration = Math.max(
        0.01,
        sampleBuffer.duration * (settings.lengthPct / 100),
      );
      const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
      const playbackRate = Math.max(0.125, Math.min(8, pitchRate));
      const playDuration = Math.max(0.01, sampleReadDuration / playbackRate);
      const fadeInSec = playDuration * (settings.fadeInPct / 100);
      const fadeOutSec = playDuration * (settings.fadeOutPct / 100);
      const fadeTotal = fadeInSec + fadeOutSec;
      const fadeScale =
        fadeTotal > playDuration * 0.98 ? (playDuration * 0.98) / fadeTotal : 1;
      const finalFadeIn = fadeInSec * fadeScale;
      const finalFadeOut = fadeOutSec * fadeScale;
      const stopAt = context.currentTime + playDuration;
      const fadeOutStart = Math.max(context.currentTime, stopAt - finalFadeOut);
      const baseGain = Math.max(0.05, Number(channel.volume ?? 0.7) * 0.55);
      const finalGain = baseGain * (settings.normalize ? normalizeGain : 1);

      source.buffer = sampleBuffer;
      source.playbackRate.setValueAtTime(playbackRate, context.currentTime);

      if (finalFadeIn > 0.001) {
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.linearRampToValueAtTime(
          finalGain,
          context.currentTime + finalFadeIn,
        );
      } else {
        gain.gain.setValueAtTime(finalGain, context.currentTime);
      }

      gain.gain.setValueAtTime(finalGain, fadeOutStart);
      if (finalFadeOut > 0.001) {
        gain.gain.linearRampToValueAtTime(0.0001, stopAt);
      } else {
        gain.gain.setValueAtTime(0.0001, stopAt);
      }

      panner.pan.setValueAtTime(
        Math.max(-1, Math.min(1, Number(channel.pan ?? 0))),
        context.currentTime,
      );

      source.connect(gain);
      gain.connect(envelopeGain);
      applyVolumeEnvelopeToGain(
        envelopeGain.gain,
        context.currentTime,
        playDuration,
        settings,
      );
      envelopeGain.connect(panner);
      panner.connect(context.destination);

      previewSampleNodeRef.current = source;
      source.onended = function () {
        if (previewSampleNodeRef.current === source) {
          previewSampleNodeRef.current = null;
          setIsPreviewPlaying(false);
        }
      };

      source.start(
        context.currentTime,
        0,
        Math.min(sampleReadDuration, sampleBuffer.duration),
      );
      source.stop(stopAt + 0.005);

      previewSampleStopTimeoutRef.current = setTimeout(
        function () {
          if (previewSampleNodeRef.current === source) {
            previewSampleNodeRef.current = null;
            setIsPreviewPlaying(false);
          }
        },
        Math.round(playDuration * 1000) + 180,
      );

      setIsPreviewPlaying(true);
      setError("");
    } catch {
      setError("Cannot preview this sample");
      setIsPreviewPlaying(false);
      previewSampleNodeRef.current = null;
    }
  };

  return (
    <section className="sample-settings-panel">
      {!isPluginChannel ? (
        <div
          className="sample-settings-tabs"
          role="tablist"
          aria-label="Sample settings tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSampleTab === "sample"}
            className={
              "sample-settings-tab" +
              (activeSampleTab === "sample" ? " is-active" : "")
            }
            onClick={function () {
              setActiveSampleTab("sample");
            }}
          >
            Sample Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSampleTab === "envelope"}
            className={
              "sample-settings-tab" +
              (activeSampleTab === "envelope" ? " is-active" : "")
            }
            onClick={function () {
              setActiveSampleTab("envelope");
            }}
          >
            Envelope
          </button>
        </div>
      ) : null}

      <div className="sample-waveform-card">
        <div className="sample-waveform-title-row">
          <div className="sample-waveform-title">
            {isPluginChannel
              ? plugin?.name || "Instrument"
              : getSampleFileNameWithExtension(sampleRef)}
          </div>
          <button
            type="button"
            className={
              "sample-preview-btn" + (isPreviewPlaying ? " is-playing" : "")
            }
            onClick={function () {
              void onPreviewClick();
            }}
            disabled={!isPluginChannel && !sampleRef}
          >
            {isPreviewPlaying ? "Stop" : "Play"}
          </button>
        </div>

        <div
          className={
            "sample-waveform-view" +
            (isDropTargetActive ? " is-drop-target" : "")
          }
          onDragOver={onWaveformDragOver}
          onDragLeave={onWaveformDragLeave}
          onDrop={onWaveformDrop}
        >
          {isPluginChannel ? (
            <div className="sample-waveform-empty">
              {plugin?.description || "Drag plugin onto Channel Rack"}
            </div>
          ) : isLoading ? (
            <div className="sample-waveform-empty">Loading waveform...</div>
          ) : error ? (
            <div className="sample-waveform-empty">{error}</div>
          ) : (
            <>
              <svg
                className="sample-waveform-svg"
                viewBox="0 0 180 54"
                preserveAspectRatio="none"
              >
                {peaks.map(function (peak, index) {
                  const normalized = Math.max(0.02, Math.min(1, peak));
                  const halfHeight = normalized * 22;
                  const x = index + 0.5;
                  return (
                    <line
                      key={index}
                      x1={x}
                      x2={x}
                      y1={27 - halfHeight}
                      y2={27 + halfHeight}
                    />
                  );
                })}
              </svg>

              <div
                className="sample-waveform-active-length"
                style={{ width: settings.lengthPct + "%" }}
              />
              <div
                className="sample-waveform-trimmed"
                style={{ left: settings.lengthPct + "%" }}
              />
              <div
                className="sample-waveform-fade fade-in"
                style={{ width: fadeInWidthPct + "%" }}
              />
              <div
                className="sample-waveform-fade fade-out"
                style={{
                  left: fadeOutStartPct + "%",
                  width: fadeOutWidthPct + "%",
                }}
              />
            </>
          )}
        </div>
      </div>

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
                      onSettingChange({ lengthPct: Number(event.target.value) });
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
                      onSettingChange({ fadeInPct: Number(event.target.value) });
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
                      onSettingChange({ fadeOutPct: Number(event.target.value) });
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
                      onSettingChange({ pitchCents: Number(event.target.value) });
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
            ) : (
              <>
                <section className="sample-envelope-panel">
                  <header className="sample-envelope-header">
                    <span>Volume Envelope</span>
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
                      onSettingChange({ envDelayMs: Number(event.target.value) });
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
                      onSettingChange({ envAttackMs: Number(event.target.value) });
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
                      onSettingChange({ envHoldMs: Number(event.target.value) });
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
                      onSettingChange({ envDecayMs: Number(event.target.value) });
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
                      onSettingChange({ envSustainPct: Number(event.target.value) });
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
                      onSettingChange({ envReleaseMs: Number(event.target.value) });
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
            )}
          </>
        )}
      </div>
    </section>
  );
}
