import { describe, expect, it } from 'vitest';
import {
  TACKLE_STAND_RADIUS,
  TACKLE_DIVE_MIN_DIST,
  TACKLE_DIVE_MAX_DIST,
  TACKLE_DIVE_SPEED_MULT,
  TACKLE_DIVE_DURATION,
  TACKLE_BASE_PROBABILITY,
  TACKLE_DIFF_SCALE,
  POSITION_STRENGTH_MULTIPLIERS,
  getPositionStrengthMultiplier,
  calculateAngleOfAttack,
  calculateDiveTacklePenalty,
  calculateTackleDiff,
  DIVE_TACKLE_PENALTY,
  DIVE_MIN_SPEED_RATIO,
  getDefenderSpeedRatio,
  BROKEN_TACKLE_IMMUNITY,
  TACKLER_MISS_RECOVERY,
  TACKLER_DIVE_COOLDOWN,
  getCarrierBreakScore,
  getTacklerScore,
  calculateTackleProbability,
  canDefenderDive,
  shouldDefenderDive,
  attemptTackle,
  playEndsFromTackle
} from '../../src/game/tackling.js';
import PlayerClasses from '../../src/game/players/index.js';

const { DefensivePlayer, RunningBack, WideReceiver, Quarterback, TightEnd } = PlayerClasses;

