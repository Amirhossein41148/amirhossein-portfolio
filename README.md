# AMIRHOSSEIN.dev — Cyberpunk 3D Portfolio

A walkable neon city, rendered in real time with Three.js. You are not scrolling a
page — you are standing in a plaza, and the sections of the portfolio are glowing
pillars you walk up to. Gallery rings behind two of the pillars hold card stands
you can walk around and open full size.

Live: `https://USERNAME.github.io/REPOSITORY/`
(replace with your own once GitHub Pages is enabled)

---

## What it actually is

Plain **vanilla JavaScript** — no framework, no bundler, no build step, no
transpiler. Five global scripts and one vendored copy of Three.js, loaded with
ordinary `<script>` tags in dependency order. The site is a static folder: open
`index.html` and it runs.

| | |
|---|---|
| Rendering | Three.js **r128** (vendored, `vendor/three.min.js`) |
| Post-processing | EffectComposer + UnrealBloom, RGB-shift, film grain (vendored) |
| Artwork | Canvas2D, drawn procedurally at runtime |
| Audio | Web Audio API, synthesised at runtime |
| UI | Hand-written CSS, custom properties for theming |
| Dependencies at runtime | **none** |
| Dependencies at build | **none — there is no build** |
| npm | dev-only: `jsdom` + `@napi-rs/canvas` for the test suite |

**There is no Web3, no wallet, no blockchain code, and no backend.** If you were
told otherwise, that was wrong — I searched for it. See *Security* below.

---

## Features

- **Walkable 3D city.** WASD + mouse-look with pointer lock on desktop; analogue
  joystick + drag-to-look on touch. Head bob, sprint, FOV kick, invisible bounds.
- **Zone pillars.** Walk into one and its panel opens by itself. Keys `1`–`5`
  warp between them.
- **Card galleries.** Anime and game cards stand on pedestals in rings, each
  billboarding to face you so text is never mirrored.
- **Card lightbox.** Tap or click any card — in a panel or out in the ring — and
  it flies to the centre of the screen at full size with a glitch burst, then
  flies back to exactly where it came from.
- **Procedural artwork.** Every card has hand-coded Canvas2D art (chibi Guts, the
  Möwe glider, the CS2 crosshair…). It is the fallback whenever a photo is
  missing, so a card is never blank and nothing can 404.
- **Your own photos.** Drop images into `assets/` and they replace the drawn art.
- **Generated soundtrack.** A synthwave loop built from oscillators and filters —
  no audio file, nothing copyrighted, zero bytes downloaded.
- **Quality tiers chosen by capability, not user agent.** The GPU is asked what
  it can take, and particle counts, light budget, bloom resolution and pixel
  ratio follow.
- **Live minimap** with tower footprints, gallery rings and a view cone.
- **Boot guard.** Any failure — no WebGL, a missing folder, a shader that will
  not link — produces a readable on-screen report instead of a black screen.

---

## Running it locally

No install and no build are required to *view* the site. Any static server works:

```bash
# Python (present on most systems)
python -m http.server 8080
# then open http://localhost:8080

# or, via npm
npm start          # runs the same python server on :8080
```

`file://` also works — the site is designed for it, which is why the photos are
baked (see below) — but a server is closer to production and avoids browser
file-origin restrictions.

Installing the dev dependencies is only needed to run the tests or re-bake photos:

```bash
npm ci             # exact versions from package-lock.json
npm test           # full suite, 13 runs across 7 simulated device profiles
```

### URL switches

| | |
|---|---|
| `?mobile=1` / `?mobile=0` | force the touch or desktop UI |
| `?fx=low` … `?fx=ultra` | force a quality tier |

---

## Adding your own photos

Pictures live in `assets/`. Filenames must match the `img:` values in
`js/data.js`:

```
assets/profile.jpg          500x500   your avatar
assets/anime/berserk.jpg    600x900   2:3 poster
assets/anime/mushoku.jpg    600x900
assets/anime/ponyo.jpg      600x900
assets/anime/nausicaa.jpg   600x900
assets/anime/marnie.jpg     600x900
assets/games/roblox.jpg     600x800   3:4 card
assets/games/cs2.jpg        600x800
assets/games/undertale.jpg  600x800
assets/games/deltarune.jpg  600x800
assets/games/mlbb.jpg       600x800
```

Sizes are targets, not limits — anything larger is centre-cropped to the ratio.
After adding or replacing a picture, run:

```bash
npm run photos:bake
```

