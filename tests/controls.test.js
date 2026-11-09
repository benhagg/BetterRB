import { describe, it, expect } from 'vitest';
import PlayerClasses from '../player-classes.js';

const { WideReceiver, RunningBack, Quarterback } = PlayerClasses;

// Emulates the movePlayer logic in game.js
function simulateMovePlayer(carrier, isPocketQb, delta, input) {
  if (!carrier || carrier.isTackled) return;

  const hasInput = Boolean(input.right || input.left || input.down || input.up);
  let dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
  let dy = Number(Boolean(input.down)) - Number(Boolean(input.up));

  if (isPocketQb) {
    if (hasInput && (dx !== 0 || dy !== 0)) {
      carrier.move(delta, dx, dy);
    } else {
      carrier.coastToStop(delta);
    }
  } else {
    if (hasInput && (dx !== 0 || dy !== 0)) {
      carrier.autoRun = { vx: dx, vy: dy };
    }
    if (carrier.autoRun) {
      carrier.move(delta, carrier.autoRun.vx, carrier.autoRun.vy);
    } else {
      carrier.coastToStop(delta);
    }
  }
}

describe('Player Movement Input: WASD Hold & Persistent Direction', () => {
  it('moves when holding WASD keys normally (cardinal and diagonal)', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 8 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;

    const delta = 1 / 60;
    // Holding 'D' (right)
    for (let i = 0; i < 15; i++) {
      simulateMovePlayer(rb, false, delta, { right: true });
    }
    expect(rb.x).toBeGreaterThan(20.3);
    expect(rb.autoRun).toEqual({ vx: 1, vy: 0 });

    // Holding 'W' + 'D' (diagonal Up-Right)
    const startY = rb.y;
    for (let i = 0; i < 15; i++) {
      simulateMovePlayer(rb, false, delta, { right: true, up: true });
    }
    expect(rb.y).toBeLessThan(startY); // moved Up
    expect(rb.autoRun).toEqual({ vx: 1, vy: -1 });
  });

  it('continues moving in the last commanded direction when keys are released instead of stopping', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 8 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;

    const delta = 1 / 60;
    // User held 'D' for a few frames
    for (let i = 0; i < 10; i++) {
      simulateMovePlayer(rb, false, delta, { right: true });
    }
    const xAfterRelease = rb.x;

    // User lets go of all keys (input is completely empty)
    for (let i = 0; i < 30; i++) {
      simulateMovePlayer(rb, false, delta, {});
    }

    // Runner did NOT stop on the field; continued advancing in the last commanded direction
    expect(rb.x).toBeGreaterThan(xAfterRelease + 1.0);
    expect(rb.isMoving).toBe(true);
    expect(rb.autoRun).toEqual({ vx: 1, vy: 0 });
  });

  it('allows single-click taps to redirect and run indefinitely', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 8 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;
    rb.autoRun = { vx: 1, vy: 0 }; // initially running forward

    const delta = 1 / 60;
    // Single click 'W' (up) for 1 frame
    simulateMovePlayer(rb, false, delta, { up: true });
    expect(rb.autoRun).toEqual({ vx: 0, vy: -1 });

    const yAfterTap = rb.y;
    // Release key for 20 frames
    for (let i = 0; i < 20; i++) {
      simulateMovePlayer(rb, false, delta, {});
    }

    // Player continuously moved Up
    expect(rb.y).toBeLessThan(yAfterTap);
    expect(rb.isMoving).toBe(true);
  });

  it('keeps QB in the pocket stationary when keys are released', () => {
    const qb = new Quarterback({ position: 'QB', ratings: { speed: 6 } });
    qb.x = 20;
    qb.y = 0.5;
    qb.hasBall = true;

    const delta = 1 / 60;
    // QB moves while key is held
    for (let i = 0; i < 10; i++) {
      simulateMovePlayer(qb, true, delta, { down: true });
    }
    expect(qb.y).toBeGreaterThan(0.5);

    // QB stops when key is released
    for (let i = 0; i < 30; i++) {
      simulateMovePlayer(qb, true, delta, {});
    }
    expect(qb.isMoving).toBe(false);
  });

  it('allows slowing down without stopping via rapid D-A-D tapping', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 10, agility: 10 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;

    const delta = 1 / 60;
    // Accelerate right (D)
    for (let i = 0; i < 20; i++) {
      simulateMovePlayer(rb, false, delta, { right: true });
    }
    const initialSpeedFactor = rb._movement.speedFactor;
    expect(initialSpeedFactor).toBeGreaterThan(0.5);

    // Tap A (left) for 3 frames to initiate cut deceleration
    for (let i = 0; i < 3; i++) {
      simulateMovePlayer(rb, false, delta, { left: true });
    }
    expect(rb._movement.speedFactor).toBeLessThan(initialSpeedFactor);

    // Tap D (right) again
    for (let i = 0; i < 5; i++) {
      simulateMovePlayer(rb, false, delta, { right: true });
    }

    expect(rb._movement.speedFactor).toBeGreaterThan(0);
    expect(rb.isMoving).toBe(true);
  });

  it('decelerates and turns toward the end zone after a catch', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 8 } });
    rb.hasBall = false;
    rb._movement = {
      direction: { x: -1, y: 0 },
      speedFactor: 1,
      hasDirection: true,
      deceleration: null,
      cut: null
    };
    rb.lastDirX = -1;
    rb.lastDirY = 0;
    rb.velocityX = -rb.speed;
    rb.catchBall({ vx: 1, vy: 0 });

    const before = rb._movement.speedFactor;
    simulateMovePlayer(rb, false, 1 / 60, {});

    expect(rb.autoRun).toEqual({ vx: 1, vy: 0 });
    expect(rb._movement.speedFactor).toBeLessThan(before);

    for (let i = 0; i < 120; i++) simulateMovePlayer(rb, false, 1 / 60, {});
    expect(rb._movement.direction.x).toBeGreaterThan(0);
    expect(rb.velocityX).toBeGreaterThan(0);
  });
});
