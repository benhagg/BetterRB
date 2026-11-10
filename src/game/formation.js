export function acrossToY(across, lateralYards) {
  return 0.5 - (across ?? 0) / lateralYards;
}
