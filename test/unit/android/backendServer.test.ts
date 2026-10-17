import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';

// Exercises the actual loopback boundary with deterministic providers, including upstream failures.
const require = createRequire(import.meta.url);
const { createEmbeddedServer } = require('../../../packaging/android/backend/server.cjs');
const token = 'test-only-authentication-secret-1234567890';
const servers: Server[] = [];
afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
    })));
});
async function start(request = vi.fn().mockResolvedValue({ status: 200, body: { code: 200 } })) {
    const server: Server = createEmbeddedServer({ token, providers: { sample: { request } } });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local socket');
    return { url: `http://127.0.0.1:${address.port}`, request };
}
describe('Android embedded backend boundary', () => {
    it('rejects a missing or incorrect token before invoking a provider', async () => {
        const { url, request } = await start();
        expect((await fetch(`${url}/sample/search`)).status).toBe(401);
        expect((await fetch(`${url}/sample/search`, { headers: { 'X-Folia-Token': 'wrong' } })).status).toBe(401);
        expect(request).not.toHaveBeenCalled();
    });
    it('preserves query and POST values and the upstream response envelope', async () => {
        const request = vi.fn().mockResolvedValue({ status: 202, body: { code: 800, data: 'waiting' } });
        const { url } = await start(request);
        const answer = await fetch(`${url}/sample/login/qr/check?key=abc`, {
            method: 'POST', headers: { 'X-Folia-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: 123 }),
        });
        expect(request).toHaveBeenCalledWith('login_qr_check', { key: 'abc', timestamp: 123 });
        expect(answer.status).toBe(202);
        expect(await answer.json()).toEqual({ code: 800, data: 'waiting' });
    });
    it('preserves an upstream rejection instead of turning it into a missing route', async () => {
        const { url } = await start(vi.fn().mockRejectedValue({ status: 429, body: { code: 429, msg: 'retry later' } }));
        const answer = await fetch(`${url}/sample/search`, { headers: { 'X-Folia-Token': token } });
        expect(answer.status).toBe(429);
        expect(await answer.json()).toEqual({ code: 429, msg: 'retry later' });
    });
    it('rejects malformed JSON and unknown routes without invoking provider code', async () => {
        const { url, request } = await start();
        const headers = { 'X-Folia-Token': token, 'Content-Type': 'application/json' };
        expect((await fetch(`${url}/sample/search`, { method: 'POST', headers, body: '{' })).status).toBe(400);
        expect((await fetch(`${url}/other/search`, { headers })).status).toBe(404);
        expect((await fetch(`${url}/sample/search`, { method: 'DELETE', headers })).status).toBe(405);
        expect(request).not.toHaveBeenCalled();
    });
});
