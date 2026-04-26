import { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Cloud,
  FolderOpen,
  Search,
  ArrowUpDown,
  Check,
  Trash2,
} from "lucide-react";
import {
  fetchProjects,
  loadProjectFromCloud,
  deleteProjectFromCloud,
} from "../../lib/projectApi";
import { deserializeProject } from "../../lib/projectSerializer";
import { loadProjectFromFile } from "../../store";

/**
 * ProjectsWindow lets the user load a project from either cloud storage
 * or a local file. It shows a sortable/searchable list of cloud projects
 * with a sidebar for switching sources.
 *
 * The window is split into two main areas:
 *   - Sidebar: source selector (My Projects / Local File)
 *   - Center: search bar, sortable project table, footer stats
 *   - Bottom: action bar (Open Selected / Delete Selected)
 */
export function ProjectsWindow({ onClose, onLoadLocal }) {
  const dispatch = useDispatch();
  const currentUser = useSelector(function (state) {
    return state.user.currentUser;
  });

  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  /**
   * Fetch the cloud project list when the window mounts.
   */
  const loadList = useCallback(
    async function () {
      if (!currentUser) return;
      setIsLoading(true);
      setError(null);
      try {
        const list = await fetchProjects();
        setProjects(list);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [currentUser],
  );

  useEffect(
    function () {
      loadList();
    },
    [loadList],
  );

  /**
   * Toggle sort column or reverse direction when the same column
   * is clicked again.
   */
  const handleSort = useCallback(
    function (column) {
      if (sortColumn === column) {
        setSortDirection(function (prev) {
          return prev === "asc" ? "desc" : "asc";
        });
      } else {
        setSortColumn(column);
        setSortDirection("asc");
      }
    },
    [sortColumn],
  );

  /**
   * Apply search filter + sort to the raw project list.
   */
  const filteredProjects = useMemo(
    function () {
      let result = projects;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter(function (p) {
          return p.name.toLowerCase().includes(q);
        });
      }

      result = [...result].sort(function (a, b) {
        let valA, valB;
        switch (sortColumn) {
          case "bpm":
            valA = a.bpm;
            valB = b.bpm;
            break;
          case "date":
            valA = new Date(a.updated_at).getTime();
            valB = new Date(b.updated_at).getTime();
            break;
          case "name":
          default:
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            break;
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });

      return result;
    },
    [projects, searchQuery, sortColumn, sortDirection],
  );

  /**
   * Load the selected cloud project into the DAW state.
   */
  const handleLoad = useCallback(
    async function () {
      if (!selectedId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await loadProjectFromCloud(selectedId);
        dispatch(loadProjectFromFile(deserializeProject(data)));
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedId, dispatch, onClose],
  );

  /**
   * Trigger the inline delete confirmation for the selected project.
   */
  const handleDelete = useCallback(
    function () {
      if (!selectedId) return;
      const project = projects.find(function (p) {
        return p.id === selectedId;
      });
      if (!project) return;
      setDeleteTarget(project);
    },
    [selectedId, projects],
  );

  /**
   * Confirm and execute cloud project deletion.
   */
  const handleConfirmDelete = useCallback(
    async function () {
      if (!deleteTarget) return;
      const target = deleteTarget;
      setDeleteTarget(null);
      setIsLoading(true);
      setError(null);
      try {
        await deleteProjectFromCloud(target.id);
        setProjects(function (prev) {
          return prev.filter(function (p) {
            return p.id !== target.id;
          });
        });
        setSelectedId(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [deleteTarget],
  );

  const handleCancelDelete = useCallback(function () {
    setDeleteTarget(null);
  }, []);

  /**
   * Sidebar item click: "Local File" opens the system file picker
   * immediately and closes the window.
   */
  const handleLocalFileClick = useCallback(
    function () {
      if (typeof onLoadLocal === "function") {
        onLoadLocal();
      }
      onClose();
    },
    [onLoadLocal, onClose],
  );

  /**
   * Render a sortable column header with an up/down indicator.
   */
  function SortHeader({ label, column }) {
    const isActive = sortColumn === column;
    return (
      <button
        className={
          "project-table-header-cell" + (isActive ? " is-active" : "")
        }
        onClick={function () {
          handleSort(column);
        }}
      >
        <span>{label}</span>
        <ArrowUpDown
          size={12}
          className={
            "project-sort-icon" + (isActive ? " is-active" : "")
          }
          style={{
            transform:
              isActive && sortDirection === "desc"
                ? "rotate(180deg)"
                : "none",
          }}
        />
      </button>
    );
  }

  return (
    <div className="cloud-projects-overlay">
      <div className="cloud-projects-window">
        {/* Header */}
        <header className="cloud-projects-header">
          <h3>Load Project</h3>
          <button className="auth-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {/* Main 3-column body */}
        <div className="project-window-body">
          {/* Left sidebar */}
          <aside className="project-sidebar">
            <button
              className="project-sidebar-item is-active"
              onClick={function () {
                // Already on cloud view; could refresh if needed
              }}
            >
              <Cloud size={16} />
              My Projects
            </button>
            <button
              className="project-sidebar-item"
              onClick={handleLocalFileClick}
            >
              <FolderOpen size={16} />
              Local File
            </button>
          </aside>

          {/* Center panel */}
          <div className="project-center">
            {/* Search bar */}
            <div className="project-search-bar">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={function (event) {
                  setSearchQuery(event.target.value);
                }}
              />
            </div>

            {/* Error banner */}
            {error ? (
              <div className="auth-dialog-error" style={{ margin: "0 0 8px" }}>
                {error}
              </div>
            ) : null}

            {/* Project table */}
            <div className="project-table-wrapper">
              <div className="project-table-header">
                <SortHeader label="Name" column="name" />
                <SortHeader label="BPM" column="bpm" />
                <SortHeader label="Last edited" column="date" />
              </div>

              <div className="project-table-body">
                {isLoading && projects.length === 0 ? (
                  <p className="cloud-projects-empty">Loading cloud projects...</p>
                ) : filteredProjects.length === 0 ? (
                  <p className="cloud-projects-empty">
                    {searchQuery.trim()
                      ? "No projects match your search."
                      : "No cloud projects yet."}
                  </p>
                ) : (
                  filteredProjects.map(function (project) {
                    return (
                      <div
                        key={project.id}
                        className={
                          "project-table-row" +
                          (selectedId === project.id ? " is-selected" : "")
                        }
                        onClick={function () {
                          setSelectedId(project.id);
                        }}
                        onDoubleClick={handleLoad}
                      >
                        <span className="project-table-cell name">
                          {project.name}
                        </span>
                        <span className="project-table-cell bpm">
                          {project.bpm} BPM
                        </span>
                        <span className="project-table-cell date">
                          {new Date(project.updated_at).toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Table footer */}
            <div className="project-table-footer">
              <span className="project-count">
                {filteredProjects.length} projects
              </span>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <footer className="project-actions-bar">
          <button
            className="project-action-btn primary"
            onClick={handleLoad}
            disabled={!selectedId || isLoading}
          >
            <Check size={14} />
            Open Selected
          </button>
          <button
            className="project-action-btn danger"
            onClick={handleDelete}
            disabled={!selectedId || isLoading}
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </footer>

        {/* Delete confirmation */}
        {deleteTarget ? (
          <div className="auth-confirm-overlay">
            <div className="auth-confirm-dialog">
              <h4>Delete Cloud Project?</h4>
              <p>
                Delete project &quot;{deleteTarget.name}&quot;? This cannot be undone.
              </p>
              <div className="auth-confirm-actions">
                <button
                  type="button"
                  className="auth-dialog-submit auth-confirm-btn"
                  onClick={handleConfirmDelete}
                  disabled={isLoading}
                >
                  OK
                </button>
                <button
                  type="button"
                  className="auth-confirm-secondary"
                  onClick={handleCancelDelete}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
