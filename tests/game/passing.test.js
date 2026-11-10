import { describe, expect, it } from 'vitest';
import Passing from '../../src/game/passing.js';

describe('high-clearance pass arc', () => {
  it('scales the maximum throw distance from 15 to 30 yards by strength', () => {
    expect(Passing.maxThrowDistance(0)).toBe(15);
    expect(Passing.maxThrowDistance(5)).toBe(22.5);
    expect(Passing.maxThrowDistance(10)).toBe(30);
  });

  it('uses gravity to reach a bounded deep-pass apex', () => {
    const distance = 15;
    const strength = 5;
    const targetHeight = 4;
    const profile = Passing.throwProfile(distance, targetHeight, strength);

    const gravity = 32.174;
    const timeToApex = profile.launchVelocity / gravity;
    const expectedDuration = timeToApex
      + Math.sqrt(2 * (profile.apexHeight - targetHeight) / gravity);

    expect(profile.duration).toBeCloseTo(expectedDuration, 8);
    expect(profile.apexHeight).toBeLessThanOrEqual(14);
    expect(Passing.throwHeightAt(profile.apexAt, profile)).toBeCloseTo(profile.apexHeight, 8);
    expect(Passing.throwHeightAt(1, profile)).toBeCloseTo(targetHeight, 8);
  });

  it('places short-pass apex at 55%', () => {
    const profile = Passing.throwProfile(5, 4, 5);
    expect(Passing.throwHeightAt(profile.apexAt, profile)).toBeCloseTo(profile.apexHeight, 8);
  });
});
