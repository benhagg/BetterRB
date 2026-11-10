export function pickRandomPlays(allPlays, count = 3) {
  if (!Array.isArray(allPlays) || allPlays.length === 0) return [];
  return [...allPlays].sort(() => Math.random() - 0.5).slice(0, Math.min(count, allPlays.length));
}
