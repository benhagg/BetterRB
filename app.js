const app = document.querySelector('#app');
const viewNames = ['shell', 'home', 'roster', 'player', 'schedule', 'game', 'rating', 'portrait'];
const views = new Map();
let screen = 'home';
let seasonState = null;
let gameSession = null;
let activeScheduledGame = null;
let selectedPlayerId = null;
let rosterGroup = 'offense';
let gameFrame = null;
let gameFullscreen = false;
let saveQueue = Promise.resolve();
const movementKeys = new Set();

async function initialize() {
  app.textContent = 'Loading season...';
  try {
    const responses = await Promise.all([
      fetch('/api/state', { cache: 'no-store' }),
      ...viewNames.map(name => fetch(`/views/${name}.html`, { cache: 'no-store' }))
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Could not load season or view files');
    const [state, ...markup] = await Promise.all([responses[0].json(), ...responses.slice(1).map(response => response.text())]);
    for (let i = 0; i < viewNames.length; i++) {
      const template = document.createElement('template');
      template.innerHTML = markup[i];
      views.set(viewNames[i], template.content);
    }
    seasonState = state;
    applyRoute();
    render();
  } catch (error) {
    app.textContent = 'Unable to load the game. Restart the local server and refresh.';
    console.error(error);
  }
}

function applyRoute(pathname = window.location.pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const playerMatch = path.match(/^\/roster\/([^/]+)$/);
  if (playerMatch) {
    screen = 'player';
    selectedPlayerId = decodeURIComponent(playerMatch[1]);
  } else if (path === '/roster') {
    screen = 'roster';
    selectedPlayerId = null;
  } else if (path === '/schedule') {
    screen = 'schedule';
    selectedPlayerId = null;
  } else if (path === '/game') {
    screen = 'game';
    selectedPlayerId = null;
  } else {
    screen = 'home';
    selectedPlayerId = null;
  }
}

function navigate(path, { replace = false } = {}) {
  if (window.location.pathname !== path) history[replace ? 'replaceState' : 'pushState']({}, '', path);
  applyRoute(path);
  render();
}

function view(name) {
  return views.get(name).cloneNode(true);
}

function bindText(root, name, value) {
  root.querySelector(`[data-bind="${name}"]`).textContent = String(value);
}

function appendRatings(target, ratings, labels, potentialRatings = null) {
  for (const [key, label] of labels) {
    const component = view('rating');
    const rating = Math.min(10, Math.max(0, Number(ratings?.[key]) || 0));
    const potential = Math.min(10, Math.max(rating, Number(potentialRatings?.[key]) || rating));
    bindText(component, 'label', label);
    bindText(component, 'value', rating);
    component.querySelectorAll('.rating-block').forEach((block, index) => {
      block.classList.toggle('filled', index < Math.round(rating));
      block.classList.toggle('potential', index >= Math.round(rating) && index < Math.round(potential));
    });
    target.append(component);
  }
}

function appendPortrait(target, team, player, index) {
  const component = view('portrait');
  const portrait = component.querySelector('.pixel-player');
  const defaults = [0, 1, 2, 3, 5, 6, 7, 8, 9];
  const frame = Number.isInteger(player.portrait) ? player.portrait : defaults[index % defaults.length];
  RetroSprites.paintPortrait(portrait, frame, team.colors.home || team.colors).catch(error => console.error(error));
  target.append(component);
}

function persistState() {
  const snapshot = JSON.stringify(seasonState);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot
    });
    if (!response.ok) throw new Error('Could not save season data');
  });
  return saveQueue;
}

function nextScheduledGame() {
  return seasonState?.schedule.find(game => !game.played) || null;
}

function teamTitle(team) {
  return team.city === team.name ? team.city : `${team.city} ${team.name}`;
}

function shell(content) {
  const component = view('shell');
  const next = nextScheduledGame();
  const week = next ? next.week : seasonState.schedule.length + 1;
  bindText(component, 'season-week', `SEASON ${seasonState.season} · WEEK ${String(week).padStart(2, '0')}`);
  component.querySelector('[data-content]').append(content);
  return component;
}

function home() {
  const component = view('home');
  const next = nextScheduledGame();
  const team = seasonState.team;
  const record = seasonState.record;
  bindText(component, 'city', team.city.toUpperCase());
  bindText(component, 'team-name', team.name.toUpperCase());
  bindText(component, 'abbreviation', team.abbreviation);
  bindText(component, 'record', `${record.wins}-${record.losses}-${record.ties}`);
  bindText(component, 'fans', Number(team.fans || 0).toLocaleString());
  bindText(component, 'cap', `$${team.cap || 0}M`);
  bindText(component, 'next-title', next ? `UP NEXT · WEEK ${next.week}` : 'SEASON COMPLETE');
  bindText(component, 'player-name', team.name.toUpperCase());
  bindText(component, 'opponent-name', next ? next.opponent.name.toUpperCase() : 'FINAL');
  bindText(component, 'play-label', next ? seasonState.currentGame ? 'RESUME GAME' : 'PLAY GAME' : 'SEASON COMPLETE');
  component.querySelector('[data-bind="play-button"]').dataset.action = next ? 'game' : 'schedule';
  return component;
}

