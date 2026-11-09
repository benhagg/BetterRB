# Passing and receiver routes

## Requested behavior

- Press Space to snap the ball. The quarterback drops back three yards.
- Receivers run routes, with receivers assigned the numbers 1 through 4.
- Press 1, 2, 3, or 4 to throw to the corresponding receiver.
- Press Space again to let the quarterback run instead.
- Remove the current click-to-throw control.

## Implementation plan

1. Represent the receivers, their assigned numbers, and their routes in the game engine.
2. Move the receivers along their routes after the snap.
3. Connect keys 1–4 to their corresponding receivers and direct the pass toward the selected receiver.
4. Keep the snap, dropback, passing, and quarterback-running states consistent with the existing controls.
5. Test each receiver key, the dropback, the switch to running, and the removal of click-to-throw.

## Details to decide

- Which players are eligible receivers and how numbers are assigned.
- Which routes each receiver runs and how those routes are chosen.
- How receiver numbers are shown on the field.
- How passes, catches, incompletions, and interceptions are resolved.
- Whether receiver keys can be pressed during the dropback.
