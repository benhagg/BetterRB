# Better RB

Start the local server with `npm start`, then open `http://localhost:3000`.

The current game is stored in `data/save_1/`:

- `roster.json` contains player positions, XP, portrait indices, and four ratings on a 0–10 scale.
- `season.json` contains the team, schedule, record, and in-progress game.
- `scores.txt` records completed games using the year, week, team IDs, and score columns from the shared schedule.
- `archives/` contains earlier season snapshots.

`rb/shared/schedule.txt` is the shared schedule template used to start a season. `rb/shared/uniforms.txt` stores uniform colors, indexed by team ID; the server reads it when loading a save. The game currently supports one save.
