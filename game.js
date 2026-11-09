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
    ...savedState,
    team1,
    team2
  };
  state.fieldPosition = Number.isFinite(state.fieldPosition) ? Math.max(0, Math.min(100, state.fieldPosition)) : 22;
  state.playerY = Number.isFinite(state.playerY) ? Math.max(0.08, Math.min(0.92, state.playerY)) : 0.5;
  state.clockSeconds = Number.isFinite(state.clockSeconds) ? Math.max(0, state.clockSeconds) : 900;

  // This atlas contains the entire field: each 10 yards occupies 100 source pixels.
  const atlas = RetroSprites.atlas;
  const field = { x: 0, y: 30, width: 1305, height: 180, goalLine: 152, pixelsPerYard: 10 };

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    // Forward motion is automatic while W/S steer across the field.
    if (state.fieldPosition < 100 && state.clockSeconds > 0) {
      state.fieldPosition = Math.min(100, state.fieldPosition + 5 * delta);
      state.clockSeconds = Math.max(0, state.clockSeconds - delta);
    }
    const direction = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    state.playerY = Math.max(0.08, Math.min(0.92, state.playerY + direction * 0.55 * delta));
    return state;
  }

  function reset() {
    state.fieldPosition = 22;
    state.playerY = 0.5;
    state.clockSeconds = 900;
    state.quarter = 1;
    return state;
  }

  function draw(ctx, width, height) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#377c08';
    ctx.fillRect(0, 0, width, height);

    const scale = height / field.height;
    const playerX = field.goalLine + state.fieldPosition * field.pixelsPerYard;
    const left = width / 2 - playerX * scale;
    if (atlas.complete && atlas.naturalWidth) {
      ctx.drawImage(atlas, field.x, field.y, field.width, field.height, left, 0, field.width * scale, height);
    }

    const uniform = state.isHome ? team1.colors?.home : team1.colors?.away;
    const pixel = Math.max(2, Math.round(height / 180));
    const spriteWidth = 13 * pixel;
    const spriteHeight = 21 * pixel;
    const x = Math.round(width / 2 - spriteWidth / 2);
    const y = Math.round(state.playerY * height - spriteHeight / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x + pixel, y + spriteHeight - 2 * pixel, 11 * pixel, 3 * pixel);
    RetroSprites.drawRunner(ctx, x, y, pixel, uniform || team1.colors, Math.floor(state.fieldPosition * 1.2) % 2);
  }

  return { team1, team2, state, update, draw, reset };
};
