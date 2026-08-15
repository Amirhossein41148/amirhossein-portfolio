#!/usr/bin/env node
/*
 * bake-photos.js — turn assets/*.jpg into js/photos.js (base64 data URIs).
 *
 * WHY THIS EXISTS
 * ---------------
 * The 3D card stands in the gallery rings could never show your photos, and no
 * amount of JS could fix it, because it is a browser security rule:
 *
 *   - A photo loaded from file:// TAINTS any canvas it is drawn into.
 *   - WebGL refuses a tainted canvas AND a cross-origin <img>: texImage2D
 *     throws SecurityError. Verified in Chrome, both paths:
 *       raw Image  -> "The image element contains cross-origin data"
 *       via canvas -> "Tainted canvases may not be loaded"
 *   - There is no CORS header you can add to a file:// URL, and fetch/XHR are
 *     blocked there too, so the picture simply cannot reach the GPU.
 *
 * A `data:` URI is treated as SAME-ORIGIN, so it does NOT taint the canvas and
 * WebGL accepts it. Baking the photos into data URIs is therefore the only way
 * the stands can show real pictures when the site is opened straight from the
 * folder — which is exactly how it gets opened on a phone.
 *
 * The photos are downscaled and re-encoded on the way in (a 1792x2400 source is
 * pointless for a 600px card and costs ~17 MB of decoded memory on a phone), so
 * the baked file is far smaller than the originals it replaces.
 *
 * Usage:  npm run photos:bake
 * Re-run this whenever you add or replace a picture in assets/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let canvasLib;
try {
  canvasLib = require('@napi-rs/canvas');
} catch (e) {
  console.error('This script needs @napi-rs/canvas:  npm install');
  process.exit(1);
}
/* loadImage, NOT `new Image()`: with this library assigning a Buffer to
   img.src reports the right width/height but draws nothing — every canvas came
   out pure black (mean luminance 0). loadImage decodes properly. The blank
   check further down is what caught it. */
const { createCanvas, loadImage } = canvasLib;

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'photos.js');

/* Baked texture sizes. Deliberately SMALLER than the DOM card sizes in
   js/data.js: this copy is a texture on a ~5-unit quad seen from a few metres
   away, so 512px wide is already more than the screen can resolve, and every
   pixel here costs decoded memory on a phone plus bytes in js/photos.js.
   512 is a power of two, which older Android GL likes. */
const SIZES = {
  anime:   { w: 512, h: 768 },   // 2:3, matches the 600x900 card ratio
  game:    { w: 512, h: 683 },   // 3:4
  profile: { w: 384, h: 384 }    // 1:1
};
/* JPEG quality. @napi-rs/canvas wants an INTEGER 0-100 here, not the 0..1 the
   browser API takes — passing 0.82 silently produced ~10 KB mush (it rounds to
   0). If a re-bake ever comes out suspiciously small, check this first. */
const QUALITY = 68;

/* key -> [file, kind]. Mirrors DATA in js/data.js. */
const ITEMS = [
  ['profile',   'assets/profile.jpg',            'profile'],
  ['berserk',   'assets/anime/berserk.jpg',      'anime'],
  ['mushoku',   'assets/anime/mushoku.jpg',      'anime'],
  ['ponyo',     'assets/anime/ponyo.jpg',        'anime'],
  ['nausicaa',  'assets/anime/nausicaa.jpg',     'anime'],
  ['marnie',    'assets/anime/marnie.jpg',       'anime'],
  ['roblox',    'assets/games/roblox.jpg',       'game'],
  ['cs2',       'assets/games/cs2.jpg',          'game'],
  ['undertale', 'assets/games/undertale.jpg',    'game'],
  ['deltarune', 'assets/games/deltarune.jpg',    'game'],
  ['mlbb',      'assets/games/mlbb.jpg',         'game']
];

/* Same centre cover-crop makeCard does, so the baked pixels match the DOM card
   exactly and a photo never looks cropped differently in 3D than in the panel. */
function coverCrop(img, W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  const ir = img.width / img.height, tr = W / H;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
  else         { sh = img.width / tr;  sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  return cv;
}

/* Proof the crop actually produced picture data rather than an empty canvas:
   mean luminance of a real photo is never 0, and its pixels are never uniform. */
function inspect(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let sum = 0, min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    sum += l; if (l < min) min = l; if (l > max) max = l;
  }
  return { mean: Math.round(sum / (d.length / 4)), min, max };
}

const out = [];
const report = [];
let failures = 0;

async function bake() {
for (const [key, rel, kind] of ITEMS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    report.push(`  skip  ${key.padEnd(10)} ${rel} (not present — drawn art will be used)`);
    continue;
  }
  const size = SIZES[kind];
  let img;
  try {
    img = await loadImage(fs.readFileSync(abs));
    if (!img.width || !img.height) throw new Error('decoded to 0x0');
  } catch (e) {
    report.push(`  FAIL  ${key.padEnd(10)} ${rel}: ${e.message}`);
    failures++;
    continue;
  }

  const cv = coverCrop(img, size.w, size.h);
  const stat = inspect(cv);
  if (stat.mean === 0 || stat.min === stat.max) {
    report.push(`  FAIL  ${key.padEnd(10)} produced a blank canvas (mean=${stat.mean})`);
    failures++;
    continue;
  }

  const buf = cv.toBuffer('image/jpeg', QUALITY);
  const uri = 'data:image/jpeg;base64,' + buf.toString('base64');
  out.push('  ' + JSON.stringify(key) + ': ' + JSON.stringify(uri));
  report.push(
    `  ok    ${key.padEnd(10)} ${String(img.width) + 'x' + img.height}` +
    ` -> ${size.w}x${size.h}  ${(buf.length / 1024).toFixed(0)} KB` +
    `  (src ${(fs.statSync(abs).size / 1024).toFixed(0)} KB, mean ${stat.mean})`
  );
}

if (failures) {
  console.error('bake failed:');
  report.forEach(r => console.error(r));
  process.exit(1);
}

const banner = `/* ═══════════════════════════════════════════════════════════════════════
   PHOTOS — GENERATED FILE, DO NOT EDIT BY HAND.
   Regenerate with:  npm run photos:bake
   Generated: ${new Date().toISOString()}

   Your pictures from assets/, centre-cropped to the card sizes and inlined as
   data URIs. This is not an optimisation, it is a requirement: WebGL refuses a
   texture that came from a file:// image (SecurityError — tainted canvas), so
   the 3D card stands could never show a real photo without this. A data: URI
   counts as same-origin, so it works from file:// AND from a server, on a PC
   and on Android alike.

   assets/ is still the source of truth — edit pictures there, then re-bake.
   ═══════════════════════════════════════════════════════════════════════ */
window.PHOTOS = {
`;

fs.writeFileSync(OUT, banner + out.join(',\n') + '\n};\n', 'utf8');

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
report.forEach(r => console.log(r));
console.log(`\n  wrote js/photos.js — ${out.length} photos, ${kb} KB total`);
}

bake().catch(e => { console.error('bake threw:', e); process.exit(1); });