**Why the bake step is not optional for the 3D stands.** A photo loaded from a
`file://` URL taints any canvas it is drawn into, and WebGL refuses a tainted
canvas — `texImage2D` throws `SecurityError`, on both the raw `<img>` and the
canvas route. No HTTP header can fix a `file://` URL. So the flat cards in the
panels can show your photo directly (display never needs pixel readback), but the
textured stands in the 3D world cannot. `npm run photos:bake` re-encodes each
picture into `js/photos.js` as a `data:` URI, which counts as same-origin and
uploads to the GPU cleanly — from `file://` and from a server, on desktop and on
Android alike. `assets/` remains the source of truth; `js/photos.js` is
generated and should not be hand-edited.

---

## Project structure

```
index.html            markup, boot guard, script tags in dependency order
css/style.css         all styling; palette and layout tokens in :root
js/data.js            ALL CONTENT — bio, skills, cards, zones, photo paths
js/photos.js          GENERATED by npm run photos:bake — photos as data URIs
js/posters.js         procedural card art + the image loader with fallback
js/world.js           Three.js scene, GPU probe, quality tiers, controller
js/lightbox.js        the card zoom, its FLIP flight and glitch burst
js/ui.js              panels, HUD, minimap, mobile joystick and look pad
js/audio.js           the generated synthwave soundtrack (Web Audio)
js/main.js            boot sequence, input wiring, render loop
vendor/               Three.js r128 + 5 post-processing passes, all offline
assets/               your pictures (source of truth for the bake)
test/                 the test suite and the offline render/bake tools
```

Editing content means editing `js/data.js` — nothing else. Adding an entry to
`DATA.anime` or `DATA.games` creates the panel card and the 3D stand, and the
gallery ring re-spaces itself.

---

## Controls

**Desktop** — click to enter, `W A S D` walk, mouse looks, `Shift` sprints,
`1`–`5` warp, click a card to open it, `B` toggles effects, `M` toggles music,
`H` shows help, `Esc` releases the mouse then closes.

**Touch** — left joystick walks (further = faster), `RUN` toggles sprint, drag
anywhere to look, tap a card to open it, double-tap to open/close a panel.

---

## Tests

`npm test` runs 13 headless suites — no browser needed, jsdom plus a fake WebGL
context. They exist because this project has repeatedly been broken by things
that are invisible on a developer's desktop.

| | |
|---|---|
| `npm run test:dom` | DOM assembly, card sizes, photo wiring, world graph, movement, HUD |
| `npm run test:mobile` | the same, with a touch user agent and coarse pointer |
| `npm run test:weak` / `test:mid` | a GPU reporting 256 / 320 fragment uniform vectors |
| `npm run test:onectx` | a WebView that hands out exactly one WebGL context |
| `npm run test:nogl` | no WebGL at all — the failure must be *reported*, not silent |
| `npm run test:three` | boots against the real vendored Three.js |
| `npm run test:standalone` | builds the single-file bundle and boots it from `file://` |
| `npm run test:orphan` | `index.html` alone with no `css/`, `js/`, `vendor/` |
| `npm run test:hittest` | touch z-order: buttons must beat the full-screen look pad |
| `npm run test:lightbox` | the card zoom, and that a card canvas is never lost |

Offline tools: `npm run posters` renders every card to PNG, `npm run minimap`
renders the minimap at all breakpoints, `npm run photos` proves the cover-crop,
`npm run bundle` produces a single self-contained `.html`.

---

## Deployment

The repository *is* the website. No build, no CI, no output directory.

**GitHub Pages:** push to `main`, then Settings → Pages → Source: *Deploy from a
branch* → `main` / `/ (root)`.

Every path in the project is **relative** (`css/style.css`, `js/main.js`,
`assets/anime/berserk.jpg`) — there is not one root-relative `/…` reference — so
the site works unchanged at a repository subpath like
`https://USERNAME.github.io/REPOSITORY/`, at a custom domain, or from a local
folder. The only outbound request is Google Fonts, and it is deliberately
non-blocking: if it never arrives, the layout falls back to `system-ui` and the
page still renders immediately.

---

## Security

There are no secrets in this repository, and there is nowhere for one to hide:
no backend, no API calls, no authentication, no wallet, no analytics. The only
personal data present is what belongs on a portfolio — a name, a GitHub handle
and a public email address, all in `js/data.js`.

Worth stating plainly, since it is a common misunderstanding: **anything shipped
to a browser is public.** If this project ever gains an API key, it cannot be
hidden in frontend JavaScript — it would need a server or a restricted,
domain-locked, publishable key.

---

## Browser support

Chrome, Edge, Firefox and Safari, desktop and mobile, with WebGL available.
Where WebGL is missing or the GPU refuses the scene, the boot guard explains
why on the page and offers a reduced-quality reload. The scene targets WebGL 1
compatibility — non-power-of-two textures are configured for it, which is
required by most Android browsers.

---

## License

MIT. The code is free to reuse. The photographs in `assets/` are not mine to
license — replace them with your own.
