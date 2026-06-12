// Normalize a folder path coming from manifest/discovery into internal tree path.
export const normalizePackFolderPath = function (folderPath) {
  if (!folderPath || folderPath === "Root") {
    return "";
  }
  return folderPath;
};

// Convert flat folder groups into nested tree used by Browser panel UI.
export const buildPackTree = function ({
  folders,
  isMidiFileNameFn,
  makePacksPathFn,
}) {
  const root = {
    path: "",
    name: "",
    children: new Map(),
    samples: [],
  };

  (Array.isArray(folders) ? folders : []).forEach(function (group) {
    const folderPath = normalizePackFolderPath(group.folder);
    const segments = folderPath ? folderPath.split("/") : [];

    let currentNode = root;
    let currentPath = "";

    segments.forEach(function (segment) {
      currentPath = currentPath ? currentPath + "/" + segment : segment;
      if (!currentNode.children.has(segment)) {
        currentNode.children.set(segment, {
          path: currentPath,
          name: segment,
          children: new Map(),
          samples: [],
        });
      }
      currentNode = currentNode.children.get(segment);
    });

    (Array.isArray(group.items) ? group.items : []).forEach(function (item) {
      const sampleName = typeof item === "string" ? item : item.name;
      const samplePath =
        typeof item === "string"
          ? ""
          : item.path ||
            makePacksPathFn(
              "packs/" + normalizePackFolderPath(group.folder) + "/" + item.name,
            );
      const itemType = isMidiFileNameFn(sampleName) ? "midi" : "audio";

      currentNode.samples.push({
        name: sampleName,
        path: samplePath,
        type: itemType,
      });
    });
  });

  const sortNode = function (node) {
    const sortedChildren = Array.from(node.children.values())
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .map(sortNode);

    const sortedSamples = node.samples.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return {
      path: node.path,
      name: node.name,
      children: sortedChildren,
      samples: sortedSamples,
    };
  };

  return sortNode(root);
};

// Resolve direct parent folder path for accordion behavior.
export const getPackParentPath = function (folderPath) {
  const lastSlash = folderPath.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return folderPath.slice(0, lastSlash);
};
