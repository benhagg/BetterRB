const { WideReceiver, RunningBack } = require('c:/Users/benha/Documents/projects/Retro-Bowl/player-classes.js');

// Create RB and WR with identical ratings: speed 10, agility 10
const rb = new RunningBack({
  x: 20, y: 0.5,
  ratings: { speed: 10, agility: 10, strength: 4, catching: 3 }
});

const wr = new WideReceiver({
  x: 20, y: 0.5,
  ratings: { speed: 10, agility: 10, strength: 2, catching: 1 },
  route: [{ dx: 30, dy: 0 }] // Straight streak route
});

console.log('RB speed prop:', rb.speed, 'multiplier:', rb.speedMultiplier);
console.log('WR speed prop:', wr.speed, 'multiplier:', wr.speedMultiplier);

// Compare movement over 60 frames (1 second)
console.log('\n--- Frame by Frame Sprint Comparison (1 second) ---');
for (let f = 1; f <= 60; f++) {
  // RB moves via move(1/60, 1, 0)
  rb.move(1/60, 1, 0);
  // WR runs route via runRoute(1/60)
  wr.runRoute(1/60);

  if (f % 10 === 0 || f === 1) {
    console.log(`Frame ${f}: RB x=${rb.x.toFixed(3)}, speedFactor=${rb._movement.speedFactor.toFixed(3)} | WR x=${wr.x.toFixed(3)}, speedFactor=${wr._movement.speedFactor.toFixed(3)}`);
  }
}

console.log('\nFinal position after 1 second:');
console.log('RB moved:', (rb.x - 20).toFixed(3), 'yards');
console.log('WR moved:', (wr.x - 20).toFixed(3), 'yards');

