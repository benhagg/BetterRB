export function renderHome({ view, bindText, state, nextGame }) {
  const component = view('home');
  const next = nextGame();
  const { team, record } = state;
  bindText(component, 'city', team.city.toUpperCase());
  bindText(component, 'team-name', team.name.toUpperCase());
  bindText(component, 'abbreviation', team.abbreviation);
  bindText(component, 'record', `${record.wins}-${record.losses}-${record.ties}`);
  bindText(component, 'fans', Number(team.fans || 0).toLocaleString());
  bindText(component, 'cap', `$${team.cap || 0}M`);
  bindText(component, 'next-title', next ? `UP NEXT · WEEK ${next.week}` : 'SEASON COMPLETE');
  bindText(component, 'player-name', team.name.toUpperCase());
  bindText(component, 'opponent-name', next ? next.opponent.name.toUpperCase() : 'FINAL');
  bindText(component, 'play-label', next ? 'PLAY GAME' : 'SEASON COMPLETE');
  component.querySelector('[data-bind="play-button"]').dataset.action = next ? 'game' : 'schedule';
  return component;
}
