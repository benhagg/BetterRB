import { describe, expect, it } from 'vitest';
import PlayerClasses from '../../src/game/players/index.js';
import DefenseAI from '../../src/game/defense-ai.js';

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
    for (let i = 0; i < 180 && state.phase !== 'complete'; i++) ai.update(1 / 60);
    expect(receiver.isTackled).toBe(true);
    expect(state.phase).toBe('complete');
  });
});
