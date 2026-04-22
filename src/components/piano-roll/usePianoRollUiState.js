import { useRef, useState } from "react";
import {
  DEFAULT_NOTE_VELOCITY,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_STEP_WIDTH,
} from "./pianoRollConstants";

export function usePianoRollUiState() {
  // Pointer/drag sessions and scrolling refs that must persist without re-renders.
  const resizeSessionRef = useRef(null);
  const gridWrapRef = useRef(null);
  const keysRef = useRef(null);
  const playheadRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);
  const lastTouchedLengthRef = useRef(1);
  const lastTouchedVelocityRef = useRef(DEFAULT_NOTE_VELOCITY);
  const isSyncingScrollRef = useRef(false);
  const isSyncingHorizontalScrollRef = useRef(false);
  const initializedViewportRef = useRef(false);
  const snapMenuRef = useRef(null);
  const channelMenuRef = useRef(null);
  const scaleRootMenuRef = useRef(null);
  const scaleTypeMenuRef = useRef(null);
  const midiImportInputRef = useRef(null);
  const dragSelectionRef = useRef(null);
  const velocityWrapRef = useRef(null);

  const rowHeight = DEFAULT_ROW_HEIGHT;

  // UI state for toolbar/dropdowns/selection is grouped here to keep window lean.
  const [stepWidth, setStepWidth] = useState(DEFAULT_STEP_WIDTH);
  const [snapKey, setSnapKey] = useState("1-2-beat");
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isScaleRootMenuOpen, setIsScaleRootMenuOpen] = useState(false);
  const [isScaleTypeMenuOpen, setIsScaleTypeMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState("add");
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);

  return {
    resizeSessionRef,
    gridWrapRef,
    keysRef,
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    lastTouchedLengthRef,
    lastTouchedVelocityRef,
    isSyncingScrollRef,
    isSyncingHorizontalScrollRef,
    initializedViewportRef,
    snapMenuRef,
    channelMenuRef,
    scaleRootMenuRef,
    scaleTypeMenuRef,
    midiImportInputRef,
    dragSelectionRef,
    velocityWrapRef,
    rowHeight,
    stepWidth,
    setStepWidth,
    snapKey,
    setSnapKey,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    isChannelMenuOpen,
    setIsChannelMenuOpen,
    isScaleRootMenuOpen,
    setIsScaleRootMenuOpen,
    isScaleTypeMenuOpen,
    setIsScaleTypeMenuOpen,
    editMode,
    setEditMode,
    selectedNoteIds,
    setSelectedNoteIds,
    selectionBox,
    setSelectionBox,
  };
}
