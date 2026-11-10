import { playEndsFromTackle, shouldDefenderDive, attemptTackle } from './tackling.js';

(function (root) {
  const ZONE_CONTEST_RADIUS = 3;
  const DEFAULT_COVERAGE_OFFSET = 4;
  const MAN_BACKPEDAL_YARDS = 2.5;
  const MAN_CUT_REACTION_DELAY = 0.2;
  const RECEIVER_BREAK_DELAY = 0.05;
  const PURSUIT_MAX_LEAD_TIME = 1.5;
  const PURSUIT_CONTAIN_OFFSET = 0.08;
  const PURSUIT_SAFETY_CUSHION = 1.50;

  function calculateDefenderReactionDelay(defender, target, lateralYards = 25) {
    if (defender.isBackpedaling) return 0;
    const vx = defender.velocityX || 0;
    const vy = (defender.velocityY || 0) * lateralYards;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.05) return 0;
    const dx = target.x - defender.x;
    const dy = (target.y - defender.y) * lateralYards;
    const distance = Math.hypot(dx, dy);
    if (!distance) return 0;
    const dot = Math.max(-1, Math.min(1, (vx * dx + vy * dy) / (speed * distance)));
    return 0.15 * (1 - dot);
  }

  function getPlayerMovementVelocity(player, lateralYards = 25) {
    if (!player) return { vx: 0, vy: 0, speed: 0 };

    const vx = Number(player.velocityX) || 0;
    const vy = (Number(player.velocityY) || 0) * lateralYards;
    const currentSpeed = Math.hypot(vx, vy);
    if (currentSpeed > 0.05) {
      return { vx, vy, speed: currentSpeed };
    }

    const playerSpeed = Math.max(0.1, Number(player.speed) || 5);

    if (player.autoRun && (player.autoRun.vx !== 0 || player.autoRun.vy !== 0)) {
      const arX = player.autoRun.vx;
      const arY = (player.autoRun.vy || 0) * lateralYards;
      const arDist = Math.hypot(arX, arY) || 1;
      return {
        vx: (arX / arDist) * playerSpeed,
        vy: (arY / arDist) * playerSpeed,
        speed: playerSpeed
      };
    }

    if (player.route && Number.isFinite(player.routeIndex) && player.routeIndex < player.route.length) {
      const wp = player.route[player.routeIndex];
      const targetX = player.startX + wp.dx;
      const targetY = player.startY + wp.dy / lateralYards;
      const dx = targetX - player.x;
      const dy = (targetY - player.y) * lateralYards;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.05) {
        return {
          vx: (dx / dist) * playerSpeed,
          vy: (dy / dist) * playerSpeed,
          speed: playerSpeed
        };
      }
    }

    if (player._movement?.direction && player._movement.hasDirection) {
      const dir = player._movement.direction;
      const factor = player._movement.speedFactor || 1;
      return {
        vx: dir.x * playerSpeed * factor,
        vy: dir.y * playerSpeed * factor,
        speed: playerSpeed * factor
      };
    }

    return { vx: 0, vy: 0, speed: 0 };
  }

  function create({ state, lateralYards = 25, fieldBounds, zoneEngine }) {
    const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * lateralYards);
    const alignmentOffsetFor = (defender, receiver) => receiver === state.runningBack
      ? 0
      : Math.max(0, Number.isFinite(defender.coverageOffset) ? defender.coverageOffset : DEFAULT_COVERAGE_OFFSET);
    const clampTarget = target => ({
      x: Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, target.x)),
      y: Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, target.y))
    });

    function initialize(defenders, coverage = 'man') {
      const coverageType = typeof coverage === 'string' ? coverage : (coverage.type || 'man');
      const assignedTargets = new Set();
      for (const defender of defenders) {
        defender.defenseAI = { anchor: { x: defender.x, y: defender.y }, mode: 'coverage', delay: 0, routeIndex: null, lastTarget: null };
        defender.isBackpedaling = false;
        defender._initialY = Number.isFinite(defender.startY) ? defender.startY : defender.y;
      }
      if (coverageType !== 'man') {
        alignZoneDefenders(defenders);
        return;
      }

      function alignZoneDefenders(defs) {
        const zoneRules = zoneEngine?.zones;
        for (const defender of defs) {
          if (defender.role === 'rush' || ['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(defender.position)) continue;
          const zoneName = defender.zone || 'middle';
          const rule = zoneRules?.[zoneName];
          if (!rule || !rule.lane) continue;
          const [laneStart, laneEnd] = rule.lane;
          const laneMid = (laneStart + laneEnd) / 2;
          if (laneMid < 0.48 && defender.y > 0.5) {
            defender.y = Math.min(laneEnd, Math.max(laneStart, 1 - defender.y));
            defender.startY = defender.y;
            if (defender.defenseAI) defender.defenseAI.anchor.y = defender.y;
          } else if (laneMid > 0.52 && defender.y < 0.5) {
            defender.y = Math.min(laneEnd, Math.max(laneStart, 1 - defender.y));
            defender.startY = defender.y;
            if (defender.defenseAI) defender.defenseAI.anchor.y = defender.y;
          }
        }
      }

      // Explicit manTarget assignments take priority and determine alignment.
      // DBs and LBs in man coverage are assigned to eligible receivers.
      const eligibleReceivers = state.receivers.filter(player => ['WR', 'TE'].includes(player.position));
      const manDefenders = defenders.filter(defender =>
        defender.role === 'man' && !['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(defender.position) && defender.role !== 'rush'
      );

      // 1. Assign explicit manTarget mappings
      for (const defender of manDefenders) {
        if (!defender.manTarget) continue;
        const target = manTarget(defender.manTarget);
        if (target && !assignedTargets.has(target)) {
          assignMan(defender, target);
        }
      }

      // 2. Assign unassigned man defenders to nearest eligible receivers prioritizing same side of field
      for (const defender of manDefenders) {
        if (defender.defenseAI?.manTargetPlayer) continue;
        const target = eligibleReceivers
          .filter(receiver => !assignedTargets.has(receiver))
          .sort((a, b) => {
            const aSameSide = (a.y < 0.5) === (defender.y < 0.5);
            const bSameSide = (b.y < 0.5) === (defender.y < 0.5);
            if (aSameSide !== bSameSide) return aSameSide ? -1 : 1;
            return distance(defender, a) - distance(defender, b);
          })[0];
        if (target) assignMan(defender, target);
        else defender.role = 'zone';
      }

      // 3. Ensure defenders line up on the same side of the field as their assignment:
      // If two defenders on opposite sides of the field have targets on opposite sides of the field,
      // swap their assignments so each defender matches the receiver on their own side of the field.
      for (let i = 0; i < manDefenders.length; i++) {
        for (let j = i + 1; j < manDefenders.length; j++) {
          const d1 = manDefenders[i];
          const d2 = manDefenders[j];
          const t1 = d1.defenseAI?.manTargetPlayer;
          const t2 = d2.defenseAI?.manTargetPlayer;
          if (!t1 || !t2) continue;

          const d1BaseY = Number.isFinite(d1._initialY) ? d1._initialY : (Number.isFinite(d1.startY) ? d1.startY : d1.y);
          const d2BaseY = Number.isFinite(d2._initialY) ? d2._initialY : (Number.isFinite(d2.startY) ? d2.startY : d2.y);
          const d1Side = d1BaseY < 0.48 ? -1 : (d1BaseY > 0.52 ? 1 : 0);
          const d2Side = d2BaseY < 0.48 ? -1 : (d2BaseY > 0.52 ? 1 : 0);

          if (d1Side !== 0 && d2Side !== 0 && d1Side !== d2Side) {
            const t1Side = t1.y < 0.48 ? -1 : (t1.y > 0.52 ? 1 : 0);
            const t2Side = t2.y < 0.48 ? -1 : (t2.y > 0.52 ? 1 : 0);

            if (d1Side !== t1Side && d2Side !== t2Side && d1Side === t2Side && d2Side === t1Side) {
              swapManAssignments(d1, d2, t1, t2);
            }
          }
        }
      }

      function swapManAssignments(d1, d2, t1, t2) {
        assignedTargets.delete(t1);
        assignedTargets.delete(t2);
        d1.defenseAI.manTargetPlayer = null;
        d2.defenseAI.manTargetPlayer = null;
        assignMan(d1, t2);
        assignMan(d2, t1);
      }

      function assignMan(defender, target) {
        if (!target || assignedTargets.has(target)) { defender.role = 'zone'; return; }
        assignedTargets.add(target);
        defender.defenseAI.manTargetPlayer = target;
        defender.defenseAI.mode = 'man';
        const alignment = clampTarget({ x: target.x + alignmentOffsetFor(defender, target), y: target.y });
        defender.x = alignment.x;
        defender.y = alignment.y;
        defender.startX = alignment.x;
        defender.startY = alignment.y;
        defender.velocityX = 0;
        defender.velocityY = 0;
        defender.isMoving = false;
        defender.facingLeft = true;
        defender.defenseAI.anchor = { ...alignment };
      }
    }

    function onPassReleased(pass) {
      for (const defender of state.defenders) {
        const ai = defender.defenseAI;
        if (!ai || defender.role === 'rush') continue;
        ai.delay = calculateDefenderReactionDelay(defender, state.quarterback, lateralYards);
        const target = { x: pass.targetX, y: pass.targetY };
        const distanceToTarget = distance(defender, target);
        const hasDuration = Number.isFinite(pass.duration) && pass.duration > 0;
        const availableFlightTime = hasDuration ? Math.max(0, pass.duration - ai.delay) : 1.0;
        const estimatedReach = (defender.speed || 0) * availableFlightTime * 0.85;
        if (!hasDuration || distanceToTarget <= estimatedReach) {
          ai.mode = 'ball';
          ai.target = target;
        }
      }
    }

    function manTarget(name) {
      if (name === 'RB') return state.runningBack;
      if (name === 'TE') return state.receivers.find(p => p.position === 'TE');
      const match = /^WR(\d+)$/.exec(name || '');
      return match ? state.receivers.filter(p => p.position === 'WR')[Number(match[1]) - 1] : null;
    }

    function pursueTarget(defender, targetPlayer) {
      if (!targetPlayer) return defender;

      const rx = targetPlayer.x - defender.x;
      const ry = (targetPlayer.y - defender.y) * lateralYards;
      const dist = Math.hypot(rx, ry);

      const { vx, vy, speed: targetSpeed } = getPlayerMovementVelocity(targetPlayer, lateralYards);
      const defenderSpeed = Math.max(0.1, Number(defender.speed) || 5);

      if (targetSpeed < 0.05 || dist < 0.05) {
        return clampTarget({ x: targetPlayer.x, y: targetPlayer.y });
      }

      // Smooth closure lead time based on distance and defender speed.
      // At close range (< 1.2 yds), blend smoothly toward direct target to finish the tackle.
      const closeFactor = dist < 1.2 ? (dist / 1.2) : 1.0;
      const rawLeadTime = dist / (defenderSpeed + 0.1);
      const leadTime = Math.max(0.15, Math.min(PURSUIT_MAX_LEAD_TIME, rawLeadTime)) * closeFactor;

      let futureX = targetPlayer.x + vx * leadTime;
      let futureY = targetPlayer.y + (vy * leadTime) / lateralYards;

      if (rx < 0 && vx > 0) futureX = Math.min(defender.x - 0.05, futureX);
      if (rx > 0 && vx < 0) futureX = Math.max(defender.x + 0.05, futureX);

      // Role-based leverage adjustments from defense_ai.md:
      // 1. Deep safeties maintain downfield depth leverage (+1.5 yds cushion)
      const isSafety = defender.position === 'DB' && (defender.zone?.startsWith('deep') || defender.role === 'deep' || defender.zone === 'deep_free_safety');
      // 2. Contain defenders (CBs, outside defenders) cup the runner toward the sideline
      const isOutside = Math.abs(defender.y - 0.5) > Math.abs(targetPlayer.y - 0.5);

      if (isSafety && futureX > targetPlayer.x) {
        futureX += PURSUIT_SAFETY_CUSHION;
      } else if (isOutside && Math.abs(futureY - 0.5) > 0.05) {
        futureY += Math.sign(futureY - 0.5) * PURSUIT_CONTAIN_OFFSET;
      }

      return clampTarget({
        x: futureX,
        y: futureY
      });
    }

    function move(defender, target, delta, backpedal = false) {
      defender.desiredTarget = target;
      defender.isBackpedaling = backpedal;
      if (!target) { defender.coastToStop(delta); return; }
      defender.run(delta, target.x, target.y);
      if (backpedal) defender.facingLeft = true;
      const bounded = clampTarget(defender);
      defender.x = bounded.x;
      defender.y = bounded.y;
    }

    function updateDefender(defender, delta, phase, pass, carrier) {
      const ai = defender.defenseAI;
      if (!ai || defender.isTackled) return;
      if (defender.isGettingUp) {
        defender.updateGetUp?.(delta);
        return;
      }
      if (defender.pancakeTimer > 0) {
        defender.coastToStop(delta);
        return;
      }
      if (defender.isBlocking) {
        if (carrier) {
          defender.desiredTarget = pursueTarget(defender, carrier);
        }
        const blockDistance = carrier
          ? Math.hypot(carrier.x - defender.x, (carrier.y - defender.y) * lateralYards)
          : Infinity;
        if (carrier && blockDistance <= 0.5 && defender.canTackle?.(carrier)) {
          defender.tackle(carrier, { isDive: false, lateralYards });
        } else {
          defender.coastToStop(delta);
        }
        return;
      }

      if (defender.diveCooldownTimer > 0) {
        defender.diveCooldownTimer = Math.max(0, defender.diveCooldownTimer - delta);
      }
      if (defender.tackleMissRecoveryTimer > 0) {
        defender.tackleMissRecoveryTimer = Math.max(0, defender.tackleMissRecoveryTimer - delta);
        if (defender.tackleMissRecoveryTimer <= 0) {
          defender.wasDiving = false;
        }
        defender.coastToStop(delta);
        return;
      }
      if (defender.isDiving) {
        const target = carrier || (defender.role === 'rush' ? state.quarterback : null);
        defender.updateDive?.(delta, target, (def, car) => {
          attemptTackle(def, car, {
            isDive: true,
            lateralYards,
            forceSuccess: car === state.quarterback && state.phase === 'passing'
          });
        });
        return;
      }

      if (carrier && ai.mode !== 'pursuit') {
        ai.mode = 'pursuit';
        ai.delay = calculateDefenderReactionDelay(defender, carrier, lateralYards);
      }
      if (ai.delay > 0) {
        ai.delay = Math.max(0, ai.delay - delta);
        defender.coastToStop(delta);
        return;
      }
      if (ai.mode === 'pursuit' && carrier) {
        if (defender.canTackle?.(carrier)) {
          defender.tackle(carrier, { isDive: false, lateralYards });
        } else if (shouldDefenderDive(defender, carrier, { lateralYards, firstDownX: state.firstDownPosition, goalLineX: 100 })) {
          defender.diveTackle(carrier);
        } else {
          move(defender, pursueTarget(defender, carrier), delta);
        }
        return;
      }
      if (ai.mode === 'ball' && pass && ai.target) {
        move(defender, ai.target, delta);
        return;
      }
      if (defender.role === 'rush') {
        if (!state.quarterback?.hasBall) { defender.coastToStop(delta); return; }
        if (defender.canTackle?.(state.quarterback)) {
          defender.tackle(state.quarterback, { isDive: false, forceSuccess: true, lateralYards });
        } else if (shouldDefenderDive(defender, state.quarterback, { lateralYards, goalLineX: 100 })) {
          defender.diveTackle(state.quarterback);
        } else {
          move(defender, pursueTarget(defender, state.quarterback), delta);
        }
        return;
      }
      if (ai.mode === 'man' || defender.role === 'man') {
        const receiver = ai.manTargetPlayer || manTarget(defender.manTarget);
        if (!receiver) { move(defender, ai.anchor, delta, true); return; }
        if (ai.routeIndex !== null && receiver.routeIndex !== ai.routeIndex) {
          ai.delay = MAN_CUT_REACTION_DELAY;
        }
        ai.routeIndex = receiver.routeIndex;
        if (ai.delay > 0) { defender.coastToStop(delta); return; }

        const { vx, vy, speed: targetSpeed } = getPlayerMovementVelocity(receiver, lateralYards);
        const routeDistance = Math.hypot(
          receiver.x - receiver.startX,
          (receiver.y - receiver.startY) * lateralYards
        );

        if (targetSpeed > 0.05) {
          const dist = distance(defender, receiver);
          const tLead = Math.max(0.15, Math.min(1.2, dist / Math.max(0.1, Number(defender.speed) || 5)));
          const futureX = receiver.x + vx * tLead;
          const futureY = receiver.y + (vy * tLead) / lateralYards;

          const isAhead = defender.x > receiver.x;
          const isApproaching = vx > 0;
          let targetX = futureX;
          let targetY = futureY;

          // While ahead downfield and receiver is running forward, maintain cushion ahead of the route
          if (isAhead && isApproaching && Math.abs(vy) < 1.5) {
            const cushion = Math.max(1.0, Math.min(defender.coverageOffset || DEFAULT_COVERAGE_OFFSET, defender.x - receiver.x));
            targetX = Math.max(defender.x + 0.1, futureX + cushion * 0.5);
          }

          const isBackpedal = isAhead && (defender.x - receiver.x) >= 1.0 && Math.abs(vy) < 1.5 && routeDistance < 15;
          ai.lastTarget = clampTarget({ x: targetX, y: targetY });
          move(defender, ai.lastTarget, delta, isBackpedal);
        } else {
          ai.lastTarget = clampTarget({ x: receiver.x, y: receiver.y });
          move(defender, ai.lastTarget, delta, routeDistance < MAN_BACKPEDAL_YARDS);
        }
        return;
      }
      if (zoneEngine && (defender.role === 'zone' || defender.zone)) {
        zoneEngine.updateDefender(defender, delta);
        return;
      }
      if (defender.zone === 'deep_free_safety') {
        const deepestReceiver = state.receivers.reduce((deepest, receiver) =>
          !deepest || receiver.x > deepest.x ? receiver : deepest, null);
        const target = deepestReceiver ? pursueTarget(defender, deepestReceiver) : ai.anchor;
        const depth = Math.max(ai.anchor.x, (target?.x ?? ai.anchor.x) + 0.75);
        move(defender, clampTarget({ x: depth, y: target?.y ?? ai.anchor.y }), delta);
        return;
      }
      const targets = [...state.receivers, state.runningBack].filter(Boolean);
      const inside = targets.filter(receiver => distance(receiver, ai.anchor) <= ZONE_CONTEST_RADIUS)
        .sort((a, b) => distance(a, ai.anchor) - distance(b, ai.anchor))[0];
      const zoneTarget = inside ? pursueTarget(defender, inside) : ai.anchor;
      move(defender, zoneTarget, delta, !inside);
    }

    function update(delta) {
      const phase = state.phase;
      if (!['passing', 'running', 'thrown', 'catching'].includes(phase)) return;
      const qbRunning = state.quarterback?.hasBall && state.quarterback.x > state.scrimmagePosition;
      const carrier = state.runningBack?.hasBall ? state.runningBack
        : state.receivers.find(p => p.hasBall) || (qbRunning ? state.quarterback : null);

      if (carrier) {
        if (typeof carrier.tickTimers === 'function') {
          carrier.tickTimers(delta);
        } else {
          carrier.updateTackleImmunities?.(delta);
          if (carrier.stumbleTimer > 0) {
            carrier.stumbleTimer = Math.max(0, carrier.stumbleTimer - delta);
          }
        }
      }

      const isLiveCarrier = Boolean(carrier && (
        phase === 'running' ||
        carrier.hasBall ||
        (carrier === state.quarterback && carrier.x > state.scrimmagePosition)
      ));

      for (const defender of state.defenders) {
        if (defender.hasBall) continue;
        // Keep the DL still during coverage development. On a live carrier,
        // all defenders rally downhill to pursue and tackle.
        const isDefensiveLineman = ['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(String(defender.position || '').toUpperCase());
        if (isDefensiveLineman && !isLiveCarrier && defender.defenseAI?.mode !== 'ball') continue;
        updateDefender(defender, delta, phase, state.pass, isLiveCarrier ? carrier : null);
      }
      if (playEndsFromTackle(carrier, state.quarterback)) state.phase = 'complete';
    }

    return { initialize, onPassReleased, update, updateDefender, pursueTarget, getPlayerMovementVelocity };
  }

  root.GameDefenseAI = { create, calculateDefenderReactionDelay, getPlayerMovementVelocity, RECEIVER_BREAK_DELAY };
  if (typeof module !== 'undefined') module.exports = root.GameDefenseAI;
})(typeof window !== 'undefined' ? window : globalThis);
