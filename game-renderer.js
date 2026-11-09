(function (root) {
  function create({ state, field, camera, team1, team2, uniformForTeam, throwHeightAt, getBallCarrier }) {
    function draw(ctx, width, height) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#377c08';
      ctx.fillRect(0, 0, width, height);

      const horizontalScale = width / 350;
      const verticalScale = height / field.height;
      const { pixel } = camera.metrics(width, height);
      const passProgress = state.phase === 'thrown' && state.pass ? state.pass.progress : null;
      const isBouncing = state.phase === 'bouncing' && state.bounce;
      const cameraOriginYard = camera.originYard();
      const fieldOrigin = field.goalLine + cameraOriginYard * field.pixelsPerYard;
      const fieldImage = RetroSprites.fieldImage;
      if (fieldImage.complete && fieldImage.naturalWidth) {
        ctx.save();
        ctx.setTransform(horizontalScale, 0, 0, verticalScale, -fieldOrigin * horizontalScale, 0);
        ctx.drawImage(fieldImage, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
        ctx.restore();
      }

      const offense = uniformForTeam(team1);
      const defense = uniformForTeam(team2);
      const lineX = (state.scrimmagePosition - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
      const top = field.topSideline * verticalScale;
      const bottom = field.bottomSideline * verticalScale;
      ctx.fillStyle = 'rgba(46, 92, 138, .72)';
      ctx.fillRect(lineX, top, Math.max(1, pixel), bottom - top);
      const screenCoordinates = actor => ({
        screenX: (actor.x - cameraOriginYard) * field.pixelsPerYard * horizontalScale,
        screenY: top + actor.y * (bottom - top)
      });

      if (state.phase === 'preplay' && state.playType !== 'run') {
        const drawRoute = player => {
          if (!player.route?.length) return;
          ctx.save();
          ctx.strokeStyle = '#ffe35c';
          ctx.lineWidth = Math.max(1, pixel);
          ctx.setLineDash([4 * pixel, 3 * pixel]);
          ctx.beginPath();
          const start = screenCoordinates(player);
          ctx.moveTo(start.screenX, start.screenY);
          for (const waypoint of player.route) {
            const point = screenCoordinates({ x: player.startX + waypoint.dx, y: player.startY + waypoint.dy });
            ctx.lineTo(point.screenX, point.screenY);
          }
          ctx.stroke();
          ctx.restore();
        };
        state.receivers.forEach(drawRoute);
        drawRoute(state.runningBack);
      }

      for (const lineman of state.offensiveLine) lineman.draw(ctx, screenCoordinates(lineman), pixel, offense);
      state.runningBack.draw(ctx, screenCoordinates(state.runningBack), pixel, offense);
      for (const receiver of state.receivers) receiver.draw(ctx, screenCoordinates(receiver), pixel, offense);
      for (const defender of state.defenders) defender.draw(ctx, screenCoordinates(defender), pixel, defense);
      state.quarterback.draw(ctx, screenCoordinates(state.quarterback), pixel, offense);

      if ((passProgress === null && !isBouncing) || !RetroSprites.footballImage.complete || !RetroSprites.footballImage.naturalWidth) return;
      if (passProgress !== null) {
        const targetX = (state.pass.targetX - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
        const targetY = top + state.pass.targetY * (bottom - top);
        const xSize = Math.max(3, 3 * pixel);
        ctx.save();
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = Math.max(1, pixel);
        ctx.beginPath();
        ctx.moveTo(targetX - xSize, targetY - xSize);
        ctx.lineTo(targetX + xSize, targetY + xSize);
        ctx.moveTo(targetX + xSize, targetY - xSize);
        ctx.lineTo(targetX - xSize, targetY + xSize);
        ctx.stroke();
        ctx.restore();
      }

      const ballWorldX = isBouncing
        ? state.bounce.x
        : state.pass.fromX + (state.pass.targetX - state.pass.fromX) * passProgress;
      const ballWorldY = isBouncing
        ? state.bounce.y
        : state.pass.fromY + (state.pass.targetY - state.pass.fromY) * passProgress;
      const ballX = (ballWorldX - cameraOriginYard) * field.pixelsPerYard * horizontalScale;
      const groundY = top + ballWorldY * (bottom - top);
      const heightFeet = isBouncing ? state.bounce.z : (typeof state.pass.heightFeet === 'number'
        ? state.pass.heightFeet : throwHeightAt(passProgress, state.pass));
      const ballY = groundY - heightFeet * ((16 * pixel) / 6);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(ballX, groundY, 4 * pixel, 2 * pixel, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(RetroSprites.footballImage, ballX - 5 * pixel, ballY - 2.5 * pixel, 10 * pixel, 5 * pixel);

      if (typeof document === 'undefined' || !document.getElementById('ball-carrier-banner')) {
        const carrier = typeof getBallCarrier === 'function'
          ? getBallCarrier()
          : (state.phase !== 'thrown' ? (state.receivers.find(r => r.hasBall) || (state.runningBack?.hasBall ? state.runningBack : (state.quarterback?.hasBall ? state.quarterback : null))) : null);
        if (carrier && carrier.name && carrier.position) {
          ctx.save();
          const fontSize = Math.max(14, Math.round(11 * pixel));
          ctx.font = `normal ${fontSize}px "VT323", monospace`;
          ctx.textBaseline = 'bottom';
          ctx.textAlign = 'left';
          const text = `${carrier.name}  ${carrier.position}`;
          const textX = 14 * pixel;
          const textY = height - 8 * pixel;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillText(text, textX + 1, textY + 1);
          ctx.fillStyle = '#f4f0d8';
          ctx.fillText(text, textX, textY);
          ctx.restore();
        }
      }
    }
    return { draw };
  }
  root.GameRenderer = { create };
})(window);
