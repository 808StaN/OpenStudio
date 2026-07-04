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

function tokenizeSampleQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(function (token) {
      return token.trim();
    })
    .filter(function (token) {
      return token.length >= 2;
    });
}

function scoreSample(sample, tokens) {
  const haystack = [sample?.name, sample?.folder, sample?.path]
    .join(" ")
    .toLowerCase();

  return tokens.reduce(function (score, token) {
    if (!haystack.includes(token)) {
      return score;
    }

    const name = String(sample?.name || "").toLowerCase();
    return score + (name.includes(token) ? 3 : 1);
  }, 0);
}

export function searchAiSamples(samples, query, limit = 80) {
  const source = Array.isArray(samples) ? samples : [];
  const tokens = tokenizeSampleQuery(query);

  if (tokens.length === 0) {
    return source.slice(0, limit);
  }

  return source
    .map(function (sample) {
      return {
        sample,
        score: scoreSample(sample, tokens),
      };
    })
    .filter(function (item) {
      return item.score > 0;
    })
    .sort(function (a, b) {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return String(a.sample?.name || "").localeCompare(String(b.sample?.name || ""));
    })
    .slice(0, limit)
    .map(function (item) {
      return item.sample;
    });
}
