# OpenStudio

Browser + desktop DAW built with React, Web Audio API and Electron.

OpenStudio lets you create beats and arrangements with a workflow inspired by modern production tools: Channel Rack, Piano Roll, Playlist, Mixer, built-in FX, sample time-stretch and project rendering.

## Live Demo

- Web: `https://openstudio-daw.vercel.app`
- Desktop: `npm run desktop:dev` (development), `npm run desktop:start` (production desktop run)

## Why This Project

This project was built to prove practical skills in:

- complex UI architecture (multi-window DAW interface),
- real-time audio scheduling,
- offline rendering/export pipeline,
- state management for large interactive apps,
- shipping the same product as Web + Desktop app.

## Key Features

- Channel Rack (step sequencing)
- Piano Roll (notes, velocity, selection tools)
- Playlist arrangement (patterns + audio clips)
- Mixer with inserts, routing and FX slots
- Built-in effects (including EQ, Reverb, Limiter)
- Sample settings (normalize, envelope, pitch, time stretching)
- Theme system (`Default`, `Midnight`)
- Audio export (WAV/MP3)
- Electron desktop app mode

## Screenshots / Media

Add these files to `docs/media/` (names below), then README will render them automatically.

### 1) Main workspace

![OpenStudio Workspace](docs/media/workspace-overview.png)

### 2) Piano Roll

![Piano Roll](docs/media/piano-roll.png)

### 3) Mixer + FX

![Mixer and FX](docs/media/mixer-fx.png)

### 4) Limiter plugin

![Limiter Plugin](docs/media/limiter-plugin.png)

### 5) Theme comparison (`Default` vs `Midnight`)

![Theme Default](docs/media/theme-default.png)
![Theme Midnight](docs/media/theme-midnight.png)

### 6) Short GIF (recommended)
Paste 10-20s GIF showing: play -> edit note -> adjust FX -> render.

```md
![OpenStudio Demo](docs/media/openstudio-demo.gif)
```

## Tech Stack

- React 19
- Redux Toolkit + React Redux
- Web Audio API
- soundfont-player
- @breezystack/lamejs
- Vite 8
- Electron

## Project Structure

```text
src/
  audio/         realtime scheduler + offline renderer
  components/    windows and DAW UI components
  styles/        app and theme styles
  data/          plugin/instrument metadata
  utils/         helpers (midi, dnd, patterns, sample urls)
electron/        desktop process + preload bridge
scripts/         tooling scripts (e.g. packs manifest)
public/packs/    packs assets + generated manifest
```

## Run Locally

### Requirements

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Web app (dev)

```bash
npm run dev
```

### Desktop app (dev + hot reload)

```bash
npm run desktop:dev
```

### Desktop app (prod build + run)

```bash
npm run desktop:start
```

### Build web production

```bash
npm run build
```

## Scripts

- `npm run refresh:packs` - regenerate packs manifest
- `npm run dev` - run web dev server
- `npm run build` - build web production bundle
- `npm run desktop:dev` - run Electron with Vite dev server
- `npm run desktop:start` - build app and run Electron in production mode
- `npm run lint` - run ESLint

## What To Improve Next

- automated tests for realtime vs offline render parity
- packaging Electron app (`.exe`, installer)
- performance profiling for bigger projects
- project templates and onboarding tutorial
