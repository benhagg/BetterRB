const { WideReceiver } = require('c:/Users/benha/Documents/projects/Retro-Bowl/player-classes.js');

const wr = new WideReceiver({ x: 20, y: 0.5, speed: 7.5, agility: 5 });
// Out route: 10 yards downfield, then 3 yards across
wr.assignRoute([
  { dx: 10, dy: 0 },
  { dx: 10, dy: -0.2 }
]);

console.log('--- Simulating WR Running Route ---');
let framesOnRoute = 0;
while (wr.routeIndex === 0 && framesOnRoute < 200) {
  wr.runRoute(1/60);
  framesOnRoute++;
}
console.log(`Reached waypoint 0 in ${framesOnRoute} frames. WR position: x=${wr.x.toFixed(2)}, y=${wr.y.toFixed(2)}`);
console.log(`Waypoint index is now ${wr.routeIndex}. Target is (dx=10, dy=-0.2)`);

console.log('\n--- Now watching the 90-degree turn at waypoint 1 ---');
for (let f = 1; f <= 50; f++) {
  const prevX = wr.x;
  const prevY = wr.y;
  wr.runRoute(1/60);
  console.log(`Turn Frame ${f}: x=${wr.x.toFixed(3)}, y=${wr.y.toFixed(3)}, dir=(${wr.lastDirX.toFixed(2)}, ${wr.lastDirY.toFixed(2)}), speedFactor=${wr._movement.speedFactor.toFixed(3)}, cut=${Boolean(wr._movement.cut)}`);
  if (wr.lastDirY < -0.5) {
    console.log(`Turn completed on Frame ${f}!`);
    break;
  }
}

