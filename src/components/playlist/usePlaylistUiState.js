import { useRef, useState } from "react";

export function usePlaylistUiState({
  initialBarWidth,
  defaultPlaylistBars,
}) {
  const lastTouchedAudioClipRef = useRef(null);
  const patternSelectionForInsertRef = useRef(null);
  const snapMenuRef = useRef(null);
  const playlistShellRef = useRef(null);
  const playlistBodyRef = useRef(null);
  const playlistHeaderRef = useRef(null);
  const playheadRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);

  // These UI values are intentionally local: zoom, menu open state, hover/drop previews.
  const [barWidth, setBarWidth] = useState(initialBarWidth);
  const [playlistBarCount, setPlaylistBarCount] = useState(defaultPlaylistBars);
  const [snapKey, setSnapKey] = useState("1-2-beat");
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const [dropPreview, setDropPreview] = useState(null);
  const [isPointerOverPlaylist, setIsPointerOverPlaylist] = useState(false);
  const [lastHoverPlacement, setLastHoverPlacement] = useState(null);

  return {
    lastTouchedAudioClipRef,
    patternSelectionForInsertRef,
    snapMenuRef,
    playlistShellRef,
    playlistBodyRef,
    playlistHeaderRef,
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    barWidth,
    setBarWidth,
    playlistBarCount,
    setPlaylistBarCount,
    snapKey,
    setSnapKey,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    dropPreview,
    setDropPreview,
    isPointerOverPlaylist,
    setIsPointerOverPlaylist,
    lastHoverPlacement,
    setLastHoverPlacement,
  };
}
