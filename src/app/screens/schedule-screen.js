export function renderSchedule({ view, bindText, state, nextGame, teamTitle }) {
  const component = view('schedule');
  const current = nextGame();
  const rowTemplate = component.querySelector('[data-template="schedule-row"]');
  const games = component.querySelector('[data-bind="games"]');
  for (const game of state.schedule) {
    const row = rowTemplate.content.cloneNode(true);
    row.querySelector('.schedule-row').classList.toggle('current', game === current);
    bindText(row, 'week', `Wk ${game.week}`);
    bindText(row, 'matchup', `${game.location === 'HOME' ? '@' : 'vs'} ${teamTitle(game.opponent)}`);
    bindText(row, 'score', game.score ? `${game.score[0]}-${game.score[1]}` : '–');
    games.append(row);
  }
  return component;
}
