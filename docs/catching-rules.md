# Catching Rules

## Implemented

- Ball and eligible-player trajectories are simulated at 60 FPS.
- One catch roll is scheduled per player at that player’s peak opportunity.
- Attempts resolve in contact-time order; successful catches end the pass.
- Catch volume uses forward, lateral, and rear reach in field yards.
- Stationary players have no facing-direction penalty.
- Catch heights are classified as dive, standard, jump, or out of reach.
- Jump catches use a 0.8-second animation and stop the receiver until landing.
- Successful catches keep the player’s position; the ball moves to the player.
- Incomplete passes continue to the ground and bounce before the play ends.
- Catch probability uses skill plus positioning:

  ```js
  skillBase = 0.3 * (catching / 10)
  positionBonus = 0.9 * (1 - normalizedDistance ** 2)
  probability = clamp(skillBase + positionBonus) * heightFactor
  ```

- Nearby defenders reduce offensive catch probability: no penalty at 2+ yards;
  up to 50% reduction when the closest defender is directly on the receiver.

- DBs and LBs may currently contest and intercept passes.

## Future Plans

- Add position-specific defensive reach and jump-catch limits.
- Replace incomplete dive-catch sprite assets with correctly cropped frames.
- Add deflections, pass breakups, and more detailed contested-catch outcomes.
- Tune catch radius, height penalties, and skill weighting through playtesting.
