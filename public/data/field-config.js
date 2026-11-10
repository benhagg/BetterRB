// Pixel-Calibrated Field & Boundary Constants (from calibrate.html)
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

export const fieldBounds = {
  top: 0.1417,
  bottom: 0.85,
  endZoneL: -10.1,
  endZoneR: 110.1
};

// Hash-mark centers, measured directly from the field image.
export const hashMarks = {
  top: 103,
  bottom: 135
};
