import { defineConfig } from 'vite';

function pauseHmrDuringGame() {
  const activeClients = new Set();
  let deferredUpdate = false;

  function reloadWhenGameEnds(server) {
    if (activeClients.size || !deferredUpdate) return;
    deferredUpdate = false;
    server.ws.send({ type: 'full-reload' });
  }

  return {
    name: 'pause-hmr-during-game',
    configureServer(server) {
      server.ws.on('better-rb:game-session', (data, client) => {
        if (data?.active) activeClients.add(client);
        else activeClients.delete(client);
        reloadWhenGameEnds(server);
      });
      server.ws.on('vite:client:disconnect', (_data, client) => {
        activeClients.delete(client);
        reloadWhenGameEnds(server);
      });
    },
    hotUpdate() {
      if (!activeClients.size) return;
      deferredUpdate = true;
      return [];
    }
  };
}

export default defineConfig({
  plugins: [pauseHmrDuringGame()],
  server: {
    port: 3000
  }
});

