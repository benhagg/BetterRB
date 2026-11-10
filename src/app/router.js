export function parseRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const playerMatch = path.match(/^\/roster\/([^/]+)$/);
  if (playerMatch) return { screen: 'player', playerId: decodeURIComponent(playerMatch[1]) };
  if (path === '/roster') return { screen: 'roster', playerId: null };
  if (path === '/schedule') return { screen: 'schedule', playerId: null };
  if (path === '/game') return { screen: 'game', playerId: null };
  return { screen: 'home', playerId: null };
}
