const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PlayerSkills = require('./player-skills');
const ScoreHistory = require('./score-history');

const root = __dirname;
const sharedDir = path.join(root, 'shared');
const saveDir = path.join(root, 'data', 'save_1');
const stateFile = path.join(saveDir, 'season.json');
const rosterFile = path.join(saveDir, 'roster.json');
const opponentRostersFile = path.join(saveDir, 'opp_rosters.json');
const historyFile = path.join(saveDir, 'scores.txt');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };

function readTsv(filename) {
  const lines = fs.readFileSync(path.join(sharedDir, filename), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const headerLine = lines.shift().replace(/^\uFEFF/, '');
  const headers = headerLine.trimEnd().split('\t').map(value => value.trim());
  if (headers[0] === '') headers[0] = 'id';
  return lines.map(line => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
  });
}

const teams = readTsv('Teams.txt');

function loadUniforms() {
  const uniforms = new Map();
  for (const row of readTsv('uniforms.txt')) {
    if (!/^\d+$/.test(row.id) || uniforms.has(Number(row.id))) throw new Error(`Invalid or duplicate uniform id: ${row.id}`);
    uniforms.set(Number(row.id), row);
  }
  return uniforms;
}

function color(value) {
  const cleaned = String(value || '').replace(/^\$/, '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(cleaned)) throw new Error(`Invalid uniform color: ${value}`);
  return `#${cleaned}`;
}

function uniformColors(teamId, uniforms) {
  const source = teams.find(team => Number(team.uid) === Number(teamId));
  if (!source) throw new Error(`Unknown team id: ${teamId}`);
  const uniform = uniforms.get(Number(teamId));
  if (!uniform) throw new Error(`No uniform for team id: ${teamId}`);
  return {
    home: Object.fromEntries(['helmet','logo','shirt','sleeve','pants','stripe','socks1','socks2'].map(key => [key, color(uniform[`home_${key}`])])),
    away: Object.fromEntries(['helmet','logo','shirt','sleeve','pants','stripe','socks1','socks2'].map(key => [key, color(uniform[`away_${key}`])]))
  };
}

function loadOpponentRosters() {
  try {
    const rosters = JSON.parse(fs.readFileSync(opponentRostersFile, 'utf8'));
    if (!rosters || typeof rosters.teams !== 'object' || Array.isArray(rosters.teams)) throw new Error('Invalid opponent rosters');
    return rosters;
  } catch (error) {
    if (error.code === 'ENOENT') return { ratingsScale: 10, teams: {} };
    throw error;
  }
}

function makeTeam(teamId, uniforms, opponentRosters) {
  const source = teams.find(team => Number(team.uid) === Number(teamId));
  if (!source) throw new Error(`Unknown team id: ${teamId}`);
  const abbreviation = source.tla.replaceAll('.', '').slice(0, 3).toUpperCase();
  const stored = opponentRosters?.teams?.[String(teamId)];
  const players = Array.isArray(stored?.players) ? structuredClone(stored.players) : [];
  return {
    id: Number(source.uid),
    city: source.name,
    name: source.name,
    abbreviation,
    ratingsScale: 10,
    colors: uniformColors(teamId, uniforms),
    players
  };
}

function scheduleFor(teamId, uniforms, opponentRosters) {
  const rows = readTsv('schedule.txt');
  return rows.filter(row => Number(row.year) === 1 && (Number(row.away_team) === Number(teamId) || Number(row.home_team) === Number(teamId)))
    .map(row => {
      const isHome = Number(row.home_team) === Number(teamId);
      const opponentId = Number(isHome ? row.away_team : row.home_team);
      const homeScore = Number(row.home_score);
      const awayScore = Number(row.away_score);
      return {
        week: Number(row.week),
        opponentId,
        opponent: makeTeam(opponentId, uniforms, opponentRosters),
        location: isHome ? 'HOME' : 'AWAY',
        played: homeScore >= 0 && awayScore >= 0,
        score: homeScore >= 0 && awayScore >= 0 ? (isHome ? [homeScore, awayScore] : [awayScore, homeScore]) : null
      };
    }).sort((a, b) => a.week - b.week);
}

function initialState(uniforms, opponentRosters) {
  const baseTeam = makeTeam(20, uniforms, opponentRosters);
  const team = {
    ...baseTeam,
    city: 'Arizona',
    name: 'Cardinals',
    fans: 18420,
    cap: 32,
    players: [
      ['M. Cole', 'QB'], ['J. Rivers', 'WR'], ['T. Hayes', 'WR'],
      ['D. Brooks', 'RB'], ['A. Stone', 'TE'], ['K. Price', 'K']
    ].map(([name, position], index) => ({ id: `cc-${index}`, name, position, rating: 5 }))
  };
  return {
    season: 1,
    ratingsScale: 10,
    team,
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
    schedule: scheduleFor(20, uniforms, opponentRosters)
  };
}

function loadState() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const uniforms = loadUniforms();
  const opponentRosters = loadOpponentRosters();
  let state;
  let refresh = false;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = initialState(uniforms, opponentRosters);
    refresh = true;
  }
  const hadEmbeddedRoster = Array.isArray(state.team.players);
  state.team.players = loadRoster(state.team.players, state.ratingsScale === 10 ? 10 : 100);
  if (state.team.ratingsScale !== 10) {
    state.team.ratingsScale = 10;
    refresh = true;
  }
  if (hadEmbeddedRoster) refresh = true;
  if (Object.hasOwn(state, 'currentGame')) {
    delete state.currentGame;
    refresh = true;
  }
  // Preserve the previous franchise before starting Arizona's schedule.
  if (state.team.id === 0 && state.team.name === 'Comets') {
    const previous = state.team;
    state.team = { ...makeTeam(20, uniforms, opponentRosters), city: 'Arizona', name: 'Cardinals', fans: previous.fans, cap: previous.cap, players: previous.players };
    state.schedule = scheduleFor(20, uniforms, opponentRosters);
    state.record = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
    refresh = true;
  }
  if (!Array.isArray(state.schedule) || state.schedule.length === 0) {
    state.schedule = scheduleFor(state.team?.id ?? 0, uniforms, opponentRosters);
    refresh = true;
  }
  for (const game of state.schedule) {
    if (game.opponentId !== undefined) {
      if (Array.isArray(game.opponent?.players)) refresh = true;
      game.opponent = makeTeam(game.opponentId, uniforms, opponentRosters);
    }
  }
  if (stripTeamColors(state)) refresh = true;
  applyTeamColors(state, uniforms);
  if (ensureOpponentRatings(state)) refresh = true;
  if (removeMascots(state)) refresh = true;
  if (refresh) saveState(state);
  else syncSaveHistory(state);
  return state;
}

