/* The first team is the user-controlled team; the second is its opponent. */
// currently the top bottom and each end zone of the field are these numbers. out of bounds is anything outside of the top / bottom range and a touchdown is anything in the end zone we are going towards
const fieldBounds = {top: -.02, bottom: 0.95, endZoneL: 2.217644291800185, endZoneR: 101.66747130270615};
const cameraTrailingYards = 6;
const lateralYards = 17;
const passSpeedYardsPerSecond = 12;
const throw_arc = 0.7;
const throwArc = throw_arc;
const releaseHeightFeet = 6;
const targetHeightFeet = 4;

function throwHeightAt(progress, distanceYards) {
  const t = Math.max(0, Math.min(1, progress));
  const straightHeight = releaseHeightFeet + (targetHeightFeet - releaseHeightFeet) * t;
  return straightHeight + throw_arc * distanceYards * 4 * t * (1 - t);
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

window.playGame = function playGame(team1, team2, savedState = null, selectedPlays = {}) {
  const dropbackYards = 3;
  const playType = String(selectedPlays.offense?.playType || selectedPlays.offense?.playtype || selectedPlays.offense?.type || 'pass').toLowerCase();
  const state = {
    score1: 0,
    score2: 0,
    fieldPosition: 22,
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
      const rating = Number.isFinite(rosterPlayer?.ratings?.speed) ? rosterPlayer.ratings.speed : 5;
      const ReceiverClass = cfg.position === 'TE' ? TightEnd : WideReceiver;
      const startX = state.scrimmagePosition + cfg.offset;
      const startY = 0.5 + cfg.across;

      {
        const receiver = new ReceiverClass({
          id: rosterPlayer?.id ?? `wr-${cfg.receiverNumber ?? index + 1}`,
          name: rosterPlayer?.name ?? cfg.name,
          position: cfg.position,
          rating,
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
      rating: Number.isFinite(rosterPlayer?.ratings?.speed) ? rosterPlayer.ratings.speed : 5,
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
        position: slot.position || 'OL', rating: 5,
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
      rating: Number.isFinite(player?.ratings?.speed) ? player.ratings.speed : 5,
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
  const fieldImage = RetroSprites.fieldImage;
  const field = { x: 0, y: 0, width: 1305, height: 240, goalLine: 152, pixelsPerYard: 10, topSideline: 32, bottomSideline: 206 };

  function camera(width, height) {
    const pixel = Math.max(1, Math.min(Math.round(height / 180), Math.floor(width / 360)));
    return { pixel };
  }

  function syncQuarterbackState() {
    state.fieldPosition = state.quarterback.x;
    state.playerY = state.quarterback.y;
  }

  function ballCarrier() {
    return state.receivers.find(receiver => receiver.hasBall)
      || (state.runningBack.hasBall ? state.runningBack : state.quarterback);
  }

  function passTarget(receiverNumber) {
    return [...state.receivers, state.runningBack].find(player => player.receiverNumber === receiverNumber);
  }

  function isTargetInFrontCone(player, targetX, targetY, maxDist = 5, coneAngleDeg = 60) {
    const dx = targetX - player.x;
    const dy = (targetY - player.y) * lateralYards;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    if (dist < 0.05) return true;

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
          carrier.velocityX = 0;
          carrier.velocityY = 0;
          carrier.isMoving = false;
        }
      } else if (carrier.autoRun) {
        carrier.move(delta, carrier.autoRun.vx, carrier.autoRun.vy);
      } else {
        carrier.velocityX = 0;
        carrier.velocityY = 0;
        carrier.isMoving = false;
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
      const currentHeight = throwHeightAt(state.pass.progress, state.pass.distanceYards);
      state.pass.heightFeet = currentHeight;
      state.pass.heightfeet = currentHeight;
      for (const player of [...state.receivers, state.runningBack]) {
        if (!player.hasBall) {
          const distToTarget = Math.hypot(state.pass.targetX - player.x, (state.pass.targetY - player.y) * lateralYards);
          if (state.pass.targetReceiverNumber && player.receiverNumber === state.pass.targetReceiverNumber) {
            if (state.pass.wasTargetMoving) {
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
          const wasMoving = state.pass.targetReceiverNumber
            ? state.pass.wasTargetMoving
            : Boolean(target.isMoving) && (Math.hypot(target.velocityX || 0, (target.velocityY || 0) * lateralYards) > 0.05);
          if (wasMoving) {
            let catchDirX = target.velocityX;
            let catchDirY = target.velocityY * lateralYards;
            if (Math.hypot(catchDirX, catchDirY) < 0.1) {
              catchDirX = target.lastDirX;
              catchDirY = target.lastDirY;
            }
            target.catchBall(
              Number.isFinite(catchDirX) && Number.isFinite(catchDirY)
                ? { vx: catchDirX, vy: catchDirY }
                : null
            );
          } else {
            target.catchBall({ vx: 0, vy: 0 });
          }
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
    if (state.throwWindup) {
      state.throwWindup.elapsed += delta;
      const windup = state.throwWindup;
      const animStart = Math.max(0, windup.delay - (windup.animDuration || 0.2));

      if (windup.wasMoving) {
        if (windup.elapsed >= animStart) {
          // Show throwing sprite animation right before we throw
          state.quarterback.phase = 'throwing';
          const throwAnimElapsed = windup.elapsed - animStart;
          const throwAnimTotal = windup.delay - animStart;
          state.quarterback.throwProgress = Math.min(1, throwAnimElapsed / throwAnimTotal);

          let targetX = windup.targetX;
          if (!Number.isFinite(targetX) && windup.receiverNum) {
            const targetRec = passTarget(windup.receiverNum);
            if (targetRec) targetX = targetRec.x;
          }
          if (Number.isFinite(targetX)) {
            state.quarterback.facingLeft = targetX < state.quarterback.x;
          }
        } else {
          // Still running before throwing motion starts
          state.quarterback.phase = 'running';
          state.quarterback.isMoving = true;
        }
      } else {
        state.quarterback.phase = 'throwing';
        state.quarterback.throwProgress = Math.min(1, windup.elapsed / windup.delay);
      }

      if (windup.elapsed >= windup.delay) {
        delete state.throwWindup;
        if (Number.isFinite(windup.targetX) && Number.isFinite(windup.targetY)) {
          executePassReleaseToLocation(windup.targetX, windup.targetY);
        } else if (windup.receiverNum) {
          executePassRelease(windup.receiverNum);
        }
      }
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
    const horizontalScale = width / 300;
    const verticalScale = height / field.height;
    const passProgress = (state.phase === 'thrown' || state.phase === 'complete') && state.pass ? state.pass.progress : null;
    const cameraYard = passProgress === null
      ? (ballCarrier()?.x ?? state.fieldPosition)
      : state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
    const cameraOriginYard = cameraYard - cameraTrailingYards;
    const top = field.topSideline * verticalScale;
    const bottom = field.bottomSideline * verticalScale;

    const fieldX = cameraOriginYard + canvasX / (field.pixelsPerYard * horizontalScale);
    const fieldY = (canvasY - top) / (bottom - top);
    return {
      x: Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, fieldX)),
      y: Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, fieldY))
    };
  }

  function throwPassToLocation(targetX, targetY) {
    if (state.playType === 'run') return;
    if (state.phase !== 'passing' && state.phase !== 'dropback') return;
    if (state.throwWindup) return;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    if (state.phase === 'dropback') {
      state.phase = 'passing';
      state.dropbackRemaining = 0;
      state.quarterback.dropbackRemaining = 0;
    }

    const clampedX = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, targetX));
    const clampedY = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, targetY));

    const isMoving = Boolean(state.quarterback.isMoving) && (Math.hypot(state.quarterback.velocityX || 0, (state.quarterback.velocityY || 0) * lateralYards) > 0.05);
    const delay = isMoving ? 0.4 : 0.2;
    const animDuration = 0.2;

    if (!isMoving) {
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;
      state.quarterback.phase = 'throwing';
      state.quarterback.throwProgress = 0;
      state.quarterback.facingLeft = clampedX < state.quarterback.x;
    }

    state.throwWindup = {
      targetX: clampedX,
      targetY: clampedY,
      delay,
      elapsed: 0,
      wasMoving: isMoving,
      animDuration,
      runDirX: Number.isFinite(state.quarterback.lastDirX) ? state.quarterback.lastDirX : 1,
      runDirY: Number.isFinite(state.quarterback.lastDirY) ? state.quarterback.lastDirY : 0
    };
  }

  function throwPassToCanvasCoords(canvasX, canvasY, width = 960, height = 540) {
    const coords = canvasCoordsToField(canvasX, canvasY, width, height);
    throwPassToLocation(coords.x, coords.y);
  }

  function executePassReleaseToLocation(targetX, targetY) {
    const fromX = state.quarterback.x;
    const fromY = state.quarterback.y;
    state.quarterback.facingLeft = targetX < fromX;
    state.quarterback.isMoving = false;
    state.quarterback.velocityX = 0;
    state.quarterback.velocityY = 0;
    const distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
    const arcLength = throwArcLength(distance);
    const duration = Math.max(0.4, Math.min(2.5, arcLength / passSpeedYardsPerSecond));

    state.pass = {
      fromX,
      fromY,
      targetX,
      targetY,
      duration,
      progress: 0,
      distanceYards: distance,
      heightFeet: releaseHeightFeet,
      heightfeet: releaseHeightFeet,
      targetReceiverNumber: null,
      wasTargetMoving: false
    };
    state.quarterback.phase = 'thrown';
    state.phase = 'thrown';
  }

  function throwPass(target, maybeY) {
    if (typeof target === 'number' && typeof maybeY === 'number') {
      return throwPassToLocation(target, maybeY);
    }
    if (typeof target === 'object' && target !== null && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      return throwPassToLocation(target.x, target.y);
    }
    const receiverNum = target;
    if (state.playType === 'run') return;
    if (state.phase !== 'passing' && state.phase !== 'dropback') return;
    if (state.throwWindup) return;
    const targetReceiver = passTarget(receiverNum);
    if (!targetReceiver || !targetReceiver.receiverNumber) return;

    if (state.phase === 'dropback') {
      state.phase = 'passing';
      state.dropbackRemaining = 0;
      state.quarterback.dropbackRemaining = 0;
    }

    const isMoving = Boolean(state.quarterback.isMoving) && (Math.hypot(state.quarterback.velocityX || 0, (state.quarterback.velocityY || 0) * lateralYards) > 0.05);
    const delay = isMoving ? 0.4 : 0.2;
    const animDuration = 0.2;

    if (!isMoving) {
      state.quarterback.isMoving = false;
      state.quarterback.velocityX = 0;
      state.quarterback.velocityY = 0;
      state.quarterback.phase = 'throwing';
      state.quarterback.throwProgress = 0;
      state.quarterback.facingLeft = targetReceiver.x < state.quarterback.x;
    }

    state.throwWindup = {
      receiverNum,
      delay,
      elapsed: 0,
      wasMoving: isMoving,
      animDuration,
      runDirX: Number.isFinite(state.quarterback.lastDirX) ? state.quarterback.lastDirX : 1,
      runDirY: Number.isFinite(state.quarterback.lastDirY) ? state.quarterback.lastDirY : 0
    };
  }

  function executePassRelease(receiverNum) {
    const targetReceiver = passTarget(receiverNum);
    if (!targetReceiver) {
      state.quarterback.phase = 'passing';
      return;
    }

    const fromX = state.quarterback.x;
    const fromY = state.quarterback.y;
    state.quarterback.facingLeft = targetReceiver.x < fromX;
    state.quarterback.isMoving = false;
    state.quarterback.velocityX = 0;
    state.quarterback.velocityY = 0;
    const receiverVelocityX = Number(targetReceiver.velocityX) || 0;
    const receiverVelocityY = Number(targetReceiver.velocityY) || 0;
    const isMoving = Boolean(targetReceiver.isMoving) && (Math.hypot(receiverVelocityX, receiverVelocityY * lateralYards) > 0.05);

    let duration = 0.3;
    let targetX = targetReceiver.x;
    let targetY = targetReceiver.y;
    let distance = 0;

    if (isMoving) {
      // Predict a constant-velocity lead. Repeating converges the travel time and lead point.
      for (let step = 0; step < 3; step++) {
        targetX = targetReceiver.x + receiverVelocityX * duration;
        targetY = targetReceiver.y + receiverVelocityY * duration;
        distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
        const arcLength = throwArcLength(distance);
        duration = Math.max(0.4, Math.min(2.5, arcLength / passSpeedYardsPerSecond));
      }
    } else {
      targetX = targetReceiver.x;
      targetY = targetReceiver.y;
      distance = Math.hypot(targetX - fromX, (targetY - fromY) * lateralYards);
      const arcLength = throwArcLength(distance);
      duration = Math.max(0.4, Math.min(2.5, arcLength / passSpeedYardsPerSecond));
    }

    state.pass = {
      fromX,
      fromY,
      targetX,
      targetY,
      duration,
      progress: 0,
      distanceYards: distance,
      heightFeet: releaseHeightFeet,
      heightfeet: releaseHeightFeet,
      targetReceiverNumber: targetReceiver.receiverNumber,
      wasTargetMoving: isMoving
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

  function draw(ctx, width, height) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#377c08';
    ctx.fillRect(0, 0, width, height);

    const horizontalScale = width / 300;
    const verticalScale = height / field.height;
    const { pixel } = camera(width, height);
    const passProgress = (state.phase === 'thrown' || state.phase === 'complete') && state.pass ? state.pass.progress : null;
    const cameraYard = passProgress === null
      ? ballCarrier().x
      : state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
    const cameraOriginYard = cameraYard - cameraTrailingYards;
    const fieldOrigin = field.goalLine + cameraOriginYard * field.pixelsPerYard;
    if (fieldImage.complete && fieldImage.naturalWidth) {
      ctx.save();
      ctx.setTransform(horizontalScale, 0, 0, verticalScale, -fieldOrigin * horizontalScale, 0);
      ctx.drawImage(fieldImage, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
      ctx.restore();
    }

    const offense = uniformForTeam(team1);
    const defense = uniformForTeam(team2);
    const lineX = (state.scrimmagePosition - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
    const top = field.topSideline * verticalScale;
    const bottom = field.bottomSideline * verticalScale;
    ctx.fillStyle = 'rgba(92, 174, 255, .65)';
    ctx.fillRect(lineX, top, Math.max(1, pixel), bottom - top);
    const screenCoordinates = actor => ({
      screenX: (actor.x - cameraOriginYard) * field.pixelsPerYard * horizontalScale,
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
      const targetX = (state.pass.targetX - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
      const targetY = top + state.pass.targetY * (bottom - top);
      const xSize = Math.max(3, 3 * pixel);
      ctx.save();
      ctx.strokeStyle = '#e53935';
      ctx.lineWidth = Math.max(1, pixel);
      ctx.beginPath();
      ctx.moveTo(targetX - xSize, targetY - xSize);
      ctx.lineTo(targetX + xSize, targetY + xSize);
      ctx.moveTo(targetX + xSize, targetY - xSize);
      ctx.lineTo(targetX - xSize, targetY + xSize);
      ctx.stroke();
      ctx.restore();

      // Stored field coordinates remain in a straight line from thrower to target:
      const ballWorldX = state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
      const ballWorldY = state.pass.fromY + (state.pass.targetY - state.pass.fromY) * passProgress;
      const ballX = (ballWorldX - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
      const groundY = top + ballWorldY * (bottom - top);

      // Height in feet along the 3D parabolic arc
      const heightFeet = typeof state.pass.heightFeet === 'number'
        ? state.pass.heightFeet
        : throwHeightAt(passProgress, state.pass.distanceYards || 0);

      // In 2D retro view, height projects upward on screen (decreasing screen Y)
      // 1 foot ≈ (16 / 6) * pixel based on player sprite proportions
      const pixelsPerFoot = (16 * pixel) / 6;
      const heightOffset = heightFeet * pixelsPerFoot;
      const ballY = groundY - heightOffset;

      // Draw shadow at straight 2D ground track
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(ballX, groundY, 4 * pixel, 2 * pixel, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.drawImage(RetroSprites.footballImage, ballX - 5 * pixel, ballY - 2.5 * pixel, 10 * pixel, 5 * pixel);
    }
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
        rating: 5,
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
    setOffensivePlay
  };
};
