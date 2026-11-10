import { describe, expect, it } from 'vitest';
import {
  BLOCK_ANGLE_THRESHOLD_DEGREES,
  BLOCK_ENGAGE_RADIUS,
  BLOCK_WHIFF_RECOVERY_SECONDS,
  SECONDARY_BLOCKER_EFFICIENCY,
  SHED_IMMUNITY_SECONDS,
  blockScore,
  calculateAngleToBlocker,
  createBlockingEngine,
  isDefenderRunningTowards,
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
    expect(isDown({ isGettingUp: true })).toBe(true);
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

  it('sets defender pancake timer to 1 second on offensive pancake', () => {
    const dominantBlocker = player('OL', { strength: 10, blocking: 10 }, { x: 25 });
    const weakDefender = player('DB', { strength: 0, tackling: 0 }, { x: 25.5 });
    const engine = createBlockingEngine({
      state: { defenders: [weakDefender] },
      lateralYards: 25,
      random: () => 0.1
    });
    engine.update([dominantBlocker], 0.1, null);
    expect(weakDefender.isBlocking).toBe(true);

    engine.update([dominantBlocker], 0.5, null);
    expect(weakDefender.isBlocking).toBe(false);
    expect(weakDefender.isPancaked).toBe(true);
    expect(weakDefender.pancakeTimer).toBe(1);
  });

  it('applies diminishing returns to secondary blockers in a double-team', () => {
    expect(SECONDARY_BLOCKER_EFFICIENCY).toBe(0.4);

    const blocker1 = player('OL', { strength: 8, blocking: 8 }, { x: 25 });
    const blocker2 = player('OL', { strength: 5, blocking: 5 }, { x: 25.1 });
    const defender = player('DL', { strength: 5, tackling: 5 }, { x: 25.5 });

    const engine = createBlockingEngine({
      state: { defenders: [defender] },
      lateralYards: 25,
      random: () => 0.99
    });

    // Engage both blockers
    engine.update([blocker1, blocker2], 0.1, null);
    expect(defender.isBlocking).toBe(true);
    expect(blocker1.isBlocking).toBe(true);
    expect(blocker2.isBlocking).toBe(true);

    // blocker1 score: 0.4*8 + 0.6*8 = 8
    // blocker2 score: 0.4*5 + 0.6*5 = 5
    // Diminishing returns: 8*1.0 + 5*0.4 = 10.0 (without diminishing returns it would be 13.0)
    // defender shed score: 0.7*5 + 0.3*5 = 5.0
    // offenseDiff = 10.0 - 5.0 = 5.0 (holdTime = 2.0s, so block holds through 0.5s resolution)
    engine.update([blocker1, blocker2], 0.5, null);
    expect(blocker1.blockDiff).toBeCloseTo(5.0);
    expect(blocker2.blockDiff).toBeCloseTo(5.0);
    expect(defender.blockDiff).toBeCloseTo(-5.0);
  });

  it('grants defender shed immunity so they cannot be immediately re-blocked', () => {
    expect(SHED_IMMUNITY_SECONDS).toBe(0.75);

    const blocker = player('OL', { strength: 4, blocking: 4 }, { x: 25 });
    const defender = player('DL', { strength: 8, tackling: 8 }, { x: 25.5 });
    const engine = createBlockingEngine({
      state: { defenders: [defender] },
      lateralYards: 25,
      random: () => 0.99
    });

    // 1. Initial engagement
    engine.update([blocker], 0.1, null);
    expect(defender.isBlocking).toBe(true);

    // 2. Resolve shed (defender advantage: shedScore 8 vs blockScore 4)
    engine.update([blocker], 0.5, null);
    expect(defender.isBlocking).toBe(false);
    expect(defender.shedImmunity).toBeCloseTo(0.75);

    // 3. Immediately next frame: blocker is within range, but defender is shed-immune
    engine.update([blocker], 0.1, null);
    expect(defender.isBlocking).toBe(false);
    expect(blocker.isBlocking).toBe(false);
    expect(defender.shedImmunity).toBeCloseTo(0.65);

    // 4. Tick down partially: still immune
    engine.update([blocker], 0.3, null);
    expect(defender.isBlocking).toBe(false);
    expect(blocker.isBlocking).toBe(false);
    expect(defender.shedImmunity).toBeCloseTo(0.35);

    // 5. Tick down remaining immunity: delta (0.4s) expires immunity (0.35s) and blocker re-engages
    engine.update([blocker], 0.4, null);
    expect(defender.shedImmunity).toBe(0);
    expect(defender.isBlocking).toBe(true);
    expect(blocker.isBlocking).toBe(true);
  });

  it('does not slow defender on whiffs and applies recovery delay to blocker', () => {
    expect(BLOCK_WHIFF_RECOVERY_SECONDS).toBe(0.5);

    let stumbled = false;
    const blocker = player('OL', { strength: 5, blocking: 0 }, {
      x: 25,
      stumble: () => { stumbled = true; }
    });
    const defender = player('DL', { strength: 5, tackling: 5 }, { x: 25.5, speedModifier: 1 });

    let roll = 0.01;
    const engine = createBlockingEngine({
      state: { defenders: [defender] },
      lateralYards: 25,
      random: () => roll
    });

    // Blocker attempts block and whiffs
    engine.update([blocker], 0.1, null);

    // Defender should NOT be slowed down or engaged
    expect(Boolean(defender.isBlocking)).toBe(false);
    expect(defender.speedModifier).toBe(1);
    expect(defender.blockSlowTimer).toBeUndefined();

    // Blocker stumbles and receives recovery delay
    expect(Boolean(blocker.isBlocking)).toBe(false);
    expect(stumbled).toBe(true);
    expect(blocker.blockRecoveryTimer).toBeCloseTo(0.5);

    // In subsequent frames, blockRecoveryTimer ticks down and prevents block engagement
    engine.update([blocker], 0.2, null);
    expect(Boolean(blocker.isBlocking)).toBe(false);
    expect(Boolean(defender.isBlocking)).toBe(false);
    expect(blocker.blockRecoveryTimer).toBeCloseTo(0.3);

    // Advance remaining recovery time (0.3s) with next attempt successful
    roll = 0.99;
    engine.update([blocker], 0.3, null);
    expect(blocker.blockRecoveryTimer).toBe(0);
    expect(blocker.isBlocking).toBe(true);
    expect(defender.isBlocking).toBe(true);
  });

  it('calculates angle to blocker and enforces 30 degree threshold', () => {
    expect(BLOCK_ANGLE_THRESHOLD_DEGREES).toBe(30);

    const blocker = player('OL', { strength: 5, blocking: 5 }, { x: 25, y: 0.5 });

    // Running directly toward blocker (West: dx = -1, dy = 0)
    const directDefender = player('DL', { strength: 5 }, { x: 26, y: 0.5, velocityX: -3, velocityY: 0 });
    expect(calculateAngleToBlocker(directDefender, blocker, 25)).toBeCloseTo(0);
    expect(isDefenderRunningTowards(directDefender, blocker, 25)).toBe(true);

    // Running away from blocker (East: dx = 1, dy = 0)
    const awayDefender = player('DL', { strength: 5 }, { x: 26, y: 0.5, velocityX: 3, velocityY: 0 });
    expect(calculateAngleToBlocker(awayDefender, blocker, 25)).toBeCloseTo(180);
    expect(isDefenderRunningTowards(awayDefender, blocker, 25)).toBe(false);

    // Running at ~20 degrees toward blocker
    const cos20 = Math.cos(20 * Math.PI / 180);
    const sin20 = Math.sin(20 * Math.PI / 180);
    const angle20Defender = player('DL', { strength: 5 }, {
      x: 26,
      y: 0.5,
      velocityX: -cos20,
      velocityY: sin20 / 25
    });
    expect(calculateAngleToBlocker(angle20Defender, blocker, 25)).toBeCloseTo(20);
    expect(isDefenderRunningTowards(angle20Defender, blocker, 25)).toBe(true);

    // Running at 45 degrees away from blocker
    const cos45 = Math.cos(45 * Math.PI / 180);
    const sin45 = Math.sin(45 * Math.PI / 180);
    const angle45Defender = player('DL', { strength: 5 }, {
      x: 26,
      y: 0.5,
      velocityX: -cos45,
      velocityY: sin45 / 25
    });
    expect(calculateAngleToBlocker(angle45Defender, blocker, 25)).toBeCloseTo(45);
    expect(isDefenderRunningTowards(angle45Defender, blocker, 25)).toBe(false);
  });

  it('does not throw a block if defender is running away (> 30 degrees)', () => {
    const blocker = player('OL', { strength: 8, blocking: 8 }, { x: 25, y: 0.5 });
    // Defender is within engage radius (0.5 yds away), but running East (away, angle = 180 deg)
    const defender = player('DL', { strength: 4, tackling: 4 }, { x: 25.5, y: 0.5, velocityX: 3, velocityY: 0 });

    const engine = createBlockingEngine({
      state: { defenders: [defender] },
      lateralYards: 25,
      random: () => 0.99
    });

    engine.update([blocker], 0.1, null);
    expect(Boolean(defender.isBlocking)).toBe(false);
    expect(Boolean(blocker.isBlocking)).toBe(false);
  });

  it('ends an active block as soon as defender tries to run in a direction > 30 degrees', () => {
    const blocker = player('OL', { strength: 8, blocking: 8 }, { x: 25, y: 0.5 });
    // Defender initially facing/running toward blocker (West)
    const defender = player('DL', { strength: 4, tackling: 4 }, {
      x: 25.5,
      y: 0.5,
      desiredTarget: { x: 24, y: 0.5 }
    });

    const engine = createBlockingEngine({
      state: { defenders: [defender] },
      lateralYards: 25,
      random: () => 0.99
    });

    // 1. Defender running toward blocker engages
    engine.update([blocker], 0.1, null);
    expect(defender.isBlocking).toBe(true);
    expect(blocker.isBlocking).toBe(true);

    // 2. Defender now tries to run toward downfield runner at (35, 0.5) (East, angle = 180 deg)
    defender.desiredTarget = { x: 35, y: 0.5 };
    engine.update([blocker], 0.1, null);

    // Block should immediately end
    expect(defender.isBlocking).toBe(false);
    expect(blocker.isBlocking).toBe(false);
    expect(engine.engagements.has(defender)).toBe(false);
  });
});
