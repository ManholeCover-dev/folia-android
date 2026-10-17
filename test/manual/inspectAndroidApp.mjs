import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Inspects the debug WebView on the test emulator; no user account credentials are read.
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('https://localhost'));
if (!page) throw new Error('The Android app WebView is not available');
page.setDefaultTimeout(8_000);
await mkdir('test-results', { recursive: true });
if (process.argv[2] === 'verify') {
    const result = await page.evaluate(async () => {
        const health = await fetch('/__folia_backend/_health').then(response => response.json());
        const search = await fetch('/__folia_backend/netease/search?keywords=%E6%9C%88%E4%BA%AE%E4%BB%A3%E8%A1%A8%E6%88%91%E7%9A%84%E5%BF%83&limit=1').then(response => response.json());
        const qr = await fetch('/__folia_backend/netease/login/qr/create', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: 'android-transport-probe', qrimg: true }),
        }).then(response => response.json());
        return { node: health.node, providers: health.providers, searchCount: search.result?.songs?.length ?? 0, nativePostOk: qr.data?.qrimg?.startsWith('data:image/png') === true };
    });
    console.info('Final Android verification', result);
    if (!result.searchCount || !result.nativePostOk) throw new Error('Android backend verification failed');
    process.exit(0);
}
if (process.argv[2] === 'onboarding') {
    const grid = page.getByRole('button', { name: /^GridClassic/ });
    if (await grid.isVisible()) await grid.click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
}
if (process.argv[2] === 'finish-onboarding') {
    await page.getByRole('button', { name: 'Use this', exact: true }).click();
}
if (process.argv[2] === 'ponder') {
    await page.getByRole('button', { name: 'Ponder this page', exact: true }).click();
}
if (process.argv[2] === 'search') {
    const exit = page.getByRole('button', { name: /Exit$/ });
    if (await exit.isVisible()) await exit.click();
    const close = page.getByRole('button', { name: 'Close', exact: true }).last();
    if (await close.isVisible()) await close.click();
    console.info('opening search');
    await page.getByRole('button', { name: 'Search online platforms', exact: true }).click();
}
if (process.argv[2] === 'run-search') {
    await page.getByPlaceholder('Search online platforms', { exact: true }).fill('月亮代表我的心');
    await page.getByPlaceholder('Search online platforms', { exact: true }).press('Enter');
    await page.getByText('邓丽君', { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 });
}
if (process.argv[2] === 'play') {
    await page.getByRole('button', { name: 'Play track', exact: true }).first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(audio => !audio.paused && audio.currentTime > 1), undefined, { timeout: 30_000 });
    console.info('playback', await page.locator('audio').evaluateAll(elements => elements.map(audio => ({
        paused: audio.paused, currentTime: audio.currentTime, readyState: audio.readyState, error: audio.error?.code ?? null,
    }))));
}
console.info('app', { url: page.url(), title: await page.title() });
console.info('body', (await page.locator('body').innerText()).slice(0, 4500));
console.info('controls', await page.locator('button,input').evaluateAll(elements => elements.slice(0, 45).map(element => ({
    tag: element.tagName, text: element.textContent?.trim().slice(0, 80),
    title: element.getAttribute('title'), label: element.getAttribute('aria-label'), placeholder: element.getAttribute('placeholder'),
}))));
console.info('native health', await page.evaluate(async () => {
    const response = await fetch('/__folia_backend/_health');
    return { status: response.status, body: await response.json() };
}));
await page.screenshot({ path: process.argv[2] === 'play' ? 'test-results/android-player.png' : 'test-results/android-home.png' });
// Closing this inspection process disconnects CDP without closing the application.
process.exit(0);
