# Passing

## Implemented

- Quarterbacks throw only from behind the line of scrimmage.
- Throw windup delays release while the quarterback can continue moving.
- Receiver targets lead the receiver’s projected route position.
- Ball flight uses a gravity-based arc with distance-based arc scaling.
- Short throws use faster flight than deep throws.
- Ball height is tracked separately from its ground position.
- Catch attempts are scheduled at each player’s best contact opportunity.
- Attempts resolve by scheduled contact time; a successful catch ends the pass.
- Each player gets one roll per pass.
- Nearby defenders reduce offensive catch probability.
- Missed passes continue as projectiles, then bounce after reaching the ground.
- Completed passes transfer possession to the receiver or interceptor.

## Future Plans

- Limit maximum throw distance based on quarterback strength.
  - Strength 0 baseline: 15 yards.
  - Strength 10 upper limit: 30 yards.
- Add deflections and pass breakups.
- Add position-specific interception reach and jump limits.
- Tune throw accuracy, arc, flight speed, and catch probabilities through playtesting.
