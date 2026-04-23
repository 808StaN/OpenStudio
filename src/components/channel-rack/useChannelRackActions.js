import { useChannelRackContextMenuActions } from "./useChannelRackContextMenuActions";
import { useChannelRackRowActions } from "./useChannelRackRowActions";

/**
 * Facade hook that combines row handlers and context-menu handlers.
 * ChannelRackWindow can consume one object while internals stay split.
 */
export function useChannelRackActions(params) {
  const rowActions = useChannelRackRowActions(params);
  const contextMenuActions = useChannelRackContextMenuActions(params);

  return {
    ...rowActions,
    ...contextMenuActions,
  };
}
