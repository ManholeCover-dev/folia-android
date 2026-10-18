import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

// Exercises the real pinned QQ router, private session persistence and authenticated mounting offline.
const require = createRequire(import.meta.url);
const { createEmbeddedServer } = require('../../../packaging/android/backend/server.cjs');
const { createQqProvider } = require('../../../packaging/android/backend/qq/index.cjs');
const token = 'offline-only-loopback-authentication-token';
let directory: string;
let server: Server;
let base: string;

beforeAll(async () => {
    const results = path.resolve('test-results');
    await mkdir(results, { recursive: true });
    directory = await mkdtemp(path.join(results, 'qq-adapter-'));
    const listen = vi.spyOn(Server.prototype, 'listen');
    let provider;
    try {
        provider = createQqProvider(directory);
        expect(listen).not.toHaveBeenCalled();
    } finally { listen.mockRestore(); }
    server = createEmbeddedServer({ token, providers: { qq: provider } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No private test listener');
    base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
    if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    if (directory && path.dirname(directory) === path.resolve('test-results') && path.basename(directory).startsWith('qq-adapter-')) {
        await rm(directory, { recursive: true, force: true });
    }
});
const request = (route: string, init: RequestInit = {}) => fetch(`${base}/qq${route}`, {
    ...init, headers: { 'X-Folia-Token': token, ...init.headers },
});

describe('Android QQ backend', () => {
    it('offers both Node login channels behind the existing authentication boundary', async () => {
        expect((await fetch(`${base}/qq/login/channels`)).status).toBe(401);
        const response = await request('/login/channels');
        expect(response.status).toBe(200);
        expect((await response.json()).data.channels.sort()).toEqual(['qq', 'wechat']);
    });
    it('keeps missing sessions separate from successful empty catalog data', async () => {
        const status = await request('/login/status', { headers: { 'X-QQ-Session': 'not-a-valid-session' } });
        expect(status.status).toBe(200);
        expect((await status.json()).data.profile).toBeUndefined();
        expect((await request('/user/playlist')).status).toBe(401);
        const mutation = await request('/user/song/like', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songmid: 'example', like: true }),
        });
        expect(mutation.status).toBe(401);
    });
    it('preserves path parameters and errors while excluding administrative legacy routes', async () => {
        expect((await request('/getMusicPlay/example', { headers: { 'X-QQ-Session': 'expired-session' } })).status).toBe(401);
        expect((await request('/user/setCookie?cookie=unused')).status).toBe(404);
        expect((await request('/login/channels', { method: 'POST' })).status).toBe(405);
    });
    it('keeps the encryption key stable and persists session data without plaintext credentials', async () => {
        const secretPath = path.join(directory, 'qq-auth/session-key');
        const secret = await readFile(secretPath, 'utf8');
        const modulePath = require.resolve('../../../packaging/android/backend/qq/index.cjs');
        const restarted = spawnSync(process.execPath, ['-e',
            'require(process.argv[1]).createQqProvider(process.argv[2]); process.exit(0);', modulePath, directory,
        ], { encoding: 'utf8', timeout: 5_000, windowsHide: true });
        expect(restarted.error).toBeUndefined();
        expect(restarted.status, restarted.stderr).toBe(0);
        expect(await readFile(secretPath, 'utf8')).toBe(secret);
        const packageRequire = createRequire(require.resolve('@yakult-green-tea/qq-music-api/package.json'));
        const { createFileAuthSessionRepository } = packageRequire('./dist/src/services/auth/fileAuthSessionRepository.js');
        const file = path.join(directory, 'qq-auth/sessions.enc');
        const records = [{ token: 'offline-test-token', credential: { secret: 'offline-test-credential' } }];
        createFileAuthSessionRepository(file, secret).save(records);
        expect(await readFile(file, 'utf8')).not.toContain('offline-test');
        expect(createFileAuthSessionRepository(file, await readFile(secretPath, 'utf8')).load()).toEqual(records);
        expect(await readFile(secretPath, 'utf8')).toBe(secret);
    });
});
