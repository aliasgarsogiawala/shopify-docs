// Fills a Shopify store with the Tangelo demo content the theme's demo/ templates expect:
// files (demo/images, demo/videos), metafield definitions, products, collections, pages, the journal blog and menus.
// Safe to re-run: anything that already exists (matched by file name or handle) is left alone.
//
// Run: node scripts/seed-demo-store.mjs <store>.myshopify.com
// Needs: shopify store auth --store <store> --scopes read_products,write_products,read_files,write_files,
//   read_content,write_content,read_online_store_pages,write_online_store_pages,read_online_store_navigation,
//   write_online_store_navigation,read_publications,write_publications
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = process.argv[2];
// --refresh re-uploads demo/images over the files already in the store and brings existing products up to date.
const REFRESH = process.argv.includes('--refresh');
if (!STORE || !STORE.endsWith('.myshopify.com')) {
  console.error('Usage: node scripts/seed-demo-store.mjs <store>.myshopify.com [--refresh]');
  process.exit(1);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tangelo-seed-'));

/* ---------- Admin GraphQL through Shopify CLI ---------- */

let calls = 0;
function gql(query, variables = {}, version = null) {
  const q = path.join(TMP, 'q.graphql');
  const v = path.join(TMP, 'v.json');
  fs.writeFileSync(q, query);
  fs.writeFileSync(v, JSON.stringify(variables));
  const args = ['store', 'execute', '--store', STORE, '--query-file', q, '--variable-file', v, '--json', '--no-color'];
  if (/^\s*mutation/.test(query)) args.push('--allow-mutations');
  if (version) args.push('--version', version);
  calls++;
  const out = execFileSync('shopify', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('{')));
}

