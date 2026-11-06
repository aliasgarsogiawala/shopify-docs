// Captures the Theme Store listing images from the live demo store, which sits behind its storefront password:
// the desktop and mobile home page screenshots and the three key highlights (see listing/README.md).
// Run: node scripts/capture-listing.mjs listing <storefront password>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [out, password] = process.argv.slice(2);
const STORE = 'https://tangelo-demo-0e5pc4tq.myshopify.com';
const port = 9500 + Math.floor(Math.random() * 100);
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'tank-listing-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const view = (width, height, scale, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
const go = async (path, settle = 6000) => { await send('Page.navigate', { url: STORE + path }); await sleep(settle); };
// Wait for fonts and every visible image, then stop slideshows and marquees so the frame is steady.
// Also holds the hero on its first flavor and drops the gutter the theme keeps for a scrollbar (hidden here).
const ready = () => evaluate(`(async () => {
  document.querySelectorAll('tank-hero').forEach((h) => h.stop && h.stop());
  document.documentElement.style.scrollbarGutter = 'auto';
  await document.fonts.ready;
  const imgs = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight * 1.2; });
  imgs.forEach((i) => { i.loading = 'eager'; });
  await Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
  document.querySelectorAll('.marquee__track').forEach((t) => { t.style.animationPlayState = 'paused'; });
  return imgs.length;
})()`);
// Captures the viewport as it stands (a clip would be measured from the top of the page, not the scroll position).
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('saved', name);
};
const scrollTo = (sel, offset = 0) => evaluate(`(() => { document.documentElement.style.scrollBehavior = 'auto'; const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing ${sel}'; window.scrollTo(0, e.getBoundingClientRect().top + scrollY + ${offset}); return 'ok'; })()`);
try {
  let target;
  for (let t = 0; t < 50 && !target; t++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await go('/password', 3000);
  await evaluate(`(() => { const i = document.querySelector('input[type=password]'); if (i) { i.value = ${JSON.stringify(password)}; i.form.submit(); } })()`);
  await sleep(5000);

  // Listing screenshots: desktop 1000x1248 at 2x, mobile 375x667 at 2x.
  await view(1000, 1248, 2, false); await go('/', 3000); await ready(); await sleep(1500);
  await shot('desktop-home');
  await view(375, 667, 2, true); await go('/', 3000); await ready(); await sleep(1500);
  await shot('mobile-home');

  // Key highlights at 1600x1200.
  // The hero highlight shows another flavor, so it doesn't repeat the desktop screenshot.
  await view(1600, 1200, 1, false); await go('/', 3000); await ready();
  await evaluate(`document.querySelector('tank-hero').go(4, true)`); await sleep(2500); await ready(); await sleep(1000);
  await shot('highlight-hero');
  console.log(await scrollTo('.section-pack-builder')); await sleep(1500); await ready();
  // Fill part of the case so the builder is shown in use.
  console.log(await evaluate(`(() => { const add = [...document.querySelectorAll('.section-pack-builder [data-pack-step="1"]')]; [0,0,0,1,1,2,2,3,4].forEach((i) => add[i] && add[i].click()); return add.length; })()`));
  // Pad the section so it fills the frame below the sticky header and the next section stays out of shot.
  console.log(await evaluate(`(() => {
    const pack = document.querySelector('.section-pack-builder .pack');
    const cs = getComputedStyle(pack);
    const content = pack.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const head = document.elementFromPoint(innerWidth / 2, 5).closest('.shopify-section');
    const top = head ? head.getBoundingClientRect().bottom : 0;
    const pad = Math.max((innerHeight - top - content) / 2, 0);
    pack.style.paddingTop = pack.style.paddingBottom = pad + 'px';
    window.scrollTo(0, pack.getBoundingClientRect().top + scrollY - top);
    return [top, content, pad];
  })()`));
  await sleep(1500);
  await shot('highlight-pack');
  console.log(await scrollTo('.section-scroll-story')); await sleep(1500);
  await evaluate('window.scrollBy(0, 300)'); await sleep(2000); await ready();
  await shot('highlight-story');
} finally { chrome.kill(); }
