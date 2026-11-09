# Football Game Rules & Logic

Specification for core game rules, down and distance tracking, scoring, clock management, and ball placement.

---

### 1. Field Geometry & Ball Placement

* **Goal Lines & End Zones**:
  * Offense drives left-to-right toward the opponent goal line ($X = 100\text{ yds}$).
  * **Opponent End Zone**: $X \ge 100\text{ yds}$ (Touchdown plane).
  * **Own End Zone**: $X \le 0\text{ yds}$ (Safety plane).
* **Forward Progress**:
  * When a ball carrier is tackled, the ball is spotted at the **furthest forward point** reached before contact or before being driven backward.
  * If a runner is actively driven back by a gang tackle, the dead-ball spot remains at the apex of forward progress.
* **Incomplete Pass**:
  * Ball returns to the previous Line of Scrimmage ($X_{\text{scrimmage}}$). No yardage gained or lost.
* **Out of Bounds**:
  * Triggered when the ball carrier's position crosses the sideline ($Y \le \text{top}$ or $Y \ge \text{bottom}$).
  * Ball is spotted at the exact longitudinal position ($X$) where the runner crossed the boundary plane.
  * Clock halts immediately.
* **Lateral Ball Spotting ($Y$-Axis)**:
  * **Current Baseline**: Ball is snapped along the current lateral coordinate or centered at $Y = 0.50$.
  * **[Future Plan] Hash Mark Spotting**: Snap aligns to Left Hash ($Y = 0.35$), Middle ($Y = 0.50$), or Right Hash ($Y = 0.65$) based on where the prior play finished.

---

### 2. Downs, Distance & Chains

* **Down Tracking**:
  * Offense has 4 downs to advance $\ge 10\text{ yds}$ beyond the initial line of scrimmage.
  * **State Tracking**: `down` (1–4), `distance` (yards remaining to gain), `lineOfScrimmage` ($X_{\text{scrimmage}}$), and `lineOfGain` ($X_{\text{gain}}$).
* **First Down Line**:
  $$X_{\text{gain}} = X_{\text{scrimmage}} + 10.0$$
* **First Down Conversion**:
  * If the dead-ball spot $X_{\text{spot}} \ge X_{\text{gain}}$:
    * Chains reset.
    * Down resets to **1st & 10**.
    * $X_{\text{scrimmage}} = X_{\text{spot}}$.
* **Goal-to-Go**:
  * When $X_{\text{scrimmage}} \ge 90.0\text{ yds}$, it becomes **1st & Goal**.
  * No first down is possible; the line of gain is the opponent goal line ($X = 100.0\text{ yds}$).
* **Turnover on Downs**:
  * If 4th down ends with $X_{\text{spot}} < X_{\text{gain}}$ without converting or scoring:
    * Possession flips to the opponent.
    * Opponent takes over at the dead-ball spot.

---

### 3. Scoring

* **Touchdown (6 Points)**:
  * Triggered when the ball breaks the plane of the opponent goal line ($X \ge 100.0$) on a run, or a pass is caught in the end zone.
* **2-Point Conversion (Active Default)**:
  * Follows every touchdown.
  * Offense lines up for a single un-timed snap from the **$2\text{ yd}$ line** ($X = 98.0\text{ yds}$).
  * Crossing into the end zone awards **$+2\text{ points}$**.
  * If stopped short or turned over, awards **$+0\text{ points}$**.
* **Safety (2 Points for Opponent)**:
  * Ball carrier tackled inside their own end zone ($X \le 0.0$).
  * Awards **$+2\text{ points}$** to the defense, and defense receives possession via free kick.
* **[Future Plan] Kicking Game (Field Goals & 1-PT PATs)**:
  * **1-Point PAT Kick**: Extra point kick from the $15\text{ yd}$ line ($X = 85.0$).
  * **Field Goal (3 Points)**: Available on 4th down, or on any down inside the final $2\text{ minutes}$ of either half.

---

### 4. Clock Management & Simulation Burn Clock

* **Game Structure**:
  * 4 Quarters total (2 Quarters per Half).
  * Halftime occurs at the end of Q2 (possession alternates, timeouts reset).
* **Simulation Burn Clock**:
  * During active play, the game clock runs in real-time.
  * Between downs (play-selection / huddle phase), a **simulation runoff of $\approx 15\text{ seconds}$** is burned from the game clock if the previous play ended in bounds with a running clock.
* **Clock Stoppages (No $15\text{s}$ Runoff)**:
  1. **Incomplete Pass**: Clock stops immediately.
  2. **Out of Bounds**: Clock stops immediately when runner crosses sideline.
  3. **Touchdown / Turnover / Change of Possession**: Clock stops immediately.
  4. **Timeout Called**: Clock stops immediately.
  5. **End of Quarter**: Clock expires at $00:00$.
* **Inside 2 Minutes ("Chew Clock" / Burn Play Clock Mode)**:
  * When game clock is $\le 2:00$ in either half:
  * A UI button **"Burn Play Clock"** becomes available.
  * When enabled, the offense milks the play clock down to the final second before snapping:
    * Burns the maximum play-clock runoff ($\approx 35\text{–}40\text{ seconds}$) off the game clock.
    * Snaps the ball with $1\text{ second}$ remaining on the play clock.
    * Ideal for the leading team running out the clock.
* **Timeouts**:
  * Each team receives **3 timeouts per half**.
  * Calling a timeout:
    * Halts the game clock immediately.
    * Negates the $15\text{s}$ runoff.
    * Preserves possession and clock state for crucial two-minute drill drives.
  * Unused timeouts do not carry over across halftime.

---

### 5. Tunable Parameters & Constants

```javascript
// Field & Yardage
const GOAL_LINE_OWN           = 0.0;    // Own goal line (safety threshold)
const GOAL_LINE_OPPONENT      = 100.0;  // Opponent goal line (touchdown plane)
const FIRST_DOWN_YARDS        = 10.0;   // Default yards needed for 1st down
const GOAL_TO_GO_THRESHOLD    = 90.0;   // Yardline where 1st down becomes Goal-to-Go
const TWO_POINT_SNAP_YARD     = 98.0;   // 2-yard line for 2-point attempt

// Clock & Timeouts
const TIMEOUTS_PER_HALF       = 3;      // Number of timeouts per team per half
const CLOCK_BURN_HUDDLE_SEC   = 15.0;   // Seconds burned between in-bounds plays
const CHEW_CLOCK_BURN_SEC     = 39.0;   // Maximum play-clock burn in 2-minute mode
const TWO_MINUTE_WARNING_SEC  = 120.0;  // Threshold for late-game clock options

// Scoring Values
const POINTS_TOUCHDOWN        = 6;
const POINTS_TWO_POINT_CONV   = 2;
const POINTS_SAFETY           = 2;
const POINTS_FIELD_GOAL       = 3;      // Reserved for future kicking implementation
const POINTS_EXTRA_POINT_KICK = 1;      // Reserved for future kicking implementation
```

---

### 6. Roadmap & Future Implementation

1. **Hash Mark Placement**: Snap from near/far hash marks based on lateral end of play.
2. **Kicking Engine**: Field goals and 1-PT extra point kicks via aim/power meter.
3. **Turnover Returns**: Live defensive returns on fumbles and interceptions instead of immediate dead-ball whistle.
