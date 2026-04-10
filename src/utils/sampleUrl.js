export function toSafeSampleUrl(rawPath) {
  const input = String(rawPath || "").trim();
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
