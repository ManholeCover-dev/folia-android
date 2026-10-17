import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

// Downloads independent byte ranges, then verifies the complete archive before it can be used.
export async function downloadArchive(url, destination, expectedHash, algorithm = 'sha256') {
    const digest = async () => {
        const hash = createHash(algorithm);
        for await (const chunk of createReadStream(destination)) hash.update(chunk);
        return hash.digest('hex');
    };
    try { if (await digest() === expectedHash) return; } catch { /* First download. */ }
    // Google's download service can transcode representations, so ranges are not reliable there.
    if (new URL(url).hostname === 'dl.google.com') {
        const response = await fetch(url);
        if (!response.ok || !response.body) throw new Error(`Archive download: HTTP ${response.status}`);
        await pipeline(response.body, createWriteStream(destination));
        if (await digest() !== expectedHash) throw new Error('Downloaded archive checksum mismatch');
        return;
    }
    const metadata = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    if (!metadata.ok) throw new Error(`Archive metadata: HTTP ${metadata.status}`);
    const length = Number(metadata.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error('Archive size is missing');
    const file = await open(destination, 'w');
    let next = 0;
    const size = 4 * 1024 * 1024;
    const count = Math.ceil(length / size);
    try {
        await file.truncate(length);
        const worker = async () => {
            while (next < count) {
                const index = next++;
                const start = index * size;
                const end = Math.min(length - 1, start + size - 1);
                let succeeded = false;
                for (let attempt = 0; attempt < 3 && !succeeded; attempt++) {
                    try {
                        const rangeUrl = new URL(metadata.url);
                        if (rangeUrl.hostname === 'dl.google.com') rangeUrl.searchParams.set('folia_range', String(start));
                        const response = await fetch(rangeUrl, {
                            headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(120_000),
                        });
                        if (response.status !== 206) throw new Error(`Range download: HTTP ${response.status}`);
                        if (response.headers.get('content-range') !== `bytes ${start}-${end}/${length}`) {
                            throw new Error('The server returned a different byte range than requested');
                        }
                        const bytes = Buffer.from(await response.arrayBuffer());
                        if (bytes.length !== end - start + 1) throw new Error('Incomplete archive range');
                        let offset = 0;
                        while (offset < bytes.length) {
                            const result = await file.write(bytes, offset, bytes.length - offset, start + offset);
                            offset += result.bytesWritten;
                        }
                        succeeded = true;
                    } catch (error) {
                        if (attempt === 2) throw error;
                    }
                }
            }
        };
        const results = await Promise.allSettled(Array.from({ length: Math.min(12, count) }, worker));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
    } finally { await file.close(); }
    if (await digest() !== expectedHash) throw new Error('Downloaded archive checksum mismatch');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/downloadArchive.mjs')) {
    await downloadArchive(process.argv[2], process.argv[3], process.argv[4], process.argv[5] || 'sha256');
    console.info('[Android] Archive downloaded and verified');
}
