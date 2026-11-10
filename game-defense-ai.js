(function (root) {
  const ZONE_CONTEST_RADIUS = 3;
  const DEFAULT_COVERAGE_OFFSET = 4;
  const MAN_BACKPEDAL_YARDS = 2.5;
  const MAN_CUT_REACTION_DELAY = 0.2;
  const RECEIVER_BREAK_DELAY = 0.05;
  const PURSUIT_MAX_LEAD_TIME = 1.5;

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
      }
      if (coverageType !== 'man') return;

      // Explicit manTarget assignments take priority and determine alignment.
      // DBs without an explicit target are then assigned to the nearest
      // uncovered WR/TE. Remaining defenders stay in their called zones.
      const eligibleReceivers = state.receivers.filter(player => ['WR', 'TE'].includes(player.position));
      for (const defender of defenders) {
        if (defender.role !== 'man' || ['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(defender.position) || defender.role === 'rush' || !defender.manTarget) continue;
        assignMan(defender, manTarget(defender.manTarget));
      }
      for (const defender of defenders) {
        if (defender.role !== 'man' || ['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(defender.position) || defender.role === 'rush'
          || defender.position !== 'DB' || defender.defenseAI.manTargetPlayer) continue;
        const target = eligibleReceivers
          .filter(receiver => !assignedTargets.has(receiver))
          .sort((a, b) => distance(defender, a) - distance(defender, b))[0];
        if (target) assignMan(defender, target);
        else defender.role = 'zone';
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

    function pursueTarget(defender, carrier) {
      const rx = carrier.x - defender.x;
      const ry = (carrier.y - defender.y) * lateralYards;
      const vx = Number(carrier.velocityX) || 0;
      const vy = (Number(carrier.velocityY) || 0) * lateralYards;
      const carrierSpeed = Math.hypot(vx, vy);
      const defenderSpeed = Math.max(0.1, Number(defender.speed) || 0);

      // If the defender is already ahead along the carrier's path, close on
      // the carrier's current position instead of running farther downfield.
      const defenderIsAhead = carrierSpeed > 0.05 && rx * vx + ry * vy < 0;
      let leadTime = 0;
      if (carrierSpeed > 0.05 && !defenderIsAhead) {
        // Solve |carrierPosition + carrierVelocity * t - defenderPosition|
        // = defenderSpeed * t, then use the earliest reachable intercept.
        const a = vx * vx + vy * vy - defenderSpeed * defenderSpeed;
        const b = 2 * (rx * vx + ry * vy);
        const c = rx * rx + ry * ry;
        const discriminant = b * b - 4 * a * c;
        let interceptTime = Infinity;
        if (Math.abs(a) < 1e-6) {
          if (b < 0) interceptTime = -c / b;
        } else if (discriminant >= 0) {
          const root = Math.sqrt(discriminant);
          const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
            .filter(time => time > 0);
          if (candidates.length) interceptTime = Math.min(...candidates);
        }
        if (Number.isFinite(interceptTime)) {
          leadTime = Math.min(PURSUIT_MAX_LEAD_TIME, interceptTime);
        }
      }
      return clampTarget({
        x: carrier.x + (carrier.velocityX || 0) * leadTime,
        y: carrier.y + (carrier.velocityY || 0) * leadTime
      });
    }

    function move(defender, target, delta, backpedal = false) {
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
        if (defender.canTackle?.(carrier)) defender.tackle(carrier);
        else move(defender, pursueTarget(defender, carrier), delta);
        return;
      }
      if (ai.mode === 'ball' && pass && ai.target) {
        move(defender, ai.target, delta);
        return;
      }
      if (defender.role === 'rush') {
        if (!state.quarterback?.hasBall) { defender.coastToStop(delta); return; }
        if (defender.canTackle?.(state.quarterback)) defender.tackle(state.quarterback);
        else move(defender, state.quarterback, delta);
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
        // coverageOffset sets only the pre-snap cushion. Once the route starts,
        // lead the receiver toward a reachable meet point instead of chasing
        // their current location and trailing behind their route.
        ai.lastTarget = pursueTarget(defender, receiver);
        const routeDistance = Math.hypot(
          receiver.x - receiver.startX,
          (receiver.y - receiver.startY) * lateralYards
        );
        move(defender, ai.lastTarget, delta, routeDistance < MAN_BACKPEDAL_YARDS);
        return;
      }
      if (zoneEngine && (defender.role === 'zone' || defender.zone)) {
        zoneEngine.updateDefender(defender, delta);
        return;
      }
      if (defender.zone === 'deep_free_safety') {
        const deepestReceiver = state.receivers.reduce((deepest, receiver) =>
          !deepest || receiver.x > deepest.x ? receiver : deepest, null);
        const depth = Math.max(ai.anchor.x, (deepestReceiver?.x ?? ai.anchor.x) + 0.75);
        move(defender, clampTarget({ x: depth, y: ai.anchor.y }), delta);
        return;
      }
      const targets = [...state.receivers, state.runningBack].filter(Boolean);
      const inside = targets.filter(receiver => distance(receiver, ai.anchor) <= ZONE_CONTEST_RADIUS)
        .sort((a, b) => distance(a, ai.anchor) - distance(b, ai.anchor))[0];
      move(defender, inside || ai.anchor, delta, !inside);
    }

    function update(delta) {
      const phase = state.phase;
      if (!['passing', 'running', 'thrown', 'catching'].includes(phase)) return;
      const qbRunning = state.quarterback?.hasBall && state.quarterback.x > state.scrimmagePosition;
      const carrier = state.runningBack?.hasBall ? state.runningBack
        : state.receivers.find(p => p.hasBall) || (qbRunning ? state.quarterback : null);

      // Keep pursuit selective for the current carrier. Nearby defenders
      // pursue; everyone else retains their man or zone assignment.
      if (carrier !== state.defensivePursuitCarrier) {
        state.defensivePursuitCarrier = carrier || null;
        state.defensivePursuers = carrier
          ? [...state.defenders]
            .filter(defender => !defender.hasBall && !defender.isTackled)
            .sort((a, b) => distance(a, carrier) - distance(b, carrier))
            .slice(0, 2)
          : [];
        for (const defender of state.defenders) {
          const ai = defender.defenseAI;
          if (!ai || state.defensivePursuers.includes(defender)) continue;
          if (ai.mode === 'pursuit' || ai.mode === 'ball') {
            ai.mode = ai.manTargetPlayer ? 'man' : 'coverage';
            ai.target = null;
            ai.delay = 0;
          }
        }
      }
      const pursuers = new Set(state.defensivePursuers || []);
      for (const defender of state.defenders) {
        if (defender.hasBall) continue;
        // Keep the DL still during coverage development. On a live carrier,
        // only selected pursuers leave their assignments to tackle.
        const isDefensiveLineman = ['DL', 'DT', 'DE', 'NT', 'EDGE'].includes(String(defender.position || '').toUpperCase());
        if (isDefensiveLineman && !carrier && defender.defenseAI?.mode !== 'ball') continue;
        updateDefender(defender, delta, phase, state.pass, carrier && pursuers.has(defender) ? carrier : null);
      }
      if (carrier?.isTackled || state.quarterback?.isTackled) state.phase = 'complete';
    }

    return { initialize, onPassReleased, update, updateDefender };
  }

  root.GameDefenseAI = { create, calculateDefenderReactionDelay, RECEIVER_BREAK_DELAY };
  if (typeof module !== 'undefined') module.exports = root.GameDefenseAI;
})(typeof window !== 'undefined' ? window : globalThis);
