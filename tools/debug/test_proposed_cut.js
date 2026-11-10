// Test proposed cut deceleration logic

function simulateMovement(scenario) {
  // Constants
  const BASE_ACCEL_RATE = 1.3;
  const AGILITY_ACCEL_SCALE = 0.05;
  const MIN_ACCEL_SCALE = 0.5;

  const BASE_MAX_DECEL_TIME = 0.7;
  const AGILITY_DECEL_SCALE = 0.04;
  const MIN_DECEL_TIME = 0.04;

  const CUT_DECEL_TIME_SCALE = 0.5;
  const MIN_CUT_TIME = 0.06;
  const STRAIGHT_DOT_THRESHOLD = 0.965; // ~15 deg
  const CUT_TARGET_DOT_THRESHOLD = 0.70;  // ~45 deg
  const MIN_SPEED_FACTOR = 0.001;

  const agility = scenario.agility || 5;
  const accelerationRate = BASE_ACCEL_RATE / Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_ACCEL_SCALE);
  const maxDecelTime = BASE_MAX_DECEL_TIME * Math.max(MIN_ACCEL_SCALE, 1 - agility * AGILITY_DECEL_SCALE);

  const movement = {
    direction: { x: scenario.initialDir.x, y: scenario.initialDir.y },
    speedFactor: scenario.initialSpeed || 0.82,
    hasDirection: true,
    deceleration: null,
    cut: null
  };

  const log = [];

  function step(delta, reqX, reqY) {
    const magnitude = Math.hypot(reqX, reqY);
    if (magnitude < 0.0001) {
      movement.cut = null;
      if (!movement.deceleration) {
        const tStop = Math.max(MIN_DECEL_TIME, maxDecelTime * (movement.speedFactor ** 2));
        movement.deceleration = { elapsed: 0, startFactor: movement.speedFactor, tStop };
      }
      movement.deceleration.elapsed += delta;
      const progress = Math.min(1, movement.deceleration.elapsed / movement.deceleration.tStop);
      movement.speedFactor = progress >= 1 ? 0 : movement.deceleration.startFactor * (1 - progress ** 2);
      if (movement.speedFactor <= MIN_SPEED_FACTOR) {
        movement.speedFactor = 0;
        movement.deceleration = null;
      }
    } else {
      const direction = { x: reqX / magnitude, y: reqY / magnitude };
      const dot = movement.direction.x * direction.x + movement.direction.y * direction.y;
      movement.deceleration = null;

      if (!movement.hasDirection || movement.speedFactor <= 0.05) {
        movement.direction = direction;
        movement.cut = null;
        movement.speedFactor = 1 - (1 - movement.speedFactor) * Math.exp(-accelerationRate * delta);
      } else if (dot >= STRAIGHT_DOT_THRESHOLD) {
        movement.direction = direction;
        movement.cut = null;
        movement.speedFactor = 1 - (1 - movement.speedFactor) * Math.exp(-accelerationRate * delta);
      } else {
        // Cut / change of direction
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const targetFactor = movement.speedFactor * Math.cos(angle / 2);

        // Check if existing cut can be continued
        const isNewTarget = !movement.cut || 
          (movement.cut.targetDir.x * direction.x + movement.cut.targetDir.y * direction.y) < CUT_TARGET_DOT_THRESHOLD;

        if (isNewTarget) {
          const tStop = Math.max(MIN_DECEL_TIME, maxDecelTime * (movement.speedFactor ** 2));
          const speedDropFraction = Math.max(0, 1 - (targetFactor / movement.speedFactor));
          const tCut = Math.max(MIN_CUT_TIME, tStop * Math.sqrt(speedDropFraction) * CUT_DECEL_TIME_SCALE);
          movement.cut = {
            elapsed: 0,
            startFactor: movement.speedFactor,
            targetFactor,
            targetDir: direction,
            tCut
          };
        } else {
          // Update target heading towards ongoing cut without resetting decel progress
          movement.cut.targetDir = direction;
        }

        movement.cut.elapsed += delta;
        const progress = Math.min(1, movement.cut.elapsed / movement.cut.tCut);
        movement.speedFactor = movement.cut.startFactor - (movement.cut.startFactor - movement.cut.targetFactor) * progress;

        if (progress >= 1 || movement.speedFactor <= movement.cut.targetFactor) {
          movement.speedFactor = movement.cut.targetFactor;
          movement.direction = movement.cut.targetDir;
          movement.cut = null;
        }
      }
      movement.hasDirection = true;
    }

    log.push({
      dir: { ...movement.direction },
      speed: movement.speedFactor,
      inCut: Boolean(movement.cut)
    });
  }

  return { step, log, movement };
}

// Scenario 1: Clean 90-degree cut
console.log('--- SCENARIO 1: Clean 90-degree cut (Right to Down) ---');
const sim1 = simulateMovement({
  initialDir: { x: 1, y: 0 },
  initialSpeed: 0.82,
  agility: 5
});
for (let f = 1; f <= 15; f++) {
  sim1.step(1/60, 0, 1);
  const entry = sim1.log[sim1.log.length - 1];
  console.log(`Frame ${f}: inCut=${entry.inCut}, dir=(${entry.dir.x.toFixed(2)}, ${entry.dir.y.toFixed(2)}), speed=${entry.speed.toFixed(3)}`);
}

// Scenario 2: Diagonal overlap cut (Right -> Right+Down for 2 frames -> Down)
console.log('\n--- SCENARIO 2: Diagonal overlap cut (Right -> Right+Down -> Down) ---');
const sim2 = simulateMovement({
  initialDir: { x: 1, y: 0 },
  initialSpeed: 0.82,
  agility: 5
});
for (let f = 1; f <= 15; f++) {
  if (f <= 2) {
    sim2.step(1/60, 1, 0.7071); // Right + Down
  } else {
    sim2.step(1/60, 0, 1);      // Down
  }
  const entry = sim2.log[sim2.log.length - 1];
  console.log(`Frame ${f}: inCut=${entry.inCut}, dir=(${entry.dir.x.toFixed(2)}, ${entry.dir.y.toFixed(2)}), speed=${entry.speed.toFixed(3)}`);
}

// Scenario 3: Route runner turning 90 degrees at waypoint
console.log('\n--- SCENARIO 3: WR Route Runner 90-degree cut ---');
const sim3 = simulateMovement({
  initialDir: { x: 1, y: 0 },
  initialSpeed: 0.95,
  agility: 5
});
let x = 29.8, y = 0.5;
const targetX = 30.0, targetY = 0.3; // 90-degree cut to sideline
for (let f = 1; f <= 20; f++) {
  const dx = targetX - x;
  const dy = (targetY - y) * 17;
  sim3.step(1/60, dx, dy);
  const entry = sim3.log[sim3.log.length - 1];
  x += entry.dir.x * 7.5 * entry.speed * (1/60);
  y += (entry.dir.y * 7.5 * entry.speed * (1/60)) / 17;
  console.log(`Frame ${f}: inCut=${entry.inCut}, dir=(${entry.dir.x.toFixed(2)}, ${entry.dir.y.toFixed(2)}), speed=${entry.speed.toFixed(3)}, x=${x.toFixed(2)}, y=${y.toFixed(3)}`);
}

