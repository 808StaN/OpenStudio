import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Check, Palette, X } from "lucide-react";
import { setTheme } from "../../store";

const THEME_OPTIONS = [
  {
    value: "default",
    label: "Default",
    description: "Dark studio workspace",
    preview: [
      { color: "#232933", pos: 0 },
      { color: "#151922", pos: 50 },
      { color: "#0d1a2a", pos: 100 },
    ],
  },
  {
    value: "tealslate",
    label: "Teal Slate",
    description: "Balanced dark teal",
    preview: [
      { color: "#2c333b", pos: 0 },
      { color: "#222831", pos: 50 },
      { color: "#1c2128", pos: 100 },
    ],
  },
  {
    value: "studio95",
    label: "Studio 95",
    description: "Classic desktop controls",
    preview: [
      { color: "#d6d2c8", pos: 0 },
      { color: "#9f9b91", pos: 50 },
      { color: "#5d5a53", pos: 100 },
    ],
  },
  {
    value: "aero",
    label: "Aero",
    description: "Bright glassy studio",
    preview: [
      { color: "#f0f4f8", pos: 0 },
      { color: "#dbe8f6", pos: 50 },
      { color: "#b9d3ec", pos: 100 },
    ],
  },
];

/**
 * ThemeDialog is a centered modal that lets the user switch the global UI
 * theme with a larger active preview and a compact option list.
 */
export function ThemeDialog({ onClose }) {
  const dispatch = useDispatch();
  const dialogRef = useRef(null);
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
  });
  const activeOption =
    THEME_OPTIONS.find(function (option) {
      return option.value === activeTheme;
    }) || THEME_OPTIONS[0];

  const activeGradient = activeOption.preview
    .map(function (stop) {
      return stop.color + " " + stop.pos + "%";
    })
    .join(", ");

  /**
   * Close on Escape so keyboard users can dismiss the modal quickly.
   */
  useEffect(
    function () {
      const onKeyDown = function (event) {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", onKeyDown);

      return function () {
        document.removeEventListener("keydown", onKeyDown);
      };
    },
    [onClose],
  );

  return (
    <div className="auth-dialog-overlay" onClick={onClose}>
      <div
        className="auth-dialog theme-dialog"
        ref={dialogRef}
        onClick={function (event) {
          event.stopPropagation();
        }}
      >
        <header className="auth-dialog-header">
          <h3>
            <Palette size={16} />
            Change Theme
          </h3>
          <button className="auth-dialog-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="theme-dialog-body">
          <section className="theme-dialog-preview-panel">
            <div className="theme-dialog-preview-label">Current Theme</div>
            <div
              className="theme-dialog-stage"
              style={{
                background: "linear-gradient(135deg, " + activeGradient + ")",
              }}
            >
              <div className="theme-dialog-stage-window">
                <div className="theme-dialog-stage-titlebar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="theme-dialog-stage-content">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <div className="theme-dialog-preview-copy">
              <strong>{activeOption.label}</strong>
              <span>{activeOption.description}</span>
            </div>
          </section>

          <section className="theme-dialog-options" aria-label="Theme options">
            {THEME_OPTIONS.map(function (option) {
              const isActive = option.value === activeTheme;
              const gradient = option.preview
                .map(function (stop) {
                  return stop.color + " " + stop.pos + "%";
                })
                .join(", ");

              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    "theme-dialog-option" + (isActive ? " is-active" : "")
                  }
                  aria-pressed={isActive}
                  onClick={function () {
                    dispatch(setTheme(option.value));
                    onClose();
                  }}
                >
                  <span
                    className="theme-dialog-option-swatch"
                    style={{
                      background: "linear-gradient(135deg, " + gradient + ")",
                    }}
                  />
                  <span className="theme-dialog-option-copy">
                    <span className="theme-dialog-option-label">{option.label}</span>
                    <span className="theme-dialog-option-description">
                      {option.description}
                    </span>
                  </span>
                  <span className="theme-dialog-option-status">
                    {isActive ? <Check size={14} /> : null}
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
