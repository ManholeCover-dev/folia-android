import { mkdir, readFile, writeFile, readdir, rename, cp, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { downloadArchive } from './downloadArchive.mjs';

// Installs official, checksum-verified SDK archives into the workspace-local SDK.
const tools = path.resolve(process.argv[2]);
const packages = JSON.parse(await readFile(path.join(tools, 'sdk-packages.json'), 'utf8'));
const exists = async file => access(file).then(() => true, () => false);
await Promise.all(packages.map(async item => {
    const target = path.join(tools, 'sdk', item.destination);
    if (await exists(path.join(target, '.folia-installed'))) return;
    const archive = path.join(tools, item.url);
    console.info(`[Android] Downloading ${item.destination}`);
    await downloadArchive(`https://dl.google.com/android/repository/${item.url}`, archive, item.checksum, 'sha1');
    const staging = path.join(tools, 'sdk-staging', item.destination.replaceAll('/', '-'));
    await mkdir(staging, { recursive: true });
    await new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:FOLIA_SDK_ZIP -DestinationPath $env:FOLIA_SDK_STAGING -Force'], {
            env: { ...process.env, FOLIA_SDK_ZIP: archive, FOLIA_SDK_STAGING: staging }, windowsHide: true, stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Cannot extract ${item.destination}`)));
    });
    let source = staging;
    if (!await exists(path.join(source, 'source.properties'))) {
        const children = await readdir(staging, { withFileTypes: true });
        if (children.length === 1 && children[0].isDirectory()) source = path.join(staging, children[0].name);
    }
    await mkdir(path.dirname(target), { recursive: true });
    if (await exists(target)) await cp(source, target, { recursive: true });
    else await rename(source, target);
    await writeFile(path.join(target, '.folia-installed'), item.checksum);
    console.info(`[Android] Installed ${item.destination}`);
}));
