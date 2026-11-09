(function (root) {
  const LATERAL_YARDS = 17; // Playable sideline-to-sideline width used for movement scaling.

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
      this.rating = Number.isFinite(config.rating) ? config.rating : 5;
      this.speedMultiplier = speedMultiplier(this.position);
      // Global tempo is intentionally half-speed while the core play systems are built.
      this.speed = (6 + this.rating * 0.2) * this.speedMultiplier * 0.5;
      this.kind = config.kind ?? kindForPosition(this.position);

      this.x = Number.isFinite(config.x) ? config.x : 22;
      this.y = Number.isFinite(config.y) ? config.y : 0.5;
      this.startX = Number.isFinite(config.startX) ? config.startX : this.x;
      this.startY = Number.isFinite(config.startY) ? config.startY : this.y;

      this.animDistance = 0;
      this.facingLeft = Boolean(config.facingLeft);
      this.isMoving = false;
      this.phase = config.phase ?? 'preplay';
    }

    // Class instances are re-created when a saved game loads. Keep saved data plain.
    toJSON() {
      return {
        id: this.id, name: this.name, position: this.position, rating: this.rating,
        kind: this.kind, x: this.x, y: this.y, startX: this.startX, startY: this.startY,
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
    }

    run(delta, targetX, targetY) {
      const dx = targetX - this.x;
      const dyYards = (targetY - this.y) * LATERAL_YARDS;
      const dist = Math.hypot(dx, dyYards);

      if (dist > 0.05) {
        const vx = dx / dist;
        const vyYards = dyYards / dist;
        const step = Math.min(dist, this.speed * delta);

        this.x += vx * step;
        this.y += (vyYards / LATERAL_YARDS) * step;
        this.animDistance += step;
        this.facingLeft = vx < 0;
        this.isMoving = true;
      } else {
        this.isMoving = false;
      }
    }

    move(delta, vx, vy) {
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        const dirX = vx / len;
        const dirY = vy / len;
        const step = this.speed * delta;
        this.x += dirX * step;
        this.y += (dirY * step) / LATERAL_YARDS;
        this.animDistance += step;
        this.facingLeft = dirX < 0;
        this.isMoving = true;
      } else {
        this.isMoving = false;
      }
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
    }

    dive() {
      if (this.isDiving || this.isTackled) return;
      this.isDiving = true;
      this.diveProgress = 0;
    }

    catchBall() {
      this.hasBall = true;
      this.phase = 'running';
    }

    fumble() {
      this.hasBall = false;
    }

    tackled() {
      this.isTackled = true;
      this.isMoving = false;
      this.phase = 'tackled';
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

    draw(ctx, coords, pixel, uniform) {
      const u = uniform || this.uniform;
      const x = Math.round(coords.screenX - 8 * pixel);
      const y = Math.round(coords.screenY - 8 * pixel);

      if (this.isTackled) {
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

      if (this.phase === 'dropback' || this.phase === 'passing') {
        const frame = this.phase === 'passing' ? 0 : Math.floor(this.animDistance * 2) % 2;
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'dropback', frame);
      } else if (this.phase === 'thrown') {
        RetroSprites.drawAction(ctx, x, y, pixel, u, 'pass', 1);
      } else {
        super.draw(ctx, coords, pixel, uniform);
      }
    }
  }

  class WideReceiver extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'WR', kind: 'skill' });
      this.receiverNumber = config.receiverNumber ?? 1;
      this.route = config.route ?? [];
      this.routeIndex = Number.isInteger(config.routeIndex) ? config.routeIndex : 0;
    }

    assignRoute(waypoints) {
      this.route = Array.isArray(waypoints) ? waypoints : [];
      this.routeIndex = Number.isInteger(config.routeIndex) ? config.routeIndex : 0;
    }

    runRoute(delta) {
      if (this.hasBall || this.isTackled) return;
      if (!this.route || this.routeIndex >= this.route.length) {
        this.isMoving = false;
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
          this.isMoving = false;
          return;
        }
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
    }

    drawRouteBadge(ctx, coords, pixel) {
      if (this.phase === 'preplay' || this.hasBall || this.isTackled) return;
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
      super.draw(ctx, coords, pixel, uniform);
      this.drawRouteBadge(ctx, coords, pixel);
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
        this.isMoving = false;
        return;
      }
      const target = this.route[this.routeIndex];
      const targetX = this.startX + target.dx;
      const targetY = this.startY + target.dy;
      const dist = Math.hypot(targetX - this.x, (targetY - this.y) * LATERAL_YARDS);
      if (dist < 0.4) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) return;
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
    }

    draw(ctx, coords, pixel, uniform) {
      super.draw(ctx, coords, pixel, uniform);
      if (this.receiverNumber && !this.hasBall && this.phase !== 'preplay' && !this.isTackled) {
        ctx.save();
        const bx = Math.round(coords.screenX);
        const by = Math.round(coords.screenY - 14 * pixel);
        ctx.fillStyle = '#ffea00';
        ctx.beginPath();
        ctx.arc(bx, by, 6 * pixel, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1, pixel);
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${8 * pixel}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.receiverNumber), bx, by + pixel);
        ctx.restore();
      }
    }
  }

  class RunningBack extends OffensivePlayer {
    constructor(config = {}) {
      super({ ...config, position: 'RB', kind: 'skill' });
      this.receiverNumber = config.receiverNumber ?? null;
      this.route = config.route ?? [];
      this.routeIndex = 0;
    }

    assignRoute(waypoints) {
      this.route = waypoints || [];
      this.routeIndex = 0;
    }

    runRoute(delta) {
      if (this.hasBall || this.isTackled) return;
      if (!this.route || this.routeIndex >= this.route.length) {
        this.isMoving = false;
        return;
      }
      const target = this.route[this.routeIndex];
      const targetX = this.startX + target.dx;
      const targetY = this.startY + target.dy;
      const dist = Math.hypot(targetX - this.x, (targetY - this.y) * LATERAL_YARDS);
      if (dist < 0.4) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) return;
      }
      this.phase = 'running';
      this.run(delta, targetX, targetY);
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
      const pose = this.isCenter && this.phase === 'preplay' ? 'center' : 'lineman';
      RetroSprites.drawPrePlay(ctx, x, y, pixel, u, pose, false);
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

