function encodePathSegment(segment) {
  try {
    return encodeURIComponent(decodeURIComponent(segment))
  } catch {
    return encodeURIComponent(segment)
  }
}

function splitPathAndQuery(rawPath) {
  const input = String(rawPath || "")
  const queryIndex = input.indexOf("?")

  return {
    pathPart: queryIndex >= 0 ? input.slice(0, queryIndex) : input,
    queryPart: queryIndex >= 0 ? input.slice(queryIndex) : "",
  }
}

function encodePathname(pathname) {
  return String(pathname || "")
    .split("/")
    .map(function (part, index) {
      if (index === 0 && part === "") {
        return ""
      }

      return encodePathSegment(part)
    })
    .join("/")
}

function encodePackRelativePath(relativePath) {
  const { pathPart, queryPart } = splitPathAndQuery(relativePath)
  const encodedPath = pathPart
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map(function (segment) {
      return encodePathSegment(segment)
    })
    .join("/")

  return encodedPath + queryPart
}

function isFileProtocolRuntime() {
  return (
    typeof window !== "undefined" &&
    String(window.location?.protocol || "").toLowerCase() === "file:"
  )
}

function normalizeRuntimePackPath(rawInput) {
  const input = String(rawInput || "").trim()
  if (!input) {
    return ""
  }

  const openStudioPacksPrefix = /^openstudio:\/\/packs\/?/i
  const isFileProtocol = isFileProtocolRuntime()

  if (openStudioPacksPrefix.test(input)) {
    const relative = input.replace(openStudioPacksPrefix, "")
    const encodedRelative = encodePackRelativePath(relative)

    if (isFileProtocol) {
      return "openstudio://packs/" + encodedRelative
    }

    return "/packs/" + encodedRelative
  }

  if (!isFileProtocol) {
    return input
  }

  const clean = input.replace(/^\/+/, "")
  if (!/^packs(?:\/|$)/i.test(clean)) {
    return input
  }

  const relative = clean.replace(/^packs\/?/i, "")
  return "openstudio://packs/" + encodePackRelativePath(relative)
}

/**
 * Normalize a sample reference into a fetchable URL without changing the
 * stored project value. Pack filenames may contain characters like `#`, so
 * local pack paths are encoded before they can be parsed as URLs.
 *
 * @param {string} rawPath Sample reference stored in state or manifest data.
 * @returns {string} URL safe for fetch/audio loading.
 */
export function toSafeSampleUrl(rawPath) {
  const input = normalizeRuntimePackPath(rawPath)
  if (!input) {
    return ""
  }

  if (/^openstudio:\/\/packs(?:\/|$)/i.test(input)) {
    const relative = input.replace(/^openstudio:\/\/packs\/?/i, "")
    return "openstudio://packs/" + encodePackRelativePath(relative)
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    try {
      const parsed = new URL(input)
      return (
        parsed.protocol +
        "//" +
        parsed.host +
        encodePathname(parsed.pathname) +
        parsed.search
      )
    } catch {
      return input
    }
  }

  const { pathPart, queryPart } = splitPathAndQuery(input)
  return encodePathname(pathPart) + queryPart
}