function check(label, payload) {
  const errs = payload?.userErrors || [];
  if (errs.length) throw new Error(`${label}: ${errs.map((e) => `${(e.field || []).join('.')} ${e.message}`).join('; ')}`);
  return payload;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ---------- Files ---------- */

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' };

async function existingFiles() {
  const byName = {};
  let after = null;
  do {
    const d = gql(
      `query Files($after: String) {
        files(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fileStatus
            ... on MediaImage { image { url } }
            ... on Video { filename sources { url } }
          }
        }
      }`,
      { after }
    );
    for (const n of d.files.nodes) {
      const url = n.image?.url || n.sources?.[0]?.url || '';
      const name = n.filename || decodeURIComponent(url.split('?')[0].split('/').pop() || '');
      if (name) byName[name] = { id: n.id, url, status: n.fileStatus };
    }
    after = d.files.pageInfo.hasNextPage ? d.files.pageInfo.endCursor : null;
  } while (after);
  return byName;
}

const skipped = new Set();

async function stage(todo) {
  const staged = check(
    'stagedUploadsCreate',
    gql(
      `mutation Stage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: todo.map((p) => ({
          filename: path.basename(p),
          mimeType: MIME[path.extname(p)],
          resource: p.endsWith('.mp4') ? 'VIDEO' : 'IMAGE',
          fileSize: String(fs.statSync(p).size),
          httpMethod: 'POST',
        })),
      }
    ).stagedUploadsCreate
  );
  for (const [i, t] of staged.stagedTargets.entries()) {
    const form = new FormData();
    for (const { name, value } of t.parameters) form.append(name, value);
    form.append('file', new Blob([fs.readFileSync(todo[i])], { type: MIME[path.extname(todo[i])] }), path.basename(todo[i]));
    const res = await fetch(t.url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`upload ${todo[i]}: ${res.status} ${await res.text()}`);
  }
  return staged.stagedTargets;
}

/* Replaces the content of files already in the store. The file keeps its id, so products and theme settings using it update too. */
async function replaceFiles(paths, have) {
  const todo = paths.filter((p) => !p.endsWith('.mp4') && have[path.basename(p)]);
  if (!todo.length) return;
  log(`files: replacing ${todo.length} image(s)`);
  const targets = await stage(todo);
  check(
    'fileUpdate',
    gql(
      `mutation Replace($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) { files { id } userErrors { field message } }
      }`,
      { files: todo.map((p, i) => ({ id: have[path.basename(p)].id, originalSource: targets[i].resourceUrl })) }
    ).fileUpdate
  );
}

async function uploadFiles(paths) {
  const have = await existingFiles();
  if (REFRESH) await replaceFiles(paths, have);
  const todo = paths.filter((p) => !have[path.basename(p)]);
  log(`files: ${paths.length - todo.length} already in Files, uploading ${todo.length}`);
  if (todo.length) {
    const stagedTargets = await stage(todo);
    // Images and videos go in separate calls: trial stores reject videos, and one bad file fails the whole batch.
    for (const kind of ['IMAGE', 'VIDEO']) {
      const batch = todo.map((p, i) => ({ p, i })).filter(({ p }) => (p.endsWith('.mp4') ? 'VIDEO' : 'IMAGE') === kind);
      if (!batch.length) continue;
      const d = gql(
        `mutation Files($files: [FileCreateInput!]!) {
          fileCreate(files: $files) { files { id } userErrors { field message } }
        }`,
        { files: batch.map(({ p, i }) => ({ originalSource: stagedTargets[i].resourceUrl, contentType: kind, filename: path.basename(p) })) }
      ).fileCreate;
      if (kind === 'VIDEO' && d.userErrors.some((e) => /trial/i.test(e.message))) {
        log(`files: skipped ${batch.length} video(s), trial stores can't host video (${d.userErrors[0].message})`);
        for (const { p } of batch) skipped.add(p);
        continue;
      }
      check('fileCreate', d);
    }
  }
  // Wait until Shopify has processed every file, so products and articles can use their URLs.
  for (let tries = 0; tries < 40; tries++) {
    const now = await existingFiles();
    const pending = paths.filter((p) => !skipped.has(p) && now[path.basename(p)]?.status !== 'READY');
    if (!pending.length) return now;
    if (pending.some((p) => now[path.basename(p)]?.status === 'FAILED')) throw new Error(`file processing failed: ${pending.join(', ')}`);
    log(`files: waiting for ${pending.length} to finish processing`);
    await sleep(5000);
  }
  throw new Error('files did not finish processing');
}

/* ---------- Demo catalogue (mirrors .qa/preview/store.mjs) ---------- */

const FLAVOURS = [
  { handle: 'blood-orange', title: 'Blood Orange', short: 'Blood Orange', color: '#FF4A17', subtitle: 'Sicilian blood orange and ginger', tags: ['citrus', 'best-seller'], rating: 4.9, reviews: 812,
    desc: 'Sicilian blood oranges pressed the day they arrive, a pinch of fresh ginger and just enough cane sugar to round it off. Bright and a little bitter, like the peel.' },
  { handle: 'yuzu-lime', title: 'Yuzu Lime', short: 'Yuzu Lime', color: '#D7F23A', subtitle: 'Yuzu, Persian lime, bitter finish', tags: ['citrus'], rating: 4.8, reviews: 540,
    desc: 'Japanese yuzu and Persian lime with a dry, bitter finish. Sharp on the first sip and clean on the last.' },
  { handle: 'black-cherry', title: 'Black Cherry', short: 'Black Cherry', color: '#9B0E3F', subtitle: 'Dark cherry and Madagascan vanilla', tags: ['berry'], rating: 4.8, reviews: 403,
    desc: 'Dark Bing cherries and a little Madagascan vanilla. Rich without being heavy, with enough fizz to keep it light.' },
  { handle: 'pink-grapefruit', title: 'Pink Grapefruit', short: 'Grapefruit', color: '#FF9CB0', subtitle: 'Ruby grapefruit and sea salt', tags: ['citrus', 'new'], rating: 4.7, reviews: 226,
    desc: 'Ruby grapefruit and a pinch of sea salt. Tart first, then clean, then gone.' },
  { handle: 'wild-blueberry', title: 'Wild Blueberry', short: 'Blueberry', color: '#3B2FC9', subtitle: 'Wild blueberry and lemon peel', tags: ['berry', 'new'], rating: 4.8, reviews: 159,
    desc: 'Wild Maine blueberries and lemon peel, pressed and canned in the same week.' },
];

