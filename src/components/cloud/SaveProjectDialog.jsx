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

        if (saveLocal) {
          downloadProjectFile(projectData, trimmedName);
        }

        if (saveCloud && currentUser) {
          const existing = await findProjectByName(currentUser.id, trimmedName);
          if (existing) {
            const confirmed = window.confirm(
              `A project named "${trimmedName}" already exists in the cloud. Overwrite?`,
            );
            if (!confirmed) {
              setIsLoading(false);
              return;
            }
            await overwriteProjectInCloud(existing.id, currentUser.id, trimmedName, projectData);
          } else {
            await saveProjectToCloud(currentUser.id, trimmedName, projectData);
          }
        }

        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [name, saveLocal, saveCloud, dawState, currentUser, onClose],
  );

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
      </div>
    </div>
  );
}
