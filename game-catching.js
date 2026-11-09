(function (root) {
  const REACH_FORWARD_YARDS = 1.8;
  const REACH_LATERAL_YARDS = 1.2;
  const REACH_REAR_YARDS = 0.6;
  const HEIGHT_JUMP_THRESHOLD_FEET = 8.5;
  const HEIGHT_MAX_JUMP_FEET = 10;
  const HEIGHT_MIN_FEET = 0;
  const JUMP_CATCH_PENALTY = 0.85;
  const INTENDED_TARGET_BONUS = 0.15;
  const SIMULATION_STEP = 1 / 60;
  const SIMULTANEOUS_WINDOW = SIMULATION_STEP + 0.001;
  const GRAVITY = 32.174;

  function playerRating(player, name, fallback = 5) {
    const value = player?.ratings?.[name] ?? player?.rating?.[name] ?? player?.[name];
    return Math.max(0, Math.min(10, Number.isFinite(Number(value)) ? Number(value) : fallback));
  }

  function create({ state, lateralYards }) {
    function eligiblePlayers() {
      const offense = [...(state.receivers || []), state.runningBack].filter(Boolean)
        .map(player => ({ player, side: 'offense' }));
      const defense = (state.defenders || [])
        .filter(player => ['DB', 'LB'].includes(String(player.position || '').toUpperCase()))
        .map(player => ({ player, side: 'defense' }));
      return [...offense, ...defense];
    }

    function headingFor(player, ballX, ballY) {
      const vx = Number(player.velocityX) || 0;
      const vy = (Number(player.velocityY) || 0) * lateralYards;
      const speed = Math.hypot(vx, vy);
      if (speed > 0.05) return { x: vx / speed, y: vy / speed };
      const dx = ballX - player.x;
      const dy = (ballY - player.y) * lateralYards;
      const length = Math.hypot(dx, dy);
      if (length > 0.001) return { x: dx / length, y: dy / length };
      return { x: player.facingLeft ? -1 : 1, y: 0 };
    }

    function probability(player, ball) {
      if (ball.z <= HEIGHT_MIN_FEET || ball.z > HEIGHT_MAX_JUMP_FEET) return null;
      const heading = headingFor(player, ball.x, ball.y);
      const dx = ball.x - player.x;
      const dy = (ball.y - player.y) * lateralYards;
      const parallel = dx * heading.x + dy * heading.y;
      const lateral = Math.abs(dx * heading.y - dy * heading.x);
      const longitudinalReach = parallel >= 0 ? REACH_FORWARD_YARDS : REACH_REAR_YARDS;
      const distance = Math.hypot(parallel / longitudinalReach, lateral / REACH_LATERAL_YARDS);
      if (distance > 1) return null;
      const heightFactor = ball.z > HEIGHT_JUMP_THRESHOLD_FEET ? JUMP_CATCH_PENALTY : 1;
      const chance = Math.max(0, Math.min(1,
        (1 - distance ** 2) * heightFactor * (0.5 + 0.05 * playerRating(player, 'catching'))
      ));
      return {
        chance,
        normalizedDistance: distance,
        catchType: ball.z < 2 ? 'dive' : ball.z > HEIGHT_JUMP_THRESHOLD_FEET ? 'jump' : 'standard'
      };
    }

    function snapshot(player) {
      const vx = Number(player.velocityX) || 0;
      const vy = Number(player.velocityY) || 0;
      const speed = Math.hypot(vx, vy * lateralYards);
      const direction = speed > 0.05
        ? { x: vx / speed, y: (vy * lateralYards) / speed }
        : { x: Number(player.lastDirX) || 1, y: Number(player.lastDirY) || 0 };
      return { x: player.x, y: player.y, speed: player.speed || 0, speedFactor: player._movement?.speedFactor ?? Math.min(1, speed / Math.max(player.speed || 1, 0.001)), direction };
    }

    function advance(sim, seconds, agility, target = null) {
      const rate = 1.3 / Math.max(0.5, 1 - agility * 0.05);
      sim.speedFactor = 1 - (1 - sim.speedFactor) * Math.exp(-rate * seconds);
      const distance = sim.speed * sim.speedFactor * seconds;
      if (target) {
        const dx = target.x - sim.x;
        const dy = (target.y - sim.y) * lateralYards;
        const remaining = Math.hypot(dx, dy);
        if (remaining <= 0.05) return;
        sim.direction = { x: dx / remaining, y: dy / remaining };
        const step = Math.min(distance, remaining);
        sim.x += sim.direction.x * step;
        sim.y += (sim.direction.y * step) / lateralYards;
        return;
      }
      sim.x += sim.direction.x * distance;
      sim.y += (sim.direction.y * distance) / lateralYards;
    }

    function ballAt(pass, time) {
      const progress = Math.max(0, Math.min(1, time / pass.duration));
      const profile = pass.profile;
      const apexAt = profile.apexAt ?? 0.5;
      const height = progress <= apexAt
        ? profile.releaseHeight + (profile.apexHeight - profile.releaseHeight) * Math.pow(progress / apexAt, 2)
        : profile.apexHeight + (profile.targetHeight - profile.apexHeight) * Math.pow((progress - apexAt) / (1 - apexAt), 2);
      return {
        x: pass.fromX + (pass.targetX - pass.fromX) * progress,
        y: pass.fromY + (pass.targetY - pass.fromY) * progress,
        z: height
      };
    }

    function schedule(pass) {
      if (!pass || pass.catchPlan) return pass?.catchPlan;
      const candidates = eligiblePlayers();
      const sims = new Map(candidates.map(({ player }) => [player, snapshot(player)]));
      const best = new Map();

      for (let time = 0; time <= pass.duration + 0.0001; time += SIMULATION_STEP) {
        const ball = ballAt(pass, Math.min(time, pass.duration));
        for (const { player, side } of candidates) {
          const sim = sims.get(player);
          // At release, players continue in their current heading. This mirrors
          // the existing route engine without mutating live player objects.
          const shouldPursueTarget = player.receiverNumber === pass.targetReceiverNumber
            && (pass.wasTargetMoving || Math.hypot(pass.targetX - player.x, (pass.targetY - player.y) * lateralYards) <= 5);
          const target = shouldPursueTarget
            ? { x: pass.targetX, y: pass.targetY }
            : null;
          if (time > 0) advance(sim, SIMULATION_STEP, playerRating(player, 'agility'), target);
          const simulatedPlayer = { ...player, x: sim.x, y: sim.y, velocityX: sim.direction.x * sim.speed * sim.speedFactor, velocityY: sim.direction.y * sim.speed * sim.speedFactor / lateralYards };
          const result = probability(simulatedPlayer, ball);
          if (!result) continue;
          const previous = best.get(player);
          if (!previous || result.chance > previous.chance) {
            best.set(player, { player, side, time: Math.min(time, pass.duration), ball, ...result });
          }
        }
      }

      const attempts = [...best.values()]
        .map(attempt => ({ ...attempt, roll: Math.random(), attempted: false }))
        .sort((a, b) => a.time - b.time || a.normalizedDistance - b.normalizedDistance);
      pass.catchPlan = { attempts, nextIndex: 0, resolved: false };
      return pass.catchPlan;
    }

    function priority(attempt, pass) {
      return attempt.chance + (attempt.side === 'offense' && attempt.player.receiverNumber === pass.targetReceiverNumber
        ? INTENDED_TARGET_BONUS : 0);
    }

    function resolve(pass, elapsed) {
      const plan = schedule(pass);
      if (!plan || plan.resolved) return null;
      const attempts = plan.attempts;
      while (plan.nextIndex < attempts.length && attempts[plan.nextIndex].time <= elapsed + 0.0001) {
        const time = attempts[plan.nextIndex].time;
        const group = [];
        while (plan.nextIndex < attempts.length && Math.abs(attempts[plan.nextIndex].time - time) <= SIMULTANEOUS_WINDOW) {
          const attempt = attempts[plan.nextIndex++];
          attempt.attempted = true;
          if (attempt.roll <= attempt.chance) group.push(attempt);
        }
        if (!group.length) continue;
        const offense = group.filter(attempt => attempt.side === 'offense');
        const defense = group.filter(attempt => attempt.side === 'defense');
        const bestOffense = offense.sort((a, b) => priority(b, pass) - priority(a, pass))[0];
        const bestDefense = defense.sort((a, b) => priority(b, pass) - priority(a, pass))[0];
        let winner = bestOffense || bestDefense;
        if (bestOffense && bestDefense && priority(bestDefense, pass) > priority(bestOffense, pass)) winner = bestDefense;
        plan.resolved = true;
        return { ...winner, ball: ballAt(pass, winner.time), interception: winner.side === 'defense' };
      }
      return null;
    }

    return { schedule, resolve, probability };
  }

  root.GameCatching = { create };
})(typeof window !== 'undefined' ? window : globalThis);
