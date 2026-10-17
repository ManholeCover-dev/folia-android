import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadArchive } from './downloadArchive.mjs';

// Downloads a pinned experimental Node 24 mobile build and verifies it before staging.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = '24.22.0-0';
const sha256 = '9b068f4ad4c755f26c04b31883c536f037a4831e6575847a699cdf5fa72dde25';
const runtime = path.join(root, 'packaging/android/runtime');
const archive = path.join(runtime, `nodejs-mobile-android-${version}.zip`);
const unpack = path.join(runtime, version);
await mkdir(runtime, { recursive: true });
const hashFile = async (file) => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
};
let valid = false;
try { valid = await hashFile(archive) === sha256; } catch { /* First download. */ }
if (!valid) {
    console.log(`[Android] Downloading Node.js Mobile ${version}`);
    await downloadArchive(`https://github.com/fogtape/nodejs-mobile/releases/download/v${version}/nodejs-mobile-android-${version}.zip`, archive, sha256);
    if (await hashFile(archive) !== sha256) throw new Error('Node mobile archive SHA-256 mismatch');
}
let extracted = false;
try { extracted = await readFile(path.join(unpack, '.verified'), 'utf8') === sha256; } catch { /* Not extracted. */ }
if (!extracted) {
    await mkdir(unpack, { recursive: true });
    const extraction = process.platform === 'win32'
        ? spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:FOLIA_RUNTIME_ZIP -DestinationPath $env:FOLIA_RUNTIME_OUTPUT -Force'], {
            env: { ...process.env, FOLIA_RUNTIME_ZIP: archive, FOLIA_RUNTIME_OUTPUT: unpack }, stdio: 'inherit', windowsHide: true,
        })
        : spawnSync('unzip', ['-q', '-o', archive, '-d', unpack], { stdio: 'inherit' });
    if (extraction.status !== 0) throw new Error('Cannot extract mobile runtime');
    await writeFile(path.join(unpack, '.verified'), sha256);
}
async function filesIn(directory) {
    const results = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isDirectory()) results.push(...await filesIn(file));
        else results.push(file);
    }
    return results;
}
const files = await filesIn(unpack);
const header = files.find(file => path.basename(file) === 'node.h');
if (!header) throw new Error('Runtime archive does not contain node.h');
await cp(path.dirname(header), path.join(runtime, 'include'), { recursive: true });
for (const abi of ['arm64-v8a', 'x86_64']) {
    const library = files.find(file => path.basename(file) === 'libnode.so' && file.split(path.sep).includes(abi));
    if (!library) throw new Error(`Runtime archive is missing ${abi}/libnode.so`);
    const destination = path.join(runtime, 'lib', abi);
    await mkdir(destination, { recursive: true });
    await cp(library, path.join(destination, 'libnode.so'));
}
console.log(`[Android] Node.js ${version} verified and staged (arm64-v8a, x86_64)`);
