import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Covers Android routing and the QQ session header through the actual JavaScript/native fetch bridge.
const native = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    registerPlugin: () => ({ request: native.request }),
}));
const storage = new Map<string, string>();
beforeEach(() => {
    vi.resetModules();
    storage.clear();
    native.request.mockReset().mockResolvedValue({ status: 200, bodyBase64: Buffer.from('{"code":200}').toString('base64') });
    vi.stubEnv('VITE_QQ_API_BASE', 'https://unused.example.test');
    vi.stubGlobal('window', { location: { href: 'https://localhost/', origin: 'https://localhost' } });
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Android QQ transport', () => {
    it('uses the private backend without requiring an external deployment', async () => {
        const { installAndroidBackendFetch } = await import('@/services/android/backendFetch');
        const { requestQq, getQqTransportAvailability } = await import('@/services/onlineMusic/qq/qqTransport');
        installAndroidBackendFetch();
        expect(getQqTransportAvailability()).toEqual({ configured: true });
        await requestQq('music_play', { songmid: 'test-song-mid', quality: '128' });
        expect(native.request.mock.calls[0][0]).toMatchObject({
            path: expect.stringMatching(/^\/qq\/getMusicPlay\/test-song-mid\?quality=128&timestamp=\d+$/), method: 'GET',
        });
    });
    it('forwards the confirmed session in a header and preserves a mutation body', async () => {
        const { installAndroidBackendFetch } = await import('@/services/android/backendFetch');
        const { writeProviderSessionValue } = await import('@/services/onlineMusic/providerStorage');
        const { requestQq } = await import('@/services/onlineMusic/qq/qqTransport');
        writeProviderSessionValue('qq', 'cookie', 'qqmusic_session=opaque-android-session');
        installAndroidBackendFetch();
        await requestQq('user_song_like', {}, { songmid: 'test-mid', like: true });
        expect(native.request.mock.calls[0][0]).toMatchObject({
            path: expect.stringMatching(/^\/qq\/user\/song\/like\?timestamp=\d+$/),
            method: 'POST', headers: { 'x-qq-session': 'opaque-android-session', 'content-type': 'application/json' },
            body: JSON.stringify({ songmid: 'test-mid', like: true }),
        });
        expect(native.request.mock.calls[0][0].path).not.toContain('opaque-android-session');
    });
});
