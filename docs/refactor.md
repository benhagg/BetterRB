# Browser-Only Refactor Layout

The app runs without a custom Node backend. Vite serves static files locally; browser state and saves live in IndexedDB.

## Target repository

```text
.
├── index.html
├── style.css
├── package.json
├── package-lock.json
├── vite.config.mjs
├── README.md
├── src/
│   ├── main.js
│   ├── app/
│   │   ├── app.js                  # application coordinator
│   │   ├── router.js
│   │   ├── view-loader.js
│   │   ├── season-store.js          # IndexedDB save/load
│   │   ├── season-generator.js      # new season and roster generation
│   │   ├── game-screen.js
│   │   ├── game-loop.js
│   │   ├── game-controls.js
│   │   ├── playbook-ui.js
│   │   └── screens/
│   │       ├── home-screen.js
│   │       ├── roster-screen.js
│   │       ├── player-screen.js
│   │       └── schedule-screen.js
│   ├── game/
│   │   ├── game.js                 # public game facade and wiring
│   │   ├── field-config.js
│   │   ├── formation.js
│   │   ├── movement.js
│   │   ├── blocking.js
│   │   ├── play-flow.js            # snap, handoff, possession, completion
│   │   ├── camera.js
│   │   ├── passing.js
│   │   ├── catching.js
│   │   ├── defense-ai.js
│   │   ├── zone-agent.js
│   │   ├── tackling.js
│   │   ├── renderer.js
│   │   └── players/
│   │       └── index.js            # player classes; split by class later
│   └── shared/
│       ├── player-skills.js
│       └── sprites.js
├── public/
│   ├── views/
│   │   ├── shell.html
│   │   ├── home.html
│   │   ├── roster.html
│   │   ├── player.html
│   │   ├── schedule.html
│   │   ├── game.html
│   │   ├── rating.html
│   │   └── portrait.html
│   ├── data/
│   │   ├── default_state.json
│   │   └── seed/save_1/
│   │       ├── season.json
│   │       ├── roster.json
│   │       ├── opp_rosters.json
│   │       ├── players.json
│   │       └── scores.txt
│   ├── shared/
│   │   ├── Colleges.txt
│   │   ├── dplays.json
│   │   ├── Names_F1.txt
│   │   ├── Names_L.txt
│   │   ├── oplays.json
│   │   ├── PlayerRecords.txt
│   │   ├── RetroBowlHOF.txt
│   │   ├── Teams.txt
│   │   ├── schedule.txt
│   │   ├── uniforms.txt
│   │   ├── splash.png
│   │   └── RetroBowl_texture_{0,1,2}.{png,webp}
│   └── images/
│       ├── actions/*.png
│       ├── kicking/*.png
│       ├── portraits/*.png
│       ├── pre_play/*.png
│       ├── punt/*.png
│       ├── running/*.png
│       ├── unfiltered/*.png
│       ├── unfiltered/index.json
│       ├── unfiltered/contact-sheet.png
│       ├── ball.png
│       └── field.png
├── tests/
│   ├── app/
│   │   └── router.test.js
│   ├── game/
│   │   ├── catching.test.js
│   │   ├── controls.test.js
│   │   ├── defense-ai.test.js
│   │   ├── passing.test.js
│   │   ├── playbook.test.js
│   │   ├── players.test.js
│   │   └── run-play.test.js
├── scripts/
│   └── start-new-game.js           # creates all fresh-game data
├── docs/
│   ├── blocking.md
│   ├── catching-rules.md
│   ├── defense_ai.md
│   ├── game-rules.md
│   ├── passing.md
│   ├── plan.md
│   ├── refactor.md
│   └── tackling.md
└── tools/
    ├── calibrate.html
    └── debug/                      # reviewed scratch scripts, if still useful
```

`dplays.json` and `oplays.json` are shared static playbooks, so browser code loads them from `/shared/`. `scripts/start-new-game.js` is the developer-run tool that writes rosters, opponents, season schedule, uniforms, and initial save data. Split it only after it becomes difficult to maintain. `dist/` and `node_modules/` are generated/dependency folders and stay out of the source layout.

## Refactor order

1. Move static assets, views, and shared playbooks under `public/`; update their URLs.
2. Replace API saves with browser-side IndexedDB logic.
3. Convert the browser entry point to `src/main.js` and explicit imports.
4. Move game modules into `src/game/`; split the large game and player files by responsibility.
5. Split `app.js` into routing, screens, playbook UI, controls, and game loop.
6. Move tests and docs into their folders.

Do one step at a time and keep gameplay behavior covered by regression tests.
