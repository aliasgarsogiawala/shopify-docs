"""Build docs/index.html for the Tank theme from its schemas.

Section and theme-setting references are generated from the theme files, so they stay in step with
the code. The guide text around them is written below. Run: python3 scripts/build_docs.py
The theme is read from a sibling checkout, ../shopify-theme-src; set THEME_DIR if it lives elsewhere.
"""
import html
import json
import os
import re
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEME = Path(os.environ.get("THEME_DIR", ROOT.parent / "shopify-theme-src")).resolve()
DOCS = ROOT / "docs"
FONTS = THEME / ".qa" / "preview" / "fonts"

SCHEMA_RE = re.compile(r"{%-?\s*schema\s*-?%}(.*?){%-?\s*endschema\s*-?%}", re.S)


def load_json(path):
    return json.loads(re.sub(r"/\*.*?\*/", "", path.read_text(), flags=re.S))


def esc(value):
    return html.escape(str(value), quote=True)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# What each section is for, in the merchant's words. Sections missing here fall back to their name.
SECTION_NOTES = {
    "tank-hero": "The signature slideshow. Each slide is a flavor: its color pours up from the bottom, the name fills the screen and the can drops into place. Up to six slides, with a switcher that fills like a glass while each slide plays.",
    "announcement-bar": "Rotating one-line messages above the header, with arrows.",
    "header": "Logo, menu, search, account and cart. Dropdown links to collections show that collection's products standing in a pour of its flavor color, which refills as visitors move between links. Can sit transparently over the first section.",
    "footer": "Menus, a short brand text, newsletter sign-up, social links and payment icons.",
    "marquee": "A moving band of short claims, optionally with small images between them.",
    "featured-collection": "A row of product cards from one collection, with quick add.",
    "featured-product": "One product with its buy form, built from blocks.",
    "ingredient-callouts": "A product image in the middle with ingredient callouts on either side, over a rising liquid level.",
    "scroll-story": "Chapters that scroll past a pinned image. The section takes each chapter's color scheme as it comes into view.",
    "comparison-table": "Your product against the usual alternative, row by row.",
    "pack-builder": "Lets shoppers fill a case with any mix of flavors and add it to the cart in one go.",
    "label-facts": "Big numbers in a ruled grid, like the side of a can.",
    "image-with-text": "An image beside a heading, text, checklist and button.",
    "promo-grid": "Tiles of mixed sizes for campaigns, each with its own color scheme and an optional corner badge.",
    "testimonials": "Quote cards with ratings, authors and an optional product link.",
    "social-gallery": "A strip of social posts with captions and a link to your profile.",
    "newsletter": "Email sign-up with an optional product image.",
    "faq": "Questions and answers in an accordion, with an optional image.",
    "logo-strip": "A row of stockist or press logos.",
    "rich-text": "Free-form heading, text, image and button blocks. The Poster heading size makes a full-width statement.",
    "collection-list": "Collection tiles.",
    "blog-posts": "The latest posts from a blog.",
    "video": "An uploaded video or a YouTube or Vimeo link, with the heading over it. Add an image to show while there is no video.",
    "custom-liquid": "Your own Liquid, HTML or app embed code.",
    "apps": "A slot for app blocks.",
    "cart-drawer": "The slide-out cart, with a free shipping meter and an order note.",
    "product-recommendations": "Related products, filled in by Shopify.",
    "main-product": "The product page: gallery with full-screen zoom and 3D models, the buy form (with a recipient form for gift cards) and blocks for everything else.",
    "image-banner": "A full-width image with a heading and buttons. Add more slides and it becomes a slideshow with arrows, dots and a pause button. Each slide can have its own mobile image.",
    "icons-with-text": "A row of icons with short headings, for claims like vegan, gluten free or recyclable. Use the built-in icons or upload your own.",
    "stockists": "Where to buy: a list of shops, cafés and markets with directions, hours and websites. Shoppers can search it and filter by region.",
    "product-quiz": "A short quiz that recommends a product. Each answer points to a product; the one picked most often is the shopper's match.",
    "recipe": "A recipe card with time, servings, an ingredient checklist, numbered steps and up to four products to buy. Can tell search engines it's a recipe.",
    "subscribe-save": "Explains your subscription offer in numbered steps, with perks and a button. The subscription itself comes from a subscription app.",
    "image-hotspots": "A photo with numbered dots. Each dot opens a product card, and the products can be listed beside the photo.",
    "age-verification": "A pop-up that asks visitors to confirm their age before they browse, for alcohol and other age-restricted products. A yes is remembered in their browser for the number of days you choose. It ships hidden in the footer group: show it there to turn it on.",
    "countdown": "A timer counting down to a date and time in your store's time zone, with a product or image beside it. Shows a message, or hides itself, when time runs out.",
    "recently-viewed": "The products a shopper looked at last, saved in their browser. Hidden until they've viewed one.",
    "product-card-fetch": "Used behind the scenes by Recently viewed to draw product cards. You don't need to add it anywhere.",
    "main-collection": "The collection grid with filters, sorting and a banner.",
}

