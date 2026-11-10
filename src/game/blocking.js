export function nearestDefender(player, defenders, lateralYards) {
  let defender = null;
  let distance = Infinity;
  for (const candidate of defenders || []) {
    const candidateDistance = Math.hypot(candidate.x - player.x, (candidate.y - player.y) * lateralYards);
    if (candidateDistance < distance) {
      defender = candidate;
      distance = candidateDistance;
    }
  }
  return { defender, distance };
}
