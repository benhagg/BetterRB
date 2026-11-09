const fs = require('node:fs');
const path = require('node:path');

const HEADER = 'year\tweek\taway_team\thome_team\taway_score\thome_score';

function resultsFromSeason(state) {
  const year = Number(state?.season);
  const teamId = Number(state?.team?.id);
  if (!Number.isInteger(year) || !Number.isInteger(teamId) || !Array.isArray(state?.schedule)) return [];
  return state.schedule.filter(game => game.played && Array.isArray(game.score) && game.score.length === 2)
    .map(game => {
      const week = Number(game.week);
      const opponent = Number(game.opponentId ?? game.opponent?.id);
      const playerScore = Number(game.score[0]);
      const opponentScore = Number(game.score[1]);
      if (![week, opponent, playerScore, opponentScore].every(Number.isInteger) ||
          week < 1 || opponent < 0 || playerScore < 0 || opponentScore < 0 ||
          !['HOME', 'AWAY'].includes(game.location)) return null;
      return game.location === 'HOME'
        ? [year, week, opponent, teamId, opponentScore, playerScore]
        : [year, week, teamId, opponent, playerScore, opponentScore];
    }).filter(Boolean);
}

function syncHistory(file, state, archives = []) {
  let rows = [];
  let exists = false;
  try {
    const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length) {
      if (lines.shift() !== HEADER) throw new Error('Invalid score history header');
      rows = lines.map(line => {
        const fields = line.split('\t');
        if (fields.length !== 6 || fields.some(value => !/^-?\d+$/.test(value))) throw new Error('Invalid score history row');
        return fields.map(Number);
      });
      exists = true;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const key = row => row.slice(0, 4).join(':');
  const indices = new Map(rows.map((row, index) => [key(row), index]));
  let changed = !exists;
  const sources = exists ? [state] : [...archives, state];
  for (const source of sources) {
    for (const row of resultsFromSeason(source)) {
      const id = key(row);
      if (!indices.has(id)) {
        indices.set(id, rows.length);
        rows.push(row);
        changed = true;
      } else {
        const index = indices.get(id);
        if (rows[index].join('\t') !== row.join('\t')) {
          rows[index] = row;
          changed = true;
        }
      }
    }
  }
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${HEADER}\n${rows.map(row => row.join('\t') + '\n').join('')}`, 'utf8');
  }
}

module.exports = { syncHistory, resultsFromSeason };
