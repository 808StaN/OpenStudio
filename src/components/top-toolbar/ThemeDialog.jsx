import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Check, Palette, X } from "lucide-react";
import { setTheme } from "../../store";

const THEME_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "midnight", label: "Midnight" },
];

/**
 * ThemeDialog is a centered modal that lets the user pick between the
 * available app themes. It replaces the old inline ThemePicker dropdown
 * so the top toolbar stays uncluttered.
 */
export function ThemeDialog({ onClose }) {
  const dispatch = useDispatch();
  const dialogRef = useRef(null);
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
  });

  /**
   * Close on Escape and trap focus inside the modal.
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
        className="auth-dialog"
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

        <div className="auth-dialog-form" style={{ gap: 8 }}>
          {THEME_OPTIONS.map(function (option) {
            const isActive = option.value === activeTheme;
            return (
              <button
                key={option.value}
                type="button"
                className={
                  "theme-dialog-option" + (isActive ? " is-active" : "")
                }
                onClick={function () {
                  dispatch(setTheme(option.value));
                  onClose();
                }}
              >
                <span className="theme-dialog-option-label">{option.label}</span>
                {isActive ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
