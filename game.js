/* The first team is the user-controlled team; the second is its opponent. */
// currently the top bottom and each end zone of the field are these numbers. out of bounds is anything outside of the top / bottom range and a touchdown is anything in the end zone we are going towards
const fieldBounds = {top: -.02, bottom: 0.95, endZoneL: 2.217644291800185, endZoneR: 101.66747130270615};
const cameraTrailingYards = 5;
const runnerTrailingYards = 15;
const lateralYards = 17;

window.playGame = function playGame(team1, team2, savedState = null, selectedPlays = {}) {
  const dropbackYards = 3;
  const playType = String(selectedPlays.offense?.playType || selectedPlays.offense?.playtype || selectedPlays.offense?.type || 'pass').toLowerCase();
  const state = {
    score1: 0,
    score2: 0,
    fieldPosition: 25,
    playerY: 0.5,
    clockSeconds: 900,
    quarter: 1,
    isHome: true,
    phase: 'preplay',
    playType,
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
      const DefenderClass = ['DT', 'DL'].includes(slot.position) ? DefensiveLineman
        : slot.position === 'LB' ? Linebacker : DefensiveBack;
      const defender = new DefenderClass({
        id: player?.id ?? index,
        name: player?.name ?? `${position} ${index + 1}`,
        position,
        ratings: player?.ratings || { speed: 5, agility: 5, strength: 5, tackling: 5 },
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
      receiverNumber: 4,
      across: 0.28,
      offset: 0,
      position: 'WR',
      name: 'SLOT',
      route: [{ dx: 4, dy: 0 }, { dx: 16, dy: -0.18 }] // Slant
    },
    {
      receiverNumber: 5,
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
    position: 'RB', across: 0.13, offset: -4.5, receiverNumber: 3, route: [{ dx: 3, dy: 0.12 }, { dx: 12, dy: 0.12 }]
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
    const isRunPlay = playType === 'run';
    const used = new Set();
    return receiverConfigs.map((cfg, index) => {
      let rosterPlayer = team1.players?.find(p => !used.has(p) && p.position === cfg.position);
      if (!rosterPlayer) {
        rosterPlayer = team1.players?.find(p => !used.has(p) && ['WR', 'TE', 'RB'].includes(p.position));
      }
      if (rosterPlayer) used.add(rosterPlayer);
      const ReceiverClass = cfg.position === 'TE' ? TightEnd : WideReceiver;
      const startX = state.scrimmagePosition + cfg.offset;
      const startY = 0.5 + cfg.across;

      {
        const receiver = new ReceiverClass({
          id: rosterPlayer?.id ?? `wr-${cfg.receiverNumber ?? index + 1}`,
          name: rosterPlayer?.name ?? cfg.name,
          position: cfg.position,
          ratings: rosterPlayer?.ratings || { speed: 5, agility: 5, strength: 5, catching: 5 },
          receiverNumber: isRunPlay ? null : (cfg.receiverNumber ?? null),
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
    const qb = new Quarterback({
      ...saved,
      id: rosterPlayer?.id ?? 'qb', name: rosterPlayer?.name ?? 'QB', position: 'QB',
      ratings: saved.ratings || saved.rating || rosterPlayer?.ratings || { speed: 5, agility: 5, strength: 5, accuracy: 5 },
      x: Number.isFinite(saved.x) ? saved.x : state.scrimmagePosition + (quarterbackConfig.offset ?? -3),
      y: Number.isFinite(saved.y) ? saved.y : 0.5 + (quarterbackConfig.across ?? 0)
    });
    qb.offset = quarterbackConfig.offset ?? -3;
    qb.across = quarterbackConfig.across ?? 0;
    return qb;
  }

  function createOffensiveLine() {
    return offensiveLineSlots.map((slot, index) => {
      const lineman = new OffensiveLineman({
        id: `ol-${index}`, name: slot.isCenter ? 'C' : `OL ${index + 1}`,
        position: slot.position || 'OL',
        ratings: { speed: 5, agility: 5, strength: 5, blocking: 5 },
        x: state.scrimmagePosition + slot.offset, y: 0.5 + slot.across, isCenter: Boolean(slot.isCenter)
      });
      lineman.offset = slot.offset;
      lineman.across = slot.across;
      return lineman;
    });
  }

  function createRunningBack() {
    const isRunPlay = playType === 'run';
    const player = team1.players?.find(item => String(item.position).trim().toUpperCase() === 'RB');
    const back = new RunningBack({
      id: player?.id ?? 'rb', name: player?.name ?? 'RB', position: 'RB',
      ratings: player?.ratings || { speed: 5, agility: 5, strength: 5, catching: 5 },
      x: state.scrimmagePosition + runningBackConfig.offset, y: 0.5 + runningBackConfig.across,
      receiverNumber: isRunPlay ? null : (runningBackConfig.receiverNumber ?? 3),
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
  const field = { x: 0, y: 0, width: 1305, height: 240, goalLine: 152, pixelsPerYard: 10, topSideline: 32, bottomSideline: 206 };

  function syncQuarterbackState() {
    state.fieldPosition = state.quarterback.x;
    state.playerY = state.quarterback.y;
  }

  function ballCarrier() {
    return state.receivers.find(receiver => receiver.hasBall)
      || (state.runningBack.hasBall ? state.runningBack : state.quarterback);
  }

  function getBallCarrier() {
    if (state.phase === 'thrown') return null;
    const receiverWithBall = state.receivers.find(receiver => receiver.hasBall);
    if (receiverWithBall) return receiverWithBall;
    if (state.runningBack?.hasBall) return state.runningBack;
    if (state.quarterback?.hasBall) return state.quarterback;
    return null;
  }

  function passTarget(receiverNumber) {
    return [...state.receivers, state.runningBack].find(player => player.receiverNumber === receiverNumber);
  }

  function quarterbackIsBehindLineOfScrimmage() {
    return state.quarterback.x < state.scrimmagePosition;
  }

  const camera = GameCamera.create({ state, field, fieldBounds, cameraTrailingYards, runnerTrailingYards, ballCarrier });
  const passing = GamePassing.create({ state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage });

  function isTargetInFrontCone(player, targetX, targetY, maxDist = 5, coneAngleDeg = 60) {
    const dx = targetX - player.x;
    const dy = (targetY - player.y) * lateralYards;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    if (dist < 0.05) return true;

    // When the player is stopped, they have 360-degree awareness and can catch in all directions
    const isMoving = Boolean(player.isMoving) && Math.hypot(player.velocityX || 0, (player.velocityY || 0) * lateralYards) > 0.05;
    if (!isMoving) return true;

    let forwardX = Number(player.lastDirX);
    let forwardY = Number(player.lastDirY);
    if (!Number.isFinite(forwardX) || !Number.isFinite(forwardY) || Math.hypot(forwardX, forwardY) < 0.001) {
      forwardX = player.facingLeft ? -1 : 1;
      forwardY = 0;
    } else {
      const len = Math.hypot(forwardX, forwardY);
      forwardX /= len;
      forwardY /= len;
    }

    const toTargetX = dx / dist;
    const toTargetY = dy / dist;
    const dot = forwardX * toTargetX + forwardY * toTargetY;
    const halfAngleRad = (coneAngleDeg / 2) * (Math.PI / 180);
    const minCos = Math.cos(halfAngleRad);

    return dot >= minCos;
  }

  function blockNearestDefender(player, delta) {
    let nearestDefender = null;
    let minDefenderDist = Infinity;
    if (state.defenders && state.defenders.length) {
      for (const defender of state.defenders) {
        const dist = Math.hypot(defender.x - player.x, (defender.y - player.y) * lateralYards);
        if (dist < minDefenderDist) {
          minDefenderDist = dist;
          nearestDefender = defender;
        }
      }
    }
    if (nearestDefender) {
      player.run(delta, nearestDefender.x, nearestDefender.y);
      player.block(nearestDefender);
    } else {
      player.runRoute(delta);
    }
  }

  function movePlayer(delta, input) {
    const hasInput = Boolean(input.right || input.left || input.down || input.up);
    let dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let dy = Number(Boolean(input.down)) - Number(Boolean(input.up));
    const carrier = ballCarrier();
    if (carrier) {
      if (hasInput) {
        carrier.autoRun = null;
        if (dx !== 0 || dy !== 0) {
          carrier.move(delta, dx, dy);
        } else {
          carrier.coastToStop(delta);
        }
      } else if (carrier.autoRun) {
        carrier.move(delta, carrier.autoRun.vx, carrier.autoRun.vy);
      } else {
        carrier.coastToStop(delta);
      }
      carrier.x = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, carrier.x));
      carrier.y = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, carrier.y));
      state.fieldPosition = carrier.x;
      state.playerY = carrier.y;
    }
  }

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    if (state.phase === 'preplay' || state.phase === 'complete' || state.clockSeconds <= 0) return state;
    if (state.phase === 'dropback') {
      if (state.quarterback.updateDropback(delta)) {
        state.phase = 'passing';
        state.quarterback.phase = state.phase;
      }
      state.dropbackRemaining = state.quarterback.dropbackRemaining;
      syncQuarterbackState();
    } else if (state.phase === 'passing' || state.phase === 'running') {
      if (state.playType === 'run' && !state.runningBack.hasBall) {
        state.runningBack.runRoute(delta);
        if (state.runningBack.x >= state.quarterback.x - 0.1) {
          state.quarterback.hasBall = false;
          let catchDirX = state.runningBack.velocityX;
          let catchDirY = state.runningBack.velocityY * lateralYards;
          if (!Number.isFinite(catchDirX) || !Number.isFinite(catchDirY) || Math.hypot(catchDirX, catchDirY) < 0.1) {
            catchDirX = Number.isFinite(state.runningBack.lastDirX) ? state.runningBack.lastDirX : 1;
            catchDirY = Number.isFinite(state.runningBack.lastDirY) ? state.runningBack.lastDirY : 0;
          }
          if (Math.hypot(catchDirX, catchDirY) < 0.1) {
            catchDirX = 1;
            catchDirY = 0;
          }
          state.runningBack.catchBall({ vx: catchDirX, vy: catchDirY });
          state.fieldPosition = state.runningBack.x;
          state.playerY = state.runningBack.y;
        }
      } else if (state.throwWindup) {
        if (state.throwWindup.wasMoving) {
          const hasInput = Boolean(input.right || input.left || input.down || input.up);
          if (hasInput) {
            movePlayer(delta, input);
          } else {
            state.quarterback.move(delta, state.throwWindup.runDirX, state.throwWindup.runDirY);
            state.quarterback.x = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, state.quarterback.x));
            state.quarterback.y = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, state.quarterback.y));
            state.fieldPosition = state.quarterback.x;
            state.playerY = state.quarterback.y;
          }
        }
      } else {
        movePlayer(delta, input);
      }
    } else if (state.phase === 'thrown') {
      state.pass.progress = Math.min(1, state.pass.progress + delta / state.pass.duration);
      const currentHeight = passing.throwHeightAt(state.pass.progress, state.pass.distanceYards, state.pass.targetHeightFeet);
      state.pass.heightFeet = currentHeight;
      state.pass.heightfeet = currentHeight;
      for (const player of [...state.receivers, state.runningBack]) {
        if (!player.hasBall) {
          const distToTarget = Math.hypot(state.pass.targetX - player.x, (state.pass.targetY - player.y) * lateralYards);
          if (state.pass.targetReceiverNumber && player.receiverNumber === state.pass.targetReceiverNumber) {
            if (state.pass.wasTargetMoving || distToTarget <= 5) {
              player.run(delta, state.pass.targetX, state.pass.targetY);
            } else {
              player.velocityX = 0;
              player.velocityY = 0;
              player.isMoving = false;
            }
          } else if (isTargetInFrontCone(player, state.pass.targetX, state.pass.targetY, 5, 60)) {
            player.run(delta, state.pass.targetX, state.pass.targetY);
          } else {
            blockNearestDefender(player, delta);
          }
        }
      }
      if (state.pass.progress >= 1) {
        let target = null;
        if (state.pass.targetReceiverNumber) {
          target = passTarget(state.pass.targetReceiverNumber);
        } else {
          const eligible = [...state.receivers, state.runningBack];
          let bestDist = Infinity;
          let bestCandidate = null;
          for (const player of eligible) {
            const dist = Math.hypot(state.pass.targetX - player.x, (state.pass.targetY - player.y) * lateralYards);
            if (dist < bestDist) {
              bestDist = dist;
              bestCandidate = player;
            }
          }
          if (bestCandidate && bestDist <= 2.5) {
            target = bestCandidate;
          }
        }
        if (target) {
          state.phase = 'running';
          state.quarterback.hasBall = false;
          target.catchBall({ vx: 1, vy: 0 });
          state.fieldPosition = target.x;
          state.playerY = target.y;
          movePlayer(0, input);
        } else {
          state.phase = 'complete';
          state.quarterback.hasBall = false;
        }
      }
    }

    // Update receivers and blockers (blocking continues in-flight and after-flight to end of play)
    if (state.phase === 'running') {
      const eligibleBlockers = [...(state.receivers || [])];
      if (state.runningBack && (state.playType !== 'run' || state.runningBack.hasBall)) {
        eligibleBlockers.push(state.runningBack);
      }
      for (const player of eligibleBlockers) {
        if (!player.hasBall) {
          blockNearestDefender(player, delta);
        }
      }
    } else if (['dropback', 'passing'].includes(state.phase)) {
      if (state.receivers) {
        for (const rec of state.receivers) {
          rec.runRoute(delta);
        }
      }
      if (state.playType !== 'run' && !state.runningBack.hasBall) {
        state.runningBack.runRoute(delta);
      }
    }
    passing.updateWindup(delta);
    if (state.phase !== 'complete') {
      state.clockSeconds = Math.max(0, state.clockSeconds - delta);
    }
    return state;
  }

  // this function starts the play (press space snaps the ball)
  function pressSpace() {
    if (state.clockSeconds <= 0) return;
    if (state.phase === 'preplay') {
      if (state.playType === 'run') {
        state.phase = 'running';
        state.quarterback.phase = 'passing';
        state.dropbackRemaining = 0;
      } else if (quarterbackConfig.dropback === false) {
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
      state.runningBack.phase = 'running';
    }
  }

  function canvasCoordsToField(canvasX, canvasY, width = 960, height = 540) {
    return camera.canvasCoordsToField(canvasX, canvasY, width, height);
  }

  function throwPassToLocation(targetX, targetY) {
    return passing.throwPassToLocation(targetX, targetY);
  }

  function throwPassToCanvasCoords(canvasX, canvasY, width = 960, height = 540) {
    const coords = canvasCoordsToField(canvasX, canvasY, width, height);
    throwPassToLocation(coords.x, coords.y);
  }

  function throwPass(target, maybeY) {
    return passing.throwPass(target, maybeY);
  }

  function reset() {
    state.fieldPosition = 22;
    state.playerY = 0.5;
    state.clockSeconds = 900;
    state.quarter = 1;
    state.scrimmagePosition = state.fieldPosition;
    state.phase = 'preplay';
    state.playType = String(selectedPlays.offense?.playType || selectedPlays.offense?.playtype || selectedPlays.offense?.type || 'pass').toLowerCase();
    state.dropbackRemaining = 0;
    delete state.pass;
    delete state.throwWindup;
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

  const renderer = GameRenderer.create({
    state,
    field,
    camera,
    team1,
    team2,
    uniformForTeam,
    throwHeightAt: passing.throwHeightAt,
    getBallCarrier
  });

  function draw(ctx, width, height) {
    return renderer.draw(ctx, width, height);
  }

  function setOffensivePlay(play) {
    if (state.phase !== 'preplay' || !play) return;
    selectedPlays.offense = play;
    state.playType = String(play.playtype || play.playType || play.type || 'pass').toLowerCase();
    const isRun = state.playType === 'run';
    const qbCfg = play.formation?.quarterback || { position: 'QB', across: 0, offset: -3, dropback: false };
    const rbCfg = play.formation?.runningBack || { position: 'RB', across: 0.13, offset: -4.5 };
    const recCfgs = play.formation?.receivers || [];

    // Reconfigure Quarterback
    state.quarterback.offset = qbCfg.offset ?? -3;
    state.quarterback.across = qbCfg.across ?? 0;
    state.quarterback.x = state.scrimmagePosition + state.quarterback.offset;
    state.quarterback.y = 0.5 + state.quarterback.across;
    state.quarterback.phase = 'preplay';
    state.quarterback.hasBall = true;
    state.quarterback.animDistance = 0;
    state.quarterback.isMoving = false;

    // Reconfigure Running Back
    state.runningBack.offset = rbCfg.offset ?? -4.5;
    state.runningBack.across = rbCfg.across ?? 0.13;
    state.runningBack.startX = state.scrimmagePosition + state.runningBack.offset;
    state.runningBack.startY = 0.5 + state.runningBack.across;
    state.runningBack.x = state.runningBack.startX;
    state.runningBack.y = state.runningBack.startY;
    state.runningBack.phase = 'preplay';
    state.runningBack.hasBall = false;
    state.runningBack.receiverNumber = isRun ? null : (rbCfg.receiverNumber ?? null);
    state.runningBack.assignRoute(rbCfg.route || []);

    // Reconfigure Receivers
    state.receivers = recCfgs.map((config, index) => {
      const ReceiverClass = config?.position === 'TE' ? TightEnd : WideReceiver;
      const rec = new ReceiverClass({
        id: `rec-${config.receiverNumber ?? index + 1}`,
        name: `Receiver ${config.receiverNumber ?? index + 1}`,
        position: config.position || 'WR',
        ratings: state.receivers?.[index]?.ratings || { speed: 5, agility: 5, strength: 5, catching: 5 },
        x: state.scrimmagePosition + (config.offset ?? -0.5),
        y: 0.5 + (config.across ?? 0),
        receiverNumber: isRun ? null : (config.receiverNumber ?? null),
        route: config.route || []
      });
      rec.offset = config.offset ?? -0.5;
      rec.across = config.across ?? 0;
      return rec;
    });

    state.fieldPosition = state.quarterback.x;
    state.playerY = state.quarterback.y;
  }

  return {
    team1,
    team2,
    state,
    update,
    pressSpace,
    throwPass,
    throwPassToLocation,
    throwPassToCanvasCoords,
    canvasCoordsToField,
    isTargetInFrontCone,
    draw,
    reset,
    uniformForTeam,
    setOffensivePlay,
    ballCarrier,
    getBallCarrier
  };
};
