export function playTypeFor(play) {
  const type = String(play?.playType || play?.playtype || play?.type || 'pass').toLowerCase();
  return type === 'run' ? 'run' : 'pass';
}
