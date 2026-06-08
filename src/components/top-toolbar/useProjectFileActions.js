import { useRef } from "react";
import { useDispatch } from "react-redux";
import { loadProjectFromFile, store } from "../../store";
import {
  deserializeProject,
  downloadProjectFile,
  serializeProject,
} from "../../lib/projectSerializer";

export function useProjectFileActions() {
  const dispatch = useDispatch();
  const projectFileInputRef = useRef(null);

  const onSaveProjectClick = function () {
    try {
      const dawState = store.getState().daw;
      if (!dawState) {
        throw new Error("Project state is not available");
      }

      const fileStamp = new Date().toISOString().replace(/[.:]/g, "-");
      const fileName = "openstudio-" + fileStamp + ".os";
      downloadProjectFile(serializeProject(dawState), fileName);
    } catch {
      window.alert("Nie udalo sie zapisac pliku .os");
    }
  };

  const onLoadProjectClick = function () {
    if (!projectFileInputRef.current) {
      return;
    }

    projectFileInputRef.current.click();
  };

  const onProjectFileSelected = async function (event) {
    const input = event.target;
    const file = input?.files?.[0] || null;
    if (!file) {
      if (input) {
        input.value = "";
      }
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      dispatch(loadProjectFromFile(deserializeProject(parsed)));
    } catch {
      window.alert("Nie udalo sie wczytac pliku .os");
    }

    input.value = "";
  };

  return {
    projectFileInputRef,
    onSaveProjectClick,
    onLoadProjectClick,
    onProjectFileSelected,
  };
}