// Prices per store currency; stores in other currencies get the USD numbers.
const PRICE_TABLES = {
  USD: { pack12: '30.00', pack24: '56.00', pack24Compare: '60.00', single: '2.50', glass: '14.00', cooler: '8.00', tote: '22.00', cap: '28.00', pins: '12.00', stickers: '6.00', flatShipping: '$6' },
  INR: { pack12: '1499.00', pack24: '2799.00', pack24Compare: '2999.00', single: '129.00', glass: '999.00', cooler: '499.00', tote: '1299.00', cap: '1799.00', pins: '699.00', stickers: '299.00', flatShipping: '₹99' },
};
const CURRENCY = gql(`query { shop { currencyCode } }`).shop.currencyCode;
const PRICES = PRICE_TABLES[CURRENCY] || PRICE_TABLES.USD;
log(`store currency: ${CURRENCY}${PRICE_TABLES[CURRENCY] ? '' : ' (no price table, using USD numbers)'}`);

const PACKS = [
  { name: '12 pack', price: PRICES.pack12 },
  { name: '24 pack', price: PRICES.pack24, compareAt: PRICES.pack24Compare },
];

const PRODUCTS = [
  ...FLAVOURS.map((f) => ({ ...f, type: 'Soda', images: [`can-${f.handle}.png`, `pack-${f.handle}.png`], packs: PACKS })),
  ...FLAVOURS.map((f) => ({ ...f, handle: `${f.handle}-single`, type: 'Single', tags: [...f.tags, 'single'], rating: null, images: [`can-${f.handle}.png`], packs: [{ name: 'Default Title', price: PRICES.single }] })),
  { handle: 'mixed-case', title: 'The Mixed Case', short: 'Mixed', color: '#D7F23A', subtitle: 'All five flavors, 12 cans', tags: ['bundle', 'best-seller'], rating: 4.9, reviews: 1204, type: 'Bundle',
    desc: 'Twelve cans across all five flavors. The easiest way to find a favorite, or to avoid picking one.',
    images: ['pack-mixed-case.png', 'can-blood-orange.png'], packs: PACKS },
  { handle: 'tangelo-glass', legacyHandles: ['zestra-glass', 'pith-glass'], title: 'Can Glass', short: 'Glass', color: '#C9E8FF', subtitle: '16 oz, recycled glass', tags: ['merch'], rating: 4.6, reviews: 48, type: 'Merch',
    desc: 'A can-shaped glass made from recycled glass. Holds a whole can, a slice and plenty of ice.',
    images: ['glass.png'], packs: [{ name: 'Default Title', price: PRICES.glass }] },
  { handle: 'can-cooler', title: 'Can Cooler', short: 'Cooler', color: '#9B0E3F', subtitle: 'Neoprene, fits a 12 oz can', tags: ['merch'], rating: 4.7, reviews: 96, type: 'Merch',
    desc: 'A thick neoprene sleeve that keeps a can cold through a long lunch. Fits any standard 12 oz can.',
    images: ['merch-cooler.png'], packs: [{ name: 'Default Title', price: PRICES.cooler }] },
  { handle: 'canvas-tote', title: 'Canvas Tote', short: 'Tote', color: '#FF4A17', subtitle: 'Heavy cotton canvas', tags: ['merch'], rating: 4.8, reviews: 71, type: 'Merch',
    desc: 'Heavy cotton canvas with long handles and room for a 12 pack. Screen printed by hand.',
    images: ['merch-tote.png'], packs: [{ name: 'Default Title', price: PRICES.tote }] },
  { handle: 'dad-cap', title: 'Dad Cap', short: 'Cap', color: '#FF9CB0', subtitle: 'Washed cotton twill, one size', tags: ['merch'], rating: 4.7, reviews: 63, type: 'Merch',
    desc: 'Washed cotton twill with an embroidered wordmark and an adjustable back strap. One size fits most.',
    images: ['merch-cap.png'], packs: [{ name: 'Default Title', price: PRICES.cap }] },
  { handle: 'pin-set', title: 'Pin Set', short: 'Pins', color: '#3B2FC9', subtitle: 'Three hard enamel pins', tags: ['merch'], rating: 4.9, reviews: 37, type: 'Merch',
    desc: 'A grapefruit slice, a tiny can and the wordmark in hard enamel with gold edges. Two rubber backs on each pin.',
    images: ['merch-pins.png'], packs: [{ name: 'Default Title', price: PRICES.pins }] },
  { handle: 'sticker-pack', title: 'Sticker Pack', short: 'Stickers', color: '#D7F23A', subtitle: 'Six die-cut vinyl stickers', tags: ['merch'], rating: 4.8, reviews: 120, type: 'Merch',
    desc: 'Six die-cut vinyl stickers, waterproof and tough enough for a water bottle.',
    images: ['merch-stickers.png'], packs: [{ name: 'Default Title', price: PRICES.stickers }] },
];

