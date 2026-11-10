const fs = require('fs');

// Mock window and RetroSprites
global.window = global;
global.RetroSprites = {
  footballImage: {},
  drawPrePlay: () => {},
  drawRunner: () => {},
  drawDefensivePrePlay: () => {},
  drawDefensiveMovement: () => {},
  drawPassWindup: () => {},
  drawPassRelease: () => {},
  drawPassMidAir: () => {},
  drawPassArrival: () => {},
  drawCatchTackle: () => {}
};
global.PlayerSkills = require('c:/Users/benha/Documents/projects/Retro-Bowl/player-skills.js');
const {
  Player, Quarterback, RunningBack, WideReceiver, TightEnd, OffensiveLineman,
  DefensiveLineman, Linebacker, DefensiveBack
} = require('c:/Users/benha/Documents/projects/Retro-Bowl/player-classes.js');

global.Quarterback = Quarterback;
global.RunningBack = RunningBack;
global.WideReceiver = WideReceiver;
global.TightEnd = TightEnd;
global.OffensiveLineman = OffensiveLineman;
global.DefensiveLineman = DefensiveLineman;
global.Linebacker = Linebacker;
global.DefensiveBack = DefensiveBack;

// Load game.js
require('c:/Users/benha/Documents/projects/Retro-Bowl/game-camera.js');
require('c:/Users/benha/Documents/projects/Retro-Bowl/game-passing.js');
require('c:/Users/benha/Documents/projects/Retro-Bowl/game-renderer.js');
require('c:/Users/benha/Documents/projects/Retro-Bowl/game.js');

// Load team from roster.json
const rosterData = JSON.parse(fs.readFileSync('public/data/seed/save_1/roster.json', 'utf8'));
const team1 = {
  id: 'cardinals',
  name: 'Cardinals',
  colors: { home: {}, away: {} },
  players: rosterData.players
};

const team2 = {
  id: 'opp',
  name: 'Opponent',
  colors: { home: {}, away: {} },
  players: []
};

const oplays = JSON.parse(fs.readFileSync('public/shared/oplays.json', 'utf8'));

console.log('--- Initializing Game Session ---');
const session = playGame(team1, team2, null, {
  offense: oplays.plays[0] // Ace Cross
});

console.log('\n--- Initial Receivers on Field ---');
session.state.receivers.forEach((rec, i) => {
  console.log(`Slot ${i}: [${rec.position}] ${rec.name} (id: ${rec.id})`);
  console.log(`  ratings:`, rec.ratings);
  console.log(`  speed: ${rec.speed.toFixed(2)}, speedMultiplier: ${rec.speedMultiplier}`);
});

console.log('\n--- Other Offense Positions on Field ---');
console.log('QB:', session.state.quarterback.name, `(id: ${session.state.quarterback.id}) ratings:`, session.state.quarterback.ratings);
console.log('RB:', session.state.runningBack.name, `(id: ${session.state.runningBack.id}) ratings:`, session.state.runningBack.ratings);
session.state.offensiveLine.forEach((ol, i) => {
  console.log(`OL ${i}:`, ol.name, `(id: ${ol.id}) ratings:`, ol.ratings);
});


console.log('\n--- Switching Play to Pro Post Dig ---');
session.setOffensivePlay(oplays.plays[1]);

console.log('\n--- Receivers on Field After setOffensivePlay ---');
session.state.receivers.forEach((rec, i) => {
  console.log(`Slot ${i}: [${rec.position}] ${rec.name} (id: ${rec.id})`);
  console.log(`  ratings:`, rec.ratings);
  console.log(`  speed: ${rec.speed.toFixed(2)}, speedMultiplier: ${rec.speedMultiplier}`);
});

console.log('\n--- Other Offense Positions on Field ---');
console.log('QB:', session.state.quarterback.name, `(id: ${session.state.quarterback.id}) ratings:`, session.state.quarterback.ratings);
console.log('RB:', session.state.runningBack.name, `(id: ${session.state.runningBack.id}) ratings:`, session.state.runningBack.ratings);
session.state.offensiveLine.forEach((ol, i) => {
  console.log(`OL ${i}:`, ol.name, `(id: ${ol.id}) ratings:`, ol.ratings);
});