function loadRoster(legacyPlayers, sourceScale) {
  let roster;
  let created = false;
  try {
    roster = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
    if (!Array.isArray(roster.players)) throw new Error('Invalid roster file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    roster = { ratingsScale: sourceScale, players: legacyPlayers || [] };
    created = true;
  }
  let changed = false;
  const scale = roster.ratingsScale === 10 ? 10 : 100;
  for (const player of roster.players) changed = PlayerSkills.ensureRatings(player, scale) || changed;
  if (roster.ratingsScale !== 10) {
    roster.ratingsScale = 10;
    changed = true;
  }
  if (created || changed) fs.writeFileSync(rosterFile, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');
  return roster.players;
}

function ensureOpponentRatings(state) {
  let changed = false;
  const scale = state.ratingsScale === 10 ? 10 : 100;
  const opponents = (state.schedule || []).map(game => game.opponent);
  for (const team of opponents) {
    if (!team) continue;
    const teamScale = team.ratingsScale === 10 ? 10 : scale;
    for (const player of team.players || []) changed = PlayerSkills.ensureRatings(player, teamScale) || changed;
    if (team.ratingsScale !== 10) {
      team.ratingsScale = 10;
      changed = true;
    }
  }
  if (state.ratingsScale !== 10) {
    state.ratingsScale = 10;
    changed = true;
  }
  return changed;
}

function syncSaveHistory(state) {
  ScoreHistory.syncHistory(historyFile, state);
}

function saveState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const saved = structuredClone(state);
  delete saved.currentGame;
  ensureOpponentRatings(saved);
  removeMascots(saved);
  stripTeamColors(saved);
  delete saved.team.players;
  for (const game of saved.schedule || []) {
    if (game.opponent) delete game.opponent.players;
  }
  fs.writeFileSync(stateFile, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
  syncSaveHistory(saved);
}

function savedTeams(state) {
  return [state.team, ...(state.schedule || []).map(game => game.opponent)].filter(Boolean);
}

function stripTeamColors(state) {
  let changed = false;
  for (const team of savedTeams(state)) {
    if (Object.hasOwn(team, 'colors')) {
      delete team.colors;
      changed = true;
    }
  }
  return changed;
}

function applyTeamColors(state, uniforms) {
  for (const team of savedTeams(state)) team.colors = uniformColors(team.id, uniforms);
}

function removeMascots(value) {
  if (!value || typeof value !== 'object') return false;
  let changed = false;
  if (Object.hasOwn(value, 'mascot')) {
    delete value.mascot;
    changed = true;
  }
  for (const child of Object.values(value)) changed = removeMascots(child) || changed;
  return changed;
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'GET' && pathname === '/api/state') {
    try {
      sendJson(response, 200, loadState());
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }
  if (request.method === 'PUT' && pathname === '/api/state') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) request.destroy();
    });
    request.on('end', () => {
      try {
        const state = JSON.parse(body);
        if (!state.team || !Array.isArray(state.schedule) || !state.record) throw new Error('Invalid season state');
        saveState(state);
        sendJson(response, 200, { saved: true });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
    });
    return;
  }

  const appRoute = /^\/(?:roster(?:\/[^/]+)?|schedule|game)\/?$/.test(pathname);
  const requested = pathname === '/' || appRoute ? '/index.html' : pathname;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  });
}).listen(3000, () => console.log('Better RB is running at http://localhost:3000'));