const COLLECTIONS = [
  { handle: 'all', title: 'All products', desc: 'Every flavor, case and piece of merch we make.', match: (p) => p.type !== 'Single' },
  { handle: 'sodas', title: 'Sodas', color: '#000000', desc: 'Five sparkling sodas with pressed fruit and 5g of prebiotic fiber.', match: (p) => p.type === 'Soda' },
  { handle: 'citrus', title: 'Citrus', color: '#FF4A17', desc: 'Blood orange, yuzu and grapefruit. Bright, bitter, awake.', match: (p) => p.type === 'Soda' && p.tags.includes('citrus') },
  { handle: 'berry', title: 'Berry', color: '#9B0E3F', desc: 'Dark cherry and wild blueberry, rich but never heavy.', match: (p) => p.type === 'Soda' && p.tags.includes('berry') },
  { handle: 'bundles', title: 'Mixed cases', color: '#D7F23A', desc: 'Twelve or twenty-four cans across every flavor.', match: (p) => p.type === 'Bundle' },
  { handle: 'singles', title: 'Single cans', desc: 'Single cans for building your own case.', match: (p) => p.type === 'Single' },
  { handle: 'merch', title: 'Merch', color: '#C9E8FF', desc: 'Glasses, caps, totes and the rest of the stuff we put our name on.', match: (p) => p.type === 'Merch' },
];

const PAGES = [
  { handle: 'about', title: 'Our story', templateSuffix: 'about', body: '<p>Tangelo started in a shared kitchen in 2021.</p>' },
  { handle: 'contact', title: 'Contact', templateSuffix: 'contact', keepBody: true, body: '<p>Questions about an order, wholesale or stocking Tangelo? Write to us and a real person will reply within a working day.</p>' },
  { handle: 'where-to-buy', title: 'Where to buy', templateSuffix: 'stockists', body: '' },
  { handle: 'shipping', title: 'Shipping', templateSuffix: null,
    body: `<p>We ship in 2 to 4 working days. Full cases ship free; smaller orders are a flat ${PRICES.flatShipping}.</p><h2>Damaged cans</h2><p>If anything arrives dented or leaking, send us a photo within 14 days and we will replace it.</p><h2>Subscriptions</h2><p>Subscriptions ship on the same day each cycle. You can skip, swap or cancel from your account up to two days before.</p>` },
];

