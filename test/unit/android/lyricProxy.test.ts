import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

// Checks the relay's allow-list, redirect validation and binary response contract.
const require = createRequire(import.meta.url);
const { proxyLyrics } = require('../../../packaging/android/backend/lyricProxy.cjs');
function response() {
    const target = { writeHead: vi.fn(), end: vi.fn() };
    target.writeHead.mockReturnValue(target);
    return target;
}
describe('Android lyric relay', () => {
    it('forwards a lyric POST payload without losing its content type', async () => {
        const request = Object.assign(Readable.from([Buffer.from('{"search":"example"}')]), { method: 'POST', headers: { 'content-type': 'application/json' } });
        const fetch = vi.fn().mockResolvedValue(Response.json({ code: 0 }));
        await proxyLyrics(request, response(), 'https://u.y.qq.com/cgi-bin/musicu.fcg', fetch);
        expect(fetch.mock.calls[0][1].method).toBe('POST');
        expect(fetch.mock.calls[0][1].body.toString()).toBe('{"search":"example"}');
        expect(fetch.mock.calls[0][1].headers['content-type']).toBe('application/json');
    });
    it('rejects local addresses and unapproved hosts before making a network request', async () => {
        const fetch = vi.fn();
        for (const url of ['http://127.0.0.1/private', 'https://kugou.com.example.com/', 'https://user:secret@kugou.com/', 'https://kugou.com:8443/']) {
            const res = response();
            await proxyLyrics({ headers: {} }, res, url, fetch);
            expect(res.writeHead).toHaveBeenCalledWith(403);
        }
        expect(fetch).not.toHaveBeenCalled();
    });
    it('checks redirect destinations before following them', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
        const res = response();
        await proxyLyrics({ headers: {} }, res, 'https://m.kugou.com/', fetch);
        expect(fetch).toHaveBeenCalledOnce();
        expect(res.writeHead).toHaveBeenCalledWith(403);
    });
    it('preserves bytes while dropping the app authentication token and arbitrary headers', async () => {
        const bytes = Uint8Array.from([0, 128, 255]);
        const fetch = vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
        const res = response();
        await proxyLyrics({ headers: { 'x-folia-token': 'private', cookie: 'private', mid: 'device' } }, res, 'https://imge.kugou.com/cover.png', fetch);
        expect(fetch.mock.calls[0][1].headers).toEqual({ mid: 'device' });
        expect([...res.end.mock.calls[0][0]]).toEqual([...bytes]);
    });
});
