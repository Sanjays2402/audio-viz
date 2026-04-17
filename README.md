# 🎵 AudioViz

Real-time audio visualizer using the Web Audio API. Feed it your microphone and watch it dance.

## Modes
- **Spectrum** — frequency bars, rainbow gradient
- **Waveform** — glowing oscilloscope of time-domain signal
- **Particles** — explode on loud moments, physics-based trails
- **Circular** — radial spectrum around a pulsing center
- **Mirror** — top/bottom mirrored bars

## Features
- Sensitivity slider
- Live VU-style level meter
- Fullscreen mode
- 2048-point FFT, 60fps rendering
- Zero dependencies

## Run
Open `index.html`, grant mic access. That's it.

_Note: browsers require HTTPS or localhost for mic access. Use GitHub Pages (HTTPS) or `npx serve`._