const ARTICLE_BODY = (excerpt) =>
  `<p>${excerpt}</p><p>Every batch starts with fruit we have tasted ourselves. We press it within a day of picking, check the sugar by hand and only then decide how much of anything else goes in. Most of the time the answer is less than you would think.</p><h2>What you need</h2><ul><li>One can of Tangelo, cold</li><li>A tall glass and a lot of ice</li><li>Something sharp to finish: a twist of peel or a pinch of salt</li></ul><p>Pour slowly down the side of the glass to keep the bubbles, then stop before the top. Drink it while it is still loud.</p><blockquote>If it does not taste like the fruit, it does not go in a can.</blockquote><p>That is the only rule we have kept since the first batch.</p>`;

const ARTICLES = [
  { handle: 'yuzu-spritz', color: '#D5EE3A', title: 'The two-minute yuzu spritz', image: 'flatlay-yuzu-lime.jpg', tags: ['Recipes'], templateSuffix: 'recipe', excerpt: 'Yuzu Lime, a splash of dry vermouth and plenty of ice. That is the whole recipe.' },
  { handle: 'why-prebiotic', color: '#C58146', title: 'What prebiotic fiber actually does', image: 'story-grove.jpg', tags: ['Notes'], excerpt: 'A short, plain-English guide to chicory root and the bacteria that like it.' },
  { handle: 'etna-harvest', color: '#392EC3', title: 'Harvest week on Etna', image: 'story-press.jpg', tags: ['Notes'], excerpt: 'Six weeks, three groves and about forty tonnes of blood oranges.' },
  { handle: 'cherry-bourbon', color: '#980E3F', title: 'Black Cherry and bourbon, ranked by our team', image: 'flatlay-black-cherry.jpg', tags: ['Recipes'], excerpt: 'We tried four bourbons so you do not have to.' },
];

/* ---------- Steps ---------- */

function ensureMetafieldDefinitions() {
  const defs = [
    { ownerType: 'PRODUCT', namespace: 'custom', key: 'flavor_color', name: 'Flavor color', type: 'color' },
    { ownerType: 'PRODUCT', namespace: 'custom', key: 'short_name', name: 'Short name', type: 'single_line_text_field' },
    { ownerType: 'PRODUCT', namespace: 'custom', key: 'subtitle', name: 'Subtitle', type: 'single_line_text_field' },
    { ownerType: 'COLLECTION', namespace: 'custom', key: 'flavor_color', name: 'Flavor color', type: 'color' },
    { ownerType: 'ARTICLE', namespace: 'custom', key: 'flavor_color', name: 'Header color', type: 'color' },
  ];
  for (const def of defs) {
    const d = gql(
      `mutation Def($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } }
      }`,
      { definition: { ...def, access: { storefront: 'PUBLIC_READ' } } }
    ).metafieldDefinitionCreate;
    const taken = d.userErrors.some((e) => e.code === 'TAKEN');
    if (!taken) check(`definition ${def.namespace}.${def.key}`, d);
    log(`metafield ${def.ownerType.toLowerCase()} ${def.namespace}.${def.key}: ${taken ? 'exists' : 'created'}`);
  }
}

function onlineStorePublication() {
  const d = gql(`query { publications(first: 20) { nodes { id catalog { title } } } }`);
  // Catalog titles read "Channel Catalog <id> for Online Store".
  const pub = d.publications.nodes.find((p) => /\bOnline Store$/.test(p.catalog?.title || ''));
  if (!pub) throw new Error('No Online Store publication found');
  return pub.id;
}

