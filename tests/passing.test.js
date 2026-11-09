import { describe, expect, it } from 'vitest';
import Passing from '../game-passing.js';

describe('high-clearance pass arc', () => {
  it('keeps ground-travel duration and places the deep-pass apex at 75%', () => {
    const distance = 15;
    const strength = 5;
    const targetHeight = 4;
    const profile = Passing.throwProfile(distance, targetHeight, strength);

    // This is the pre-clearance timing curve. Flight time must not change
    // merely because the visual/clearance arc is increased.
    const gravity = 32.174;
    const legacyArc = 0.01 * distance * (1 - 0.02 * strength);
    const legacyApex = 6 + legacyArc * distance;
    const legacyLaunch = Math.sqrt(2 * gravity * (legacyApex - 6));
    const legacyDuration = legacyLaunch / gravity
      + Math.sqrt(2 * (legacyApex - targetHeight) / gravity);

    expect(profile.duration).toBeCloseTo(legacyDuration, 8);
    expect(profile.apexAt).toBe(0.75);
    expect(Passing.throwHeightAt(0.75, profile)).toBeCloseTo(profile.apexHeight, 8);
    expect(Passing.throwHeightAt(0.5, profile)).toBeLessThan(Passing.throwHeightAt(0.75, profile));
    expect(Passing.throwHeightAt(1, profile)).toBeCloseTo(targetHeight, 8);
  });

  it('places short-pass apex at 55%', () => {
    const profile = Passing.throwProfile(5, 4, 5);
    expect(profile.apexAt).toBe(0.55);
    expect(Passing.throwHeightAt(0.55, profile)).toBeCloseTo(profile.apexHeight, 8);
  });
});
