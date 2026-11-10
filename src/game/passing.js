(function (root) {
  // --- Tunable Throw & Accuracy Physics Coefficients ---
  const METERS_PER_YARD = 0.9144;
  const FEET_PER_METER = 3.28084;
  const releaseHeightMeters = 2.1;
  const defaultCatchHeightMeters = 1.8;
  const gravityMetersPerSecondSquared = 9.81;
  const releaseHeightFeet = releaseHeightMeters * FEET_PER_METER;
  const targetHeightFeet = defaultCatchHeightMeters * FEET_PER_METER;
  const feetPerYard = 3.0;

  // Kept for the legacy throw-arc helpers exposed to the UI and tests.
  const ARC_STRENGTH_REDUCTION = 0.015;
  const ARC_START_YARDS = 3;
  const ARC_MAX_YARDS = 25;
  const MAX_ARC_FEET = 15;
  const MIN_THROW_DISTANCE_YARDS = 15;
  const MAX_THROW_DISTANCE_YARDS = 30;

  // Inaccuracy base & distance coefficients (less is more accurate)
  const C_BASE = 0.10;
  const ALPHA = 0.0016;
  const BETA = 0.00066;

  // Running while throwing penalty multiplier (recommended 1.25, range 1.1 - 1.3)
  const RUNNING_THROW_INACCURACY_MULTIPLIER = 1.25;

  function arcFactor(distanceYards) {
    const arcStart = 5;
    const arcEnd = 25;
    const d = Math.max(0, Number(distanceYards) || 0);
    if (d <= arcStart) return 0;
    const t = Math.min(1, (d - arcStart) / (arcEnd - arcStart));
    return t * t * (3 - 2 * t);
  }

  function calculateThrowArc(distanceYards, strength = 5) {
    const d = Math.max(0, Number(distanceYards) || 0);
    const numStrength = Number(strength);
    const s = Math.max(0, Math.min(10, Number.isFinite(numStrength) ? numStrength : 5));
    return MAX_ARC_FEET * arcFactor(d) * (1 - ARC_STRENGTH_REDUCTION * s);
  }

  function desiredApexForDistance(distanceYards) {
    return releaseHeightFeet + calculateThrowArc(distanceYards);
  }

  function calculateSigma(distanceYards) {
    const d = Math.max(0, Number(distanceYards) || 0);
    return C_BASE + (ALPHA * d) + (BETA * d * d);
  }

  function maxThrowDistance(strength = 0) {
    const rating = Math.max(0, Math.min(10, Number(strength) || 0));
    return MIN_THROW_DISTANCE_YARDS
      + (MAX_THROW_DISTANCE_YARDS - MIN_THROW_DISTANCE_YARDS) * (rating / 10);
  }

  function limitThrowTarget(fromX, fromY, targetX, targetY, strength = 0, lateralScale = 25) {
    const dx = targetX - fromX;
    const dy = (targetY - fromY) * lateralScale;
    const distance = Math.hypot(dx, dy);
    const limit = maxThrowDistance(strength);
    if (distance <= limit || distance < 0.0001) return { x: targetX, y: targetY };
    const scale = limit / distance;
    return {
      x: fromX + dx * scale,
      y: fromY + (dy * scale) / lateralScale
    };
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

  function calculateInaccuracy(distanceYards, lateralYards, multiplier = 1.0) {
    const MAX_STD_DEV = 3;
    const sigma = calculateSigma(distanceYards) * multiplier;
    const inaccuracyX = clampedGaussian(MAX_STD_DEV) * sigma;
    const inaccuracyY = (clampedGaussian(MAX_STD_DEV) * sigma) / lateralYards;
    const inaccuracyHeightFeet = clampedGaussian(MAX_STD_DEV) * (sigma * feetPerYard);
    return { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma };
  }

  function solveFootballTrajectory(distanceYards, catchHeightMeters = defaultCatchHeightMeters) {
    const distance = Math.max(0, Number(distanceYards) || 0);
    const targetHeightMeters = Number.isFinite(catchHeightMeters)
      ? catchHeightMeters : defaultCatchHeightMeters;
    const rangeMeters = distance * METERS_PER_YARD;
    let angleDegrees = 14 + (0.40 * distance) - (0.0012 * distance ** 2);
    angleDegrees = Math.max(14, Math.min(42, angleDegrees));
    const angleRadians = angleDegrees * Math.PI / 180;
    const cosine = Math.cos(angleRadians);
    const sine = Math.sin(angleRadians);
    const tangent = Math.tan(angleRadians);
    const denominator = 2 * cosine ** 2
      * (rangeMeters * tangent + releaseHeightMeters - targetHeightMeters);
    const initialVelocityMps = denominator > 0 && rangeMeters > 0
      ? Math.sqrt((gravityMetersPerSecondSquared * rangeMeters ** 2) / denominator)
      : 0;
    const hangTimeSeconds = initialVelocityMps > 0
      ? rangeMeters / (initialVelocityMps * cosine)
      : 0;
    const peakHeightMeters = releaseHeightMeters
      + (initialVelocityMps * sine) ** 2 / (2 * gravityMetersPerSecondSquared);
    const points = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const xMeters = (rangeMeters * i) / steps;
      const xYards = xMeters / METERS_PER_YARD;
      const yMeters = initialVelocityMps > 0
        ? releaseHeightMeters + (xMeters * tangent)
          - (gravityMetersPerSecondSquared * xMeters ** 2)
            / (2 * (initialVelocityMps * cosine) ** 2)
        : releaseHeightMeters;
      points.push({
        xYards: Number(xYards.toFixed(2)),
        yFeet: Number(Math.max(0, yMeters * FEET_PER_METER).toFixed(2))
      });
    }

    return {
      targetDistanceYards: distance,
      angleDegrees,
      angleRadians,
      initialVelocityMps,
      initialVelocityMph: initialVelocityMps * 2.23694,
      peakHeightFeet: peakHeightMeters * FEET_PER_METER,
      hangTimeSeconds,
      trajectoryPath: points
    };
  }

  function calculateFootballTrajectory(distanceYards, catchHeightMeters = defaultCatchHeightMeters) {
    const trajectory = solveFootballTrajectory(distanceYards, catchHeightMeters);
    return {
      targetDistanceYards: trajectory.targetDistanceYards,
      launchAngleDegrees: Number(trajectory.angleDegrees.toFixed(2)),
      initialVelocityMps: Number(trajectory.initialVelocityMps.toFixed(2)),
      initialVelocityMph: Number(trajectory.initialVelocityMph.toFixed(2)),
      peakHeightFeet: Number(trajectory.peakHeightFeet.toFixed(2)),
      hangTimeSeconds: Number(trajectory.hangTimeSeconds.toFixed(2)),
      trajectoryPath: trajectory.trajectoryPath
    };
  }

  function throwProfile(distanceYards, targetHeight = targetHeightFeet) {
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    const distance = Math.max(0, Number(distanceYards) || 0);
    const trajectory = solveFootballTrajectory(distance, resolvedTargetHeight / FEET_PER_METER);
    const angleRadians = trajectory.angleRadians;
    const initialVelocityMps = trajectory.initialVelocityMps;
    const launchVelocity = initialVelocityMps * Math.sin(angleRadians) * FEET_PER_METER;
    const duration = Math.max(0.001, trajectory.hangTimeSeconds);
    const apexHeight = trajectory.peakHeightFeet;
    const gravity = gravityMetersPerSecondSquared * FEET_PER_METER;
    const apexAt = Math.max(0, Math.min(1, launchVelocity / gravity / duration));

    return {
      launchVelocity,
      horizontalVelocityYardsPerSecond: initialVelocityMps * Math.cos(angleRadians) / METERS_PER_YARD,
      duration,
      apexHeight,
      arc: Math.max(0, apexHeight - releaseHeightFeet),
      gravity,
      apexAt,
      releaseHeight: releaseHeightFeet,
      targetHeight: resolvedTargetHeight,
      launchAngleDegrees: trajectory.angleDegrees,
      initialVelocityMps,
      initialVelocityMph: trajectory.initialVelocityMps * 2.23694,
      trajectoryPath: trajectory.trajectoryPath
    };
  }

  function arcHeightAt(progress, profile) {
    const elapsed = Math.max(0, Math.min(1, progress)) * profile.duration;
    return profile.releaseHeight + profile.launchVelocity * elapsed
      - 0.5 * profile.gravity * elapsed * elapsed;
  }

  function throwHeightAt(progress, distanceYards, targetHeight = targetHeightFeet, strength = 5) {
    if (typeof distanceYards === 'object' && distanceYards !== null) {
      const p = distanceYards.profile || distanceYards;
      if (Number.isFinite(p.launchVelocity) && Number.isFinite(p.duration)) {
        return arcHeightAt(progress, p);
      }
    }
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    const profile = throwProfile(distanceYards, resolvedTargetHeight, strength);
    return arcHeightAt(progress, profile);
  }

  function create({ state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage, onPassReleased }) {
    function getQbStrength() {
      const qb = state.quarterback;
      return qb?.rating?.strength ?? qb?.ratings?.strength ?? qb?.strength ?? 5;
    }

    function predictReceiverPosition(player, seconds) {
      // Tunable receiver prediction acceleration coefficients
      const BASE_ACCEL_RATE = 1.3;
      const AGILITY_ACCEL_SCALE = 0.05;
      const MIN_ACCEL_SCALE = 0.5;

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
      const agility = Math.max(0, Math.min(10, Number(player.rating?.agility ?? player.ratings?.agility ?? player.agility ?? 5) || 0));
      const accelerationRate = BASE_ACCEL_RATE / Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_ACCEL_SCALE);
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

    function releaseToLocation(targetX, targetY, isRunningThrow = false) {
      const qbWasMoving = Boolean(isRunningThrow)
        || Boolean(state.throwWindup?.wasMoving)
        || (Boolean(state.quarterback.isMoving) && Math.hypot(state.quarterback.velocityX || 0, (state.quarterback.velocityY || 0) * lateralYards) > 0.05);
      const inaccuracyMultiplier = qbWasMoving ? RUNNING_THROW_INACCURACY_MULTIPLIER : 1.0;

      const fromX = state.quarterback.x;
      const fromY = state.quarterback.y;
      const limitedTarget = limitThrowTarget(fromX, fromY, targetX, targetY, getQbStrength(), lateralYards);
      targetX = limitedTarget.x;
      targetY = limitedTarget.y;
      state.quarterback.facingLeft = targetX < fromX;
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;

      const intendedDistance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma } = calculateInaccuracy(intendedDistance, lateralYards, inaccuracyMultiplier);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);

      const distance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const profile = throwProfile(distance, actualTargetHeightFeet, getQbStrength());
      state.pass = {
        fromX,
        fromY,
        targetX: actualTargetX,
        targetY: actualTargetY,
        targetHeightFeet: actualTargetHeightFeet,
        duration: profile.duration,
        progress: 0,
        distanceYards: distance,
        heightFeet: releaseHeightFeet,
        heightfeet: releaseHeightFeet,
        targetReceiverNumber: null,
        wasTargetMoving: false,
        intendedTargetX: targetX,
        intendedTargetY: targetY,
        isRunningThrow: qbWasMoving,
        inaccuracyMultiplier,
        sigma,
        profile,
        launchVelocity: profile.launchVelocity,
        apexHeight: profile.apexHeight,
        arc: profile.arc
      };
      state.quarterback.hasBall = false;
      state.quarterback.phase = 'thrown';
      state.phase = 'thrown';
      onPassReleased?.(state.pass);
    }

    function release(receiverNum, isRunningThrow = false) {
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

      const limitedTarget = limitThrowTarget(fromX, fromY, targetX, targetY, getQbStrength(), lateralYards);
      targetX = limitedTarget.x;
      targetY = limitedTarget.y;

      const intendedDistance = distance;
      const qbWasMoving = Boolean(isRunningThrow)
        || Boolean(state.throwWindup?.wasMoving)
        || (Boolean(state.quarterback.isMoving) && Math.hypot(state.quarterback.velocityX || 0, (state.quarterback.velocityY || 0) * lateralYards) > 0.05);
      const inaccuracyMultiplier = qbWasMoving ? RUNNING_THROW_INACCURACY_MULTIPLIER : 1.0;

      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet, sigma } = calculateInaccuracy(intendedDistance, lateralYards, inaccuracyMultiplier);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);
      const actualDistance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const profile = throwProfile(actualDistance, actualTargetHeightFeet, getQbStrength());

      state.pass = {
        fromX,
        fromY,
        targetX: actualTargetX,
        targetY: actualTargetY,
        targetHeightFeet: actualTargetHeightFeet,
        duration: profile.duration,
        progress: 0,
        distanceYards: actualDistance,
        heightFeet: releaseHeightFeet,
        heightfeet: releaseHeightFeet,
        targetReceiverNumber: targetReceiver.receiverNumber,
        wasTargetMoving: isMoving,
        intendedTargetX: targetX,
        intendedTargetY: targetY,
        isRunningThrow: qbWasMoving,
        inaccuracyMultiplier,
        sigma,
        profile,
        launchVelocity: profile.launchVelocity,
        apexHeight: profile.apexHeight,
        arc: profile.arc
      };
      state.quarterback.hasBall = false;
      state.quarterback.phase = 'thrown';
      state.phase = 'thrown';
      onPassReleased?.(state.pass);
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
      if (state.playType === 'run' || state.phase !== 'passing' || state.throwWindup || !quarterbackIsBehindLineOfScrimmage()) return;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      const clampedX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX));
      const clampedY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY));
      const limited = limitThrowTarget(state.quarterback.x, state.quarterback.y, clampedX, clampedY, getQbStrength(), lateralYards);
      queue({ targetX: limited.x, targetY: limited.y });
    }

    function throwPass(target, maybeY) {
      if (typeof target === 'number' && typeof maybeY === 'number') return throwPassToLocation(target, maybeY);
      if (typeof target === 'object' && target !== null) return throwPassToLocation(target.x, target.y);
      if (state.playType === 'run' || state.phase !== 'passing' || state.throwWindup || !quarterbackIsBehindLineOfScrimmage()) return;
      const targetReceiver = passTarget(target);
      if (!targetReceiver?.receiverNumber) return;
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
      const wasMoving = Boolean(windup.wasMoving);
      delete state.throwWindup;
      if (!quarterbackIsBehindLineOfScrimmage()) { state.quarterback.phase = 'running'; state.quarterback.isMoving = true; return; }
      if (Number.isFinite(windup.targetX) && Number.isFinite(windup.targetY) && !windup.receiverNum) releaseToLocation(windup.targetX, windup.targetY, wasMoving);
      else if (windup.receiverNum) release(windup.receiverNum, wasMoving);
      else releaseToLocation(windup.targetX, windup.targetY, wasMoving);
    }

    return {
      throwHeightAt: (progress, distanceYards, targetHeight) => {
        if (state.pass?.profile) {
          const p = state.pass.profile;
          return arcHeightAt(progress, p);
        }
        return throwHeightAt(progress, distanceYards, targetHeight, getQbStrength());
      },
      throwProfile: (distanceYards, targetHeight) => throwProfile(distanceYards, targetHeight, getQbStrength()),
      calculateFootballTrajectory,
      throwPass,
      throwPassToLocation,
      updateWindup,
      calculateSigma,
      calculateInaccuracy,
      calculateThrowArc,
      desiredApexForDistance,
      arcFactor,
      maxThrowDistance
    };
  }

  const api = {
    create,
    throwProfile,
    calculateFootballTrajectory,
    throwHeightAt,
    calculateThrowArc,
    desiredApexForDistance,
    arcFactor,
    maxThrowDistance,
    calculateSigma,
    calculateInaccuracy,
    releaseHeightFeet,
    targetHeightFeet,
    C_BASE,
    ALPHA,
    BETA,
    RUNNING_THROW_INACCURACY_MULTIPLIER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GamePassing = api;
})(typeof window !== 'undefined' ? window : globalThis);
