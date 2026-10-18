const fs = require('node:fs');
const path = require('node:path');
const { createEmbeddedServer } = require('./server.cjs');

// Starts inside the APK; runtime files and user data are kept in separate private directories.
const dataDirectory = process.argv[2];
const token = process.argv[3];
if (!dataDirectory || !token) throw new Error('The Android host must supply private storage and an authentication token');
process.env.TMPDIR = path.join(dataDirectory, 'tmp');
process.env.HOME = dataDirectory;
process.env.ENABLE_GENERAL_UNBLOCK = 'false';
fs.mkdirSync(process.env.TMPDIR, { recursive: true });
process.chdir(dataDirectory);
require('axios').defaults.timeout = 30_000;
const { createNeteaseProvider } = require('./netease/index.cjs');
const { createKugouProvider } = require('./kugou/index.cjs');
const { createQqProvider } = require('./qq/index.cjs');
const providers = {
    netease: createNeteaseProvider(dataDirectory),
    kugou: createKugouProvider(dataDirectory),
    qq: createQqProvider(dataDirectory),
};
const server = createEmbeddedServer({ token, providers });
server.requestTimeout = 65_000;
server.headersTimeout = 10_000;
server.listen(0, '127.0.0.1', () => {
    const state = path.join(dataDirectory, 'runtime-state.json');
    fs.writeFileSync(`${state}.tmp`, JSON.stringify({ port: server.address().port, pid: process.pid }), { mode: 0o600 });
    fs.renameSync(`${state}.tmp`, state);
    console.info('[AndroidBackend] Music APIs are ready');
});
