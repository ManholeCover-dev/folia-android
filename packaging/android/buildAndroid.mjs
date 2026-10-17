import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Uses the workspace toolchain when present, without changing the user's environment.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = { ...process.env };
const tools = path.resolve(root, '../.android-tools');
const jdkRoot = path.join(tools, 'jdk');
if (!env.JAVA_HOME && existsSync(jdkRoot)) {
    const jdk = readdirSync(jdkRoot, { withFileTypes: true }).find(item => item.isDirectory());
    if (jdk) env.JAVA_HOME = path.join(jdkRoot, jdk.name);
}
env.GRADLE_USER_HOME ||= path.join(tools, 'gradle');
const windows = process.platform === 'win32';
const localGradle = path.join(tools, 'gradle-distribution/gradle-8.14.3/bin', windows ? 'gradle.bat' : 'gradle');
const launcher = existsSync(localGradle) ? localGradle : windows ? 'gradlew.bat' : './gradlew';
const child = spawn(windows ? 'cmd.exe' : './gradlew', windows
    ? ['/d', '/s', '/c', launcher, ...process.argv.slice(2), '--console=plain']
    : [...process.argv.slice(2), '--console=plain'], {
    cwd: path.join(root, 'android'), env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
