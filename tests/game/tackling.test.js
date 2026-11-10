import { describe, expect, it } from 'vitest';
import {
  TACKLE_STAND_RADIUS,
  TACKLE_DIVE_MIN_DIST,
  TACKLE_DIVE_MAX_DIST,
  TACKLE_DIVE_SPEED_MULT,
  TACKLE_DIVE_DURATION,
  TACKLE_BASE_PROBABILITY,
  TACKLE_DIFF_SCALE,
  BRACE_SPEED_THRESHOLD,
  BRACE_SCORE_BOOST,
  DIVE_TACKLE_PENALTY,
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

const { DefensivePlayer, RunningBack, WideReceiver } = PlayerClasses;

describe('tackling rules and resolution', () => {
  describe('effective scores and probability', () => {
    it('calculates carrier break score with and without brace boost', () => {
      const carrier = new RunningBack({ ratings: { strength: 6 } });
      carrier._movement = { speedFactor: 0.90 };
      // Above 80% speed: no brace boost
      expect(getCarrierBreakScore(carrier)).toBe(6);

      // Under 80% speed: +BRACE_SCORE_BOOST brace boost
      carrier._movement = { speedFactor: 0.50 };
      expect(getCarrierBreakScore(carrier)).toBe(6 + BRACE_SCORE_BOOST);
    });

    it('calculates tackler score for standing vs dive tackle', () => {
      const defender = new DefensivePlayer({ ratings: { tackling: 8, strength: 5 } });
      // Standing: 8 * 0.60 + 5 * 0.40 = 4.8 + 2.0 = 6.8
      expect(getTacklerScore(defender, false)).toBeCloseTo(6.8);

      // Dive: 6.8 - DIVE_TACKLE_PENALTY
      expect(getTacklerScore(defender, true)).toBeCloseTo(6.8 - DIVE_TACKLE_PENALTY);
    });

    it('calculates tackle probability and clamps to [0.10, 0.95]', () => {
      // Even matchup: 5 tackling, 5 strength vs 5 strength (unbraced)
      const defender = new DefensivePlayer({ ratings: { tackling: 5, strength: 5 } });
      const carrier = new RunningBack({ ratings: { strength: 5 } });
      carrier._movement = { speedFactor: 1.0 };

      // Base rate: 60%
      expect(calculateTackleProbability(defender, carrier, false)).toBeCloseTo(0.60);

      // Defender advantage: 10 tackling, 10 strength vs 2 strength
      const eliteDefender = new DefensivePlayer({ ratings: { tackling: 10, strength: 10 } });
      const weakCarrier = new RunningBack({ ratings: { strength: 2 } });
      weakCarrier._movement = { speedFactor: 1.0 };
      // 0.60 + (10 - 2) * 0.08 = 0.60 + 0.64 = 1.24 -> clamped to 0.95
      expect(calculateTackleProbability(eliteDefender, weakCarrier, false)).toBe(0.95);

      // Carrier advantage: 1 tackling, 1 strength vs 10 strength + 2.5 brace = 12.5
      const weakDefender = new DefensivePlayer({ ratings: { tackling: 1, strength: 1 } });
      const tankCarrier = new RunningBack({ ratings: { strength: 10 } });
      tankCarrier._movement = { speedFactor: 0.5 }; // braced (+2.5) -> 12.5
      // 0.60 + (1 - 12.5) * 0.08 = 0.60 - 0.92 = -0.32 -> clamped to 0.10
      expect(calculateTackleProbability(weakDefender, tankCarrier, false)).toBe(0.10);
    });
  });

  describe('dive decision logic', () => {
    it('allows dive only within distance range [0.80, 2.20]', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
      const carrier = new RunningBack({ x: 10.5, y: 0.5 }); // 0.5 yds (too close)
      expect(canDefenderDive(defender, carrier)).toBe(false);

      carrier.x = 11.5; // 1.5 yds (in range)
      expect(canDefenderDive(defender, carrier)).toBe(true);

      carrier.x = 13.0; // 3.0 yds (too far)
      expect(canDefenderDive(defender, carrier)).toBe(false);
    });

    it('prevents dive when dive cooldown or miss recovery is active', () => {
      const defender = new DefensivePlayer({ x: 10, y: 0.5 });
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
      const carrier = new RunningBack({ x: 11.5, y: 0.5 });
      // Carrier moving faster than defender
      carrier.velocityX = 6.0;
      carrier.velocityY = 0;

      expect(shouldDefenderDive(defender, carrier)).toBe(true);
    });

    it('triggers desperation dive when carrier is within 3 yards of goal line or first down', () => {
      const defender = new DefensivePlayer({ x: 96, y: 0.5 });
      defender.speed = 6.0;
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
      const carrier = new RunningBack({ x: 21.5, y: 0.5 });
      carrier.velocityX = 3.0; // Runner slower than defender
      carrier.velocityY = 0;

      expect(shouldDefenderDive(defender, carrier, { goalLineX: 100, firstDownX: 40 })).toBe(false);
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

