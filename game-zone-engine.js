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

  function create({ state, lateralYards = 17, fieldBounds }) {
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

      if (rule.type === 'spy') {
        const qb = state.quarterback;
        const spyX = qb.x <= los ? Math.max(los - 1, qb.x + 2) : qb.x;
        target = { x: spyX, y: qb.y };
      } else if (rule.type === 'deep') {
        const threats = threatsIn(rule, los, fieldBounds.endZoneR);
        const deepest = threats.reduce((best, player) => !best || player.x > best.x ? player : best, null);
        const depth = Math.max(anchor.x, (deepest?.x ?? anchor.x) + (rule.stayDeepest ? 0.75 : 0.5));
        target = { x: depth, y: deepest ? clamp(deepest.y, ...rule.lane) : anchor.y };
      } else {
        const maxDepth = rule.type === 'flat' ? 7 : 12;
        const minX = los + (rule.type === 'flat' ? 0 : DEFAULT_DEPTH.shallow);
        const maxX = los + maxDepth;
        const threats = threatsIn(rule, minX, maxX);
        const closest = threats.sort((a, b) => distance(defender, a) - distance(defender, b))[0];
        const homeX = clamp(los + (rule.depth ?? DEFAULT_DEPTH.shallow), minX, maxX);
        const homeY = clamp(anchor.y, ...rule.lane);
        target = closest
          ? { x: clamp(closest.x + 0.35, minX, maxX), y: clamp(closest.y, ...rule.lane) }
          : { x: homeX, y: homeY };
      }

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