SETTING_TYPES = {
    "checkbox": "Toggle",
    "range": "Slider",
    "select": "Choice",
    "radio": "Choice",
    "text": "Text",
    "textarea": "Text, multi-line",
    "richtext": "Rich text",
    "inline_richtext": "Rich text, one line",
    "html": "HTML",
    "liquid": "Liquid",
    "url": "Link",
    "image_picker": "Image",
    "video": "Video",
    "video_url": "Video link",
    "color": "Color",
    "color_background": "Background",
    "color_scheme": "Color scheme",
    "color_scheme_group": "Color schemes",
    "font_picker": "Font",
    "product": "Product",
    "product_list": "Products",
    "collection": "Collection",
    "collection_list": "Collections",
    "blog": "Blog",
    "article": "Blog post",
    "page": "Page",
    "link_list": "Menu",
    "number": "Number",
    "text_alignment": "Alignment",
}


def describe_type(setting):
    kind = SETTING_TYPES.get(setting["type"], setting["type"].replace("_", " ").capitalize())
    if setting["type"] == "range":
        unit = setting.get("unit", "")
        kind += f" {setting['min']}–{setting['max']}{unit}"
    if setting["type"] in ("select", "radio"):
        kind += ": " + ", ".join(o["label"] for o in setting.get("options", []))
    return kind


def describe_default(setting):
    if "default" not in setting:
        return ""
    value = setting["default"]
    if setting["type"] == "checkbox":
        return "On" if value else "Off"
    if setting["type"] in ("select", "radio"):
        for option in setting.get("options", []):
            if option["value"] == value:
                return option["label"]
    if setting["type"] == "range":
        return f"{value}{setting.get('unit', '')}"
    if setting["type"] == "color_scheme":
        return str(value).replace("scheme-", "Scheme ")
    text = re.sub(r"<[^>]+>", "", str(value))
    return text if len(text) <= 60 else text[:57] + "…"


def settings_table(settings):
    """Settings as a table; header and paragraph entries become group rows."""
    rows = []
    for s in settings:
        if s["type"] == "header":
            rows.append(f'<tr class="group"><th colspan="3" scope="colgroup">{esc(s["content"])}</th></tr>')
            continue
        if s["type"] == "paragraph":
            text = re.sub(r"<[^>]+>", "", s["content"])
            rows.append(f'<tr class="note"><td colspan="3">{esc(text)}</td></tr>')
            continue
        info = f'<span class="info">{esc(s["info"])}</span>' if s.get("info") else ""
        default = describe_default(s)
        default = f'<span class="default">Default: {esc(default)}</span>' if default else ""
        rows.append(
            "<tr>"
            f'<th scope="row">{esc(s.get("label", s.get("id", "")))}</th>'
            f"<td>{esc(describe_type(s))}</td>"
            f"<td>{info}{default}</td>"
            "</tr>"
        )
    if not rows:
        return '<p class="muted">No settings.</p>'
    return (
        '<div class="table-wrap"><table class="settings">'
        '<thead><tr><th scope="col">Setting</th><th scope="col">Type</th><th scope="col">Notes</th></tr></thead>'
        f"<tbody>{''.join(rows)}</tbody></table></div>"
    )


