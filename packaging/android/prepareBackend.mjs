import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Stages only the standalone backend and the desktop helpers it actually reuses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'packaging/android/backend');
const destination = path.join(root, 'android/app/src/main/assets/folia-backend');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(npmCommand, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--allow-remote=all'], {
    cwd: source, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true,
});
if (install.status !== 0) throw new Error('Cannot install the embedded backend dependencies');
// destination is a fixed generated-assets directory inside this checkout.
if (path.relative(root, destination).replace(/\\/g, '/') !== 'android/app/src/main/assets/folia-backend') {
    throw new Error('Refusing to replace a directory outside the generated backend assets');
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const item of ['main.cjs', 'server.cjs', 'lyricProxy.cjs', 'netease', 'kugou', 'node_modules', 'package.json']) {
    await cp(path.join(source, item), path.join(destination, item), { recursive: true, filter: file => !path.basename(file).startsWith('.') });
}
for (const item of ['electron/netease/neteaseApiStartup.cjs', 'electron/netease/lazyJsdom.cjs', 'electron/kugou/kugouApiBridge.cjs', 'electron/backendLifecycle.cjs', 'shared/networkErrorText.cjs']) {
    await mkdir(path.dirname(path.join(destination, item)), { recursive: true });
    await cp(path.join(root, item), path.join(destination, item));
}
await cp(path.join(root, 'LICENSE'), path.join(destination, 'LICENSE'));
for (const item of ['NOTICE.txt', 'nodeLicense.txt']) {
    await cp(path.join(root, 'packaging/android', item), path.join(destination, item));
}
async function collect(directory, relative = '') {
    const files = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
        const name = relative ? `${relative}/${item.name}` : item.name;
        if (item.isDirectory()) files.push(...await collect(path.join(directory, item.name), name));
        else files.push(name);
    }
    return files;
}
const files = (await collect(destination)).sort();
const hash = createHash('sha256');
for (const file of files) {
    hash.update(file).update('\0').update(await readFile(path.join(destination, file)));
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ buildId: hash.digest('hex'), files }));
console.info(`[Android] Staged ${files.length} backend files`);
