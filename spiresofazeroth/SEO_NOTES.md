# Spires of Azeroth - SEO + analytics notes (for the client agent)

Page: `https://thewowdb.com/spiresofazeroth/` (static, ad-free by owner rule: NO adsbygoogle loader, unlike addons/index.html).

## Head tags (copy verbatim)
```html
<title>Spires of Azeroth - Classic WoW Roguelike Deckbuilder | TheWoWDB</title>
<meta name="description" content="Free Classic WoW roguelike deckbuilder in your browser. Climb the spires of Azeroth with 9 classes, vanilla items and bosses. No download.">
<link rel="canonical" href="https://thewowdb.com/spiresofazeroth/">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TheWoWDB">
<meta property="og:url" content="https://thewowdb.com/spiresofazeroth/">
<meta property="og:title" content="Spires of Azeroth - Classic WoW Roguelike Deckbuilder">
<meta property="og:description" content="Build a deck from your class's vanilla spells, climb a spire in every zone, beat Ragnaros and C'Thun. Free, in your browser.">
<meta property="og:image" content="https://thewowdb.com/spiresofazeroth/og.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Spires of Azeroth: a tower spire above a spread of Classic WoW spell cards.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Spires of Azeroth - Classic WoW Roguelike Deckbuilder">
<meta name="twitter:description" content="Free browser deckbuilder built on vanilla WoW spells, items and bosses.">
<meta name="twitter:image" content="https://thewowdb.com/spiresofazeroth/og.jpg">
```
Description is 138 chars. The class count (9) must match `data/classes/index.json`; edit if it differs.
`og.jpg` (1200x630, spire + card spread) does not exist yet: the client agent must produce it from existing site art (do not hotlink Wowhead) or point og:image at an existing `/assets/` image.

## JSON-LD (VideoGame)
```html
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"VideoGame","name":"Spires of Azeroth",
 "description":"A free browser roguelike deckbuilder set in Classic World of Warcraft: pick a class, build a deck from vanilla spells, climb a spire in each zone and defeat the raid bosses.",
 "url":"https://thewowdb.com/spiresofazeroth/","genre":["Roguelike","Deck-building","Card game"],
 "gamePlatform":"Web browser","applicationCategory":"Game","operatingSystem":"Any (HTML5)",
 "playMode":"SinglePlayer","inLanguage":"en","isAccessibleForFree":true,
 "offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},
 "publisher":{"@type":"Organization","name":"TheWoWDB","url":"https://thewowdb.com/"},
 "isBasedOn":{"@type":"VideoGame","name":"World of Warcraft Classic","publisher":{"@type":"Organization","name":"Blizzard Entertainment"}}}
</script>
```
No aggregateRating (we collect none). Keep the footer credit line: World of Warcraft and all related assets are trademarks and copyrights of Blizzard Entertainment. Fan project, not affiliated with Blizzard.

## Analytics hook
The site uses GA4 via `/assets/wgf-gtag.js` (measurement id G-RMD2ZSN755, Consent Mode v2 region defaults; it defines `window.gtag` and the dataLayer queue itself). No other beacon system exists on static pages.
Load it exactly as addons/index.html does, in `<head>`:
```html
<script src="/assets/wgf-gtag.js?v=20260612" defer></script>
```
Do NOT add the adsbygoogle line that addons/index.html also carries.

Fire events through a guarded helper (gtag may be blocked; never throw):
```js
function track(name, params) { try { if (window.gtag) window.gtag('event', name, params); } catch (e) {} }
track('run_start', { class: classId, seed: seedStr, ascension: asc || 0 });
track('run_end',   { class: classId, act: actReached, victory: won ? 1 : 0, floor: floorReached });
```
Event names: `run_start` and `run_end` (params: class, act, victory; run_end also carries floor). Fire run_end once per run, on victory or defeat screen entry (not on page unload). Do not send gold/deck contents or any user identifier.

The admin balance panel also receives a first-party run-end event only after analytics consent is granted. It stores daily aggregates by build, class, difficulty, and broad talent-point band; it does not retain individual runs, player IDs, seeds, or decks.
