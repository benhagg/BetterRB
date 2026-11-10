import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/game/catching.js';

const Catching = globalThis.GameCatching;

function player(overrides = {}) {
  return {
    id: 'player-1',
    name: 'Test Player',
    position: 'WR',
    receiverNumber: 1,
    x: 10,
    y: 0.5,
    speed: 0,
    velocityX: 0,
    velocityY: 0,
    lastDirX: 1,
    lastDirY: 0,
    ratings: { catching: 5, agility: 5 },
    ...overrides
  };
}

function pass(overrides = {}) {
  return {
    fromX: 0,
    fromY: 0.5,
    targetX: 10,
    targetY: 0.5,
    targetReceiverNumber: 1,
    wasTargetMoving: false,
    duration: 1,
    // Lands at 4 ft after one second: 6 + v - 0.5g = 4.
    profile: { launchVelocity: 14.087 },
    ...overrides
  };
}

function catcher(receivers = [], defenders = []) {
  return Catching.create({
    state: { receivers, runningBack: null, defenders },
    lateralYards: 17
  });
}

afterEach(() => vi.restoreAllMocks());

describe('catch volume', () => {
  it('classifies low, standard, and jump catches by ball height', () => {
    const engine = catcher();
    const receiver = player({ x: 0, velocityX: 1 });

    expect(engine.probability(receiver, { x: 0, y: 0.5, z: 1 })?.catchType).toBe('dive');
    expect(engine.probability(receiver, { x: 0, y: 0.5, z: 4 })?.catchType).toBe('standard');
    expect(engine.probability(receiver, { x: 0, y: 0.5, z: 9 })?.catchType).toBe('jump');
    expect(engine.probability(receiver, { x: 0, y: 0.5, z: 10.01 })).toBeNull();
  });

  it('uses the shorter rear catch reach', () => {
    const engine = catcher();
    const receiver = player({ x: 0, velocityX: 1 });

    expect(engine.probability(receiver, { x: -0.5, y: 0.5, z: 4 })).not.toBeNull();
    expect(engine.probability(receiver, { x: -0.7, y: 0.5, z: 4 })).toBeNull();
  });

  it('reduces an offensive catch chance when a defender is nearby', () => {
    const receiver = player({ x: 10, y: 0.5, ratings: { catching: 10, agility: 5 } });
    const defender = player({ id: 'db', position: 'DB', x: 10, y: 0.5 });
    const uncontested = catcher([receiver]).probability(receiver, { x: 10, y: 0.5, z: 4 });
    const contested = catcher([receiver], [defender]).probability(receiver, { x: 10, y: 0.5, z: 4 });

    expect(contested.contestPenalty).toBeCloseTo(0.50);
    expect(contested.chance).toBeCloseTo(uncontested.chance * 0.50);
  });

  it('does not penalize a receiver when the nearest defender is outside the contest radius', () => {
    const receiver = player({ x: 10, y: 0.5 });
    const defender = player({ id: 'db', position: 'DB', x: 12.1, y: 0.5 });
    const result = catcher([receiver], [defender]).probability(receiver, { x: 10, y: 0.5, z: 4 });

    expect(result.contestPenalty).toBe(0);
  });
});

describe('catch scheduling', () => {
  it('creates one peak-probability attempt per eligible player', () => {
    const receiver = player();
    const engine = catcher([receiver]);
    const thrown = pass();

    const plan = engine.schedule(thrown);

    expect(plan.attempts).toHaveLength(1);
    expect(plan.attempts[0].player).toBe(receiver);
    expect(plan.attempts[0].time).toBeGreaterThan(0.8);
    expect(plan.attempts[0].chance).toBeGreaterThan(0.7);
  });

  it('rolls a failed player only once for a pass', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const receiver = player({ ratings: { catching: 0, agility: 5 } });
    const engine = catcher([receiver]);
    const thrown = pass();
    const plan = engine.schedule(thrown);

    expect(engine.resolve(thrown, 1)).toBeNull();
    expect(plan.nextIndex).toBe(plan.attempts.length);
    expect(engine.resolve(thrown, 1)).toBeNull();
  });

  it('allows a directly overlapping defender to win a contested catch', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const receiver = player({ id: 'wr', ratings: { catching: 5, agility: 5 } });
    const defender = player({ id: 'db', name: 'DB', position: 'DB', receiverNumber: null, ratings: { catching: 5, agility: 5 } });
    const engine = catcher([receiver], [defender]);
    const thrown = pass();

    engine.schedule(thrown);
    const result = engine.resolve(thrown, 1);

    expect(result.player).toBe(defender);
    expect(result.interception).toBe(true);
  });
});
