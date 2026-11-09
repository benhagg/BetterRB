(function (root) {
  function create({ state, field, fieldBounds, cameraTrailingYards = 5, runnerTrailingYards = 15, ballCarrier }) {
    function metrics(width, height) {
      const pixel = Math.max(1, Math.min(Math.round(height / 180), Math.floor(width / 360)));
      return { pixel };
    }

    function originYard() {
      const passProgress = (state.phase === 'thrown' || state.phase === 'complete') && state.pass ? state.pass.progress : null;
      const trackingYard = passProgress === null
        ? (ballCarrier()?.x ?? state.fieldPosition)
        : state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
      const initialOrigin = state.scrimmagePosition - cameraTrailingYards;
      return Math.max(initialOrigin, trackingYard - runnerTrailingYards);
    }

    function canvasCoordsToField(canvasX, canvasY, width = 960, height = 540) {
      const horizontalScale = width / 350;
      const verticalScale = height / field.height;
      const top = field.topSideline * verticalScale;
      const bottom = field.bottomSideline * verticalScale;
      const x = originYard() + canvasX / (field.pixelsPerYard * horizontalScale);
      const y = (canvasY - top) / (bottom - top);
      return {
        x: Math.max(fieldBounds.endZoneL, Math.min(fieldBounds.endZoneR, x)),
        y: Math.max(fieldBounds.top, Math.min(fieldBounds.bottom, y))
      };
    }

    return { metrics, originYard, canvasCoordsToField };
  }

  root.GameCamera = { create };
})(window);
