import { useRef, useState } from "react";

// Manage Graphic EQ point controls: shape wheel, inline editing, and band-type changes.
export const useGraphicEqControlInteractions = function ({
  eqParams,
  activeInsertId,
  activeSlotId,
  dispatch,
  setFxSlotGraphicEqPointAction,
  parseFrequencyInputFn,
  parseDbInputFn,
  parseShapePercentInputFn,
  getQFromShapePercentFn,
  getPointShapePercentFn,
  clampFn,
  wheelShapeStepPercent,
}) {
  const cancelInlineEditRef = useRef(false);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Mouse wheel on "shape" field changes Q percent in small stepped increments.
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

    const currentPercent = getPointShapePercentFn(point);
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextPercent = clampFn(
      currentPercent + direction * wheelShapeStepPercent,
      0,
      100,
    );
    const nextQ = getQFromShapePercentFn(point.bandType, nextPercent);

    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotGraphicEqPointAction({
        insertId: activeInsertId,
        slotId: activeSlotId,
        pointIndex,
        q: nextQ,
      }),
    );
  };

  // Start inline editing for a selected point field.
  const beginInlineEdit = function (point, pointIndex, field) {
    if (field === "frequency") {
      setEditingValue(String(Math.round(point.frequencyHz)));
    } else if (field === "gain") {
      setEditingValue(Number(point.gainDb || 0).toFixed(1));
    } else {
      setEditingValue(String(getPointShapePercentFn(point)));
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

  // Parse and commit edited field back to Redux point params.
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
      const nextFrequencyHz = parseFrequencyInputFn(editingValue);
      if (nextFrequencyHz !== null) {
        dispatch(
          setFxSlotGraphicEqPointAction({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            frequencyHz: nextFrequencyHz,
          }),
        );
      }
    } else if (editingField.field === "gain") {
      const nextGainDb = parseDbInputFn(editingValue);
      if (nextGainDb !== null) {
        dispatch(
          setFxSlotGraphicEqPointAction({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            gainDb: nextGainDb,
          }),
        );
      }
    } else {
      const nextPercent = parseShapePercentInputFn(editingValue);
      if (nextPercent !== null) {
        dispatch(
          setFxSlotGraphicEqPointAction({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            q: getQFromShapePercentFn(point.bandType, nextPercent),
          }),
        );
      }
    }

    cancelInlineEdit();
  };

  // Enter commits edit, Escape cancels edit without blur-commit.
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

  // Blur commits unless the blur was triggered by an explicit Escape cancel.
  const onInlineEditBlur = function () {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current = false;
      return;
    }

    commitInlineEdit();
  };

  // Update point filter type (bell/shelf/etc.) from dropdown selection.
  const onBandTypeChange = function (pointIndex, bandType) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotGraphicEqPointAction({
        insertId: activeInsertId,
        slotId: activeSlotId,
        pointIndex,
        bandType,
      }),
    );
  };

  return {
    editingField,
    editingValue,
    setEditingValue,
    adjustPointShapeByWheel,
    beginInlineEdit,
    onInlineEditKeyDown,
    onInlineEditBlur,
    onBandTypeChange,
  };
};
