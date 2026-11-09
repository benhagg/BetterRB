# Class Architecture Plan: Player Hierarchy

This document outlines the class-based inheritance architecture for all players on the field in Retro Bowl.

---

## 1. Architecture Overview

All active human entities on the field derive from a shared `Player` base class. The hierarchy branches cleanly into `OffensivePlayer` and `DefensivePlayer`, and then into specialized position classes.

```
                              ┌────────────────┐
                              │     Player     │
                              └───────┬────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   │                                     │
         ┌─────────▼─────────┐                 ┌─────────▼─────────┐
         │  OffensivePlayer  │                 │  DefensivePlayer  │
         └─────────┬─────────┘                 └─────────┬─────────┘
                   │                                     │
     ┌─────┬───────┼───────┬──────┐                ┌─────┼─────┐
     │     │       │       │      │                │     │     │
   ┌─▼─┐ ┌─▼─┐   ┌─▼──┐  ┌─▼──┐ ┌─▼──┐           ┌─▼──┐┌─▼──┐┌─▼──┐
   │QB │ │WR │   │ RB │  │ TE │ │ OL │           │ DT ││ LB ││ DB │
   └───┘ └───┘   └────┘  └────┘ └────┘           └────┘└────┘└────┘
```

### Why This Architecture Works Well
1. **Shared Physics & Kinematics**: All players move at `(4 + rating * 0.8) * speedMultiplier` yards/sec and share the same field coordinate conversion (10 px/yd horizontally, 35 lateral yards vertically).
2. **Distinct Behavioral Capabilities**: 
   - Defense exclusively possesses `tackle()` and `diveTackle()`.
   - Offense possesses `hasBall`, `catchBall()`, `fumble()`, and ball-carrier animations.
3. **Position-Specific Execution**:
   - QBs manage dropbacks, pass targeting, and scramble toggling.
   - WRs/TEs manage route trees and numbered badge rendering (`1`–`4`).
   - Linemen manage pass protection and blocking stances.
   - DL/LB/DB execute pass rush, zone/man coverage, and pursuit angles.
4. **Sprite Mapping Decoupling**: Each class encapsulates the exact sprite sets it needs to draw.

---

## 2. Base Class: `Player`

Abstract foundation for any player on the field (offense, defense, special teams).

### Constants
* `BASE_SPEED_MIN = 4.0` (yards/second minimum)
* `BASE_SPEED_STEP = 0.8` (yards/second per rating point, 0–10)
* `SPRITE_SIZE = 16` (base sprite width/height in pixels)
* `SPRITE_HALF = 8` (half size for centering)
* `RUN_ANIM_SPEED = 1.5` (animation frame cycle multiplier)
* `LATERAL_YARDS = 35.0` (Arcade-tuned lateral field width across sidelines)

### Properties
* `id` (`string | number`): Unique identifier (e.g., `'cc-0'`, `0`)
* `name` (`string`): Player name (e.g., `'M. Cole'`)
* `position` (`string`): Primary position code (`'QB'`, `'WR'`, `'DT'`, etc.)
* `team` (`object`): Reference to team data (colors, abbreviation)
* `uniform` (`object`): Recolored uniform palette `{ helmet, shirt, pants, ... }`
* `rating` (`number`): Speed rating (0–10)
* `speedMultiplier` (`number`): Position multiplier (1.0, 0.85, 0.70)
* `speed` (`number`): Calculated speed in yards/sec: `(4 + rating * 0.8) * speedMultiplier`
* `x` (`number`): Field position in yards along length of field (0–100+)
* `y` (`number`): Lateral field position (0.0 top sideline to 1.0 bottom sideline, 0.5 center)
* `animDistance` (`number`): Cumulative distance moved for cycling run frames
* `facingLeft` (`boolean`): Sprite flip orientation
* `isMoving` (`boolean`): Whether the player is currently in motion
* `phase` (`string`): Current player status (`'preplay'`, `'running'`, `'tackled'`, `'diving'`, `'action'`)

### Methods
* `constructor(config)`: Initializes coordinates, ratings, and uniform.
* `run(delta, targetX, targetY)`: Moves player toward a target coordinate `(targetX, targetY)` at rated `speed * delta`, clamps within field bounds, updates `animDistance` and `facingLeft`.
* `move(delta, vx, vy)`: Moves player by normalized velocity vector `(vx, vy)`.
* `setFieldPosition(x, y)`: Clamps and assigns field coordinates.
* `getScreenCoordinates(camera, field, horizontalScale, verticalScale)`: Computes canvas render `(screenX, screenY)`.
* `draw(ctx, camera, field, horizontalScale, verticalScale)`: Base render function.

