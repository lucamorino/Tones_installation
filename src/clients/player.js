import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import { loadConfig, launcher } from '@soundworks/helpers/browser.js';
import { html, render } from 'lit';
import ClientPluginPlatformInit from '@soundworks/plugin-platform-init/client.js';
import ClientPluginSync from '@soundworks/plugin-sync/client.js';
import ClientPluginCheckin from '@soundworks/plugin-checkin/client.js';
import { Scheduler } from '@ircam/sc-scheduling';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

const NUM_VOICES = 8;
const SAMPLE_BASE_FREQ = 220; // A3, pitch of the generated sample at playbackRate = 1

// No audio file is bundled with the app, so we render a small soft bell-like
// sample offline. Swap this for `fetch` + `decodeAudioData` to use a real file.
async function createSampleBuffer(audioContext) {
  const duration = 3;
  const offlineContext = new OfflineAudioContext(1, Math.ceil(duration * audioContext.sampleRate), audioContext.sampleRate);

  const partials = [[1, 0.7], [2, 0.2], [3, 0.1]];
  const ampEnv = offlineContext.createGain();
  ampEnv.gain.setValueAtTime(0, 0);
  ampEnv.gain.linearRampToValueAtTime(1, 0.02);
  ampEnv.gain.exponentialRampToValueAtTime(0.001, duration);
  ampEnv.connect(offlineContext.destination);

  for (const [ratio, amp] of partials) {
    const osc = offlineContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = SAMPLE_BASE_FREQ * ratio;

    const gain = offlineContext.createGain();
    gain.gain.value = amp;

    osc.connect(gain);
    gain.connect(ampEnv);
    osc.start(0);
    osc.stop(duration);
  }

  return offlineContext.startRendering();
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

  const globals = await client.stateManager.attach('instrument-globals');
  const score = await client.stateManager.attach('instrument-score');

  const sampleBuffer = await createSampleBuffer(audioContext);

  const masterGain = audioContext.createGain();
  masterGain.gain.value = globals.get('volume');
  masterGain.connect(audioContext.destination);

  // the score/processor timeline is the sync clock (shared by all devices), while
  // Web Audio events must be scheduled on `audioContext.currentTime` (local to this device)
  const scheduler = new Scheduler(() => sync.getSyncTime(), {
    currentTimeToProcessorTimeFunction: syncTime => sync.getLocalTime(syncTime),
  });

  let activeProcessor = null;

  function playNote(frequency, gain, duration, audioStartTime, params) {
    const { attack, decay, sustain, release, oscMix } = params;
    const sustainStart = audioStartTime + attack + decay;
    const releaseStart = Math.max(sustainStart, audioStartTime + duration);
    const stopTime = releaseStart + release;

    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0, audioStartTime);
    envelope.gain.linearRampToValueAtTime(gain, audioStartTime + attack);
    envelope.gain.linearRampToValueAtTime(gain * sustain, sustainStart);
    envelope.gain.setValueAtTime(gain * sustain, releaseStart);
    envelope.gain.linearRampToValueAtTime(0, stopTime);
    envelope.connect(masterGain);

    if (oscMix > 0) {
      const oscGain = audioContext.createGain();
      oscGain.gain.value = oscMix;
      oscGain.connect(envelope);

      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(oscGain);
      osc.start(audioStartTime);
      osc.stop(stopTime + 0.1);
    }

    if (oscMix < 1) {
      const sampleGain = audioContext.createGain();
      sampleGain.gain.value = 1 - oscMix;
      sampleGain.connect(envelope);

      const source = audioContext.createBufferSource();
      source.buffer = sampleBuffer;
      source.loop = true;
      source.playbackRate.value = frequency / SAMPLE_BASE_FREQ;
      source.connect(sampleGain);
      source.start(audioStartTime);
      source.stop(stopTime + 0.1);
    }
  }

  function stopPlayback() {
    if (activeProcessor !== null) {
      scheduler.remove(activeProcessor);
      activeProcessor = null;
    }
  }

  function startPlayback() {
    stopPlayback();

    const startSyncTime = globals.get('startSyncTime');
    const loopDuration = globals.get('loopDuration');
    const voice = score.getUnsafe('voices')[voiceIndex];

    const now = sync.getSyncTime();
    const elapsed = Math.max(0, now - startSyncTime);
    const currentLoop = Math.floor(elapsed / loopDuration);
    let nextNoteSyncTime = startSyncTime + currentLoop * loopDuration + voice.offset * loopDuration;

    if (nextNoteSyncTime < now + 0.05) {
      nextNoteSyncTime += loopDuration;
    }

    const processor = (currentTime, processorTime) => {
      const params = globals.getValues();
      const currentVoice = score.getUnsafe('voices')[voiceIndex];

      if (!params.isPlaying) {
        activeProcessor = null;
        return Infinity;
      }

      if (currentVoice.active) {
        playNote(currentVoice.frequency, currentVoice.gain * params.volume, currentVoice.duration, processorTime, params);
      }

      return currentTime + params.loopDuration;
    };

    activeProcessor = processor;
    scheduler.add(processor, nextNoteSyncTime);
  }

  globals.onUpdate(updates => {
    if ('volume' in updates) {
      masterGain.gain.setTargetAtTime(updates.volume, audioContext.currentTime, 0.05);
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
          src="${isPlaying ? '/images/stop.png' : '/images/play.png'}"
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