function publish(id, publicationId) {
  check(
    'publishablePublish',
    gql(
      `mutation Pub($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id, input: [{ publicationId }] }
    ).publishablePublish
  );
}

function ensureProducts(files, publicationId) {
  const ids = {};
  for (const p of PRODUCTS) {
    const byHandle = (handle) => gql(`query P($handle: String!) { productByIdentifier(identifier: { handle: $handle }) { id } }`, { handle }).productByIdentifier;
    const found = [p.handle, ...(p.legacyHandles || [])].reduce((hit, handle) => hit || byHandle(handle), null);
    if (found) {
      ids[p.handle] = found.id;
      if (REFRESH) {
        // Brings products made by an earlier run in line with the current copy; the old handle redirects to the new one.
        check(
          `productUpdate ${p.handle}`,
          gql(
            `mutation Update($product: ProductUpdateInput!) {
              productUpdate(product: $product) { product { id } userErrors { field message } }
            }`,
            { product: { id: found.id, handle: p.handle, redirectNewHandle: true, vendor: 'Tangelo', descriptionHtml: `<p>${p.desc}</p>` } }
          ).productUpdate
        );
        log(`product ${p.handle}: refreshed`);
      } else {
        log(`product ${p.handle}: exists`);
      }
      continue;
    }
    const single = p.packs.length === 1 && p.packs[0].name === 'Default Title';
    const optionName = single ? 'Title' : 'Size';
    const metafields = [
      { namespace: 'custom', key: 'flavor_color', type: 'color', value: p.color },
      { namespace: 'custom', key: 'short_name', type: 'single_line_text_field', value: p.short },
      { namespace: 'custom', key: 'subtitle', type: 'single_line_text_field', value: p.subtitle },
    ];
    if (p.rating) {
      metafields.push(
        { namespace: 'reviews', key: 'rating', type: 'rating', value: JSON.stringify({ value: String(p.rating), scale_min: '1.0', scale_max: '5.0' }) },
        { namespace: 'reviews', key: 'rating_count', type: 'number_integer', value: String(p.reviews) }
      );
    }
    const input = {
      title: p.title,
      handle: p.handle,
      descriptionHtml: `<p>${p.desc}</p>`,
      vendor: 'Tangelo',
      productType: p.type,
      tags: p.tags,
      status: 'ACTIVE',
      productOptions: [{ name: optionName, position: 1, values: p.packs.map((v) => ({ name: v.name })) }],
      variants: p.packs.map((v) => ({
        optionValues: [{ optionName, name: v.name }],
        price: v.price,
        compareAtPrice: v.compareAt || null,
        sku: `${p.handle}-${v.name}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
        inventoryItem: { tracked: false },
      })),
      files: p.images.map((name) => ({ id: files[name].id })),
      metafields,
    };
    const create = (inp) =>
      gql(
        `mutation Product($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) { product { id } userErrors { field message code } }
        }`,
        { input: inp }
      ).productSet;
    let res = create(input);
    if (res.userErrors.length && p.rating) {
      // Some stores reserve the reviews namespace for review apps; create the product without stars.
      log(`  ${p.handle}: ${res.userErrors[0].message}; retrying without review metafields`);
      res = create({ ...input, metafields: metafields.filter((m) => m.namespace !== 'reviews') });
    }
    const d = check(`productSet ${p.handle}`, res);
    ids[p.handle] = d.product.id;
    publish(d.product.id, publicationId);
    log(`product ${p.handle}: created`);
  }
  return ids;
}

