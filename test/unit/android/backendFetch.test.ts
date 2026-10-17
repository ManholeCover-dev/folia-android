import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Verifies transport selection, binary data, errors and cancellation at the JavaScript/native boundary.
const state = vi.hoisted(() => ({ native: true, request: vi.fn() }));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => state.native, getPlatform: () => 'android' },
    registerPlugin: () => ({ request: state.request }),
}));
let original: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.resetModules();
    state.native = true;
    state.request.mockReset();
    original = vi.fn().mockResolvedValue(new Response('remote'));
    vi.stubGlobal('fetch', original);
    vi.stubGlobal('window', { location: { href: 'https://localhost/', origin: 'https://localhost' } });
});
afterEach(() => vi.unstubAllGlobals());
async function install() {
    const module = await import('../../../src/services/android/backendFetch');
    module.installAndroidBackendFetch();
    return module;
}
describe('Android backend fetch', () => {
    it('leaves ordinary web builds and external requests on their existing transport', async () => {
        state.native = false;
        expect((await install()).embeddedApiBase('sample')).toBeNull();
        await fetch('https://example.com/');
        expect(original).toHaveBeenCalledOnce();
        expect(state.request).not.toHaveBeenCalled();
    });
    it('passes external origins through even when their path matches the reserved prefix', async () => {
        await install();
        await fetch('https://example.com/__folia_backend/sample/search');
        expect(original).toHaveBeenCalledOnce();
        expect(state.request).not.toHaveBeenCalled();
    });
    it('preserves HTTP status, binary bodies and forwarded signing headers', async () => {
        state.request.mockResolvedValue({ status: 429, bodyBase64: Buffer.from([0, 128, 255]).toString('base64'), contentType: 'image/png', retryAfter: '20' });
        await install();
        const response = await fetch('/__folia_backend/sample/search?q=music', { headers: { mid: 'example-device' } });
        expect(state.request).toHaveBeenCalledWith({ path: '/sample/search?q=music', method: 'GET', headers: { mid: 'example-device' } });
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('20');
        expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 128, 255]);
    });
    it('rejects an unreadable native reply instead of leaving the caller pending', async () => {
        state.request.mockResolvedValue({ status: 200, bodyBase64: '%' });
        await install();
        await expect(fetch('/__folia_backend/sample/search')).rejects.toThrow();
    });
    it('aborts the caller while a native request is still pending', async () => {
        state.request.mockReturnValue(new Promise(() => {}));
        await install();
        const controller = new AbortController();
        const response = fetch('/__folia_backend/sample/search', { signal: controller.signal });
        controller.abort();
        await expect(response).rejects.toMatchObject({ name: 'AbortError' });
    });
});
