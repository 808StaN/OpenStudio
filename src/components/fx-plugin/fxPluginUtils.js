import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
} from "../../audio/domain/fxParams";

// We accept only these effect payloads when dropping from Browser -> Mixer slot.
export function isSupportedEffectType(effectType) {
  return (
    effectType === FX_EFFECT_GRAPHIC_EQ ||
    effectType === FX_EFFECT_REVERB ||
    effectType === FX_EFFECT_MAXIMIZER
  );
}

export {
  GRAPHIC_EQ_BAND_TYPES,
  GRAPH_FREQUENCY_GUIDES,
  GRAPH_GRID_ROWS_PER_SIDE,
  GRAPH_HEIGHT,
  GRAPH_MAX_DB,
  GRAPH_MAX_FREQ,
  GRAPH_MIN_FREQ,
  GRAPH_PADDING,
  GRAPH_WIDTH,
  WHEEL_SHAPE_STEP_PERCENT,
} from "./graphicEqConstants";

export {
  buildGraphicEqPath,
  buildSpectrumPaths,
  getPointShapePercent,
  getQFromShapePercent,
  parseFrequencyInput,
  parseShapePercentInput,
  toFrequencyLabel,
  toShapeLabel,
} from "./graphicEqUtils";

export {
  clamp,
  parseDbInput,
  parseNumericInput,
  roundToStep,
  toDbLabel,
} from "./fxNumericUtils";

export { formatMs, formatPercent, formatSeconds } from "./reverbValueUtils";

export {
  buildMaximizerTransferPath,
  buildWaveformPath,
  buildWaveformReductionPath,
} from "./maximizerGraphUtils";
