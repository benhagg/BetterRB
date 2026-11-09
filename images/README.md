# Game images

- `field.png` is the complete field and sidelines used during a game.
- `portraits/portrait_00.png` through `portrait_09.png` are the player portraits. The `portrait` number in `data/save_1/roster.json` selects one.
- `running/run_01.png` through `run_06.png` are the running frames used by the game. Add frames to `runnerFrames` in `sprites.js`.
- `running/run_ball_*.png` and `running/run_ball_alt_*.png` are two additional running sequences with the ball; they are not used yet.
- `kicking/` contains two kicking sequences. `kick_selected_pose_m.png` is the pose selected as kicking in the reference; the original sprite metadata labels it as a spike pose.
- `other/legacy_taunt.png` and `kicking/legacy_kick.png` preserve the two previously used images.
- `unfiltered/unfilterd_1.png` onward are player animation frames ready to sort. `unfiltered/contact-sheet.png` shows their numbers, and `unfiltered/index.json` records their original sprite names. These are separate copies, so sorting them does not change the images currently used by the game.
- `pre_play/center.png`, `lineman.png`, and `skill.png` are the poses used in the formation. `ball.png` is available for future play logic.

Keep regular running frames on the same 16 × 17 canvas and line up the player consistently across frames. The ball-running frames use 16 × 16 pixels, kicking frames use 16 × 20 pixels, and portraits use 29 × 37 pixels. The game replaces these exact placeholder colors with the selected team's uniform colors:

| Image | Placeholder color | Uniform part |
| --- | --- | --- |
| Portrait | Green `#00ff00` | Shirt |
| Portrait | Magenta `#ff00ff` | Sleeves near the top; pants near the bottom |
| Portrait | Red `#ff0000` | Stripe |
| Running | Red `#ff0000` and dark red `#800000` | Helmet and shadow |
| Running | Blue `#0000ff`, dark blue `#000080`, and light blue `#8080ff` | Shirt and shading |
| Running | Magenta `#ff00ff` and dark magenta `#800080` | Pants and shadow |
| Running | Yellow `#ffff00`, green `#00ff00`, and dark green `#007f00` | Socks and shading |

Keep the image backgrounds transparent. Other colors are displayed as drawn.
