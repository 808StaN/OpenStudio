import { useState, useEffect, useRef } from "react";
import { Settings, Palette } from "lucide-react";
import { ThemeDialog } from "./ThemeDialog";

/**
 * OptionsMenu bundles miscellaneous app-level settings into a single
 * dropdown. Currently the only item is "Change theme", but the menu
 * is structured so new options can be added without restructuring.
 */
export function OptionsMenu() {
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);

  useEffect(
    function () {
      if (!isOpen) {
        return;
      }

      const handleClickOutside = function (event) {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };

      const handleKeyDown = function (event) {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);

      return function () {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    },
    [isOpen],
  );

  return (
    <div className="project-menu" ref={menuRef}>
      <button
        className="transport-btn small project-menu-trigger"
        onClick={function () {
          setIsOpen(!isOpen);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Settings size={14} />
        Options
      </button>

      {isOpen ? (
        <div className="project-dropdown" role="menu">
          <button
            className="project-dropdown-item"
            onClick={function () {
              setThemeDialogOpen(true);
              setIsOpen(false);
            }}
            role="menuitem"
          >
            <Palette size={14} />
            <span>Change theme</span>
          </button>
        </div>
      ) : null}

      {themeDialogOpen ? (
        <ThemeDialog
          onClose={function () {
            setThemeDialogOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
