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

describe('pass pursuit', () => {
  it('moves only the targeted receiver toward a receiver-targeted pass', () => {
    const passPlay = {
      id: 'test-pass-pursuit',
      playtype: 'pass',
      formation: {
        quarterback: { position: 'QB', across: 0, offset: 0 },
        offensiveLine: [],
        receivers: [
          { position: 'WR', receiverNumber: 1, across: -4, offset: 0, route: [] },
          { position: 'WR', receiverNumber: 2, across: 4, offset: 0, route: [] }
        ],
        runningBack: { position: 'RB', across: 0, offset: -3, receiverNumber: 3, route: [] }
      }
    };
    const team = { id: 1, players: [], colors: { home: {}, away: {} } };
    const game = globalThis.window.playGame(team, team, null, { offense: passPlay });
    const targetReceiver = game.state.receivers[0];
    const target = { x: game.state.fieldPosition + 12, y: 0.5 };
    const distanceBefore = Math.hypot(target.x - targetReceiver.x, (target.y - targetReceiver.y) * 25);
    const targetRun = vi.spyOn(targetReceiver, 'run');
    const otherRouteRuns = [...game.state.receivers.slice(1), game.state.runningBack]
      .map(player => vi.spyOn(player, 'runRoute'));

    game.state.phase = 'thrown';
    game.state.quarterback.hasBall = false;
    game.state.pass = {
      fromX: game.state.quarterback.x,
      fromY: game.state.quarterback.y,
      targetX: target.x,
      targetY: target.y,
      targetReceiverNumber: 1,
      duration: 1,
      progress: 0.1,
      profile: { releaseHeight: 6, launchVelocity: 0, gravity: 0 }
    };

    game.update(0.1, {});

    expect(targetRun).toHaveBeenCalledWith(0.1, target.x, target.y);
    otherRouteRuns.forEach(routeRun => expect(routeRun).toHaveBeenCalled());
    expect(Math.hypot(target.x - targetReceiver.x, (target.y - targetReceiver.y) * 25))
      .toBeLessThan(distanceBefore);
    expect(targetReceiver._movement.speedFactor).toBeGreaterThan(0);
  });

  it('moves only click-throw teammates within a quarter of the pass distance', () => {
    const passPlay = {
      id: 'test-click-pass-pursuit',
      playtype: 'pass',
      formation: {
        quarterback: { position: 'QB', across: 0, offset: 0 },
        offensiveLine: [],
        receivers: [
          { position: 'WR', receiverNumber: 1, across: 0, offset: 0, route: [] },
          { position: 'WR', receiverNumber: 2, across: 4, offset: 0, route: [] }
        ],
        runningBack: { position: 'RB', across: 0, offset: -3, receiverNumber: 3, route: [] }
      }
    };
    const team = { id: 1, players: [], colors: { home: {}, away: {} } };
    const game = globalThis.window.playGame(team, team, null, { offense: passPlay });
    const [nearReceiver, farReceiver] = game.state.receivers;
    const target = { x: game.state.fieldPosition + 20, y: 0.5 };
    nearReceiver.x = target.x - 3;
    nearReceiver.y = target.y;
    farReceiver.x = target.x - 15;
    farReceiver.y = target.y;
    game.state.runningBack.x = target.x - 14;
    game.state.runningBack.y = target.y;
    const nearRun = vi.spyOn(nearReceiver, 'run');
    const farRoute = vi.spyOn(farReceiver, 'runRoute');
    const backRoute = vi.spyOn(game.state.runningBack, 'runRoute');

    game.state.phase = 'thrown';
    game.state.quarterback.hasBall = false;
    game.state.pass = {
      fromX: game.state.quarterback.x,
      fromY: game.state.quarterback.y,
      targetX: target.x,
      targetY: target.y,
      targetReceiverNumber: null,
      distanceYards: 20,
      duration: 1,
      progress: 0.1,
      profile: { releaseHeight: 6, launchVelocity: 0, gravity: 0 }
    };

    game.update(0.1, {});

    expect(game.state.pass.pursuingPlayers).toHaveLength(1);
    expect(game.state.pass.pursuingPlayers[0]).toBe(nearReceiver);
    expect(nearRun).toHaveBeenCalledWith(0.1, target.x, target.y);
    expect(farRoute).toHaveBeenCalled();
    expect(backRoute).toHaveBeenCalled();
  });
});
