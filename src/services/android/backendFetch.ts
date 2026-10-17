import { Capacitor, registerPlugin } from '@capacitor/core';

// Android transport only; provider adapters keep their existing Omni and HTTP contracts.
const prefix = '/__folia_backend';
const backend = registerPlugin<{
    request(options: { path: string; method: string; headers: Record<string, string>; body?: string; contentType?: string }): Promise<{
        status: number; bodyBase64: string; contentType?: string; retryAfter?: string;
    }>;
}>('FoliaBackend');

export const isAndroidRuntime = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const embeddedApiBase = (provider: string): string | null => isAndroidRuntime() ? `${prefix}/${provider}` : null;

// Installs before bootstrap so diagnostics and provider requests use the same native transport.
export function installAndroidBackendFetch(): void {
    if (!isAndroidRuntime()) return;
    const original = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith(`${prefix}/`)) return original(input, init);
        const request = new Request(input instanceof Request ? input : url.href, init);
        request.signal.throwIfAborted();
        const options = {
            path: url.pathname.slice(prefix.length) + url.search,
            method: request.method,
            headers: Object.fromEntries(request.headers),
            ...(request.method === 'POST' ? {
                body: await request.text(),
                contentType: request.headers.get('content-type') || 'application/json',
            } : {}),
        };
        // Abort stops the caller waiting; the native socket has its own bounded lifetime.
        return new Promise<Response>((resolve, reject) => {
            const abort = () => reject(request.signal.reason ?? new DOMException('Aborted', 'AbortError'));
            request.signal.addEventListener('abort', abort, { once: true });
            if (request.signal.aborted) { abort(); return; }
            void backend.request(options).then(result => {
                const bytes = Uint8Array.from(atob(result.bodyBase64), char => char.charCodeAt(0));
                resolve(new Response([204, 205, 304].includes(result.status) ? null : bytes, {
                    status: result.status,
                    headers: {
                        'content-type': result.contentType || 'application/json',
                        ...(result.retryAfter ? { 'retry-after': result.retryAfter } : {}),
                    },
                }));
            }).catch(reject).finally(() => request.signal.removeEventListener('abort', abort));
        });
    };
}
