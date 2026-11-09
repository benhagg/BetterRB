/* The first team is the user-controlled team; the second is its opponent. */
// currently the top bottom and each end zone of the field are these numbers. out of bounds is anything outside of the top / bottom range and a touchdown is anything in the end zone we are going towards
const fieldBounds = {top: -.02, bottom: 0.95, endZoneL: 2.217644291800185, endZoneR: 101.66747130270615};

window.playGame = function playGame(team1, team2, savedState = null, selectedPlays = {}) {
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

  const defaultDefensiveFormationSlots = [
    { position: 'DT', across: -.09, offset: .5 },
    { position: 'DT', across: -.03, offset: 0 },
    { position: 'DT', across:  .03, offset: 0 },
    { position: 'DT', across:  .09, offset: 0 },
    { position: 'LB', across: -.30, offset: 0 },
    { position: 'LB', across: -.10, offset: 0 },
    { position: 'LB', across:  .10, offset: 0 },
    { position: 'LB', across:  .30, offset: 0 },
    { position: 'DB', across: -.42, offset: 0 },
    { position: 'DB', across:  0.0, offset: 0 },
    { position: 'DB', across:  .42, offset: 0 }
  ];
  const defensiveFormationSlots = selectedPlays.defense?.formation?.defenders || defaultDefensiveFormationSlots;

  function createDefenders() {
    const roster = Array.isArray(team2?.players) ? team2.players : [];
    const used = new Set();

    return defensiveFormationSlots.map((slot, index) => {
      // Look for a player on the opponent's roster matching this position
      let player = roster.find(p => !used.has(p) && String(p.position || '').trim().toUpperCase() === slot.position);

      // If no exact match, match related positions
      if (!player) {
        if (['DT', 'DL'].includes(slot.position)) {
          player = roster.find(p => !used.has(p) && ['DL', 'DE', 'NT', 'EDGE', 'LINEMAN'].includes(String(p.position || '').trim().toUpperCase()));
        } else if (slot.position === 'LB') {
          player = roster.find(p => !used.has(p) && ['ILB', 'MLB', 'OLB', 'SLB', 'WLB'].includes(String(p.position || '').trim().toUpperCase()));
        } else if (slot.position === 'DB') {
          player = roster.find(p => !used.has(p) && ['CB', 'S', 'FS', 'SS', 'NB'].includes(String(p.position || '').trim().toUpperCase()));
        }
      }

      // If still not matched, check if there's an unassigned player at this index on the roster
      if (!player && roster[index] && !used.has(roster[index])) {
        player = roster[index];
      }

      if (player) used.add(player);

      const position = player?.position ? String(player.position).trim().toUpperCase() : slot.position;
      const rating = Number.isFinite(player?.ratings?.speed)
        ? player.ratings.speed
        : (Number.isFinite(player?.rating) ? player.rating : 5);
      const DefenderClass = ['DT', 'DL'].includes(slot.position) ? DefensiveLineman
        : slot.position === 'LB' ? Linebacker : DefensiveBack;
      const defender = new DefenderClass({
        id: player?.id ?? index,
        name: player?.name ?? `${position} ${index + 1}`,
        position,
        rating,
        x: state.scrimmagePosition + slot.offset,
        y: 0.5 + slot.across,
        facingLeft: true
      });
      defender.offset = slot.offset;
      defender.across = slot.across;
      return defender;
    });
  }

  const defaultReceiverConfigs = [
    {
      receiverNumber: 1,
      across: -0.43,
      offset: 0,
      position: 'WR',
      name: 'WR1',
      route: [{ dx: 8, dy: 0 }, { dx: 22, dy: 0.18 }] // Post / In
    },
    {
      receiverNumber: 2,
      across: -0.28,
      offset: 0,
      position: 'TE',
      name: 'TE',
      route: [{ dx: 5, dy: 0 }, { dx: 14, dy: -0.12 }] // Out
    },
    {
      receiverNumber: 3,
      across: 0.28,
      offset: 0,
      position: 'WR',
      name: 'SLOT',
      route: [{ dx: 4, dy: 0 }, { dx: 16, dy: -0.18 }] // Slant
    },
    {
      receiverNumber: 4,
      across: 0.43,
      offset: 0,
      position: 'WR',
      name: 'WR2',
      route: [{ dx: 35, dy: 0 }] // Go / Streak
    }
  ];
  const receiverConfigs = selectedPlays.offense?.formation?.receivers || defaultReceiverConfigs;
  const quarterbackConfig = selectedPlays.offense?.formation?.quarterback || {
    position: 'QB', across: 0, offset: 0, dropback: true
  };
  const runningBackConfig = selectedPlays.offense?.formation?.runningBack || {
    position: 'RB', across: 0.13, offset: -4.5, route: [{ dx: 3, dy: 0.12 }, { dx: 12, dy: 0.12 }]
  };
  const runningBackRoute = runningBackConfig.route;
  const offensiveLineSlots = selectedPlays.offense?.formation?.offensiveLine || [
    { position: 'OL', across: -.08, offset: 0 },
    { position: 'OL', across: -.04, offset: 0 },
    { position: 'OL', across: 0, offset: 0, isCenter: true },
    { position: 'OL', across: .04, offset: 0 },
    { position: 'OL', across: .08, offset: 0 }
  ];

  function createReceivers() {
    const used = new Set();
    return receiverConfigs.map((cfg, index) => {
      let rosterPlayer = team1.players?.find(p => !used.has(p) && p.position === cfg.position);
      if (!rosterPlayer) {
        rosterPlayer = team1.players?.find(p => !used.has(p) && ['WR', 'TE', 'RB'].includes(p.position));
      }
      if (rosterPlayer) used.add(rosterPlayer);
      const rating = Number.isFinite(rosterPlayer?.ratings?.speed) ? rosterPlayer.ratings.speed : 5;
      const ReceiverClass = cfg.position === 'TE' ? TightEnd : WideReceiver;
      const startX = state.scrimmagePosition + cfg.offset;
      const startY = 0.5 + cfg.across;

      {
        const receiver = new ReceiverClass({
          id: rosterPlayer?.id ?? `wr-${cfg.receiverNumber}`,
          name: rosterPlayer?.name ?? cfg.name,
          position: cfg.position,
          rating,
          receiverNumber: cfg.receiverNumber,
          x: startX,
          y: startY,
          route: cfg.route
        });
        receiver.offset = cfg.offset;
        receiver.across = cfg.across;
        return receiver;
      }
    });
  }

  function createQuarterback(saved = {}) {
    const rosterPlayer = team1.players?.find(player => String(player.position).trim().toUpperCase() === 'QB');
    return new Quarterback({
      ...saved,
      id: rosterPlayer?.id ?? 'qb', name: rosterPlayer?.name ?? 'QB', position: 'QB',
      rating: Number.isFinite(rosterPlayer?.ratings?.speed) ? rosterPlayer.ratings.speed : 5,
      x: Number.isFinite(saved.x) ? saved.x : state.scrimmagePosition + quarterbackConfig.offset,
      y: Number.isFinite(saved.y) ? saved.y : 0.5 + quarterbackConfig.across
    });
  }

  function createOffensiveLine() {
    return offensiveLineSlots.map((slot, index) => {
      const lineman = new OffensiveLineman({
        id: `ol-${index}`, name: slot.isCenter ? 'C' : `OL ${index + 1}`,
        position: slot.position || 'OL', rating: 5,
        x: state.scrimmagePosition + slot.offset, y: 0.5 + slot.across, isCenter: Boolean(slot.isCenter)
      });
      lineman.offset = slot.offset;
      lineman.across = slot.across;
      return lineman;
    });
  }

  function createRunningBack() {
    const player = team1.players?.find(item => String(item.position).trim().toUpperCase() === 'RB');
    const back = new RunningBack({
      id: player?.id ?? 'rb', name: player?.name ?? 'RB', position: 'RB',
      rating: Number.isFinite(player?.ratings?.speed) ? player.ratings.speed : 5,
      x: state.scrimmagePosition + runningBackConfig.offset, y: 0.5 + runningBackConfig.across,
      route: runningBackRoute
    });
    back.offset = runningBackConfig.offset;
    back.across = runningBackConfig.across;
    return back;
  }

  state.quarterback = state.quarterback instanceof Quarterback ? state.quarterback : createQuarterback(state.quarterback);
  state.receivers = Array.isArray(state.receivers) && state.receivers.length
    ? state.receivers.map((saved, index) => {
      const config = receiverConfigs[index];
      const ReceiverClass = config?.position === 'TE' ? TightEnd : WideReceiver;
      return new ReceiverClass({ ...config, ...saved });
    }) : createReceivers();
  state.defenders = Array.isArray(state.defenders) && state.defenders.length
    ? state.defenders.map((saved, index) => {
      const slot = defensiveFormationSlots[index];
      const DefenderClass = ['DT', 'DL'].includes(slot?.position) ? DefensiveLineman : slot?.position === 'LB' ? Linebacker : DefensiveBack;
      return new DefenderClass({ ...saved });
    }) : state.phase === 'preplay' ? createDefenders() : [];
  state.offensiveLine = Array.isArray(state.offensiveLine) && state.offensiveLine.length
    ? state.offensiveLine.map((saved, index) => {
      const lineman = new OffensiveLineman({ ...saved });
      lineman.offset = Number.isFinite(saved.offset) ? saved.offset : 0;
      lineman.across = Number.isFinite(saved.across) ? saved.across : offensiveLineSlots[index]?.across ?? 0;
      return lineman;
    }) : createOffensiveLine();
  state.runningBack = state.runningBack instanceof RunningBack ? state.runningBack
    : state.runningBack ? Object.assign(createRunningBack(), state.runningBack) : createRunningBack();

  if (state.phase === 'preplay') {
    state.quarterback.x = state.scrimmagePosition + quarterbackConfig.offset;
    state.quarterback.y = 0.5 + quarterbackConfig.across;
    state.quarterback.phase = 'preplay';
    state.quarterback.hasBall = true;
    state.offensiveLine.forEach(lineman => {
      lineman.x = state.scrimmagePosition + lineman.offset;
      lineman.y = 0.5 + lineman.across;
      lineman.phase = 'preplay';
    });
    state.runningBack.x = state.scrimmagePosition + state.runningBack.offset;
    state.runningBack.y = 0.5 + state.runningBack.across;
    state.runningBack.startX = state.runningBack.x;
    state.runningBack.startY = state.runningBack.y;
    state.runningBack.route = runningBackRoute;
    state.runningBack.routeIndex = 0;
    state.runningBack.routeElapsed = 0;
    state.runningBack.hasBall = false;
    state.runningBack.phase = 'preplay';
    state.defenders.forEach((def, index) => {
      const slot = defensiveFormationSlots[index];
      if (slot) {
        def.x = state.scrimmagePosition + slot.offset;
        def.y = 0.5 + slot.across;
        def.animDistance = 0;
        def.facingLeft = true;
      }
    });
    if (state.receivers) {
      state.receivers.forEach((rec, index) => {
        const cfg = receiverConfigs[index];
        if (cfg) {
          rec.x = state.scrimmagePosition + cfg.offset;
          rec.y = 0.5 + cfg.across;
          rec.startX = rec.x;
          rec.startY = rec.y;
          rec.routeIndex = 0;
          rec.animDistance = 0;
          rec.hasBall = false;
        }
      });
    }
  }

  // The original field image runs horizontally, with the sidelines at the top and bottom.
  const fieldImage = RetroSprites.fieldImage;
  const field = { x: 0, y: 0, width: 1305, height: 240, goalLine: 152, pixelsPerYard: 10, topSideline: 32, bottomSideline: 206 };

  function camera(width, height) {
    const pixel = Math.max(1, Math.min(Math.round(height / 180), Math.floor(width / 360)));
    const lineOffset = 30 * pixel;
    return { pixel, lineOffset, playerX: width / 3 - lineOffset };
  }

  function syncQuarterbackState() {
    state.fieldPosition = state.quarterback.x;
    state.playerY = state.quarterback.y;
  }

  function ballCarrier() {
    return state.receivers.find(receiver => receiver.hasBall)
      || (state.runningBack.hasBall ? state.runningBack : state.quarterback);
  }

  function movePlayer(delta, input) {
    let dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let dy = Number(Boolean(input.down)) - Number(Boolean(input.up));
    const carrier = ballCarrier();
    carrier.move(delta, dx, dy);
    carrier.x = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, carrier.x));
    carrier.y = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, carrier.y));
    state.fieldPosition = carrier.x;
    state.playerY = carrier.y;
  }

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    if (state.phase === 'preplay' || state.phase === 'complete' || state.clockSeconds <= 0) return state;
    if (state.phase === 'dropback') {
      if (state.quarterback.updateDropback(delta)) {
        state.phase = state.runAfterDropback ? 'running' : 'passing';
        state.quarterback.phase = state.phase;
      }
      state.dropbackRemaining = state.quarterback.dropbackRemaining;
      syncQuarterbackState();
    } else if (state.phase === 'running') {
      movePlayer(delta, input);
    } else if (state.phase === 'thrown') {
      state.pass.progress = Math.min(1, state.pass.progress + delta / state.pass.duration);
      if (state.pass.progress >= 1) {
        state.phase = 'running';
        const target = state.receivers.find(receiver => receiver.receiverNumber === state.pass.targetReceiverNumber);
        if (target) {
          state.quarterback.hasBall = false;
          target.catchBall();
          state.fieldPosition = target.x;
          state.playerY = target.y;
        }
      }
    }

    // Update receiver routes during active pass plays
    if (['dropback', 'passing', 'thrown'].includes(state.phase) && state.receivers) {
      for (const rec of state.receivers) {
        rec.runRoute(delta);
      }
      state.runningBack.runRoute(delta);
    }
    if (state.phase !== 'complete') {
      state.clockSeconds = Math.max(0, state.clockSeconds - delta);
    }
    return state;
  }

  // this function starts the play (press space snaps the ball)
  function pressSpace() {
    if (state.clockSeconds <= 0) return;
    if (state.phase === 'preplay') {
      state.runAfterDropback = false;
      if (quarterbackConfig.dropback === false) {
        state.phase = 'passing';
        state.quarterback.phase = 'passing';
        state.dropbackRemaining = 0;
      } else {
        state.phase = 'dropback';
        state.quarterback.dropback(dropbackYards);
        state.dropbackRemaining = state.quarterback.dropbackRemaining;
      }
      state.receivers.forEach(receiver => { receiver.phase = 'running'; });
      state.defenders.forEach(defender => { defender.phase = 'running'; });
      state.offensiveLine.forEach(lineman => { lineman.phase = 'running'; });
    } else if (state.phase === 'dropback') {
      state.runAfterDropback = true;
    } else if (state.phase === 'passing') {
      state.phase = 'running';
      state.quarterback.phase = 'running';
    }
  }

  function throwPass(receiverNum) {
    if (state.phase !== 'passing' && state.phase !== 'dropback') return;
    const targetReceiver = state.receivers?.find(r => r.receiverNumber === receiverNum);
    if (!targetReceiver) return;

    const fromX = state.quarterback.x;
    const fromY = state.quarterback.y;
    const targetX = targetReceiver.x + 1.2;
    const targetY = targetReceiver.y;
    const dist = Math.hypot(targetX - fromX, (targetY - fromY) * 35);
    const duration = Math.max(0.3, Math.min(1.2, dist / 22));

    state.pass = {
      fromX,
      fromY,
      targetX,
      targetY,
      duration,
      progress: 0,
      targetReceiverNumber: targetReceiver.receiverNumber
    };
    state.quarterback.phase = 'thrown';
    state.phase = 'thrown';
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
    state.quarterback = createQuarterback();
    state.defenders = createDefenders();
    state.receivers = createReceivers();
    state.offensiveLine = createOffensiveLine();
    state.runningBack = createRunningBack();
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
    const passProgress = (state.phase === 'thrown' || state.phase === 'complete') && state.pass ? state.pass.progress : null;
    const cameraYard = passProgress === null
      ? state.fieldPosition
      : state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
    const cameraOriginYard = cameraYard - lineOffset / (field.pixelsPerYard * horizontalScale);
    const playerPosition = field.goalLine + cameraYard * field.pixelsPerYard;
    if (fieldImage.complete && fieldImage.naturalWidth) {
      ctx.save();
      ctx.setTransform(horizontalScale, 0, 0, verticalScale, playerX + lineOffset - playerPosition * horizontalScale, 0);
      ctx.drawImage(fieldImage, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
      ctx.restore();
    }

    const offense = uniformForTeam(team1);
    const defense = uniformForTeam(team2);
    const lineX = playerX + (state.scrimmagePosition - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
    const top = field.topSideline * verticalScale;
    const bottom = field.bottomSideline * verticalScale;
    ctx.fillStyle = 'rgba(92, 174, 255, .65)';
    ctx.fillRect(lineX, top, Math.max(1, pixel), bottom - top);
    const screenCoordinates = actor => ({
      screenX: playerX + (actor.x - cameraOriginYard) * field.pixelsPerYard * horizontalScale,
      screenY: top + actor.y * (bottom - top)
    });
    if (state.phase === 'preplay') {
      const drawRoute = player => {
        if (!player.route?.length) return;
        ctx.save();
        ctx.strokeStyle = '#ffe35c';
        ctx.lineWidth = Math.max(1, pixel);
        ctx.setLineDash([4 * pixel, 3 * pixel]);
        ctx.beginPath();
        const start = screenCoordinates(player);
        ctx.moveTo(start.screenX, start.screenY);
        for (const waypoint of player.route) {
          const point = screenCoordinates({ x: player.startX + waypoint.dx, y: player.startY + waypoint.dy });
          ctx.lineTo(point.screenX, point.screenY);
        }
        ctx.stroke();
        ctx.restore();
      };
      state.receivers.forEach(drawRoute);
      drawRoute(state.runningBack);
    }
    for (const lineman of state.offensiveLine) lineman.draw(ctx, screenCoordinates(lineman), pixel, offense);
    state.runningBack.draw(ctx, screenCoordinates(state.runningBack), pixel, offense);
    for (const receiver of state.receivers) receiver.draw(ctx, screenCoordinates(receiver), pixel, offense);
    for (const defender of state.defenders) defender.draw(ctx, screenCoordinates(defender), pixel, defense);
    state.quarterback.draw(ctx, screenCoordinates(state.quarterback), pixel, offense);
    if (passProgress !== null && RetroSprites.footballImage.complete && RetroSprites.footballImage.naturalWidth) {
      const ballX = playerX + (cameraYard - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
      const ballY = top + (state.pass.fromY + (state.pass.targetY - state.pass.fromY) * passProgress) * (bottom - top);
      ctx.drawImage(RetroSprites.footballImage, ballX - 10 * pixel, ballY - 5 * pixel, 20 * pixel, 10 * pixel);
    }
  }

  return { team1, team2, state, update, pressSpace, throwPass, draw, reset, uniformForTeam };
};
