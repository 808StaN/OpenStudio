import {
  getDefaultEqBandType,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
} from "../domain/fxParams";

/**
 * Builds a complete mixer-insert audio graph for every insert in the supplied
 * mixer-settings array.  Each insert receives its own DSP chain:
 *
 *   inputGain → splitter → stereo-width matrix → panner → [EQ / Reverb / Maximizer]
 *                                                     ↘ dry → outputGain → [analyser]
 *
 * The graph is returned as a Map keyed by insert id.  Callers are responsible
 * for wiring inter-insert routes (master/aux sends) and for applying parameter
 * values (see applyInsertSettings).
 *
 * @param {BaseAudioContext} audioCtx – online or offline audio context.
 * @param {object[]} mixerInserts – array of insert descriptors.
 * @param {object} [options]
 * @param {boolean} [options.includeAnalysers=false] – when true, extra
 *   AnalyserNodes are inserted around the maximizer and at the insert output
 *   so the UI can read meters, spectrum and waveform data in real time.
 * @returns {{insertMap:Map<string,object>,getOutputNode:function}}
 */
export function createMixerInsertNodes(audioCtx, mixerInserts, options = {}) {
  const { includeAnalysers = false } = options;
  const inserts = Array.isArray(mixerInserts) ? mixerInserts : [];
  const insertMap = new Map();

  inserts.forEach(function (insert) {
    const inputGain = audioCtx.createGain();
    const splitter = audioCtx.createChannelSplitter(2);
    const leftToLeft = audioCtx.createGain();
    const rightToLeft = audioCtx.createGain();
    const leftToRight = audioCtx.createGain();
    const rightToRight = audioCtx.createGain();
    const merger = audioCtx.createChannelMerger(2);
    const panner = audioCtx.createStereoPanner();
    const fxDryGain = audioCtx.createGain();
    const fxWetGain = audioCtx.createGain();
    const eqInput = audioCtx.createGain();
    const eqLowCut = audioCtx.createBiquadFilter();
    const eqBands = GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (frequencyHz, index) {
        const band = audioCtx.createBiquadFilter();
        band.type = getDefaultEqBandType(index);
        band.frequency.value = frequencyHz;
        band.Q.value = 1.08;
        band.gain.value = 0;
        return band;
      },
    );
    const reverbInput = audioCtx.createGain();
    const reverbPreDelay = audioCtx.createDelay(0.5);
    const reverbLoCut = audioCtx.createBiquadFilter();
    const reverbHiCut = audioCtx.createBiquadFilter();
    const reverbEarlyGain = audioCtx.createGain();
    const reverbLateInput = audioCtx.createGain();
    const reverbLateLeftDelay = audioCtx.createDelay(1.25);
    const reverbLateRightDelay = audioCtx.createDelay(1.25);
    const reverbLeftFeedback = audioCtx.createGain();
    const reverbRightFeedback = audioCtx.createGain();
    const reverbLeftDamping = audioCtx.createBiquadFilter();
    const reverbRightDamping = audioCtx.createBiquadFilter();
    const reverbLeftToLeft = audioCtx.createGain();
    const reverbRightToLeft = audioCtx.createGain();
    const reverbLeftToRight = audioCtx.createGain();
    const reverbRightToRight = audioCtx.createGain();
    const reverbWidthMerger = audioCtx.createChannelMerger(2);
    const reverbWetGain = audioCtx.createGain();
    const maximizerInput = audioCtx.createGain();
    const maximizerPreGain = audioCtx.createGain();
    const maximizerCompressor = audioCtx.createDynamicsCompressor();
    const maximizerSoftClip = audioCtx.createWaveShaper();
    const maximizerCeilingGain = audioCtx.createGain();
    const outputGain = audioCtx.createGain();

    // --- optional analysis nodes (real-time path only) --------------------
    let analyser = null;
    let maximizerPreAnalyser = null;
    let maximizerPostAnalyser = null;
    let maximizerPreSplit = null;
    let maximizerPostSplit = null;
    let maximizerOutSplit = null;
    let maximizerPreLeftAnalyser = null;
    let maximizerPreRightAnalyser = null;
    let maximizerPostLeftAnalyser = null;
    let maximizerPostRightAnalyser = null;
    let maximizerOutLeftAnalyser = null;
    let maximizerOutRightAnalyser = null;
    let maximizerAnalyser = null;

    if (includeAnalysers) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.58;

      maximizerPreAnalyser = audioCtx.createAnalyser();
      maximizerPostAnalyser = audioCtx.createAnalyser();
      maximizerPreSplit = audioCtx.createChannelSplitter(2);
      maximizerPostSplit = audioCtx.createChannelSplitter(2);
      maximizerOutSplit = audioCtx.createChannelSplitter(2);
      maximizerPreLeftAnalyser = audioCtx.createAnalyser();
      maximizerPreRightAnalyser = audioCtx.createAnalyser();
      maximizerPostLeftAnalyser = audioCtx.createAnalyser();
      maximizerPostRightAnalyser = audioCtx.createAnalyser();
      maximizerOutLeftAnalyser = audioCtx.createAnalyser();
      maximizerOutRightAnalyser = audioCtx.createAnalyser();
      maximizerAnalyser = audioCtx.createAnalyser();

      maximizerAnalyser.fftSize = 1024;
      maximizerAnalyser.minDecibels = -96;
      maximizerAnalyser.maxDecibels = -12;
      maximizerAnalyser.smoothingTimeConstant = 0.35;
      maximizerPreAnalyser.fftSize = 1024;
      maximizerPreAnalyser.minDecibels = -96;
      maximizerPreAnalyser.maxDecibels = -12;
      maximizerPreAnalyser.smoothingTimeConstant = 0.25;
      maximizerPostAnalyser.fftSize = 1024;
      maximizerPostAnalyser.minDecibels = -96;
      maximizerPostAnalyser.maxDecibels = -12;
      maximizerPostAnalyser.smoothingTimeConstant = 0.25;
      [
        maximizerPreLeftAnalyser,
        maximizerPreRightAnalyser,
        maximizerPostLeftAnalyser,
        maximizerPostRightAnalyser,
        maximizerOutLeftAnalyser,
        maximizerOutRightAnalyser,
      ].forEach(function (nodeRef) {
        nodeRef.fftSize = 1024;
        nodeRef.minDecibels = -96;
        nodeRef.maxDecibels = -12;
        nodeRef.smoothingTimeConstant = 0.22;
      });
    }

    // --- common routing ----------------------------------------------------
    inputGain.connect(splitter);

    splitter.connect(leftToLeft, 0);
    splitter.connect(rightToLeft, 1);
    splitter.connect(leftToRight, 0);
    splitter.connect(rightToRight, 1);

    leftToLeft.connect(merger, 0, 0);
    rightToLeft.connect(merger, 0, 0);
    leftToRight.connect(merger, 0, 1);
    rightToRight.connect(merger, 0, 1);

    merger.connect(panner);
    panner.connect(fxDryGain);
    panner.connect(eqInput);
    panner.connect(reverbInput);
    panner.connect(maximizerInput);

    eqLowCut.type = "highpass";
    eqLowCut.frequency.value = 20;
    eqLowCut.Q.value = 0.707;
    eqInput.connect(eqLowCut);

    let eqTail = eqLowCut;
    eqBands.forEach(function (band) {
      eqTail.connect(band);
      eqTail = band;
    });
    eqTail.connect(fxWetGain);

    reverbInput.connect(reverbPreDelay);
    reverbLoCut.type = "highpass";
    reverbHiCut.type = "lowpass";
    reverbPreDelay.connect(reverbLoCut);
    reverbLoCut.connect(reverbHiCut);

    const earlyTapTimes = [0.011, 0.019, 0.031, 0.043];
    const earlyTapGains = [0.5, 0.36, 0.26, 0.2];
    const reverbEarlyTaps = earlyTapTimes.map(function (timeSeconds, idx) {
      const delay = audioCtx.createDelay(0.25);
      const gain = audioCtx.createGain();
      delay.delayTime.value = timeSeconds;
      gain.gain.value = earlyTapGains[idx] || 0.2;
      reverbHiCut.connect(delay);
      delay.connect(gain);
      gain.connect(reverbEarlyGain);
      return {
        delay,
        gain,
        baseTime: timeSeconds,
      };
    });
    reverbEarlyGain.connect(reverbWetGain);

    reverbHiCut.connect(reverbLateInput);
    reverbLateInput.connect(reverbLateLeftDelay);
    reverbLateInput.connect(reverbLateRightDelay);

    reverbLateLeftDelay.connect(reverbLeftDamping);
    reverbLateRightDelay.connect(reverbRightDamping);

    reverbLeftDamping.type = "lowpass";
    reverbRightDamping.type = "lowpass";

    reverbLeftDamping.connect(reverbLeftFeedback);
    reverbRightDamping.connect(reverbRightFeedback);
    reverbLeftFeedback.connect(reverbLateRightDelay);
    reverbRightFeedback.connect(reverbLateLeftDelay);

    reverbLeftDamping.connect(reverbLeftToLeft);
    reverbLeftDamping.connect(reverbLeftToRight);
    reverbRightDamping.connect(reverbRightToLeft);
    reverbRightDamping.connect(reverbRightToRight);

    reverbLeftToLeft.connect(reverbWidthMerger, 0, 0);
    reverbRightToLeft.connect(reverbWidthMerger, 0, 0);
    reverbLeftToRight.connect(reverbWidthMerger, 0, 1);
    reverbRightToRight.connect(reverbWidthMerger, 0, 1);

    reverbWidthMerger.connect(reverbWetGain);
    reverbWetGain.connect(fxWetGain);

    // Maximizer routing differs when analysis nodes are present.
    maximizerInput.connect(maximizerPreGain);
    if (includeAnalysers) {
      maximizerPreGain.connect(maximizerPreAnalyser);
      maximizerPreGain.connect(maximizerPreSplit);
      maximizerPreSplit.connect(maximizerPreLeftAnalyser, 0);
      maximizerPreSplit.connect(maximizerPreRightAnalyser, 1);
      maximizerPreAnalyser.connect(maximizerCompressor);
      maximizerCompressor.connect(maximizerSoftClip);
      maximizerSoftClip.connect(maximizerPostAnalyser);
      maximizerSoftClip.connect(maximizerPostSplit);
      maximizerPostSplit.connect(maximizerPostLeftAnalyser, 0);
      maximizerPostSplit.connect(maximizerPostRightAnalyser, 1);
      maximizerPostAnalyser.connect(maximizerCeilingGain);
      maximizerCeilingGain.connect(maximizerAnalyser);
      maximizerCeilingGain.connect(maximizerOutSplit);
      maximizerOutSplit.connect(maximizerOutLeftAnalyser, 0);
      maximizerOutSplit.connect(maximizerOutRightAnalyser, 1);
      maximizerAnalyser.connect(fxWetGain);
    } else {
      maximizerPreGain.connect(maximizerCompressor);
      maximizerCompressor.connect(maximizerSoftClip);
      maximizerSoftClip.connect(maximizerCeilingGain);
      maximizerCeilingGain.connect(fxWetGain);
    }

    const reverbModulators = [
      reverbLateLeftDelay,
      reverbLateRightDelay,
    ].map(function (targetDelay, index) {
      const lfo = audioCtx.createOscillator();
      const depth = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.35 + index * 0.09;
      depth.gain.value = 0;
      lfo.connect(depth);
      depth.connect(targetDelay.delayTime);
      lfo.start();
      return {
        lfo,
        depth,
      };
    });

    fxDryGain.connect(outputGain);
    fxWetGain.connect(outputGain);

    if (includeAnalysers) {
      outputGain.connect(analyser);
    }

    // --- build the descriptor object ---------------------------------------
    const nodeDescriptor = {
      inputGain,
      splitter,
      leftToLeft,
      rightToLeft,
      leftToRight,
      rightToRight,
      merger,
      panner,
      fxDryGain,
      fxWetGain,
      eqInput,
      eqLowCut,
      eqBands,
      reverbInput,
      reverbPreDelay,
      reverbLoCut,
      reverbHiCut,
      reverbEarlyGain,
      reverbEarlyTaps,
      reverbLateInput,
      reverbLateLeftDelay,
      reverbLateRightDelay,
      reverbLeftFeedback,
      reverbRightFeedback,
      reverbLeftDamping,
      reverbRightDamping,
      reverbLeftToLeft,
      reverbRightToLeft,
      reverbLeftToRight,
      reverbRightToRight,
      reverbWidthMerger,
      reverbModulators,
      reverbWetGain,
      maximizerInput,
      maximizerPreGain,
      maximizerCompressor,
      maximizerSoftClip,
      maximizerCeilingGain,
      outputGain,
    };

    if (includeAnalysers) {
      Object.assign(nodeDescriptor, {
        analyser,
        maximizerPreAnalyser,
        maximizerPostAnalyser,
        maximizerPreSplit,
        maximizerPostSplit,
        maximizerOutSplit,
        maximizerPreLeftAnalyser,
        maximizerPreRightAnalyser,
        maximizerPostLeftAnalyser,
        maximizerPostRightAnalyser,
        maximizerOutLeftAnalyser,
        maximizerOutRightAnalyser,
        maximizerAnalyser,
        meterData: new Uint8Array(analyser.fftSize),
        spectrumData: new Uint8Array(analyser.frequencyBinCount),
        maximizerMeterWaveform: new Uint8Array(maximizerAnalyser.fftSize),
        maximizerPreWaveform: new Uint8Array(maximizerPreAnalyser.fftSize),
        maximizerPostWaveform: new Uint8Array(maximizerPostAnalyser.fftSize),
        maximizerPreLeftWaveform: new Uint8Array(maximizerPreLeftAnalyser.fftSize),
        maximizerPreRightWaveform: new Uint8Array(maximizerPreRightAnalyser.fftSize),
        maximizerPostLeftWaveform: new Uint8Array(maximizerPostLeftAnalyser.fftSize),
        maximizerPostRightWaveform: new Uint8Array(maximizerPostRightAnalyser.fftSize),
        maximizerOutLeftWaveform: new Uint8Array(maximizerOutLeftAnalyser.fftSize),
        maximizerOutRightWaveform: new Uint8Array(maximizerOutRightAnalyser.fftSize),
        maximizerWaveform: new Uint8Array(maximizerAnalyser.fftSize),
        meterLevel: 0,
      });
    }

    insertMap.set(insert.id, nodeDescriptor);
  });

  /**
   * Returns the audio node that should be used as the insert's output.
   * In the real-time path this is the terminal analyser so that inter-insert
   * routing carries meter data; in the offline path it is simply outputGain.
   */
  function getOutputNode(node) {
    return node.analyser || node.outputGain;
  }

  return {
    insertMap,
    getOutputNode,
  };
}
