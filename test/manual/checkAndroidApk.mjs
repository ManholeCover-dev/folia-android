import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import path from 'node:path';

// Checks the actual packaged asset inventory, catching files Android's asset packager omits.
const file = process.argv[2] || 'android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk';
const entries = new Set();
const contents = unzipSync(await readFile(file), {
    filter(entry) {
        entries.add(entry.name);
        return entry.name === 'assets/folia-backend/manifest.json';
    },
});
const manifest = JSON.parse(new TextDecoder().decode(contents['assets/folia-backend/manifest.json']));
const missing = manifest.files.filter(file => !entries.has(`assets/folia-backend/${file}`));
if (missing.length) throw new Error(`APK is missing ${missing.length} backend assets: ${missing.slice(0, 10).join(', ')}`);
for (const name of ['libnode.so', 'libfolia_node.so', 'libc++_shared.so']) {
    if (![...entries].some(entry => entry.startsWith('lib/') && entry.endsWith(`/${name}`))) throw new Error(`APK is missing ${name}`);
}
console.info({ apk: path.basename(file), backendFiles: manifest.files.length, missing: missing.length, nativeLibrariesPresent: true });
