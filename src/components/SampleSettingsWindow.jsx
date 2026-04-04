import { useSelector } from "react-redux";
import { SampleSettingsDialog } from "./SampleSettingsDialog";

export function SampleSettingsWindow() {
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const activeChannelId = useSelector(function (state) {
    return state.daw.project.activeChannelId;
  });

  const activeChannel = channels.find(function (channel) {
    return channel.id === activeChannelId;
  });

  if (!activeChannel) {
    return (
      <div className="sample-window-empty">Select channel in Channel Rack</div>
    );
  }

  return <SampleSettingsDialog channel={activeChannel} />;
}
