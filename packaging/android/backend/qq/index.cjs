const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');

// Mounts the pinned Node router inside our authenticated server without importing its public listener.
const routes = new Set([
    '/login/qr/key', '/login/qr/create', '/login/qr/check', '/login/qr/cancel', '/login/status', '/login/channels', '/logout',
    '/user/detail', '/user/playlist', '/user/albums', '/user/liked-songs', '/user/playlist-detail',
    '/user/guess-you-like', '/user/daily-songs', '/user/playlist/tracks', '/user/playlist/subscribe',
    '/user/subscription-status', '/user/song/like', '/user/album/subscribe', '/recommend/playlists',
    '/search', '/getAlbumInfo', '/getSingerAlbum', '/getSingerHotsong', '/getLyric',
]);
const hasRoute = pathname => routes.has(pathname)
    || /^\/(getMusicPlay|getSongListDetail)\/[^/]+$/.test(pathname)
    || /^\/getSongInfo\/[^/]+(?:\/[^/]+)?$/.test(pathname);

function readSessionSecret(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'session-key');
    try {
        fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
    const secret = fs.readFileSync(file, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('The private QQ session key is invalid');
    return secret;
}

function createQqProvider(dataDirectory) {
    const directory = path.join(dataDirectory, 'qq-auth');
    const secret = readSessionSecret(directory);
    const packageRequire = createRequire(require.resolve('@yakult-green-tea/qq-music-api/package.json'));
    const load = relative => packageRequire(`./dist/src/${relative}`);
    const previousDevicePath = process.env.QQ_AUTH_STATE_PATH;
    let router;
    try {
        process.env.QQ_AUTH_STATE_PATH = path.join(directory, 'device.json');
        // Importing the package root would start a second, unauthenticated listening socket.
        router = load('routes/router.js').default;
        const { createFileAuthSessionRepository } = load('services/auth/fileAuthSessionRepository.js');
        const { configureAuthSessionRepository } = load('services/auth/qrLogin.node.js');
        configureAuthSessionRepository(createFileAuthSessionRepository(path.join(directory, 'sessions.enc'), secret));
        load('services/httpTransport.js').setLegacyHttpTransport(load('util/request.js').createAxiosLegacyTransport());
    } finally {
        if (previousDevicePath === undefined) delete process.env.QQ_AUTH_STATE_PATH;
        else process.env.QQ_AUTH_STATE_PATH = previousDevicePath;
    }
    const Koa = packageRequire('koa');
    const bodyParser = packageRequire('koa-bodyparser');
    const app = new Koa();
    app.use(bodyParser({ jsonLimit: '1mb', formLimit: '1mb', textLimit: '1mb', strict: true }));
    app.use(router.routes()).use(router.allowedMethods());
    app.on('error', error => console.warn('[AndroidQQ] Request failed', error));
    const handle = app.callback();
    return {
        async handle(req, res, url) {
            const pathname = url.pathname.slice('/qq'.length);
            if (!hasRoute(pathname)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 404, message: 'Unknown QQ operation' }));
                return;
            }
            const originalUrl = req.url;
            req.url = pathname + url.search;
            delete req.headers['x-folia-token'];
            try { await handle(req, res); } finally { req.url = originalUrl; }
        },
    };
}

module.exports = { createQqProvider };
