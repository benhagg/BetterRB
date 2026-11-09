# Defensive AI & Coverage System

### 1. Overview & Play Selection
* **Playbook Selection**: Defense randomly selects a play from `data/dplays.json` at each snap:
  1. **Zone (`base-cover-2`)**: 4 DL rushers, 4 underneath zone LBs (flats and hooks), 3 deep zone DBs.
  2. **Man (`base-cover-1-man`)**: 4 DL rushers + 1 blitzing LB, man-to-man assignments for remaining DBs/LBs, 1 deep free safety.
* **Roles**: Each slot has a `role`: `rush`, `man`, or `zone`.

---

### 2. Phase 1: Play Development (Dropback & Pocket)
* **Pass Rush (`role: "rush"`)**:
  * DL and blitzers rush directly toward the QB.
  * Blocker engagements resolve via `blocking.md`.
* **Man Coverage (`role: "man"`)**:
  * Assigned to a specific offensive target (`WR1`, `WR2`, `WR3`, `TE`, `RB`).
  * Backpedal maintaining $3.0\text{–}5.0\text{ yds}$ cushion.
  * **Reverse Run Animation**: Backpedal plays the runner animation frames in reverse (`(5 - frameIndex % 6)`) while keeping `facingLeft = true` facing the line of scrimmage.
  * When receiver cuts, defender suffers a **$0.15\text{s} - 0.25\text{s}$ reaction delay** before following the new direction.
* **Zone Coverage (`role: "zone"`)**:
  * Drop to assigned zone center (Flat, Hook/Curl, Deep Zone).
  * Bracket/contest any receiver that enters the **$3.0\text{ yds}$ zone radius**.
  * Hand off and re-center if receiver leaves zone.
* **Run Recognition Delay ($0.0\text{s} - 0.3\text{s}$)**:
  * When a handoff occurs (or QB scrambles across LOS), coverage defenders abort pass assignments and flow to the ball carrier with a momentum-based recognition delay.
  * Uses the identical delay formula ($0.15 \times (1.0 - k)$) relative to the ball carrier:
    * Moving forward toward carrier / mesh ($k = 1.0$): $\text{Delay} = \mathbf{0.00\text{s}}$ (instant downhill trigger).
    * Moving laterally ($k = 0.0$): $\text{Delay} = \mathbf{0.15\text{s}}$.
    * Backpedaling away in deep coverage ($k = -1.0$): $\text{Delay} = \mathbf{0.30\text{s}}$ (must plant and change direction).

---

### 3. Phase 2: Ball Airborne (Pass Thrown)
* **Targeted Receiver Delay**:
  * Targeted receiver waits **$0.05\text{s}$** after throw release before breaking off route toward the pass target.
* **Defender Reaction Delay ($0.0\text{s} - 0.3\text{s}$)**:
  * **Backpedaling Defender Override**: If a defender is actively in a backpedal stance when the ball is thrown, their hips and vision are already squared to the QB $\implies \text{Delay} = \mathbf{0.00\text{s}}$ (instant downhill break).
  * Otherwise, coverage defenders unlock and break on the ball based on momentum relative to the QB:
    * $\vec{d}_{\text{toQB}} = \frac{\vec{x}_{\text{QB}} - \vec{x}_{\text{def}}}{\|\vec{x}_{\text{QB}} - \vec{x}_{\text{def}}\|}$ (Unit vector towards QB)
    * $\vec{u}_{\text{def}} = \frac{\vec{v}_{\text{def}}}{\|\vec{v}_{\text{def}}\|}$ (Defender momentum unit vector)
    * $k = \vec{u}_{\text{def}} \cdot \vec{d}_{\text{toQB}} \in [-1.0, 1.0]$
    $$\text{Break Delay} = 0.15 \times (1.0 - k) \quad \text{seconds}$$
  * **Running towards QB ($k = 1.0$)**: $\text{Delay} = \mathbf{0.00\text{s}}$ (instant break).
  * **Running laterally ($k = 0.0$)**: $\text{Delay} = \mathbf{0.15\text{s}}$.
  * **Running away downfield ($k = -1.0$)**: $\text{Delay} = \mathbf{0.30\text{s}}$ (hips must flip).

---

### 4. Phase 3: Ball Carrier Pursuit & Tackling

#### Leading Pursuit Angle Calculation
Rather than chasing the ball carrier's current position, defenders target a predicted intercept point $\vec{x}_{\text{aim}}$:
1. **Time to Intercept ($t_{\text{int}}$)**:
   $$t_{\text{int}} = \text{clamp}\left(0.1\text{s},\, 1.5\text{s},\, \frac{\|\vec{p}_{\text{carrier}} - \vec{p}_{\text{def}}\|}{v_{\text{def}} + 0.1}\right)$$
2. **Base Intercept Point**:
   $$\vec{x}_{\text{int}} = \vec{p}_{\text{carrier}} + \vec{v}_{\text{carrier}} \cdot t_{\text{int}}$$

#### Role-Based Leverage Adjustments:
* **Contain Defenders (CBs & Outside LBs)**:
  * Aim toward the sideline shoulder of the intercept point to "cup" the runner and prevent perimeter breakouts:
    $$y_{\text{aim}} = y_{\text{int}} + \text{sign}(y_{\text{carrier}} - 0.5) \times \text{CONTAIN\_OFFSET}$$
* **Alley / Inside Defenders (Inside LBs & DL)**:
  * Aim directly at $\vec{x}_{\text{int}}$ (inside-out angle) to close cutback lanes against the grain.
* **Deep Safeties**:
  * Maintain depth leverage: add $+1.5\text{ yds}$ downfield cushion to $x_{\text{int}}$ until the runner commits to a lane.

#### Engagement & Resolution:
* Blocker engagements resolve via `blocking.md`.
* Tackles (standing vs dive) resolve via `tackling.md`.

---

### 5. Tunable Constants
```javascript
// Coverage & Breaks
const ZONE_CONTEST_RADIUS    = 3.00; // yds radius around zone anchor to contest receiver
const MAN_CUSHION_DISTANCE   = 4.00; // yds cushion maintained during backpedal
const MAN_CUT_REACTION_DELAY = 0.20; // sec delay when receiver cuts on route
const RECEIVER_BREAK_DELAY   = 0.05; // sec delay before targeted receiver breaks to ball
const DEF_MAX_BREAK_DELAY    = 0.30; // max sec delay for defender running away from QB
const DEF_MIN_BREAK_DELAY    = 0.00; // min sec delay for defender running toward QB

// Leading Pursuit
const PURSUIT_CONTAIN_OFFSET = 0.08; // lateral offset (~1.36 yds) to force runner inside
const PURSUIT_SAFETY_CUSHION = 1.50; // yds extra depth cushion kept by safeties
const PURSUIT_MAX_LEAD_TIME  = 1.50; // max sec forward prediction window
```
