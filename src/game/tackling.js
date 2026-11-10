export const TACKLE_STAND_RADIUS = 0.60;
export const TACKLE_DIVE_MIN_DIST = 0.80;
export const TACKLE_DIVE_MAX_DIST = 2.20;
export const TACKLE_DIVE_SPEED_MULT = 1.40;
export const TACKLE_DIVE_DURATION = 0.45;
export const TACKLE_BASE_PROBABILITY = 0.60;
export const TACKLE_DIFF_SCALE = 0.08;
export const BRACE_SPEED_THRESHOLD = 0.80;
export const BRACE_SCORE_BOOST = 0.50;
export const DIVE_TACKLE_PENALTY = 0;
export const BROKEN_TACKLE_IMMUNITY = 0.40;
export const TACKLER_MISS_RECOVERY = 0.60;
export const TACKLER_DIVE_COOLDOWN = 1.00;

export function playEndsFromTackle(carrier, quarterback) {
  return Boolean(carrier?.isTackled || quarterback?.isTackled);
}

export function getCarrierSpeedFactor(carrier, lateralYards = 25) {
  if (!carrier) return 0;
  if (carrier._movement && Number.isFinite(carrier._movement.speedFactor)) {
    return Math.max(0, Math.min(1, carrier._movement.speedFactor));
  }
  const speed = carrier.speed || 0;
  if (speed <= 0.05) return 0;
  const currentSpeed = Math.hypot(carrier.velocityX || 0, (carrier.velocityY || 0) * lateralYards);
  return Math.max(0, Math.min(1, currentSpeed / speed));
}

export function getCarrierBreakScore(carrier, lateralYards = 25) {
  const strength = Number(carrier?.ratings?.strength ?? carrier?.rating?.strength ?? carrier?.strength ?? 5);
  const speedFactor = getCarrierSpeedFactor(carrier, lateralYards);
  const braceBoost = speedFactor < BRACE_SPEED_THRESHOLD ? BRACE_SCORE_BOOST : 0;
  return strength + braceBoost;
}

export function getTacklerScore(tackler, isDive = false) {
  const tackling = Number(tackler?.ratings?.tackling ?? tackler?.rating?.tackling ?? (Number.isFinite(tackler?.tackling) ? tackler.tackling : (Number.isFinite(tackler?.rating) ? tackler.rating : 5)));
  const strength = Number(tackler?.ratings?.strength ?? tackler?.rating?.strength ?? (Number.isFinite(tackler?.strength) ? tackler.strength : 5));
  const divePenalty = isDive ? DIVE_TACKLE_PENALTY : 0;
  return (tackling * 0.60 + strength * 0.40) - divePenalty;
}

export function calculateTackleProbability(tackler, carrier, isDive = false, lateralYards = 25) {
  const sTackler = getTacklerScore(tackler, isDive);
  const sCarrier = getCarrierBreakScore(carrier, lateralYards);
  const rawProb = TACKLE_BASE_PROBABILITY + (sTackler - sCarrier) * TACKLE_DIFF_SCALE;
  return Math.max(0.10, Math.min(0.95, rawProb));
}

export function canDefenderDive(defender, carrier, lateralYards = 25) {
  if (!defender || !carrier) return false;
  if (defender.isDiving || (defender.diveCooldownTimer > 0) || (defender.tackleMissRecoveryTimer > 0)) {
    return false;
  }
  if (carrier.isTackled) return false;
  if (typeof carrier.isImmuneTo === 'function' && carrier.isImmuneTo(defender)) {
    return false;
  }
  const dx = carrier.x - defender.x;
  const dy = (carrier.y - defender.y) * lateralYards;
  const dist = Math.hypot(dx, dy);
  return dist >= TACKLE_DIVE_MIN_DIST && dist <= TACKLE_DIVE_MAX_DIST;
}

