import { useRef } from "react";
import { useDispatch } from "react-redux";
import { loadProjectFromFile, store } from "../../store";

export function useProjectFileActions() {
  const dispatch = useDispatch();
  const projectFileInputRef = useRef(null);

  const onSaveProjectClick = function () {
    const dawState = store.getState().daw;
    if (!dawState) {
      return;
    }

    // Save a transport-safe snapshot so resumed projects never auto-play/record.
    const snapshot = JSON.parse(JSON.stringify(dawState));
    if (snapshot.transport) {
      snapshot.transport.isPlaying = false;
      snapshot.transport.isRecording = false;
      snapshot.transport.currentStep16 = 0;
    }

    const payload = {
      format: "openstudio-project",
      version: 1,
      savedAt: new Date().toISOString(),
      daw: snapshot,
    };

    const serialized = JSON.stringify(payload, null, 2);
    const fileStamp = new Date().toISOString().replace(/[.:]/g, "-");
    const fileName = "openstudio-" + fileStamp + ".os";
    const blob = new Blob([serialized], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 0);
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
      const candidate =
        parsed && typeof parsed === "object" && parsed.daw
          ? parsed.daw
          : parsed;

      if (
        !candidate ||
        typeof candidate !== "object" ||
        !candidate.project ||
        !candidate.transport
      ) {
        throw new Error("Invalid project file");
      }

      dispatch(loadProjectFromFile(candidate));
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