function rosterPanel() {
  const component = view('roster');
  const team = seasonState.team;
  const grid = component.querySelector('[data-bind="player-grid"]');
  const cardTemplate = component.querySelector('[data-template="player-card"]');
  bindText(component, 'team-title', `${team.city.toUpperCase()} ${team.name.toUpperCase()}`);
  const defensePositions = new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'MLB', 'OLB', 'DB', 'CB', 'S', 'FS', 'SS']);
  const showDefense = rosterGroup === 'defense';
  const players = team.players.filter(player => defensePositions.has(player.position) === showDefense);
  bindText(component, 'player-count', `${players.length} PLAYERS`);
  component.querySelector('[data-bind="empty-roster"]').hidden = players.length > 0;
  component.querySelectorAll('[data-action="roster-group"]').forEach(tab => tab.classList.toggle('active', tab.dataset.group === rosterGroup));
  for (const player of players) {
    const card = cardTemplate.content.cloneNode(true);
    const button = card.querySelector('.player-card');
    button.dataset.playerId = player.id;
    button.setAttribute('aria-label', `View ${player.name}, ${player.position}`);
    bindText(card, 'position', player.position);
    bindText(card, 'name', player.name);
    bindText(card, 'overall', player.rating ?? 0);
    appendPortrait(card.querySelector('[data-bind="portrait"]'), team, player, team.players.indexOf(player));
    grid.append(card);
  }
  return component;
}

function playerPanel() {
  const team = seasonState.team;
  const player = team.players.find(item => String(item.id) === selectedPlayerId);
  if (!player) return rosterPanel();
  const component = view('player');
  bindText(component, 'name', player.name.toUpperCase());
  bindText(component, 'position', player.position);
  bindText(component, 'team-title', `${team.city} ${team.name}`);
  appendPortrait(component.querySelector('[data-bind="portrait"]'), team, player, team.players.indexOf(player));
  const skill = PlayerSkills.forPosition(player.position);
  appendRatings(component.querySelector('[data-bind="ratings"]'), player.ratings, [['strength', 'STRENGTH'], ['speed', 'SPEED'], ['agility', 'AGILITY'], [skill.key, skill.label]], player.potentialRatings);
  return component;
}

function schedulePanel() {
  const component = view('schedule');
  const current = nextScheduledGame();
  const rowTemplate = component.querySelector('[data-template="schedule-row"]');
  const games = component.querySelector('[data-bind="games"]');
  for (const game of seasonState.schedule) {
    const row = rowTemplate.content.cloneNode(true);
    row.querySelector('.schedule-row').classList.toggle('current', game === current);
    bindText(row, 'week', `Wk ${game.week}`);
    bindText(row, 'matchup', `${game.location === 'HOME' ? '@' : 'vs'} ${teamTitle(game.opponent)}`);
    bindText(row, 'score', game.score ? `${game.score[0]}-${game.score[1]}` : '–');
    games.append(row);
  }
  return component;
}

function gamePanel() {
  const component = view('game');
  const state = gameSession.state;
  const playerIsHome = activeScheduledGame.location === 'HOME';
  const homeTeam = playerIsHome ? gameSession.team1 : gameSession.team2;
  const awayTeam = playerIsHome ? gameSession.team2 : gameSession.team1;
  bindText(component, 'home-team', homeTeam.abbreviation);
  bindText(component, 'home-score', playerIsHome ? state.score1 : state.score2);
  bindText(component, 'away-team', awayTeam.abbreviation);
  bindText(component, 'away-score', playerIsHome ? state.score2 : state.score1);
  bindText(component, 'quarter', `Qt${state.quarter}`);
  component.querySelector('#game-clock').textContent = formatClock(state.clockSeconds);
  return component;
}

