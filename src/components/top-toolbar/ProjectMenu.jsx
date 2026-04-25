import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch } from "react-redux";
import {
  FilePlus2,
  FolderOpen,
  Save,
  Download,
  Folder,
} from "lucide-react";
import {
  openWindow,
  resetToDefaultProject,
  setWindowRect,
  store,
  toggleWindowMaximize,
} from "../../store";
import { useProjectFileActions } from "./useProjectFileActions";
import { ProjectsWindow } from "../cloud/ProjectsWindow";
import { SaveProjectDialog } from "../cloud/SaveProjectDialog";

/**
 * ProjectMenu bundles all project-level actions into a single dropdown
 * triggered from the top toolbar. It replaces the separate New / Load /
 * Save / Render buttons so the bar stays compact.
 *
 * The dropdown closes automatically when the user clicks outside, presses
 * Escape, or selects an item.
 */
export function ProjectMenu() {
  const dispatch = useDispatch();
  const menuRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [projectsWindowOpen, setProjectsWindowOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const {
    projectFileInputRef,
    onLoadProjectClick,
    onProjectFileSelected,
  } = useProjectFileActions();

  /**
   * Close the dropdown when the user clicks anywhere outside the menu
   * container. We attach the listener to document only while the menu
   * is open so we do not leak handlers.
   */
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

      document.addEventListener("mousedown", handleClickOutside);

      return function () {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    },
    [isOpen],
  );

  /**
   * Close the dropdown on Escape so keyboard users can dismiss it
   * without hunting for the trigger button.
   */
  useEffect(
    function () {
      if (!isOpen) {
        return;
      }

      const handleKeyDown = function (event) {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      };

      document.addEventListener("keydown", handleKeyDown);

      return function () {
        document.removeEventListener("keydown", handleKeyDown);
      };
    },
    [isOpen],
  );

  /**
   * Reset the project to the default template and re-center the
   * channel-rack window so it looks good on the current viewport.
   */
  const handleNewProject = useCallback(
    function () {
      dispatch(resetToDefaultProject());

      const workspace = document.querySelector(".workspace-surface");
      const viewport = workspace
        ? {
            width: workspace.clientWidth,
            height: workspace.clientHeight,
          }
        : {
            width: window.innerWidth,
            height: window.innerHeight,
          };

      dispatch(toggleWindowMaximize({ id: "playlist", viewport }));

      const nextState = store.getState().daw;
      const rackWindow = nextState?.ui?.windows?.channelRack;
      if (rackWindow) {
        const centeredX = Math.max(
          0,
          Math.round((viewport.width - rackWindow.width) / 2),
        );
        const centeredY = Math.max(
          0,
          Math.round((viewport.height - rackWindow.height) / 2),
        );

        dispatch(
          setWindowRect({
            id: "channelRack",
            x: centeredX,
            y: centeredY,
            width: rackWindow.width,
            height: rackWindow.height,
          }),
        );
      }

      setIsOpen(false);
    },
    [dispatch],
  );

  /**
   * Open the unified ProjectsWindow which shows both cloud projects
   * and a "Load from computer" option.
   */
  const handleLoadProject = useCallback(function () {
    setProjectsWindowOpen(true);
    setIsOpen(false);
  }, []);

  /**
   * Open the save dialog that lets the user choose local file,
   * cloud upload, or both.
   */
  const handleSaveProject = useCallback(function () {
    setSaveDialogOpen(true);
    setIsOpen(false);
  }, []);

  /**
   * Open the render/export floating window.
   */
  const handleRender = useCallback(
    function () {
      dispatch(openWindow("renderExport"));
      setIsOpen(false);
    },
    [dispatch],
  );

  return (
    <div className="project-menu" ref={menuRef}>
      <button
        className="project-menu-trigger"
        onClick={function () {
          setIsOpen(!isOpen);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Folder size={14} />
        Project
      </button>

      {isOpen ? (
        <div className="project-dropdown" role="menu">
          <button
            className="project-dropdown-item"
            onClick={handleNewProject}
            role="menuitem"
          >
            <FilePlus2 size={14} />
            <span>New project</span>
          </button>
          <button
            className="project-dropdown-item"
            onClick={handleLoadProject}
            role="menuitem"
          >
            <FolderOpen size={14} />
            <span>Load project</span>
          </button>
          <button
            className="project-dropdown-item"
            onClick={handleSaveProject}
            role="menuitem"
          >
            <Save size={14} />
            <span>Save project</span>
          </button>
          <button
            className="project-dropdown-item"
            onClick={handleRender}
            role="menuitem"
          >
            <Download size={14} />
            <span>Render</span>
          </button>
        </div>
      ) : null}

      {projectsWindowOpen ? (
        <ProjectsWindow
          onClose={function () {
            setProjectsWindowOpen(false);
          }}
          onLoadLocal={onLoadProjectClick}
        />
      ) : null}

      {saveDialogOpen ? (
        <SaveProjectDialog
          onClose={function () {
            setSaveDialogOpen(false);
          }}
        />
      ) : null}

      {/* Hidden file input used by "Load from computer" inside ProjectsWindow */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".os,application/json,text/json"
        style={{ display: "none" }}
        onChange={function (event) {
          void onProjectFileSelected(event);
        }}
      />
    </div>
  );
}
