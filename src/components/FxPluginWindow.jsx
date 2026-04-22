import { useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
} from "../audio/domain/fxParams";
import { EmptyFxSlotState } from "./fx-plugin/EmptyFxSlotState";
import { GraphicEqEditor } from "./fx-plugin/GraphicEqEditor";
import { MaximizerEditor } from "./fx-plugin/MaximizerEditor";
import { ReverbEditor } from "./fx-plugin/ReverbEditor";
import { REVERB_CONTROLS } from "./fx-plugin/reverbControls";
import { useFxEmptySlotDropTarget } from "./fx-plugin/useFxEmptySlotDropTarget";
import { useFxEditorSelection } from "./fx-plugin/useFxEditorSelection";
import { useFxMaximizerMetrics } from "./fx-plugin/useFxMaximizerMetrics";
import { useGraphicEqControlInteractions } from "./fx-plugin/useGraphicEqControlInteractions";
import { useGraphicEqPointDrag } from "./fx-plugin/useGraphicEqPointDrag";
import { useReverbControlInteractions } from "./fx-plugin/useReverbControlInteractions";
import {
  buildGraphicEqPath,
  buildMaximizerTransferPath,
  buildSpectrumPaths,
  buildWaveformPath,
  buildWaveformReductionPath,
  clamp,
  getPointShapePercent,
  getQFromShapePercent,
  GRAPHIC_EQ_BAND_TYPES,
  GRAPH_FREQUENCY_GUIDES,
  GRAPH_GRID_ROWS_PER_SIDE,
  GRAPH_HEIGHT,
  GRAPH_MAX_DB,
  GRAPH_MAX_FREQ,
  GRAPH_MIN_FREQ,
  GRAPH_PADDING,
  GRAPH_WIDTH,
  parseDbInput,
  parseFrequencyInput,
  parseNumericInput,
  parseShapePercentInput,
  roundToStep,
  toDbLabel,
  toFrequencyLabel,
  toShapeLabel,
  WHEEL_SHAPE_STEP_PERCENT,
} from "./fx-plugin/fxPluginUtils";
import {
  setFxSlotEffectType,
  setFxSlotGraphicEqPoint,
  setFxSlotMaximizerParam,
  setFxSlotReverbParam,
  toggleFxSlot,
} from "../store";

