export const BLOCK_ENGAGE_RADIUS = 0.75;
export const BLOCK_RESOLUTION_SECONDS = 0.5;
export const BLOCK_DISENGAGE_DISTANCE = 3;
export const SECONDARY_BLOCKER_EFFICIENCY = 0.4;
export const SHED_IMMUNITY_SECONDS = 0.75;
export const BLOCK_WHIFF_RECOVERY_SECONDS = 0.5;
export const BLOCK_ANGLE_THRESHOLD_DEGREES = 30;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const position = player => String(player?.position || '').toUpperCase();
const rating = (player, key) => Number(player?.ratings?.[key] ?? player?.rating?.[key] ?? player?.[key] ?? 5);

const DEFENSIVE_POSITIONS = new Set(['DL', 'DT', 'DE', 'NT', 'EDGE', 'LB', 'MLB', 'OLB', 'CB', 'S', 'FS', 'SS', 'DB']);
const isDefensivePosition = pos => DEFENSIVE_POSITIONS.has(String(pos || '').toUpperCase());

export function getDefenderRunVector(defender, lateralYards = 25, options = {}) {
  // 1. Explicit desired target (where defender AI or user intends to run)
  const target = defender?.desiredTarget ?? defender?.target ?? defender?.defenseAI?.lastTarget ?? defender?.defenseAI?.target;
  if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    const dx = target.x - defender.x;
    const dy = (target.y - defender.y) * lateralYards;
    if (Math.hypot(dx, dy) > 0.001) {
      return { x: dx, y: dy };
    }
  }

  // 2. Active velocity if moving
  const vx = Number(defender?.velocityX) || 0;
  const vy = (Number(defender?.velocityY) || 0) * lateralYards;
  if (Math.hypot(vx, vy) > 0.05) {
    return { x: vx, y: vy };
  }

  // 3. Ball carrier pursuit vector if carrier is known
  const carrier = options?.carrier || options?.state?.carrier || options?.state?.runningBack;
  if (carrier && Number.isFinite(carrier.x) && Number.isFinite(carrier.y) && carrier !== defender) {
    const dx = carrier.x - defender.x;
    const dy = (carrier.y - defender.y) * lateralYards;
    if (Math.hypot(dx, dy) > 0.001) {
      return { x: dx, y: dy };
    }
  }

  // 4. Movement heading or default facing direction
  const defaultDirX = defender?.facingLeft ? -1 : (isDefensivePosition(defender?.position) ? -1 : 1);
  const dirX = defender?._movement?.direction?.x ?? defender?.lastDirX ?? defaultDirX;
  const dirY = (defender?._movement?.direction?.y ?? defender?.lastDirY ?? 0) * lateralYards;
  return { x: dirX, y: dirY };
}

export function calculateAngleToBlocker(defender, blocker, lateralYards = 25, options = {}) {
  const bx = blocker.x - defender.x;
  const by = (blocker.y - defender.y) * lateralYards;
  const bDist = Math.hypot(bx, by);
  if (bDist < 0.0001) return 0;

  const runVec = getDefenderRunVector(defender, lateralYards, options);
  const rDist = Math.hypot(runVec.x, runVec.y);
  if (rDist < 0.0001) return 0;

  const dot = Math.max(-1, Math.min(1, (bx * runVec.x + by * runVec.y) / (bDist * rDist)));
  return Math.acos(dot) * (180 / Math.PI);
}

export function isDefenderRunningTowards(defender, blocker, lateralYards = 25, options = {}) {
  const angle = calculateAngleToBlocker(defender, blocker, lateralYards, options);
  return angle <= BLOCK_ANGLE_THRESHOLD_DEGREES;
}

export function isDown(player) {
  return Boolean(player?.isDiving || player?.isGettingUp || player?.pancakeTimer > 0 || player?.isTackled);
}

export function nearestDefender(player, defenders, lateralYards, { includeEngaged = true, filter = null } = {}) {
  let defender = null;
  let distance = Infinity;
  for (const candidate of defenders || []) {
    if (isDown(candidate)) continue;
    if (candidate.shedImmunity > 0) continue;
    if (!includeEngaged && candidate.isBlocking) continue;
    if (filter && !filter(candidate)) continue;
    const candidateDistance = Math.hypot(candidate.x - player.x, (candidate.y - player.y) * lateralYards);
    if (candidateDistance < distance) {
      defender = candidate;
      distance = candidateDistance;
    }
  }
  return { defender, distance };
}

