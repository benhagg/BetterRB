import { describe, it, expect } from 'vitest';
import PlayerClasses from '../player-classes.js';
import PlayerSkills from '../player-skills.js';

const {
  Player,
  OffensivePlayer,
  DefensivePlayer,
  Quarterback,
  WideReceiver,
  TightEnd,
  RunningBack,
  OffensiveLineman,
  DefensiveLineman,
  Linebacker,
  DefensiveBack
} = PlayerClasses;

describe('Player Skills & Position Multipliers', () => {
  it('correctly maps speed multipliers by position', () => {
    expect(PlayerSkills.speedMultiplier('WR')).toBe(1.0);
    expect(PlayerSkills.speedMultiplier('RB')).toBe(1.0);
    expect(PlayerSkills.speedMultiplier('DB')).toBe(1.0);
    expect(PlayerSkills.speedMultiplier('QB')).toBe(0.85);
    expect(PlayerSkills.speedMultiplier('TE')).toBe(0.85);
    expect(PlayerSkills.speedMultiplier('LB')).toBe(0.85);
    expect(PlayerSkills.speedMultiplier('OL')).toBe(0.70);
    expect(PlayerSkills.speedMultiplier('DL')).toBe(0.70);
  });
});

describe('Player Classes & Physics', () => {
  it('instantiates player with correct speed calculation', () => {
    // speed = (BASE_SPEED + speedRating * SPEED_RATING_COEFF) * speedMultiplier
    const wr = new WideReceiver({ position: 'WR', ratings: { speed: 10, agility: 8 } });
    expect(wr.ratings.speed).toBe(10);
    expect(wr.speed).toBeGreaterThan(5.0);
    expect(wr.speedMultiplier).toBe(1.0);

    const ol = new OffensiveLineman({ position: 'OL', ratings: { speed: 10 } });
    expect(ol.speedMultiplier).toBe(0.70);
    expect(ol.speed).toBeLessThan(wr.speed);
  });

  it('drops speed and velocity to zero when calling block()', () => {
    const blocker = new OffensivePlayer({ position: 'WR' });
    blocker.isMoving = true;
    blocker.velocityX = 4.5;
    blocker.velocityY = 1.2;
    blocker._movement = { speedFactor: 0.8 };

    const target = new DefensivePlayer({ position: 'CB' });
    blocker.block(target);

    expect(blocker.isMoving).toBe(false);
    expect(blocker.velocityX).toBe(0);
    expect(blocker.velocityY).toBe(0);
    expect(blocker._movement.speedFactor).toBe(0);
    expect(blocker.blockingTarget).toBe(target);
  });

  it('marks player tackled and stops movement on tackled()', () => {
    const rb = new RunningBack({ position: 'RB' });
    rb.isMoving = true;
    rb.tackled();

    expect(rb.isTackled).toBe(true);
    expect(rb.isMoving).toBe(false);
    expect(rb.phase).toBe('tackled');
  });

  it('runs toward target defender when out of block range and only stops when block() is engaged', () => {
    const wr = new WideReceiver({ position: 'WR', ratings: { speed: 10, agility: 10 } });
    wr.x = 20;
    wr.y = 0.5;
    const defender = new DefensivePlayer({ position: 'CB' });
    defender.x = 30;
    defender.y = 0.5;

    const delta = 1 / 60;
    // Over 30 frames (~0.5s) of running towards defender without block():
    for (let i = 0; i < 30; i++) {
      wr.run(delta, defender.x, defender.y);
    }
    const distRun = wr.x - 20;
    expect(distRun).toBeGreaterThan(1.5);

    // If block() were called every frame unconditionally (the inching bug):
    const buggyWr = new WideReceiver({ position: 'WR', ratings: { speed: 10, agility: 10 } });
    buggyWr.x = 20;
    buggyWr.y = 0.5;
    for (let i = 0; i < 30; i++) {
      buggyWr.run(delta, defender.x, defender.y);
      buggyWr.block(defender);
    }
    const distBuggy = buggyWr.x - 20;
    // Buggy receiver barely moved due to speed resetting every frame (< 0.2 yards in 0.5s)
    expect(distBuggy).toBeLessThan(0.2);
    expect(distRun).toBeGreaterThan(distBuggy * 10);
  });
});

