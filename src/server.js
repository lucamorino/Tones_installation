import '@soundworks/helpers/polyfills.js';
import '@soundworks/helpers/catch-unhandled-errors.js';
import { Server } from '@soundworks/core/server.js';
import { loadConfig, configureHttpRouter } from '@soundworks/helpers/server.js';
import ServerPluginSync from '@soundworks/plugin-sync/server.js';
import ServerPluginPlatformInit from '@soundworks/plugin-platform-init/server.js';
import ServerPluginCheckin from '@soundworks/plugin-checkin/server.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

const config = loadConfig(process.env.ENV, import.meta.url);

console.log(`
--------------------------------------------------------
- launching "${config.app.name}" in "${process.env.ENV || 'default'}" environment
- [pid: ${process.pid}]
--------------------------------------------------------
`);

const server = new Server(config);
configureHttpRouter(server);

// Register plugins
server.pluginManager.register('platform-init', ServerPluginPlatformInit);
server.pluginManager.register('sync', ServerPluginSync);
// gives each `player` client a unique index in [0, 7] used to pick its voice in the score
server.pluginManager.register('checkin', ServerPluginCheckin);

// Up to 8 voices, tuned to a slow A-minor-ish drone scale, good defaults for ambient music.
// `offset` is the position of the note within the loop (0 = start of loop, 1 = end of loop).
const defaultVoices = [
  { active: true, noteName: 'A2', frequency: 110.00, offset: 0.000, duration: 9, gain: 0.8 },
  { active: true, noteName: 'E3', frequency: 164.81, offset: 0.125, duration: 7, gain: 0.6 },
  { active: true, noteName: 'A3', frequency: 220.00, offset: 0.250, duration: 10, gain: 0.65 },
  { active: false, noteName: 'C4', frequency: 261.63, offset: 0.375, duration: 6, gain: 0.5 },
  { active: true, noteName: 'E4', frequency: 329.63, offset: 0.500, duration: 8, gain: 0.55 },
  { active: false, noteName: 'G4', frequency: 392.00, offset: 0.625, duration: 5, gain: 0.45 },
  { active: false, noteName: 'A4', frequency: 440.00, offset: 0.750, duration: 9, gain: 0.5 },
  { active: false, noteName: 'E5', frequency: 659.26, offset: 0.875, duration: 6, gain: 0.4 },
];

// Global instrument parameters, shared and editable by every `score` controller,
// played in sync by every `player` client.
server.stateManager.defineClass('instrument-globals', {
  isPlaying: { type: 'boolean', default: false },
  // sync time (seconds) at which the score loop started, used by players to
  // compute, in a synchronized fashion, when each voice should be triggered
  startSyncTime: { type: 'float', default: 0 },
  // duration of the score loop, in seconds
  loopDuration: { type: 'float', default: 32, min: 4, max: 180 },
  // master volume
  volume: { type: 'float', default: 0.7, min: 0, max: 1 },
  // balance between the sine oscillator and the sample player, 0 = sample only, 1 = osc only
  oscMix: { type: 'float', default: 0.5, min: 0, max: 1 },
  // slow ADSR envelope, well suited for ambient pads / drones
  attack: { type: 'float', default: 2.5, min: 0.05, max: 20 },
  decay: { type: 'float', default: 1.5, min: 0.05, max: 10 },
  sustain: { type: 'float', default: 0.6, min: 0, max: 1 },
  release: { type: 'float', default: 4, min: 0.1, max: 30 },
});

// The score: up to 8 voices, one per `player` client (assigned via check-in index).
server.stateManager.defineClass('instrument-score', {
  voices: { type: 'any', default: defaultVoices },
});

await server.start();

await server.stateManager.create('instrument-globals');
await server.stateManager.create('instrument-score');
