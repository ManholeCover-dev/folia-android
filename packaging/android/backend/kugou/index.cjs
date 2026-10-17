const fs = require('node:fs');
const path = require('node:path');

// Uses KuGou's actual module and cookie contracts, leaving normalization in the existing provider.
function createKugouProvider(dataDirectory) {
    process.env.platform = 'lite';
    const { createDeviceCookies } = require('../electron/kugou/kugouApiBridge.cjs');
    const identityPath = path.join(dataDirectory, 'kugou-device.json');
    let identity;
    try { identity = JSON.parse(fs.readFileSync(identityPath, 'utf8')); } catch { identity = createDeviceCookies(); }
    fs.writeFileSync(identityPath, JSON.stringify(identity), { mode: 0o600 });
    const entry = require.resolve('kugoumusicapi');
    const modules = path.join(path.dirname(entry), 'module');
    const names = new Set(fs.readdirSync(modules).filter(file => file.endsWith('.js') && !file.startsWith('_')).map(file => file.slice(0, -3)));
    const { cookieToJson } = require(path.join(path.dirname(entry), 'util'));
    const { createRequest } = require(path.join(path.dirname(entry), 'util/request'));
    let registration = null;
    const invoke = (name, params, cookie) => require(path.join(modules, `${name}.js`))({ ...params, cookie }, createRequest);
    const saveDevice = (answer) => {
        const body = answer?.body ?? answer;
        const data = body?.data ?? body;
        if (data?.dfid) identity.dfid = String(data.dfid);
        for (const entry of answer?.cookie || []) {
            const first = String(entry).split(';', 1)[0];
            const separator = first.indexOf('=');
            if (separator > 0 && first.slice(0, separator) === 'dfid') identity.dfid = first.slice(separator + 1);
        }
        fs.writeFileSync(identityPath, JSON.stringify(identity), { mode: 0o600 });
    };
    // Matches the desktop bridge: register a stable device, then retry a verification-required reply once.
    const ensureRegistered = async (force, cookie) => {
        if (registration) return registration;
        if (!force && identity.dfid) return;
        registration = (async () => {
            const answer = await invoke('register_dev', {}, { ...cookie, ...identity });
            saveDevice(answer);
            if (!identity.dfid) throw new Error('KuGou device registration did not return a dfid');
        })();
        try { await registration; } finally { registration = null; }
    };
    return {
        async request(name, params) {
            // Session values belong to the app's existing provider store; logout clears them there.
            if (name === 'logout') return { status: 200, body: { code: 200 } };
            if (!names.has(name)) throw { status: 404, body: { code: 404, message: 'Unknown KuGou operation' } };
            const incoming = typeof params.cookie === 'string' ? cookieToJson(params.cookie) : (params.cookie || {});
            const cookie = { ...incoming, ...identity };
            if (name !== 'register_dev') await ensureRegistered(false, cookie);
            const perform = () => invoke(name, params, { ...cookie, ...identity });
            let answer;
            try { answer = await perform(); } catch (error) {
                if (Number(error?.body?.error_code ?? error?.body?.errcode) !== 20028 || name === 'register_dev') throw error;
                await ensureRegistered(true, cookie);
                answer = await perform();
            }
            if (name === 'register_dev') saveDevice(answer);
            return answer;
        },
    };
}

module.exports = { createKugouProvider };
