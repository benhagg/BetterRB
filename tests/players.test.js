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
});
