export function renderPlayer({ view, bindText, appendPortrait, appendRatings, state, playerId, renderRoster }) {
  const { team } = state;
  const player = team.players.find(item => String(item.id) === playerId);
  if (!player) return renderRoster();
  const component = view('player');
  bindText(component, 'name', player.name.toUpperCase());
  bindText(component, 'position', player.position);
  bindText(component, 'team-title', `${team.city} ${team.name}`);
  bindText(component, 'rating', player.rating ?? 0);
  bindText(component, 'potential', player.potential ?? player.rating ?? 0);
  appendPortrait(component.querySelector('[data-bind="portrait"]'), team, player, team.players.indexOf(player));
  const skill = PlayerSkills.forPosition(player.position);
  appendRatings(component.querySelector('[data-bind="ratings"]'), player.ratings, [['strength', 'STRENGTH'], ['speed', 'SPEED'], ['agility', 'AGILITY'], [skill.key, skill.label]], player.potentialRatings);
  return component;
}
