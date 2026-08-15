/* Renders every card to a real PNG at its true size so the art can be checked
   by eye. Usage: node test/render-posters.js [outdir] */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
// os.tmpdir(): '/tmp' is C:\tmp on Windows and does not exist there.
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'poster-out');
fs.mkdirSync(OUT, { recursive: true });

global.window = global;
global.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('only canvas supported');
    return createCanvas(300, 300);
  }
};

eval(fs.readFileSync(path.join(ROOT, 'js/posters.js'), 'utf8'));

const GROUPS = {
  anime:   { keys: ['berserk', 'mushoku', 'ponyo', 'nausicaa', 'marnie'], w: 600, h: 900 },
  games:   { keys: ['roblox', 'cs2', 'undertale', 'deltarune', 'mlbb'],   w: 600, h: 800 },
  profile: { keys: ['profile'],                                           w: 500, h: 500 }
};

let total = 0;
for (const [group, { keys, w, h }] of Object.entries(GROUPS)) {
  const dir = path.join(OUT, group);
  fs.mkdirSync(dir, { recursive: true });
  for (const k of keys) {
    const cv = global.makePoster(k, w, h);
    const buf = cv.toBuffer('image/png');
    const f = path.join(dir, `${k}.png`);
    fs.writeFileSync(f, buf);
    total += buf.length;
    console.log(`${group.padEnd(8)} ${k.padEnd(10)} ${w}x${h}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
console.log(`\ntotal ${(total / 1024).toFixed(0)} KB → ${OUT}`);

/* contact sheets, one per group */
for (const [group, { keys, w, h }] of Object.entries(GROUPS)) {
  const tileW = 260, tileH = Math.round(tileW * h / w);
  const sheet = createCanvas(keys.length * tileW, tileH);
  const sc = sheet.getContext('2d');
  sc.fillStyle = '#04040a';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  keys.forEach((k, i) => sc.drawImage(global.makePoster(k, w, h), i * tileW, 0, tileW, tileH));
  const f = path.join(OUT, `sheet-${group}.png`);
  fs.writeFileSync(f, sheet.toBuffer('image/png'));
  console.log('sheet →', f);
}
