# Catching Rules & Resolution System

## 1. Overview & Architecture
* **Pre-computed Resolution**: Because both the ball trajectory and player paths are deterministic at the moment of the throw, the pass outcome (who catches it, where, when, or if it falls incomplete/intercepted) is calculated once at throw release.
* **Execution**: The game loop runs the ball and players along their paths. When the ball reaches the predetermined contact time \(t_{\text{catch}}\), the calculated outcome is executed.

---

## 2. The 3D Catch Sphere
Every eligible player (WR, TE, RB, DB, LB) has a 3D spherical catch volume:
* **Center**: Player \((x, y)\) on field at height \(z = 5.0\text{ ft}\).
* **Radius (\(R\))**: `CATCH_RADIUS = 2.0` yards (\(6.0\text{ ft}\)).
* **3D Distance Formula** (in yards):
  $$D(t) = \sqrt{(x_b(t) - x_p(t))^2 + \left((y_b(t) - y_p(t)) \cdot 17\right)^2 + \left(\frac{z_b(t) - 5.0}{3}\right)^2}$$
* **Sphere Entry & Exit**: The ball enters the sphere when \(D(t) \le R\) and exits when \(D(t) > R\).

---

## 3. Catch Probability Function
As the ball passes through a player's sphere, distance \(D(t)\) decreases to a minimum (closest point of approach) and increases again.

* **Distance Factor**:
  $$P_{\text{dist}}(t) = 1 - \left(\frac{D(t)}{R}\right)^2 \quad (\text{range } 0.0 \text{ to } 1.0)$$
  * Dead-center (\(D = 0\)): \(1.0\) (100% positional accuracy).
  * Sphere edge (\(D = 2.0\text{ yds}\)): \(0.0\).

* **Rating Factor** (using player `catching` rating \(0\)–\(10\)):
  $$P_{\text{rating}} = 0.50 + 0.05 \cdot \text{catching} \quad (\text{range } 0.50 \text{ to } 1.00)$$

* **Point Probability**:
  $$P(t) = P_{\text{dist}}(t) \cdot P_{\text{rating}}$$

* **Peak Probability**:
  $$P_{\text{peak}} = \max_{t \in [t_{\text{in}}, t_{\text{out}}]} P(t)$$
  The player's effective catch probability for the pass is the **maximum** probability achieved along the trajectory through their sphere.

---

## 4. Multi-Player Contention Resolution
At throw release, calculate the trajectory intersection for all active players:

1. **Eligible Contenders**: Any player whose sphere has \(D_{\min} \le R\).
2. **Single Contender**:
   * Roll random number \(r \in [0, 1]\). If \(r < P_{\text{peak}}\), catch is successful; otherwise incomplete.
3. **Multiple Contenders (Contested Catch)**:
   * **Offense vs. Offense** (e.g. WR & TE in same zone):
     * Intended receiver receives a **+0.15 priority bonus** to \(P_{\text{peak}}\).
     * Player with highest roll secures reception.
   * **Offense vs. Defense** (WR vs. DB/LB):
     * Both players roll independently against their \(P_{\text{peak}}\):
       * **Only Offense succeeds**: Reception.
       * **Only Defense succeeds**: Interception.
       * **Both succeed (Tie / Contest)**: Higher \(P_{\text{peak}}\) wins. Exact ties go to the offense (NFL simultaneous catch rule).
       * **Both fail**: Incomplete pass / Pass Break-Up (PBU).

---

## 5. Contact Point & Execution
* The contact time \(t_{\text{catch}}\) is the timestamp of \(P_{\text{peak}}\) (closest approach).
* When ball progress reaches \(t_{\text{catch}}\):
  * **Reception**: Catch animation triggers; player becomes ball carrier (`target.catchBall({ vx, vy })`).
  * **Interception**: Defender gains possession; turnover state initiates.
  * **Incompletion / Deflection**: Ball ricochets or hits turf; phase transitions to `complete`.

---

## 6. Tunable Parameters (Top of `game-catching.js`)
```javascript
const CATCH_RADIUS_YARDS = 2.0;       // Sphere radius in yards
const PLAYER_CENTER_HEIGHT_FEET = 5.0; // Center height of player chest
const FEET_PER_YARD = 3.0;            // Vertical scale conversion
const INTENDED_TARGET_BONUS = 0.15;    // Priority boost for designed target
const MIN_CATCH_CHANCE = 0.05;         // Hard floor for tips/miracle catches
const MAX_CATCH_CHANCE = 0.98;         // Prevents 100% automatic catches
```
