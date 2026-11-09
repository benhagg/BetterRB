const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const saveDir = path.join(root, 'data', 'save_1');
const sharedDir = path.join(root, 'shared');
const seasonFile = path.join(saveDir, 'season.json');
const scoresFile = path.join(saveDir, 'scores.txt');
const rosterFile = path.join(saveDir, 'roster.json');
const opponentsFile = path.join(saveDir, 'opp_rosters.json');
const userTeamId = 20;
const offense = ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'TE', 'OL', 'OL', 'OL', 'OL'];
const defense = ['DL', 'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'DB', 'DB', 'DB', 'DB'];

function readTsv(filename) {
  const [header, ...rows] = fs.readFileSync(path.join(sharedDir, filename), 'utf8')
    .replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const columns = header.split('\t');
  return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row.split('\t')[index]])));
}

function readNameList(filename) {
  const names = fs.readFileSync(path.join(sharedDir, filename), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  if (!names.length) throw new Error(`No names found in ${filename}`);
  return names;
}

const firstNames = readNameList('Names_F1.txt');
const lastNames = readNameList('Names_L.txt');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomRating() {
  // Ratings 2–6 are equally likely; 9 is half as likely as 6.
  const weightedRatings = [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 0.8], [8, 0.65], [9, 0.5], [10, 0.35]];
  let roll = Math.random() * weightedRatings.reduce((total, [, weight]) => total + weight, 0);
  return weightedRatings.find(([, weight]) => (roll -= weight) <= 0)?.[0] ?? 10;
}