def section_entries():
    entries = []
    for path in sorted((THEME / "sections").glob("*.liquid")):
        match = SCHEMA_RE.search(path.read_text())
        if not match:
            continue
        schema = json.loads(match.group(1))
        entries.append((path.stem, schema))
    return entries


def render_section(handle, schema):
    name = schema.get("name", handle)
    where = "Add it from <em>Add section</em>." if schema.get("presets") else "Part of a page template; it can't be added twice."
    if handle in ("header", "footer", "announcement-bar", "cart-drawer"):
        where = "Lives in the header or footer group."
    elif schema.get("enabled_on", {}).get("groups") == ["footer"]:
        where = "Add it to the footer group from <em>Add section</em>."
    note = SECTION_NOTES.get(handle, "")
    blocks = schema.get("blocks", [])
    block_html = []
    for block in blocks:
        if block["type"] == "@app":
            block_html.append('<p class="block-app">Accepts app blocks.</p>')
            continue
        limit = f' <span class="muted">(up to {block["limit"]})</span>' if block.get("limit") else ""
        block_html.append(
            f'<details class="block"><summary>{esc(block.get("name", block["type"]))}{limit}</summary>'
            f'{settings_table(block.get("settings", []))}</details>'
        )
    max_blocks = f" Up to {schema['max_blocks']} blocks." if schema.get("max_blocks") else ""
    blocks_part = ""
    if block_html:
        blocks_part = f'<h4>Blocks</h4><p class="muted">{max_blocks.strip()}</p>' + "".join(block_html)
    return (
        f'<section class="ref" id="section-{handle}" aria-labelledby="section-{handle}-title">'
        f'<h3 id="section-{handle}-title">{esc(name)}</h3>'
        f'<p class="file"><code>sections/{handle}.liquid</code> · {where}</p>'
        + (f"<p>{esc(note)}</p>" if note else "")
        + f"<h4>Settings</h4>{settings_table(schema.get('settings', []))}"
        + blocks_part
        + "</section>"
    )


def theme_settings():
    schema = load_json(THEME / "config" / "settings_schema.json")
    info = schema[0]
    groups = [g for g in schema[1:]]
    return info, groups


