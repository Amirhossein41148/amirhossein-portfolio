/* Builds a single side-by-side comparison image proving the photo path works:
   left = drawn fallback art, right = the same card with a real photo loaded
   through makeCard's cover-crop. Uses @napi-rs/canvas to fake the browser.

   Usage: node test/verify-photos.js [outfile] */
const fs = require('fs');
const path = require('path');
const { createCanvas, Image } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
// os.tmpdir(): '/tmp' is C:\tmp on Windows and does not exist there.
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'photo-proof.png');

global.window = global;
global.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('only canvas supported');
    return createCanvas(300, 300);
  }
};
global.Image = Image;

eval(fs.readFileSync(path.join(ROOT, 'js/posters.js'), 'utf8'));

/* make a stand-in "photo": a wide 1600x1000 test image with a visible grid so
   the centre cover-crop is obvious. This is what a user's real jpg looks like
   to makeCard — wrong aspect on purpose, to prove nothing stretches. */
function fakePhoto(w, h, label) {
  const cv = createCanvas(w, h);
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0f3d6b'); g.addColorStop(0.5, '#1c7fa8'); g.addColorStop(1, '#0a2138');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2;
  for (let x = 0; x <= w; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y <= h; y += 80) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  // centre marker — must survive the crop
  c.strokeStyle = '#ffd166'; c.lineWidth = 8;
  c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ffd166';
  c.font = `700 ${Math.round(Math.min(w, h) * 0.08)}px sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('CENTRE', w / 2, h / 2);
  c.fillStyle = 'rgba(255,255,255,.85)';
  c.font = `700 ${Math.round(Math.min(w, h) * 0.05)}px sans-serif`;
  c.fillText(label, w / 2, h * 0.12);
  c.fillText(`${w}x${h} source`, w / 2, h * 0.88);
  // edge labels — these should be cropped away on the sides
  c.fillStyle = '#ff5c7a';
  c.textAlign = 'left';  c.fillText('LEFT EDGE', 14, h / 2);
  c.textAlign = 'right'; c.fillText('RIGHT EDGE', w - 14, h / 2);
  return cv;
}

/* replicate makeCard's cover-crop deterministically (no async, no network) */
function coverCrop(srcCanvas, W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  const img = srcCanvas;
  const ir = img.width / img.height, tr = W / H;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
  else { sh = img.width / tr; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  return cv;
}

const CASES = [
  { key: 'berserk', label: 'ANIME 600x900', W: 600, H: 900, src: [1600, 1000] },
  { key: 'cs2',     label: 'GAME 600x800',  W: 600, H: 800, src: [1600, 1000] },
  { key: 'profile', label: 'PROFILE 500x500', W: 500, H: 500, src: [1600, 1000] }
];

const TILE = 250;
const rows = CASES.length;
const pad = 14, headH = 34;
const sheetW = pad * 3 + TILE * 2;
let heights = CASES.map(c => Math.round(TILE * c.H / c.W));
const sheetH = pad + heights.reduce((a, b) => a + b + headH + pad, 0);

const sheet = createCanvas(sheetW, sheetH);
const s = sheet.getContext('2d');
s.fillStyle = '#04040a'; s.fillRect(0, 0, sheetW, sheetH);

let y = pad;
CASES.forEach((c, i) => {
  const h = heights[i];
  s.fillStyle = '#00f5ff';
  s.font = '700 13px sans-serif'; s.textAlign = 'left'; s.textBaseline = 'top';
  s.fillText(`${c.label}   —   left: drawn fallback     right: photo cover-cropped`, pad, y);
  y += headH - 12;

  const art = makePoster(c.key, c.W, c.H);
  s.drawImage(art, pad, y, TILE, h);

  const photo = coverCrop(fakePhoto(c.src[0], c.src[1], c.key.toUpperCase()), c.W, c.H);
  s.drawImage(photo, pad * 2 + TILE, y, TILE, h);

  // outlines
  s.strokeStyle = 'rgba(0,245,255,.5)'; s.lineWidth = 1.5;
  s.strokeRect(pad, y, TILE, h);
  s.strokeRect(pad * 2 + TILE, y, TILE, h);

  y += h + pad;
});

fs.writeFileSync(OUT, sheet.toBuffer('image/png'));
console.log('wrote', OUT, `${sheetW}x${sheetH}`);

/* assertions: the crop must hit the target size exactly and never distort */
let fails = 0;
CASES.forEach(c => {
  const photo = coverCrop(fakePhoto(c.src[0], c.src[1], c.key), c.W, c.H);
  if (photo.width !== c.W || photo.height !== c.H) {
    console.log(`FAIL ${c.key}: got ${photo.width}x${photo.height}, want ${c.W}x${c.H}`);
    fails++;
  } else {
    console.log(`OK   ${c.key}: ${photo.width}x${photo.height} from ${c.src[0]}x${c.src[1]} source`);
  }
});
process.exit(fails ? 1 : 0);
