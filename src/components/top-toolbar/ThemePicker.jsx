import { Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setTheme } from "../../store";

const THEME_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "studio95", label: "Studio 95" },
];

export function ThemePicker() {
  const dispatch = useDispatch();
  const themeMenuRef = useRef(null);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const activeTheme = useSelector(function (state) {
    return state.daw.ui.theme || "default";
  });

  useEffect(
    function () {
      if (!isThemeMenuOpen) {
        return;
      }

      // Close the dropdown on outside click and Escape to match DAW menus.
      const onPointerDown = function (event) {
        const root = themeMenuRef.current;
        if (!root) {
          return;
        }

        if (!root.contains(event.target)) {
          setIsThemeMenuOpen(false);
        }
      };

      const onKeyDown = function (event) {
        if (event.key !== "Escape") {
          return;
        }

        setIsThemeMenuOpen(false);
      };

      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [isThemeMenuOpen],
  );

  return (
    <div
      ref={themeMenuRef}
      className={
        "theme-picker rack-modern-select" + (isThemeMenuOpen ? " is-open" : "")
      }
      title="App theme"
    >
      <button
        type="button"
        className="rack-modern-select-trigger"
        onClick={function () {
          setIsThemeMenuOpen(function (value) {
            return !value;
          });
        }}
      >
        <Palette size={14} />
        <span className="rack-modern-select-value">
          {THEME_OPTIONS.find(function (option) {
            return option.value === activeTheme;
          })?.label || "Theme"}
        </span>
        <span className="rack-modern-select-caret">v</span>
      </button>
      {isThemeMenuOpen ? (
        <div className="rack-modern-select-dropdown">
          {THEME_OPTIONS.map(function (option) {
            const isActive = option.value === activeTheme;
            return (
              <button
                key={option.value}
                type="button"
                className={"rack-modern-select-option" + (isActive ? " is-active" : "")}
                onClick={function () {
                  dispatch(setTheme(option.value));
                  setIsThemeMenuOpen(false);
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