### Image Files
* `/images/running/run_01.png` through `run_06.png` (Standard 6-frame running cycle without ball)
* `/images/pre_play/lineman.png` (Lineman 3-point preplay stance)
* `/images/pre_play/skill.png` (Skill position preplay two-point stance)

---

## 3. Offensive Hierarchy

### 3.1 `OffensivePlayer extends Player`

Represents any offensive unit player. Adds ball possession, ball-carrier running sprites, dives, and tackled states.

#### Constants
* `ODIVE_DURATION = 0.40` (seconds of dive animation)
* `ODIVE_SPEED_BOOST = 1.25` (forward surge multiplier during dive)

#### Properties
* `hasBall` (`boolean`): `true` if this player possesses the football
* `isDiving` (`boolean`): Active offensive dive state
* `diveTimer` (`number`): Elapsed dive duration
* `isTackled` (`boolean`): Whether this player has been brought down
* `tackledTimer` (`number`): Tackle animation counter

#### Methods
* `dive()`: Initiates forward offensive dive/stretch for extra yardage.
* `catchBall()`: Grants ball possession (`hasBall = true`), clears receiver route, becomes active runner.
* `fumble()`: Removes ball possession (`hasBall = false`).
* `tackled()`: Stops movement, sets `isTackled = true`, transitions play phase.
* `update(delta)`: Handles dive timers, tackle timers, and route updates.
* `draw(ctx, ...)`: Overrides draw to render:
  - Ball-carrier run sprites if `hasBall === true`
  - Offensive dive sprites (`odive`) if `isDiving === true`
  - Tackled tumble sprites (`tackled`) if `isTackled === true`
  - Standard preplay/running otherwise

#### Image Files
* `/images/running/run_ball_01.png` - `run_ball_06.png` (Runner with ball)
* `/images/running/run_ball_alt_01.png` - `run_ball_alt_06.png` (Alternate ball-carrier frames)
* `/images/actions/odive.png`, `odive1.png`, `odive2.png` (Offensive dive frames)
* `/images/actions/tackled.png`, `tackled1.png`, `tackled2.png` (Tackled frames)

---

### 3.2 Position Classes (Offense)

#### `Quarterback extends OffensivePlayer`
* **Constants**:
  * `SPEED_MULTIPLIER = 0.85`
  * `DEFAULT_DROPBACK_YARDS = 3.0`
* **Properties**:
  * `dropbackRemaining` (`number`)
  * `isScrambling` (`boolean`)
  * `passCooldown` (`number`)
* **Methods**:
  * `snapBall()`: Enters `'dropback'` phase.
  * `updateDropback(delta)`: Backpedals QB 3 yards.
  * `throwPass(targetReceiver)`: Calculates ball flight trajectory and duration, sets phase to `'thrown'`.
  * `scramble()`: Toggles QB into runner mode.
* **Specific Images**:
  * `/images/actions/dropback.png`, `dropback1.png` (QB backpedal pose)
  * `/images/actions/pass.png`, `pass1.png` (Throwing action pose)

#### `WideReceiver extends OffensivePlayer`
* **Constants**:
  * `SPEED_MULTIPLIER = 1.0`
* **Properties**:
  * `receiverNumber` (`1 | 2 | 3 | 4`): Corresponding hotkey number
  * `route` (`Array<{ x: number, y: number }>`): Waypoints in relative/absolute yards
  * `routeIndex` (`number`): Current waypoint index
* **Methods**:
  * `assignRoute(routeWaypoints)`: Assigns slant, streak, out, curl, or corner route.
  * `runRoute(delta)`: Advances downfield through route waypoints.
  * `isRouteComplete()`: Returns true if final waypoint reached (settles into soft zone).
  * `drawRouteBadge(ctx, screenX, screenY, pixel)`: Renders pill badge `[1]`, `[2]`, `[3]`, or `[4]` above helmet.
* **Specific Images**:
  * `/images/pre_play/skill.png`
  * `/images/running/run_01.png` - `run_06.png` (Route running)
  * `/images/running/run_ball_01.png` - `run_ball_06.png` (After catch)

#### `TightEnd extends OffensivePlayer`
* **Constants**:
  * `SPEED_MULTIPLIER = 0.85`
* **Properties**:
  * `role` (`'receiver' | 'blocker'`): Play assignment
  * `receiverNumber` (`number | null`): Eligible receiver number if running a route
* **Methods**:
  * `block(defender, delta)`: Engages defender in blocking collision.
  * `releaseRoute(delta)`: Delayed chip-and-release route.
