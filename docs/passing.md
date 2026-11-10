# Passing and Catch Resolution

## Ordered catch opportunities

When a pass is released, the ball and eligible players are simulated forward in time using the same movement and acceleration rules as live gameplay.

At each simulation frame:

1. Calculate the ball position and height.
2. Find every eligible receiver, tight end, running back, linebacker, or defensive back whose catch volume overlaps the ball.
3. Sort those players by distance from the ball's center, closest first.
4. Resolve catch attempts in that order before advancing the ball to the next frame.
5. The first successful attempt ends the pass immediately.
6. If an attempt fails, that player is marked as having attempted the pass and cannot roll again for the same throw.
7. If all players at that contact point fail, the ball continues along its trajectory and farther players get their opportunity later.

This means a player closer to the ball gets the first chance. A player farther downfield cannot catch the ball unless every earlier eligible player misses or is outside the catch volume.

## Catch outcomes

- Offensive player succeeds: reception; transfer possession and enter the running phase.
- Defensive player succeeds: interception; end the pass and transfer possession to the defense.
- Every eligible player fails: the pass continues.
- The ball reaches its landing point without a successful catch: incomplete pass and eventual bounce/settle resolution.

## Incomplete-pass flight and landing

If a player misses the catch attempt, the ball must continue from its current position and velocity along the same projectile. It should remain airborne until its simulated height reaches `z = 0`.

The ball must not teleport to the original target point or appear instantly on the ground. Once it reaches `z = 0`, begin the bounce/settle sequence at that actual landing location.

## Catch roll

Each attempt uses the player's oriented catch volume and catching rating. The probability is reduced by horizontal distance, difficult ball height, and any contested-catch penalty. The intended receiver may receive a priority bonus, but the bonus must not raise probability above 100%.

The roll order is determined by spatial proximity at the current ball position, not by receiver number or route order. A seeded/random value should be stored on the pass so a saved game can reproduce the same result.

## Important implementation rule

Do not preselect one final catcher at throw release. Precompute or simulate the sequence of contact opportunities, but resolve the earliest valid opportunity first. This prevents the ball from passing through a nearer receiver or defender merely because another player has a higher eventual probability farther downfield.
