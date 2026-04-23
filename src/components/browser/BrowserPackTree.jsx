import {
  buildMidiFileDragPayload,
  writeMidiFileToDataTransfer,
} from "../../utils/midiImport";
import { toSafeSampleUrl } from "../../utils/sampleUrl";

// Resolve the parent key used by toggleFolder in useBrowserPacksManager.
// Must stay 1:1 with getPackParentPath in browserPackUtils.js so that
// expandedByParent lookups hit the same key that toggleFolder writes.
function getParentPath(folderPath) {
  if (!folderPath || folderPath === "Root") {
    return "";
  }
  const lastSlash = folderPath.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return folderPath.slice(0, lastSlash);
}

// Renders recursive packs tree with audio preview and drag payload handling.
export function BrowserPackTree(props) {
  const {
    packGroups,
    manifestStatus,
    packTree,
    expandedByParent,
    toggleFolder,
    playSamplePreview,
  } = props;

  const renderFolderNode = function (node, depth) {
    const parentPath = getParentPath(node.path);
    const isOpen = expandedByParent[parentPath] === node.path;

    return (
      <section className="tree-group" key={node.path}>
        <button
          className="tree-folder"
          style={{ paddingLeft: 8 + depth * 14 + "px" }}
          onClick={function () {
            toggleFolder(node.path);
          }}
        >
          <span className="caret">{isOpen ? "v" : ">"}</span>
          {node.name}
        </button>

        <div className={"tree-collapse" + (isOpen ? " is-open" : "")}>
          <div className="tree-collapse-inner">
            <div className="tree-children">
              {node.children.map(function (childNode) {
                return renderFolderNode(childNode, depth + 1);
              })}

              {node.samples.length > 0 ? (
                <ul className="tree-list">
                  {node.samples.map(function (sampleItem) {
                    return (
                      <li
                        key={node.path + "-" + sampleItem.name}
                        className="tree-item"
                        style={{ marginLeft: 16 + depth * 14 + "px" }}
                        draggable
                        onClick={function () {
                          if (sampleItem.type === "audio") {
                            void playSamplePreview(sampleItem.path);
                          }
                        }}
                        onDragStart={function (event) {
                          if (sampleItem.type === "midi") {
                            const payload = buildMidiFileDragPayload({
                              fileName: sampleItem.name,
                              midiPath: sampleItem.path,
                            });

                            event.dataTransfer.effectAllowed = "copy";
                            writeMidiFileToDataTransfer(
                              event.dataTransfer,
                              payload,
                            );
                            return;
                          }

                          const safeSamplePath = toSafeSampleUrl(sampleItem.path);
                          if (!safeSamplePath) {
                            event.preventDefault();
                            return;
                          }

                          const payload = JSON.stringify({
                            tab: "packs",
                            folder: node.path,
                            file: sampleItem.name,
                            samplePath: safeSamplePath,
                          });

                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(
                            "application/x-daw-sample",
                            payload,
                          );
                          event.dataTransfer.setData("text/plain", payload);
                        }}
                      >
                        {sampleItem.name}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  };

  if (packGroups.length === 0) {
    return (
      <div className="browser-hint">
        {manifestStatus === "loading"
          ? "Loading packs..."
          : "Wklej WAV lub MID do public/packs i uruchom npm run refresh:packs (Packs)"}
      </div>
    );
  }

  return packTree.children.map(function (node) {
    return renderFolderNode(node, 0);
  });
}
