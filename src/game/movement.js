export function clampToField(player, fieldBounds) {
  return {
    x: Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, player.x)),
    y: Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, player.y))
  };
}
