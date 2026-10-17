const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { proxyLyrics } = require('./lyricProxy.cjs');

// Authenticated loopback transport shared by the music providers; no public listening socket.
function createEmbeddedServer({ token, providers }) {
    const expected = Buffer.from(token);
    if (expected.length < 32) throw new Error('A strong per-process backend token is required');
    return http.createServer(async (req, res) => {
        const supplied = Buffer.from(String(req.headers['x-folia-token'] || ''));
        const send = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(body));
        };
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            send(401, { code: 401, message: 'Unauthorized' });
            return;
        }
        if (!['GET', 'POST'].includes(req.method)) {
            send(405, { code: 405, message: 'Unsupported method' });
            return;
        }
        try {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (url.pathname === '/lyric-proxy') {
                await proxyLyrics(req, res, url.searchParams.get('url'));
                return;
            }
            if (url.pathname === '/_health') {
                send(200, { code: 200, node: process.version, providers: Object.keys(providers) });
                return;
            }
            const [, providerId, ...segments] = url.pathname.split('/');
            const provider = Object.hasOwn(providers, providerId) ? providers[providerId] : null;
            if (!provider || !segments.length || segments.some(part => !/^[a-zA-Z0-9_]+$/.test(part))) {
                send(404, { code: 404, message: 'Unknown music API route' });
                return;
            }
            let params = Object.fromEntries(url.searchParams);
            if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 1024 * 1024) {
                        send(413, { code: 413, message: 'Request body too large' });
                        return;
                    }
                    chunks.push(chunk);
                }
                const text = Buffer.concat(chunks).toString('utf8');
                let body;
                try {
                    body = String(req.headers['content-type']).includes('application/json')
                        ? JSON.parse(text || '{}') : Object.fromEntries(new URLSearchParams(text));
                } catch {
                    send(400, { code: 400, message: 'Invalid request body' });
                    return;
                }
                if (!body || typeof body !== 'object' || Array.isArray(body)) {
                    send(400, { code: 400, message: 'Expected a request object' });
                    return;
                }
                params = { ...params, ...body };
            }
            const answer = await provider.request(segments.join('_'), params);
            const status = Number(answer?.status ?? 200);
            send(Number.isInteger(status) && status >= 200 && status <= 599 ? status : 502, answer?.body ?? answer);
        } catch (error) {
            if (res.headersSent || res.destroyed) return;
            const status = Number(error?.status);
            send(Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502,
                error?.body ?? { code: 502, message: error instanceof Error ? error.message : 'Music API request failed' });
        }
    });
}

module.exports = { createEmbeddedServer };