export function shouldDefenderDive(defender, carrier, options = {}) {
  const { lateralYards = 25, firstDownX = null, goalLineX = 100, diveRoll = null } = options;
  if (!canDefenderDive(defender, carrier, lateralYards)) return false;

  const dx = carrier.x - defender.x;
  const dy = (carrier.y - defender.y) * lateralYards;
  const dist = Math.hypot(dx, dy);

  // If already close enough for wrap-up tackle (<= 0.70 yds), stay on feet!
  if (dist <= 0.70) return false;

  const carrierSpeed = Math.hypot(carrier.velocityX || 0, (carrier.velocityY || 0) * lateralYards);
  const defenderSpeed = defender.speed || 0;

  // 1. Desperation Stop: Runner is within <= 3 yds of goal line or first-down line
  if (carrier.x >= goalLineX - 3.0 && carrier.x <= goalLineX) {
    return true;
  }
  if (Number.isFinite(firstDownX) && carrier.x >= firstDownX - 3.0 && carrier.x <= firstDownX) {
    return true;
  }

  // 2. Trailing Check:
  // A defender in front of the carrier downfield should stay on their feet
  // to make a secure wrap-up tackle rather than lunging early and giving up big plays.
  const cvx = carrierSpeed > 0.05 ? (carrier.velocityX || 0) / carrierSpeed : 1;
  const cvy = carrierSpeed > 0.05 ? ((carrier.velocityY || 0) * lateralYards) / carrierSpeed : 0;
  const trailingDist = dx * cvx + dy * cvy;
  const isTrailing = trailingDist > 0.2; // Carrier is moving away from defender

  if (!isTrailing) {
    return false;
  }

  // 3. Keep Running / No Dive:
  // If defender is faster and closing the distance, stay on feet to secure wrap-up tackle
  if (defenderSpeed > carrierSpeed && dist <= 1.8) {
    return false;
  }

  // 4. Runner Pulling Away: Runner speed > defender speed
  // Only dive if within reachable closing range (<= 1.6 yds)
  if (carrierSpeed > defenderSpeed && dist <= 1.6) {
    return true;
  }

  // 5. Pursuit Window: Trailing range (1.0 - 1.8 yds) with alignment within +/- 45 deg
  if (dist >= 1.0 && dist <= 1.8) {
    const dirX = dx / dist;
    const dirY = dy / dist;
    const defVx = defender.velocityX || 0;
    const defVy = (defender.velocityY || 0) * lateralYards;
    const defSpeed = Math.hypot(defVx, defVy);
    const forwardX = defSpeed > 0.05 ? defVx / defSpeed : (defender.facingLeft ? -1 : 1);
    const forwardY = defSpeed > 0.05 ? defVy / defSpeed : 0;
    const dot = forwardX * dirX + forwardY * dirY;
    if (dot >= 0.7071) {
      const roll = (typeof diveRoll === 'number') ? diveRoll : Math.random();
      return roll < 0.06;
    }
  }

  return false;
}

