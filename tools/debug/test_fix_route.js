const assert = require('assert');

// Simulate the fixed cut logic on a receiver route
function simulateRoute(wr, fixReset = true) {
  let frames = 0;
  while (wr.routeIndex === 0 && frames < 200) {
    wr.runRoute(1/60);
    frames++;
  }
  console.log(`Leg 0 took ${frames} frames. WR at x=${wr.x.toFixed(2)}, y=${wr.y.toFixed(2)}`);

  let cutFrames = 0;
  let turned = false;
  while (wr.routeIndex === 1 && cutFrames < 100) {
    wr.runRoute(1/60);
    cutFrames++;
    if (wr.lastDirY < -0.5 && !turned) {
      turned = true;
      console.log(`Turned South on frame ${cutFrames}! speedFactor=${wr._movement.speedFactor.toFixed(3)}`);
    }
  }
  console.log(`Leg 1 finished in ${cutFrames} frames. WR at x=${wr.x.toFixed(2)}, y=${wr.y.toFixed(2)}`);
}

// Let's test with the actual player-classes.js logic right now:
const { WideReceiver } = require('./player-classes.js');
const wr = new WideReceiver({ x: 20, y: 0.5, speed: 7.5, agility: 5 });
wr.assignRoute([{ dx: 10, dy: 0 }, { dx: 10, dy: -0.2 }]);
simulateRoute(wr);

