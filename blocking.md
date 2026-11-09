# Blocking Rules & Resolution System

## 1. Overview & Engagement Trigger
* **Engagement Distance**: A blocker initiates a block when distance to the target defender is within `BLOCK_ENGAGE_RADIUS` (\(R_{\text{engage}} = 0.75\text{ yds}\)).
* **Method Call**: The blocker invokes `player.block(target)`.
* **Immediate Effect**:
  * Blocker's movement speed and velocity drop immediately to 0 (`speedFactor = 0`, `velocityX = 0`, `velocityY = 0`, `isMoving = false`).
  * Target defender is engaged: defender's speed drops to 0 and pursuit/tackle logic is paused while blocked.
  * Both players face each other during the engagement.

---

## 2. Core Attributes & Effective Ratings
Blocking capability is governed primarily by **Player Strength** and **OL Blocking Skill**:

### Blocker Effective Score (\(S_{\text{block}}\))
* **Offensive Linemen (OL)**:
  $$S_{\text{block}} = (\text{strength} \times 0.40 + \text{blocking} \times 0.60) \times 1.0$$
* **Tight Ends (TE)**:
  $$S_{\text{block}} = (\text{strength} \times 0.85 + \text{catching} \times 0.15) \times 0.85$$
* **Wide Receivers (WR) & Running Backs (RB)**:
  $$S_{\text{block}} = \text{strength} \times 0.60$$
  *(WRs and RBs lack lineman mass, so their effective block strength is scaled by 0.60).*

### Defender Effective Shed Score (\(S_{\text{shed}}\))
* **Defensive Linemen (DL / DT)**:
  $$S_{\text{shed}} = (\text{strength} \times 0.70 + \text{tackling} \times 0.30) \times 1.0$$
* **Linebackers (LB)**:
  $$S_{\text{shed}} = (\text{strength} \times 0.60 + \text{tackling} \times 0.40) \times 0.85$$
* **Defensive Backs (DB / CB / S)**:
  $$S_{\text{shed}} = (\text{strength} \times 0.40 + \text{tackling} \times 0.60) \times 0.60$$

---

## 3. Block Duration & Hold Resolution
Every block engagement calculates a deterministic **Hold Duration** (\(T_{\text{hold}}\)) based on the rating differential:
$$\Delta S = S_{\text{block}} - S_{\text{shed}}$$

$$T_{\text{hold}} = \text{clamp}(T_{\text{min}}, T_{\text{max}}, T_{\text{base}} + \Delta S \times K_{\text{scale}})$$

* **Parameters**:
  * \(T_{\text{base}} = 2.2\text{ s}\) (even matchup base hold time)
  * \(K_{\text{scale}} = 0.25\text{ s/point}\) (each point of rating advantage adds/subtracts 0.25s)
  * \(T_{\text{min}} = 0.5\text{ s}\) (minimum hold time, even against dominant rushers)
  * \(T_{\text{max}} = 5.0\text{ s}\) (maximum lockdown protection)

### Matchup Examples:
* **Elite OL (10 Blk, 10 Str \(\implies S_{\text{block}} = 10\)) vs Average DL (5 Str, 5 Tkl \(\implies S_{\text{shed}} = 5\))**:
  \(\Delta S = +5 \implies T_{\text{hold}} = 2.2 + 5(0.25) = 3.45\text{ s}\) of lockdown pocket protection.
* **WR (2 Str \(\implies S_{\text{block}} = 1.2\)) vs Elite DL (10 Str, 8 Tkl \(\implies S_{\text{shed}} = 9.4\))**:
  \(\Delta S = -8.2 \implies T_{\text{hold}} = \text{clamp}(0.5, 5.0, 2.2 - 2.05) = 0.50\text{ s}\) (instant shed).

---

## 4. Outcomes & Effects on Players

### A. While Engaged (\(0 \le t < T_{\text{hold}}\))
* **Blocker**: `speed = 0`, locked in contact stance facing defender.
* **Defender**: `speed = 0`, cannot advance, dive, or tackle ball carrier while blocked.

### B. Block Termination
1. **Shed (Defender Wins / Duration Expires)**:
   * When \(t \ge T_{\text{hold}}\), the defender sheds the block.
   * Blocker enters brief recovery delay (\(0.3\text{ s}\)) before seeking a new block.
   * Defender immediately resumes pursuit of the ball carrier at full speed.
2. **Pancake Block (Dominant Blocker Win: \(\Delta S \ge +5\))**:
   * Blocker drives defender into the turf.
   * Defender is knocked down for \(1.0\text{ s}\) before recovering to feet.
   * Blocker disengages and searches for a second-level defender to block.
3. **Runner Passed (Play Flow Disengage)**:
   * If the ball carrier advances \(\ge 3.0\text{ yds}\) beyond the line of engagement, the block naturally dissolves:
     * Blocker moves downfield to seal next pursuit angle.
     * Defender disengages to chase the ball carrier from behind.

---

## 5. Targeting & Assignment Logic

### Pass Protection (Dropback & Passing Phase)
* **Offensive Line**: Each lineman mirrors against their assigned defensive rusher:
  * Center (C) blocks inside nose tackle / DT.
  * Guards (OG) block defensive tackles (DT).
  * Tackles (OT) block edge rushers / defensive ends (DE).
* **Running Back**: Scans for unblocked blitzing linebackers or edge leak rushers.

### Run Blocking & Open Field (Running Phase)
* **Linemen**: Drive forward on first-level DL to open running lanes.
* **Tight Ends & Fullbacks**: Kick out edge defenders or climb to second-level linebackers.
* **Wide Receivers**: Stalk block perimeter defensive backs (CB / S) to prevent outside edge tackles.

---

## 6. Tunable Parameters
```javascript
// Engagement
const BLOCK_ENGAGE_RADIUS = 0.75; // Yards to initiate block

// Hold Duration (Seconds)
const BLOCK_BASE_HOLD_TIME = 2.2; // Base hold for evenly matched players
const BLOCK_MIN_HOLD_TIME = 0.5;  // Minimum hold before quick shed
const BLOCK_MAX_HOLD_TIME = 5.0;  // Maximum lockdown hold duration
const BLOCK_DIFF_SCALE = 0.25;    // Seconds added/subtracted per score diff

// Skill & Position Weights
const OL_BLOCKING_WEIGHT = 0.60;
const OL_STRENGTH_WEIGHT = 0.40;
const DL_STRENGTH_WEIGHT = 0.70;
const DL_TACKLE_WEIGHT = 0.30;

// Disengage & Pancakes
const BLOCK_DISENGAGE_YARDS = 3.0; // Yards ball carrier must advance past to break block
const PANCAKE_THRESHOLD_DIFF = 5.0; // Rating advantage required for pancake knockdown
const PANCAKE_GROUND_TIME = 1.0;   // Seconds defender remains on ground after pancake
```

