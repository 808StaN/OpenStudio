import { useCallback } from "react";
import {
  assignPluginToChannel,
  assignSampleToChannel,
  openWindow,
  setActiveChannel,
  setChannelMixerInsert,
  toggleStep,
} from "../../store";
import { resolveChannelMenuPosition } from "./channelRackUtils";

/**
 * Handlers used directly by channel rows (plugin/sample assignment,
 * insert routing, step toggles, opening related windows).
 */
export function useChannelRackRowActions({
  dispatch,
  rackShellRef,
  activePatternId,
  setIsPatternMenuOpen,
  setOpenInsertMenuChannelId,
  setChannelContextMenu,
  setChannelRenamePanel,
}) {
  const onAssignPluginToChannel = useCallback(
    function (channelId, payload) {
      dispatch(
        assignPluginToChannel({
          channelId,
          pluginRef: payload.pluginRef,
          pluginName: payload.pluginName,
        }),
      );
    },
    [dispatch],
  );

  const onAssignSampleToChannel = useCallback(
    function (channelId, payload) {
      dispatch(
        assignSampleToChannel({
          channelId,
          sampleRef: payload.samplePath || payload.file,
          sampleName: payload.file,
        }),
      );
    },
    [dispatch],
  );

  const onOpenSampleSettings = useCallback(
    function (channelId) {
      setChannelContextMenu(null);
      dispatch(setActiveChannel(channelId));
      dispatch(openWindow("sampleSettings"));
    },
    [dispatch, setChannelContextMenu],
  );

  const onOpenChannelContextMenu = useCallback(
    function (channelId, buttonRect) {
      // Resolve menu inside rack bounds so it never renders outside the panel.
      const shellRect = rackShellRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const position = resolveChannelMenuPosition(buttonRect, shellRect);

      dispatch(setActiveChannel(channelId));
      setIsPatternMenuOpen(false);
      setOpenInsertMenuChannelId(null);
      setChannelRenamePanel(null);
      setChannelContextMenu({
        channelId,
        x: position.x,
        y: position.y,
      });
    },
    [
      dispatch,
      rackShellRef,
      setIsPatternMenuOpen,
      setOpenInsertMenuChannelId,
      setChannelRenamePanel,
      setChannelContextMenu,
    ],
  );

  const onToggleInsertMenu = useCallback(
    function (channelId) {
      setOpenInsertMenuChannelId(function (value) {
        const next = value === channelId ? null : channelId;
        if (next) {
          setIsPatternMenuOpen(false);
        }
        return next;
      });
    },
    [setOpenInsertMenuChannelId, setIsPatternMenuOpen],
  );

  const onAssignMixerInsert = useCallback(
    function (channelId, insertId) {
      dispatch(
        setChannelMixerInsert({
          channelId,
          insertId,
        }),
      );
      setOpenInsertMenuChannelId(null);
    },
    [dispatch, setOpenInsertMenuChannelId],
  );

  const onOpenPianoRoll = useCallback(
    function (channelId) {
      dispatch(setActiveChannel(channelId));
      dispatch(openWindow("pianoRoll"));
    },
    [dispatch],
  );

  const onTogglePatternStep = useCallback(
    function (patternId, channelId, stepIndex) {
      dispatch(
        toggleStep({
          patternId: patternId || activePatternId,
          channelId,
          stepIndex,
        }),
      );
    },
    [dispatch, activePatternId],
  );

  return {
    onAssignPluginToChannel,
    onAssignSampleToChannel,
    onOpenSampleSettings,
    onOpenChannelContextMenu,
    onToggleInsertMenu,
    onAssignMixerInsert,
    onOpenPianoRoll,
    onTogglePatternStep,
  };
}
