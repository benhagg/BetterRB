export function renderGameScreen({ view, bindText, session, scheduledGame, formatClock, renderPlayCards }) {
  const component = view('game');
  const { state } = session;
  const playerIsHome = scheduledGame.location === 'HOME';
  const homeTeam = playerIsHome ? session.team1 : session.team2;
  const awayTeam = playerIsHome ? session.team2 : session.team1;
  bindText(component, 'home-team', homeTeam.abbreviation);
  bindText(component, 'home-score', playerIsHome ? state.score1 : state.score2);
  bindText(component, 'away-team', awayTeam.abbreviation);
  bindText(component, 'away-score', playerIsHome ? state.score2 : state.score1);
  bindText(component, 'quarter', `Q${state.quarter}`);
  component.querySelector('#game-clock').textContent = formatClock(state.clockSeconds);
  renderPlayCards(component);
  return component;
}
