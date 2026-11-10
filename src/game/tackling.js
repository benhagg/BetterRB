export const TACKLE_STAND_RADIUS = 0.60;
export const TACKLE_DIVE_MIN_DIST = 0.80;
export const TACKLE_DIVE_MAX_DIST = 2.20;
export const TACKLE_DIVE_SPEED_MULT = 1.40;
export const TACKLE_DIVE_DURATION = 0.45;
export const TACKLE_BASE_PROBABILITY = 0.60;
export const TACKLE_DIFF_SCALE = 0.08;
export const DIVE_TACKLE_PENALTY = 0;
export const BROKEN_TACKLE_IMMUNITY = 0.40;
export const TACKLER_MISS_RECOVERY = 0.60;
export const TACKLER_DIVE_COOLDOWN = 1.00;
export const DIVE_MIN_SPEED_RATIO = 0.50;

export const POSITION_STRENGTH_MULTIPLIERS = {
  QB: 0.3,
  RB: 0.9,
  FB: 0.9,
  HB: 0.9,
  TE: 1.0,
  WR: 0.5
};

export function getPositionStrengthMultiplier(position) {
  const code = String(position || '').trim().toUpperCase();
  if (code in POSITION_STRENGTH_MULTIPLIERS) {
    return POSITION_STRENGTH_MULTIPLIERS[code];
  }
  return 1.0;
}

export function playEndsFromTackle(carrier, quarterback) {
  return Boolean(carrier?.isTackled || quarterback?.isTackled);
}

export function getCarrierBreakScore(carrier) {
  const strength = Number(carrier?.ratings?.strength ?? carrier?.rating?.strength ?? carrier?.strength ?? 5);
  const multiplier = getPositionStrengthMultiplier(carrier?.position);
  return strength * multiplier;
}

export function calculateDiveTacklePenalty(cosAngle = 0, isDive = false) {
  if (!isDive || typeof cosAngle !== 'number' || cosAngle >= 0) return 0;
  // Dive tackle penalty of 2 * cos(AoA) only if cosAngle < 0 (penalty for defender)
  // Subtracted from tacklerScore as 2 * |cosAngle| = -2 * cosAngle
  return -2 * cosAngle;
}

export function getTacklerScore(tackler, isDive = false, cosAngle = 0) {
  const tackling = Number(tackler?.ratings?.tackling ?? tackler?.rating?.tackling ?? (Number.isFinite(tackler?.tackling) ? tackler.tackling : (Number.isFinite(tackler?.rating) ? tackler.rating : 5)));
  const strength = Number(tackler?.ratings?.strength ?? tackler?.rating?.strength ?? (Number.isFinite(tackler?.strength) ? tackler.strength : 5));
  const divePenalty = calculateDiveTacklePenalty(cosAngle, isDive);
  return (strength * 0.50 + tackling * 0.75) - divePenalty;
}

export function calculateAngleOfAttack(tackler, carrier, lateralYards = 25) {
  if (!tackler || !carrier) {
    return { cosAngle: 0, angleRad: Math.PI / 2, angleDeg: 90 };
  }

  const dx = tackler.x - carrier.x;
  const dy = (tackler.y - carrier.y) * lateralYards;
  const dist = Math.hypot(dx, dy);
  const rx = dist > 0.0001 ? dx / dist : 1;
  const ry = dist > 0.0001 ? dy / dist : 0;

  const cvx = Number(carrier.velocityX) || 0;
  const cvy = (Number(carrier.velocityY) || 0) * lateralYards;
  const cSpeed = Math.hypot(cvx, cvy);

  let ux, uy;
  if (cSpeed > 0.05) {
    ux = cvx / cSpeed;
    uy = cvy / cSpeed;
  } else {
    const dirX = carrier.autoRun?.vx ?? carrier.lastDirX ?? (carrier.facingLeft ? -1 : 1);
    const dirY = (carrier.autoRun?.vy ?? carrier.lastDirY ?? 0) * lateralYards;
    const len = Math.hypot(dirX, dirY);
    ux = len > 0.0001 ? dirX / len : (carrier.facingLeft ? -1 : 1);
    uy = len > 0.0001 ? dirY / len : 0;
  }

  const dot = Math.max(-1, Math.min(1, rx * ux + ry * uy));
  const angleRad = Math.acos(dot);
  const angleDeg = angleRad * (180 / Math.PI);
  return { cosAngle: dot, angleRad, angleDeg };
}

export function calculateTackleDiff(tackler, carrier, options = {}) {
  const { isDive = false, lateralYards = 25 } = options;
  const carrierStrength = Number(carrier?.ratings?.strength ?? carrier?.rating?.strength ?? carrier?.strength ?? 5);
  const multiplier = getPositionStrengthMultiplier(carrier?.position);
  const carrierScore = carrierStrength * multiplier;

  const { cosAngle, angleDeg } = calculateAngleOfAttack(tackler, carrier, lateralYards);
  const divePenalty = calculateDiveTacklePenalty(cosAngle, isDive);
  const tacklerScore = getTacklerScore(tackler, isDive, cosAngle);

  // diff = strength * multiplier - (def strength * 0.5 + def tackle * .75 - divePenalty) - (cos(angle of attack))
  const diff = carrierScore - tacklerScore - cosAngle;
  return { diff, carrierScore, tacklerScore, cosAngle, angleDeg, carrierStrength, multiplier, divePenalty };
}

