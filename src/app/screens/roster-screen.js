const DEFENSE = new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'MLB', 'OLB', 'DB', 'CB', 'S', 'FS', 'SS']);

export function renderRoster({ view, bindText, appendPortrait, state, group }) {
  const component = view('roster');
  const { team } = state;
  const grid = component.querySelector('[data-bind="player-grid"]');
  const cardTemplate = component.querySelector('[data-template="player-card"]');
  const showDefense = group === 'defense';
  const players = team.players.filter(player => DEFENSE.has(player.position) === showDefense);
  bindText(component, 'team-title', `${team.city.toUpperCase()} ${team.name.toUpperCase()}`);
  bindText(component, 'player-count', `${players.length} PLAYERS`);
  component.querySelector('[data-bind="empty-roster"]').hidden = players.length > 0;
  component.querySelectorAll('[data-action="roster-group"]').forEach(tab => tab.classList.toggle('active', tab.dataset.group === group));
  for (const player of players) {
    const card = cardTemplate.content.cloneNode(true);
    const button = card.querySelector('.player-card');
    button.dataset.playerId = player.id;
    button.setAttribute('aria-label', `View ${player.name}, ${player.position}`);
    bindText(card, 'position', player.position);
    bindText(card, 'name', String(player.name || '').trim().split(/\s+/).at(-1));
    bindText(card, 'overall', player.rating ?? 0);
    appendPortrait(card.querySelector('[data-bind="portrait"]'), team, player, team.players.indexOf(player));
    grid.append(card);
  }
  return component;
}
