import { afterEach, describe, expect, it, vi } from 'vitest';

// Protects signed QQ playback links from Android mixed-content failures without changing desktop transport.
const runtime = vi.hoisted(() => ({ android: true }));
vi.mock('@/services/android/backendFetch', () => ({ isAndroidRuntime: () => runtime.android }));
import { toQqAndroidPlaybackUrl } from '@/services/onlineMusic/qq/qqAndroidPlayback';

afterEach(() => { runtime.android = true; });
describe('QQ Android audio URLs', () => {
    it('upgrades the actual CDN family while preserving the signed path and query verbatim', () => {
        const suffix = '/F000example.flac?vkey=test%2Bsignature%2Fvalue&guid=123&uin=0&fromtag=53';
        expect(toQqAndroidPlaybackUrl(`http://sjy6.stream.qqmusic.qq.com${suffix}`))
            .toBe(`https://sjy6.stream.qqmusic.qq.com${suffix}`);
    });
    it.each(['https://isure.stream.qqmusic.qq.com/example.m4a', 'blob:https://localhost/example',
        'http://qq.com.example.test/file.mp3', 'http://example.test/file.mp3', '', 'not-a-url'])
    ('leaves unrelated or already secure sources unchanged: %s', source => {
        expect(toQqAndroidPlaybackUrl(source)).toBe(source);
    });
    it('preserves existing desktop and web behavior', () => {
        runtime.android = false;
        const source = 'http://sjy6.stream.qqmusic.qq.com/example.flac?vkey=test-only';
        expect(toQqAndroidPlaybackUrl(source)).toBe(source);
    });
});
