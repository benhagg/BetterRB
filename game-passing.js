(function (root) {
  const releaseHeightFeet = 6;
  const targetHeightFeet = 4;
  const gravityFeetPerSecondSquared = 32.174;
  const C_BASE = 0.15;
  // inaccuracy coefficients (less is more accurate)
  const ALPHA = 0.00417;
  const BETA = 0.00192;
  const feetPerYard = 3.0;

  function calculateThrowArc(distanceYards, strength = 5) {
    const d = Math.max(0, Number(distanceYards) || 0);
    const numStrength = Number(strength);
    const s = Math.max(0, Math.min(10, Number.isFinite(numStrength) ? numStrength : 5));
    return Math.max(0.05, (0.14 + 0.007 * d) * (1 - 0.02 * s));
  }

  function calculateSigma(distanceYards) {
    const d = Math.max(0, Number(distanceYards) || 0);
    return C_BASE + (ALPHA * d) + (BETA * d * d);
  }

  function randomGaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function clampedGaussian(maxStdDev = 3) {
    const sample = randomGaussian();
    return Math.max(-maxStdDev, Math.min(maxStdDev, sample));
  }

  function calculateInaccuracy(distanceYards, lateralYards) {
    const sigma = calculateSigma(distanceYards);
    const inaccuracyX = clampedGaussian() * sigma;
    const inaccuracyY = (clampedGaussian() * sigma) / lateralYards;
    const inaccuracyHeightFeet = clampedGaussian() * (sigma * feetPerYard);
    //do not delete this log
    console.log("hypot in accuracy", Math.hypot(inaccuracyX, inaccuracyY))
    return { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma };
  }

  function throwProfile(distanceYards, targetHeight = targetHeightFeet, strength = 5) {
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    const arc = calculateThrowArc(distanceYards, strength);
    const apexHeight = Math.max(releaseHeightFeet, resolvedTargetHeight) + arc * distanceYards;
    const launchVelocity = Math.sqrt(2 * gravityFeetPerSecondSquared * (apexHeight - releaseHeightFeet));
    const riseTime = launchVelocity / gravityFeetPerSecondSquared;
    const fallTime = Math.sqrt(2 * (apexHeight - resolvedTargetHeight) / gravityFeetPerSecondSquared);
    return { launchVelocity, duration: riseTime + fallTime, apexHeight, arc };
  }

  function throwHeightAt(progress, distanceYards, targetHeight = targetHeightFeet, strength = 5) {
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    const profile = throwProfile(distanceYards, resolvedTargetHeight, strength);
    const elapsed = Math.max(0, Math.min(1, progress)) * profile.duration;
    return releaseHeightFeet + profile.launchVelocity * elapsed
      - 0.5 * gravityFeetPerSecondSquared * elapsed * elapsed;
  }

  function create({ state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage }) {
    function getQbStrength() {
      return state.quarterback?.strength ?? state.quarterback?.rating ?? 5;
    }

    function predictReceiverPosition(player, seconds) {
      const velocityX = Number(player.velocityX) || 0;
      const velocityYards = (Number(player.velocityY) || 0) * lateralYards;
      const currentSpeed = Math.hypot(velocityX, velocityYards);
      if (!player.isMoving || currentSpeed < 0.05 || !Number.isFinite(player.speed) || player.speed <= 0) {
        return { x: player.x, y: player.y };
      }
      const movement = player._movement;
      const directionX = movement?.direction?.x ?? (velocityX / currentSpeed);
      const directionY = movement?.direction?.y ?? (velocityYards / currentSpeed);
      let speedFactor = Math.max(0, Math.min(1, movement?.speedFactor ?? (currentSpeed / player.speed)));
      const agility = Math.max(0, Math.min(10, Number(player.agility ?? player.acceleration ?? player.rating) || 0));
      const accelerationRate = 1.3 / Math.max(0.5, 1 - agility * 0.05);
      // Mirror Player.movementStep's per-frame update, including its end-of-frame speed.
      let travelYards = 0;
      let remaining = seconds;
      while (remaining > 0.000001) {
        const step = Math.min(1 / 60, remaining);
        speedFactor = 1 - (1 - speedFactor) * Math.exp(-accelerationRate * step);
        travelYards += player.speed * speedFactor * step;
        remaining -= step;
      }
      return { x: player.x + directionX * travelYards, y: player.y + (directionY * travelYards) / lateralYards };
    }

    function releaseToLocation(targetX, targetY) {
      const fromX = state.quarterback.x;
      const fromY = state.quarterback.y;
      state.quarterback.facingLeft = targetX < fromX;
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;

      const intendedDistance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma } = calculateInaccuracy(intendedDistance, lateralYards);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);

      const distance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const duration = throwProfile(distance, actualTargetHeightFeet, getQbStrength()).duration;
      state.pass = {
        fromX,
        fromY,
        targetX: actualTargetX,
        targetY: actualTargetY,
        targetHeightFeet: actualTargetHeightFeet,
        duration,
        progress: 0,
        distanceYards: distance,
        heightFeet: releaseHeightFeet,
        heightfeet: releaseHeightFeet,
        targetReceiverNumber: null,
        wasTargetMoving: false,
        intendedTargetX: targetX,
        intendedTargetY: targetY,
        sigma
      };
      state.quarterback.hasBall = false;
      state.quarterback.phase = 'thrown';
      state.phase = 'thrown';
    }

    function release(receiverNum) {
      const targetReceiver = passTarget(receiverNum);
      if (!targetReceiver) { state.quarterback.phase = 'passing'; return; }
      const fromX = state.quarterback.x;
      const fromY = state.quarterback.y;
      state.quarterback.facingLeft = targetReceiver.x < fromX;
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;
      const velocityX = Number(targetReceiver.velocityX) || 0;
      const velocityY = Number(targetReceiver.velocityY) || 0;
      const isMoving = Boolean(targetReceiver.isMoving) && Math.hypot(velocityX, velocityY * lateralYards) > 0.05;
      let duration = 0.3;
      let targetX = targetReceiver.x;
      let targetY = targetReceiver.y;
      let distance = 0;
      if (isMoving) {
        for (let step = 0; step < 4; step++) {
          const predicted = predictReceiverPosition(targetReceiver, duration);
          targetX = predicted.x;
          targetY = predicted.y;
          distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
          duration = throwProfile(distance, targetHeightFeet, getQbStrength()).duration;
        }
      } else {
        distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
        duration = throwProfile(distance, targetHeightFeet, getQbStrength()).duration;
      }

      const intendedDistance = distance;
      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma } = calculateInaccuracy(intendedDistance, lateralYards);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);
      const actualDistance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const actualDuration = throwProfile(actualDistance, actualTargetHeightFeet, getQbStrength()).duration;

      state.pass = {
        fromX,
        fromY,
        targetX: actualTargetX,
        targetY: actualTargetY,
        targetHeightFeet: actualTargetHeightFeet,
        duration: actualDuration,
        progress: 0,
        distanceYards: actualDistance,
        heightFeet: releaseHeightFeet,
        heightfeet: releaseHeightFeet,
        targetReceiverNumber: targetReceiver.receiverNumber,
        wasTargetMoving: isMoving,
        intendedTargetX: targetX,
        intendedTargetY: targetY,
        sigma
      };
      state.quarterback.hasBall = false;
      state.quarterback.phase = 'thrown';
      state.phase = 'thrown';
    }

    function queue(data) {
      const moving = Boolean(state.quarterback.isMoving)
        && Math.hypot(state.quarterback.velocityX || 0, (state.quarterback.velocityY || 0) * lateralYards) > 0.05;
      if (!moving) {
        state.quarterback.isMoving = false;
        state.quarterback.velocityX = 0;
        state.quarterback.velocityY = 0;
        state.quarterback.phase = 'throwing';
        state.quarterback.throwProgress = 0;
        state.quarterback.facingLeft = data.targetX < state.quarterback.x;
      }
      state.throwWindup = { ...data, delay: moving ? 0.4 : 0.2, elapsed: 0, wasMoving: moving, animDuration: 0.2,
        runDirX: Number.isFinite(state.quarterback.lastDirX) ? state.quarterback.lastDirX : 1,
        runDirY: Number.isFinite(state.quarterback.lastDirY) ? state.quarterback.lastDirY : 0 };
    }

    function throwPassToLocation(targetX, targetY) {
      if (state.playType === 'run' || !['passing', 'dropback'].includes(state.phase) || state.throwWindup || !quarterbackIsBehindLineOfScrimmage()) return;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      if (state.phase === 'dropback') { state.phase = 'passing'; state.dropbackRemaining = 0; state.quarterback.dropbackRemaining = 0; }
      const clampedX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX));
      const clampedY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY));
      queue({ targetX: clampedX, targetY: clampedY });
    }

    function throwPass(target, maybeY) {
      if (typeof target === 'number' && typeof maybeY === 'number') return throwPassToLocation(target, maybeY);
      if (typeof target === 'object' && target !== null) return throwPassToLocation(target.x, target.y);
      if (state.playType === 'run' || !['passing', 'dropback'].includes(state.phase) || state.throwWindup || !quarterbackIsBehindLineOfScrimmage()) return;
      const targetReceiver = passTarget(target);
      if (!targetReceiver?.receiverNumber) return;
      if (state.phase === 'dropback') { state.phase = 'passing'; state.dropbackRemaining = 0; state.quarterback.dropbackRemaining = 0; }
      queue({ receiverNum: target, targetX: targetReceiver.x, targetY: targetReceiver.y });
    }

    function updateWindup(delta) {
      if (!state.throwWindup) return;
      const windup = state.throwWindup;
      windup.elapsed += delta;
      const animStart = Math.max(0, windup.delay - windup.animDuration);
      if (windup.wasMoving && windup.elapsed < animStart) {
        state.quarterback.phase = 'running';
        state.quarterback.isMoving = true;
      } else {
        state.quarterback.phase = 'throwing';
        state.quarterback.throwProgress = Math.min(1, (windup.elapsed - animStart) / Math.max(0.001, windup.delay - animStart));
        const targetX = Number.isFinite(windup.targetX) ? windup.targetX : passTarget(windup.receiverNum)?.x;
        if (Number.isFinite(targetX)) state.quarterback.facingLeft = targetX < state.quarterback.x;
      }
      if (windup.elapsed < windup.delay) return;
      delete state.throwWindup;
      if (!quarterbackIsBehindLineOfScrimmage()) { state.quarterback.phase = 'running'; state.quarterback.isMoving = true; return; }
      if (Number.isFinite(windup.targetX) && Number.isFinite(windup.targetY) && !windup.receiverNum) releaseToLocation(windup.targetX, windup.targetY);
      else if (windup.receiverNum) release(windup.receiverNum);
      else releaseToLocation(windup.targetX, windup.targetY);
    }

    return {
      throwHeightAt: (progress, distanceYards, targetHeight) => throwHeightAt(progress, distanceYards, targetHeight, getQbStrength()),
      throwProfile: (distanceYards, targetHeight) => throwProfile(distanceYards, targetHeight, getQbStrength()),
      throwPass,
      throwPassToLocation,
      updateWindup,
      calculateSigma,
      calculateInaccuracy,
      calculateThrowArc
    };
  }

  const api = {
    create,
    throwProfile,
    throwHeightAt,
    calculateThrowArc,
    calculateSigma,
    calculateInaccuracy,
    releaseHeightFeet,
    targetHeightFeet,
    C_BASE,
    ALPHA,
    BETA
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GamePassing = api;
})(typeof window !== 'undefined' ? window : globalThis);
