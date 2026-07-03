import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import { loadConfig, launcher } from '@soundworks/helpers/browser.js';
import { html, render } from 'lit';
import ClientPluginSync from '@soundworks/plugin-sync/client.js';
import '@ircam/sc-components';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function main($container) {
  const config = loadConfig();
  const client = new Client(config);

  client.pluginManager.register('sync', ClientPluginSync);

  // cf. https://soundworks.dev/tools/helpers.html#browserlauncher
  launcher.register(client, {
    initScreensContainer: $container,
    reloadOnVisibilityChange: false,
  });

  await client.start();

  const sync = await client.pluginManager.get('sync');
  const globals = await client.stateManager.attach('global');

  function togglePlayback() {
    if (globals.get('isPlaying')) {
      globals.set({ isPlaying: false });
    } else {
      // give every player a couple of seconds to schedule the next loop start in sync
      globals.set({ isPlaying: true, startSyncTime: sync.getSyncTime() + 2 });
    }
  }

  function updateVolume(value) {
    globals.set({ volume: value });
  }

  let timingInterval = null;

  function renderApp() {
    const g = globals.getValues();
    const elapsed = g.isPlaying ? sync.getSyncTime() - g.startSyncTime : 0;

    render(html`
      <div class="controller-layout">
        <header>
          <h1>${client.config.app.name} | ${client.role}</h1>
          <sw-audit .client="${client}"></sw-audit>
        </header>
        <section>
          <div class="transport">
            <img
              class="transport-button"
              src="${g.isPlaying ? '/images/stop.png' : '/images/play.png'}"
              alt="${g.isPlaying ? 'stop' : 'play'}"
              @click="${togglePlayback}"
            />
            <span class="timing">${formatTime(elapsed)}</span>
          </div>

          <div class="globals">
            <label>
              volume
              <sc-slider min="0" max="1" number-box value="${g.volume}"
                @input="${e => updateVolume(e.detail.value)}"
              ></sc-slider>
            </label>
          </div>
        </section>
      </div>
    `, $container);
  }

  globals.onUpdate(updates => {
    renderApp();

    if ('isPlaying' in updates) {
      clearInterval(timingInterval);

      if (updates.isPlaying) {
        timingInterval = setInterval(renderApp, 250);
      }
    }
  });

  if (globals.get('isPlaying')) {
    timingInterval = setInterval(renderApp, 250);
  }

  renderApp();
}

launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate') || '') || 1,
  width: '50%',
});
