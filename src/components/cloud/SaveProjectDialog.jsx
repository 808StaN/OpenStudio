import { useState, useCallback } from "react";
import { useSelector } from "react-redux";
import {
  saveProjectToCloud,
  overwriteProjectInCloud,
  findProjectByName,
} from "../../lib/projectApi";
import { serializeProject, downloadProjectFile } from "../../lib/projectSerializer";

export function SaveProjectDialog({ onClose }) {
  const currentUser = useSelector(function (state) {
    return state.user.currentUser;
  });
  const dawState = useSelector(function (state) {
    return state.daw;
  });

  const [name, setName] = useState("Untitled Project");
  const [saveLocal, setSaveLocal] = useState(true);
  const [saveCloud, setSaveCloud] = useState(!!currentUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [overwriteTarget, setOverwriteTarget] = useState(null);

  const executeSave = useCallback(
    async function (trimmedName, projectData, existingProjectId) {
        if (saveCloud && currentUser) {
          if (existingProjectId) {
          await overwriteProjectInCloud(existingProjectId, trimmedName, projectData);
          } else {
          await saveProjectToCloud(trimmedName, projectData);
          }
        }

      if (saveLocal) {
        downloadProjectFile(projectData, trimmedName);
      }

      onClose();
    },
    [saveCloud, currentUser, saveLocal, onClose],
  );

  const handleSubmit = useCallback(
    async function (event) {
      event.preventDefault();
      if (!name.trim()) {
        setError("Project name is required.");
        return;
      }
      if (!saveLocal && !saveCloud) {
        setError("Select at least one save location.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const projectData = serializeProject(dawState);
        const trimmedName = name.trim();

        if (saveCloud && currentUser) {
          const existing = await findProjectByName(trimmedName);
          if (existing) {
            setOverwriteTarget({
              id: existing.id,
              name: trimmedName,
              projectData,
            });
            setIsLoading(false);
            return;
          }
        }

        await executeSave(trimmedName, projectData, null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [name, saveLocal, saveCloud, dawState, currentUser, executeSave],
  );

  const handleConfirmOverwrite = useCallback(async function () {
    if (!overwriteTarget) {
      return;
    }

    const target = overwriteTarget;
    setOverwriteTarget(null);
    setIsLoading(true);
    setError(null);

    try {
      await executeSave(target.name, target.projectData, target.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [overwriteTarget, executeSave]);

  const handleCancelOverwrite = useCallback(function () {
    setOverwriteTarget(null);
  }, []);

  return (
    <div className="auth-dialog-overlay">
      <div className="auth-dialog">
        <header className="auth-dialog-header">
          <h3>Save Project</h3>
          <button className="auth-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          {error ? <div className="auth-dialog-error">{error}</div> : null}

          <label className="auth-dialog-field">
            <span>Project Name</span>
            <input
              type="text"
              value={name}
              onChange={function (event) {
                setName(event.target.value);
              }}
              placeholder="My Project"
              autoFocus
            />
          </label>

          <div className="auth-dialog-field">
            <span>Save to</span>
            <label className="auth-dialog-remember">
              <input
                type="checkbox"
                checked={saveLocal}
                onChange={function (event) {
                  setSaveLocal(event.target.checked);
                }}
              />
              <span>Local file (.os)</span>
            </label>
            <label className="auth-dialog-remember">
              <input
                type="checkbox"
                checked={saveCloud}
                disabled={!currentUser}
                onChange={function (event) {
                  setSaveCloud(event.target.checked);
                }}
              />
              <span>Cloud {currentUser ? "" : "(requires login)"}</span>
            </label>
          </div>

          <button type="submit" className="auth-dialog-submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </button>
        </form>

        {overwriteTarget ? (
          <div className="auth-confirm-overlay">
            <div className="auth-confirm-dialog">
              <h4>Overwrite Cloud Project?</h4>
              <p>
                A project named "{overwriteTarget.name}" already exists in the cloud. Overwrite
                it?
              </p>
              <div className="auth-confirm-actions">
                <button
                  type="button"
                  className="auth-dialog-submit auth-confirm-btn"
                  onClick={handleConfirmOverwrite}
                  disabled={isLoading}
                >
                  OK
                </button>
                <button
                  type="button"
                  className="auth-confirm-secondary"
                  onClick={handleCancelOverwrite}
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
