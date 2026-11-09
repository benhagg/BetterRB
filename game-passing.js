(function (root) {
  const throwArc = 0.4;
  const releaseHeightFeet = 6;
  const targetHeightFeet = 4;
  const gravityFeetPerSecondSquared = 32.174;
  const inaccuracyYards = 1.0;
  const feetPerYard = 3.0;

  function calculateInaccuracy(lateralYards) {
    const inaccuracyX = (Math.random() * 2 - 1) * inaccuracyYards;
    const inaccuracyY = ((Math.random() * 2 - 1) * inaccuracyYards) / lateralYards;
    const inaccuracyHeightFeet = (Math.random() * 2 - 1) * (inaccuracyYards * feetPerYard);
    return { inaccuracyX, inaccuracyY, inaccuracyHeightFeet };
  }

  function throwProfile(distanceYards, targetHeight = targetHeightFeet) {
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    // throwArc is extra apex height in feet per yard of horizontal throw distance.
    const apexHeight = Math.max(releaseHeightFeet, resolvedTargetHeight) + Math.max(0, throwArc) * distanceYards;
    const launchVelocity = Math.sqrt(2 * gravityFeetPerSecondSquared * (apexHeight - releaseHeightFeet));
    const riseTime = launchVelocity / gravityFeetPerSecondSquared;
    const fallTime = Math.sqrt(2 * (apexHeight - resolvedTargetHeight) / gravityFeetPerSecondSquared);
    return { launchVelocity, duration: riseTime + fallTime };
  }

  function throwHeightAt(progress, distanceYards, targetHeight = targetHeightFeet) {
    const resolvedTargetHeight = Number.isFinite(targetHeight) ? targetHeight : targetHeightFeet;
    const profile = throwProfile(distanceYards, resolvedTargetHeight);
    const elapsed = Math.max(0, Math.min(1, progress)) * profile.duration;
    return releaseHeightFeet + profile.launchVelocity * elapsed
      - 0.5 * gravityFeetPerSecondSquared * elapsed * elapsed;
  }

  function create({ state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage }) {
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

      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet } = calculateInaccuracy(lateralYards);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);

      const distance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const duration = throwProfile(distance, actualTargetHeightFeet).duration;
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
        intendedTargetY: targetY
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
          duration = throwProfile(distance, targetHeightFeet).duration;
        }
      } else {
        distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
        duration = throwProfile(distance, targetHeightFeet).duration;
      }

      const { inaccuracyX, inaccuracyY, inaccuracyHeightFeet } = calculateInaccuracy(lateralYards);
      const actualTargetX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX + inaccuracyX));
      const actualTargetY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY + inaccuracyY));
      const actualTargetHeightFeet = Math.max(1, targetHeightFeet + inaccuracyHeightFeet);
      const actualDistance = Math.hypot(actualTargetX - fromX, (actualTargetY - fromY) * lateralYards);
      const actualDuration = throwProfile(actualDistance, actualTargetHeightFeet).duration;

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
        intendedTargetY: targetY
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
      throwHeightAt,
      throwProfile,
      throwPass,
      throwPassToLocation,
      updateWindup,
      calculateInaccuracy
    };
  }

  const api = {
    create,
    throwProfile,
    throwHeightAt,
    calculateInaccuracy,
    throwArc,
    releaseHeightFeet,
    targetHeightFeet,
    inaccuracyYards
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GamePassing = api;
})(typeof window !== 'undefined' ? window : globalThis);
