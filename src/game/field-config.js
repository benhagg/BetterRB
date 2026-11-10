export const field = {
  x: 0,
  y: 0,
  width: 1305,
  height: 240,
  goalLine: 152,
  pixelsPerYard: 10,
  topSideline: 34,
  bottomSideline: 204
};

// Gameplay coordinates use the full normalized field width: 0 = top sideline, 1 = bottom sideline.
export const fieldBounds = { top: 0, bottom: 1, endZoneL: -10.1, endZoneR: 110.1 };
export const hashMarks = { top: 103, bottom: 135 };
export const cameraTrailingYards = 5;
export const runnerTrailingYards = 15;
export const lateralYards = 25;
export const passGravityFeetPerSecondSquared = 32.174;