function ensureCollections(productIds, publicationId) {
  for (const c of COLLECTIONS) {
    const found = gql(`query C($handle: String!) { collectionByIdentifier(identifier: { handle: $handle }) { id } }`, { handle: c.handle }).collectionByIdentifier;
    if (found) {
      if (REFRESH) {
        check(
          `collectionUpdate ${c.handle}`,
          gql(
            `mutation Col($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
            { input: { id: found.id, descriptionHtml: c.desc ? `<p>${c.desc}</p>` : '' } },
            '2026-04'
          ).collectionUpdate
        );
        log(`collection ${c.handle}: refreshed`);
      } else log(`collection ${c.handle}: exists`);
      continue;
    }
    const input = {
      title: c.title,
      handle: c.handle,
      descriptionHtml: c.desc ? `<p>${c.desc}</p>` : '',
      products: PRODUCTS.filter(c.match).map((p) => productIds[p.handle]),
      metafields: c.color ? [{ namespace: 'custom', key: 'flavor_color', type: 'color', value: c.color }] : [],
    };
    const d = check(
      `collectionCreate ${c.handle}`,
      gql(
        // 2026-04 still takes a product list on create; 2026-07 moved membership to collection sources.
        `mutation Col($input: CollectionInput!) {
          collectionCreate(input: $input) { collection { id handle } userErrors { field message } }
        }`,
        { input },
        '2026-04'
      ).collectionCreate
    );
    if (d.collection.handle !== c.handle) log(`  note: Shopify gave collection ${c.handle} the handle ${d.collection.handle}`);
    publish(d.collection.id, publicationId);
    log(`collection ${c.handle}: created`);
  }
}

function ensurePages() {
  const existing = Object.fromEntries(gql(`query { pages(first: 250) { nodes { id handle } } }`).pages.nodes.map((p) => [p.handle, p.id]));
  const ids = {};
  for (const p of PAGES) {
    if (existing[p.handle]) {
      // The contact page usually exists before the demo does, so its text is left alone.
      if (REFRESH && !p.keepBody) {
        check(
          `pageUpdate ${p.handle}`,
          gql(`mutation Page($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { field message } } }`, {
            id: existing[p.handle],
            page: { body: p.body },
          }).pageUpdate
        );
        log(`page ${p.handle}: refreshed`);
      } else log(`page ${p.handle}: exists`);
      continue;
    }
    check(
      `pageCreate ${p.handle}`,
      gql(
        `mutation Page($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { field message } } }`,
        { page: { title: p.title, handle: p.handle, body: p.body, templateSuffix: p.templateSuffix, isPublished: true } }
      ).pageCreate
    );
    log(`page ${p.handle}: created`);
  }
  for (const n of gql(`query { pages(first: 250) { nodes { id handle } } }`).pages.nodes) ids[n.handle] = n.id;
  return ids;
}

// The article header takes the backdrop color of the article's image.
const articleColor = (a) => [{ namespace: 'custom', key: 'flavor_color', type: 'color', value: a.color }];

function ensureBlog(files) {
  let blog = gql(`query { blogs(first: 50) { nodes { id handle } } }`).blogs.nodes.find((b) => b.handle === 'journal');
  if (!blog) {
    blog = check(
      'blogCreate',
      gql(`mutation Blog($blog: BlogCreateInput!) { blogCreate(blog: $blog) { blog { id handle } userErrors { field message } } }`, {
        blog: { title: 'Journal', handle: 'journal', commentPolicy: 'MODERATED' },
      }).blogCreate
    ).blog;
    log('blog journal: created');
  } else log('blog journal: exists');
  const have = Object.fromEntries(
    gql(`query A($id: ID!) { blog(id: $id) { articles(first: 250) { nodes { id handle } } } }`, { id: blog.id }).blog.articles.nodes.map((a) => [a.handle, a.id])
  );
  for (const [i, a] of ARTICLES.entries()) {
    if (have[a.handle]) {
      if (REFRESH) {
        check(
          `articleUpdate ${a.handle}`,
          gql(
            `mutation Article($id: ID!, $article: ArticleUpdateInput!) { articleUpdate(id: $id, article: $article) { article { id } userErrors { field message } } }`,
            { id: have[a.handle], article: { body: ARTICLE_BODY(a.excerpt), summary: `<p>${a.excerpt}</p>`, metafields: articleColor(a), templateSuffix: a.templateSuffix || null } }
          ).articleUpdate
        );
        log(`article ${a.handle}: refreshed`);
      } else log(`article ${a.handle}: exists`);
      continue;
    }
    check(
      `articleCreate ${a.handle}`,
      gql(
        `mutation Article($article: ArticleCreateInput!) { articleCreate(article: $article) { article { id } userErrors { field message } } }`,
        {
          article: {
            blogId: blog.id,
            title: a.title,
            handle: a.handle,
            body: ARTICLE_BODY(a.excerpt),
            summary: `<p>${a.excerpt}</p>`,
            tags: a.tags,
            author: { name: 'Mara Velasco' },
            image: { url: files[a.image].url, altText: a.title },
            metafields: articleColor(a),
            templateSuffix: a.templateSuffix || null,
            isPublished: true,
            publishDate: new Date(Date.UTC(2026, 8, 20 - i * 9)).toISOString(),
          },
        }
      ).articleCreate
    );
    log(`article ${a.handle}: created`);
  }
  return blog.id;
}

function ensureMenus(pageIds, blogId) {
  const menus = gql(`query { menus(first: 50) { nodes { id handle } } }`).menus.nodes;
  const col = (handle) => gql(`query C($handle: String!) { collectionByIdentifier(identifier: { handle: $handle }) { id } }`, { handle }).collectionByIdentifier.id;
  const colItem = (title, handle) => ({ title, type: 'COLLECTION', resourceId: col(handle) });
  const pageItem = (title, handle) => ({ title, type: 'PAGE', resourceId: pageIds[handle] });
  const wanted = {
    'main-menu': {
      title: 'Main menu',
      items: [
        { title: 'Shop', type: 'COLLECTION', resourceId: col('all'), items: [colItem('All sodas', 'sodas'), colItem('Citrus', 'citrus'), colItem('Berry', 'berry'), colItem('Mixed cases', 'bundles'), colItem('Merch', 'merch')] },
        { title: 'Build a case', type: 'HTTP', url: '/#pack' },
        pageItem('Our story', 'about'),
        pageItem('Where to buy', 'where-to-buy'),
        // Five top-level links fit beside the logo down to small laptops; Contact lives in the footer's Help menu.
        { title: 'Journal', type: 'BLOG', resourceId: blogId },
      ],
    },
    footer: {
      title: 'Shop',
      items: [colItem('All sodas', 'sodas'), colItem('Mixed cases', 'bundles'), pageItem('Subscriptions', 'about'), colItem('Merch', 'merch')],
    },
    help: {
      title: 'Help',
      items: [pageItem('Shipping', 'shipping'), pageItem('Where to buy', 'where-to-buy'), pageItem('FAQ', 'contact'), pageItem('Contact', 'contact'), pageItem('Wholesale', 'contact')],
    },
  };
  for (const [handle, m] of Object.entries(wanted)) {
    const found = menus.find((x) => x.handle === handle);
    if (found) {
      check(
        `menuUpdate ${handle}`,
        gql(
          `mutation Menu($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
            menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
          }`,
          { id: found.id, title: m.title, handle, items: m.items }
        ).menuUpdate
      );
      log(`menu ${handle}: updated`);
    } else {
      check(
        `menuCreate ${handle}`,
        gql(
          `mutation Menu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
            menuCreate(title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
          }`,
          { title: m.title, handle, items: m.items }
        ).menuCreate
      );
      log(`menu ${handle}: created`);
    }
  }
}

/* ---------- Run ---------- */

const media = [
  ...fs.readdirSync(path.join(ROOT, 'demo/images')).filter((f) => !f.startsWith('.')).map((f) => path.join(ROOT, 'demo/images', f)),
  ...fs.readdirSync(path.join(ROOT, 'demo/videos')).filter((f) => !f.startsWith('.')).map((f) => path.join(ROOT, 'demo/videos', f)),
];

try {
  const files = await uploadFiles(media);
  ensureMetafieldDefinitions();
  const publicationId = onlineStorePublication();
  const productIds = ensureProducts(files, publicationId);
  ensureCollections(productIds, publicationId);
  const pageIds = ensurePages();
  const blogId = ensureBlog(files);
  ensureMenus(pageIds, blogId);
  log(`done: ${calls} API calls`);
} catch (e) {
  console.error(e.stderr?.toString() || e.message);
  process.exit(1);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
