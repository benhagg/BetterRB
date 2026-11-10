# Better RB

Retro Bowl-style 2D football game built with HTML5 Canvas, modern JavaScript, and Vite.

## Game Highlights

- **Dynamic Passing**: Throw to specific receivers (`1`–`5`) or click anywhere on the field. Pass physics calculate trajectory, lead angles, trajectory height, and contested catch windows (dive, jump, standard catches).
- **Carrier Physics & Tackling**: Momentum, cut deceleration, broken-tackle stumble recoveries, and position-based strength multipliers (QB: `0.3`, WR: `0.5`, RB: `0.9`, TE: `1.0`).
- **Defense AI & Angle of Attack**: Defenders feature reaction delays, rushers, man-to-man coverage, zone drops, pursuit intercept trajectories, and angle-of-attack tackle calculations with dive-tackle speed constraints (>50% top speed).
- **Play Calling & Drive Progression**: Down-and-distance tracking, line of scrimmage, pre-snap play cards, and field geometry.

## Quick Start

```bash
npm install
npm start          # Dev server at http://localhost:3000
npm test           # Vitest suite
npm run build      # Production bundle
```

## Controls

- **Pre-Snap**: `1`, `2`, `3` to choose play; `Space` to snap; `R` to cycle play options.
- **Passing**: `1`–`5` to target receivers (moving targets are led); left-click on the field for free-aim throws.
- **Ball Carrier**: `W`, `A`, `S`, `D` or Arrow keys to steer runner.
- **System**: `Esc` to exit to menus.

## Data Files & Assets

| File / Directory | Purpose |
| :--- | :--- |
| `public/shared/oplays.json` | Offensive playbook: formation coordinates, receiver routes, and route waypoints. |
| `public/shared/dplays.json` | Defensive playbook: DL rushers, LB/DB man assignments, and zone coverages. |
| `public/shared/Teams.txt` | Team names, conferences, divisions, and city data. |
| `public/shared/uniforms.txt` | Home, away, and alternate uniform hex color palettes for all 32 teams. |
| `public/shared/schedule.txt` | 18-week season schedule and opponent matchups. |
| `public/shared/Colleges.txt`, `Names_*.txt` | Name pools and colleges for procedural player generation. |
| `public/data/default_state.json` | Default seed state for new franchises (active saves persist in browser IndexedDB). |
| `public/data/seed/save_1/` | Base seed assets (`players.json`, `roster.json`, `opp_rosters.json`, `season.json`). Generated via `npm run new-season`. |
| `public/images/` | Field turf, ball, player portraits, and sprite action sheets (`ddive`, `pass`, `tackled`, etc.). |
