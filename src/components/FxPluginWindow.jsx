import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
} from "../audio/domain/fxParams";
import { EmptyFxSlotState } from "./fx-plugin/EmptyFxSlotState";
import { GraphicEqEditor } from "./fx-plugin/GraphicEqEditor";
import { MaximizerEditor } from "./fx-plugin/MaximizerEditor";
import { ReverbEditor } from "./fx-plugin/ReverbEditor";
import { REVERB_CONTROLS } from "./fx-plugin/reverbControls";
import { useFxEmptySlotDropTarget } from "./fx-plugin/useFxEmptySlotDropTarget";
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
  const graphRef = useRef(null);
  const cancelInlineEditRef = useRef(false);
  // UI editing/drag state is local to the window, while actual FX params stay in Redux.
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  // Resolve currently edited insert/slot with sensible fallbacks.
  const activeInsert =
    inserts.find(function (insert) {
      return insert.id === fxEditorTarget?.insertId;
    }) ||
    inserts.find(function (insert) {
      return insert.id === selectedInsertId;
    }) ||
    inserts[0] ||
    null;

  const fxSlots = Array.isArray(activeInsert?.fxSlots)
    ? activeInsert.fxSlots
    : [];
  const activeSlot =
    fxSlots.find(function (slot) {
      return slot.id === fxEditorTarget?.slotId;
    }) ||
    fxSlots[0] ||
    null;

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

  const activeInsertId = activeInsert?.id || "";
  const activeSlotId = activeSlot?.id || "";

  // Store values can be partial or stale while switching inserts; sanitize before rendering.
  const reverbParams = useMemo(
    function () {
      return getSafeReverbParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  const eqParams = useMemo(
    function () {
      return getSafeGraphicEqParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  const maximizerParams = useMemo(
    function () {
      return getSafeMaximizerParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

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

  const maximizerWaveformPath = useMemo(
    function () {
      return buildWaveformPath(
        Array.isArray(activeInsert?.meterWaveform)
          ? activeInsert.meterWaveform
          : null,
        520,
        152,
      );
    },
    [activeInsert],
  );

  const maximizerTransferPath = useMemo(
    function () {
      return buildMaximizerTransferPath(maximizerParams, 520, 152);
    },
    [maximizerParams],
  );

  const maximizerThresholdWavePath = useMemo(
    function () {
      const thresholdAmplitude = clamp(
        Math.pow(10, Number(maximizerParams.thresholdDb || 0) / 20),
        0,
        1,
      );
      return buildWaveformReductionPath(
        Array.isArray(activeInsert?.meterWaveform)
          ? activeInsert.meterWaveform
          : null,
        520,
        152,
        thresholdAmplitude,
      );
    },
    [activeInsert, maximizerParams.thresholdDb],
  );

  const maximizerOutDb = useMemo(
    function () {
      if (Number.isFinite(Number(activeInsert?.maximizerOutputDb))) {
        return clamp(Number(activeInsert.maximizerOutputDb), -96, 6);
      }
      return -96;
    },
    [activeInsert],
  );

  const pointCoordinates = useMemo(
    function () {
      const leftPad = GRAPH_PADDING.left;
      const rightPad = GRAPH_PADDING.right;
      const topPad = GRAPH_PADDING.top;
      const bottomPad = GRAPH_PADDING.bottom;
      const innerW = Math.max(1, GRAPH_WIDTH - leftPad - rightPad);
      const innerH = Math.max(1, GRAPH_HEIGHT - topPad - bottomPad);

      return eqParams.points.map(function (point) {
        const xRatio =
          Math.log(
            clamp(point.frequencyHz, GRAPH_MIN_FREQ, GRAPH_MAX_FREQ) /
              GRAPH_MIN_FREQ,
          ) / Math.log(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ);
        const yRatio =
          (clamp(point.gainDb, -GRAPH_MAX_DB, GRAPH_MAX_DB) + GRAPH_MAX_DB) /
          (GRAPH_MAX_DB * 2);

        return {
          x: leftPad + xRatio * innerW,
          y: topPad + (1 - yRatio) * innerH,
        };
      });
    },
    [eqParams.points],
  );

  const updatePointFromClient = useCallback(
    function (clientX, clientY, pointIndex) {
      if (!graphRef.current || !activeInsertId || !activeSlotId) {
        return;
      }

      const rect = graphRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const leftPad = GRAPH_PADDING.left;
      const rightPad = GRAPH_PADDING.right;
      const topPad = GRAPH_PADDING.top;
      const bottomPad = GRAPH_PADDING.bottom;
      const innerW = Math.max(1, GRAPH_WIDTH - leftPad - rightPad);
      const innerH = Math.max(1, GRAPH_HEIGHT - topPad - bottomPad);

      const normalizedX = (clientX - rect.left) / rect.width;
      const normalizedY = (clientY - rect.top) / rect.height;

      const graphX = clamp(
        normalizedX * GRAPH_WIDTH,
        leftPad,
        GRAPH_WIDTH - rightPad,
      );
      const graphY = clamp(
        normalizedY * GRAPH_HEIGHT,
        topPad,
        GRAPH_HEIGHT - bottomPad,
      );

      const freqRatio = (graphX - leftPad) / innerW;
      const gainRatio = 1 - (graphY - topPad) / innerH;

      const frequencyHz = clamp(
        GRAPH_MIN_FREQ * Math.pow(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ, freqRatio),
        GRAPH_MIN_FREQ,
        GRAPH_MAX_FREQ,
      );
      const gainDb = clamp(
        gainRatio * GRAPH_MAX_DB * 2 - GRAPH_MAX_DB,
        -GRAPH_MAX_DB,
        GRAPH_MAX_DB,
      );

      dispatch(
        setFxSlotGraphicEqPoint({
          insertId: activeInsertId,
          slotId: activeSlotId,
          pointIndex,
          frequencyHz,
          gainDb,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  useEffect(
    function () {
      if (draggingPointIndex === null) {
        return;
      }

      // Global listeners keep dragging responsive even when cursor leaves the svg area.
      const onMouseMove = function (event) {
        updatePointFromClient(event.clientX, event.clientY, draggingPointIndex);
      };

      const onMouseUp = function () {
        setDraggingPointIndex(null);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [draggingPointIndex, updatePointFromClient],
  );

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

  const adjustPointShapeByWheel = function (event, pointIndex) {
    const targetTagName = String(event.target?.tagName || "").toUpperCase();
    if (targetTagName === "SELECT" || targetTagName === "OPTION") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = eqParams.points[pointIndex];
    if (!point) {
      return;
    }

    const currentPercent = getPointShapePercent(point);
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextPercent = clamp(
      currentPercent + direction * WHEEL_SHAPE_STEP_PERCENT,
      0,
      100,
    );
    const nextQ = getQFromShapePercent(point.bandType, nextPercent);

    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotGraphicEqPoint({
        insertId: activeInsertId,
        slotId: activeSlotId,
        pointIndex,
        q: nextQ,
      }),
    );
  };

  const beginInlineEdit = function (point, pointIndex, field) {
    if (field === "frequency") {
      setEditingValue(String(Math.round(point.frequencyHz)));
    } else if (field === "gain") {
      setEditingValue(Number(point.gainDb || 0).toFixed(1));
    } else {
      setEditingValue(String(getPointShapePercent(point)));
    }

    setEditingField({
      pointIndex,
      field,
    });
  };

  const cancelInlineEdit = function () {
    setEditingField(null);
    setEditingValue("");
  };

  const commitInlineEdit = function () {
    if (!editingField) {
      return;
    }

    const point = eqParams.points[editingField.pointIndex];
    if (!point) {
      cancelInlineEdit();
      return;
    }

    if (!activeInsertId || !activeSlotId) {
      cancelInlineEdit();
      return;
    }

    if (editingField.field === "frequency") {
      const nextFrequencyHz = parseFrequencyInput(editingValue);
      if (nextFrequencyHz !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            frequencyHz: nextFrequencyHz,
          }),
        );
      }
    } else if (editingField.field === "gain") {
      const nextGainDb = parseDbInput(editingValue);
      if (nextGainDb !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            gainDb: nextGainDb,
          }),
        );
      }
    } else {
      const nextPercent = parseShapePercentInput(editingValue);
      if (nextPercent !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            q: getQFromShapePercent(point.bandType, nextPercent),
          }),
        );
      }
    }

    cancelInlineEdit();
  };

  const onInlineEditKeyDown = function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitInlineEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEditRef.current = true;
      cancelInlineEdit();
    }
  };

  const onInlineEditBlur = function () {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current = false;
      return;
    }

    commitInlineEdit();
  };

  const onBandTypeChange = function (pointIndex, bandType) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotGraphicEqPoint({
        insertId: activeInsertId,
        slotId: activeSlotId,
        pointIndex,
        bandType,
      }),
    );
  };

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


