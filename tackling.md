# Tackling Rules & Resolution

### 1. Engagement & Triggers
* **Standing Tackle**: Distance to ball carrier $\le 0.6\text{ yds}$.
* **Dive Tackle**: Distance between $0.8\text{ yds}$ and $2.2\text{ yds}$. Plays `ddive` animation sequence (`ddive.png`, `ddive1.png`, `ddive2.png`).

---

### 2. Effective Scores
* **Ball Carrier Break Score ($S_{\text{carrier}}$)**:
  $$S_{\text{carrier}} = \text{strength} + \text{BraceBoost}$$
  * **Brace Boost**: $+2.5\text{ rating points}$ when carrier is running under $80\%$ max speed (`speedFactor < 0.80`).
* **Defender Tackle Score ($S_{\text{tackler}}$)**:
  $$S_{\text{tackler}} = (\text{tackling} \times 0.60 + \text{strength} \times 0.40) - \text{DivePenalty}$$
  * **Dive Penalty**: $-2.0\text{ rating points}$ for dive tackles (arm tackle / lunge).

---

### 3. Resolution & Probability
* **Tackle Success Chance**:
  $$P_{\text{tackle}} = \text{clamp}(0.10,\, 0.95,\, 0.60 + (S_{\text{tackler}} - S_{\text{carrier}}) \times 0.08)$$
  *(Even matchup = $60\%$ base tackle rate; each rating point advantage shifts chance by $\pm 8\%$).*

---

### 4. Outcomes
* **Tackle Success**:
  * Ball carrier enters `isTackled = true`, speed drops to 0.
  * Plays `tackled` animation (`tackled.png`, `tackled1.png`, `tackled2.png`).
  * Play ends (down by contact).
* **Broken Tackle**:
  * Carrier breaks free, suffers brief stumble ($50\%$ speed for $0.3\text{s}$), then re-accelerates.
  * Carrier gains **$0.4\text{s}$ tackle immunity** against the same defender.
  * Defender misses and enters **$0.6\text{s}$ recovery delay** before pursuing again.

---

### 5. Existing Animations
All required sprites are already present in `/images/actions/` and registered in `sprites.js`:
* **Defender Dive**: `ddive.png`, `ddive1.png`, `ddive2.png`
* **Carrier Tackled**: `tackled.png`, `tackled1.png`, `tackled2.png`
* **Carrier Dive**: `odive.png`, `odive1.png`, `odive2.png`

---

### 6. Tunable Constants
```javascript
const TACKLE_STAND_RADIUS     = 0.60; // yds for standing wrap-up tackle
const TACKLE_DIVE_MIN_DIST    = 0.80; // yds min distance to initiate dive
const TACKLE_DIVE_MAX_DIST    = 2.20; // yds max distance to initiate dive
const TACKLE_BASE_PROBABILITY = 0.60; // 60% base chance for even matchup
const TACKLE_DIFF_SCALE       = 0.08; // probability shift per score diff
const BRACE_SPEED_THRESHOLD   = 0.80; // < 80% speed triggers brace boost
const BRACE_SCORE_BOOST       = 2.50; // rating bonus when braced / under speed threshold
const DIVE_TACKLE_PENALTY     = 2.00; // rating penalty for lunging dive tackles
const BROKEN_TACKLE_IMMUNITY  = 0.40; // sec immunity from immediate re-tackle
const TACKLER_MISS_RECOVERY   = 0.60; // sec defender whiff recovery time
```
