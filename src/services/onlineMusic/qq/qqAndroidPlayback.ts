import { isAndroidRuntime } from '../../android/backendFetch';

// QQ may return HTTP CDN links; Android's HTTPS WebView requires their equivalent HTTPS endpoints.
export function toQqAndroidPlaybackUrl(source: string): string {
    if (!isAndroidRuntime()) return source;
    try {
        const url = new URL(source);
        if (url.protocol === 'http:' && url.hostname.endsWith('.qq.com')) {
            url.protocol = 'https:';
            return url.href;
        }
    } catch { /* Preserve the existing provider validation for malformed sources. */ }
    return source;
}