def build():
    info, groups = theme_settings()
    sections = section_entries()
    data = load_json(THEME / "config" / "settings_data.json")
    # The Theme Store zip ships the current preset only (see scripts/package.sh), so that's what the guide describes.
    current = data.get("current")
    styles = [current] if isinstance(current, str) else list(data.get("presets", {}).keys())
    if len(styles) == 1:
        styles_sentence = f"The theme ships with one style, <strong>{esc(styles[0])}</strong>."
    else:
        styles_sentence = f"The theme ships with {len(styles)} styles: " + " and ".join(f"<strong>{esc(s)}</strong>" for s in styles) + "."

    store_sections = [(h, s) for h, s in sections if s.get("presets")]
    template_sections = [(h, s) for h, s in sections if not s.get("presets")]

    nav_sections = "".join(
        f'<li><a href="#section-{h}">{esc(s.get("name", h))}</a></li>' for h, s in store_sections
    )
    nav_settings = "".join(f'<li><a href="#settings-{slug(g["name"])}">{esc(g["name"])}</a></li>' for g in groups)

    settings_html = "".join(
        f'<section class="ref" id="settings-{slug(g["name"])}" aria-labelledby="settings-{slug(g["name"])}-title">'
        f'<h3 id="settings-{slug(g["name"])}-title">{esc(g["name"])}</h3>{settings_table(g.get("settings", []))}</section>'
        for g in groups
    )
    store_html = "".join(render_section(h, s) for h, s in store_sections)
    template_html = "".join(render_section(h, s) for h, s in template_sections)
    templates = sorted(
        str(p.relative_to(THEME / "templates")) for p in (THEME / "templates").rglob("*") if p.is_file()
    )
    template_list = "".join(f"<li><code>{esc(t)}</code></li>" for t in templates)

    page = TEMPLATE.format(
        name=esc(info["theme_name"]),
        version=esc(info["theme_version"]),
        author=esc(info["theme_author"]),
        support=esc(info["theme_support_url"]),
        built=date.today().isoformat(),
        styles_sentence=styles_sentence,
        nav_sections=nav_sections,
        nav_settings=nav_settings,
        store_sections=store_html,
        template_sections=template_html,
        settings=settings_html,
        templates=template_list,
        section_count=len(store_sections),
    )
    DOCS.mkdir(exist_ok=True)
    (DOCS / "assets").mkdir(exist_ok=True)
    for font in ("BigShoulders-normal.woff2", "InstrumentSans-normal.woff2"):
        if (FONTS / font).exists():
            shutil.copy(FONTS / font, DOCS / "assets" / font)
    (DOCS / "index.html").write_text(page)
    print(f"docs/index.html: {len(store_sections)} sections, {len(template_sections)} template sections, {len(groups)} setting groups")


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} theme documentation</title>
<meta name="description" content="How to install, set up and customize the {name} Shopify theme.">
<style>
@font-face {{ font-family: 'Big Shoulders'; font-weight: 100 900; font-display: swap; src: url(assets/BigShoulders-normal.woff2) format('woff2'); }}
@font-face {{ font-family: 'Instrument Sans'; font-weight: 400 700; font-display: swap; src: url(assets/InstrumentSans-normal.woff2) format('woff2'); }}
:root {{
  --paper: #ffffff;
  --ink: #000000;
  --muted: #4d4d4d;
  --rule: #d9d9d9;
  --tint: #f1f3ee;
  --accent: #ff4a17;
  --accent-ink: #b52b00;
  --display: 'Big Shoulders', 'Arial Narrow', Impact, sans-serif;
  --body: 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 12' preserveAspectRatio='none'%3E%3Cpath d='M0 6 C 20 0 40 0 60 6 S 100 12 120 6 V12 H0Z'/%3E%3C/svg%3E");
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{ --paper: #0d0d0d; --ink: #f4f4f1; --muted: #b3b3ad; --rule: #2e2e2c; --tint: #1a1a18; --accent-ink: #ff7a52; }}
}}
:root[data-theme="dark"] {{ --paper: #0d0d0d; --ink: #f4f4f1; --muted: #b3b3ad; --rule: #2e2e2c; --tint: #1a1a18; --accent-ink: #ff7a52; }}
* {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; scroll-padding-top: 24px; }}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
body {{ margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 var(--body); }}
a {{ color: inherit; text-decoration-thickness: 2px; text-underline-offset: 3px; }}
a:hover {{ color: var(--accent-ink); }}
:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 2px; }}
code {{ font: 0.875em/1.4 var(--mono); padding: 0.1em 0.35em; background: var(--tint); }}
.skip {{ position: absolute; left: -999px; }}
.skip:focus {{ left: 16px; top: 16px; z-index: 9; padding: 8px 12px; background: var(--ink); color: var(--paper); }}
.layout {{ display: grid; grid-template-columns: 280px minmax(0, 1fr); max-width: 1320px; margin: 0 auto; }}
nav.toc {{ position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 32px 24px 48px; border-right: 1px solid var(--rule); font-size: 0.9375rem; }}
.toc .brand {{ display: block; margin-bottom: 4px; font: 900 2.5rem/0.9 var(--display); text-transform: uppercase; text-decoration: none; }}
.toc .ver {{ margin: 0 0 28px; color: var(--muted); font-size: 0.875rem; }}
.toc h2 {{ margin: 24px 0 8px; font: 800 1.125rem/1 var(--display); text-transform: uppercase; letter-spacing: 0.01em; }}
.toc ul {{ margin: 0; padding: 0; list-style: none; }}
.toc li a {{ display: block; padding: 4px 0; text-decoration: none; color: var(--muted); }}
.toc li a:hover {{ color: var(--ink); }}
main {{ padding: 48px clamp(20px, 5vw, 72px) 120px; min-width: 0; }}
.intro {{ max-width: 68ch; }}
h1 {{ margin: 0 0 20px; font: 900 clamp(64px, 9vw, 132px)/0.88 var(--display); text-transform: uppercase; }}
h1::after {{ content: ''; display: block; width: 96px; height: 14px; margin-top: 22px; background: var(--accent); -webkit-mask: var(--wave) 0 0 / 48px 100% repeat-x; mask: var(--wave) 0 0 / 48px 100% repeat-x; }}
h2 {{ margin: 88px 0 16px; font: 900 clamp(40px, 5vw, 64px)/0.9 var(--display); text-transform: uppercase; }}
h3 {{ margin: 0 0 6px; font: 800 1.75rem/1 var(--display); text-transform: uppercase; }}
h4 {{ margin: 22px 0 8px; font-size: 0.9375rem; }}
p, ol, ul {{ max-width: 68ch; }}
.lead {{ font-size: 1.1875rem; }}
.muted {{ color: var(--muted); }}
.steps li {{ margin-bottom: 10px; }}
.ref {{ padding: 32px 0; border-top: 2px solid var(--ink); }}
.ref .file {{ margin: 0 0 12px; color: var(--muted); font-size: 0.9375rem; }}
.table-wrap {{ overflow-x: auto; }}
table {{ width: 100%; border-collapse: collapse; font-size: 0.9375rem; }}
th, td {{ padding: 9px 12px 9px 0; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: top; }}
thead th {{ border-bottom: 2px solid var(--ink); font-size: 0.8125rem; }}
tbody th {{ font-weight: 600; width: 30%; }}
td:nth-child(2) {{ width: 28%; }}
tr.group th {{ padding-top: 18px; font: 800 1.0625rem/1 var(--display); text-transform: uppercase; }}
tr.note td {{ color: var(--muted); }}
.info {{ display: block; }}
.default {{ display: block; color: var(--muted); }}
details.block {{ border-bottom: 1px solid var(--rule); }}
details.block summary {{ cursor: pointer; padding: 10px 0; font-weight: 600; }}
details.block[open] summary {{ margin-bottom: 4px; }}
.block-app {{ margin: 8px 0; color: var(--muted); }}
.callout {{ max-width: 68ch; padding: 18px 20px; background: var(--tint); }}
.callout p {{ margin: 0; }}
.faq {{ max-width: 68ch; margin: 0; }}
.faq dt {{ margin-top: 22px; font-weight: 600; }}
.faq dd {{ margin: 4px 0 0; }}
.meta-table td:first-child {{ white-space: nowrap; }}
.columns {{ columns: 2 220px; column-gap: 32px; padding-left: 20px; }}
.columns li {{ break-inside: avoid; }}
@media (max-width: 900px) {{
  .layout {{ grid-template-columns: 1fr; }}
  nav.toc {{ position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--rule); }}
  .toc .lists {{ display: none; }}
}}
</style>
</head>
<body>
<a class="skip" href="#content">Skip to the guide</a>
<div class="layout">
<nav class="toc" aria-label="Contents">
  <a class="brand" href="#top">{name}</a>
  <p class="ver">Version {version}</p>
  <h2>Guide</h2>
  <ul>
    <li><a href="#install">Install</a></li>
    <li><a href="#styles">Theme styles</a></li>
    <li><a href="#setup">Set up a store like the demo</a></li>
    <li><a href="#metafields">Product metafields</a></li>
    <li><a href="#templates">Templates</a></li>
    <li><a href="#languages">Languages</a></li>
    <li><a href="#accessibility">Accessibility and motion</a></li>
    <li><a href="#faq">FAQ</a></li>
    <li><a href="#credits">Credits and licenses</a></li>
    <li><a href="#changelog">Changelog</a></li>
    <li><a href="#support">Support</a></li>
    <li><a href="#customization">Customization</a></li>
  </ul>
  <div class="lists">
    <h2>Sections</h2>
    <ul>{nav_sections}</ul>
    <h2>Theme settings</h2>
    <ul>{nav_settings}</ul>
  </div>
