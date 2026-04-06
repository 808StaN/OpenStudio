export function toSafeSampleUrl(rawPath) {
  const input = String(rawPath || "").trim();
  if (!input) {
    return "";
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
