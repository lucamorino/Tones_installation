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

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNameToFrequency(noteName) {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(noteName.trim());

  if (!match) {
    return null;
  }

  const [, letter, accidental, octave] = match;
  const semitone = NOTE_SEMITONES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (parseInt(octave, 10) + 1) * 12 + semitone;

  return 440 * Math.pow(2, (midi - 69) / 12);
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
  const globals = await client.stateManager.attach('instrument-globals');
  const score = await client.stateManager.attach('instrument-score');

  function togglePlayback() {
    if (globals.get('isPlaying')) {
      globals.set({ isPlaying: false });
    } else {
      // give every player a couple of seconds to schedule the next loop start in sync
      globals.set({ isPlaying: true, startSyncTime: sync.getSyncTime() + 2 });
    }
  }

  function updateGlobal(name, value) {
    globals.set({ [name]: value });
  }

  function updateVoice(index, patch) {
    const voices = score.get('voices').slice();
    voices[index] = { ...voices[index], ...patch };
    score.set({ voices });
  }

  function renderApp() {
    const g = globals.getValues();
    const voices = score.get('voices');

    render(html`
      <div class="controller-layout">
        <header>
          <h1>${client.config.app.name} | ${client.role}</h1>
          <sw-audit .client="${client}"></sw-audit>
        </header>
        <section>
          <div class="transport">
            <sc-toggle
              ?active="${g.isPlaying}"
              .value="${g.isPlaying}"
              @change="${togglePlayback}"
            ></sc-toggle>
            <span>${g.isPlaying ? 'playing' : 'stopped'}</span>

            <label>
              loop (s)
              <sc-number
                min="4" max="180" integer
                value="${g.loopDuration}"
                @change="${e => updateGlobal('loopDuration', e.detail.value)}"
              ></sc-number>
            </label>
          </div>

          <div class="globals">
            <label>
              volume
              <sc-slider min="0" max="1" number-box value="${g.volume}"
                @input="${e => updateGlobal('volume', e.detail.value)}"
              ></sc-slider>
            </label>
            <label>
              osc / sample mix
              <sc-slider min="0" max="1" number-box value="${g.oscMix}"
                @input="${e => updateGlobal('oscMix', e.detail.value)}"
              ></sc-slider>
            </label>
            <label>
              attack
              <sc-slider min="0.05" max="20" number-box value="${g.attack}"
                @input="${e => updateGlobal('attack', e.detail.value)}"
              ></sc-slider>
            </label>
            <label>
              decay
              <sc-slider min="0.05" max="10" number-box value="${g.decay}"
                @input="${e => updateGlobal('decay', e.detail.value)}"
              ></sc-slider>
            </label>
            <label>
              sustain
              <sc-slider min="0" max="1" number-box value="${g.sustain}"
                @input="${e => updateGlobal('sustain', e.detail.value)}"
              ></sc-slider>
            </label>
            <label>
              release
              <sc-slider min="0.1" max="30" number-box value="${g.release}"
                @input="${e => updateGlobal('release', e.detail.value)}"
              ></sc-slider>
            </label>
          </div>

          <table class="score">
            <thead>
              <tr>
                <th>voice</th>
                <th>on</th>
                <th>note</th>
                <th>freq (Hz)</th>
                <th>offset</th>
                <th>duration (s)</th>
                <th>gain</th>
              </tr>
            </thead>
            <tbody>
              ${voices.map((voice, index) => html`
                <tr>
                  <td>${index}</td>
                  <td>
                    <sc-toggle
                      ?active="${voice.active}"
                      .value="${voice.active}"
                      @change="${e => updateVoice(index, { active: e.detail.value })}"
                    ></sc-toggle>
                  </td>
                  <td>
                    <sc-text
                      value="${voice.noteName}"
                      @change="${e => {
                        const frequency = noteNameToFrequency(e.detail.value);

                        if (frequency !== null) {
                          updateVoice(index, { noteName: e.detail.value, frequency });
                        }
                      }}"
                    ></sc-text>
                  </td>
                  <td>
                    <sc-number
                      min="20" max="2000" step="0.01"
                      value="${voice.frequency}"
                      @change="${e => updateVoice(index, { frequency: e.detail.value })}"
                    ></sc-number>
                  </td>
                  <td>
                    <sc-slider min="0" max="1" number-box value="${voice.offset}"
                      @input="${e => updateVoice(index, { offset: e.detail.value })}"
                    ></sc-slider>
                  </td>
                  <td>
                    <sc-slider min="0.5" max="60" number-box value="${voice.duration}"
                      @input="${e => updateVoice(index, { duration: e.detail.value })}"
                    ></sc-slider>
                  </td>
                  <td>
                    <sc-slider min="0" max="1" number-box value="${voice.gain}"
                      @input="${e => updateVoice(index, { gain: e.detail.value })}"
                    ></sc-slider>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </section>
      </div>
    `, $container);
  }

  globals.onUpdate(() => renderApp());
  score.onUpdate(() => renderApp());

  renderApp();
}

launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate') || '') || 1,
  width: '50%',
});
