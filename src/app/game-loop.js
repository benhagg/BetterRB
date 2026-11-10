import { movementInput } from './game-controls.js';

export function createGameLoop({ app, getSession, getScreen, movementKeys, formatClock, onFrame = () => {} }) {
  let frameId = null;

  function stop() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    movementKeys.clear();
  }

  function start() {
    const canvas = app.querySelector('#game-canvas');
    const context = canvas?.getContext('2d');
    if (!context) return;
    let previousTime = null;

    function frame(now) {
      const session = getSession();
      if (getScreen() !== 'game' || !session) return;
      const seconds = previousTime === null ? 0 : (now - previousTime) / 1000;
      previousTime = now;
      session.update(seconds, movementInput(movementKeys));
      session.draw(context, canvas.width, canvas.height);
      const clock = app.querySelector('#game-clock');
      if (clock) clock.textContent = formatClock(session.state.clockSeconds);
      onFrame(session);
      const overlay = app.querySelector('#play-select-overlay');
      if (session.state.phase !== 'preplay' && overlay) overlay.classList.add('hidden');
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
  }

  return { start, stop };
}

