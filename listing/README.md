# Theme Store listing: Tank preset

Copy for the preset's listing form in the Partner Dashboard (Themes, then Tank, then the listing for the Tank preset). The theme zip ships one preset, so this is the only listing. Limits are from [Theme Store listing page](https://shopify.dev/docs/storefronts/themes/store/review-process/listings).

## Demo store

- URL: https://tangelo-demo-0e5pc4tq.myshopify.com
- Password: the storefront password from Online Store, then Preferences. It isn't written here because this repository is public.

## Tagline

67 of 70 characters:

> Made for drink brands that sell by the flavor, the can and the case

## Industry and catalog size

- Industry: Food and drink
- Catalog size: Some (11-100+). The demo store has 17 products: 5 sodas, 5 single cans for the case builder, a mixed case and 6 merch items. The demo has to match the size the preset is tagged with.

## Screenshots

| File | Size | Alt text |
| --- | --- | --- |
| `desktop-home.png` | 2000 x 2496 | Tank home page on desktop: a Blood Orange can over the flavor name in huge black letters on orange, with blood orange slices, the shop buttons and the flavor switcher |
| `mobile-home.png` | 750 x 1334 | Tank home page on a phone: the Blood Orange slide with the can, the flavor name, a short description, two buttons and the flavor switcher |

## Key highlights

Images are 1600 x 1200. Titles are 30 characters at most and descriptions 140.

1. `highlight-hero.png`
   - Title: Flavor-by-flavor hero
   - Description: Every flavor gets its own slide, color and can, so shoppers can flip through the whole range before they scroll.
2. `highlight-pack.png`
   - Title: Build-your-own case
   - Description: Shoppers fill a 6, 12 or 24-can case one flavor at a time and add the whole mix to the cart in one tap.
3. `highlight-story.png`
   - Title: Grove-to-can storytelling
   - Description: Pinned, scrolling chapters walk shoppers from ingredient to finished can, each with its own photo and color.

## Metadata description

> Tank is a bold, colorful theme for drink and snack brands, with a flavor-by-flavor hero, a build-your-own case, subscriptions and nutrition panels.

## Theme price

Choose from $100 to $500 USD, in steps of $10. Suggested: $300.

## Features

Tick only these. Each one is in the theme without extra code:

- Image display: high resolution images, image galleries, image hotspot, image zoom, slideshow
- Product details: color swatches, ingredients/nutritional information, product options, product videos, shipping/delivery information
- Visual effects: animation
- Conversion optimization: cross-selling (complete the look), recently viewed, recommended products, stock counter, store locator
- Promotional content: blogs, in-menu promos, product badges, promo banners, promo tiles
- Trust/social proof: age verifier, FAQ page, product reviews
- Carts and checkout: cart notes, in-store pickups, quick buy, slide-out cart, sticky cart
- Navigation and filtering: enhanced search, mega menu, product filtering and sorting, sticky header

## Merchant support

- Documentation: https://techtics.in/tank/docs
- Support: https://techtics.in/tank/support

## Testing instructions

> The storefront password is in the password field of this form. Start on the home page: use the flavor switcher in the hero, then scroll to the pinned story, the flavor finder and the case builder, which fills a 6, 12 or 24-can case and adds it to the cart. Open Blood Orange to see the flavor colors, nutrition panel and sticky buy bar. The subscription picker only shows on products with selling plans, which need an app, so it isn't on this demo store. The About page has image hotspots with products, and Where to buy has the stockist search. Checkout uses the test payment gateway.

## Theme review notes

Add a line about your own experience building themes, then:

> Tank is built for drink and snack brands that sell a small range by flavor, by the can and by the case. Each flavor carries its own color through the hero, product page and cards, so a small catalog feels big. The case builder and subscriptions raise order value, and nutrition panels answer the questions these shoppers ask before they buy.

## Refreshing the images

The images come from the live demo store, so retake them after the demo changes. `scripts/capture-listing.mjs` logs in with the storefront password and saves all five here:

```
node scripts/capture-listing.mjs listing <storefront password>
```
