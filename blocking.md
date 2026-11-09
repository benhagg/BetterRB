# Blocking Rules & Resolution

## 1. Engagement & General Rules
* **Trigger**: Blocker engages when distance $\le 0.75\text{ yds}$ via `player.block(target)`.
* **Tackle While Blocked**: If runner gets within $0.5\text{ yds}$ of engaged defender, defender can tackle.
* **Runner Passed**: Ball carrier advancing $\ge 3.0\text{ yds}$ downfield dissolves the block.

## 2. Ratings & Effective Scores
* **Blocker ($S_{\text{block}}$)**:
  * **OL**: $\text{strength} \times 0.40 + \text{blocking} \times 0.60$
  * **TE**: $(\text{strength} \times 0.85 + \text{catching} \times 0.15) \times 0.85$
  * **WR / RB**: $\text{strength} \times 0.60$
* **Defender Shed ($S_{\text{shed}}$)**:
  * **DL**: $\text{strength} \times 0.70 + \text{tackling} \times 0.30$
  * **LB**: $(\text{strength} \times 0.60 + \text{tackling} \times 0.40) \times 0.85$
  * **DB**: $(\text{strength} \times 0.40 + \text{tackling} \times 0.60) \times 0.60$

## 3. Offensive Advantage ($A_{\text{off}} = S_{\text{block}} - S_{\text{shed}} > 0$)
* **Speed**: Both blocker and defender speeds immediately drop to 0 (`speed = 0`).
* **Hold Timer Function**:
  $$T_{\text{hold}} = \text{clamp}\left(0.0\text{s},\, 2.0\text{s},\, \frac{A_{\text{off}}}{5.0} \times 2.0\right)$$
  Defender sheds the block once the timer expires; blocker has $0.3\text{s}$ recovery delay.
* **Offensive Pancake**:
  * If significant advantage ($A_{\text{off}} \ge 5.0$), blocker has up to a **50% chance** to pancake the defender.
  * Defender takes **2.0s** to get back up.
  * Once the defender gets back up, the offense can **re-engage** in a block.

## 4. Defensive Advantage ($A_{\text{def}} = S_{\text{shed}} - S_{\text{block}} > 0$)
* **Speed Decrease Function**:
  $$\text{Speed Decrease} = \text{clamp}\left(0.20,\, 1.00,\, 1.00 - \frac{A_{\text{def}}}{5.0} \times 0.80\right)$$
  $$\text{Defender Effective Speed} = v_{\text{normal}} \times (1.00 - \text{Speed Decrease})$$
  * Even matchup ($A_{\text{def}} \le 0$): $100\%$ decrease $\implies$ speed $= 0$.
  * Significant advantage ($A_{\text{def}} \ge 5.0$): $20\%$ decrease $\implies$ retains $80\%$ speed.
* **Defensive Pancake**: If $A_{\text{def}} \ge 5.0$, defender knocks down blocker for $1.0\text{s}$ and continues pursuit at $80\%$ speed.

## 5. Tunable Constants
```javascript
// Engagement & Proximity
const BLOCK_ENGAGE_RADIUS      = 0.75; // yds to trigger block
const BLOCKED_TACKLE_RADIUS    = 0.50; // yds for engaged defender to tackle runner
const BLOCK_DISENGAGE_YARDS    = 3.0;  // yds runner past block to dissolve

// Offensive Advantage
const OFF_HOLD_TIME_MAX        = 2.0;  // max hold timer in seconds (0 to 2s)
const OFF_ADV_MAX_THRESHOLD    = 5.0;  // rating advantage for max timer (2s)
const OFF_PANCAKE_MAX_CHANCE   = 0.50; // up to 50% chance on significant advantage
const DEF_GROUND_RECOVERY_TIME = 2.0;  // sec defender takes to get up after pancake
const BLOCKER_RECOVERY_DELAY   = 0.3;  // sec blocker recovery delay after normal shed

// Defensive Advantage
const DEF_ADV_MAX_THRESHOLD    = 5.0;  // rating advantage for max blow-by / pancake
const DEF_MIN_SPEED_DECREASE   = 0.20; // min speed penalty (retains 80% speed)
const DEF_MAX_SPEED_DECREASE   = 1.00; // max speed penalty (full stop)
const BLOCKED_DOWN_TIME        = 1.0;  // sec blocker stays down on defensive pancake
```
