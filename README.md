# OpenStudio

OpenStudio is a browser-based Digital Audio Workstation (DAW) focused on fast pattern workflow, piano-roll editing, playlist arrangement, mixer routing, and high-quality project export.

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Audio Architecture](#audio-architecture)
- [Export Pipeline](#export-pipeline)
- [Development Workflow](#development-workflow)
- [Testing Checklist](#testing-checklist)
- [Known Notes](#known-notes)
- [Roadmap Ideas](#roadmap-ideas)

## Overview

OpenStudio combines a modern web UI with a DAW-style workflow:

- channel-based sequencing
- piano roll note editing with velocity
- playlist clip arrangement
- mixer inserts with routing and built-in FX
- realtime playback and offline export (WAV/MP3)

The product goal is to feel close to desktop music production tools while remaining lightweight and browser-native.

## Core Features

### Composition and Arrangement

- step sequencer for pattern creation
- piano roll for melodic programming
- editable pattern length and pattern management
- playlist timeline with track-based clips

### Sound and Mixing

- per-channel sample settings:
  - Cut itself
  - normalize
  - fade in/out
  - envelope (ADSR-style controls)
  - pitch controls
  - time-stretch controls
- mixer insert routing to master/other inserts
- insert FX slots with built-in effects:
  - Graphic EQ
  - Reverb
- live insert metering and spectrum data

### Render and Export

- render full arrangement from playlist
- WAV output:
  - 16-bit integer
  - 24-bit integer
  - 32-bit float
- MP3 output:
  - selectable bitrate (96-320 kbps)

## Tech Stack

### Frontend

- React 19
- React DOM 19
- Redux Toolkit
- React Redux
- react-rnd
- lucide-react

### Audio and Export

- Web Audio API
- soundfont-player
- @breezystack/lamejs

### Tooling

- Vite 8
- ESLint 9

## Project Structure

```text
OpenStudio/
	src/
		audio/                 # Realtime scheduler, offline renderer, stretch utility
		components/            # Window/panel components (Playlist, Mixer, Piano Roll, etc.)
		styles/                # Feature-oriented styles
		utils/                 # Helper modules (import, note handling, DnD helpers)
		data/                  # Static metadata, instrument definitions
		App.jsx                # Top-level app shell and window orchestration
		store.js               # Redux state and reducers
		main.jsx               # React entrypoint
	public/
		packs/              # Packs assets + generated manifest
	scripts/
		generate-packs-manifest.mjs
	vite.config.js
	package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The project runs a predev step that refreshes the packs manifest automatically.

### Build Production Bundle

```bash
npm run build
```

The build also runs packs manifest refresh before bundling.

## Available Scripts

- `npm run refresh:packs` - regenerate packs manifest
- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run lint` - run ESLint
- `npm run preview` - preview production build locally

## Audio Architecture

OpenStudio uses two audio paths that are designed to stay consistent:

### Realtime Playback

Implemented in `src/audio/useAudioScheduler.js`.

Responsibilities:

- initialize and maintain audio context and mixer graph
- schedule sample and plugin voices
- apply per-channel sample settings
- apply insert routing and FX
- publish meter/spectrum data to UI

### Offline Render

Implemented in `src/audio/exportProjectAudio.js`.

Responsibilities:

- collect playlist and pattern events
- load sample/plugin resources
- build offline insert graph and routing
- render to audio buffer and encode output format

## Export Pipeline

Render flow from the Render window:

1. Collect project state (playlist, channels, inserts, BPM)
2. Build timeline events from playlist clips and pattern data
3. Create OfflineAudioContext for total duration + tail
4. Schedule channel events with velocity, fades, envelopes, and routing
5. Render full buffer
6. Encode to WAV or MP3 and trigger download

## Development Workflow

Recommended workflow for safe iteration:

1. Make small, focused changes
2. Verify the exact UI/audio scenario you changed
3. Run `npm run build` before commit
4. Run `npm run lint` for non-audio refactors
5. Commit in clear, topic-based commits

## Testing Checklist

For audio-related changes, validate both live playback and offline render:

- loudness parity (live vs render)
- note velocity behavior
- Cut itself + Out interaction (no clicks, no unwanted overlap)
- envelope behavior for short and long notes
- normalize on/off behavior
- insert routing and master fader behavior
- Graphic EQ / Reverb behavior in both paths

## Known Notes

- `public/packs/manifest.json` may change automatically after dev/build due to pre-scripts.
- Keep this in mind when reviewing git diffs.

## Roadmap Ideas

- automated parity tests for realtime vs offline render
- explicit architecture decision records for audio pipeline changes
- versioned changelog and release process
- expanded user-facing documentation and tutorials

