import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

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

function RenderSelect(props) {
  const { value, options, onChange, ariaLabel } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef(null);

  useEffect(
    function () {
      if (isOpen && rootRef.current) {
        const triggerRect = rootRef.current.getBoundingClientRect();
        const windowContent = rootRef.current.closest(".window-content");
        const contentRect = windowContent
          ? windowContent.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };
        const estimatedMenuHeight = Math.min(options.length * 30 + 12, 180);
        const spaceBelow = contentRect.bottom - triggerRect.bottom;
        const spaceAbove = triggerRect.top - contentRect.top;
        setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
      }

      if (!isOpen) {
        return;
      }

      const handlePointerDown = function (event) {
        if (!rootRef.current) {
          return;
        }
        if (!rootRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };

      const handleEscape = function (event) {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleEscape);
      return function () {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleEscape);
      };
    },
    [isOpen],
  );

  const activeOption =
    options.find(function (option) {
      return option.value === value;
    }) || options[0];

  return (
    <div className="render-select-menu" ref={rootRef}>
      <button
        type="button"
        className={"render-select-trigger" + (isOpen ? " is-open" : "")}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={function () {
          setIsOpen(function (current) {
            return !current;
          });
        }}
      >
        <span className="render-select-value">{activeOption ? activeOption.label : ""}</span>
        <span className="render-select-caret" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className={"render-select-dropdown" + (openUpward ? " is-upward" : "")}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map(function (option) {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={"render-select-option" + (isActive ? " is-active" : "")}
                role="option"
                aria-selected={isActive}
                onClick={function () {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
      const { renderPlaylistArrangementToFile } = await import(
        "../audio/exportProjectAudio"
      );
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
        <label className="render-window-label">
          Format
        </label>
        <RenderSelect
          value={format}
          options={FORMAT_OPTIONS}
          ariaLabel="Format"
          onChange={setFormat}
        />
      </div>

      {format === "mp3" ? (
        <div className="render-window-row">
          <label className="render-window-label">
            Quality (kbps)
          </label>
          <RenderSelect
            value={String(mp3BitrateKbps)}
            ariaLabel="Quality"
            options={MP3_BITRATE_OPTIONS.map(function (option) {
              return {
                value: String(option),
                label: option + " kbps",
              };
            })}
            onChange={function (nextValue) {
              setMp3BitrateKbps(Number(nextValue));
            }}
          />
        </div>
      ) : null}

      {format === "wav" ? (
        <div className="render-window-row">
          <label className="render-window-label">
            Bit Depth
          </label>
          <RenderSelect
            value={String(wavBitDepth)}
            ariaLabel="Bit Depth"
            options={WAV_BIT_DEPTH_OPTIONS.map(function (option) {
              return {
                value: String(option.value),
                label: option.label,
              };
            })}
            onChange={function (nextValue) {
              setWavBitDepth(Number(nextValue));
            }}
          />
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
