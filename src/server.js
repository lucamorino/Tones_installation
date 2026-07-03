import '@soundworks/helpers/polyfills.js';
import '@soundworks/helpers/catch-unhandled-errors.js';
import { Server } from '@soundworks/core/server.js';
import { loadConfig, configureHttpRouter } from '@soundworks/helpers/server.js';
import ServerPluginSync from '@soundworks/plugin-sync/server.js';
import ServerPluginPlatformInit from '@soundworks/plugin-platform-init/server.js';
import ServerPluginCheckin from '@soundworks/plugin-checkin/server.js';

import globalSchema from './global.js';

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
// gives each `player` client a unique index in [0, 7] used to pick its stem file
server.pluginManager.register('checkin', ServerPluginCheckin);

// Global transport/volume parameters, shared and editable by every `score` controller,
// played in sync by every `player` client.
server.stateManager.defineClass('global', globalSchema);

await server.start();

await server.stateManager.create('global');

