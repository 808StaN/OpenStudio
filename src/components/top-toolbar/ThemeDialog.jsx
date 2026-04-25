import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Check, Palette, X } from "lucide-react";
import { setTheme } from "../../store";

const THEME_OPTIONS = [
  {
    value: "default",
    label: "Default",
    preview: [
      { color: "#232933", pos: 0 },
      { color: "#151922", pos: 50 },
      { color: "#0d1a2a", pos: 100 },
    ],
  },
  {
    value: "midnight",
    label: "Midnight",
    preview: [
      { color: "#18273c", pos: 0 },
      { color: "#101b2d", pos: 50 },
      { color: "#0b1728", pos: 100 },
    ],
  },
];

/**
 * ThemeDialog is a centered modal that lets the user pick between the
 * available app themes. Each theme is shown as a visual tile with a
 * mini colour preview so the choice is immediately obvious.
 */
export function ThemeDialog({ onClose }) {
  const dispatch = useDispatch();
  const dialogRef = useRef(null);
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
  });

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
                  "theme-dialog-tile" + (isActive ? " is-active" : "")
                }
                onClick={function () {
                  dispatch(setTheme(option.value));
                  onClose();
                }}
              >
                <div
                  className="theme-dialog-tile-preview"
                  style={{
                    background: "linear-gradient(135deg, " + gradient + ")",
                  }}
                />
                <div className="theme-dialog-tile-footer">
                  <span className="theme-dialog-tile-label">
                    {option.label}
                  </span>
                  {isActive ? (
                    <Check size={14} className="theme-dialog-tile-check" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
