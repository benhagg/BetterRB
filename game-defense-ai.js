(function (root) {
  const ZONE_CONTEST_RADIUS = 3;
  const MAN_CUSHION_DISTANCE = 4;
  const MAN_CUT_REACTION_DELAY = 0.2;
  const RECEIVER_BREAK_DELAY = 0.05;
  const PURSUIT_CONTAIN_OFFSET = 0.08;
  const PURSUIT_SAFETY_CUSHION = 1.5;
  const PURSUIT_MAX_LEAD_TIME = 1.5;

  function calculateDefenderReactionDelay(defender, target, lateralYards = 17) {
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

  function create({ state, lateralYards = 17, fieldBounds }) {
    const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * lateralYards);
    const clampTarget = target => ({
      x: Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, target.x)),
      y: Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, target.y))
    });

    function initialize(defenders) {
      for (const defender of defenders) {
        defender.defenseAI = { anchor: { x: defender.x, y: defender.y }, mode: 'coverage', delay: 0, routeIndex: null, lastTarget: null };
        defender.isBackpedaling = false;
      }
    }

    function onPassReleased(pass) {
      for (const defender of state.defenders) {
        const ai = defender.defenseAI;
        if (!ai || defender.role === 'rush') continue;
        ai.mode = 'ball';
        ai.delay = calculateDefenderReactionDelay(defender, state.quarterback, lateralYards);
        ai.target = { x: pass.targetX, y: pass.targetY };
      }
    }

    function manTarget(name) {
      if (name === 'RB') return state.runningBack;
      if (name === 'TE') return state.receivers.find(p => p.position === 'TE');
      const match = /^WR(\d+)$/.exec(name || '');
      return match ? state.receivers.filter(p => p.position === 'WR')[Number(match[1]) - 1] : null;
    }

    function pursueTarget(defender, carrier) {
      const time = Math.max(0.1, Math.min(PURSUIT_MAX_LEAD_TIME, distance(defender, carrier) / ((defender.speed || 0) + 0.1)));
      let x = carrier.x + (carrier.velocityX || 0) * time;
      let y = carrier.y + (carrier.velocityY || 0) * time;
      const zone = defender.zone || '';
      if (defender.position === 'DB' && zone.startsWith('deep')) x += PURSUIT_SAFETY_CUSHION;
      else if (defender.position === 'DB' || (defender.position === 'LB' && Math.abs(defender.across || 0) >= 0.2)) {
        y += Math.sign(carrier.y - 0.5) * PURSUIT_CONTAIN_OFFSET;
      }
      return clampTarget({ x, y });
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
      if (ai.mode === 'ball' && pass) {
        move(defender, ai.target, delta);
        return;
      }
      if (defender.role === 'rush') {
        if (state.quarterback?.hasBall && defender.canTackle?.(state.quarterback)) defender.tackle(state.quarterback);
        else move(defender, state.quarterback, delta);
        return;
      }
      if (defender.role === 'man') {
        const receiver = manTarget(defender.manTarget);
        if (!receiver) { move(defender, ai.anchor, delta, true); return; }
        if (ai.routeIndex !== null && receiver.routeIndex !== ai.routeIndex) {
          ai.delay = MAN_CUT_REACTION_DELAY;
        }
        ai.routeIndex = receiver.routeIndex;
        if (ai.delay > 0) { defender.coastToStop(delta); return; }
        ai.lastTarget = clampTarget({ x: receiver.x + MAN_CUSHION_DISTANCE, y: receiver.y });
        move(defender, ai.lastTarget, delta, true);
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
      for (const defender of state.defenders) updateDefender(defender, delta, phase, state.pass, carrier);
      if (carrier?.isTackled || state.quarterback?.isTackled) state.phase = 'complete';
    }

    return { initialize, onPassReleased, update, updateDefender };
  }

  root.GameDefenseAI = { create, calculateDefenderReactionDelay, RECEIVER_BREAK_DELAY };
  if (typeof module !== 'undefined') module.exports = root.GameDefenseAI;
})(typeof window !== 'undefined' ? window : globalThis);
