# Tank docs and tools

Everything around the Tank Shopify theme that isn't the theme itself.

- `docs/`: the merchant guide (`docs/index.html`), built from the theme's settings by `scripts/build_docs.py`. Host this folder at the theme's documentation URL.
- `demo/`: the demo store's content. Product, page and journal images, the press video, and the settings that are merged over the theme's templates for the demo store.
- `scripts/`
  - `seed-demo-store.mjs` fills a store with the demo products, collections, pages, journal posts and menus.
  - `push-demo-theme.mjs` uploads the theme to a store with the demo settings merged in.
  - `build_docs.py` rebuilds `docs/index.html`.
  - `package.sh` builds the Theme Store zip in `dist/`.
- `RELEASE_NOTES.md`: what changed in each theme version.

The scripts read the theme from a checkout of the theme repository next to this one, named `shopify-theme-src`. Set `THEME_DIR` to use a different folder.
