// Pushes the theme to a store with the demo/ settings merged into its templates, section groups and theme settings,
// so it shows the demo files, products and collections created by scripts/seed-demo-store.mjs.
// The theme repository itself stays free of store-specific references.
//
// Run: node scripts/push-demo-theme.mjs <store>.myshopify.com <theme-id>
// The theme is read from a sibling checkout, ../shopify-theme-src; set THEME_DIR if it lives elsewhere.
// Set FREE_SHIPPING=<amount in the store's currency> to override the free shipping threshold for that store.
// Set NO_VIDEO=1 for stores that can't host video (trial plans): video settings are dropped and sections fall back to their cover image.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME_DIR = path.resolve(process.env.THEME_DIR || path.join(ROOT, '..', 'shopify-theme-src'));
const THEME_FOLDERS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const [STORE, THEME_ID] = process.argv.slice(2);
if (!STORE || !THEME_ID) {
  console.error('Usage: node scripts/push-demo-theme.mjs <store>.myshopify.com <theme-id>');
  process.exit(1);
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
const dropVideos = (value) => {
  if (Array.isArray(value)) return value.map(dropVideos);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => !(typeof v === 'string' && v.startsWith('shopify://files/videos/')))
      .map(([k, v]) => [k, dropVideos(v)])
  );
};
const deepMerge = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out;
};

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'tangelo-theme-'));
for (const dir of THEME_FOLDERS.filter((d) => fs.existsSync(path.join(THEME_DIR, d)))) {
  fs.cpSync(path.join(THEME_DIR, dir), path.join(stage, dir), { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
}

for (const dir of ['templates', 'sections']) {
  const overlays = path.join(ROOT, 'demo', dir);
  if (!fs.existsSync(overlays)) continue;
  for (const name of fs.readdirSync(overlays).filter((f) => f.endsWith('.json'))) {
    const target = path.join(stage, dir, name);
    if (!fs.existsSync(target)) continue;
    let merged = deepMerge(readJSON(target), readJSON(path.join(overlays, name)));
    if (process.env.NO_VIDEO) merged = dropVideos(merged);
    fs.writeFileSync(target, JSON.stringify(merged, null, 2));
    console.log(`merged demo/${dir}/${name}`);
  }
}

// Theme settings for the demo only, such as its social links and the cart drawer's static section settings.
{
  const file = path.join(stage, 'config', 'settings_data.json');
  const data = readJSON(file);
  // `current` is either the settings object or the name of a preset holding them.
  const key = typeof data.current === 'string' ? data.current : null;
  let current = key ? data.presets[key] : data.current;
  const overlay = path.join(ROOT, 'demo', 'config', 'settings_data.json');
  if (fs.existsSync(overlay)) {
    current = deepMerge(current, readJSON(overlay).current || {});
    console.log('merged demo/config/settings_data.json');
  }
  if (process.env.FREE_SHIPPING) {
    current.free_shipping_threshold = Number(process.env.FREE_SHIPPING);
    console.log(`free shipping threshold: ${process.env.FREE_SHIPPING}`);
  }
  if (key) data.presets[key] = current;
  else data.current = current;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

try {
  execFileSync('shopify', ['theme', 'push', '--path', stage, '--store', STORE, '--theme', THEME_ID, '--no-color'], { stdio: 'inherit' });
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