export function FxPluginWindow() {
  const dispatch = useDispatch();
  const {
    activeInsert,
    activeSlot,
    activeInsertId,
    activeSlotId,
    eqParams,
    reverbParams,
    maximizerParams,
  } = useFxEditorSelection();

  const applyDroppedEffectType = useCallback(
    function (effectType) {
      if (!activeInsert || !activeSlot) {
        return;
      }

      // Dropped browser plugin becomes the new effect type for this slot.
      dispatch(
        setFxSlotEffectType({
          insertId: activeInsert.id,
          slotId: activeSlot.id,
          effectType,
        }),
      );

      // Auto-enable slot after replacing effect so preview works immediately.
      if (!(activeSlot.effectType === effectType && activeSlot.enabled)) {
        dispatch(
          toggleFxSlot({
            insertId: activeInsert.id,
            slotId: activeSlot.id,
          }),
        );
      }
    },
    [activeInsert, activeSlot, dispatch],
  );

  const {
    isEmptyDropTarget,
    onEmptySlotDragOver,
    onEmptySlotDragLeave,
    onEmptySlotDrop,
  } = useFxEmptySlotDropTarget(applyDroppedEffectType);

  const eqCurvePath = useMemo(
    function () {
      return buildGraphicEqPath(eqParams, GRAPH_WIDTH, GRAPH_HEIGHT);
    },
    [eqParams],
  );

  const spectrumPaths = useMemo(
    function () {
      return buildSpectrumPaths(
        Array.isArray(activeInsert?.meterSpectrum)
          ? activeInsert.meterSpectrum
          : null,
        GRAPH_WIDTH,
        GRAPH_HEIGHT,
      );
    },
    [activeInsert],
  );

  const {
    maximizerWaveformPath,
    maximizerTransferPath,
    maximizerThresholdWavePath,
    maximizerOutDb,
  } = useFxMaximizerMetrics({
    activeInsert,
    maximizerParams,
    clampFn: clamp,
    buildWaveformPathFn: buildWaveformPath,
    buildMaximizerTransferPathFn: buildMaximizerTransferPath,
    buildWaveformReductionPathFn: buildWaveformReductionPath,
  });

  const { graphRef, draggingPointIndex, setDraggingPointIndex, pointCoordinates } =
    useGraphicEqPointDrag({
      eqParams,
      activeInsertId,
      activeSlotId,
      dispatch,
      setFxSlotGraphicEqPointAction: setFxSlotGraphicEqPoint,
      clampFn: clamp,
      graphPadding: GRAPH_PADDING,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      graphMinFreq: GRAPH_MIN_FREQ,
      graphMaxFreq: GRAPH_MAX_FREQ,
      graphMaxDb: GRAPH_MAX_DB,
    });

  const setReverbValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotReverbParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setMaximizerValue = function (param, value) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotMaximizerParam({
        insertId: activeInsertId,
        slotId: activeSlotId,
        param,
        value,
      }),
    );
  };

  const {
    draggingReverbParam,
    beginReverbDrag,
    onReverbWheel,
    resetReverbControl,
    editingReverbParam,
    editingReverbText,
    setEditingReverbParam,
    setEditingReverbText,
    commitReverbEdit,
    beginReverbEdit,
  } = useReverbControlInteractions({
    reverbParams,
    setReverbValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  // Graphic EQ field editing/wheel interactions are isolated in a dedicated hook.
  const {
    editingField,
    editingValue,
    setEditingValue,
    adjustPointShapeByWheel,
    beginInlineEdit,
    onInlineEditKeyDown,
    onInlineEditBlur,
    onBandTypeChange,
  } = useGraphicEqControlInteractions({
    eqParams,
    activeInsertId,
    activeSlotId,
    dispatch,
    setFxSlotGraphicEqPointAction: setFxSlotGraphicEqPoint,
    parseFrequencyInputFn: parseFrequencyInput,
    parseDbInputFn: parseDbInput,
    parseShapePercentInputFn: parseShapePercentInput,
    getQFromShapePercentFn: getQFromShapePercent,
    getPointShapePercentFn: getPointShapePercent,
    clampFn: clamp,
    wheelShapeStepPercent: WHEEL_SHAPE_STEP_PERCENT,
  });

  if (!activeInsert || !activeSlot) {
    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div className="fx-empty-slot">
          <p>No FX slot selected.</p>
          <p>Click a slot in the Mixer to open the effect editor.</p>
        </div>
      </section>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_MAXIMIZER) {
    // Maximizer UI branch: limiter/ceiling/character controls + meter overlays.
    return (
      <MaximizerEditor
        activeInsert={activeInsert}
        maximizerParams={maximizerParams}
        maximizerWaveformPath={maximizerWaveformPath}
        maximizerTransferPath={maximizerTransferPath}
        maximizerThresholdWavePath={maximizerThresholdWavePath}
        maximizerOutDb={maximizerOutDb}
        setMaximizerValue={setMaximizerValue}
      />
    );
  }

  if (activeSlot.effectType === FX_EFFECT_REVERB) {
    // Reverb UI branch: knob grid + typed value editing.
    return (
      <ReverbEditor
        reverbControls={REVERB_CONTROLS}
        reverbParams={reverbParams}
        draggingReverbParam={draggingReverbParam}
        beginReverbDrag={beginReverbDrag}
        onReverbWheel={onReverbWheel}
        resetReverbControl={resetReverbControl}
        editingReverbParam={editingReverbParam}
        editingReverbText={editingReverbText}
        setEditingReverbText={setEditingReverbText}
        commitReverbEdit={commitReverbEdit}
        beginReverbEdit={beginReverbEdit}
        setEditingReverbParam={setEditingReverbParam}
      />
    );
  }

  if (activeSlot.effectType !== FX_EFFECT_GRAPHIC_EQ) {
    // Fallback UI for empty/unsupported slots.
    return (
      <EmptyFxSlotState
        isEmptyDropTarget={isEmptyDropTarget}
        onEmptySlotDragOver={onEmptySlotDragOver}
        onEmptySlotDragLeave={onEmptySlotDragLeave}
        onEmptySlotDrop={onEmptySlotDrop}
      />
    );
  }

  return (
    // Graphic EQ UI branch: curve editor, draggable points, and per-band readouts.
    <GraphicEqEditor
      graphRef={graphRef}
      graphWidth={GRAPH_WIDTH}
      graphHeight={GRAPH_HEIGHT}
      graphPadding={GRAPH_PADDING}
      graphMaxDb={GRAPH_MAX_DB}
      graphGridRowsPerSide={GRAPH_GRID_ROWS_PER_SIDE}
      graphFrequencyGuides={GRAPH_FREQUENCY_GUIDES}
      spectrumPaths={spectrumPaths}
      eqCurvePath={eqCurvePath}
      pointCoordinates={pointCoordinates}
      draggingPointIndex={draggingPointIndex}
      adjustPointShapeByWheel={adjustPointShapeByWheel}
      setDraggingPointIndex={setDraggingPointIndex}
      eqParams={eqParams}
      editingField={editingField}
      editingValue={editingValue}
      setEditingValue={setEditingValue}
      onInlineEditKeyDown={onInlineEditKeyDown}
      onInlineEditBlur={onInlineEditBlur}
      beginInlineEdit={beginInlineEdit}
      toFrequencyLabel={toFrequencyLabel}
      toDbLabel={toDbLabel}
      toShapeLabel={toShapeLabel}
      onBandTypeChange={onBandTypeChange}
      bandTypeOptions={GRAPHIC_EQ_BAND_TYPES}
    />
  );
}


