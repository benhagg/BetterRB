/* The first team is the user-controlled team; the second is its opponent. */
// currently the top bottom and each end zone of the field are these numbers. out of bounds is anything outside of the top / bottom range and a touchdown is anything in the end zone we are going towards
const field = {top: -.02, bottom: 0.95, endZoneL: 2.217644291800185, endZoneR: 101.66747130270615};

window.playGame = function playGame(team1, team2, savedState = null) {
  const dropbackYards = 3;
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
  state.fieldPosition = Number.isFinite(state.fieldPosition) ? Math.max(-10, Math.min(100, state.fieldPosition)) : 22;
  state.playerY = Number.isFinite(state.playerY) ? Math.max(0.08, Math.min(0.92, state.playerY)) : 0.5;
  state.clockSeconds = Number.isFinite(state.clockSeconds) ? Math.max(0, state.clockSeconds) : 900;
  state.scrimmagePosition = Number.isFinite(state.scrimmagePosition) ? state.scrimmagePosition : state.fieldPosition;
  if (!['preplay', 'dropback', 'passing', 'running', 'thrown', 'complete'].includes(state.phase)) {
    state.phase = 'preplay';
    state.scrimmagePosition = state.fieldPosition;
  }
  if (state.phase === 'dropback') {
    const remaining = Math.max(0, dropbackYards - Math.max(0, state.scrimmagePosition - state.fieldPosition));
    state.dropbackRemaining = Number.isFinite(state.dropbackRemaining) ? Math.max(0, Math.min(state.dropbackRemaining, remaining)) : remaining;
  }

  // The original field image runs horizontally, with the sidelines at the top and bottom.
  const fieldImage = RetroSprites.fieldImage;
  const field = { x: 0, y: 0, width: 1305, height: 240, goalLine: 152, pixelsPerYard: 10, topSideline: 32, bottomSideline: 206 };
  let moving = false;
  let facingLeft = false;
  let animationDistance = 0;

  function camera(width, height) {
    const pixel = Math.max(1, Math.min(Math.round(height / 180), Math.floor(width / 360)));
    const lineOffset = 30 * pixel;
    return { pixel, lineOffset, playerX: width / 3 - lineOffset };
  }

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
    state.fieldPosition = Math.max(2.217644291800185, Math.min(101.66747130270615, oldX + dx * speed * delta));
    const lateralRange = field.bottomSideline - field.topSideline;
    state.playerY = Math.max(-0.02, Math.min(0.95, oldY + dy * speed * field.pixelsPerYard / lateralRange * delta));
    const traveled = Math.hypot(state.fieldPosition - oldX, (state.playerY - oldY) * lateralRange / field.pixelsPerYard);
    moving = traveled > 0;
    animationDistance += traveled;
    if (dx) facingLeft = dx < 0;
  }

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    moving = false;
    if (state.phase === 'preplay' || state.phase === 'complete' || state.clockSeconds <= 0) return state;
    if (state.phase === 'dropback') {
      const distance = Math.min(state.dropbackRemaining, 5 * delta);
      state.fieldPosition -= distance;
      state.dropbackRemaining -= distance;
      animationDistance += distance;
      if (state.dropbackRemaining <= 1e-9) {
        state.dropbackRemaining = 0;
        state.phase = state.runAfterDropback ? 'running' : 'passing';
      }
    } else if (state.phase === 'running') {
      movePlayer(delta, input);
    } else if (state.phase === 'thrown') {
      state.pass.progress = Math.min(1, state.pass.progress + delta / state.pass.duration);
      if (state.pass.progress >= 1) state.phase = 'complete';
    }
    if (state.phase !== 'complete') {
      state.clockSeconds = Math.max(0, state.clockSeconds - delta);
    }
    return state;
  }

  function pressSpace() {
    console.log(state);
    if (state.clockSeconds <= 0) return;
    if (state.phase === 'preplay') {
      state.phase = 'dropback';
      state.dropbackRemaining = dropbackYards;
      state.runAfterDropback = false;
    } else if (state.phase === 'dropback') state.runAfterDropback = true;
    else if (state.phase === 'passing') state.phase = 'running';
  }

  function reset() {
    state.fieldPosition = 22;
    state.playerY = 0.5;
    state.clockSeconds = 900;
    state.quarter = 1;
    state.scrimmagePosition = state.fieldPosition;
    state.phase = 'preplay';
    state.dropbackRemaining = 0;
    state.runAfterDropback = false;
    delete state.pass;
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
    const { pixel, lineOffset, playerX } = camera(width, height);
    const playerPosition = field.goalLine + state.fieldPosition * field.pixelsPerYard;
    if (fieldImage.complete && fieldImage.naturalWidth) {
      ctx.save();
      ctx.setTransform(horizontalScale, 0, 0, verticalScale, playerX + lineOffset - playerPosition * horizontalScale, 0);
      ctx.drawImage(fieldImage, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
      ctx.restore();
    }

    const offense = uniformForTeam(team1);
    const defense = uniformForTeam(team2);
    const lineX = playerX + lineOffset + (state.scrimmagePosition - state.fieldPosition) * field.pixelsPerYard * horizontalScale;
    const top = field.topSideline * verticalScale;
    const bottom = field.bottomSideline * verticalScale;
    ctx.fillStyle = 'rgba(92, 174, 255, .65)';
    ctx.fillRect(lineX, top, Math.max(1, pixel), bottom - top);
    // Eleven players per side; other players stay in formation until play logic is added.
    const offensiveFormation = [
      [-.08,-10,'lineman'],[-.04,-10,'lineman'],[0,-10,'center'],[.04,-10,'lineman'],[.08,-10,'lineman'],
      [-.43,-13,'skill'],[.43,-13,'skill'],[.30,-17,'skill'],[-.30,-17,'skill'],[.13,-45,'skill']
    ];
    const defensiveFormation = [
      [-.09,13,'lineman'],[-.03,13,'lineman'],[.03,13,'lineman'],[.09,13,'lineman'],
      [-.30,32,'skill'],[-.10,32,'skill'],[.10,32,'skill'],[.30,32,'skill'],
      [-.42,52,'skill'],[0,60,'skill'],[.42,52,'skill']
    ];
    function drawFormation(players, uniform, flip) {
      for (const [across, offset, kind] of players) {
        const spriteWidth = 16 * pixel;
        const spriteHeight = 16 * pixel;
        const pose = kind === 'center' && state.phase !== 'preplay' ? 'lineman' : kind;
        RetroSprites.drawPrePlay(ctx, lineX + offset * pixel - spriteWidth / 2,
          (top + bottom) / 2 + across * (bottom - top) - spriteHeight / 2, pixel, uniform, pose, flip);
      }
    }
    drawFormation(offensiveFormation, offense, false);
    drawFormation(defensiveFormation, defense, true);
    const x = Math.round(playerX - 8 * pixel);
    const y = Math.round(top + state.playerY * (bottom - top) - 8 * pixel);
    if (state.phase === 'dropback' || state.phase === 'passing') RetroSprites.drawAction(ctx, x, y, pixel, offense, 'dropback', state.phase === 'passing' ? 0 : Math.floor(animationDistance * 2));
    else if (state.phase === 'thrown' || state.phase === 'complete') RetroSprites.drawAction(ctx, x, y, pixel, offense, 'pass', state.pass?.progress < 0.2 ? 0 : 1);
    else if (moving) RetroSprites.drawRunner(ctx, x, y, pixel, offense, Math.floor(animationDistance * 1.2), facingLeft);
    else RetroSprites.drawPrePlay(ctx, x, y, pixel, offense, 'skill', facingLeft);
    if ((state.phase === 'thrown' || state.phase === 'complete') && state.pass && RetroSprites.footballImage.complete && RetroSprites.footballImage.naturalWidth) {
      const p = state.pass.progress;
      const ballX = playerX + (state.pass.fromX + (state.pass.targetX - state.pass.fromX) * p - state.fieldPosition) * field.pixelsPerYard * horizontalScale;
      const ballY = top + (state.pass.fromY + (state.pass.targetY - state.pass.fromY) * p) * (bottom - top);
      ctx.drawImage(RetroSprites.footballImage, ballX - 10 * pixel, ballY - 5 * pixel, 20 * pixel, 10 * pixel);
    }
  }

  return { team1, team2, state, update, pressSpace, draw, reset, uniformForTeam };
};
