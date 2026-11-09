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
### Low catches

When the ball is between 0 and 2 feet, the receiver must make a diving catch. The `images/actions/dive_catch.png`, `dive_catch_1.png`, and `dive_catch_2.png` frames are used for this animation. A successful low catch leaves the receiver down at the exact location where the catch was completed; the play does not continue as a normal upright run.
* **Standard Reach Zone**: \(2\text{ ft} \le z_b(t) \le 8.5\text{ ft}\) (standing / running hands catch).
* **Jumping Reach Zone**: \(8.5\text{ ft} < z_b(t) \le 10\text{ ft}\) (jump catch only).
* **Out of Reach**: \(z_b(t) > 10\text{ ft}\) (sails overhead) or \(z_b(t) \le 0\text{ ft}\) (hits ground).

---

## 3. Jump Catch Animation (`jump_catch.png` & `jump_catch_1.png`)
* **Trigger**: A jump catch is permitted only when the catch roll succeeds and contact height is **above 8.5 feet and no higher than 10 feet**.
* **Movement penalty**: As soon as the successful jump begins, reduce horizontal movement speed to 50%. Restore normal speed when the player lands or the catch ends.
* **Sprite Sequence**:
  * **Frame 0 (`images/actions/jump_catch.png`)**: Receiver leaps into air, reaching upward at apex.
  * **Frame 1 (`images/actions/jump_catch_1.png`)**: Hands on ball / tucking ball on descent.
* **Jump Catch Outcomes**:
  * **Success**: Receiver secures the ball at jump apex, lands, and transitions to running ball carrier.
  * **Failure**: No jump animation starts when the catch roll fails. The ball continues its projectile and may be contested by another eligible player.

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
  * \(P_z(t) = 1.0\) for low and standard catches (\(0\)–\(8.5\text{ ft}\)), provided the ball is above the ground.
  * \(P_z(t) = 0.85\) for jumping catches (\(8.5\)–\(10\text{ ft}\)).
* **Peak Probability**: \(P_{\text{peak}} = \max_t P(t)\) evaluated along trajectory through volume.
* **Contested Resolution**:
  * **Offense vs. Offense**: Designed intended receiver gets a **+0.15 priority bonus** to \(P_{\text{peak}}\).
  * **Offense vs. Defense**: Independent rolls against \(P_{\text{peak}}\):
    * *Only Offense wins*: Reception.
    * *Only Defense wins*: Interception.
    * *Both win*: Higher \(P_{\text{peak}}\) wins (ties go to offense).
    * *Both fail*: Pass Break-Up (PBU) \(\implies\) incomplete ball bounce.

## 6. Peak-Probability Catch Scheduling

Catch attempts are not rolled immediately when the ball first enters a player's catch volume. Each eligible player gets one scheduled attempt at the best moment in their catch window:

1. Simulate the ball and player positions frame-by-frame.
2. Find when the ball enters the player's catch volume.
3. Find when it leaves the player's catch volume.
4. Calculate the player's catch probability at every frame in that window.
5. Select the frame with the highest probability.
6. Schedule one catch roll for that frame.
7. Do not roll earlier or repeatedly for the same player and pass.

For example, if the ball enters a receiver's range at `0.80s`, the receiver's best positioning occurs at `0.94s`, and the ball leaves at `1.02s`, the receiver rolls once at `0.94s` using the peak probability.

For multiple players, calculate each player's best catch time independently and sort their attempts by scheduled contact time. The earliest scheduled opportunity resolves first. If that player succeeds, the pass ends. If they fail, the ball continues to the next scheduled opportunity. Nearly simultaneous attempts use distance, intended-target priority, and offense/defense status as tie-breakers.

---

## 7. Tunable Parameters (Top of `game-catching.js`)
```javascript
// Horizontal Reach (Yards)
const REACH_FORWARD_YARDS = 1.8;
const REACH_LATERAL_YARDS = 1.2;
const REACH_REAR_YARDS = 0.6;

// Vertical Reach (Feet)
const HEIGHT_CHEST_FEET = 5.0;
const HEIGHT_JUMP_THRESHOLD_FEET = 8.5;
const HEIGHT_MAX_JUMP_FEET = 10.0;
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