export function blockScore(player) {
  const str = rating(player, 'strength');
  const block = rating(player, 'blocking');
  const catchRating = rating(player, 'catching');
  switch (position(player)) {
    case 'OL': case 'OT': case 'OG': case 'C': return 0.4 * str + 0.6 * block;
    case 'TE': return (0.85 * str + 0.15 * catchRating) * 0.85;
    default: return 0.6 * str;
  }
}

export function shedScore(player) {
  const str = rating(player, 'strength');
  const tackle = rating(player, 'tackling');
  switch (position(player)) {
    case 'DL': case 'DT': case 'DE': case 'NT': return 0.7 * str + 0.3 * tackle;
    case 'LB': return (0.6 * str + 0.4 * tackle) * 0.85;
    default: return (0.4 * str + 0.6 * tackle) * 0.6;
  }
}

export function tackleCoefficient(blockDiff) {
  return clamp((Number(blockDiff) + 5) / 10, 0, 1);
}

function stop(player) {
  player.isMoving = false;
  player.velocityX = 0;
  player.velocityY = 0;
  if (player._movement) player._movement.speedFactor = 0;
}

function clearBlockState(player) {
  player.isBlocking = false;
  player.blockingTarget = null;
  player.blockedBy = null;
  delete player.blockDiff;
  delete player.tackleCoefficient;
}

