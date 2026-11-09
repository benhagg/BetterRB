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
  * When receiver cuts, defender suffers a **$0.15\text{s} - 0.25\text{s}$ reaction delay** before following the new direction.
* **Zone Coverage (`role: "zone"`)**:
  * Drop to assigned zone center (Flat, Hook/Curl, Deep Zone).
  * Bracket/contest any receiver that enters the **$3.0\text{ yds}$ zone radius**.
  * Hand off and re-center if receiver leaves zone.
* **Run Recognition**:
  * If handoff occurs or QB scrambles across LOS, all coverage players abort pass assignments and flow to ball carrier.

---

### 3. Phase 2: Ball Airborne (Pass Thrown)
* **Targeted Receiver Delay**:
  * Targeted receiver waits **$0.05\text{s}$** after throw release before breaking off route toward the pass target.
* **Defender Reaction Delay ($0.0\text{s} - 0.3\text{s}$)**:
  * Coverage defenders unlock and break on the ball based on their momentum relative to the QB:
    * $\vec{d}_{\text{toQB}} = \frac{\vec{x}_{\text{QB}} - \vec{x}_{\text{def}}}{\|\vec{x}_{\text{QB}} - \vec{x}_{\text{def}}\|}$ (Unit vector towards QB)
    * $\vec{u}_{\text{def}} = \frac{\vec{v}_{\text{def}}}{\|\vec{v}_{\text{def}}\|}$ (Defender momentum unit vector)
    * $k = \vec{u}_{\text{def}} \cdot \vec{d}_{\text{toQB}} \in [-1.0, 1.0]$
    $$\text{Break Delay} = 0.15 \times (1.0 - k) \quad \text{seconds}$$
  * **Running towards QB ($k = 1.0$)**: $\text{Delay} = \mathbf{0.00\text{s}}$ (instant break).
  * **Running laterally ($k = 0.0$)**: $\text{Delay} = \mathbf{0.15\text{s}}$.
  * **Running away downfield ($k = -1.0$)**: $\text{Delay} = \mathbf{0.30\text{s}}$ (hips must flip).

---

### 4. Phase 3: Ball Carrier Pursuit & Tackling
* **Pursuit Angles**:
  * DBs / Safeties take outside-in pursuit angles to prevent sideline breakouts.
  * LBs take inside-out pursuit angles to seal cutbacks.
* **Engagement & Resolution**:
  * Blocks resolve via `blocking.md`.
  * Standing vs dive tackle decisions resolve via `tackling.md`.

---

### 5. Tunable Constants
```javascript
const ZONE_CONTEST_RADIUS    = 3.00; // yds radius around zone anchor to contest receiver
const MAN_CUSHION_DISTANCE   = 4.00; // yds cushion maintained during backpedal
const MAN_CUT_REACTION_DELAY = 0.20; // sec delay when receiver cuts on route
const RECEIVER_BREAK_DELAY   = 0.05; // sec delay before targeted receiver breaks to ball
const DEF_MAX_BREAK_DELAY    = 0.30; // max sec delay for defender running away from QB
const DEF_MIN_BREAK_DELAY    = 0.00; // min sec delay for defender running toward QB
```
