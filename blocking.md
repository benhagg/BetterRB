# Blocking Rules & Resolution

## 1. Engagement
* **Trigger**: Distance to defender $\le 0.75\text{ yds}$ calls `player.block(target)`.
* **Blocker Speed**: Immediately drops to 0 (`speed = 0`).
* **Tackle While Blocked**: If runner gets within $0.5\text{ yds}$ of engaged defender, defender can tackle.

## 2. Ratings & Effective Scores
* **Blocker ($S_{\text{block}}$)**:
  * **OL**: $\text{strength} \times 0.40 + \text{blocking} \times 0.60$
  * **TE**: $(\text{strength} \times 0.85 + \text{catching} \times 0.15) \times 0.85$
  * **WR / RB**: $\text{strength} \times 0.60$
* **Defender Shed ($S_{\text{shed}}$)**:
  * **DL**: $\text{strength} \times 0.70 + \text{tackling} \times 0.30$
  * **LB**: $(\text{strength} \times 0.60 + \text{tackling} \times 0.40) \times 0.85$
  * **DB**: $(\text{strength} \times 0.40 + \text{tackling} \times 0.60) \times 0.60$

## 3. Defender Speed & Hold Time
* **Defender Advantage**: $A_{\text{def}} = S_{\text{shed}} - S_{\text{block}}$
* **Speed Decrease**:
  $$\text{Speed Decrease} = \text{clamp}\left(0.20,\, 1.00,\, 1.00 - \frac{\max(0, A_{\text{def}})}{5.0} \times 0.80\right)$$
  * $A_{\text{def}} \le 0 \implies 100\%\text{ decrease (speed = 0)}$
  * $A_{\text{def}} \ge 5.0 \implies 20\%\text{ decrease (retains 80% speed)}$
* **Hold Time**:
  $$T_{\text{hold}} = \text{clamp}(0.5\text{s}, 5.0\text{s}, 2.2 - A_{\text{def}} \times 0.25)$$

## 4. Outcomes
* **Defensive Pancake ($A_{\text{def}} \ge +5$)**: Defender knocks down blocker for $1.0\text{s}$, incurs only a $20\%$ speed decrease, and continues pursuit.
* **Offensive Pancake ($A_{\text{def}} \le -5$)**: Blocker drives defender into turf for $1.0\text{s}$ and advances downfield.
* **Shed ($t \ge T_{\text{hold}}$)**: Defender breaks free to pursue; blocker pauses for $0.3\text{s}$ recovery.
* **Runner Passed**: Ball carrier $\ge 3.0\text{ yds}$ downfield dissolves the block.

## 5. Tunable Constants
```javascript
const BLOCK_ENGAGE_RADIUS    = 0.75; // yds to trigger block
const BLOCKED_TACKLE_RADIUS  = 0.50; // yds for engaged defender to still tackle runner
const BLOCK_BASE_HOLD_TIME   = 2.2;  // sec base hold (even matchup)
const BLOCK_MIN_HOLD_TIME    = 0.5;  // sec min hold
const BLOCK_MAX_HOLD_TIME    = 5.0;  // sec max hold
const BLOCK_DIFF_SCALE       = 0.25; // sec added/subtracted per rating diff
const DEF_ADV_MAX_THRESHOLD  = 5.0;  // defender advantage for max blow-by / pancake
const DEF_MIN_SPEED_DECREASE = 0.20; // min speed penalty (retains 80% speed)
const DEF_MAX_SPEED_DECREASE = 1.00; // max speed penalty (full stop)
const PANCAKE_THRESHOLD      = 5.0;  // rating advantage for knockdown
const PANCAKE_DOWN_TIME      = 1.0;  // sec player stays down
const BLOCK_DISENGAGE_YARDS  = 3.0;  // yds runner past block to dissolve
```