</nav>
<main id="content">
<div class="intro" id="top">
  <h1>{name}</h1>
  <p class="lead">{name} is a Shopify theme for drinks brands that sell by flavor. Every flavor gets its own color, and the store pours from one to the next: in the hero, in the cards and in the cart.</p>
  <p class="muted">Version {version} by {author}. This guide was generated from the theme files on {built}.</p>
</div>

<h2 id="install">Install</h2>
<ol class="steps">
  <li>In your Shopify admin, open <strong>Online Store › Themes</strong>.</li>
  <li>Under <strong>Theme library</strong>, choose <strong>Add theme › Upload zip file</strong> and upload the theme zip file. Don't unzip it first. If you added the theme from the Shopify Theme Store, it is already in your theme library.</li>
  <li>Choose <strong>Customize</strong> on the new theme to start editing. Publish it when you're ready.</li>
</ol>
<div class="callout"><p>{name} is an Online Store 2.0 theme and works on every Shopify plan. Sections can be added to any page, and the theme supports app blocks, filters, selling plans, markets and the Section Rendering API.</p></div>

<h2 id="styles">Theme styles</h2>
<p>{styles_sentence} A style sets the color schemes, fonts and button shape in one go. Change any of them under <strong>Customize › Theme settings</strong>.</p>
<p>Color schemes do most of the work. Each flavor on the demo has its own scheme, and every section, slide, tile and quote card can pick one. Edit them under <strong>Theme settings › Colors</strong>.</p>

