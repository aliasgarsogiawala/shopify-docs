#!/bin/zsh
# Builds dist/tangelo-theme-store-<version>.zip, the file to upload when submitting to the Shopify Theme Store.
# Theme Store themes can't be sold anywhere else, so this is the only build.
# Run: zsh scripts/package.sh
# The theme is read from a sibling checkout, ../shopify-theme-src; set THEME_DIR if it lives elsewhere.
# Set ALLOW_PLACEHOLDER_URLS=1 for a test build before the documentation and support pages are live.
set -euo pipefail

ROOT=${0:A:h:h}
THEME=${THEME_DIR:-$ROOT/../shopify-theme-src}
THEME=${THEME:A}
SCHEMA=$THEME/config/settings_schema.json
cd "$ROOT"
VERSION=$(python3 -c "import json, re, sys; print(json.loads(re.sub(r'/\*.*?\*/', '', open(sys.argv[1]).read(), flags=re.S))[0]['theme_version'])" "$SCHEMA")

# Reviewers open the documentation and support links, so a build that still has the placeholders can't be submitted.
PLACEHOLDERS=$(python3 -c "import json, re, sys; info = json.loads(re.sub(r'/\*.*?\*/', '', open(sys.argv[1]).read(), flags=re.S))[0]; print(' '.join(k for k in ('theme_documentation_url', 'theme_support_url') if 'example.com' in info.get(k, 'example.com')))" "$SCHEMA")
if [[ -n $PLACEHOLDERS && -z ${ALLOW_PLACEHOLDER_URLS:-} ]]; then
  print -u2 "Still a placeholder in $SCHEMA: $PLACEHOLDERS"
  print -u2 "Add the live URLs, or set ALLOW_PLACEHOLDER_URLS=1 for a test build."
  exit 1
fi

THEME_DIR=$THEME python3 scripts/build_docs.py

rm -rf dist

# Every preset on the Theme Store needs its own listing and demo store, so the zip ships the Tangelo preset only.
# Other presets can be added later as a theme update with a /listings folder.
mkdir -p dist/store
cp -R "$THEME"/{assets,config,layout,locales,sections,snippets,templates} dist/store/
python3 - dist/store/config/settings_data.json <<'PY'
import json, re, sys
path = sys.argv[1]
raw = open(path).read()
head = re.match(r'^\s*(/\*.*?\*/)?\s*', raw, re.S).group(0)
data = json.loads(raw[len(head):])
data['presets'] = {'Tangelo': data['presets']['Tangelo']}
data['current'] = 'Tangelo'
open(path, 'w').write(head + json.dumps(data, indent=2) + '\n')
PY
# Shopify CLI's packager keeps only the theme's own folders, at the root of the zip, the way Shopify expects them.
shopify theme package --path dist/store --no-color > /dev/null
mv dist/store/*.zip "dist/tangelo-theme-store-$VERSION.zip"
rm -rf dist/store

ls -l dist
unzip -l "dist/tangelo-theme-store-$VERSION.zip" | tail -1
