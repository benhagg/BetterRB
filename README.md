# Better RB

Retro Bowl-style 2D football game built with HTML5 Canvas and Node.js.

## Getting Started
Start the local server with `npm start`, then open `http://localhost:3000`.

## Controls & Gameplay
- **Pre-Snap**: Press `1`, `2`, or `3` (or click play cards) to select a play. Press `Space` to snap.
- **Passing**:
  - Press `1`–`5` to pass to a receiver/RB. Moving receivers are led; stationary receivers are targeted directly.
  - Click anywhere on the field to pass to that exact spot (arrives 4 ft above ground).
  - Moving QB continues running during a 0.4s delay, showing throwing animation right before release. Pocket QB throws in 0.2s.
  - Receivers within 5 yds pursue passes and auto-continue running after catch until controlled.
- **Running**: Steer ball carrier with `W`, `A`, `S`, `D` or Arrow keys. Run plays automatically hand off to the RB.
- **Hotkeys**: `Space` to snap, `R` to reset pre-snap, `Esc` to exit game.

## Data & Assets
- `data/oplays.json`: Offensive playbook (pass & run formations, routes, and receiver numbers).
- `data/save_1/`: Active season state (`roster.json`, `season.json`, `scores.txt`).
- `images/`: Field, player portrait, and sprite assets.