describe('tackling rules and resolution', () => {
  describe('position multipliers and effective scores', () => {
    it('applies correct position strength multipliers', () => {
      expect(getPositionStrengthMultiplier('QB')).toBe(0.3);
      expect(getPositionStrengthMultiplier('RB')).toBe(0.9);
      expect(getPositionStrengthMultiplier('FB')).toBe(0.9);
      expect(getPositionStrengthMultiplier('HB')).toBe(0.9);
      expect(getPositionStrengthMultiplier('TE')).toBe(1.0);
      expect(getPositionStrengthMultiplier('WR')).toBe(0.5);
      expect(getPositionStrengthMultiplier('UNKNOWN')).toBe(1.0);
    });

    it('calculates carrier break score using strength * multiplier without brace boost or speed factor', () => {
      const qb = new Quarterback({ ratings: { strength: 10 } });
      expect(getCarrierBreakScore(qb)).toBeCloseTo(3.0); // 10 * 0.3

      const rb = new RunningBack({ ratings: { strength: 10 } });
      expect(getCarrierBreakScore(rb)).toBeCloseTo(9.0); // 10 * 0.9

      const te = new TightEnd({ ratings: { strength: 10 } });
      expect(getCarrierBreakScore(te)).toBeCloseTo(10.0); // 10 * 1.0

      const wr = new WideReceiver({ ratings: { strength: 10 } });
      expect(getCarrierBreakScore(wr)).toBeCloseTo(5.0); // 10 * 0.5
    });

    it('calculates tackler score: def strength * 0.5 + def tackle * 0.75 minus dive penalty if cos < 0', () => {
      const defender = new DefensivePlayer({ ratings: { strength: 6, tackling: 8 } });
      // Standing wrap-up: 6 * 0.50 + 8 * 0.75 = 3.0 + 6.0 = 9.0
      expect(getTacklerScore(defender, false)).toBeCloseTo(9.0);

      // Dive from front (cos = 1 >= 0): no penalty -> 9.0
      expect(getTacklerScore(defender, true, 1.0)).toBeCloseTo(9.0);

      // Dive from flank (cos = 0 >= 0): no penalty -> 9.0
      expect(getTacklerScore(defender, true, 0.0)).toBeCloseTo(9.0);

      // Dive from behind (cos = -1.0 < 0): penalty of -2 * (-1.0) = 2.0 -> 7.0
      expect(getTacklerScore(defender, true, -1.0)).toBeCloseTo(7.0);

      // Dive from trailing angle (cos = -0.5 < 0): penalty of -2 * (-0.5) = 1.0 -> 8.0
      expect(getTacklerScore(defender, true, -0.5)).toBeCloseTo(8.0);
    });

    it('calculates dive tackle penalty: 2 * cos(angle) only if cos < 0', () => {
      // Standing tackle never has penalty
      expect(calculateDiveTacklePenalty(-1.0, false)).toBe(0);

      // Dive from front or flank (cos >= 0) has no penalty
      expect(calculateDiveTacklePenalty(1.0, true)).toBe(0);
      expect(calculateDiveTacklePenalty(0.0, true)).toBe(0);

      // Dive from behind (cos < 0) has penalty for defender
      expect(calculateDiveTacklePenalty(-1.0, true)).toBeCloseTo(2.0);
      expect(calculateDiveTacklePenalty(-0.5, true)).toBeCloseTo(1.0);
    });
  });

  describe('angle of attack and tackle diff formula', () => {
    it('calculates angle of attack correctly for front, rear, and flank hits', () => {
      const carrier = new RunningBack({ x: 20, y: 0.5 });
      carrier.velocityX = 5.0; // Moving right (+X)
      carrier.velocityY = 0;

      // Front hit: defender directly ahead downfield (+X)
      const frontDefender = new DefensivePlayer({ x: 21, y: 0.5 });
      const frontAoA = calculateAngleOfAttack(frontDefender, carrier);
      expect(frontAoA.cosAngle).toBeCloseTo(1.0);
      expect(frontAoA.angleDeg).toBeCloseTo(0);

      // Rear hit: defender directly behind (-X)
      const rearDefender = new DefensivePlayer({ x: 19, y: 0.5 });
      const rearAoA = calculateAngleOfAttack(rearDefender, carrier);
      expect(rearAoA.cosAngle).toBeCloseTo(-1.0);
      expect(rearAoA.angleDeg).toBeCloseTo(180);

      // Flank hit: defender perpendicular on lateral axis
      const flankDefender = new DefensivePlayer({ x: 20, y: 0.6 });
      const flankAoA = calculateAngleOfAttack(flankDefender, carrier);
      expect(flankAoA.cosAngle).toBeCloseTo(0.0);
      expect(flankAoA.angleDeg).toBeCloseTo(90);
    });

    it('implements diff = strength * mult - (def strength * 0.5 + def tackle * 0.75) - cos(angle)', () => {
      const carrier = new RunningBack({ ratings: { strength: 10 } }); // carrierScore = 9.0
      carrier.x = 20;
      carrier.y = 0.5;
      carrier.velocityX = 4;
      carrier.velocityY = 0;

      const defender = new DefensivePlayer({ ratings: { strength: 6, tackling: 8 } }); // defScore = 9.0

      // Case 1: Front hit (cos = 1) -> diff = 9.0 - 9.0 - (1) = -1.0 (helps defense)
      defender.x = 21;
      defender.y = 0.5;
      const frontRes = calculateTackleDiff(defender, carrier);
      expect(frontRes.diff).toBeCloseTo(-1.0);

      // Case 2: Rear hit (cos = -1) -> diff = 9.0 - 9.0 - (-1) = +1.0 (helps carrier)
      defender.x = 19;
      defender.y = 0.5;
      const rearRes = calculateTackleDiff(defender, carrier);
      expect(rearRes.diff).toBeCloseTo(1.0);
      expect(rearRes.divePenalty).toBe(0);

      // Case 2b: Rear dive tackle (cos = -1 < 0) -> penalty of 2.0 reduces defScore to 7.0
      // diff = 9.0 - 7.0 - (-1) = +3.0
      const rearDiveRes = calculateTackleDiff(defender, carrier, { isDive: true });
      expect(rearDiveRes.divePenalty).toBeCloseTo(2.0);
      expect(rearDiveRes.tacklerScore).toBeCloseTo(7.0);
      expect(rearDiveRes.diff).toBeCloseTo(3.0);

      // Case 1b: Front dive tackle (cos = 1 >= 0) -> no dive penalty
      defender.x = 21;
      defender.y = 0.5;
      const frontDiveRes = calculateTackleDiff(defender, carrier, { isDive: true });
      expect(frontDiveRes.divePenalty).toBe(0);
      expect(frontDiveRes.tacklerScore).toBeCloseTo(9.0);
      expect(frontDiveRes.diff).toBeCloseTo(-1.0);

      // Case 3: Flank hit (cos = 0) -> diff = 9.0 - 9.0 - 0 = 0.0 (neutral)
      defender.x = 20;
      defender.y = 0.6;
      const flankRes = calculateTackleDiff(defender, carrier);
      expect(flankRes.diff).toBeCloseTo(0.0);
    });

    it('calculates tackle probability and clamps to [0.10, 0.95]', () => {
      // Even matchup with flank hit (diff = 0) -> probability = 0.60
      const carrier = new RunningBack({ ratings: { strength: 10 } }); // 10 * 0.9 = 9.0
      carrier.x = 20;
      carrier.y = 0.5;
      carrier.velocityX = 4;
      carrier.velocityY = 0;

      const defender = new DefensivePlayer({ ratings: { strength: 6, tackling: 8 } }); // 6*0.5 + 8*0.75 = 9.0
      defender.x = 20;
      defender.y = 0.6; // flank hit -> cos = 0, diff = 0
      expect(calculateTackleProbability(defender, carrier)).toBeCloseTo(0.60);

      // Front hit increases tackle probability: diff = -1 -> prob = 0.60 - (-1)*0.08 = 0.68
      defender.x = 21;
      defender.y = 0.5;
      expect(calculateTackleProbability(defender, carrier)).toBeCloseTo(0.68);

      // Rear hit decreases tackle probability: diff = +1 -> prob = 0.60 - (1)*0.08 = 0.52
      defender.x = 19;
      defender.y = 0.5;
      expect(calculateTackleProbability(defender, carrier, false)).toBeCloseTo(0.52);

      // Rear dive tackle applies 2 * cos penalty (diff = +3) -> prob = 0.60 - (3)*0.08 = 0.36
      expect(calculateTackleProbability(defender, carrier, true)).toBeCloseTo(0.36);

      // Extreme defender advantage clamps to 0.95
      const eliteDefender = new DefensivePlayer({ ratings: { strength: 20, tackling: 20 } });
      eliteDefender.x = 21;
      eliteDefender.y = 0.5;
      const weakQb = new Quarterback({ ratings: { strength: 1 } });
      weakQb.x = 20;
      weakQb.y = 0.5;
      expect(calculateTackleProbability(eliteDefender, weakQb)).toBe(0.95);

      // Extreme carrier advantage clamps to 0.10
      const weakDefender = new DefensivePlayer({ ratings: { strength: 1, tackling: 1 } });
      weakDefender.x = 19;
      weakDefender.y = 0.5;
      const tankTe = new TightEnd({ ratings: { strength: 25 } });
      tankTe.x = 20;
      tankTe.y = 0.5;
      expect(calculateTackleProbability(weakDefender, tankTe)).toBe(0.10);
    });
  });

  describe('dive decision logic', () => {
    it('allows dive only when defender is moving at above 50% max speed', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
      defender.speed = 6.0;
      const carrier = new RunningBack({ x: 11.5, y: 0.5 }); // 1.5 yds (in range)

      // Stationary (0% speed)
      defender.velocityX = 0;
      defender.velocityY = 0;
      expect(canDefenderDive(defender, carrier)).toBe(false);

      // At exactly 50% max speed (3.0 / 6.0)
      defender.velocityX = 3.0;
      expect(canDefenderDive(defender, carrier)).toBe(false);

      // Under 50% max speed (2.4 / 6.0 = 40%)
      defender.velocityX = 2.4;
      expect(canDefenderDive(defender, carrier)).toBe(false);

      // Above 50% max speed (3.6 / 6.0 = 60%)
      defender.velocityX = 3.6;
      expect(canDefenderDive(defender, carrier)).toBe(true);

      // Via _movement speedFactor
      defender.velocityX = 0;
      defender._movement = { speedFactor: 0.50 };
      expect(canDefenderDive(defender, carrier)).toBe(false);

      defender._movement = { speedFactor: 0.51 };
      expect(canDefenderDive(defender, carrier)).toBe(true);
    });

    it('allows dive only within distance range [0.80, 2.20]', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
      defender._movement = { speedFactor: 0.80 };
      const carrier = new RunningBack({ x: 10.5, y: 0.5 }); // 0.5 yds (too close)
      expect(canDefenderDive(defender, carrier)).toBe(false);

      carrier.x = 11.5; // 1.5 yds (in range)
      expect(canDefenderDive(defender, carrier)).toBe(true);

      carrier.x = 13.0; // 3.0 yds (too far)
      expect(canDefenderDive(defender, carrier)).toBe(false);
    });

    it('prevents dive when dive cooldown or miss recovery is active', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
      defender._movement = { speedFactor: 0.80 };
      const carrier = new RunningBack({ x: 11.5, y: 0.5 });
      expect(canDefenderDive(defender, carrier)).toBe(true);

      defender.diveCooldownTimer = 0.5;
      expect(canDefenderDive(defender, carrier)).toBe(false);

      defender.diveCooldownTimer = 0;
      defender.tackleMissRecoveryTimer = 0.4;
      expect(canDefenderDive(defender, carrier)).toBe(false);
    });

    it('triggers dive when runner is pulling away', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
      defender.speed = 5.0;
      defender.velocityX = 4.0; // 80% speed > 50%
      const carrier = new RunningBack({ x: 11.5, y: 0.5 });
      // Carrier moving faster than defender
      carrier.velocityX = 6.0;
      carrier.velocityY = 0;

      expect(shouldDefenderDive(defender, carrier)).toBe(true);
    });

    it('triggers desperation dive when carrier is within 3 yards of goal line or first down', () => {
      const defender = new DefensivePlayer({ x: 96, y: 0.5 });
      defender.speed = 6.0;
      defender.velocityX = 4.5; // 75% speed > 50%
      const carrier = new RunningBack({ x: 97.5, y: 0.5 }); // <= 3 yds from goal line at 100
      carrier.velocityX = 2.0;

      expect(shouldDefenderDive(defender, carrier, { goalLineX: 100 })).toBe(true);

      // Near first down line at 50
      carrier.x = 48.0;
      defender.x = 46.8;
      expect(shouldDefenderDive(defender, carrier, { firstDownX: 50 })).toBe(true);
    });

    it('keeps defender on feet when faster and closing distance outside desperation zone', () => {
      const defender = new DefensivePlayer({ x: 20, y: 0.5 });
      defender.speed = 6.0;
      defender.velocityX = 5.0; // 83% speed > 50%
      const carrier = new RunningBack({ x: 21.5, y: 0.5 });
      carrier.velocityX = 3.0; // Runner slower than defender
      carrier.velocityY = 0;

      expect(shouldDefenderDive(defender, carrier, { goalLineX: 100, firstDownX: 40 })).toBe(false);
    });

    it('does not trigger dive when defender is in front of the carrier downfield', () => {
      // Safety downfield at x=40, carrier at x=38.5 running right (velocityX = 6.0)
      const defender = new DefensivePlayer({ x: 40.0, y: 0.5 });
      defender.velocityX = -5.0; // Moving toward runner
      const carrier = new RunningBack({ x: 38.5, y: 0.5 });
      carrier.velocityX = 6.0;

      // Defender is in front; must stay on feet rather than lunging early
      expect(shouldDefenderDive(defender, carrier, { goalLineX: 100, firstDownX: 60 })).toBe(false);
    });

    it('triggers trailing pursuit dive only when roll is within dive window chance', () => {
      // Defender trailing behind carrier
      const defender = new DefensivePlayer({ x: 20.0, y: 0.5 });
      defender.speed = 5.0;
      defender.velocityX = 5.0;
      const carrier = new RunningBack({ x: 21.4, y: 0.5 }); // dist = 1.4 yds
      carrier.velocityX = 5.0; // Equal speed

      // Roll above threshold: stay on feet
      expect(shouldDefenderDive(defender, carrier, { diveRoll: 0.50, goalLineX: 100, firstDownX: 60 })).toBe(false);

      // Roll below threshold: trigger dive
      expect(shouldDefenderDive(defender, carrier, { diveRoll: 0.02, goalLineX: 100, firstDownX: 60 })).toBe(true);
    });
  });

  describe('tackle attempt resolution and outcomes', () => {
    it('resolves successful tackle, stops carrier, and marks play complete', () => {
      const defender = new DefensivePlayer({ x: 20, y: 0.5 });
      const carrier = new RunningBack({ x: 20.4, y: 0.5 });
      carrier.isMoving = true;

      const result = attemptTackle(defender, carrier, { roll: 0.05 }); // guaranteed success
      expect(result.success).toBe(true);
      expect(carrier.isTackled).toBe(true);
      expect(carrier.isMoving).toBe(false);
      expect(carrier.phase).toBe('tackled');
      expect(playEndsFromTackle(carrier, null)).toBe(true);
    });

    it('resolves broken tackle with carrier stumble, immunity, and defender miss recovery', () => {
      const defender = new DefensivePlayer({ x: 20, y: 0.5 });
      const carrier = new RunningBack({ x: 20.4, y: 0.5 });
      carrier.isMoving = true;

      const result = attemptTackle(defender, carrier, { roll: 0.99, isDive: true }); // guaranteed break
      expect(result.success).toBe(false);
      expect(carrier.isTackled).toBe(false);
      expect(carrier.stumbleTimer).toBeCloseTo(0.3);
      expect(carrier.isImmuneTo(defender)).toBe(true);
      expect(defender.tackleMissRecoveryTimer).toBeCloseTo(TACKLER_MISS_RECOVERY);
      expect(defender.diveCooldownTimer).toBeCloseTo(TACKLER_DIVE_COOLDOWN);
      expect(defender.isDiving).toBe(false);
    });

    it('prevents immediate re-tackle while carrier immunity is active', () => {
      const defender = new DefensivePlayer({ x: 20, y: 0.5 });
      const carrier = new RunningBack({ x: 20.4, y: 0.5 });
      carrier.setTackleImmunity(defender, 0.40);

      expect(defender.canTackle(carrier)).toBe(false);
      const attempt = attemptTackle(defender, carrier, { forceSuccess: true });
      expect(attempt.success).toBe(false);
      expect(attempt.reason).toBe('immune');

      // After ticking down immunity:
      carrier.updateTackleImmunities(0.45);
      expect(carrier.isImmuneTo(defender)).toBe(false);
      expect(defender.canTackle(carrier)).toBe(true);
    });
  });
});

