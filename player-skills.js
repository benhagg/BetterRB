(function (root) {
  const defense = new Set([
    'D', 'DEF', 'DEFENSE', 'DL', 'DE', 'DT', 'NT', 'EDGE',
    'LB', 'ILB', 'MLB', 'OLB', 'SLB', 'WLB',
    'DB', 'CB', 'NB', 'S', 'FS', 'SS', 'SAF', 'SAFETY',
    'LINEBACKER', 'CORNERBACK', 'DEFENSIVE END', 'DEFENSIVE TACKLE'
  ]);
  const skills = {
    accuracy: { key: 'accuracy', short: 'ACC', label: 'ACCURACY' },
    tackling: { key: 'tackling', short: 'TKL', label: 'TACKLING' },
    catching: { key: 'catching', short: 'CTH', label: 'CATCHING' }
  };

  function forPosition(position) {
    const code = String(position || '').trim().toUpperCase();
    if (['QB', 'K', 'PK', 'QUARTERBACK', 'KICKER'].includes(code)) return skills.accuracy;
    if (defense.has(code)) return skills.tackling;
    return skills.catching;
  }

  function ensureRatings(player, sourceScale = 10) {
    let changed = false;
    if (!player.ratings || typeof player.ratings !== 'object' || Array.isArray(player.ratings)) {
      player.ratings = {};
      changed = true;
    }
    const points = value => Math.max(0, Math.min(10, Math.round(sourceScale === 100 ? value / 10 : value)));
    const initial = Number.isFinite(player.rating) ? points(player.rating) : 5;
    if (Number.isFinite(player.rating) && player.rating !== initial) {
      player.rating = initial;
      changed = true;
    }
    if (!Number.isFinite(player.xp)) {
      player.xp = 0;
      changed = true;
    }
    for (const key of Object.keys(player.ratings)) {
      if (Number.isFinite(player.ratings[key])) {
        const value = points(player.ratings[key]);
        if (player.ratings[key] !== value) {
          player.ratings[key] = value;
          changed = true;
        }
      }
    }
    for (const key of ['strength', 'speed', 'stamina', forPosition(player.position).key]) {
      if (player.ratings[key] == null) {
        player.ratings[key] = initial;
        changed = true;
      }
    }
    return changed;
  }

  const api = { forPosition, ensureRatings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlayerSkills = api;
})(typeof window === 'undefined' ? null : window);
