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
let selectedOffensivePlayIndex = 0;
let currentPlayOptions = [];
let activePlay = null;
let playbooks = { offense: null, defense: null };

async function initialize() {
  app.textContent = 'Loading season...';
  try {
    const responses = await Promise.all([
      fetch('/api/state', { cache: 'no-store' }),
      fetch('/data/oplays.json', { cache: 'no-store' }),
      fetch('/data/dplays.json', { cache: 'no-store' }),
      ...viewNames.map(name => fetch(`/views/${name}.html`, { cache: 'no-store' }))
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Could not load season or view files');
    const [state, offensePlays, defensePlays, ...markup] = await Promise.all([
      responses[0].json(), responses[1].json(), responses[2].json(), ...responses.slice(3).map(response => response.text())
    ]);
    for (let i = 0; i < viewNames.length; i++) {
      const template = document.createElement('template');
      template.innerHTML = markup[i];
      views.set(viewNames[i], template.content);
    }
    seasonState = state;
    playbooks = { offense: offensePlays, defense: defensePlays };
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
  bindText(component, 'play-label', next ? 'PLAY GAME' : 'SEASON COMPLETE');
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
    bindText(card, 'name', String(player.name || '').trim().split(/\s+/).at(-1));
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
  bindText(component, 'rating', player.rating ?? 0);
  bindText(component, 'potential', player.potential ?? player.rating ?? 0);
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
  renderPlayCards(component);
  return component;
}

function pickRandomPlays(allPlays, count = 3) {
  if (!Array.isArray(allPlays) || allPlays.length === 0) return [];
  const shuffled = [...allPlays].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, allPlays.length));
}

function setupPreSnapPlays() {
  const allPlays = playbooks.offense?.plays || [];
  currentPlayOptions = pickRandomPlays(allPlays, 3);
  activePlay = currentPlayOptions[0] || allPlays[0] || null;
}

function renderPlayDiagramSVG(play) {
  const width = 200, height = 100;
  const losX = 55;
  const centerY = 50;
  const toSvgX = (startX, dx) => Math.min(195, Math.max(5, startX + dx * 4.2));
  const toSvgY = (startY, dy) => Math.min(95, Math.max(5, startY + dy * 85));

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" class="play-diagram-svg">`;
  svg += `<rect width="${width}" height="${height}" fill="#162c20" rx="3"/>`;
  svg += `<line x1="${losX}" y1="4" x2="${losX}" y2="96" stroke="#5caeff" stroke-width="2" stroke-dasharray="3,3"/>`;
  svg += `<line x1="110" y1="4" x2="110" y2="96" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  svg += `<line x1="165" y1="4" x2="165" y2="96" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;

  const isRun = String(play.playtype || play.playType || '').toLowerCase() === 'run';

  // OL dots & blocking scheme
  const ol = play.formation?.offensiveLine || [];
  ol.forEach(lineman => {
    const lx = losX + (lineman.offset ?? -0.5) * 6;
    const ly = centerY + (lineman.across ?? 0) * 85;
    svg += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="#90caf9"/>`;
    if (isRun) {
      const bx = lx + 12;
      svg += `<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#ff7043" stroke-width="1.5"/>`;
      svg += `<polygon points="${bx.toFixed(1)},${(ly - 2).toFixed(1)} ${(bx + 3).toFixed(1)},${ly.toFixed(1)} ${bx.toFixed(1)},${(ly + 2).toFixed(1)}" fill="#ff7043"/>`;
    }
  });

  // QB dot
  const qb = play.formation?.quarterback || { across: 0, offset: -3 };
  const qbx = losX + (qb.offset ?? -3) * 6;
  const qby = centerY + (qb.across ?? 0) * 85;
  svg += `<circle cx="${qbx.toFixed(1)}" cy="${qby.toFixed(1)}" r="3" fill="#ffe18a"/>`;

  // Receivers & routes
  const receivers = play.formation?.receivers || [];
  receivers.forEach(r => {
    const rx = losX + (r.offset ?? -0.5) * 6;
    const ry = centerY + (r.across ?? 0) * 85;
    svg += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="2.5" fill="#ffffff"/>`;
    if (r.receiverNumber) {
      svg += `<text x="${(rx - 7).toFixed(1)}" y="${(ry + 2.5).toFixed(1)}" fill="#ffe18a" font-size="7" font-weight="bold" text-anchor="middle" font-family="monospace">${r.receiverNumber}</text>`;
    }
    if (r.route && r.route.length) {
      let curX = rx, curY = ry;
      let pathD = `M ${rx.toFixed(1)} ${ry.toFixed(1)}`;
      r.route.forEach(wp => {
        const nx = toSvgX(rx, wp.dx);
        const ny = toSvgY(ry, wp.dy);
        pathD += ` L ${nx.toFixed(1)} ${ny.toFixed(1)}`;
        curX = nx;
        curY = ny;
      });
      svg += `<path d="${pathD}" fill="none" stroke="#ffe35c" stroke-width="1.5" stroke-dasharray="3,2"/>`;
      svg += `<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="2" fill="#ffe35c"/>`;
    }
  });

  // Running Back & path
  const rb = play.formation?.runningBack;
  if (rb) {
    const rbx = losX + (rb.offset ?? -4) * 6;
    const rby = centerY + (rb.across ?? 0) * 85;
    svg += `<circle cx="${rbx.toFixed(1)}" cy="${rby.toFixed(1)}" r="3" fill="${isRun ? '#00e676' : '#80d8ff'}"/>`;
    if (rb.receiverNumber) {
      svg += `<text x="${(rbx - 8).toFixed(1)}" y="${(rby + 2.5).toFixed(1)}" fill="${isRun ? '#00e676' : '#80d8ff'}" font-size="7" font-weight="bold" text-anchor="middle" font-family="monospace">${rb.receiverNumber}</text>`;
    }
    if (rb.route && rb.route.length) {
      let curX = rbx, curY = rby;
      let pathD = `M ${rbx.toFixed(1)} ${rby.toFixed(1)}`;
      rb.route.forEach(wp => {
        const nx = toSvgX(rbx, wp.dx);
        const ny = toSvgY(rby, wp.dy);
        pathD += ` L ${nx.toFixed(1)} ${ny.toFixed(1)}`;
        curX = nx;
        curY = ny;
      });
      const strokeColor = isRun ? '#00e676' : '#80d8ff';
      svg += `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${isRun ? '2.5' : '1.5'}"/>`;
      svg += `<polygon points="${curX.toFixed(1)},${(curY - 3).toFixed(1)} ${(curX + 5).toFixed(1)},${curY.toFixed(1)} ${curX.toFixed(1)},${(curY + 3).toFixed(1)}" fill="${strokeColor}"/>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

function renderPlayCards(root = app) {
  const overlay = root.querySelector('#play-select-overlay');
  const cardsRow = root.querySelector('#play-cards-row');
  if (!overlay || !cardsRow) return;

  if (!gameSession || gameSession.state.phase !== 'preplay') {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  cardsRow.innerHTML = '';
  if (!currentPlayOptions.length) {
    setupPreSnapPlays();
  }
  currentPlayOptions.forEach(play => {
    const isRun = String(play.playtype || play.playType || '').toLowerCase() === 'run';
    const isSelected = activePlay && activePlay.id === play.id;
    const card = document.createElement('div');
    card.className = `play-card ${isSelected ? 'selected' : ''}`;
    card.setAttribute('data-play-id', play.id);
    card.innerHTML = `
      <div class="play-card-header">
        <span class="play-card-name" title="${play.name}">${play.name}</span>
        <span class="play-card-type-badge ${isRun ? 'run' : 'pass'}">${isRun ? 'RUN' : 'PASS'}</span>
      </div>
      <div class="play-card-diagram">
        ${renderPlayDiagramSVG(play)}
      </div>
      <div class="play-card-footer">
        ${isSelected ? '&#9654; SELECTED' : 'CLICK TO RUN'}
      </div>
    `;
    card.addEventListener('click', () => {
      activePlay = play;
      if (gameSession && typeof gameSession.setOffensivePlay === 'function') {
        gameSession.setOffensivePlay(play);
      }
      renderPlayCards(app);
    });
    cardsRow.appendChild(card);
  });
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
    if (gameSession.state.phase !== 'preplay') {
      const overlay = app.querySelector('#play-select-overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
      }
    }
    gameFrame = requestAnimationFrame(frame);
  }
  gameFrame = requestAnimationFrame(frame);
}

function render() {
  stopGameLoop();
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

function beginNextGame() {
  activeScheduledGame = nextScheduledGame();
  if (!activeScheduledGame) return;
  setupPreSnapPlays();
  gameSession = playGame(seasonState.team, activeScheduledGame.opponent, null, {
    offense: activePlay || playbooks.offense?.plays?.[0],
    defense: playbooks.defense?.plays?.[0]
  });
  gameSession.state.week = activeScheduledGame.week;
  gameSession.state.isHome = activeScheduledGame.location === 'HOME';
  screen = 'game';
}

function leaveGame() {
  if (screen !== 'game') return;
  stopGameLoop();
  navigate('/');
  gameSession = null;
  activeScheduledGame = null;
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
      return;
    }
  } else if (action === 'restart-run' && gameSession) {
    stopGameLoop();
    gameSession.reset();
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
  if (screen === 'game' && ['1', '2', '3', '4', '5'].includes(key) && !event.repeat && gameSession) {
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
    setupPreSnapPlays();
    gameSession.reset();
    if (activePlay && typeof gameSession.setOffensivePlay === 'function') {
      gameSession.setOffensivePlay(activePlay);
    }
    render();
    return;
  }
  if (screen === 'game' && key === 'p' && !event.repeat && gameSession?.state?.phase === 'preplay') {
    event.preventDefault();
    const plays = playbooks.offense?.plays || [];
    if (plays.length > 1) {
      selectedOffensivePlayIndex = (selectedOffensivePlayIndex + 1) % plays.length;
      const currentWeek = gameSession.state.week;
      const currentHome = gameSession.state.isHome;
      const currentFieldPos = gameSession.state.fieldPosition;
      gameSession = playGame(seasonState.team, activeScheduledGame.opponent, {
        fieldPosition: currentFieldPos,
        scrimmagePosition: currentFieldPos
      }, {
        offense: plays[selectedOffensivePlayIndex],
        defense: playbooks.defense?.plays?.[0]
      });
      gameSession.state.week = currentWeek;
      gameSession.state.isHome = currentHome;
      render();
    }
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
