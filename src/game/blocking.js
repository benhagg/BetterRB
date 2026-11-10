export const BLOCK_ENGAGE_RADIUS = 0.75;
export const BLOCK_RESOLUTION_SECONDS = 0.5;
export const BLOCK_DISENGAGE_DISTANCE = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const position = player => String(player?.position || '').toUpperCase();
const rating = (player, key) => Number(player?.ratings?.[key] ?? player?.rating?.[key] ?? player?.[key] ?? 5);

export function isDown(player) {
  return Boolean(player?.isDiving || player?.pancakeTimer > 0 || player?.isTackled);
}

export function nearestDefender(player, defenders, lateralYards, { includeEngaged = true, filter = null } = {}) {
  let defender = null;
  let distance = Infinity;
  for (const candidate of defenders || []) {
    if (isDown(candidate)) continue;
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
    const offense = blockers.reduce((total, blocker) => total + blockScore(blocker), 0);
    const defense = shedScore(engagement.defender);
    const offenseDiff = offense - defense;
    const defenderDiff = defense - offense;
    blockers.forEach(blocker => { blocker.blockDiff = offenseDiff; });
    engagement.defender.blockDiff = defenderDiff;
    engagement.defender.tackleCoefficient = tackleCoefficient(defenderDiff);

    if (offenseDiff >= 5 && random() < 0.5) {
      pancake(engagement.defender, 2);
      return release(engagement);
    }
    if (defenderDiff >= 5 && random() < 0.5) {
      pancake(blockers[0], 1);
      return release(engagement, 0.8);
    }
    if (offenseDiff > 0) {
      engagement.holdElapsed += BLOCK_RESOLUTION_SECONDS;
      const holdTime = clamp((offenseDiff / 5) * 2, 0, 2);
      if (engagement.holdElapsed >= holdTime) release(engagement);
      return;
    }
    const speedDecrease = clamp(1 - (defenderDiff / 5) * 0.8, 0.2, 1);
    return release(engagement, 1 - speedDecrease);
  }

  function tryStartBlock(blocker, delta, options) {
    const { defender, distance } = nearestDefender(blocker, state.defenders, lateralYards, {
      filter: candidate => {
        const engagement = engagements.get(candidate);
        const hasRoom = !engagement || engagement.blockers.size < MAX_BLOCKERS_PER_DEFENDER;
        return hasRoom && (!options.targetFilter || options.targetFilter(candidate, blocker));
      }
    });
    if (!defender) return false;
    if (distance > BLOCK_ENGAGE_RADIUS) {
      // Movement must always use the caller's real frame delta so Player.run
      // continues to enforce speed, acceleration, deceleration, and cuts.
      blocker.run?.(delta, defender.x, defender.y);
      return false;
    }
    const whiffChance = clamp(0.35 - rating(blocker, 'blocking') * 0.025, 0.05, 0.35);
    if (random() < whiffChance) {
      defender.speedModifier = Math.min(defender.speedModifier ?? 1, 0.5);
      defender.blockSlowTimer = Math.max(defender.blockSlowTimer ?? 0, BLOCK_RESOLUTION_SECONDS);
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
    }
    for (const blocker of blockers || []) {
      if (!blocker || blocker.hasBall || isDown(blocker) || blocker.isBlocking) continue;
      tryStartBlock(blocker, delta, options);
    }
    for (const engagement of [...engagements.values()]) {
      if ((carrier && carrier.x - engagement.defender.x >= BLOCK_DISENGAGE_DISTANCE) || isDown(engagement.defender)) {
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
  }

  return { update, reset, engagements };
}