function formatClock(seconds) {
  const remaining = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

function stopGameLoop() {
  if (gameFrame !== null) cancelAnimationFrame(gameFrame);
  gameFrame = null;
  movementKeys.clear();
}

function startGameLoop() {
  const canvas = app.querySelector('#game-canvas');
  const context = canvas?.getContext('2d');
  if (!context) return;
  let previousTime = null;
  let lastSave = null;
  let savedPosition = `${gameSession.state.fieldPosition}:${gameSession.state.playerY}:${gameSession.state.clockSeconds}:${gameSession.state.phase}`;
  function frame(now) {
    if (screen !== 'game' || !gameSession) return;
    const seconds = previousTime === null ? 0 : (now - previousTime) / 1000;
    previousTime = now;
    gameSession.update(seconds, {
      up: movementKeys.has('w'), down: movementKeys.has('s'),
      left: movementKeys.has('a'), right: movementKeys.has('d')
    });
    gameSession.draw(context, canvas.width, canvas.height);
    const clock = app.querySelector('#game-clock');
    if (clock) clock.textContent = formatClock(gameSession.state.clockSeconds);
    if (lastSave === null) lastSave = now;
    const position = `${gameSession.state.fieldPosition}:${gameSession.state.playerY}:${gameSession.state.clockSeconds}:${gameSession.state.phase}`;
    if (now - lastSave >= 2000 && position !== savedPosition) {
      lastSave = now;
      savedPosition = position;
      persistState().catch(error => console.error(error));
    }
    gameFrame = requestAnimationFrame(frame);
  }
  gameFrame = requestAnimationFrame(frame);
}

function render() {
  stopGameLoop();
  if (screen === 'game' && !gameSession && seasonState?.currentGame) resumeCurrentGame();
  if (screen === 'game' && !gameSession) screen = 'home';
  document.body.classList.toggle('game-mode', screen === 'game' && !!gameSession);
  if (!seasonState) return;
  let content;
  if (screen === 'roster') content = rosterPanel();
  else if (screen === 'player') content = playerPanel();
  else if (screen === 'schedule') content = schedulePanel();
  else if (screen === 'game' && gameSession) content = gamePanel();
  else content = home();
  app.replaceChildren(shell(content));
  if (screen === 'game' && gameSession) startGameLoop();
}

function resumeCurrentGame() {
  const saved = seasonState.currentGame;
  activeScheduledGame = seasonState.schedule.find(game => game.week === saved.week);
  if (!activeScheduledGame) return;
  gameSession = playGame(saved.team1, saved.team2, saved);
}

function beginNextGame() {
  activeScheduledGame = nextScheduledGame();
  if (!activeScheduledGame) return;
  if (seasonState.currentGame) {
    const saved = seasonState.currentGame;
    activeScheduledGame = seasonState.schedule.find(game => game.week === saved.week) || activeScheduledGame;
    gameSession = playGame(saved.team1, saved.team2, saved);
  } else {
    gameSession = playGame(seasonState.team, activeScheduledGame.opponent);
    gameSession.state.week = activeScheduledGame.week;
  }
  gameSession.state.isHome = activeScheduledGame.location === 'HOME';
  seasonState.currentGame = gameSession.state;
  screen = 'game';
}

function leaveGame() {
  if (screen !== 'game') return;
  stopGameLoop();
  navigate('/');
  persistState().catch(error => console.error(error));
  if (gameFullscreen && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(error => console.error(error));
  }
}

function requestGameFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      Promise.resolve(document.documentElement.requestFullscreen()).then(() => {
        if (screen !== 'game' && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(error => console.error(error));
        }
      }).catch(() => {});
    } catch (_) {
      // The field still fills the browser window if fullscreen is unavailable.
    }
  }
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  const action = target?.dataset.action;
  if (!action) return;
  if (action === 'home') {
    if (screen === 'game') {
      leaveGame();
      return;
    }
    navigate('/');
    return;
  } else if (action === 'roster') {
    navigate('/roster');
    return;
  } else if (action === 'schedule') {
    navigate('/schedule');
    return;
  } else if (action === 'roster-group') {
    rosterGroup = target.dataset.group === 'defense' ? 'defense' : 'offense';
    render();
    return;
  } else if (action === 'player') {
    navigate(`/roster/${encodeURIComponent(target.dataset.playerId)}`);
    return;
  } else if (action === 'game') {
    beginNextGame();
    if (screen === 'game') {
      requestGameFullscreen();
      navigate('/game');
      persistState().catch(error => console.error(error));
      return;
    }
  } else if (action === 'restart-run' && gameSession) {
    stopGameLoop();
    gameSession.reset();
    await persistState();
  }
  render();
});

window.addEventListener('popstate', () => {
  applyRoute();
  render();
});

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (screen === 'game' && (event.code === 'Space' || key === ' ')) {
    event.preventDefault();
    if (!event.repeat && gameSession) gameSession.pressSpace();
    return;
  }
  if (screen === 'game' && ['1', '2', '3', '4'].includes(key) && !event.repeat && gameSession) {
    event.preventDefault();
    gameSession.throwPass(parseInt(key, 10));
    return;
  }
  if (screen === 'game' && key === 'escape') {
    event.preventDefault();
    leaveGame();
    return;
  }
  if (screen === 'game' && key === 'r' && !event.repeat) {
    event.preventDefault();
    stopGameLoop();
    gameSession.reset();
    render();
    persistState().catch(error => console.error(error));
    return;
  }
  if (screen === 'game' && ['w', 's', 'a', 'd'].includes(key)) {
    event.preventDefault();
    movementKeys.add(key);
  }
});
window.addEventListener('keyup', event => movementKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => movementKeys.clear());
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === document.documentElement && screen === 'game') gameFullscreen = true;
  else if (gameFullscreen && !document.fullscreenElement) {
    gameFullscreen = false;
    if (screen === 'game') leaveGame();
  }
});

initialize();
