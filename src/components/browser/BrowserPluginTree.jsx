import { Music, SlidersHorizontal } from "lucide-react"

// Renders plugin folders/items tree with drag payloads for instruments and effects.
export function BrowserPluginTree(props) {
  const { pluginGroups, pluginExpandedByFolder, togglePluginFolder } = props;

  return pluginGroups.map(function (group) {
    const isOpen = Boolean(pluginExpandedByFolder[group.folder]);
    const isInstrument = group.type === "instrument"
    const FolderIcon = isInstrument ? Music : SlidersHorizontal

    return (
      <section className="tree-group" key={group.folder}>
        <button
          className="tree-folder plugin-folder"
          onClick={function () {
            togglePluginFolder(group.folder);
          }}
        >
          <FolderIcon className="tree-folder-icon" size={13} />
          {group.folder}
        </button>

        <div className={"tree-collapse" + (isOpen ? " is-open" : "")}>
          <div className="tree-collapse-inner">
            <ul className="tree-list">
              {group.items.map(function (item) {
                const key = isInstrument
                  ? group.folder + "-" + item.pluginRef
                  : group.folder + "-" + item.effectType;
                const payload = isInstrument
                  ? {
                      tab: "plugins",
                      type: "instrument",
                      pluginRef: item.pluginRef,
                      pluginName: item.name,
                    }
                  : {
                      tab: "plugins",
                      type: "effect",
                      effectType: item.effectType,
                      effectName: item.name,
                    };
                const mimeType = isInstrument
                  ? "application/x-daw-plugin"
                  : "application/x-daw-effect";

                return (
                  <li
                    key={key}
                    className={
                      "tree-item plugin-item" +
                      (isInstrument ? " instrument-item" : " effect-item")
                    }
                    title={item.description}
                    draggable
                    onDragStart={function (event) {
                      const payloadText = JSON.stringify(payload);
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(mimeType, payloadText);
                      event.dataTransfer.setData("text/plain", payloadText);
                    }}
                  >
                    {item.name}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    );
  });
}
