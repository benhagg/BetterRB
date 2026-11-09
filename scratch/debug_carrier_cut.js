const { WideReceiver, RunningBack } = require('c:/Users/benha/Documents/projects/Retro-Bowl/player-classes.js');

const carrier = new RunningBack({ x: 20, y: 0.5, speed: 7.5, agility: 5 });

console.log('--- Simulating Ball Carrier Sprinting East ---');
for (let f = 0; f < 60; f++) {
  carrier.move(1/60, 1, 0); // holding right
}
console.log('Sprinting East speedFactor:', carrier._movement.speedFactor.toFixed(3));
console.log('Direction:', carrier._movement.direction);

console.log('\n--- Case A: User presses Down while running East (immediate cut) ---');
let cutFrames = 0;
for (let f = 1; f <= 10; f++) {
  carrier.move(1/60, 0, 1);
  console.log(`Frame ${f}: dir=(${carrier._movement.direction.x.toFixed(2)}, ${carrier._movement.direction.y.toFixed(2)}), speedFactor=${carrier._movement.speedFactor.toFixed(3)}, cut=${Boolean(carrier._movement.cut)}`);
}

