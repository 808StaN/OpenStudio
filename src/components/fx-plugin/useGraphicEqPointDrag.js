import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Handles Graphic EQ point coordinates and drag interactions on the curve graph.
export function useGraphicEqPointDrag({
  eqParams,
  activeInsertId,
  activeSlotId,
  dispatch,
  setFxSlotGraphicEqPointAction,
  clampFn,
  graphPadding,
  graphWidth,
  graphHeight,
  graphMinFreq,
  graphMaxFreq,
  graphMaxDb,
}) {
  const graphRef = useRef(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);

  const pointCoordinates = useMemo(
    function () {
      const leftPad = graphPadding.left;
      const rightPad = graphPadding.right;
      const topPad = graphPadding.top;
      const bottomPad = graphPadding.bottom;
      const innerW = Math.max(1, graphWidth - leftPad - rightPad);
      const innerH = Math.max(1, graphHeight - topPad - bottomPad);

      return eqParams.points.map(function (point) {
        const xRatio =
          Math.log(clampFn(point.frequencyHz, graphMinFreq, graphMaxFreq) / graphMinFreq) /
          Math.log(graphMaxFreq / graphMinFreq);
        const yRatio =
          (clampFn(point.gainDb, -graphMaxDb, graphMaxDb) + graphMaxDb) /
          (graphMaxDb * 2);

        return {
          x: leftPad + xRatio * innerW,
          y: topPad + (1 - yRatio) * innerH,
        };
      });
    },
    [
      eqParams.points,
      graphPadding,
      graphWidth,
      graphHeight,
      clampFn,
      graphMinFreq,
      graphMaxFreq,
      graphMaxDb,
    ],
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

      const leftPad = graphPadding.left;
      const rightPad = graphPadding.right;
      const topPad = graphPadding.top;
      const bottomPad = graphPadding.bottom;
      const innerW = Math.max(1, graphWidth - leftPad - rightPad);
      const innerH = Math.max(1, graphHeight - topPad - bottomPad);

      const normalizedX = (clientX - rect.left) / rect.width;
      const normalizedY = (clientY - rect.top) / rect.height;

      const graphX = clampFn(normalizedX * graphWidth, leftPad, graphWidth - rightPad);
      const graphY = clampFn(normalizedY * graphHeight, topPad, graphHeight - bottomPad);

      const freqRatio = (graphX - leftPad) / innerW;
      const gainRatio = 1 - (graphY - topPad) / innerH;

      const frequencyHz = clampFn(
        graphMinFreq * Math.pow(graphMaxFreq / graphMinFreq, freqRatio),
        graphMinFreq,
        graphMaxFreq,
      );
      const gainDb = clampFn(
        gainRatio * graphMaxDb * 2 - graphMaxDb,
        -graphMaxDb,
        graphMaxDb,
      );

      dispatch(
        setFxSlotGraphicEqPointAction({
          insertId: activeInsertId,
          slotId: activeSlotId,
          pointIndex,
          frequencyHz,
          gainDb,
        }),
      );
    },
    [
      activeInsertId,
      activeSlotId,
      graphPadding,
      graphWidth,
      graphHeight,
      clampFn,
      graphMinFreq,
      graphMaxFreq,
      graphMaxDb,
      dispatch,
      setFxSlotGraphicEqPointAction,
    ],
  );

  useEffect(
    function () {
      if (draggingPointIndex === null) {
        return;
      }

      // Keep drag responsive even outside the SVG bounds.
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

  return {
    graphRef,
    draggingPointIndex,
    setDraggingPointIndex,
    pointCoordinates,
  };
}
