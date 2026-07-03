import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import { loadConfig, launcher } from '@soundworks/helpers/browser.js';
import { html, render } from 'lit';
import ClientPluginPlatformInit from '@soundworks/plugin-platform-init/client.js';
import ClientPluginSync from '@soundworks/plugin-sync/client.js';
import ClientPluginCheckin from '@soundworks/plugin-checkin/client.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

const NUM_VOICES = 8;

// one audio file per voice, cycling through the dataset if there are more voices than files
const STEM_FILES = [
  'Tones- 1-stretch-2.mp3',
  'Tones- 2-stretch-2.mp3',
  'Tones- 3-stretch-3.mp3',
  'Tones- 4-stretch-4.mp3',
  'Tones- 5-stretch-5.mp3',
  'Tones- 6-stretch-6.mp3',
  'Tones- 7-stretch-7.mp3',
];

async function loadAudioBuffer(audioContext, filename) {
  const response = await fetch(`/assets/stem/${encodeURIComponent(filename)}`);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

async function main($container) {
  const config = loadConfig();
  const client = new Client(config);

  const audioContext = new AudioContext();

  client.pluginManager.register('platform-init', ClientPluginPlatformInit, {
    audioContext,
  });
  client.pluginManager.register('sync', ClientPluginSync, {
    getTimeFunction: () => audioContext.currentTime,
  });
  client.pluginManager.register('checkin', ClientPluginCheckin);

  // cf. https://soundworks.dev/tools/helpers.html#browserlauncher
  launcher.register(client, { initScreensContainer: $container });

  await client.start();

  const sync = await client.pluginManager.get('sync');
  const checkin = await client.pluginManager.get('checkin');
  const voiceIndex = checkin.getIndex() % NUM_VOICES;
  const fileIndex = voiceIndex % STEM_FILES.length;

  const globals = await client.stateManager.attach('global');

  const audioBuffer = await loadAudioBuffer(audioContext, STEM_FILES[fileIndex]);

  const volumeNode = audioContext.createGain();
  volumeNode.gain.value = globals.get('volume');
  volumeNode.connect(audioContext.destination);

  let bufferSource = null;

  function stopPlayback() {
    if (bufferSource !== null) {
      bufferSource.stop();
      bufferSource.disconnect();
      bufferSource = null;
    }
  }

  function startPlayback() {
    stopPlayback();

    const startSyncTime = globals.get('startSyncTime');
    const now = sync.getSyncTime();

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(volumeNode);

    if (startSyncTime > now) {
      // playback starts in the future: schedule it precisely, in phase, at time 0
      const localStartTime = sync.getLocalTime(startSyncTime);
      source.start(localStartTime, 0);
    } else {
      // playback already started elsewhere: join mid-loop at the right position
      const elapsed = now - startSyncTime;
      const offset = elapsed % audioBuffer.duration;
      source.start(audioContext.currentTime, offset);
    }

    bufferSource = source;
  }

  globals.onUpdate(updates => {
    if ('volume' in updates) {
      volumeNode.gain.setTargetAtTime(updates.volume, audioContext.currentTime, 0.05);
    }

    if ('isPlaying' in updates) {
      if (updates.isPlaying) {
        startPlayback();
      } else {
        stopPlayback();
      }

      renderApp();
    }
  });

  if (globals.get('isPlaying')) {
    startPlayback();
  }

  function renderApp() {
    const isPlaying = globals.get('isPlaying');

    render(html`
      <div class="player-layout">
        <img
          class="player-status"
          src="${isPlaying ? '/images/play.png' : '/images/stop.png'}"
          alt="${isPlaying ? 'playing' : 'stopped'}"
        />
      </div>
    `, $container);
  }

  renderApp();
}

// The launcher allows to launch multiple clients in the same browser window
// e.g. `http://127.0.0.1:8000?emulate=10` to run 10 clients side-by-side
launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate') || '') || 1,
});
