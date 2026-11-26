// Writes the CitrineOS config.json used by the local rig.
//
// Starts from the `local` environment config (Server/dist/config/envs/local.js, so run
// `npm run build` first) and moves every listening port by RIG_PORT_OFFSET (default 10000):
// API 8080 -> 18080, OCPP 1.6 websocket 8092 -> 18092, and so on. This avoids clashes with
// other services on the host.
//
// Usage: node Server/test/scripted-charger/rig-config.cjs <output dir>
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, '.rig'));
const offset = Number(process.env.RIG_PORT_OFFSET || 10000);
const amqpPort = Number(process.env.RIG_AMQP_PORT || 5672);

const { createLocalConfig } = require(
  path.resolve(__dirname, '../../dist/config/envs/local.js'),
);
const config = createLocalConfig();

config.centralSystem.port += offset;
for (const server of config.util.networkConnection.websocketServers) {
  server.port += offset;
}
if (config.util.messageBroker?.amqp) {
  config.util.messageBroker.amqp.url = `amqp://guest:guest@localhost:${amqpPort}`;
}
// Swagger asset path is resolved at runtime; keep it absolute so it works from any cwd.
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'config.json');
fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log(
  `wrote ${file}: API :${config.centralSystem.port}, websockets ${config.util.networkConnection.websocketServers
    .map((s) => `${s.protocol}:${s.port}`)
    .join(', ')}`,
);
