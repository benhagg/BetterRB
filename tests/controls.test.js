import { describe, it, expect } from 'vitest';
import PlayerClasses from '../player-classes.js';

const { WideReceiver, RunningBack, Quarterback } = PlayerClasses;

const CHORD_WINDOW_MS = 90;

function resolveMovementClick(key, now, lastKeyPress, chordWindowMs = CHORD_WINDOW_MS) {
  let axis = null;
  let val = 0;
  if (key === 'w' || key === 'arrowup') { axis = 'y'; val = -1; }
  else if (key === 's' || key === 'arrowdown') { axis = 'y'; val = 1; }
  else if (key === 'a' || key === 'arrowleft') { axis = 'x'; val = -1; }
  else if (key === 'd' || key === 'arrowright') { axis = 'x'; val = 1; }

  if (!axis) return null;

  const isChord = Boolean(
    lastKeyPress &&
    (now - lastKeyPress.timestamp <= chordWindowMs) &&
    (lastKeyPress.axis !== axis)
  );

  const dir = isChord ? {
    dx: axis === 'x' ? val : lastKeyPress.val,
    dy: axis === 'y' ? val : lastKeyPress.val
  } : {
    dx: axis === 'x' ? val : 0,
    dy: axis === 'y' ? val : 0
  };

  return {
    dir,
    keyPress: { axis, val, timestamp: now },
    isChord
  };
}

describe('Player Movement Input & Single-Click Steering', () => {
  it('steers to pure cardinal direction on single click', () => {
    const res = resolveMovementClick('d', 1000, null);
    expect(res.dir).toEqual({ dx: 1, dy: 0 });
    expect(res.isChord).toBe(false);
  });

  it('strictly overrides previous direction when outside chord window', () => {
    const first = resolveMovementClick('d', 1000, null);
    expect(first.dir).toEqual({ dx: 1, dy: 0 });

    // 250ms later, user taps 'w' (outside 90ms chord window)
    const second = resolveMovementClick('w', 1250, first.keyPress);
    expect(second.isChord).toBe(false);
    expect(second.dir).toEqual({ dx: 0, dy: -1 }); // pure Up, no diagonal stickiness
  });

  it('forms diagonal chord when two perpendicular keys are pressed nearly simultaneously', () => {
    const first = resolveMovementClick('w', 1000, null);
    expect(first.dir).toEqual({ dx: 0, dy: -1 });

    // 40ms later, user taps 'd' (within 90ms chord window)
    const second = resolveMovementClick('d', 1040, first.keyPress);
    expect(second.isChord).toBe(true);
    expect(second.dir).toEqual({ dx: 1, dy: -1 }); // diagonal Up-Right
  });

  it('forms diagonal chord in reverse press order (D then W within window)', () => {
    const first = resolveMovementClick('d', 1000, null);
    const second = resolveMovementClick('w', 1030, first.keyPress);
    expect(second.isChord).toBe(true);
    expect(second.dir).toEqual({ dx: 1, dy: -1 });
  });

  it('does NOT chord opposite keys on the same axis (e.g. rapid D then A)', () => {
    const first = resolveMovementClick('d', 1000, null);
    // 50ms later, user taps 'a' (same axis X)
    const second = resolveMovementClick('a', 1050, first.keyPress);
    expect(second.isChord).toBe(false);
    expect(second.dir).toEqual({ dx: -1, dy: 0 }); // clean reversal, not diagonal
  });

  it('breaks diagonal cleanly on a subsequent single click', () => {
    // Form chord
    const k1 = resolveMovementClick('w', 1000, null);
    const k2 = resolveMovementClick('d', 1040, k1.keyPress);
    expect(k2.dir).toEqual({ dx: 1, dy: -1 });

    // 500ms later, user taps 's' (Down)
    const k3 = resolveMovementClick('s', 1540, k2.keyPress);
    expect(k3.isChord).toBe(false);
    expect(k3.dir).toEqual({ dx: 0, dy: 1 }); // pure Down
  });

  it('ball carrier continuously moves indefinitely without holding keys', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 8 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;
    rb.autoRun = { vx: 1, vy: 0 }; // latched direction

    const delta = 1 / 60;
    for (let frame = 0; frame < 30; frame++) {
      // Simulating movePlayer with no keys held (input.carrierDir = null or latched)
      rb.move(delta, rb.autoRun.vx, rb.autoRun.vy);
    }

    // Runner traveled forward > 1.0 yard on single click
    expect(rb.x).toBeGreaterThan(21.0);
    expect(rb.isMoving).toBe(true);
  });

  it('allows slowing down without stopping via rapid D-A-D tapping', () => {
    const rb = new RunningBack({ position: 'RB', ratings: { speed: 10, agility: 10 } });
    rb.x = 20;
    rb.y = 0.5;
    rb.hasBall = true;

    const delta = 1 / 60;
    // Accelerate right (D)
    for (let i = 0; i < 20; i++) {
      rb.move(delta, 1, 0);
    }
    const initialSpeedFactor = rb._movement.speedFactor;
    expect(initialSpeedFactor).toBeGreaterThan(0.5);

    // Tap A (left) for 3 frames to initiate deceleration
    for (let i = 0; i < 3; i++) {
      rb.move(delta, -1, 0);
    }

    // Speed dropped during cut deceleration
    expect(rb._movement.speedFactor).toBeLessThan(initialSpeedFactor);

    // Tap D (right) again
    for (let i = 0; i < 5; i++) {
      rb.move(delta, 1, 0);
    }

    // Runner is still moving and did not drop to dead stop (speedFactor > 0)
    expect(rb._movement.speedFactor).toBeGreaterThan(0);
    expect(rb.isMoving).toBe(true);
  });
});
