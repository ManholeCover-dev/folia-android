import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifies the packaged backend with real anonymous, read-only music requests, without printing sessions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = await mkdtemp(path.join(root, 'test-results/android-backend-'));
const token = randomBytes(32).toString('hex');
const child = spawn(process.execPath, [path.join(root, 'android/app/src/main/assets/folia-backend/main.cjs'), data, token], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk.toString(); });
child.stderr.on('data', chunk => { logs += chunk.toString(); });
try {
    let state;
    const deadline = Date.now() + 30_000;
    while (!state && Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Backend exited: ${child.exitCode}\n${logs.slice(-1500)}`);
        try { state = JSON.parse(await readFile(path.join(data, 'runtime-state.json'), 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (!state) throw new Error('Backend did not bind a local socket');
    const request = async (route, params = {}) => {
        const response = await fetch(`http://127.0.0.1:${state.port}${route}?${new URLSearchParams(params)}`, {
            headers: { 'X-Folia-Token': token }, signal: AbortSignal.timeout(60_000),
        });
        return { status: response.status, body: await response.json() };
    };
    const health = await request('/_health');
    console.info('health', { status: health.status, ...health.body });
    const qr = await request('/netease/login/qr/create', { key: 'local-image-smoke-test', qrimg: 'true' });
    if (!qr.body.data?.qrimg?.startsWith('data:image/png')) throw new Error('NetEase QR generation failed');
    const ncm = await request('/netease/search', { keywords: '月亮代表我的心', limit: '3' });
    console.info('netease search', { status: ncm.status, code: ncm.body.code, count: ncm.body.result?.songs?.length ?? 0, message: ncm.body.message || ncm.body.msg });
    const ncmId = ncm.body.result?.songs?.[0]?.id;
    if (ncmId) {
        const lyrics = await request('/netease/lyric', { id: String(ncmId) });
        const audio = await request('/netease/song/url/v1', { id: String(ncmId), level: 'standard' });
        const entry = audio.body.data?.[0];
        console.info('netease lyrics/audio', { lyricCode: lyrics.body.code, hasLyrics: Boolean(lyrics.body.lrc?.lyric), audioCode: entry?.code, hasUrl: Boolean(entry?.url) });
        if (entry?.url) {
            const stream = await fetch(entry.url.replace(/^http:/, 'https:'), { headers: { Range: 'bytes=0-1023', Origin: 'https://localhost' }, signal: AbortSignal.timeout(20_000) });
            console.info('netease media range', { status: stream.status, cors: stream.headers.get('access-control-allow-origin'), contentType: stream.headers.get('content-type') });
            await stream.body?.cancel();
        }
    }
    const guid = randomUUID().replaceAll('-', '').toUpperCase();
    const digest = createHash('md5').update(guid).digest('hex');
    const cookies = {
        KUGOU_API_PLATFORM: 'lite', KUGOU_API_GUID: guid,
        KUGOU_API_MID: BigInt(`0x${digest}`).toString(), KUGOU_API_DEV: randomBytes(5).toString('hex').toUpperCase(),
        KUGOU_API_MAC: '02:00:00:00:00:00', KUGOU_API_WEBGL: BigInt(`0x${randomBytes(8).toString('hex')}`).toString(),
    };
    const cookie = Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join(';');
    const kg = await request('/kugou/search', { keywords: '月亮代表我的心', pagesize: '3', page: '1', cookie });
    const count = kg.body.data?.lists?.length ?? kg.body.data?.info?.length ?? 0;
    console.info('kugou search', { status: kg.status, errorCode: kg.body.error_code ?? kg.body.errcode, count, message: kg.body.error_msg || kg.body.msg });
    const hash = (kg.body.data?.lists?.[0]?.FileHash || kg.body.data?.info?.[0]?.hash);
    if (hash) {
        const lyrics = await request('/kugou/search/lyric', { hash, cookie });
        const audio = await request('/kugou/song/url', { hash, quality: '128', cookie });
        console.info('kugou lyrics/audio', { lyricStatus: lyrics.status, audioStatus: audio.status, audioError: audio.body.error_code ?? audio.body.errcode, hasUrl: Boolean(audio.body.url?.length || audio.body.data?.url?.length) });
    }
    if (!ncm.body.result?.songs?.length || !count) process.exitCode = 1;
} finally {
    child.kill();
}