* **Specific Images**:
  * `/images/pre_play/skill.png`
  * `/images/actions/blocking.png`, `blocking1.png`

#### `RunningBack extends OffensivePlayer`
* **Constants**:
  * `SPEED_MULTIPLIER = 1.0`
* **Properties**:
  * `receiverNumber` (`number | null`): Assigned receiver number (e.g. checkdown / flat)
* **Methods**:
  * `runHandoff(delta)`: Receives handoff and rushes through design hole.
  * `runFlatRoute(delta)`: Swings out into backfield flat.
  * `passProtect(blitzer, delta)`: Blocks free blitzer.
* **Specific Images**:
  * `/images/pre_play/skill.png`
  * `/images/running/run_01.png` - `run_06.png`
  * `/images/running/run_ball_01.png` - `run_ball_06.png`

#### `OffensiveLineman extends OffensivePlayer` (C, G, T)
* **Constants**:
  * `SPEED_MULTIPLIER = 0.70`
* **Properties**:
  * `isCenter` (`boolean`): If true, starts play with hand on the ball
  * `engagedDefender` (`DefensivePlayer | null`)
* **Methods**:
  * `snap()`: Snaps ball to QB, switches from center pose to lineman pose.
  * `passBlock(delta)`: Holds pocket barrier against rushing defensive linemen.
* **Specific Images**:
  * `/images/pre_play/center.png` (Center only, pre-snap)
  * `/images/pre_play/lineman.png` (Guards/Tackles pre-snap, Center post-snap)
  * `/images/actions/blocking.png`, `blocking1.png`

#### `Kicker extends OffensivePlayer`
* **Constants**:
  * `SPEED_MULTIPLIER = 0.70`
* **Properties**:
  * `accuracy`, `kickPower`
* **Methods**:
  * `kick(ball)`: Executes field goal or kickoff.
* **Specific Images**:
  * `/images/kicking/kick_approach_01.png` - `03.png`
  * `/images/kicking/kick_01.png` - `05.png`
  * `/images/kicking/holder.png`, `holder1.png`

---

## 4. Defensive Hierarchy

### 4.1 `DefensivePlayer extends Player`

Represents any defensive unit player. Adds pursuit AI, standard wrap tackles, and diving tackle lunges.

#### Constants
* `TACKLE_RADIUS = 0.6` (yards for automatic wrap tackle)
* `DIVE_TACKLE_MIN_RADIUS = 0.8` (yards)
* `DIVE_TACKLE_MAX_RADIUS = 2.4` (yards)
* `DDIVE_DURATION = 0.45` (seconds)
* `DDIVE_SPEED_BOOST = 1.40` (forward surge multiplier while diving)
* `DIVE_COOLDOWN = 1.0` (seconds before player can dive again after a miss)

#### Properties
* `isDiving` (`boolean`): Currently executing a dive tackle
* `diveProgress` (`number`): 0.0 to 1.0 completion of dive
* `diveCooldownTimer` (`number`): Cooldown tracker after landing
* `target` (`Player | null`): Current ball carrier or receiver to pursue

#### Methods
* `pursue(targetPlayer, delta)`:
  - Computes `dx = targetPlayer.x - this.x` and `dyYards = (targetPlayer.y - this.y) * 17.4`.
  - Normalizes trajectory and steps by `this.speed * delta`.
  - Updates `facingLeft` and `animDistance`.
  - Automatically attempts `tackle()` or `diveTackle()`.
* `tackle(ballCarrier)`:
  - Triggers wrap-up tackle if `distance <= TACKLE_RADIUS`.
  - Calls `ballCarrier.tackled()`.
* `diveTackle(ballCarrier)`:
  - Triggers forward horizontal lunge if distance is within `[DIVE_TACKLE_MIN_RADIUS, DIVE_TACKLE_MAX_RADIUS]` and cooldown is 0.
  - Sets `isDiving = true`.
  - If collision with `ballCarrier` occurs during dive, executes tackle; if missed, enters resting/recovery state.
* `update(delta)`: Advances dive timers, pursuit physics, and recovery states.
* `draw(ctx, ...)`: Overrides draw to render:
  - Pre-play stance during `'preplay'` (lineman or skill)
  - Defensive dive sprites (`ddive.png`, `ddive1.png`, `ddive2.png`) while diving
  - Resting recovery sprite (`resting.png`) if recovering from missed dive
  - Standard runner sprite (`run_01..06.png`) during active pursuit

#### Image Files
* `/images/actions/ddive.png`, `ddive1.png`, `ddive2.png` (Defensive dive tackle)
* `/images/actions/resting.png` (Post-missed dive recovery)
* `/images/running/run_01.png` - `run_06.png` (Pursuit running)

