/* The first team is the user-controlled team; the second is its opponent. */
window.playGame = function playGame(team1, team2, savedState = null) {
  const state = {
    score1: 0,
    score2: 0,
    fieldPosition: 22,
    playerY: 0.5,
    clockSeconds: 900,
    quarter: 1,
    isHome: true,
    phase: 'preplay',
    ...savedState,
    team1,
    team2
  };
  state.fieldPosition = Number.isFinite(state.fieldPosition) ? Math.max(0, Math.min(100, state.fieldPosition)) : 22;
  state.playerY = Number.isFinite(state.playerY) ? Math.max(0.08, Math.min(0.92, state.playerY)) : 0.5;
  state.clockSeconds = Number.isFinite(state.clockSeconds) ? Math.max(0, state.clockSeconds) : 900;
  state.scrimmagePosition = Number.isFinite(state.scrimmagePosition) ? state.scrimmagePosition : state.fieldPosition;
  if (state.phase !== 'active') state.phase = 'preplay';

  // The original field image runs horizontally, with the sidelines at the top and bottom.
  const fieldImage = RetroSprites.fieldImage;
  const field = { x: 0, y: 0, width: 1305, height: 240, goalLine: 152, pixelsPerYard: 10, topSideline: 32, bottomSideline: 206 };
  let moving = false;
  let facingLeft = false;
  let animationDistance = 0;

  function movePlayer(delta, input) {
    let dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let dy = Number(Boolean(input.down)) - Number(Boolean(input.up));
    const length = Math.hypot(dx, dy);
    if (length) { dx /= length; dy /= length; }
    const oldX = state.fieldPosition;
    const oldY = state.playerY;
    // The controlled player is the quarterback until player selection is added.
    const quarterback = team1.players?.find(player => String(player.position).trim().toUpperCase() === 'QB');
    const rating = Number.isFinite(quarterback?.ratings?.speed) ? Math.max(0, Math.min(10, quarterback.ratings.speed)) : 5;
    const speed = 4 + rating * 0.8; // 4–12 yards per second; rating 5 keeps the previous speed.
    state.fieldPosition = Math.max(0, Math.min(100, oldX + dx * speed * delta));
    const lateralRange = field.bottomSideline - field.topSideline;
    state.playerY = Math.max(0.08, Math.min(0.92, oldY + dy * speed * field.pixelsPerYard / lateralRange * delta));
    const traveled = Math.hypot(state.fieldPosition - oldX, (state.playerY - oldY) * lateralRange / field.pixelsPerYard);
    moving = traveled > 0;
    animationDistance += traveled;
    if (dx) facingLeft = dx < 0;
  }

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    if (state.phase === 'preplay') {
      if (!input.up && !input.down && !input.left && !input.right) return state;
      state.phase = 'active';
    }
    moving = false;
    if (state.clockSeconds > 0) {
      movePlayer(delta, input);
      state.clockSeconds = Math.max(0, state.clockSeconds - delta);
    }
    return state;
  }

  function reset() {
    state.fieldPosition = 22;
    state.playerY = 0.5;
    state.clockSeconds = 900;
    state.quarter = 1;
    state.scrimmagePosition = state.fieldPosition;
    state.phase = 'preplay';
    moving = false;
    facingLeft = false;
    animationDistance = 0;
    return state;
  }

  function uniformForTeam(team) {
    if (team !== team1 && team !== team2) throw new Error('Team is not part of this game');
    // Show the player's team in its home colors and the opponent in away colors.
    const style = team === team1 ? 'home' : 'away';
    const uniform = team.colors?.[style];
    if (!uniform) throw new Error(`Missing ${style} uniform for team ${team.id}`);
    return uniform;
  }

  function draw(ctx, width, height) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#377c08';
    ctx.fillRect(0, 0, width, height);

    const horizontalScale = width / 300;
    const verticalScale = height / field.height;
    const pixel = Math.max(1, Math.min(Math.round(height / 180), Math.floor(width / 360)));
    const lineOffset = 30 * pixel;
    const playerPosition = field.goalLine + state.fieldPosition * field.pixelsPerYard;
    if (fieldImage.complete && fieldImage.naturalWidth) {
      ctx.save();
      ctx.setTransform(horizontalScale, 0, 0, verticalScale, width / 2 + lineOffset - playerPosition * horizontalScale, 0);
      ctx.drawImage(fieldImage, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
      ctx.restore();
    }

    const offense = uniformForTeam(team1);
    const defense = uniformForTeam(team2);
    const lineX = width / 2 + lineOffset + (state.scrimmagePosition - state.fieldPosition) * field.pixelsPerYard * horizontalScale;
    const top = field.topSideline * verticalScale;
    const bottom = field.bottomSideline * verticalScale;
    ctx.fillStyle = 'rgba(92, 174, 255, .65)';
    ctx.fillRect(lineX, top, Math.max(1, pixel), bottom - top);
    // Eleven players per side; other players stay in formation until play logic is added.
    const offensiveFormation = [
      [-.16,-10,'lineman'],[-.08,-10,'lineman'],[0,-10,'center'],[.08,-10,'lineman'],[.16,-10,'lineman'],
      [-.43,-13,'skill'],[.43,-13,'skill'],[.30,-17,'skill'],[-.30,-17,'skill'],[.13,-45,'skill']
    ];
    const defensiveFormation = [
      [-.18,13,'lineman'],[-.06,13,'lineman'],[.06,13,'lineman'],[.18,13,'lineman'],
      [-.30,32,'skill'],[-.10,32,'skill'],[.10,32,'skill'],[.30,32,'skill'],
      [-.42,52,'skill'],[0,60,'skill'],[.42,52,'skill']
    ];
    function drawFormation(players, uniform, flip) {
      for (const [across, offset, kind] of players) {
        const spriteWidth = 16 * pixel;
        const spriteHeight = 16 * pixel;
        RetroSprites.drawPrePlay(ctx, lineX + offset * pixel - spriteWidth / 2,
          (top + bottom) / 2 + across * (bottom - top) - spriteHeight / 2, pixel, uniform, kind, flip);
      }
    }
    drawFormation(offensiveFormation, offense, false);
    drawFormation(defensiveFormation, defense, true);
    const x = Math.round(width / 2 - 8 * pixel);
    const y = Math.round(top + state.playerY * (bottom - top) - 8 * pixel);
    if (!moving) RetroSprites.drawPrePlay(ctx, x, y, pixel, offense, 'skill', facingLeft);
    else RetroSprites.drawRunner(ctx, x, y, pixel, offense, Math.floor(animationDistance * 1.2), facingLeft);
  }

  return { team1, team2, state, update, draw, reset, uniformForTeam };
};
