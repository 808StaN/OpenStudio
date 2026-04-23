const PACK_MEDIA_EXTENSIONS = new Set([
  ".wav",
  ".wave",
  ".aif",
  ".aiff",
  ".mp3",
  ".ogg",
  ".flac",
  ".mid",
  ".midi",
]);

// Build grouped folder data from discovered relative media paths.
export const buildPackGroupsFromRelativePaths = function ({
  relativePaths,
  makePacksPath,
}) {
  const folderMap = new Map();

  (Array.isArray(relativePaths) ? relativePaths : []).forEach(function (relativePath) {
    const cleanRelative = String(relativePath || "")
      .replace(/^\/+/, "")
      .trim();
    if (!cleanRelative) {
      return;
    }

    const segments = cleanRelative.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1];
    if (!fileName) {
      return;
    }

    const folderSegments = segments.slice(0, -1);
    // Ignore legacy mirrored safe folders in browser listing.
    if (folderSegments[0] === "__safe__") {
      return;
    }

    const folder = folderSegments.length > 0 ? folderSegments.join("/") : "Root";
    const encodedPath = makePacksPath(
      "packs/" +
        segments
          .map(function (segment) {
            return encodeURIComponent(segment);
          })
          .join("/"),
    );

    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }

    folderMap.get(folder).push({
      name: fileName,
      path: encodedPath,
    });
  });

  return Array.from(folderMap.entries())
    .map(function (entry) {
      const folder = entry[0];
      const items = entry[1];

      items.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

      return {
        folder,
        items,
      };
    })
    .sort(function (a, b) {
      return a.folder.localeCompare(b.folder);
    });
};

// Crawl `/packs/` directory listing pages and discover media file paths.
export const discoverPacksFromDirectoryIndex = async function ({
  isFileProtocol,
  makePacksPath,
  maxDirectories = 250,
}) {
  if (isFileProtocol) {
    return [];
  }

  const queue = ["/packs/"];
  const visited = new Set();
  const mediaRelativePaths = new Set();

  while (queue.length > 0 && visited.size < maxDirectories) {
    const directoryUrl = queue.shift();
    if (!directoryUrl || visited.has(directoryUrl)) {
      continue;
    }

    visited.add(directoryUrl);

    let response = null;
    try {
      response = await fetch(directoryUrl + "?ts=" + Date.now(), {
        cache: "no-store",
      });
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      continue;
    }

    let html = "";
    try {
      html = await response.text();
    } catch {
      continue;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a[href]"));

    links.forEach(function (anchor) {
      const href = String(anchor.getAttribute("href") || "").trim();
      if (!href || href === "/" || href.startsWith("#")) {
        return;
      }

      let resolved = null;
      try {
        resolved = new URL(href, window.location.origin + directoryUrl);
      } catch {
        return;
      }

      if (resolved.origin !== window.location.origin) {
        return;
      }

      const pathname = decodeURIComponent(resolved.pathname);
      if (!pathname.startsWith("/packs/")) {
        return;
      }

      if (pathname.endsWith("/")) {
        if (pathname.includes("/__safe__/")) {
          return;
        }

        queue.push(pathname);
        return;
      }

      const fileName = pathname.split("/").pop() || "";
      const extMatch = fileName.toLowerCase().match(/\.[^.]+$/);
      const ext = extMatch ? extMatch[0] : "";

      if (!PACK_MEDIA_EXTENSIONS.has(ext)) {
        return;
      }

      const relative = pathname.replace(/^\/packs\//, "");
      if (relative) {
        mediaRelativePaths.add(relative);
      }
    });
  }

  if (mediaRelativePaths.size === 0) {
    return [];
  }

  return buildPackGroupsFromRelativePaths({
    relativePaths: Array.from(mediaRelativePaths),
    makePacksPath,
  });
};
