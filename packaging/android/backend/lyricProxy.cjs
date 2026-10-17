// Mirrors the desktop relay's host scope for lyrics, covers and anonymous search.
const allowed = hostname => hostname === 'qq.com' || hostname.endsWith('.qq.com')
    || hostname === 'y.gtimg.cn' || hostname === 'kugou.com' || hostname.endsWith('.kugou.com')
    || hostname === 'kgimg.com' || hostname.endsWith('.kgimg.com') || hostname === 'api.amll.dev';
const forwarded = new Set(['user-agent', 'content-type', 'accept', 'kg-rec', 'kg-rc', 'kg-clienttimems', 'mid', 'x-router']);

async function proxyLyrics(req, res, target, fetchImpl = fetch) {
    let url;
    try { url = new URL(target); } catch {
        res.writeHead(400).end('Invalid proxy URL');
        return;
    }
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => forwarded.has(key.toLowerCase())));
    if (url.hostname === 'u.y.qq.com') {
        headers.cookie = 'tmeLoginType=-1;';
        headers['user-agent'] = 'okhttp/3.14.9';
    }
    let body;
    if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            if (size > 1024 * 1024) {
                res.writeHead(413).end('Proxy request body too large');
                return;
            }
            chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks);
    }
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (!allowed(url.hostname) || !['http:', 'https:'].includes(url.protocol)
                || url.username || url.password || url.port) {
            res.writeHead(403).end('Forbidden proxy target');
            return;
        }
        const response = await fetchImpl(url, { method: req.method || 'GET', headers, ...(body ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(20_000) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || redirects === 3) throw new Error('Too many lyric proxy redirects');
            url = new URL(location, url);
            if (response.status === 303 || ([301, 302].includes(response.status) && req.method === 'POST')) {
                body = undefined;
                req.method = 'GET';
            }
            // Never forward a provider-specific header to a different host after a redirect.
            for (const key of Object.keys(headers)) if (!['accept', 'user-agent'].includes(key)) delete headers[key];
            continue;
        }
        const chunks = [];
        let length = 0;
        for await (const chunk of response.body || []) {
            length += chunk.length;
            if (length > 16 * 1024 * 1024) throw new Error('Lyric proxy response is too large');
            chunks.push(Buffer.from(chunk));
        }
        res.writeHead(response.status, {
            'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(Buffer.concat(chunks));
        return;
    }
}

module.exports = { proxyLyrics };
