# Agent Guidelines for OpenStudio

This file contains context specifically useful for AI coding agents working on the OpenStudio codebase.

## Architecture Overview

### Audio Pipeline (Most Critical)

The audio system has **two parallel paths** that must produce identical output:

1. **Real-time playback** (`src/audio/core/useTransportScheduler.js`)
   - Uses `requestAnimationFrame` scheduling loop
   - WSOLA granular time-stretch via `createWsolaStretchedBufferFromSample`
   - Voice tracking via refs (`activeSampleVoicesRef`, `activeSynthVoicesRef`)
   - Shared helpers: `computeSamplePlaybackParams`, `createSamplePlaybackNodes`

2. **Offline render/export** (`src/audio/exportProjectAudio.js`)
   - Uses `OfflineAudioContext`
   - **Must use the same arithmetic** as real-time path for identical output
   - Imports the same domain helpers (`getTimeStretchProfile`, `computeSamplePlaybackParams`, etc.)
   - Recently extracted: `wavEncoder.js`, `mp3Encoder.js`, `getOrCreateStretchedBuffer.js`

**Rule**: Any change to playback timing, gain curves, or stretch behavior must be mirrored in both paths.

### State Management

- **Redux Toolkit** with a single `daw` slice
- State lives in `src/store/` with reducers in `src/store/reducers/`
- Refs (not state) are used for audio-context values that change every frame:
  - `audioCtxRef`, `mixerGraphRef`, `sampleBufferCacheRef`, `stretchedSampleBufferCacheRef`
  - These are passed into hooks but never trigger React re-renders

### Sample Settings Flow

1. `channel.sampleSettings` → stored in Redux (raw user values)
2. `getSafeSampleSettings(raw)` → canonical sanitizer in `src/audio/domain/sampleSettings.js`
3. Sanitized settings consumed by:
   - UI components (`SampleSettingsDialog`)
   - Real-time scheduler
   - Offline exporter
   - Playlist waveform utils

**Always use `getSafeSampleSettings`** instead of manual spreading. It handles backward compatibility (e.g., `pitchSemitones` → `pitchCents` migration).

## Coding Conventions

### JavaScript Style
- ES modules (`type: "module"` in package.json)
- Named function expressions preferred over arrow functions in hooks/components
- No semicolons (enforced by project convention, not lint rule)
- `lowerCamelCase` for variables/functions, `PascalCase` for components

### Refs in Effects
When a ref value (e.g., `audioCtxRef.current`) is used inside an effect cleanup function, **copy it to a local variable at the top of the effect**:

```js
useEffect(function () {
  const audioCtx = audioCtxRef.current; // copy here
  // ... use audioCtx in cleanup instead of audioCtxRef.current
}, [audioCtxRef]);
```

This prevents the ESLint `react-hooks/exhaustive-deps` warning and avoids stale ref values.

### Audio Constants
When adding new magic numbers related to audio, prefer extracting them:
- `MIN_PLAYBACK_RATE = 0.125`, `MAX_PLAYBACK_RATE = 8`
- `MIN_DURATION_SEC = 0.01`
- `CLIP_GAIN_SCALE = 0.36`

These are scattered across ~10 files and should eventually live in `src/audio/domain/constants.js`.

## Common Pitfalls

### Time-Stretch Modes
- `stretchMode`: `"none" | "resample" | "stretch"`
- `stretchTimeMode`: `"none" | "set-bpm" | "project-tempo" | "beat-1" | ...`
- **`stretchMode === "stretch"` triggers WSOLA granular stretch** (not just pitch shift)
- In offline render, never pass `{ supportsGranularStretch: false }` unless you intentionally want different behavior from playback

### Playlist Waveform Utils
`playlistWaveformUtils.js` has this condition:
```js
if (stretchMode !== "none" && timeMode !== "none") { ... }
```
This is **inconsistent** with the scheduler which applies stretch even when `timeMode === "none"` (using `stretchMultiplier`). If you modify stretch logic, check this file too.

### WeakMap Caches
`stretchedSampleBufferCache` is a `WeakMap<AudioBuffer, Map<string, AudioBuffer>>`.
- The outer WeakMap holds per-source-buffer caches
- The inner Map key is `"readFrames|stretchFactor|channels"`
- If you change the cache key format, update **all call sites** (now centralized in `getOrCreateStretchedBuffer`)

## Testing

**There are currently no tests.** This is the project's biggest technical debt.

Priority test targets (pure functions, easy to unit test):
- `src/audio/domain/timeStretch.js` → `getStretchTargetDurationSeconds`, `getTimeStretchProfile`
- `src/audio/core/computeSamplePlaybackParams.js`
- `src/audio/domain/sampleSettings.js` → `getSafeSampleSettings`
- `src/store/reducers/project.js` → reducers

Suggested setup: Vitest (already using Vite, so zero-config).

## Build & Lint

```bash
npm run build          # production bundle
npm run lint           # ESLint (zero errors/warnings required)
npm run desktop:pack   # Electron build
```

## Important Files

| File | Purpose |
|------|---------|
| `src/audio/core/useTransportScheduler.js` | Real-time audio scheduling engine |
| `src/audio/exportProjectAudio.js` | Offline render (WAV/MP3 export) |
| `src/audio/domain/timeStretch.js` | Time-stretch profile calculation |
| `src/audio/domain/sampleSettings.js` | Settings sanitizer + defaults |
| `src/audio/core/computeSamplePlaybackParams.js` | Pure timing/gain calculator |
| `src/audio/core/createSamplePlaybackNodes.js` | Web Audio node chain builder |
| `src/audio/core/getOrCreateStretchedBuffer.js` | WSOLA buffer cache helper |
| `src/store/reducers/project.js` | Main project state reducer |
| `src/components/PlaylistWindow.jsx` | Playlist UI + clip management |
| `src/components/SampleSettingsDialog.jsx` | Sample settings UI |

## Git

- Branch: currently on `refactor`
- Commit style: `type(scope): description` (follows existing history)
- Types used: `fix`, `feat`, `refactor`, `perf`, `docs`
