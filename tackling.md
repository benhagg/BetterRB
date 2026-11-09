# Tackling Rules & Resolution

### 1. Tackle Types & Decision Logic
* **Standing Wrap-Up Tackle ($d \le 0.6\text{ yds}$)**:
  * Default high-percentage tackle. Always triggers when defender closes to $\le 0.6\text{ yds}$.
* **Dive Tackle ($0.8\text{ yds} \le d \le 2.2\text{ yds}$)**:
  * High-risk lunge with $+40\%$ speed burst over $0.45\text{s}$ (`ddive.png` sequence).
  * **When defender decides to dive**:
    1. **Runner Pulling Away**: Runner speed $\ge$ defender speed (cannot catch runner on foot).
    2. **Desperation Stop**: Runner is within $\le 3\text{ yds}$ of goal line or first-down line.
    3. **Pursuit Window**: Trailing range ($1.0 - 1.8\text{ yds}$) with alignment within $\pm 45^\circ$.
* **Keep Running / No Dive**:
  * If defender is faster and closing the distance, defender stays on feet to secure a standing tackle.
  * If cooldown active (`diveCooldownTimer > 0`), defender cannot dive.

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
const TACKLE_DIVE_SPEED_MULT  = 1.40; // speed multiplier during dive lunge
const TACKLE_DIVE_DURATION    = 0.45; // sec dive flight duration
const TACKLE_BASE_PROBABILITY = 0.60; // 60% base chance for even matchup
const TACKLE_DIFF_SCALE       = 0.08; // probability shift per score diff
const BRACE_SPEED_THRESHOLD   = 0.80; // < 80% speed triggers brace boost
const BRACE_SCORE_BOOST       = 2.50; // rating bonus when braced / under speed threshold
const DIVE_TACKLE_PENALTY     = 2.00; // rating penalty for lunging dive tackles
const BROKEN_TACKLE_IMMUNITY  = 0.40; // sec immunity from immediate re-tackle
const TACKLER_MISS_RECOVERY   = 0.60; // sec defender whiff recovery time
const TACKLER_DIVE_COOLDOWN   = 1.00; // sec cooldown between dives
```
