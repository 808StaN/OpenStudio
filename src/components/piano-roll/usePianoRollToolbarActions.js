import { useCallback } from "react";

// Provides toolbar action callbacks to keep PianoRollWindow JSX concise.
export function usePianoRollToolbarActions({
  dispatch,
  setActiveChannelAction,
  setPianoRollScaleAction,
  scaleRoot,
  scaleType,
}) {
  const onSelectChannel = useCallback(
    function (channelId) {
      dispatch(setActiveChannelAction(channelId));
    },
    [dispatch, setActiveChannelAction],
  );

  const onSelectScaleRoot = useCallback(
    function (noteName) {
      dispatch(
        setPianoRollScaleAction({
          root: noteName,
          type: scaleType,
        }),
      );
    },
    [dispatch, setPianoRollScaleAction, scaleType],
  );

  const onSelectScaleType = useCallback(
    function (typeKey) {
      dispatch(
        setPianoRollScaleAction({
          root: scaleRoot,
          type: typeKey,
        }),
      );
    },
    [dispatch, setPianoRollScaleAction, scaleRoot],
  );

  return {
    onSelectChannel,
    onSelectScaleRoot,
    onSelectScaleType,
  };
}
