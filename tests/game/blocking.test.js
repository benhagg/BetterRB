import { describe, expect, it } from 'vitest';
import {
  BLOCK_ENGAGE_RADIUS,
  blockScore,
  createBlockingEngine,
  isDown,
  shedScore,
  tackleCoefficient
} from '../../src/game/blocking.js';

const player = (position, ratings, extra = {}) => ({
  position,
  ratings,
  x: 25,
  y: 0.5,
  speedModifier: 1,
  run() {},
  ...extra
});

describe('blocking rules', () => {
  it('uses the documented position score formulas', () => {
    expect(blockScore(player('OL', { strength: 8, blocking: 6 }))).toBeCloseTo(6.8);
    expect(blockScore(player('TE', { strength: 8, catching: 6 }))).toBeCloseTo(6.545);
    expect(shedScore(player('DL', { strength: 8, tackling: 6 }))).toBeCloseTo(7.4);
    expect(shedScore(player('DB', { strength: 8, tackling: 6 }))).toBeCloseTo(4.08);
  });

  it('normalizes an engaged defender tackle coefficient from -5 to +5', () => {
    expect(tackleCoefficient(-5)).toBe(0);
    expect(tackleCoefficient(0)).toBe(0.5);
    expect(tackleCoefficient(5)).toBe(1);
  });

  it('does not select diving or pancaked defenders as block targets', () => {
    expect(isDown({ isDiving: true })).toBe(true);
    expect(isDown({ pancakeTimer: 1 })).toBe(true);
  });

  it('engages players inside the documented radius and stops both players', () => {
    const blocker = player('OL', { strength: 8, blocking: 8 });
    const defender = player('DL', { strength: 4, tackling: 4 }, { x: 25.5 });
    const state = { defenders: [defender] };
    const engine = createBlockingEngine({ state, lateralYards: 25, random: () => 0.99 });
    engine.update([blocker], 0.1, null);
    expect(Math.abs(defender.x - blocker.x)).toBeLessThan(BLOCK_ENGAGE_RADIUS);
    expect(blocker.isBlocking).toBe(true);
    expect(defender.isBlocking).toBe(true);
    expect(blocker.velocityX).toBe(0);
    expect(defender.velocityX).toBe(0);
  });

  it('moves toward a block target using the real frame delta', () => {
    let receivedDelta = null;
    const blocker = player('OL', { strength: 8, blocking: 8 }, {
      run: delta => { receivedDelta = delta; }
    });
    const defender = player('DL', { strength: 4, tackling: 4 }, { x: 27 });
    const engine = createBlockingEngine({ state: { defenders: [defender] }, lateralYards: 25, random: () => 0.99 });
    engine.update([blocker], 1 / 60, null);
    expect(receivedDelta).toBeCloseTo(1 / 60);
  });

  it('limits a defender to two simultaneous blockers', () => {
    const defender = player('DL', { strength: 4, tackling: 4 }, { x: 25.5 });
    const blockers = [
      player('OL', { strength: 8, blocking: 8 }),
      player('OL', { strength: 8, blocking: 8 }),
      player('OL', { strength: 8, blocking: 8 })
    ];
    const engine = createBlockingEngine({ state: { defenders: [defender] }, lateralYards: 25, random: () => 0.99 });
    engine.update(blockers, 0.1, null);
    expect(engine.engagements.get(defender).blockers.size).toBe(2);
    expect(blockers.filter(blocker => blocker.isBlocking)).toHaveLength(2);
  });

  it('applies correct shed speed modifier based on defensive advantage', () => {
    const weakBlocker = player('WR', { strength: 0 }, { x: 25 });
    const strongDefender = player('DL', { strength: 10, tackling: 10 }, { x: 25.5 });
    const engineStrong = createBlockingEngine({
      state: { defenders: [strongDefender] },
      lateralYards: 25,
      random: () => 0.99
    });
    engineStrong.update([weakBlocker], 0.1, null);
    expect(strongDefender.isBlocking).toBe(true);

    engineStrong.update([weakBlocker], 0.5, null);
    expect(strongDefender.isBlocking).toBe(false);
    expect(strongDefender.speedModifier).toBeCloseTo(0.8);

    const evenBlocker = player('OL', { strength: 5, blocking: 5 }, { x: 25 });
    const evenDefender = player('DL', { strength: 5, tackling: 5 }, { x: 25.5 });
    const engineEven = createBlockingEngine({
      state: { defenders: [evenDefender] },
      lateralYards: 25,
      random: () => 0.99
    });
    engineEven.update([evenBlocker], 0.1, null);
    expect(evenDefender.isBlocking).toBe(true);

    engineEven.update([evenBlocker], 0.5, null);
    expect(evenDefender.isBlocking).toBe(false);
    expect(evenDefender.speedModifier).toBeCloseTo(0);
  });
});
