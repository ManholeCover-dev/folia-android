import { chromium } from '@playwright/test';

// Inspects only Folia's media elements; signed URLs, account cookies and session tokens never leave memory.
const port = Number(process.argv[2] || 9222);
const mode = process.argv[3] || 'snapshot';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('https://localhost'));
if (!page) throw new Error('The Folia WebView is not available');
const summary = await page.locator('audio').evaluateAll(elements => elements.map(audio => {
    const source = audio.currentSrc || audio.src;
    let location = null;
    try {
        const url = new URL(source);
        location = { protocol: url.protocol, hostname: url.hostname, extension: /\.[a-zA-Z0-9]+$/.exec(url.pathname)?.[0] };
    } catch { /* An empty deck has no URL. */ }
    return { paused: audio.paused, time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null,
        readyState: audio.readyState, networkState: audio.networkState, crossOrigin: audio.crossOrigin, location,
        error: audio.error ? { code: audio.error.code, message: audio.error.message.replace(/https?:\/\/\S+/g, '[media-url]') } : null };
}));
console.info('Folia audio state', summary);
if (mode === 'probe' || mode === 'https') {
    const sources = await page.locator('audio').evaluateAll(elements => elements.map(audio => audio.currentSrc || audio.src).filter(source => /^https?:/.test(source)));
    for (const source of [...new Set(sources)]) {
        const url = new URL(source);
        if (url.hostname !== 'qq.com' && !url.hostname.endsWith('.qq.com')) continue;
        if (mode === 'https') url.protocol = 'https:';
        try {
            const response = await fetch(url, { headers: { Range: 'bytes=0-1023', Origin: 'https://localhost' }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
            const reader = response.body?.getReader();
            const first = await reader?.read();
            const signature = first?.value ? Buffer.from(first.value.subarray(0, 4)).toString('hex') : null;
            console.info('QQ stream probe', { protocol: url.protocol, hostname: url.hostname, status: response.status,
                contentType: response.headers.get('content-type'), cors: response.headers.get('access-control-allow-origin'),
                contentRange: response.headers.get('content-range'), redirects: response.headers.has('location'), signature });
            await reader?.cancel();
        } catch (error) {
            console.info('QQ stream probe failed', { hostname: url.hostname, name: error.name, code: error.cause?.code });
        }
    }
}
if (mode === 'https') {
    console.info('Phone HTTPS audio probe', await page.evaluate(async () => {
        const current = [...document.querySelectorAll('audio')].find(audio => audio.currentSrc || audio.src);
        const source = current?.currentSrc || current?.src;
        if (!source) return { result: 'no-source' };
        const probe = new Audio();
        probe.crossOrigin = 'anonymous';
        probe.volume = 0;
        probe.preload = 'auto';
        return new Promise(resolve => {
            const finish = result => {
                clearTimeout(timer);
                probe.pause();
                probe.removeAttribute('src');
                probe.load();
                resolve(result);
            };
            const timer = setTimeout(() => finish({ result: 'timeout', readyState: probe.readyState }), 20_000);
            probe.addEventListener('canplay', () => finish({ result: 'can-play', duration: probe.duration }), { once: true });
            probe.addEventListener('error', () => finish({ result: 'error', code: probe.error?.code,
                message: probe.error?.message?.replace(/https?:\/\/\S+/g, '[media-url]') }), { once: true });
            probe.src = source.replace(/^http:/, 'https:');
            probe.load();
        });
    }));
}
if (mode === 'play-https') {
    console.info('Phone playback', await page.evaluate(async rewrite => {
        const audio = [...document.querySelectorAll('audio')].find(element => element.currentSrc || element.src);
        if (!audio) return { result: 'no-source' };
        if (rewrite) {
            const source = audio.currentSrc || audio.src;
            audio.src = source.replace(/^http:/, 'https:');
            audio.load();
        }
        const startedAt = audio.currentTime;
        try {
            await audio.play();
            const deadline = Date.now() + 10_000;
            while (audio.currentTime < startedAt + 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
            return { result: audio.currentTime >= startedAt + 1 ? 'playing' : 'no-progress', time: audio.currentTime,
                duration: audio.duration, errorCode: audio.error?.code ?? null };
        } catch (error) { return { result: 'error', name: error.name, code: audio.error?.code }; }
    }, true));
}
process.exit(0);
