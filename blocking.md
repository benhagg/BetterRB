# Blocking Rules & Resolution

## 1. Engagement
* **Trigger**: Initiated when distance to defender $\le 0.75\text{ yds}$ via `player.block(target)`.
* **Immediate Effect**:
  * Blocker and defender speeds immediately drop to 0 (`speedFactor = 0`, `velocityX = 0`, `velocityY = 0`).
  * Defender pursuit and tackle checks are paused while engaged.

## 2. Ratings & Effective Scores
* **Blocker ($S_{\text{block}}$)**:
  * **OL**: $\text{strength} \times 0.40 + \text{blocking} \times 0.60$
  * **TE**: $(\text{strength} \times 0.85 + \text{catching} \times 0.15) \times 0.85$
  * **WR / RB**: $\text{strength} \times 0.60$
* **Defender Shed ($S_{\text{shed}}$)**:
  * **DL**: $\text{strength} \times 0.70 + \text{tackling} \times 0.30$
  * **LB**: $(\text{strength} \times 0.60 + \text{tackling} \times 0.40) \times 0.85$
  * **DB**: $(\text{strength} \times 0.40 + \text{tackling} \times 0.60) \times 0.60$

## 3. Hold Duration & Resolution
* **Hold Time**:
  $$T_{\text{hold}} = \text{clamp}(0.5\text{s}, 5.0\text{s}, 2.2 + (S_{\text{block}} - S_{\text{shed}}) \times 0.25)$$
* **Outcomes**:
  * **Shed ($t \ge T_{\text{hold}}$)**: Defender breaks free to pursue ball carrier; blocker enters $0.3\text{s}$ recovery delay.
  * **Pancake ($\Delta S \ge +5$)**: Defender knocked down for $1.0\text{s}$; blocker advances downfield.
  * **Runner Passed**: Ball carrier advancing $\ge 3.0\text{ yds}$ past engagement point dissolves the block.

## 4. Tunable Constants
```javascript
const BLOCK_ENGAGE_RADIUS   = 0.75; // yds to trigger block
const BLOCK_BASE_HOLD_TIME  = 2.2;  // sec base hold (even matchup)
const BLOCK_MIN_HOLD_TIME   = 0.5;  // sec min hold
const BLOCK_MAX_HOLD_TIME   = 5.0;  // sec max hold
const BLOCK_DIFF_SCALE      = 0.25; // sec added/subtracted per rating point diff
const PANCAKE_THRESHOLD     = 5.0;  // rating advantage for knockdown
const PANCAKE_DOWN_TIME     = 1.0;  // sec defender stays down
const BLOCK_DISENGAGE_YARDS = 3.0;  // yds runner must advance past to break block
```