export function calculateTackleProbability(tackler, carrier, isDive = false, lateralYards = 25) {
  const { diff } = calculateTackleDiff(tackler, carrier, { isDive, lateralYards });
  // Negative diff means tackler advantage, positive diff means carrier advantage
  const rawProb = TACKLE_BASE_PROBABILITY - diff * TACKLE_DIFF_SCALE;
  return Math.max(0.10, Math.min(0.95, rawProb));
}

export function getDefenderSpeedRatio(defender, lateralYards = 25) {
  if (!defender) return 0;
  const movementRatio = Number(defender._movement?.speedFactor ?? defender.speedFactor ?? 0);
  const maxSpeed = Number(defender.maxSpeed ?? defender.speed ?? 0);
  const currentSpeed = Math.hypot(Number(defender.velocityX) || 0, (Number(defender.velocityY) || 0) * lateralYards);
  const velocityRatio = maxSpeed > 0.05 ? currentSpeed / maxSpeed : (currentSpeed > 0.05 ? 1.0 : 0);
  return Math.max(0, Math.min(1, Math.max(movementRatio, velocityRatio)));
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

  // Dive tackle is not allowed unless the defender is moving at above 50% max speed
  const speedRatio = getDefenderSpeedRatio(defender, lateralYards);
  if (speedRatio <= DIVE_MIN_SPEED_RATIO) {
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
  if (tackler?.pancakeTimer > 0 || tackler?.isPancaked) {
    return { success: false, reason: 'pancaked' };
  }

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

  const {
    diff,
    carrierScore,
    tacklerScore,
    cosAngle,
    angleDeg,
    carrierStrength,
    multiplier,
    divePenalty
  } = calculateTackleDiff(tackler, carrier, { isDive, lateralYards });

  const rawProb = TACKLE_BASE_PROBABILITY - diff * TACKLE_DIFF_SCALE;
  const baseProbability = Math.max(0.10, Math.min(0.95, rawProb));
  const blockCoefficient = tackler?.isBlocking
    ? Math.max(0, Math.min(1, Number(tackler.tackleCoefficient ?? 1)))
    : 1;
  const probability = baseProbability * blockCoefficient;
  const randomValue = (typeof roll === 'number') ? roll : Math.random();
  const success = forceSuccess || (randomValue < probability);

  const tacklerStrength = Number(tackler?.ratings?.strength ?? tackler?.rating?.strength ?? (Number.isFinite(tackler?.strength) ? tackler.strength : 5));
  const tacklerTackling = Number(tackler?.ratings?.tackling ?? tackler?.rating?.tackling ?? (Number.isFinite(tackler?.tackling) ? tackler.tackling : (Number.isFinite(tackler?.rating) ? tackler.rating : 5)));
  const carrierPos = carrier?.position || 'RB';

  // Detailed console log of every attempted tackle and all factors
  console.log(
    `[TACKLE ATTEMPT] ${tackler?.name || tackler?.position || 'Defender'} (#${tackler?.id ?? '?'}) ` +
    `vs ${carrier?.name || carrier?.position || 'Carrier'} (#${carrier?.id ?? '?'})\n` +
    `  Type: ${isDive ? 'DIVE TACKLE' : 'STANDING WRAP-UP'} | Distance: ${dist.toFixed(2)} yds\n` +
    `  Carrier: Pos=${carrierPos}, Strength=${carrierStrength}, Mult=${multiplier.toFixed(2)} -> CarrierScore=${carrierScore.toFixed(2)}\n` +
    `  Defender: Strength=${tacklerStrength} (*0.5=${(tacklerStrength * 0.5).toFixed(2)}), Tackling=${tacklerTackling} (*0.75=${(tacklerTackling * 0.75).toFixed(2)})${isDive ? `, DivePenalty=-${divePenalty.toFixed(2)}` : ''} -> DefScore=${tacklerScore.toFixed(2)}\n` +
    `  Angle of Attack: ${angleDeg.toFixed(1)}° (cos=${cosAngle.toFixed(3)}) [${cosAngle > 0.5 ? 'FRONT HIT' : cosAngle < -0.5 ? 'REAR HIT' : 'FLANK/ANGLE HIT'}]\n` +
    `  Formula: diff = ${carrierScore.toFixed(2)} - ${tacklerScore.toFixed(2)} - (${cosAngle.toFixed(3)}) = ${diff.toFixed(2)}\n` +
    `  Tackle Probability: ${(probability * 100).toFixed(1)}% (block coeff ${blockCoefficient.toFixed(2)}) | Roll: ${(randomValue * 100).toFixed(1)}%\n` +
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
      carrier.stumble?.(1.0, 0.5);
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
  playEndsFromTackle,
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
