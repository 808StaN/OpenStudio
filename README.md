# OpenStudio

![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)
![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

Browser + desktop DAW built with React, Web Audio API and Electron.

OpenStudio lets you create beats and arrangements with a workflow inspired by modern production tools: Channel Rack, Piano Roll, Playlist, Mixer, built-in FX, sample time-stretch and project rendering.

![OpenStudio Preview](docs/media/openstudio-preview.gif)

## Table of Contents

- [Live Demo](#live-demo)
- [Highlights](#highlights)
- [Built-in Instruments (20)](#built-in-instruments-20)
- [Screenshots](#screenshots)
- [Sample Projects (Download)](#sample-projects-download)
- [Installation](#installation)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [License](#license)

## Live Demo

- Web: `https://openstudio-daw.vercel.app`
- Desktop dev: `npm run desktop:dev`
- Desktop production run: `npm run desktop:start`

## Highlights

- Channel Rack (step sequencing + melody mode)
- Piano Roll (notes, velocity, drag/drop MIDI)
- Playlist arrangement (patterns + audio clips)
- Mixer with inserts, routing and FX slots
- Built-in effects: Graphic EQ, Reverb, Limiter/Maximizer
- Sample settings: normalize, envelope, pitch, time-stretch
- Theme system: `Default`, `Midnight`
- Audio export: WAV / MP3
- Web + Electron desktop app in one codebase

## Built-in Instruments (20)

OpenStudio includes 20 instrument plugins:

- Piano
- Bright Piano
- E-Piano
- E-Piano 2
- Organ
- Rock Organ
- Nylon Guitar
- Steel Guitar
- Clean Guitar
- Electric Bass
- Synth Bass 1
- Synth Bass 2
- Strings
- Violin
- Cello
- Brass Section
- Trumpet
- Alto Sax
- Lead Saw
- Flute

Instrument mapping is defined in [`src/data/pluginInstruments.js`](src/data/pluginInstruments.js).

Source of these instruments:
- Loaded via [`soundfont-player`](https://github.com/danigb/soundfont-player)
- Uses General MIDI soundfont instrument names (e.g. `acoustic_grand_piano`, `violin`, `flute`)
- By default, `soundfont-player` uses the **MusyngKite** soundfont set and Benjamin Gleitzman's pre-rendered MIDI.js soundfonts

## Screenshots

### Main workspace

![OpenStudio Workspace](docs/media/workspace-overview.png)

### Piano Roll

![Piano Roll](docs/media/piano-roll.png)

### Mixer + FX

![Mixer and FX](docs/media/mixer-fx.png)

### Limiter plugin

![Limiter Plugin](docs/media/limiter-plugin.png)

### Theme comparison (`Default` vs `Midnight`)

![Theme Default](docs/media/theme-default.png)
![Theme Midnight](docs/media/theme-midnight.png)

## Sample Projects (Download)

- [example1.os](docs/projects/example1.os)
- [example2.os](docs/projects/example2.os)
- [example_instrument.os](docs/projects/example_instrument.os)

## Installation

### Requirements

```bash
node -v   # 18+
npm -v    # 9+
```

### Clone repository

```bash
git clone https://github.com/808StaN/OpenStudio.git
cd OpenStudio
```

### Install dependencies

```bash
npm install
```

### Run web version (development)

```bash
npm run dev
```

### Run desktop version (development + hot reload)

```bash
npm run desktop:dev
```

### Run desktop version (production mode)

```bash
npm run desktop:start
```

### Build web production bundle

```bash
npm run build
```

## Scripts

- `npm run refresh:packs` - regenerate packs manifest
- `npm run dev` - run web dev server
- `npm run build` - build web production bundle
- `npm run desktop:dev` - run Electron with Vite dev server
- `npm run desktop:pack` - build desktop unpacked app (`release/win-unpacked`)
- `npm run desktop:start` - build unpacked app and run `OpenStudio.exe`
- `npm run desktop:installer` - build Windows installer (NSIS)
- `npm run lint` - run ESLint

## Project Structure

```text
src/
  audio/         realtime scheduler + offline renderer
  components/    windows and DAW UI components
  styles/        app and theme styles
  data/          plugin/instrument metadata
  utils/         helpers (midi, dnd, patterns, sample urls)
electron/        desktop process + preload bridge
scripts/         tooling scripts (packs/installer assets)
public/packs/    packs assets + generated manifest
```

## Tech Stack

- React 19
- Redux Toolkit + React Redux
- Web Audio API
- soundfont-player
- @breezystack/lamejs
- Vite 8
- Electron

## License

Licensed under `GPL-3.0-only`. See [LICENSE](LICENSE).
