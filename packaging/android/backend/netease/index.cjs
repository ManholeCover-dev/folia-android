const fs = require('node:fs');
const path = require('node:path');

// Reuses the desktop QR-login fixes and startup helpers with Android's private data directory.
function createNeteaseProvider(dataDirectory) {
    const startup = require('../electron/netease/neteaseApiStartup.cjs');
    const ncm = '@neteasecloudmusicapienhanced/api';
    const tokenPath = path.join(process.env.TMPDIR, 'anonymous_token');
    const keyPath = path.join(process.env.TMPDIR, 'xeapi_public_key');
    if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, '', { mode: 0o600 });
    const util = require(`${ncm}/util/index`);
    const identityPath = path.join(dataDirectory, 'netease-device-id');
    global.deviceId = fs.existsSync(identityPath) ? fs.readFileSync(identityPath, 'utf8') : util.generateDeviceId();
    fs.writeFileSync(identityPath, global.deviceId, { mode: 0o600 });
    global.cnIp = util.generateRandomChineseIP();
    const requestPath = require.resolve(`${ncm}/util/request`);
    startup.deferJsdom(requestPath);
    const upstream = require(requestPath);
    const request = startup.withQrNetworkRetry(startup.withoutImplicitClientIp((uri, data, options = {}) =>
        upstream(uri, data, { ...options, timeout: options.timeout || 30_000 })));
    require.cache[requestPath].exports = request;
    startup.installLoginQrCheck();
    const modules = path.join(path.dirname(require.resolve(`${ncm}/main`)), 'module');
    const names = new Set(fs.readdirSync(modules).filter(file => file.endsWith('.js')).map(file => file.slice(0, -3)));
    let readiness = null;
    // One refresh at a time; a later request can recover after connectivity returns.
    async function ensureReady() {
        if (readiness) return readiness;
        const operation = (async () => {
            let cached = {};
            try { cached = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { /* First launch. */ }
            const { getXeapiPublicKey } = require(`${ncm}/util/xeapiKey`);
            const { publicKey } = await startup.resolveXeapiPublicKey({
                currentPublicKey: cached, deviceId: global.deviceId, getXeapiPublicKey,
                timeoutMs: 8_000, retryOptions: { attempts: 1 },
            });
            fs.writeFileSync(keyPath, JSON.stringify(publicKey), { mode: 0o600 });
            const register = require(`${ncm}/module/register_anonimous`);
            await startup.refreshAnonymousToken({
                registerAnonymous: (params) => register(params || {}, request), cookieToJson: util.cookieToJson,
                persistToken: token => fs.writeFileSync(tokenPath, token, { mode: 0o600 }),
                timeoutMs: 8_000, retryOptions: { attempts: 1 },
            });
        })();
        readiness = operation;
        operation.catch(() => {
            setTimeout(() => { if (readiness === operation) readiness = null; }, 10_000).unref();
        });
        return operation;
    }
    return {
        async request(name, params) {
            if (!names.has(name)) throw { status: 404, body: { code: 404, message: 'Unknown NetEase operation' } };
            // The local QR image is available even while the platform is unreachable.
            if (name !== 'login_qr_create') await ensureReady();
            const cookie = typeof params.cookie === 'string' ? util.cookieToJson(params.cookie) : (params.cookie || {});
            return require(path.join(modules, `${name}.js`))({ ...params, cookie }, request);
        },
    };
}

module.exports = { createNeteaseProvider };
