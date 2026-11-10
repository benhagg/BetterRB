import { cameraTrailingYards, field, fieldBounds, lateralYards, passGravityFeetPerSecondSquared, runnerTrailingYards } from './field-config.js';
import { acrossToY as projectAcrossToY } from './formation.js';
import { nearestDefender } from './blocking.js';
import { clampToField } from './movement.js';
import { playTypeFor } from './play-flow.js';

/* The first team is the user-controlled team; the second is its opponent. */
// Formation `across` is yards from midfield; positive values move toward the top sideline.
const acrossToY = yards => projectAcrossToY(yards, lateralYards);

window.playGame = function playGame(team1, team2, savedState = null, selectedPlays = {}) {
  if (Array.isArray(selectedPlays.defenseOptions) && selectedPlays.defenseOptions.length) {
    selectedPlays.defense = selectedPlays.defenseOptions[Math.floor(Math.random() * selectedPlays.defenseOptions.length)];
  }
  const playType = playTypeFor(selectedPlays.offense);
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
    possession: 'offense',
    team1,
    team2
  };
  state.fieldPosition = Number.isFinite(state.fieldPosition) ? Math.max(-10, Math.min(100, state.fieldPosition)) : 25;
  state.playerY = Number.isFinite(state.playerY) ? Math.max(0.08, Math.min(0.92, state.playerY)) : 0.5;
  state.clockSeconds = Number.isFinite(state.clockSeconds) ? Math.max(0, state.clockSeconds) : 900;
  state.scrimmagePosition = Number.isFinite(state.scrimmagePosition) ? state.scrimmagePosition : state.fieldPosition;
  if (!['preplay', 'passing', 'running', 'thrown', 'catching', 'bouncing', 'complete'].includes(state.phase)) {
    state.phase = 'preplay';
    state.scrimmagePosition = state.fieldPosition;
  }

  const dlSlots = Array.isArray(selectedPlays.defense?.formation?.defensiveLine)
    ? selectedPlays.defense.formation.defensiveLine
    : [];
  const otherDefenders = Array.isArray(selectedPlays.defense?.formation?.defenders)
    ? selectedPlays.defense.formation.defenders
    : [];
  const defensiveFormationSlots = (otherDefenders.length === 11)
    ? otherDefenders
    : [...dlSlots, ...otherDefenders];

  function createDefenders(slots = defensiveFormationSlots) {
    const roster = Array.isArray(team2?.players) ? team2.players : [];
    const used = new Set();

    return slots.map((slot, index) => {
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
        x: state.scrimmagePosition + (slot.offset ?? 0),
        y: acrossToY(slot.across),
        facingLeft: true
      });
      defender.offset = slot.offset ?? 0;
      defender.across = slot.across ?? 0;
      defender.role = slot.role ?? 'zone';
      defender.zone = slot.zone ?? null;
      defender.manTarget = slot.manTarget ?? null;
      defender.coverageOffset = Number.isFinite(slot.coverageOffset) ? slot.coverageOffset : undefined;
      return defender;
    });
  }

  const receiverConfigs = selectedPlays.offense?.formation?.receivers || [];
  const quarterbackConfig = selectedPlays.offense?.formation?.quarterback || {
    position: 'QB', across: 0, offset: 0
  };
  const runningBackConfig = selectedPlays.offense?.formation?.runningBack || {
    position: 'RB', across: 0, offset: 0
  };
  const runningBackRoute = runningBackConfig.route || [];
  const offensiveLineSlots = selectedPlays.offense?.formation?.offensiveLine || [];

  function createReceivers(configs = (selectedPlays.offense?.formation?.receivers || receiverConfigs)) {
    const isRunPlay = (state.playType || playType) === 'run';
    const roster = Array.isArray(team1?.players) ? team1.players : [];
    const used = new Set();
    return configs.map((cfg, index) => {
      const position = String(cfg.position || 'WR').trim().toUpperCase();
      let rosterPlayer = roster.find(p => !used.has(p) && String(p.position || '').trim().toUpperCase() === position);
      if (!rosterPlayer) {
        rosterPlayer = roster.find(p => !used.has(p) && ['WR', 'TE', 'RB'].includes(String(p.position || '').trim().toUpperCase()));
      }
      if (rosterPlayer) used.add(rosterPlayer);

      const ReceiverClass = position === 'TE' ? TightEnd : WideReceiver;
      const startX = state.scrimmagePosition + (cfg.offset ?? -0.5);
      const startY = acrossToY(cfg.across);

      const rawRatings = rosterPlayer?.ratings || {};
      const fallbackRating = Number.isFinite(rosterPlayer?.rating) ? rosterPlayer.rating : 5;
      const ratings = {
        speed: Number.isFinite(rawRatings.speed) ? rawRatings.speed : fallbackRating,
        agility: Number.isFinite(rawRatings.agility) ? rawRatings.agility : fallbackRating,
        strength: Number.isFinite(rawRatings.strength) ? rawRatings.strength : fallbackRating,
        catching: Number.isFinite(rawRatings.catching) ? rawRatings.catching : fallbackRating,
        ...rawRatings
      };

      const receiver = new ReceiverClass({
        id: rosterPlayer?.id ?? `wr-${cfg.receiverNumber ?? index + 1}`,
        name: rosterPlayer?.name ?? (position === 'TE' ? `TE ${index + 1}` : `WR ${index + 1}`),
        position,
        portrait: Number.isFinite(rosterPlayer?.portrait) ? rosterPlayer.portrait : null,
        rating: rosterPlayer?.rating ?? fallbackRating,
        ratings,
        skills: ratings,
        receiverNumber: isRunPlay ? null : (cfg.receiverNumber ?? null),
        x: startX,
        y: startY,
        route: cfg.route || []
      });
      receiver.offset = cfg.offset ?? -0.5;
      receiver.across = cfg.across ?? 0;
      return receiver;
    });
  }

  function createQuarterback(saved = {}) {
    const roster = Array.isArray(team1?.players) ? team1.players : [];
    const rosterPlayer = roster.find(player => String(player.position || '').trim().toUpperCase() === 'QB');
    const rawRatings = rosterPlayer?.ratings || saved?.ratings || {};
    const fallbackRating = Number.isFinite(rosterPlayer?.rating) ? rosterPlayer.rating : (Number.isFinite(saved?.rating) ? saved.rating : 5);
    const ratings = {
      speed: Number.isFinite(rawRatings.speed) ? rawRatings.speed : fallbackRating,
      agility: Number.isFinite(rawRatings.agility) ? rawRatings.agility : fallbackRating,
      strength: Number.isFinite(rawRatings.strength) ? rawRatings.strength : fallbackRating,
      accuracy: Number.isFinite(rawRatings.accuracy) ? rawRatings.accuracy : fallbackRating,
      ...rawRatings
    };
    const qb = new Quarterback({
      ...saved,
      id: rosterPlayer?.id ?? saved?.id ?? 'qb',
      name: rosterPlayer?.name ?? saved?.name ?? 'QB',
      position: 'QB',
      portrait: Number.isFinite(rosterPlayer?.portrait) ? rosterPlayer.portrait : null,
      rating: rosterPlayer?.rating ?? saved?.rating ?? fallbackRating,
      ratings,
      skills: ratings,
      x: Number.isFinite(saved?.x) ? saved.x : state.scrimmagePosition + (quarterbackConfig.offset ?? 0),
      y: Number.isFinite(saved?.y) ? saved.y : acrossToY(quarterbackConfig.across)
    });
    qb.offset = quarterbackConfig.offset ?? 0;
    qb.across = quarterbackConfig.across ?? 0;
    return qb;
  }

  function createOffensiveLine(slots = offensiveLineSlots) {
    const roster = Array.isArray(team1?.players) ? team1.players : [];
    const used = new Set();
    return slots.map((slot, index) => {
      let rosterPlayer = roster.find(p => !used.has(p) && String(p.position || '').trim().toUpperCase() === 'OL');
      if (rosterPlayer) used.add(rosterPlayer);
      const rawRatings = rosterPlayer?.ratings || {};
      const fallbackRating = Number.isFinite(rosterPlayer?.rating) ? rosterPlayer.rating : 5;
      const ratings = {
        speed: Number.isFinite(rawRatings.speed) ? rawRatings.speed : fallbackRating,
        agility: Number.isFinite(rawRatings.agility) ? rawRatings.agility : fallbackRating,
        strength: Number.isFinite(rawRatings.strength) ? rawRatings.strength : fallbackRating,
        blocking: Number.isFinite(rawRatings.blocking) ? rawRatings.blocking : fallbackRating,
        ...rawRatings
      };
      const lineman = new OffensiveLineman({
        id: rosterPlayer?.id ?? `ol-${index}`,
        name: rosterPlayer?.name ?? (slot.isCenter ? 'C' : `OL ${index + 1}`),
        position: slot.position || 'OL',
        portrait: Number.isFinite(rosterPlayer?.portrait) ? rosterPlayer.portrait : null,
        rating: rosterPlayer?.rating ?? fallbackRating,
        ratings,
        skills: ratings,
        x: state.scrimmagePosition + slot.offset,
        y: acrossToY(slot.across),
        isCenter: Boolean(slot.isCenter)
      });
      lineman.offset = slot.offset;
      lineman.across = slot.across;
      return lineman;
    });
  }

  function createRunningBack(saved = {}) {
    const isRunPlay = playType === 'run';
    const roster = Array.isArray(team1?.players) ? team1.players : [];
    const player = roster.find(item => String(item.position || '').trim().toUpperCase() === 'RB');
    const rawRatings = player?.ratings || saved?.ratings || {};
    const fallbackRating = Number.isFinite(player?.rating) ? player.rating : (Number.isFinite(saved?.rating) ? saved.rating : 5);
    const ratings = {
      speed: Number.isFinite(rawRatings.speed) ? rawRatings.speed : fallbackRating,
      agility: Number.isFinite(rawRatings.agility) ? rawRatings.agility : fallbackRating,
      strength: Number.isFinite(rawRatings.strength) ? rawRatings.strength : fallbackRating,
      catching: Number.isFinite(rawRatings.catching) ? rawRatings.catching : fallbackRating,
      ...rawRatings
    };
    const back = new RunningBack({
      ...saved,
      id: player?.id ?? saved?.id ?? 'rb',
      name: player?.name ?? saved?.name ?? 'RB',
      position: 'RB',
      portrait: Number.isFinite(player?.portrait) ? player.portrait : null,
      rating: player?.rating ?? saved?.rating ?? fallbackRating,
      ratings,
      skills: ratings,
      x: Number.isFinite(saved?.x) ? saved.x : state.scrimmagePosition + runningBackConfig.offset,
      y: Number.isFinite(saved?.y) ? saved.y : acrossToY(runningBackConfig.across),
      receiverNumber: isRunPlay ? null : (runningBackConfig.receiverNumber ?? 3),
      route: runningBackRoute
    });
    back.offset = runningBackConfig.offset;
    back.across = runningBackConfig.across;
    return back;
  }

  state.quarterback = state.quarterback instanceof Quarterback ? state.quarterback : createQuarterback(state.quarterback);
  state.receivers = (Array.isArray(state.receivers) && state.receivers.length && (state.receivers[0] instanceof Player))
    ? state.receivers
    : createReceivers(receiverConfigs);
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
    state.quarterback.y = acrossToY(quarterbackConfig.across);
    state.quarterback.phase = 'preplay';
    state.quarterback.hasBall = true;
    state.offensiveLine.forEach(lineman => {
      lineman.x = state.scrimmagePosition + lineman.offset;
      lineman.y = acrossToY(lineman.across);
      lineman.phase = 'preplay';
    });
    state.runningBack.x = state.scrimmagePosition + state.runningBack.offset;
    state.runningBack.y = acrossToY(state.runningBack.across);
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
        def.x = state.scrimmagePosition + (slot.offset ?? 0);
        def.y = acrossToY(slot.across);
        def.animDistance = 0;
        def.facingLeft = true;
      }
    });
    if (state.receivers) {
      state.receivers.forEach((rec, index) => {
        const cfg = receiverConfigs[index];
        if (cfg) {
          rec.x = state.scrimmagePosition + cfg.offset;
          rec.y = acrossToY(cfg.across);
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
  function syncQuarterbackState() {
    state.fieldPosition = state.quarterback.x;
    state.playerY = state.quarterback.y;
  }

  function ballCarrier() {
    return state.receivers.find(receiver => receiver.hasBall)
      || (state.runningBack.hasBall ? state.runningBack : null)
      || state.defenders.find(defender => defender.hasBall)
      || state.quarterback;
  }

  function getBallCarrier() {
    if (state.phase === 'thrown') return null;
    const receiverWithBall = state.receivers.find(receiver => receiver.hasBall);
    if (receiverWithBall) return receiverWithBall;
    if (state.runningBack?.hasBall) return state.runningBack;
    const defenderWithBall = state.defenders.find(defender => defender.hasBall);
    if (defenderWithBall) return defenderWithBall;
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
  let catching;
  const zoneEngine = GameZoneEngine.create({ state, lateralYards, fieldBounds });
  const defenseAI = GameDefenseAI.create({ state, lateralYards, fieldBounds, zoneEngine });
  const passing = GamePassing.create({
    state, lateralYards, fieldBounds, passTarget, quarterbackIsBehindLineOfScrimmage,
    onPassReleased: pass => { defenseAI.onPassReleased(pass); catching?.schedule(pass); }
  });
  catching = GameCatching.create({ state, lateralYards, defenseAI });
  defenseAI.initialize(state.defenders, selectedPlays.defense?.coverage || 'man');

  function resolveCatch(contact, input) {
    const { player, ball, catchType, interception } = contact;
    state.pass.resolution = {
      playerId: player.id,
      playerName: player.name,
      type: interception ? 'interception' : catchType,
      time: contact.time
    };
    state.quarterback.hasBall = false;
    // The receiver remains on their simulated trajectory. At contact, the
    // ball is brought to the player's position instead of teleporting the
    // player to the ball.
    ball.x = player.x;
    ball.y = player.y;

    if (interception) {
      player.hasBall = true;
      player.phase = 'running';
      player.autoRun = { vx: -1, vy: 0 };
      state.possession = 'defense';
      state.phase = 'running';
      return;
    }

    // After securing the ball, the carrier turns toward the offensive end zone.
    // movementStep handles the deceleration and directional cut rather than
    // teleporting the player onto the new heading.
    player.beginCatch(catchType, { vx: 1, vy: 0 });
    state.fieldPosition = player.x;
    state.playerY = player.y;
    if (catchType === 'standard') {
      state.phase = 'running';
      movePlayer(0, input);
    } else {
      state.phase = 'catching';
      state.catchingPlayer = player;
    }
  }

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

  const BLOCK_ENGAGE_RADIUS = 0.75;

  function blockNearestDefender(player, delta) {
    const { defender, distance } = nearestDefender(player, state.defenders, lateralYards);
    if (defender) {
      if (distance <= BLOCK_ENGAGE_RADIUS) {
        player.block(defender);
      } else {
        player.blockingTarget = null;
        player.run(delta, defender.x, defender.y);
      }
    } else {
      player.blockingTarget = null;
      player.runRoute(delta);
    }
  }

  function movePlayer(delta, input = {}) {
    const carrier = ballCarrier();
    if (!carrier || carrier.isTackled) return;

    const isDefensiveReturner = state.defenders.includes(carrier);
    const isPocketQb = (carrier === state.quarterback && state.phase === 'passing');
    const hasInput = Boolean(input.right || input.left || input.down || input.up);
    let dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let dy = Number(Boolean(input.down)) - Number(Boolean(input.up));

    if (isDefensiveReturner) {
      // Interception returns run straight toward the defense's end zone.
      carrier.move(delta, -1, 0);
    } else if (isPocketQb) {
      // QB in the pocket: requires holding keys to move; stays stationary when released
      if (hasInput && (dx !== 0 || dy !== 0)) {
        carrier.move(delta, dx, dy);
      } else {
        carrier.coastToStop(delta);
      }
    } else {
      // Ball carrier downfield:
      // While holding keys, move according to input and remember the last commanded direction
      if (hasInput && (dx !== 0 || dy !== 0)) {
        carrier.autoRun = { vx: dx, vy: dy };
      }
      // Continue moving indefinitely in the last commanded direction (not stopping on field when keys released)
      if (carrier.autoRun) {
        carrier.move(delta, carrier.autoRun.vx, carrier.autoRun.vy);
      } else {
        carrier.coastToStop(delta);
      }
    }

    Object.assign(carrier, clampToField(carrier, fieldBounds));
    state.fieldPosition = carrier.x;
    state.playerY = carrier.y;
  }

  function startIncompleteBounce() {
    const pass = state.pass;
    if (!pass || !Number.isFinite(pass.duration) || pass.duration <= 0) {
      state.phase = 'complete';
      return;
    }
    state.bounce = {
      x: pass.targetX,
      y: pass.targetY,
      z: Number.isFinite(pass.targetHeightFeet) ? pass.targetHeightFeet : 4,
      velocityX: (pass.targetX - pass.fromX) / pass.duration,
      velocityY: (pass.targetY - pass.fromY) / pass.duration,
      velocityZ: (pass.launchVelocity || 0)
        - (pass.profile?.gravity ?? passGravityFeetPerSecondSquared) * pass.duration,
      restitution: 0.45,
      friction: 0.5,
      bounces: 0,
      maxBounces: 3
    };
    state.phase = 'bouncing';
  }

  function update(seconds, input = {}) {
    const delta = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
    if (state.phase === 'preplay') {
      // Keep man defenders aligned to the current offensive formation while
      // play selection is open; the snap should not trigger a late assignment run.
      defenseAI.initialize(state.defenders, selectedPlays.defense?.coverage || 'man');
      return state;
    }
    if (state.phase === 'complete' || state.clockSeconds <= 0) {
      const carrier = ballCarrier();
      if (carrier?.isTackled) {
        carrier.tackledElapsed = (carrier.tackledElapsed || 0) + delta;
      }
      return state;
    }

    if (state.phase === 'passing' || state.phase === 'running') {
      const defenseHasBall = state.defenders.some(defender => defender.hasBall);
      if (state.playType === 'run' && state.quarterback.hasBall
        && !state.runningBack.hasBall && !defenseHasBall) {
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
      if (state.phase === 'passing' && state.quarterback.hasBall
        && state.quarterback.x >= state.scrimmagePosition) {
        state.phase = 'running';
        state.quarterback.phase = 'running';
      }
    } else if (state.phase === 'thrown') {
      catching.schedule(state.pass);
      state.pass.progress = Math.min(1, state.pass.progress + delta / state.pass.duration);
      const currentHeight = passing.throwHeightAt(state.pass.progress, state.pass);
      state.pass.heightFeet = currentHeight;
      state.pass.heightfeet = currentHeight;
      for (const player of [...state.receivers, state.runningBack]) {
        if (!player.hasBall) {
          if (state.pass.targetReceiverNumber && player.receiverNumber === state.pass.targetReceiverNumber) {
            // The targeted receiver always adjusts toward the predicted ball
            // location, including passes thrown behind their current route.
            if (state.pass.progress * state.pass.duration >= GameDefenseAI.RECEIVER_BREAK_DELAY) {
              player.run(delta, state.pass.targetX, state.pass.targetY);
            } else {
              player.runRoute(delta);
            }
          } else {
            // Non-targeted receivers keep running their assigned routes while
            // the ball is airborne. Catch-volume contests can be layered on
            // later without turning every route runner into a blocker.
            player.runRoute(delta);
          }
        }
      }
      const contact = catching.resolve(state.pass, state.pass.progress * state.pass.duration);
      if (contact) {
        resolveCatch(contact, input);
      }
      if (state.phase === 'thrown' && state.pass.progress >= 1) {
        state.quarterback.hasBall = false;
        startIncompleteBounce();
      }
    } else if (state.phase === 'catching') {
      const player = state.catchingPlayer;
      const result = player?.updateCatch(delta);
      if (player) {
        player.x = Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, player.x));
        player.y = Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, player.y));
        state.fieldPosition = player.x;
        state.playerY = player.y;
      }
      if (result === 'landed') {
        state.phase = 'running';
        delete state.catchingPlayer;
      } else if (result === 'down') {
        state.phase = 'complete';
        delete state.catchingPlayer;
      }
    } else if (state.phase === 'bouncing') {
      for (const player of [...state.receivers, state.runningBack]) {
        if (!player.hasBall) player.coastToStop(delta);
      }
      const bounce = state.bounce;
      if (bounce) {
        bounce.x += bounce.velocityX * delta;
        bounce.y += bounce.velocityY * delta;
        bounce.z += bounce.velocityZ * delta;
        bounce.velocityZ -= passGravityFeetPerSecondSquared * delta;
        if (bounce.z <= 0) {
          bounce.z = 0;
          bounce.bounces += 1;
          bounce.velocityZ = -bounce.velocityZ * bounce.restitution;
          bounce.velocityX *= bounce.friction;
          bounce.velocityY *= bounce.friction;
          if (bounce.bounces >= bounce.maxBounces || Math.abs(bounce.velocityZ) < 1) {
            state.phase = 'complete';
          }
        }
      }
    }

    // Update receivers and blockers (blocking continues in-flight and after-flight to end of play)
    if (state.phase === 'running') {
      const eligibleBlockers = [
        ...(state.offensiveLine || []),
        ...(state.receivers || [])
      ];
      if (state.runningBack && (state.playType !== 'run' || state.runningBack.hasBall)) {
        eligibleBlockers.push(state.runningBack);
      }
      for (const player of eligibleBlockers) {
        if (!player.hasBall) {
          blockNearestDefender(player, delta);
        }
      }
    } else if (state.phase === 'passing') {
      if (state.receivers) {
        for (const rec of state.receivers) {
          rec.runRoute(delta);
        }
      }
      if (state.playType !== 'run' && !state.runningBack.hasBall) {
        state.runningBack.runRoute(delta);
      }
    }
    defenseAI.update(delta);
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
      // Reapply matchups to the selected offensive formation on the snap
      // frame so defenders cannot start from stale slot coordinates.
      defenseAI.initialize(state.defenders, selectedPlays.defense?.coverage || 'man');
      if (state.playType === 'run') {
        state.phase = 'running';
        state.quarterback.phase = 'passing';
      } else {
        state.phase = 'passing';
        state.quarterback.phase = 'passing';
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
    state.fieldPosition = 25;
    state.playerY = 0.5;
    state.clockSeconds = 900;
    state.quarter = 1;
    state.scrimmagePosition = state.fieldPosition;
    state.phase = 'preplay';
    state.possession = 'offense';
    state.playType = playTypeFor(selectedPlays.offense);
    delete state.pass;
    delete state.bounce;
    delete state.catchingPlayer;
    delete state.throwWindup;
    state.quarterback = createQuarterback();
    state.defenders = createDefenders();
    state.receivers = createReceivers();
    state.offensiveLine = createOffensiveLine();
    state.runningBack = createRunningBack();
    defenseAI.initialize(state.defenders, selectedPlays.defense?.coverage || 'man');
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
    state.possession = 'offense';
    selectedPlays.offense = play;
    state.playType = playTypeFor(play);
    const isRun = state.playType === 'run';
    const qbCfg = play.formation?.quarterback || { position: 'QB', across: 0, offset: 0 };
    const rbCfg = play.formation?.runningBack || { position: 'RB', across: 0, offset: 0 };
    const recCfgs = play.formation?.receivers || [];

    // Reconfigure Quarterback
    state.quarterback.offset = qbCfg.offset ?? 0;
    state.quarterback.across = qbCfg.across ?? 0;
    state.quarterback.x = state.scrimmagePosition + state.quarterback.offset;
    state.quarterback.y = acrossToY(state.quarterback.across);
    state.quarterback.phase = 'preplay';
    state.quarterback.hasBall = true;
    state.quarterback.animDistance = 0;
    state.quarterback.isMoving = false;

    // Reconfigure Running Back
    state.runningBack.offset = rbCfg.offset ?? 0;
    state.runningBack.across = rbCfg.across ?? 0;
    state.runningBack.startX = state.scrimmagePosition + state.runningBack.offset;
    state.runningBack.startY = acrossToY(state.runningBack.across);
    state.runningBack.x = state.runningBack.startX;
    state.runningBack.y = state.runningBack.startY;
    state.runningBack.phase = 'preplay';
    state.runningBack.hasBall = false;
    state.runningBack.receiverNumber = isRun ? null : (rbCfg.receiverNumber ?? null);
    state.runningBack.assignRoute(rbCfg.route || []);

    // Reconfigure Offensive Line
    if (Array.isArray(play.formation?.offensiveLine)) {
      state.offensiveLine = createOffensiveLine(play.formation.offensiveLine);
    }

    // Reconfigure Receivers from Roster with Play Routes
    state.receivers = createReceivers(recCfgs);

    defenseAI.initialize(state.defenders, selectedPlays.defense?.coverage || 'man');

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
