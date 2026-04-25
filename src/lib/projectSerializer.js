export function serializeProject(dawState) {
  const snapshot = JSON.parse(JSON.stringify(dawState));
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
  const serialized = JSON.stringify(projectData, null, 2);
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".os") ? fileName : `${fileName}.os`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