<h2 id="setup">Set up a store like the demo</h2>
<ol class="steps">
  <li><strong>Products.</strong> Give each flavor a clear product image on a transparent background (a PNG cut-out). The hero, cards and pack builder are designed around cut-outs.</li>
  <li><strong>Flavor colors.</strong> Add the <code>custom.flavor_color</code> metafield (below) to each product, and to each collection. Cards, the cart and the pack builder use the product color; the header dropdown and collection pages use the collection color.</li>
  <li><strong>Collections.</strong> Create a collection of your flavors for the featured collection and the pack builder, and use the collection banner image for collection pages.</li>
  <li><strong>Pages.</strong> Create an About page and a Contact page and assign the <code>page.about</code> and <code>page.contact</code> templates to them.</li>
  <li><strong>Blog.</strong> Create a blog (the demo calls it Journal) for the blog posts section.</li>
  <li><strong>Menus.</strong> Under <strong>Content › Menus</strong>, set up a main menu and a footer menu, then pick them in the header and footer sections. Give the main menu's top link (Shop on the demo) links to your collections: its dropdown shows each collection's first products. Links to pages or blogs show the header's <em>Image for other links</em>.</li>
  <li><strong>Reviews.</strong> Install any review app that writes Shopify's standard rating metafields. Stars then appear on cards and product pages automatically.</li>
  <li><strong>Customer accounts.</strong> The account icon in the header opens Shopify's account sheet, where customers sign in and find their orders without leaving the page. It shows when customer accounts are turned on under <strong>Settings › Customer accounts</strong>. Choose the links in the sheet under <strong>Header › Customer account › Account menu</strong>; Shopify creates a menu called Customer account main menu for it.</li>
  <li><strong>Complementary products.</strong> The product page has a Pairs well with section for products that go with the one being viewed. Choose them in Shopify's Search &amp; Discovery app under <strong>Product recommendations</strong>. The section stays hidden until a product has some.</li>
