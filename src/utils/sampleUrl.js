function normalizeRuntimePackPath(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) {
    return "";
  }

  const hasWindow = typeof window !== "undefined";
  const isFileProtocol =
    hasWindow && String(window.location?.protocol || "").toLowerCase() === "file:";
  const restoreSafeAliasSegment = function (segment) {
    return String(segment || "")
      .replace(/_at_/gi, "@")
      .replace(/_plus_/gi, "+")
      .replace(/_hash_/gi, "#");
  };
  const restoreSafeAliasRelativePath = function (relativePath) {
    const rel = String(relativePath || "").replace(/^\/+/, "");
    if (!rel) {
      return "";
    }

    const segments = rel.split("/").filter(Boolean);
    if (segments.length === 0) {
      return "";
    }

    const first = String(segments[0] || "").toLowerCase();
    const hasSafePrefix = first === "__safe__" || first === "_safe_";
    if (!hasSafePrefix) {
      return rel;
    }

    return segments
      .slice(1)
      .map(function (segment) {
        return restoreSafeAliasSegment(segment);
      })
      .join("/");
  };

  if (/^openstudio:\/\/packs(?:\/|$)/i.test(input)) {
    if (isFileProtocol) {
      try {
        const parsed = new URL(input);
        const restoredRelative = restoreSafeAliasRelativePath(parsed.pathname);
        if (!restoredRelative) {
          return input;
        }

        return "openstudio://packs/" + restoredRelative + String(parsed.search || "");
      } catch {
        const relative = input.replace(/^openstudio:\/\/packs\/?/i, "");
        const restoredRelative = restoreSafeAliasRelativePath(relative);
        if (!restoredRelative) {
          return input;
        }
        return "openstudio://packs/" + restoredRelative;
      }
    }

    try {
      const parsed = new URL(input);
      const relative = String(parsed.pathname || "").replace(/^\/+/, "");
      return "/packs/" + relative + String(parsed.search || "");
    } catch {
      return input.replace(/^openstudio:\/\/packs\/?/i, "/packs/");
    }
  }

  if (!isFileProtocol) {
    return input;
  }

  const clean = input.replace(/^\/+/, "");
  const safeOnly = restoreSafeAliasRelativePath(clean);
  if (safeOnly !== clean && safeOnly) {
    return "openstudio://packs/" + safeOnly;
  }

  if (!/^packs(?:\/|$)/i.test(clean)) {
    return input;
  }

  const relative = clean.replace(/^packs\/?/i, "");
  const restoredRelative = restoreSafeAliasRelativePath(relative);
  return "openstudio://packs/" + (restoredRelative || relative);
}

export function toSafeSampleUrl(rawPath) {
  const input = normalizeRuntimePackPath(rawPath);
  if (!input) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    try {
      const parsed = new URL(input);
      const encodedPath = parsed.pathname
        .split("/")
        .map(function (part) {
          if (!part) {
            return "";
          }

          try {
            return encodeURIComponent(decodeURIComponent(part));
          } catch {
            return encodeURIComponent(part);
          }
        })
        .join("/");

      return parsed.protocol + "//" + parsed.host + encodedPath + parsed.search;
    } catch {
      return input;
    }
  }

  const queryIndex = input.indexOf("?");
  const pathPart = queryIndex >= 0 ? input.slice(0, queryIndex) : input;
  const queryPart = queryIndex >= 0 ? input.slice(queryIndex) : "";
  const parts = pathPart.split("/");

  const encodedPath = parts
    .map(function (part, index) {
      if (index === 0 && part === "") {
        return "";
      }

      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");

  return encodedPath + queryPart;
}
