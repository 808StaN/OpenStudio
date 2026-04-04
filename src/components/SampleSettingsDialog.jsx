import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { assignSampleToChannel, setChannelSampleSettings } from "../store";

let waveformDecodeContext = null;

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

export function SampleSettingsDialog({ channel }) {
  const dispatch = useDispatch();
  const sampleRef = channel.sampleRef;
  const settings = channel.sampleSettings || {
    cutItself: false,
    lengthPct: 100,
    fadeInPct: 0,
    fadeOutPct: 0,
  };

  const [peaks, setPeaks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef(null);

  const stopPreviewAudio = function () {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);
  };

  useEffect(function () {
    return function () {
      const audio = previewAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.onended = null;
        previewAudioRef.current = null;
      }
    };
  }, []);

  useEffect(
    function () {
      stopPreviewAudio();

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
    [sampleRef],
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
    event.preventDefault();
    if (!isDropTargetActive) {
      setIsDropTargetActive(true);
    }
  };

  const onWaveformDragLeave = function () {
    setIsDropTargetActive(false);
  };

  const onWaveformDrop = function (event) {
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
    if (!sampleRef) {
      return;
    }

    if (isPreviewPlaying) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();

    const audio = new Audio(sampleRef);
    audio.onended = function () {
      setIsPreviewPlaying(false);
      previewAudioRef.current = null;
    };
    previewAudioRef.current = audio;

    try {
      await audio.play();
      setIsPreviewPlaying(true);
    } catch {
      setError("Cannot preview this sample");
      setIsPreviewPlaying(false);
      previewAudioRef.current = null;
    }
  };

  return (
    <section className="sample-settings-panel">
      <header className="sample-settings-header">
        <h3>{channel.name} Sample</h3>
      </header>

      <div className="sample-waveform-card">
        <div className="sample-waveform-title-row">
          <div className="sample-waveform-title">
            {sampleRef ? sampleRef.split("/").pop() : "No sample loaded"}
          </div>
          <button
            type="button"
            className={
              "sample-preview-btn" + (isPreviewPlaying ? " is-playing" : "")
            }
            onClick={function () {
              void onPreviewClick();
            }}
            disabled={!sampleRef}
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
          {isLoading ? (
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
          <strong>{Math.round(settings.lengthPct)}%</strong>
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
          <strong>{Math.round(settings.fadeInPct)}%</strong>
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
          <strong>{Math.round(settings.fadeOutPct)}%</strong>
        </label>
      </div>
    </section>
  );
}
