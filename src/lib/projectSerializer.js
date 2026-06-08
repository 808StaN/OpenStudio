export function serializeProject(dawState) {
  try {
    const snapshot = JSON.parse(JSON.stringify(dawState));
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("Invalid project state");
    }

    if (snapshot.transport) {
      snapshot.transport.isPlaying = false;
      snapshot.transport.isRecording = false;
      snapshot.transport.currentStep16 = 0;
    }

    return {
      format: "openstudio-project",
      version: 1,
      savedAt: new Date().toISOString(),
      daw: snapshot,
    };
  } catch (error) {
    throw new Error(error?.message || "Could not serialize project");
  }
}

export function deserializeProject(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid project data");
  }

  const candidate = data.daw || data;
  if (!candidate || typeof candidate !== "object" || !candidate.project || !candidate.transport) {
    throw new Error("Invalid project file structure");
  }

  return candidate;
}

export function downloadProjectFile(projectData, fileName) {
  let url = null;

  try {
    const serialized = JSON.stringify(projectData, null, 2);
    if (!serialized) {
      throw new Error("Invalid project data");
    }

    const safeName = String(fileName || "openstudio-project").trim() || "openstudio-project";
    const blob = new Blob([serialized], { type: "application/json" });
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName.endsWith(".os") ? safeName : `${safeName}.os`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    throw new Error(error?.message || "Could not download project file");
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
