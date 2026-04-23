import { useCallback, useRef } from "react";

/**
 * Manages the singleton Web Audio AudioContext for the application.
 *
 * Browsers require user interaction before an AudioContext can transition
 * from "suspended" to "running".  This hook encapsulates context creation
 * and the resume logic so that every consumer simply calls ensureContext()
 * and receives a ready-to-use context.
 */
export function useAudioContext() {
  const audioCtxRef = useRef(null);

  /**
   * Lazily creates the AudioContext on first call and returns it.
   * Callers must await audioCtx.resume() if they need the context to be
   * in "running" state (e.g. before scheduling real-time playback).
   */
  const ensureContext = useCallback(function () {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  return {
    audioCtxRef,
    ensureContext,
  };
}
