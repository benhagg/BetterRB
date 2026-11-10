import { describe, expect, it } from 'vitest';
import PlayerClasses from '../../src/game/players/index.js';
import DefenseAI from '../../src/game/defense-ai.js';
import GameZoneEngine from '../../src/game/zone-agent.js';

const { DefensivePlayer, WideReceiver, TightEnd, Quarterback } = PlayerClasses;
const bounds = { top: 0, bottom: 1, endZoneL: 0, endZoneR: 100 };

function setup(role = 'zone') {
  const defender = new DefensivePlayer({ position: 'DB', x: 30, y: 0.5 });
  Object.assign(defender, { role, zone: 'hook', manTarget: 'WR1', across: 0 });
  const receiver = new WideReceiver({ position: 'WR', x: 34, y: 0.5 });
  receiver.routeIndex = 0;
  const quarterback = new Quarterback({ x: 22, y: 0.5 });
  quarterback.hasBall = true;
  const state = { phase: 'passing', defenders: [defender], receivers: [receiver], runningBack: null, quarterback, scrimmagePosition: 25 };
  const ai = DefenseAI.create({ state, lateralYards: 17, fieldBounds: bounds });
  ai.initialize(state.defenders);
  return { ai, state, defender, receiver };
}

describe('defensive AI', () => {
  it('calculates reaction delays based on momentum and backpedaling', () => {
    const defender = { x: 0, y: 0.5, velocityX: 4, velocityY: 0 };
    expect(DefenseAI.calculateDefenderReactionDelay(defender, { x: 2, y: 0.5 })).toBeCloseTo(0);
    expect(DefenseAI.calculateDefenderReactionDelay(defender, { x: -2, y: 0.5 })).toBeCloseTo(0.3);
    expect(DefenseAI.calculateDefenderReactionDelay({ ...defender, isBackpedaling: true }, { x: -2, y: 0.5 })).toBe(0);
  });

  it('rushes the quarterback and ends the play on contact', () => {
    const { ai, state, defender } = setup('rush');
    defender.x = 22.5;
    ai.update(1 / 60);
    expect(state.quarterback.isTackled).toBe(true);
    expect(state.phase).toBe('complete');
  });

  it('reacts to a throw and breaks toward its target', () => {
    const { ai, state, defender } = setup();
    const pass = { targetX: 40, targetY: 0.5 };
    state.phase = 'thrown';
    state.pass = pass;
    ai.onPassReleased(pass);
    for (let i = 0; i < 60; i++) ai.update(1 / 60);
    expect(defender.x).toBeGreaterThan(30);
    expect(defender.defenseAI.mode).toBe('ball');
  });

  it('tracks a man assignment and delays after a route cut', () => {
    const { ai, defender, receiver } = setup('man');
    ai.update(1 / 60);
    expect(defender.isBackpedaling).toBe(true);
    receiver.routeIndex = 1;
    ai.update(1 / 60);
    expect(defender.defenseAI.delay).toBeCloseTo(0.2);
  });

  it('lines man defenders up beside their assigned receiver before the snap', () => {
    const receivers = [
      new WideReceiver({ position: 'WR', x: 31, y: 0.22, receiverNumber: 1 }),
      new TightEnd({ x: 29, y: 0.5, receiverNumber: 2 }),
      new WideReceiver({ position: 'WR', x: 31, y: 0.78, receiverNumber: 3 })
    ];
    const defenders = [
      Object.assign(new DefensivePlayer({ position: 'DB' }), { role: 'man', manTarget: 'WR1', coverageOffset: 2 }),
      Object.assign(new DefensivePlayer({ position: 'DB' }), { role: 'man', manTarget: 'WR2', coverageOffset: 3 })
    ];
    const state = {
      phase: 'preplay',
      defenders,
      receivers,
      runningBack: null,
      quarterback: { x: 25, y: 0.5 }
    };
    const ai = DefenseAI.create({ state, lateralYards: 25, fieldBounds: bounds });

    ai.initialize(defenders, 'man');

    expect(defenders[0].defenseAI.manTargetPlayer).toBe(receivers[0]);
    expect(defenders[0].y).toBe(receivers[0].y);
    expect(defenders[0].x).toBe(receivers[0].x + 2);
    expect(defenders[1].defenseAI.manTargetPlayer).toBe(receivers[2]);
    expect(defenders[1].y).toBe(receivers[2].y);
    expect(defenders[1].x).toBe(receivers[2].x + 3);

    // Reinitializing for a changed offensive formation must realign the same
    // matchup instead of leaving its defender at the old receiver location.
    receivers[2].y = 0.7;
    ai.initialize(defenders, 'man');
    expect(defenders[1].y).toBe(receivers[2].y);
  });

  it('lines man defenders up on the same side of the field as the receiver they are responsible for', () => {
    const receivers = [
      new WideReceiver({ position: 'WR', x: 30, y: 0.18, receiverNumber: 1 }),
      new WideReceiver({ position: 'WR', x: 30, y: 0.82, receiverNumber: 2 })
    ];
    // Defender 0 starts on the top side (y = 0.20), Defender 1 starts on the bottom side (y = 0.80).
    // Even if assigned cross-field labels (WR2 to top DB, WR1 to bottom DB),
    // matchup alignment must ensure defenders line up on the same side of the field as their assignment.
    const defenders = [
      Object.assign(new DefensivePlayer({ position: 'DB', x: 35, y: 0.20 }), { role: 'man', manTarget: 'WR2', coverageOffset: 4, startY: 0.20 }),
      Object.assign(new DefensivePlayer({ position: 'DB', x: 35, y: 0.80 }), { role: 'man', manTarget: 'WR1', coverageOffset: 4, startY: 0.80 })
    ];
    const state = {
      phase: 'preplay',
      defenders,
      receivers,
      runningBack: null,
      quarterback: { x: 25, y: 0.5 }
    };
    const ai = DefenseAI.create({ state, lateralYards: 25, fieldBounds: bounds });
    ai.initialize(defenders, 'man');

    // Defender 0 (top) must be responsible for top receiver (receivers[0]) and line up on top side (y < 0.5)
    expect(defenders[0].defenseAI.manTargetPlayer).toBe(receivers[0]);
    expect(defenders[0].y).toBeCloseTo(receivers[0].y);
    expect(defenders[0].y).toBeLessThan(0.5);

    // Defender 1 (bottom) must be responsible for bottom receiver (receivers[1]) and line up on bottom side (y > 0.5)
    expect(defenders[1].defenseAI.manTargetPlayer).toBe(receivers[1]);
    expect(defenders[1].y).toBeCloseTo(receivers[1].y);
    expect(defenders[1].y).toBeGreaterThan(0.5);
  });

  it('aligns zone defenders on the same side of the field as their zone assignment', () => {
    const defenders = [
      Object.assign(new DefensivePlayer({ position: 'LB', x: 28, y: 0.70 }), { role: 'zone', zone: 'flat_top' }),
      Object.assign(new DefensivePlayer({ position: 'LB', x: 28, y: 0.30 }), { role: 'zone', zone: 'flat_bottom' }),
      Object.assign(new DefensivePlayer({ position: 'DB', x: 33, y: 0.75 }), { role: 'zone', zone: 'deep_top' }),
      Object.assign(new DefensivePlayer({ position: 'DB', x: 33, y: 0.25 }), { role: 'zone', zone: 'deep_bottom' })
    ];
    const state = { phase: 'preplay', defenders, receivers: [], runningBack: null, quarterback: { x: 25, y: 0.5 } };
    const zoneEngine = GameZoneEngine.create({ state, lateralYards: 25, fieldBounds: bounds });
    const ai = DefenseAI.create({ state, lateralYards: 25, fieldBounds: bounds, zoneEngine });

    ai.initialize(defenders, { type: 'zone' });

    // Top zone defenders must line up on the top side of the field (y < 0.5)
    expect(defenders[0].y).toBeLessThan(0.5);
    expect(defenders[0].defenseAI.anchor.y).toBeLessThan(0.5);
    expect(defenders[2].y).toBeLessThan(0.5);
    expect(defenders[2].defenseAI.anchor.y).toBeLessThan(0.5);

    // Bottom zone defenders must line up on the bottom side of the field (y > 0.5)
    expect(defenders[1].y).toBeGreaterThan(0.5);
    expect(defenders[1].defenseAI.anchor.y).toBeGreaterThan(0.5);
    expect(defenders[3].y).toBeGreaterThan(0.5);
    expect(defenders[3].defenseAI.anchor.y).toBeGreaterThan(0.5);
  });

  it('contests receivers in a zone and returns to the anchor when they leave', () => {
    const { ai, defender, receiver } = setup();
    receiver.x = 31;
    ai.update(0.1);
    expect(defender.isBackpedaling).toBe(false);
    receiver.x = 40;
    ai.update(0.1);
    expect(defender.isBackpedaling).toBe(true);
  });

  it('recognizes a handoff and pursues the ball carrier', () => {
    const { ai, state, defender, receiver } = setup();
    receiver.hasBall = true;
    state.quarterback.hasBall = false;
    state.phase = 'running';
    ai.update(1 / 60);
    expect(defender.defenseAI.mode).toBe('pursuit');
    for (let i = 0; i < 360 && state.phase !== 'complete'; i++) ai.update(1 / 60);
    expect(receiver.isTackled).toBe(true);
    expect(state.phase).toBe('complete');
  });

  it('leads an assigned player into the future based on their movement velocity', () => {
    const { ai, defender, receiver } = setup('man');
    defender.speed = 6;
    defender.x = 30;
    defender.y = 0.5;

    // Stationary receiver: defender targets current location
    receiver.x = 24;
    receiver.y = 0.5;
    receiver.velocityX = 0;
    receiver.velocityY = 0;
    const stationaryTarget = ai.pursueTarget(defender, receiver);
    expect(stationaryTarget.x).toBeCloseTo(24);
    expect(stationaryTarget.y).toBeCloseTo(0.5);

    // Receiver moving downfield with velocityX = 6:
    // Defender at x=30, receiver at x=24 running East towards defender.
    // Intercept should be in the future (ahead of receiver's current 24).
    receiver.velocityX = 6;
    receiver.velocityY = 0;
    const movingTarget = ai.pursueTarget(defender, receiver);
    expect(movingTarget.x).toBeGreaterThan(24);
    expect(movingTarget.x).toBeLessThan(30);

    // Receiver crossing vertically (velocityY = 5 / 17):
    receiver.velocityX = 0;
    receiver.velocityY = 5 / 17;
    const crossingTarget = ai.pursueTarget(defender, receiver);
    expect(crossingTarget.y).toBeGreaterThan(0.5);
  });

  it('rusher leads a scrambling quarterback based on movement', () => {
    const { ai, state, defender } = setup('rush');
    defender.speed = 6;
    defender.x = 26;
    defender.y = 0.5;

    state.quarterback.x = 20;
    state.quarterback.y = 0.5;
    state.quarterback.velocityX = 0;
    state.quarterback.velocityY = 4 / 17; // scrambling towards sideline

    const interceptTarget = ai.pursueTarget(defender, state.quarterback);
    expect(interceptTarget.y).toBeGreaterThan(0.5);
  });

  it('pursuit target takes a cutoff pursuit angle downfield instead of beelining directly at the carrier', () => {
    const { ai, defender, receiver } = setup('pursuit');
    defender.speed = 6;
    defender.x = 30;
    defender.y = 0.35; // slightly off-center

    receiver.x = 20;
    receiver.y = 0.5;
    receiver.velocityX = 6; // running East downfield
    receiver.velocityY = 0;

    const target = ai.pursueTarget(defender, receiver);
    // Direct angle from defender to receiver
    const directDx = receiver.x - defender.x;
    const directDy = (receiver.y - defender.y) * 17;
    const directAngle = Math.atan2(directDy, directDx) * 180 / Math.PI;

    // Predicted cutoff angle
    const targetDx = target.x - defender.x;
    const targetDy = (target.y - defender.y) * 17;
    const targetAngle = Math.atan2(targetDy, targetDx) * 180 / Math.PI;

    const angleDiff = Math.abs(targetAngle - directAngle);
    expect(angleDiff).toBeGreaterThan(30);
    expect(target.x).toBeGreaterThan(25);
  });

  it('man coverage maintains cushion and stays ahead on vertical route instead of charging head-on', () => {
    const { ai, defender, receiver } = setup('man');
    defender.x = 28;
    defender.y = 0.5;
    defender.coverageOffset = 4;

    receiver.x = 24;
    receiver.y = 0.5;
    receiver.velocityX = 5;
    receiver.velocityY = 0;

    ai.update(1 / 60);
    // Defender must stay ahead of the receiver and continue backpedaling downfield
    expect(defender.x).toBeGreaterThan(receiver.x);
    expect(defender.isBackpedaling).toBe(true);
  });
});
