# Catching Rules & Resolution System

## 1. Overview & Architecture
* **Pre-computed Resolution**: Trajectories of the ball and all eligible players (WR, TE, RB, DB, LB) are deterministic at throw release. The outcome (who catches it, contact point, contact time, interception, or incomplete bounce) is calculated once when the pass is thrown.
* **Execution**: Players and the ball move along their trajectories. When the ball reaches the predetermined contact time \(t_{\text{catch}}\), the game executes the outcome (standard catch, jumping catch, deflection, or ground bounce).

---

## 2. Direction-Aware 3D Catch Volume (Option 3)
Instead of a symmetrical sphere, each player has an oriented 3D reach volume shaped by their movement/facing heading \(\vec{u} = (u_x, u_y)\):

### Horizontal Reach (Yards)
Relative displacement to ball: \(\Delta \vec{d} = (x_b - x_p, (y_b - y_p) \cdot 17)\).
* **Forward Reach (\(R_{\text{forward}} = 1.8\text{ yds}\))**: In front of chest / along momentum vector.
* **Lateral Reach (\(R_{\text{lateral}} = 1.2\text{ yds}\))**: To the left and right sides.
* **Rear Reach (\(R_{\text{rear}} = 0.6\text{ yds}\))**: Behind the back / over-the-shoulder trailing reach.
* **Longitudinal Reach**: \(d_{\parallel} = \Delta \vec{d} \cdot \vec{u}\); \(R_x = d_{\parallel} \ge 0 ? R_{\text{forward}} : R_{\text{rear}}\).
* **Transverse Reach**: \(d_{\perp} = |\Delta \vec{d} \times \vec{u}|\).
* **Normalized Horizontal Distance**:
  $$D_{xy}(t) = \sqrt{\left(\frac{d_{\parallel}(t)}{R_x}\right)^2 + \left(\frac{d_{\perp}(t)}{R_{\text{lateral}}}\right)^2} \le 1.0$$

### Vertical Reach (Feet)
* **Standard Reach Zone**: \(1.0\text{ ft} \le z_b(t) \le 8.5\text{ ft}\) (standing / running hands catch).
* **High / Jumping Reach Zone**: \(8.5\text{ ft} < z_b(t) \le 10.5\text{ ft}\) (triggers jump catch).
* **Out of Reach**: \(z_b(t) > 10.5\text{ ft}\) (sails overhead) or \(z_b(t) \le 0\text{ ft}\) (hits ground).

---

## 3. Jump Catch Animation (`jump_catch.png` & `jump_catch_1.png`)
* **Trigger**: Initiated when the peak contact point occurs at a ball height **above 8.5 feet** (\(z_b(t) > 8.5\text{ ft}\)).
* **Sprite Sequence**:
  * **Frame 0 (`images/actions/jump_catch.png`)**: Receiver leaps into air, reaching upward at apex.
  * **Frame 1 (`images/actions/jump_catch_1.png`)**: Hands on ball / tucking ball on descent.
* **Jump Catch Outcomes**:
  * **Success**: Receiver secures the ball at jump apex, lands, and transitions to running ball carrier.
  * **Incomplete**: Receiver jumps and contests the high ball, but fails catch roll \(\implies\) ball tips/deflects and triggers incomplete bounce sequence.

---

## 4. Incomplete Pass & Ball Bouncing Physics
When a pass is incomplete (untouched, dropped, or swatted/PBU):

1. **Impact Point**: The ball reaches the ground (\(z = 0\)) at landing coordinates \((x_{\text{land}}, y_{\text{land}})\).
2. **Bouncing Dynamics**:
   * **Restitution (\(e = 0.45\))**: Vertical rebound velocity retains 45% of incoming velocity (\(v_z' = -e \cdot v_z\)).
   * **Horizontal Friction (\(\mu = 0.50\))**: Forward and lateral velocities diminish by 50% on each impact (\(v_x' = \mu \cdot v_x\), \(v_y' = \mu \cdot v_y\)).
   * **Sequence (2–3 Bounces)**:
     * *Bounce 1*: Moderate hop (~1.5–2.0 ft high).
     * *Bounce 2*: Small hop (~0.5–0.8 ft high).
     * *Bounce 3*: Low rolling skid to a dead stop.
3. **Play Completion**:
   * Once the ball comes to rest (total bounce duration ~0.8s–1.0s) or rolls out of bounds, the whistle blows and the game transitions to `complete` phase for the next down.

---

## 5. Catch Probability & Contention Rules
* **Point Probability**:
  $$P(t) = (1 - D_{xy}(t)^2) \times P_z(t) \times (0.50 + 0.05 \cdot \text{catching})$$
  * \(P_z(t) = 1.0\) for standard height (\(3.0\)–\(7.5\text{ ft}\)).
  * \(P_z(t) = 0.85\) for high jumping catches (\(8.5\)–\(10.5\text{ ft}\)).
* **Peak Probability**: \(P_{\text{peak}} = \max_t P(t)\) evaluated along trajectory through volume.
* **Contested Resolution**:
  * **Offense vs. Offense**: Designed intended receiver gets a **+0.15 priority bonus** to \(P_{\text{peak}}\).
  * **Offense vs. Defense**: Independent rolls against \(P_{\text{peak}}\):
    * *Only Offense wins*: Reception.
    * *Only Defense wins*: Interception.
    * *Both win*: Higher \(P_{\text{peak}}\) wins (ties go to offense).
    * *Both fail*: Pass Break-Up (PBU) \(\implies\) incomplete ball bounce.

---

## 6. Tunable Parameters (Top of `game-catching.js`)
```javascript
// Horizontal Reach (Yards)
const REACH_FORWARD_YARDS = 1.8;
const REACH_LATERAL_YARDS = 1.2;
const REACH_REAR_YARDS = 0.6;

// Vertical Reach (Feet)
const HEIGHT_CHEST_FEET = 5.0;
const HEIGHT_JUMP_THRESHOLD_FEET = 8.5;
const HEIGHT_MAX_JUMP_FEET = 10.5;
const HEIGHT_MIN_FEET = 1.0;

// Catch Probabilities
const JUMP_CATCH_PENALTY = 0.85;       // Multiplier for difficult leaping catches
const INTENDED_TARGET_BONUS = 0.15;    // Priority boost for designed receiver

// Incomplete Ball Bounce Physics
const BOUNCE_RESTITUTION = 0.45;       // Height rebound factor per bounce
const BOUNCE_FRICTION = 0.50;          // Horizontal velocity dampening
const MAX_BOUNCES = 3;                 // Number of bounces before ball settles
const BOUNCE_DURATION_SECONDS = 0.85;  // Total time for bounce sequence
```
