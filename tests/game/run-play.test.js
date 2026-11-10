import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import PlayerClasses from '../../src/game/players/index.js';

const originalGlobals = {};

beforeAll(async () => {
  for (const key of ['window', 'GameCamera', 'GameZoneEngine', 'GameDefenseAI', 'GamePassing', 'GameCatching', 'GameRenderer', ...Object.keys(PlayerClasses)]) {
    originalGlobals[key] = globalThis[key];
  }

  globalThis.window = globalThis;
  Object.assign(globalThis, PlayerClasses, {
    GameCamera: { create: () => ({}) },
    GameZoneEngine: { create: () => ({}) },
    GameDefenseAI: {
      RECEIVER_BREAK_DELAY: 0.05,
      create: () => ({ initialize() {}, update() {}, onPassReleased() {} })
    },
    GamePassing: {
      create: () => ({
        throwHeightAt: () => 0,
        updateWindup() {},
        throwPass() {},
        throwPassToLocation() {}
      })
    },
    GameCatching: { create: () => ({ schedule() {}, resolve: () => null }) },
    GameRenderer: { create: () => ({ draw() {} }) }
  });

  await import('../../src/game/game.js');
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

describe('run-play handoff', () => {
  it('runs the RB handoff route and transfers the ball from QB to RB', () => {
    const runPlay = {
      id: 'test-run',
      playtype: 'run',
      formation: {
        quarterback: { position: 'QB', across: 0, offset: -3 },
        offensiveLine: [],
        receivers: [],
        runningBack: {
          position: 'RB',
          across: 0,
          offset: -3.8,
          route: [{ dx: 2.5, dy: 0 }, { dx: 15, dy: 0 }]
        }
      }
    };
    const team = { id: 1, players: [], colors: { home: {}, away: {} } };
    const game = globalThis.window.playGame(team, team, null, { offense: runPlay });

    // A previous defensive possession must not suppress the next offensive snap.
    game.state.possession = 'defense';
    game.setOffensivePlay(runPlay);
    const routeSpy = vi.spyOn(game.state.runningBack, 'runRoute');
    game.pressSpace();

    for (let frame = 0; frame < 120 && !game.state.runningBack.hasBall; frame++) {
      game.update(1 / 60, {});
    }

    expect(routeSpy).toHaveBeenCalled();
    expect(game.state.quarterback.hasBall).toBe(false);
    expect(game.state.runningBack.hasBall).toBe(true);
    expect(game.state.runningBack.autoRun.vx).toBeGreaterThan(0);
  });
});
