import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { renderPlaylistArrangementToFile } from "../audio/exportProjectAudio";

const FORMAT_OPTIONS = [
  { value: "wav", label: "WAV" },
  { value: "mp3", label: "MP3" },
];

const MP3_BITRATE_OPTIONS = [96, 128, 160, 192, 256, 320];
const WAV_BIT_DEPTH_OPTIONS = [
  { value: 16, label: "16Bit int" },
  { value: 24, label: "24Bit int" },
  { value: 32, label: "32Bit float" },
];

function getDefaultFileName() {
  const now = new Date();
  const pad = function (value) {
    return String(value).padStart(2, "0");
  };

  const datePart =
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate());
  const timePart = pad(now.getHours()) + "-" + pad(now.getMinutes());

  return "OpenStudio-Render-" + datePart + "-" + timePart;
}

export function RenderWindow() {
  const [fileName, setFileName] = useState(getDefaultFileName);
  const [format, setFormat] = useState("wav");
  const [mp3BitrateKbps, setMp3BitrateKbps] = useState(320);
  const [wavBitDepth, setWavBitDepth] = useState(32);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const project = useSelector(function (state) {
    return state.daw.project;
  });
  const mixerInserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });

  const canRender = useMemo(
    function () {
      return !isRendering && String(fileName || "").trim().length > 0;
    },
    [isRendering, fileName],
  );

  const onRenderClick = async function () {
    if (!canRender) {
      return;
    }

    setIsRendering(true);
    setStatusMessage("Rendering arrangement from Playlist...");
    setErrorMessage("");

    try {
      const result = await renderPlaylistArrangementToFile({
        project,
        mixerInserts,
        bpm,
        fileName,
        format,
        mp3BitrateKbps,
        wavBitDepth,
      });

      const qualityLabel =
        format === "mp3"
          ? " @ " + result.mp3BitrateKbps + " kbps"
          : " @ " + result.wavBitDepthLabel;
      setStatusMessage(
        "Exported " +
          result.fileName +
          qualityLabel +
          " (" +
          result.durationSeconds.toFixed(2) +
          "s)",
      );
    } catch (error) {
      const message = String(error?.message || "Render failed");
      setErrorMessage(message);
      setStatusMessage("");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <section className="render-window-shell">
      <div className="render-window-row">
        <label className="render-window-label" htmlFor="render-file-name">
          File Name
        </label>
        <input
          id="render-file-name"
          className="render-window-input"
          value={fileName}
          onChange={function (event) {
            setFileName(event.target.value);
          }}
          placeholder="My Project Render"
        />
      </div>

      <div className="render-window-row">
        <label className="render-window-label" htmlFor="render-file-format">
          Format
        </label>
        <select
          id="render-file-format"
          className="render-window-select"
          value={format}
          onChange={function (event) {
            setFormat(event.target.value);
          }}
        >
          {FORMAT_OPTIONS.map(function (option) {
            return (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            );
          })}
        </select>
      </div>

      {format === "mp3" ? (
        <div className="render-window-row">
          <label className="render-window-label" htmlFor="render-mp3-bitrate">
            Quality (kbps)
          </label>
          <select
            id="render-mp3-bitrate"
            className="render-window-select"
            value={String(mp3BitrateKbps)}
            onChange={function (event) {
              setMp3BitrateKbps(Number(event.target.value));
            }}
          >
            {MP3_BITRATE_OPTIONS.map(function (option) {
              return (
                <option key={option} value={String(option)}>
                  {option} kbps
                </option>
              );
            })}
          </select>
        </div>
      ) : null}

      {format === "wav" ? (
        <div className="render-window-row">
          <label className="render-window-label" htmlFor="render-wav-bit-depth">
            Bit Depth
          </label>
          <select
            id="render-wav-bit-depth"
            className="render-window-select"
            value={String(wavBitDepth)}
            onChange={function (event) {
              setWavBitDepth(Number(event.target.value));
            }}
          >
            {WAV_BIT_DEPTH_OPTIONS.map(function (option) {
              return (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}

      <div className="render-window-actions">
        <button
          type="button"
          className="render-window-button"
          onClick={onRenderClick}
          disabled={!canRender}
        >
          {isRendering ? "Rendering..." : "Render Project"}
        </button>
      </div>

      {statusMessage ? (
        <p className="render-window-status">{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="render-window-error">{errorMessage}</p>
      ) : null}
    </section>
  );
}
