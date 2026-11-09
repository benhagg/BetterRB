(function (root) {
  const passSpeedYardsPerSecond = 12;
  const throwArc = 0.7;
  const releaseHeightFeet = 6;
  const targetHeightFeet = 4;

  function throwHeightAt(progress, distanceYards) {
    const t = Math.max(0, Math.min(1, progress));
    const straightHeight = releaseHeightFeet + (targetHeightFeet - releaseHeightFeet) * t;
    return straightHeight + throwArc * distanceYards * 4 * t * (1 - t);
  }

  function throwArcLength(distanceYards) {
    const samples = 16;
    let length = 0;
    let previousDistance = 0;
    let previousHeight = throwHeightAt(0, distanceYards) / 3;
    for (let index = 1; index <= samples; index++) {
      const progress = index / samples;
      const distance = distanceYards * progress;
      const height = throwHeightAt(progress, distanceYards) / 3;
      length += Math.hypot(distance - previousDistance, height - previousHeight);
      previousDistance = distance;
      previousHeight = height;
    }
    return length;
  }

  function create({ state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage }) {
    function predictReceiverPosition(player, seconds) {
      const velocityX = Number(player.velocityX) || 0;
      const velocityYards = (Number(player.velocityY) || 0) * lateralYards;
      const currentSpeed = Math.hypot(velocityX, velocityYards);
      if (!player.isMoving || currentSpeed < 0.05 || !Number.isFinite(player.speed) || player.speed <= 0) {
        return { x: player.x, y: player.y };
      }
      const directionX = velocityX / currentSpeed;
      const directionY = velocityYards / currentSpeed;
      const startFactor = Math.max(0, Math.min(1, currentSpeed / player.speed));
      const agility = Math.max(0, Math.min(10, Number(player.agility ?? player.acceleration ?? player.rating) || 0));
      const accelerationRate = 1.3 / Math.max(0.5, 1 - agility * 0.05);
      const travelYards = player.speed * (seconds
        - ((1 - startFactor) * (1 - Math.exp(-accelerationRate * seconds))) / accelerationRate);
      return { x: player.x + directionX * travelYards, y: player.y + (directionY * travelYards) / lateralYards };
    }

    function releaseToLocation(targetX, targetY) {
      const fromX = state.quarterback.x;
      const fromY = state.quarterback.y;
      state.quarterback.facingLeft = targetX < fromX;
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;
      const distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
      const duration = Math.max(0.4, Math.min(2.5, throwArcLength(distance) / passSpeedYardsPerSecond));
      state.pass = { fromX, fromY, targetX, targetY, duration, progress: 0, distanceYards: distance,
        heightFeet: releaseHeightFeet, heightfeet: releaseHeightFeet, targetReceiverNumber: null, wasTargetMoving: false };
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
          duration = Math.max(0.4, Math.min(2.5, throwArcLength(distance) / passSpeedYardsPerSecond));
        }
      } else {
        distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
        duration = Math.max(0.4, Math.min(2.5, throwArcLength(distance) / passSpeedYardsPerSecond));
      }
      state.pass = { fromX, fromY, targetX, targetY, duration, progress: 0, distanceYards: distance,
        heightFeet: releaseHeightFeet, heightfeet: releaseHeightFeet, targetReceiverNumber: targetReceiver.receiverNumber, wasTargetMoving: isMoving };
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

    return { throwHeightAt, throwPass, throwPassToLocation, updateWindup };
  }

  root.GamePassing = { create };
})(window);