</ol>

<h2 id="metafields">Product metafields</h2>
<p>Create these under <strong>Settings › Custom data › Products</strong>. All of them are optional; the theme falls back to sensible defaults.</p>
<div class="table-wrap"><table class="meta-table">
<thead><tr><th scope="col">Metafield</th><th scope="col">Type</th><th scope="col">Used for</th></tr></thead>
<tbody>
<tr><td><code>custom.flavor_color</code></td><td>Color</td><td>The flavor's color on product cards, in the cart, in search results and in the pack builder. In the header dropdown, the pour takes this color while a visitor points at the product.</td></tr>
<tr><td><code>custom.short_name</code></td><td>Single line text</td><td>The big name printed behind the product image on cards and in the featured product section, for example Blood Orange when the product is called Blood Orange Prebiotic Soda. The product title is used when it's empty.</td></tr>
<tr><td><code>custom.subtitle</code></td><td>Single line text</td><td>A one-line description under the product name on cards and the product page. Cards show the product type when it's empty.</td></tr>
<tr><td><code>custom.nutrition</code></td><td>Multi-line text</td><td>The nutrition table on the product page. One fact per line, written as <code>Name: Value</code>. When it's empty, the block's own text is used.</td></tr>
<tr><td><code>reviews.rating</code>, <code>reviews.rating_count</code></td><td>Rating, integer</td><td>Star ratings and review counts. Review apps fill these in for you.</td></tr>
</tbody></table></div>

<h3>Collection metafields</h3>
<p>Create this under <strong>Settings › Custom data › Collections</strong>. It's optional too.</p>
<div class="table-wrap"><table class="meta-table">
<thead><tr><th scope="col">Metafield</th><th scope="col">Type</th><th scope="col">Used for</th></tr></thead>
<tbody>
<tr><td><code>custom.flavor_color</code></td><td>Color</td><td>The pour behind the collection's products in the header dropdown, the collection page banner and the collection's tile on the collections list. The dropdown uses its color scheme's accent when it's empty.</td></tr>
</tbody></table></div>

<h2 id="sections">Sections</h2>
<p>{section_count} sections can be added to any page from <em>Add section</em>. The settings below are exactly what you'll see in the theme editor.</p>
{store_sections}

<h2 id="page-sections">Page sections</h2>
<p>These sections belong to a specific template, such as the product page or the cart, and are edited there.</p>
{template_sections}

<h2 id="theme-settings">Theme settings</h2>
<p>Global settings live under <strong>Customize › Theme settings</strong>.</p>
{settings}

<h2 id="templates">Templates</h2>
<p>Templates are JSON, so their sections can be rearranged in the editor. You can create alternative product, collection and page templates from <strong>Customize › Templates</strong>.</p>
<ul class="columns">{templates}</ul>

<h2 id="languages">Languages</h2>
<p>The storefront text is translated into English, French, German, Spanish, Italian, Dutch, Brazilian Portuguese, Japanese and Hindi. To sell in more than one language, add the languages under <strong>Settings › Languages</strong> and publish them. Visitors then switch language and country from the globe in the header, or from the menu on phones. Both selectors can be turned off in the header section, and the footer can show its own. Text you type in the theme editor, such as headings and buttons, is translated under <strong>Settings › Languages › Localize</strong> or with a translation app.</p>

<h2 id="accessibility">Accessibility and motion</h2>
<ul>
  <li>Everything works with a keyboard. The hero switcher moves with the arrow keys, and drawers trap and return focus.</li>
  <li>Autoplaying slides pause on hover and focus, and have a pause button. Every animation is switched off for visitors who ask for reduced motion, and the <strong>Motion</strong> settings let you turn effects off store-wide.</li>
  <li>Images take the alt text you set in Shopify. Decorative images, such as the floating fruit in the hero, are hidden from screen readers.</li>
  <li>Color schemes are yours to choose, so check text contrast when you change them. Aim for 4.5:1 for body text.</li>