export function createBlockingEngine({ state, lateralYards = 25, random = Math.random }) {
  const engagements = new Map();
  const MAX_BLOCKERS_PER_DEFENDER = 2;

  function release(engagement, defenderSpeedModifier = 1) {
    const { defender, blockers } = engagement;
    for (const blocker of blockers) clearBlockState(blocker);
    clearBlockState(defender);
    if (defenderSpeedModifier < 1) {
      defender.speedModifier = Math.min(defender.speedModifier ?? 1, defenderSpeedModifier);
      defender.blockSlowTimer = Math.max(defender.blockSlowTimer ?? 0, BLOCK_RESOLUTION_SECONDS);
    }
    engagements.delete(defender);
  }

  function pancake(player, seconds) {
    player.pancakeTimer = seconds;
    player.isPancaked = true;
    stop(player);
  }

  function engage(blocker, defender) {
    let engagement = engagements.get(defender);
    if (!engagement) {
      engagement = { defender, blockers: new Set(), elapsed: 0, holdElapsed: 0 };
      engagements.set(defender, engagement);
    }
    engagement.blockers.add(blocker);
    blocker.isBlocking = true;
    blocker.blockingTarget = defender;
    defender.isBlocking = true;
    defender.blockedBy = blocker;
    stop(blocker);
    stop(defender);
  }

  function resolve(engagement) {
    const blockers = [...engagement.blockers].filter(blocker => !isDown(blocker));
    if (!blockers.length || isDown(engagement.defender)) return release(engagement);
    engagement.blockers = new Set(blockers);
    const sortedScores = blockers.map(blocker => blockScore(blocker)).sort((a, b) => b - a);
    const offense = sortedScores.reduce((total, score, index) => {
      const weight = index === 0 ? 1 : SECONDARY_BLOCKER_EFFICIENCY;
      return total + score * weight;
    }, 0);
    const defense = shedScore(engagement.defender);
    const offenseDiff = offense - defense;
    const defenderDiff = defense - offense;
    blockers.forEach(blocker => { blocker.blockDiff = offenseDiff; });
    engagement.defender.blockDiff = defenderDiff;
    engagement.defender.tackleCoefficient = tackleCoefficient(defenderDiff);

    if (offenseDiff >= 5 && random() < 0.5) {
      pancake(engagement.defender, 1);
      return release(engagement);
    }
    if (defenderDiff >= 5 && random() < 0.5) {
      pancake(blockers[0], 1);
      engagement.defender.shedImmunity = Math.max(engagement.defender.shedImmunity ?? 0, SHED_IMMUNITY_SECONDS);
      return release(engagement, 0.8);
    }
    if (offenseDiff > 0) {
      engagement.holdElapsed += BLOCK_RESOLUTION_SECONDS;
      const holdTime = clamp((offenseDiff / 5) * 2, 0, 2);
      if (engagement.holdElapsed >= holdTime) {
        engagement.defender.shedImmunity = Math.max(engagement.defender.shedImmunity ?? 0, SHED_IMMUNITY_SECONDS);
        release(engagement);
      }
      return;
    }
    const speedDecrease = clamp(1 - (defenderDiff / 5) * 0.8, 0.2, 1);
    engagement.defender.shedImmunity = Math.max(engagement.defender.shedImmunity ?? 0, SHED_IMMUNITY_SECONDS);
    return release(engagement, 1 - speedDecrease);
  }

  function tryStartBlock(blocker, delta, options) {
    const { defender, distance } = nearestDefender(blocker, state.defenders, lateralYards, {
      filter: candidate => {
        const engagement = engagements.get(candidate);
        const hasRoom = !engagement || engagement.blockers.size < MAX_BLOCKERS_PER_DEFENDER;
        return hasRoom
          && isDefenderRunningTowards(candidate, blocker, lateralYards, { ...options, state })
          && (!options.targetFilter || options.targetFilter(candidate, blocker));
      }
    });
    if (!defender || defender.shedImmunity > 0) return false;
    if (!isDefenderRunningTowards(defender, blocker, lateralYards, { ...options, state })) return false;
    if (distance > BLOCK_ENGAGE_RADIUS) {
      // Movement must always use the caller's real frame delta so Player.run
      // continues to enforce speed, acceleration, deceleration, and cuts.
      blocker.run?.(delta, defender.x, defender.y);
      return false;
    }
    const whiffChance = clamp(0.35 - rating(blocker, 'blocking') * 0.025, 0.05, 0.35);
    if (random() < whiffChance) {
      blocker.blockRecoveryTimer = BLOCK_WHIFF_RECOVERY_SECONDS;
      blocker.stumble?.(1.0, 0.4);
      return false;
    }
    engage(blocker, defender);
    return true;
  }

  function update(blockers, delta, carrier, options = {}) {
    for (const defender of state.defenders || []) {
      if (defender.pancakeTimer > 0) {
        defender.pancakeTimer = Math.max(0, defender.pancakeTimer - delta);
        if (defender.pancakeTimer === 0) defender.isPancaked = false;
      }
      if (defender.blockSlowTimer > 0) {
        defender.blockSlowTimer = Math.max(0, defender.blockSlowTimer - delta);
        if (defender.blockSlowTimer === 0) defender.speedModifier = 1;
      }
      if (defender.shedImmunity > 0) {
        defender.shedImmunity = Math.max(0, defender.shedImmunity - delta);
      }
    }
    for (const blocker of blockers || []) {
      if (blocker?.blockRecoveryTimer > 0) {
        blocker.blockRecoveryTimer = Math.max(0, blocker.blockRecoveryTimer - delta);
      }
      if (!blocker || blocker.hasBall || isDown(blocker) || blocker.isBlocking || blocker.blockRecoveryTimer > 0 || blocker.stumbleTimer > 0) continue;
      tryStartBlock(blocker, delta, { ...options, carrier });
    }
    for (const engagement of [...engagements.values()]) {
      if ((carrier && carrier.x - engagement.defender.x >= BLOCK_DISENGAGE_DISTANCE) || isDown(engagement.defender)) {
        release(engagement);
        continue;
      }
      const isRunningTowards = [...engagement.blockers].some(blocker =>
        isDefenderRunningTowards(engagement.defender, blocker, lateralYards, { ...options, carrier, state })
      );
      if (!isRunningTowards) {
        release(engagement);
        continue;
      }
      for (const blocker of engagement.blockers) stop(blocker);
      stop(engagement.defender);
      engagement.elapsed += delta;
      while (engagement.elapsed >= BLOCK_RESOLUTION_SECONDS && engagements.has(engagement.defender)) {
        engagement.elapsed -= BLOCK_RESOLUTION_SECONDS;
        resolve(engagement);
      }
    }
  }

  function reset() {
    for (const engagement of [...engagements.values()]) release(engagement);
    for (const defender of state.defenders || []) {
      defender.shedImmunity = 0;
    }
  }

  return { update, reset, engagements };
}
