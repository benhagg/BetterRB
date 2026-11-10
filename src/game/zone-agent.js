(function (root) {
  const DEFAULT_DEPTH = { shallow: 3, deep: 12 };

  // Zone names are attached to defenders in dplays.json. Across-field positions
  // use yards relative to midfield; depth is measured from the line of scrimmage.
  const ZONE_RULES = {
    middle: { type: 'underneath', lane: [0.3, 0.7], depth: 7 },
    middle_hook: { type: 'underneath', lane: [0.3, 0.7], depth: 7 },
    hook_curl: { type: 'underneath', lane: [0.3, 0.7], depth: 7 },
    hook_curl_left: { type: 'underneath', lane: [0, 0.5], depth: 7 },
    hook_curl_right: { type: 'underneath', lane: [0.5, 1], depth: 7 },
    flat_left: { type: 'flat', lane: [0, 0.34], depth: 3 },
    flat_right: { type: 'flat', lane: [0.66, 1], depth: 3 },
    flat_top: { type: 'flat', lane: [0, 0.34], depth: 3 },
    flat_bottom: { type: 'flat', lane: [0.66, 1], depth: 3 },
    hook_top: { type: 'underneath', lane: [0, 0.5], depth: 7 },
    hook_bottom: { type: 'underneath', lane: [0.5, 1], depth: 7 },
    deep_half_left: { type: 'deep', lane: [0, 0.5] },
    deep_half_right: { type: 'deep', lane: [0.5, 1] },
    deep_third_left: { type: 'deep', lane: [0, 0.34] },
    deep_third_middle: { type: 'deep', lane: [0.33, 0.67] },
    deep_third_right: { type: 'deep', lane: [0.66, 1] },
    deep_top: { type: 'deep', lane: [0, 0.34] },
    deep_middle: { type: 'deep', lane: [0.33, 0.67] },
    deep_bottom: { type: 'deep', lane: [0.66, 1] },
    deep_free_safety: { type: 'deep', lane: [0, 1], stayDeepest: true },
    spy: { type: 'spy', lane: [0, 1] }
  };

  function create({ state, lateralYards = 25, fieldBounds }) {
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const clampTarget = target => ({
      x: clamp(target.x, fieldBounds.endZoneL, fieldBounds.endZoneR),
      y: clamp(target.y, fieldBounds.top, fieldBounds.bottom)
    });
    const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * lateralYards);
    const eligible = () => [...state.receivers, state.runningBack].filter(Boolean);

    function threatsIn(rule, minX, maxX) {
      const [laneStart, laneEnd] = rule.lane;
      return eligible().filter(player => player.x >= minX && player.x <= maxX
        && player.y >= laneStart && player.y <= laneEnd);
    }

    function updateDefender(defender, delta) {
      const ai = defender.defenseAI;
      const zoneName = defender.zone || 'middle';
      const rule = ZONE_RULES[zoneName] || ZONE_RULES.middle;
      const anchor = ai.anchor;
      const los = state.scrimmagePosition;
      let target;

      const getVel = (player) => {
        if (!player) return { vx: 0, vy: 0 };
        const vx = Number(player.velocityX) || 0;
        const vy = (Number(player.velocityY) || 0) * lateralYards;
        return { vx, vy };
      };

      if (rule.type === 'spy') {
        const qb = state.quarterback;
        const { vx, vy } = getVel(qb);
        const dist = distance(defender, qb);
        const tLead = Math.hypot(vx, vy) > 0.05
          ? Math.max(0.1, Math.min(1.0, dist / Math.max(0.1, Number(defender.speed) || 5)))
          : 0;
        const futureX = qb.x + vx * tLead;
        const futureY = qb.y + (vy * tLead) / lateralYards;
        const spyX = futureX <= los ? Math.max(los - 1, futureX + 2) : futureX;
        target = { x: spyX, y: futureY };
      } else if (rule.type === 'deep') {
        const threats = threatsIn(rule, los, fieldBounds.endZoneR);
        const deepest = threats.reduce((best, player) => !best || player.x > best.x ? player : best, null);
        if (deepest) {
          const { vx, vy } = getVel(deepest);
          const dist = distance(defender, deepest);
          const tLead = Math.hypot(vx, vy) > 0.05
            ? Math.max(0.1, Math.min(1.2, dist / Math.max(0.1, Number(defender.speed) || 5)))
            : 0;
          const futureX = deepest.x + vx * tLead;
          const futureY = deepest.y + (vy * tLead) / lateralYards;
          const depth = Math.max(anchor.x, futureX + (rule.stayDeepest ? 0.75 : 0.5));
          target = { x: depth, y: clamp(futureY, ...rule.lane) };
        } else {
          target = { x: anchor.x, y: anchor.y };
        }
      } else {
        const maxDepth = rule.type === 'flat' ? 7 : 12;
        const minX = los + (rule.type === 'flat' ? 0 : DEFAULT_DEPTH.shallow);
        const maxX = los + maxDepth;
        const threats = threatsIn(rule, minX, maxX);
        const closest = threats.sort((a, b) => distance(defender, a) - distance(defender, b))[0];
        const homeX = clamp(los + (rule.depth ?? DEFAULT_DEPTH.shallow), minX, maxX);
        const homeY = clamp(anchor.y, ...rule.lane);
        if (closest) {
          const { vx, vy } = getVel(closest);
          const dist = distance(defender, closest);
          const tLead = Math.hypot(vx, vy) > 0.05
            ? Math.max(0.1, Math.min(1.0, dist / Math.max(0.1, Number(defender.speed) || 5)))
            : 0;
          const futureX = closest.x + vx * tLead;
          const futureY = closest.y + (vy * tLead) / lateralYards;
          target = { x: clamp(futureX + 0.35, minX, maxX), y: clamp(futureY, ...rule.lane) };
        } else {
          target = { x: homeX, y: homeY };
        }
      }

      defender.desiredTarget = target;
      defender.isBackpedaling = false;
      defender.run(delta, target.x, target.y);
      const bounded = clampTarget(defender);
      defender.x = bounded.x;
      defender.y = bounded.y;
    }

    return { updateDefender, zones: ZONE_RULES };
  }

  root.GameZoneEngine = { create, zones: ZONE_RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GameZoneEngine;
})(typeof window !== 'undefined' ? window : globalThis);
