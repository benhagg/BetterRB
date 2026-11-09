(function (root) {
  const LATERAL_YARDS = 17; // Playable sideline-to-sideline width used for movement scaling.
  // The visible sideline area renders vertical yards at a smaller pixel scale than horizontal yards.
  const SCREEN_DIAGONAL_YARD_SCALE = 1.38;

  function speedMultiplier(position) {
    if (typeof PlayerSkills !== 'undefined' && typeof PlayerSkills.speedMultiplier === 'function') {
      return PlayerSkills.speedMultiplier(position);
    }
    const code = String(position || '').trim().toUpperCase();
    if (['RB', 'WR', 'DB', 'CB', 'S', 'FS', 'SS', 'NB'].includes(code)) return 1.0;
    if (['QB', 'LB', 'TE', 'ILB', 'MLB', 'OLB', 'SLB', 'WLB'].includes(code)) return 0.85;
    if (['OL', 'DL', 'DT', 'DE', 'NT', 'EDGE', 'OT', 'OG', 'C', 'G', 'T', 'LINEMAN'].includes(code)) return 0.7;
    return 1.0;
  }

  function kindForPosition(position) {
    const code = String(position || '').trim().toUpperCase();
    if (['DT', 'DL', 'DE', 'NT', 'EDGE', 'OL', 'OT', 'OG', 'C', 'G', 'T', 'LINEMAN'].includes(code)) {
      return 'lineman';
    }
    return 'skill';
  }

  // ==========================================
  // BASE CLASS: Player
  // ==========================================
  class Player {
    constructor(config = {}) {
      this.id = config.id ?? 0;
      this.name = config.name ?? 'Player';
      this.position = String(config.position ?? 'WR').trim().toUpperCase();
      this.team = config.team ?? null;
      this.uniform = config.uniform ?? null;
      const rawRatings = (config.ratings && typeof config.ratings === 'object')
        ? config.ratings
        : (config.rating && typeof config.rating === 'object')
          ? config.rating
          : null;
      const fallbackRating = Number.isFinite(config.rating) ? config.rating : 5;

      const speedRating = Number.isFinite(rawRatings?.speed)
        ? rawRatings.speed
        : (Number.isFinite(config.speed) ? config.speed : fallbackRating);
      const agilityRating = Number.isFinite(rawRatings?.agility)
        ? rawRatings.agility
        : (Number.isFinite(config.agility) ? config.agility : fallbackRating);
      const strengthRating = Number.isFinite(rawRatings?.strength)
        ? rawRatings.strength
        : (Number.isFinite(config.strength) ? config.strength : 5);

      this.ratings = {
        speed: speedRating,
        agility: agilityRating,
        strength: strengthRating,
        ...(rawRatings || {})
      };
      this.rating = this.ratings;
      // Base speed physics coefficients
      const BASE_SPEED = 5.0;
      const SPEED_RATING_COEFF = 0.3;
      this.speedMultiplier = speedMultiplier(this.position);
      this.speed = (BASE_SPEED + speedRating * SPEED_RATING_COEFF) * this.speedMultiplier;
      this.kind = config.kind ?? kindForPosition(this.position);

      this.x = Number.isFinite(config.x) ? config.x : 22;
      this.y = Number.isFinite(config.y) ? config.y : 0.5;
      this.startX = Number.isFinite(config.startX) ? config.startX : this.x;
      this.startY = Number.isFinite(config.startY) ? config.startY : this.y;
      this.velocityX = Number.isFinite(config.velocityX) ? config.velocityX : 0;
      this.velocityY = Number.isFinite(config.velocityY) ? config.velocityY : 0;
      this.lastDirX = Number.isFinite(config.lastDirX) ? config.lastDirX : 1;
      this.lastDirY = Number.isFinite(config.lastDirY) ? config.lastDirY : 0;

      this.animDistance = 0;
      this.facingLeft = Boolean(config.facingLeft);
      this.isMoving = false;
      this.phase = config.phase ?? 'preplay';
    }

    get agility() {
      return this.ratings?.agility ?? 5;
    }

    get strength() {
      return this.ratings?.strength ?? 5;
    }

    // Class instances are re-created when a saved game loads. Keep saved data plain.
    toJSON() {
      return {
        id: this.id, name: this.name, position: this.position,
        rating: { ...this.ratings },
        ratings: { ...this.ratings },
        kind: this.kind, x: this.x, y: this.y, startX: this.startX, startY: this.startY,
        velocityX: this.velocityX, velocityY: this.velocityY,
        lastDirX: this.lastDirX, lastDirY: this.lastDirY, autoRun: this.autoRun,
        animDistance: this.animDistance, facingLeft: this.facingLeft, isMoving: this.isMoving,
        phase: this.phase, hasBall: this.hasBall, isDiving: this.isDiving,
        diveProgress: this.diveProgress, diveCooldownTimer: this.diveCooldownTimer,
        isTackled: this.isTackled, receiverNumber: this.receiverNumber,
        route: this.route, routeIndex: this.routeIndex, offset: this.offset,
        across: this.across, isCenter: this.isCenter,
        dropbackRemaining: this.dropbackRemaining
      };
    }

    setFieldPosition(x, y) {
      this.x = Math.max(-10, Math.min(110, x));
      this.y = Math.max(-0.02, Math.min(0.95, y));
    }

    resetToStart(scrimmagePosition) {
      if (Number.isFinite(scrimmagePosition) && Number.isFinite(this.offset)) {
        this.x = scrimmagePosition + this.offset;
      } else {
        this.x = this.startX;
      }
      this.y = this.startY;
      this.animDistance = 0;
      this.isMoving = false;
      this.phase = 'preplay';
      this.lastDirX = 1;
      this.lastDirY = 0;
      this.autoRun = null;
      this.velocityX = 0;
      this.velocityY = 0;
      this._movement = null;
    }

    movementStep(delta, requestedX, requestedY) {
      // --- Tunable Physics Coefficients ---
      // Acceleration
      const BASE_ACCEL_RATE = 1.3;
      const AGILITY_ACCEL_SCALE = 0.05;
      const MIN_ACCEL_SCALE = 0.5;

      // Stopping Deceleration
      const BASE_MAX_DECEL_TIME = 0.7;
      const AGILITY_DECEL_SCALE = 0.04;
      const MIN_DECEL_TIME = 0.04;

      // Cut Deceleration
      const CUT_DECEL_TIME_SCALE = 0.55;
      const MIN_CUT_TIME = 0.06;
      const CUT_TARGET_DOT_THRESHOLD = 0.70; // ~45 deg to allow continuous waypoint tracking and diagonal input overlap

      // Thresholds
      const MIN_MAGNITUDE = 0.0001;
      const MIN_SPEED_FACTOR = 0.001;
      const MIN_CUT_SPEED_FACTOR = 0.05;
      const STRAIGHT_DOT_THRESHOLD = 0.965; // ~15 deg steering tolerance before triggering plant-and-cut
      // ------------------------------------

      const movement = this._movement ||= {
        direction: { x: this.lastDirX, y: this.lastDirY },
        speedFactor: 0,
        hasDirection: false,
        deceleration: null
      };

      if (!this.isMoving && Math.hypot(this.velocityX || 0, (this.velocityY || 0) * LATERAL_YARDS) < 0.05) {
        if (!movement.deceleration) {
          movement.speedFactor = 0;
          movement.hasDirection = false;
        }
      }

      const magnitude = Math.hypot(requestedX, requestedY);
      const agility = Math.max(0, Math.min(10, Number(this.rating?.agility ?? this.ratings?.agility ?? this.agility ?? 5) || 0));
      // Level 0 uses f(t) = 1 - exp(-1.3t); each agility level shortens the time scale by 5%.
      const accelerationRate = BASE_ACCEL_RATE / Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_ACCEL_SCALE);

      if (magnitude < MIN_MAGNITUDE) {
        movement.cut = null;
        if (!movement.deceleration) {
          const maxDecelTime = BASE_MAX_DECEL_TIME * Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_DECEL_SCALE);
          const tStop = Math.max(MIN_DECEL_TIME, maxDecelTime * (movement.speedFactor ** 2));
          movement.deceleration = { elapsed: 0, startFactor: movement.speedFactor, tStop };
        }
        movement.deceleration.elapsed += delta;
        const progress = Math.min(1, movement.deceleration.elapsed / movement.deceleration.tStop);
        movement.speedFactor = progress >= 1 ? 0 : movement.deceleration.startFactor * (1 - progress ** 2);
        if (movement.speedFactor <= MIN_SPEED_FACTOR) {
          movement.speedFactor = 0;
          movement.deceleration = null;
        }
      } else {
        const direction = { x: requestedX / magnitude, y: requestedY / magnitude };
        const dot = movement.direction.x * direction.x + movement.direction.y * direction.y;
        movement.deceleration = null;

        if (!movement.hasDirection || movement.speedFactor <= MIN_CUT_SPEED_FACTOR) {
          movement.direction = direction;
          movement.cut = null;
          movement.speedFactor = 1 - (1 - movement.speedFactor) * Math.exp(-accelerationRate * delta);
        } else if (dot >= STRAIGHT_DOT_THRESHOLD) {
          movement.direction = direction;
          movement.cut = null;
          movement.speedFactor = 1 - (1 - movement.speedFactor) * Math.exp(-accelerationRate * delta);
        } else {
          // Direction change: player must decelerate to the cut speed threshold before turning
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          const maxDecelTime = BASE_MAX_DECEL_TIME * Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_DECEL_SCALE);

          // Check if this is a genuinely new cut direction or a continuation of an active cut
          const isNewTarget = !movement.cut ||
            (movement.cut.targetDir.x * direction.x + movement.cut.targetDir.y * direction.y) < CUT_TARGET_DOT_THRESHOLD;

          if (isNewTarget) {
            const targetFactor = movement.speedFactor * Math.cos(angle / 2);
            const tStop = Math.max(MIN_DECEL_TIME, maxDecelTime * (movement.speedFactor ** 2));
            const speedDropFraction = Math.max(0, 1 - (targetFactor / movement.speedFactor));
            const tCut = Math.max(MIN_CUT_TIME, tStop * Math.sqrt(speedDropFraction) * CUT_DECEL_TIME_SCALE);
            movement.cut = {
              elapsed: 0,
              startFactor: movement.speedFactor,
              targetFactor,
              targetDir: direction,
              tCut
            };
          } else {
            // Update ongoing cut: if turn angle has deepened (e.g. keyboard diagonal overlap), scale targetFactor & tCut
            const targetFactor = Math.min(movement.cut.targetFactor, movement.cut.startFactor * Math.cos(angle / 2));
            const tStop = Math.max(MIN_DECEL_TIME, maxDecelTime * (movement.cut.startFactor ** 2));
            const speedDropFraction = Math.max(0, 1 - (targetFactor / movement.cut.startFactor));
            movement.cut.targetFactor = targetFactor;
            movement.cut.tCut = Math.max(movement.cut.tCut, tStop * Math.sqrt(speedDropFraction) * CUT_DECEL_TIME_SCALE);
            movement.cut.targetDir = direction;
          }

          movement.cut.elapsed += delta;
          const progress = Math.min(1, movement.cut.elapsed / movement.cut.tCut);
          movement.speedFactor = movement.cut.startFactor - (movement.cut.startFactor - movement.cut.targetFactor) * progress;

          if (progress >= 1 || movement.speedFactor <= movement.cut.targetFactor) {
            movement.speedFactor = movement.cut.targetFactor;
            movement.direction = movement.cut.targetDir;
            movement.cut = null;
          }
        }
        movement.hasDirection = true;
      }

      const factor = Math.max(0, Math.min(1, movement.speedFactor));
      this.velocityX = (movement.direction.x * this.speed * factor) || 0;
      this.velocityY = ((movement.direction.y * this.speed * factor) / LATERAL_YARDS) || 0;
      this.lastDirX = movement.direction.x;
      this.lastDirY = movement.direction.y;
      return { direction: movement.direction, step: this.speed * factor * delta, isMoving: factor > 0.001 };
    }

    coastToStop(delta) {
      if (this._movement && this._movement.speedFactor > 0.001) {
        const movement = this.movementStep(delta, 0, 0);
        this.x += movement.direction.x * movement.step;
        this.y += (movement.direction.y * movement.step) / LATERAL_YARDS;
        this.animDistance += movement.step;
        this.isMoving = movement.isMoving;
      } else {
        this.isMoving = false;
        this.velocityX = 0;
        this.velocityY = 0;
      }
    }

    run(delta, targetX, targetY) {
      const dx = targetX - this.x;
      const dyYards = (targetY - this.y) * LATERAL_YARDS;
      const dist = Math.hypot(dx, dyYards);

      if (dist > 0.05) {
        const movement = this.movementStep(delta, dx, dyYards);
        const step = Math.min(dist, movement.step);
        this.x += movement.direction.x * step;
        this.y += (movement.direction.y * step) / LATERAL_YARDS;
        this.animDistance += step;
        this.facingLeft = movement.direction.x < 0;
        this.isMoving = movement.isMoving;
      } else {
        this.coastToStop(delta);
      }
    }

    move(delta, vx, vy) {
      const movement = this.movementStep(delta, vx, vy * SCREEN_DIAGONAL_YARD_SCALE);
      this.x += movement.direction.x * movement.step;
      this.y += (movement.direction.y * movement.step) / LATERAL_YARDS;
      this.animDistance += movement.step;
      this.facingLeft = movement.direction.x < 0;
      this.isMoving = movement.isMoving;
    }

    getScreenCoordinates(playerX, qbYard, top, bottom, horizontalScale, pixelsPerYard) {
      const screenX = playerX + (this.x - qbYard) * pixelsPerYard * horizontalScale;
      const screenY = top + this.y * (bottom - top);
      return { screenX, screenY };
    }

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);

      if (this.phase === 'preplay') {
        RetroSprites.drawPrePlay(ctx, x, y, pixel, u, this.kind, this.facingLeft);
      } else if (this.isMoving) {
        RetroSprites.drawRunner(ctx, x, y, pixel, u, Math.floor(this.animDistance * 1.5), this.facingLeft);
      } else {
        RetroSprites.drawPrePlay(ctx, x, y, pixel, u, this.kind, this.facingLeft);
      }
    }
  }

  // ==========================================
  // OFFENSIVE PLAYER BASE
  // ==========================================
  class OffensivePlayer extends Player {
    constructor(config = {}) {
      super({ ...config, facingLeft: false });
      this.hasBall = Boolean(config.hasBall);
      this.isDiving = Boolean(config.isDiving);
      this.diveProgress = Number.isFinite(config.diveProgress) ? config.diveProgress : 0;
      this.isTackled = Boolean(config.isTackled);
      this.receiverNumber = config.receiverNumber ?? null;
      this.autoRun = config.autoRun ?? null;
    }

    dive() {
      if (this.isDiving || this.isTackled) return;
      this.isDiving = true;
      this.diveProgress = 0;
      this.autoRun = null;
    }

    catchBall(dir = null) {
      this.hasBall = true;
      this.phase = 'running';
      if (dir && dir.vx === 0 && dir.vy === 0) {
        this.autoRun = null;
        this.velocityX = 0;
        this.velocityY = 0;
        this.isMoving = false;
        return;
      }
      let vx = dir?.vx ?? 1;
      let vy = dir?.vy ?? 0;
      const len = Math.hypot(vx, vy);
      if (len > 0.001) {
        this.autoRun = { vx: vx / len, vy: vy / len };
      } else {
        this.autoRun = { vx: 1, vy: 0 };
      }
    }

    fumble() {
      this.hasBall = false;
      this.autoRun = null;
    }

    block(target = null) {
      // Empty for now; to be implemented later
    }

    tackled() {
      this.isTackled = true;
      this.isMoving = false;
      this.phase = 'tackled';
      this.autoRun = null;
    }

    update(delta) {
      if (this.isDiving) {
        this.diveProgress += delta / 0.4;
        const forwardStep = this.speed * 1.25 * delta;
        this.x += forwardStep;
        this.animDistance += forwardStep;
        if (this.diveProgress >= 1) {
          this.isDiving = false;
          this.diveProgress = 0;
        }
      }
    }

    drawRouteBadge(ctx, coords, pixel) {
      if (this.hasBall || this.isTackled || !this.receiverNumber) return;
      ctx.save();
      const bx = Math.round(coords.screenX);
      const by = Math.round(coords.screenY - 14 * pixel);

      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(bx, by, 6 * pixel, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, pixel);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${8 * pixel}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.receiverNumber), bx, by + pixel);
      ctx.restore();
    }

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);

      if (this.phase === 'preplay') {
        RetroSprites.drawPrePlay(ctx, x, y, pixel, u, this.kind, this.facingLeft);
      } else if (this.isTackled) {
        if (RetroSprites.drawAction) RetroSprites.drawAction(ctx, x, y, pixel, u, 'tackled', 1, this.facingLeft);
        else RetroSprites.drawPrePlay(ctx, x, y, pixel, u, this.kind, this.facingLeft);
      } else if (this.isDiving) {
        const frame = this.diveProgress < 0.33 ? 0 : this.diveProgress < 0.66 ? 1 : 2;
        if (RetroSprites.drawAction) RetroSprites.drawAction(ctx, x, y, pixel, u, 'odive', frame, this.facingLeft);
        else RetroSprites.drawRunner(ctx, x, y, pixel, u, 0, this.facingLeft);
      } else if (this.hasBall) {
        RetroSprites.drawRunner(ctx, x, y, pixel, u, Math.floor(this.animDistance * 1.5), this.facingLeft, true);
      } else {
        super.draw(ctx, coords, pixel, uniform);
      }

      this.drawRouteBadge(ctx, coords, pixel);
    }
  }

  // ==========================================
  // DEFENSIVE PLAYER BASE
  // ==========================================
  class DefensivePlayer extends Player {
    constructor(config = {}) {
      super({ ...config, facingLeft: true });
      this.isDiving = Boolean(config.isDiving);
      this.diveProgress = Number.isFinite(config.diveProgress) ? config.diveProgress : 0;
      this.diveCooldownTimer = Number.isFinite(config.diveCooldownTimer) ? config.diveCooldownTimer : 0;
      this.target = null;
    }

    canTackle(targetPlayer) {
      if (!targetPlayer) return false;
      const dx = targetPlayer.x - this.x;
      const dyYards = (targetPlayer.y - this.y) * LATERAL_YARDS;
      return Math.hypot(dx, dyYards) <= 0.6;
    }

    canDiveTackle(targetPlayer) {
      if (!targetPlayer || this.isDiving || this.diveCooldownTimer > 0) return false;
      const dx = targetPlayer.x - this.x;
      const dyYards = (targetPlayer.y - this.y) * LATERAL_YARDS;
      const dist = Math.hypot(dx, dyYards);
      return dist >= 0.8 && dist <= 2.2;
    }

    tackle(ballCarrier) {
      if (ballCarrier && typeof ballCarrier.tackled === 'function') {
        ballCarrier.tackled();
      }
    }

    diveTackle(ballCarrier) {
      if (this.isDiving || this.diveCooldownTimer > 0) return;
      this.isDiving = true;
      this.diveProgress = 0;
      this.target = ballCarrier;
    }

    pursue(targetPlayer, delta) {
      if (this.isDiving) {
        this.diveProgress += delta / 0.45;
        const forwardStep = this.speed * 1.4 * delta;
        const dir = this.facingLeft ? -1 : 1;
        this.x += dir * forwardStep;
        this.animDistance += forwardStep;

        if (this.target && this.canTackle(this.target)) {
          this.tackle(this.target);
          this.isDiving = false;
          this.diveCooldownTimer = 1.0;
        } else if (this.diveProgress >= 1) {
          this.isDiving = false;
          this.diveProgress = 0;
          this.diveCooldownTimer = 1.0;
        }
        return;
      }

      if (this.diveCooldownTimer > 0) {
        this.diveCooldownTimer = Math.max(0, this.diveCooldownTimer - delta);
      }

      if (!targetPlayer) return;

      const dx = targetPlayer.x - this.x;
      const dyYards = (targetPlayer.y - this.y) * LATERAL_YARDS;
      const dist = Math.hypot(dx, dyYards);

      if (dist <= 0.6) {
        this.tackle(targetPlayer);
      } else if (dist <= 2.2 && dist >= 0.8 && this.diveCooldownTimer <= 0 && Math.random() < 0.03) {
        this.diveTackle(targetPlayer);
      } else {
        this.run(delta, targetPlayer.x, targetPlayer.y);
      }
    }

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);

      if (this.isDiving) {
        const frame = this.diveProgress < 0.33 ? 0 : this.diveProgress < 0.66 ? 1 : 2;
        if (RetroSprites.drawAction) RetroSprites.drawAction(ctx, x, y, pixel, u, 'ddive', frame, this.facingLeft);
        else RetroSprites.drawRunner(ctx, x, y, pixel, u, 0, this.facingLeft);
      } else if (this.diveCooldownTimer > 0.5) {
        if (RetroSprites.drawAction) RetroSprites.drawAction(ctx, x, y, pixel, u, 'resting', 0, this.facingLeft);
        else RetroSprites.drawPrePlay(ctx, x, y, pixel, u, this.kind, this.facingLeft);
      } else {
        super.draw(ctx, coords, pixel, uniform);
      }
    }
  }

  // ==========================================
  // POSITION CLASSES: OFFENSE
  // ==========================================
  class Quarterback extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'QB', kind: 'skill' });
      this.dropbackRemaining = Number.isFinite(config.dropbackRemaining) ? config.dropbackRemaining : 0;
      this.hasBall = config.hasBall !== false;
    }

    dropback(yards = 3) {
      this.dropbackRemaining = yards;
      this.phase = 'dropback';
    }

    updateDropback(delta, dropbackRate = 2.5) {
      if (this.dropbackRemaining <= 0) return false;
      const dist = Math.min(this.dropbackRemaining, dropbackRate * delta);
      this.x -= dist;
      this.dropbackRemaining -= dist;
      this.animDistance += dist;
      if (this.dropbackRemaining <= 1e-9) {
        this.dropbackRemaining = 0;
        this.phase = 'passing';
        return true;
      }
      return false;
    }

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);

      if (this.phase === 'preplay') {
        RetroSprites.drawPrePlay(ctx, x, y, pixel, u, 'skill', this.facingLeft);
      } else if (this.phase === 'throwing') {
        const frame = (this.throwProgress ?? 0) < 0.5 ? 0 : 1;
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'pass', frame, this.facingLeft);
      } else if (this.phase === 'thrown') {
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'pass', 1, this.facingLeft);
      } else if (this.phase === 'dropback') {
        const frame = Math.floor(this.animDistance * 2) % 2;
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'dropback', frame, this.facingLeft);
      } else if (this.isMoving) {
        RetroSprites.drawRunner(ctx, x, y, pixel, u, Math.floor(this.animDistance * 1.5), this.facingLeft, true);
      } else if (this.phase === 'passing') {
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'dropback', 0, this.facingLeft);
      } else {
        super.draw(ctx, coords, pixel, uniform);
      }
    }
  }

  class WideReceiver extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'WR', kind: 'skill' });
      this.receiverNumber = config.receiverNumber ?? null;
      this.route = config.route ?? [];
      this.routeIndex = Number.isInteger(config.routeIndex) ? config.routeIndex : 0;
    }

    assignRoute(waypoints) {
      this.route = Array.isArray(waypoints) ? waypoints : [];
      this.routeIndex = 0;
    }

    runRoute(delta) {
      if (this.hasBall || this.isTackled) return;
      if (!this.route || this.routeIndex >= this.route.length) {
        this.coastToStop(delta);
        return;
      }

      const target = this.route[this.routeIndex];
      const targetX = this.startX + target.dx;
      const targetY = this.startY + target.dy;

      const diffX = targetX - this.x;
      const diffY = (targetY - this.y) * LATERAL_YARDS;
      const dist = Math.hypot(diffX, diffY);

      if (dist < 0.4) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) {
          this.coastToStop(delta);
          return;
        }
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
    }
  }

  class TightEnd extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'TE', kind: 'skill' });
      this.receiverNumber = config.receiverNumber ?? null;
      this.route = config.route ?? [];
      this.routeIndex = Number.isInteger(config.routeIndex) ? config.routeIndex : 0;
    }

    assignRoute(waypoints) {
      this.route = waypoints || [];
      this.routeIndex = 0;
    }

    runRoute(delta) {
      if (this.hasBall || this.isTackled) return;
      if (!this.route || this.routeIndex >= this.route.length) {
        this.coastToStop(delta);
        return;
      }
      const target = this.route[this.routeIndex];
      const targetX = this.startX + target.dx;
      const targetY = this.startY + target.dy;
      const dist = Math.hypot(targetX - this.x, (targetY - this.y) * LATERAL_YARDS);
      if (dist < 0.4) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) {
          this.coastToStop(delta);
          return;
        }
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
    }
  }

  class RunningBack extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'RB', kind: 'skill' });
      this.receiverNumber = config.receiverNumber ?? null;
      this.route = config.route ?? [];
      this.routeIndex = 0;
      this.routeElapsed = Number.isFinite(config.routeElapsed) ? config.routeElapsed : 0;
    }

    assignRoute(waypoints) {
      this.route = waypoints || [];
      this.routeIndex = 0;
      this.routeElapsed = 0;
    }

    runRoute(delta) {
      if (this.hasBall || this.isTackled) return;
      this.routeElapsed += delta;
      if (!this.route || this.routeIndex >= this.route.length) {
        this.coastToStop(delta);
        return;
      }
      const target = this.route[this.routeIndex];
      const targetX = this.startX + target.dx;
      const targetY = this.startY + target.dy;
      const dist = Math.hypot(targetX - this.x, (targetY - this.y) * LATERAL_YARDS);
      if (dist < 0.4) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) {
          this.coastToStop(delta);
          return;
        }
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
    }

    draw(ctx, coords, pixel, uniform) {
      if (this.phase === 'preplay') {
        const x = Math.round(coords.screenX - 8 * pixel);
        const y = Math.round(coords.screenY - 8 * pixel);
        RetroSprites.drawPrePlay(ctx, x, y, pixel, uniform || this.uniform, 'waiting', this.facingLeft);
        this.drawRouteBadge(ctx, coords, pixel);
        return;
      }
      super.draw(ctx, coords, pixel, uniform);
    }
  }

  class OffensiveLineman extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: config.position || 'OL', kind: 'lineman' });
      this.isCenter = Boolean(config.isCenter);
    }

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);
      RetroSprites.drawPrePlay(ctx, x, y, pixel, u, 'lineman', false);
    }
  }

  // ==========================================
  // POSITION CLASSES: DEFENSE
  // ==========================================
  class DefensiveLineman extends DefensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: config.position || 'DT', kind: 'lineman' });
    }
  }

  class Linebacker extends DefensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: config.position || 'LB', kind: 'skill' });
    }

    draw(ctx, coords, pixel, uniform) {
      if (this.phase === 'preplay') {
        const x = Math.round(coords.screenX - 8 * pixel);
        const y = Math.round(coords.screenY - 8 * pixel);
        RetroSprites.drawPrePlay(ctx, x, y, pixel, uniform || this.uniform, 'waiting', this.facingLeft);
        return;
      }
      super.draw(ctx, coords, pixel, uniform);
    }
  }

  class DefensiveBack extends DefensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: config.position || 'DB', kind: 'skill' });
    }
  }

  const api = {
    Player,
    OffensivePlayer,
    DefensivePlayer,
    Quarterback,
    WideReceiver,
    TightEnd,
    RunningBack,
    OffensiveLineman,
    DefensiveLineman,
    Linebacker,
    DefensiveBack,
    speedMultiplier,
    kindForPosition
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window === 'undefined' ? null : window);

