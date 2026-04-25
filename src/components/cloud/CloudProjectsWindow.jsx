import { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchProjects, loadProjectFromCloud, deleteProjectFromCloud } from "../../lib/projectApi";
import { loadProjectFromFile } from "../../store";

export function CloudProjectsWindow({ onClose }) {
  const dispatch = useDispatch();
  const currentUser = useSelector(function (state) {
    return state.user.currentUser;
  });
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadList = useCallback(
    async function () {
      if (!currentUser) return;
      setIsLoading(true);
      setError(null);
      try {
        const list = await fetchProjects(currentUser.id);
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

  const handleLoad = useCallback(
    async function () {
      if (!selectedId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await loadProjectFromCloud(selectedId);
        dispatch(loadProjectFromFile(data));
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedId, dispatch, onClose],
  );

  const handleDelete = useCallback(
    async function () {
      if (!selectedId) return;
      const project = projects.find(function (p) {
        return p.id === selectedId;
      });
      if (!window.confirm(`Delete project "${project?.name}"? This cannot be undone.`)) {
        return;
      }
      setIsLoading(true);
      try {
        await deleteProjectFromCloud(selectedId);
        setProjects(function (prev) {
          return prev.filter(function (p) {
            return p.id !== selectedId;
          });
        });
        setSelectedId(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedId, projects],
  );

  return (
    <div className="cloud-projects-overlay">
      <div className="cloud-projects-window">
        <header className="cloud-projects-header">
          <h3>My Projects</h3>
          <button className="auth-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="cloud-projects-body">
          {error ? <div className="auth-dialog-error">{error}</div> : null}

          {isLoading && projects.length === 0 ? (
            <p className="cloud-projects-empty">Loading...</p>
          ) : projects.length === 0 ? (
            <p className="cloud-projects-empty">No projects yet.</p>
          ) : (
            <div className="cloud-projects-list">
              {projects.map(function (project) {
                return (
                  <div
                    key={project.id}
                    className={
                      "cloud-project-row" + (selectedId === project.id ? " is-selected" : "")
                    }
                    onClick={function () {
                      setSelectedId(project.id);
                    }}
                  >
                    <span className="cloud-project-name">{project.name}</span>
                    <span className="cloud-project-bpm">{project.bpm} BPM</span>
                    <span className="cloud-project-date">
                      {new Date(project.updated_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="cloud-projects-footer">
          <button
            className="cloud-projects-btn primary"
            onClick={handleLoad}
            disabled={!selectedId || isLoading}
          >
            Load Project
          </button>
          <button
            className="cloud-projects-btn danger"
            onClick={handleDelete}
            disabled={!selectedId || isLoading}
          >
            Delete
          </button>
        </footer>
      </div>
    </div>
  );
}