export function attemptTackle(tackler, carrier, options = {}) {
  const {
    isDive = Boolean(tackler?.isDiving),
    roll = null,
    forceSuccess = false,
    lateralYards = 25
  } = options;

  if (!carrier) return { success: false, reason: 'no-carrier' };

  const dx = carrier.x - (tackler?.x ?? carrier.x);
  const dy = (carrier.y - (tackler?.y ?? carrier.y)) * lateralYards;
  const dist = Math.hypot(dx, dy);

  if (typeof carrier.isImmuneTo === 'function' && carrier.isImmuneTo(tackler)) {
    console.log(
      `[TACKLE IMMUNE] ${tackler?.name || tackler?.position || 'Defender'} (#${tackler?.id ?? '?'}) ` +
      `cannot tackle ${carrier?.name || carrier?.position || 'Carrier'} (#${carrier?.id ?? '?'}) ` +
      `due to active broken-tackle immunity (dist: ${dist.toFixed(2)} yds)`
    );
    return { success: false, reason: 'immune' };
  }

  const speedFactor = getCarrierSpeedFactor(carrier, lateralYards);
  const carrierStrength = Number(carrier?.ratings?.strength ?? carrier?.rating?.strength ?? carrier?.strength ?? 5);
  const braceBoost = speedFactor < BRACE_SPEED_THRESHOLD ? BRACE_SCORE_BOOST : 0;
  const sCarrier = carrierStrength + braceBoost;

  const tacklerTackling = Number(tackler?.ratings?.tackling ?? tackler?.rating?.tackling ?? (Number.isFinite(tackler?.tackling) ? tackler.tackling : (Number.isFinite(tackler?.rating) ? tackler.rating : 5)));
  const tacklerStrength = Number(tackler?.ratings?.strength ?? tackler?.rating?.strength ?? (Number.isFinite(tackler?.strength) ? tackler.strength : 5));
  const divePenalty = isDive ? DIVE_TACKLE_PENALTY : 0;
  const sTackler = (tacklerTackling * 0.60 + tacklerStrength * 0.40) - divePenalty;

  const rawProb = TACKLE_BASE_PROBABILITY + (sTackler - sCarrier) * TACKLE_DIFF_SCALE;
  const probability = Math.max(0.10, Math.min(0.95, rawProb));
  const randomValue = (typeof roll === 'number') ? roll : Math.random();
  const success = forceSuccess || (randomValue < probability);

  // Detailed console log of every attempted tackle and all factors
  console.log(
    `[TACKLE ATTEMPT] ${tackler?.name || tackler?.position || 'Defender'} (#${tackler?.id ?? '?'}) ` +
    `vs ${carrier?.name || carrier?.position || 'Carrier'} (#${carrier?.id ?? '?'})\n` +
    `  Type: ${isDive ? 'DIVE TACKLE' : 'STANDING WRAP-UP'} | Distance: ${dist.toFixed(2)} yds\n` +
    `  Carrier Score: ${sCarrier.toFixed(2)} [Strength: ${carrierStrength}, SpeedFactor: ${speedFactor.toFixed(2)}, BraceBoost: +${braceBoost.toFixed(2)}]\n` +
    `  Tackler Score: ${sTackler.toFixed(2)} [Tackling: ${tacklerTackling}, Strength: ${tacklerStrength}, DivePenalty: -${divePenalty.toFixed(2)}]\n` +
    `  Score Diff: ${(sTackler - sCarrier).toFixed(2)} -> Win Probability: ${(probability * 100).toFixed(1)}% | Roll: ${(randomValue * 100).toFixed(1)}%\n` +
    `  Outcome: ${success ? 'SUCCESS (CARRIER TACKLED)' : 'BROKEN TACKLE (CARRIER STUMBLES)'}`
  );

  if (success) {
    if (typeof carrier.tackled === 'function') {
      carrier.tackled();
    } else {
      carrier.isTackled = true;
      carrier.isMoving = false;
      carrier.phase = 'tackled';
    }
    if (tackler) {
      tackler.isDiving = false;
      tackler.isMoving = false;
      if (tackler.velocityX !== undefined) tackler.velocityX = 0;
      if (tackler.velocityY !== undefined) tackler.velocityY = 0;
    }
    return { success: true, probability, roll: randomValue };
  } else {
    // Broken tackle
    if (typeof carrier.breakTackle === 'function') {
      carrier.breakTackle(tackler);
    } else {
      carrier.stumble?.(0.3, 0.5);
      carrier.setTackleImmunity?.(tackler, BROKEN_TACKLE_IMMUNITY);
    }

    if (tackler) {
      tackler.wasDiving = Boolean(isDive || tackler.isDiving);
      tackler.isDiving = false;
      tackler.diveProgress = 0;
      tackler.tackleMissRecoveryTimer = TACKLER_MISS_RECOVERY;
      if (isDive) {
        tackler.diveCooldownTimer = TACKLER_DIVE_COOLDOWN;
      }
    }
    return { success: false, probability, roll: randomValue };
  }
}

const GameTackling = {
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
  playEndsFromTackle,
  getCarrierSpeedFactor,
  getCarrierBreakScore,
  getTacklerScore,
  calculateTackleProbability,
  canDefenderDive,
  shouldDefenderDive,
  attemptTackle
};

if (typeof window !== 'undefined') {
  window.GameTackling = GameTackling;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GameTackling = GameTackling;
}