function normal(mean, standardDeviation) {
  const a = 1 - Math.random();
  const b = 1 - Math.random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

function specialSkill(position) {
  if (['QB', 'K'].includes(position)) return 'accuracy';
  if (['OL', 'OT', 'OG', 'C'].includes(position)) return 'blocking';
  if (['DL', 'DE', 'DT', 'LB'].includes(position)) return 'tackling';
  return 'catching';
}

function weightsFor(position) {
  if (['WR', 'DB', 'CB', 'S'].includes(position)) return [0.55, 2.3, 2.2, 2];
  if (position === 'RB') return [1.25, 1.3, 1.2, 0.45];
  if (position === 'TE') return [2, 0.65, 0.65, 1];
  if (['QB', 'K'].includes(position)) return [1.8, 0.35, 0.35, 2.4];
  if (['OL', 'OT', 'OG', 'C'].includes(position)) return [2.4, 0.45, 0.45, 2];
  if (['DL', 'DE', 'DT'].includes(position)) return [2.5, 0.45, 0.45, 1.8];
  if (position === 'LB') return [1.3, 1.1, 1.1, 1.5];
  return [1, 1, 1, 1];
}

function addCredits(ratings, credits, weights) {
  const keys = Object.keys(ratings);
  for (let credit = 0; credit < credits; credit++) {
    const candidates = keys.filter(key => ratings[key] < 10);
    const weighted = candidates.map(key => ({ key, weight: weights[keys.indexOf(key)] }));
    let roll = Math.random() * weighted.reduce((sum, item) => sum + item.weight, 0);
    const selected = weighted.find(item => (roll -= item.weight) <= 0) || weighted.at(-1);
    ratings[selected.key]++;
  }
}

function createPlayer(teamId, position, index) {
  const rating = randomRating();
  const potential = Math.max(rating, Math.min(10, Math.round(rating + normal(2, 2))));
  const keys = ['strength', 'speed', 'agility', specialSkill(position)];
  const ratings = Object.fromEntries(keys.map(key => [key, 0]));
  const potentialRatings = Object.fromEntries(keys.map(key => [key, 0]));
  const weights = weightsFor(position);
  addCredits(ratings, rating * 3, weights);
  Object.assign(potentialRatings, ratings);
  addCredits(potentialRatings, (potential - rating) * 3, weights);
  return {
    id: `${teamId}-${position.toLowerCase()}-${index + 1}`,
    name: `${firstNames[randomInt(0, firstNames.length - 1)]} ${lastNames[randomInt(0, lastNames.length - 1)]}`,
    position, rating, potential, skillCredits: rating * 3, potentialSkillCredits: potential * 3,
    ratings, potentialRatings, portrait: index % 10, xp: 0
  };
}

function createRoster(teamId) {
  return [...offense, 'K', ...defense].map((position, index) => createPlayer(teamId, position, index));
}

function generateRosters() {
  const teams = readTsv('Teams.txt');
  return {
    userRoster: { ratingsScale: 10, players: createRoster(userTeamId) },
    opponents: Object.fromEntries(teams.filter(team => Number(team.uid) !== userTeamId)
      .map(team => [team.uid, { teamId: Number(team.uid), ratingsScale: 10, players: createRoster(Number(team.uid)) }]))
  };
}

function writeRosters({ userRoster, opponents }) {
  fs.writeFileSync(rosterFile, `${JSON.stringify(userRoster, null, 2)}\n`, 'utf8');
  fs.writeFileSync(opponentsFile, `${JSON.stringify({ ratingsScale: 10, teams: opponents }, null, 2)}\n`, 'utf8');
}

function teamSummary(team) {
  return {
    id: Number(team.uid),
    city: team.name,
    name: team.name,
    abbreviation: team.tla.replaceAll('.', '').slice(0, 3).toUpperCase()
  };
}

function buildSeason() {
  const teams = readTsv('Teams.txt');
  const teamById = new Map(teams.map(team => [Number(team.uid), team]));
  const cardinals = teamById.get(userTeamId);
  if (!cardinals) throw new Error('Arizona Cardinals were not found in Teams.txt');

  const schedule = readTsv('schedule.txt')
    .filter(game => Number(game.year) === 1 && (Number(game.home_team) === userTeamId || Number(game.away_team) === userTeamId))
    .map(game => {
      const isHome = Number(game.home_team) === userTeamId;
      const opponentId = Number(isHome ? game.away_team : game.home_team);
      const opponent = teamById.get(opponentId);
      if (!opponent) throw new Error(`Unknown opponent id: ${opponentId}`);
      return {
        week: Number(game.week),
        opponentId,
        opponent: teamSummary(opponent),
        location: isHome ? 'HOME' : 'AWAY',
        // These are references to rb/shared/uniforms.txt, not duplicated color values.
        uniforms: { player: isHome ? 'home' : 'away', opponent: isHome ? 'away' : 'home' },
        played: false,
        score: null
      };
    })
    .sort((a, b) => a.week - b.week);

  return {
    season: 1,
    currentWeek: 1,
    ratingsScale: 10,
    team: { ...teamSummary(cardinals), city: 'Arizona', name: 'Cardinals', fans: 18420, cap: 32 },
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
    schedule,
    currentGame: null
  };
}

function validateSeason(season) {
  if (season.currentWeek !== 1 || season.currentGame !== null) throw new Error('New season state is invalid');
  if (!season.schedule.length || season.schedule.some(game => game.played || game.score !== null)) {
    throw new Error('New schedule must contain only unplayed games');
  }
  if (season.schedule.some(game => !['home', 'away'].includes(game.uniforms?.player) || !['home', 'away'].includes(game.uniforms?.opponent))) {
    throw new Error('Game uniform references are invalid');
  }
}

const rosters = generateRosters();
const season = buildSeason();
validateSeason(season);

if (process.argv.includes('--dry-run')) {
  console.log(`Would create season ${season.season}: ${season.schedule.length} unplayed games, ${rosters.userRoster.players.length} players, and ${Object.keys(rosters.opponents).length} opponent rosters.`);
} else {
  fs.mkdirSync(saveDir, { recursive: true });
  writeRosters(rosters);
  fs.writeFileSync(seasonFile, `${JSON.stringify(season, null, 2)}\n`, 'utf8');
  fs.writeFileSync(scoresFile, 'year\tweek\taway_team\thome_team\taway_score\thome_score\n', 'utf8');
  console.log(`Created season ${season.season}: ${season.schedule.length} unplayed games, ${rosters.userRoster.players.length} players, and ${Object.keys(rosters.opponents).length} opponent rosters.`);
}