---

### 4.2 Position Classes (Defense)

#### `DefensiveLineman extends DefensivePlayer` (DT, DE, NT)
* **Constants**:
  * `SPEED_MULTIPLIER = 0.70`
  * `KIND = 'lineman'`
* **Properties**:
  * `rushLane` (`number`): Target rushing gap/angle
* **Methods**:
  * `rushPocket(qb, delta)`: Directs bull rush toward quarterback dropback spot.
* **Specific Images**:
  * `/images/pre_play/lineman.png` (3-point stance)
  * `/images/actions/ddive.png..ddive2.png` (Goal-line dive tackle)

#### `Linebacker extends DefensivePlayer` (MLB, OLB)
* **Constants**:
  * `SPEED_MULTIPLIER = 0.85`
  * `KIND = 'skill'`
* **Properties**:
  * `assignment` (`'blitz' | 'spy' | 'zone'`): Defensive playcall
* **Methods**:
  * `spyQB(qb, delta)`: Mirrors QB lateral position behind the line of scrimmage until scramble begins, then commits to pursuit.
  * `blitz(qb, delta)`: Aggressive pursuit through open lane.
* **Specific Images**:
  * `/images/pre_play/skill.png` (2-point upright stance)
  * `/images/actions/ddive.png..ddive2.png` (Open field dive tackle)

#### `DefensiveBack extends DefensivePlayer` (CB, Safety)
* **Constants**:
  * `SPEED_MULTIPLIER = 1.0`
  * `KIND = 'skill'`
* **Properties**:
  * `coverageTarget` (`WideReceiver | null`): Assigned receiver in man coverage
  * `zoneArea` (`{ minX, maxX, minY, maxY } | null`): Deep third / half boundary
* **Methods**:
  * `coverMan(receiver, delta)`: Trails assigned receiver, positioning between receiver and end zone.
  * `coverDeep(delta)`: Backpedals and keeps play in front.
  * `breakOnBall(passTrajectory, delta)`: Breaks pursuit angle toward ball flight path to contest pass or intercept.
* **Specific Images**:
  * `/images/pre_play/skill.png`
  * `/images/actions/ddive.png..ddive2.png` (Shoestring dive tackle)

---

## 5. Summary Matrix: Class vs. Speed & Sprites

| Class | Position Code | Speed Multiplier | Pre-Play Sprite | Action Sprites | Run Sprites |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Quarterback** | `QB` | **0.85x** | `pre_play/skill.png` | `dropback.png`, `pass.png` | `run_ball_01..06.png` |
| **WideReceiver** | `WR` | **1.00x** | `pre_play/skill.png` | Badge `1`–`4`, `odive.png` | `run_01..06.png` / `run_ball_01..06.png` |
| **RunningBack** | `RB` | **1.00x** | `pre_play/skill.png` | `odive.png`, `tackled.png` | `run_ball_01..06.png` |
| **TightEnd** | `TE` | **0.85x** | `pre_play/skill.png` | `blocking.png`, `odive.png` | `run_01..06.png` / `run_ball_01..06.png` |
| **OffensiveLine** | `OL` (`C`/`G`/`T`) | **0.70x** | `center.png` / `lineman.png` | `blocking.png`, `blocking1.png` | `run_01..06.png` |
| **Kicker** | `K` | **0.70x** | `kicking/holder.png` | `kick_01..05.png`, `approach` | `run_01..06.png` |
| **DefensiveTackle** | `DT` (`DL`) | **0.70x** | `pre_play/lineman.png` | `ddive.png..2.png`, `resting.png` | `run_01..06.png` |
| **Linebacker** | `LB` | **0.85x** | `pre_play/skill.png` | `ddive.png..2.png`, `resting.png` | `run_01..06.png` |
| **DefensiveBack** | `DB` (`CB`/`S`) | **1.00x** | `pre_play/skill.png` | `ddive.png..2.png`, `resting.png` | `run_01..06.png` |

---

## 6. Migration Steps into Codebase

1. **Step 1**: Create `player-classes.js` containing the class hierarchy above.
2. **Step 2**: Refactor `createDefenders()` in `game.js` to instantiate `DefensiveTackle`, `Linebacker`, and `DefensiveBack` instances.
3. **Step 3**: Instantiate offensive players (`Quarterback`, `WideReceiver` 1 & 2, `TightEnd`, `RunningBack`, `OffensiveLineman`) replacing static arrays.
4. **Step 4**: Delegate `update()` and `draw()` loops directly to player instances (`player.update(delta)`, `player.draw(ctx, ...)`).

