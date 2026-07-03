function makePacksPath(relativePath) {
  const cleanRelative = String(relativePath || "")
    .replace(/^\/+/, "")
    .trim();
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  if (isFileProtocol) {
    const normalized = cleanRelative.replace(/^packs\/?/i, "");
    return (
      "openstudio://packs/" +
      normalized
        .split("/")
        .filter(Boolean)
        .map(function (segment) {
          return encodeURIComponent(segment);
        })
        .join("/")
    );
  }

  return "/" + cleanRelative;
}

function normalizePackItemPath(rawPath) {
  const input = String(rawPath || "").trim();
  if (!input) {
    return "";
  }

  if (/^(https?:|file:|openstudio:)/i.test(input)) {
    return input;
  }

  const noLeadingSlash = input.replace(/^\/+/, "");
  if (noLeadingSlash.startsWith("packs/")) {
    return makePacksPath(noLeadingSlash);
  }

  return makePacksPath("packs/" + noLeadingSlash);
}

export async function loadAiSampleIndex(limit = 240) {
  try {
    const response = await fetch(
      makePacksPath("packs/manifest.json") + "?ts=" + Date.now(),
      { cache: "no-store" },
    );

    if (!response.ok) {
      return [];
    }

    const manifest = await response.json();
    const folders = Array.isArray(manifest?.folders) ? manifest.folders : [];
    const samples = [];

    folders.forEach(function (folder) {
      const folderName = String(folder?.folder || "Packs");
      const items = Array.isArray(folder?.items) ? folder.items : [];
      items.forEach(function (item) {
        const name = typeof item === "string"
          ? item.split("/").pop() || item
          : String(item?.name || item?.path || "Sample").split("/").pop();
        const path = typeof item === "string"
          ? normalizePackItemPath(item)
          : normalizePackItemPath(item?.path);

        if (!path) {
          return;
        }

        samples.push({
          name,
          path,
          folder: folderName,
        });
      });
    });

    return samples.slice(0, limit);
  } catch {
    return [];
  }
}
