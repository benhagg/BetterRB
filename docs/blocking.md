# Blocking Rules & Resolution

### 1. Engagement & General Rules
* **Trigger**: Initiated when distance to defender $\le 0.75\text{ yds}$.
* **Tackle While Blocked**: Defender can tackle the ball carrier if runner comes within $\le 0.5\text{ yds}$.
* **Disengage**: Block dissolves if runner advances $\ge 3.0\text{ yds}$ past the block.
* **Target selection**: Blockers target the nearest eligible defender who is not already down from a dive tackle or pancake.
* **Resolution cadence**: Active blocks are reevaluated every $0.5\text{s}$. Each interval resolves as a continued block, defender disengagement, or pancake.
* **Movement lock**: While an active block is being resolved, both blocker and defender have zero speed.
* **Ratings**: `STR`, `BLK`, and `TKL` are rated from 0–10.
* **Pancaked defenders**: A defender who is down from a pancake cannot tackle. The ball carrier can run over them.

---

### 2. Player Scores
* **Blocker ($S_{\text{block}}$)**:
  * **OL**: $0.40 \times \text{STR} + 0.60 \times \text{BLK}$
  * **TE**: $(0.85 \times \text{STR} + 0.15 \times \text{CTH}) \times 0.85$
  * **WR / RB**: $0.60 \times \text{STR}$
* **Defender Shed ($S_{\text{shed}}$)**:
  * **DL**: $0.70 \times \text{STR} + 0.30 \times \text{TKL}$
  * **LB**: $(0.60 \times \text{STR} + 0.40 \times \text{TKL}) \times 0.85$
  * **DB**: $(0.40 \times \text{STR} + 0.60 \times \text{TKL}) \times 0.60$

---

### 3. Offense Advantage ($S_{\text{block}} > S_{\text{shed}}$)
* **Speed**: Both players locked at `speed = 0`.
* **Hold Timer**: $0.0\text{s}$ to $2.0\text{s}$ based on advantage ($\frac{\Delta S}{5.0} \times 2.0\text{s}$). Defender sheds when timer expires.
* **Pancake**: At significant advantage ($\Delta S \ge +5$), up to **50% chance** to pancake defender.
  * Defender is knocked down for **$1.5\text{s}$**.
  * Offense can **re-engage** once defender gets back up.

---

### 4. Defense Advantage ($S_{\text{shed}} > S_{\text{block}}$)
* **Speed Decrease**: Scales from **100% to 20%** based on advantage ($\text{decrease} = 1.0 - \frac{\Delta S}{5.0} \times 0.8$).
  * Even matchup ($\Delta S = 0$): 100% speed loss (`speed = 0`).
  * Big advantage ($\Delta S \ge 5$): 20% speed loss (defender retains 80% speed).
* **Defensive Pancake**: At $\Delta S \ge +5$, defender knocks blocker down for **$1.0\text{s}$** and continues pursuit at 80% speed.

---

### 5. Double-Team Blocking
* **Trigger**: When two offensive players engage the same defender simultaneously.
* **Combined Score**: The blockers combine their blocking scores against the defender's shed score:
  $$S_{\text{block, total}} = S_{\text{block, 1}} + S_{\text{block, 2}}$$
* **Effect**:
  * Both blockers and the defender are locked at `speed = 0`.
  * The combined score virtually guarantees maximum hold time ($2.0\text{s}$) and the $50\%$ pancake chance.
  * If pancaked, the defender is downed for $1.5\text{s}$ and both blockers release to block the next player in range. in pass protection this means going to the waiting animation and or helping to block another player nearby. in run block this means advancing to find the next player to block.
* **Fallback**: If either blocker disengages or is pancaked, the remaining blocker immediately recalculates a one-on-one block against that defender.

### 6. Block Whiffs
* Some offensive players may attempt a block and miss entirely.
* A whiff does not create a block engagement.
* The defender remains free to move, but their speed is temporarily reduced by the whiff result and normal acceleration applies afterward.

### 7. Tackle Chance While Engaged
* A defender engaged in a block receives a reduced tackle chance.
* Use the block differential from the defender's perspective:
  `blockDiff = S_shed - S_block`.
* Normalize it across the useful range `-5` to `+5`:
  `tackleCoefficient = clamp((blockDiff + 5) / 10, 0, 1)`.
* A defender losing badly (`blockDiff <= -5`) has coefficient `0`.
* A defender winning badly (`blockDiff >= +5`) has coefficient `1`.
* Values between those extremes follow the normalized curve and multiply the defender's normal tackle probability.
* This reduction applies only while the block is active; a defender who pancakes the blocker receives no reduction.