</ul>

<h2 id="faq">FAQ</h2>
<dl class="faq">
  <dt>Why doesn't the free shipping bar show in the cart?</dt>
  <dd>Check <strong>Theme settings › Cart › Free shipping threshold</strong>. The bar is hidden when it's empty, and for shoppers using a currency other than your store's, because the threshold is set in your store's currency. The bar only shows progress; set up the free shipping rate itself under <strong>Settings › Shipping and delivery</strong>.</dd>
  <dt>How do I give each product its own color?</dt>
  <dd>Add the <code>custom.flavor_color</code> metafield described above. Products without it use the card background of the section's color scheme.</dd>
  <dt>How do I show different nutrition facts on each product?</dt>
  <dd>Add the <code>custom.nutrition</code> metafield and fill it in on each product. The nutrition block on the product page shows it, and hides itself on products where it's empty. For the label facts section, connect each value to a metafield with the dynamic source button in the theme editor.</dd>
  <dt>Where do subscriptions come from?</dt>
  <dd>From a subscription app. Once an app adds selling plans to a product, the product page shows the purchase options. The Subscribe and save section only explains your offer.</dd>
  <dt>Can I use my own product images in the hero?</dt>
  <dd>Yes. Upload a cut-out under each slide's <strong>Product cut-out</strong> setting. The built-in can artwork is only used until you do.</dd>
  <dt>Does the store work without JavaScript?</dt>
  <dd>Yes. The menu opens, the product page shows a plain variant list, the cart page has an Update cart button, and the language and country selectors have an Update button.</dd>
  <dt>How do I translate my own text?</dt>
  <dd>The theme's built-in text is already translated. For your products, pages and section text, use Shopify's Translate &amp; Adapt app.</dd>
  <dt>How do I update the theme?</dt>
  <dd>When a new version is out, Shopify shows it in your theme library. Updating adds a new copy of the theme with your settings and content carried over, so you can check it before you publish. Code you've edited yourself isn't carried over.</dd>
</dl>

<h2 id="credits">Credits and licenses</h2>
<ul>
  <li><strong>Big Shoulders</strong> by Patric King and <strong>Instrument Sans</strong> by Rodrigo Fuenzalida and Jordan Egstad. Both are licensed under the SIL Open Font License 1.1 and served by Shopify's font library, so nothing extra needs to be installed. This guide bundles the Latin subsets under the same license.</li>
  <li>Icons were drawn for {name}.</li>
  <li>The product renders, fruit and photography on the demo store were made for {name} in Blender. They aren't part of the theme; it ships unbranded can and fruit artwork for the hero, and neutral placeholders elsewhere, until you add your own images.</li>
  <li>The stockist logos on the demo About page are fictional and for preview only.</li>
</ul>

<h2 id="changelog">Changelog</h2>
<h3>{version}</h3>
<p class="muted">First release.</p>

<h2 id="support">Support</h2>
<p>Questions and bug reports: <a href="{support}">{support}</a>. Please include your store's URL, the theme version ({version}) and, if you can, a screenshot or screen recording.</p>
<p>Support covers:</p>
<ul>
  <li>Setting up and using the theme's sections, blocks and settings.</li>
  <li>Bugs in the theme's own code. We fix confirmed bugs in a theme update.</li>
</ul>
<p>Support doesn't cover changes to the theme's code, third-party apps and their code, or design work beyond what the settings offer.</p>

<h2 id="customization">Customization</h2>
<p>We don't take on custom work. If you'd like changes the settings don't offer, hire a Shopify Partner from the Shopify Partner Directory. Edits to the theme's code aren't covered by support, and they aren't carried over when you update the theme, so keep a copy of your changes.</p>
</main>
</div>
</body>
</html>
"""


if __name__ == "__main__":
    build()
