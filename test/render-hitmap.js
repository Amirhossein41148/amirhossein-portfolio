#!/usr/bin/env node
/*
 * render-hitmap.js — draw WHICH ELEMENT RECEIVES A TAP, as a picture.
 *
 * The user asked to "check visual too". A screenshot of the real page cannot
 * answer the touch question: the look pad is fully transparent, so a broken
 * layout and a fixed one look pixel-identical. What we can draw is the thing
 * that actually matters — the hit-test result at every point of the screen.
 *
 * Left panel  = the v13 layout (fixed).
 * Right panel = the v11 layout (#mobileBar inside #hud), for contrast.
 *
 * No text is drawn anywhere: this container has zero fonts installed, so
 * fillText renders nothing. Colour-coded blocks + a colour key drawn as swatches
 * carry the meaning instead.
 *
 * Usage: node test/render-hitmap.js out.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OUT = process.argv[2] || path.join(ROOT, 'hitmap.png');

/* ── the same model as hittest.test.js, kept deliberately simple ───────────── */
function zOf(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|\\})\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  if (!m) return null;
  const z = m[1].match(/z-index:\s*(-?\d+)/);
  return z ? parseInt(z[1], 10) : null;
}

const VW = 384, VH = 687;              // the user's SM-A137F viewport
const topbarH = 11 + 27 + 9 + 42 + 11;
const chipH = 42, chipY = 11;
const chipHelpW = 40, chipFXW = 68, gap = 14;
const chipHelpX2 = VW - 14, chipHelpX1 = chipHelpX2 - chipHelpW;
const chipFXX2 = chipHelpX1 - gap, chipFXX1 = chipFXX2 - chipFXW;
const panelTop = Math.round(VH - 0.62 * VH);
const closeSize = 42;
const closeX2 = VW - 14, closeX1 = closeX2 - closeSize;
const closeY1 = panelTop + 3 + 11, closeY2 = closeY1 + closeSize;
const joySize = 126, joyX1 = 16, joyX2 = 16 + joySize;
const joyY2 = VH - 38, joyY1 = joyY2 - joySize;

function buildLayers(barInsideHud) {
  const L = [
    { name: 'scene',   rect: [0, 0, VW, VH],                 z: null,        parent: null,   hit: false },
    { name: 'hud',     rect: [0, 0, VW, VH],                 z: zOf('.hud'), parent: null,   hit: false },
    { name: 'topbar',  rect: [0, 0, VW, topbarH],            z: null,        parent: 'hud',  hit: true },
    { name: 'fx',      rect: [chipFXX1, chipY, chipFXX2, chipY + chipH],     z: null, parent: 'topbar', hit: true },
    { name: 'help',    rect: [chipHelpX1, chipY, chipHelpX2, chipY + chipH], z: null, parent: 'topbar', hit: true },
    { name: 'panels',  rect: [0, 0, VW, VH],                 z: zOf('.panels'), parent: 'hud', hit: false },
    { name: 'panel',   rect: [0, panelTop, VW, VH],          z: null,        parent: 'panels', hit: true },
    { name: 'close',   rect: [closeX1, closeY1, closeX2, closeY2], z: null,  parent: 'panel', hit: true },
    { name: 'bar',     rect: [0, 0, VW, VH],                 z: zOf('.mobile-bar'), parent: barInsideHud ? 'hud' : null, hit: false },
    { name: 'look',    rect: [0, 0, VW, VH],                 z: zOf('.look-pad'),   parent: 'bar', hit: true },
    { name: 'joy',     rect: [joyX1, joyY1, joyX2, joyY2],   z: zOf('.joy-wrap'),   parent: 'bar', hit: true }
  ];
  const by = {};
  L.forEach((l, i) => { l.order = i; by[l.name] = l; });
  return { L, by };
}

function makeHit({ L, by }) {
  const key = l => {
    const chain = [[l.z === null ? 0 : l.z, l.order]];
    let cur = l.parent ? by[l.parent] : null;
    while (cur) {
      if (cur.z !== null) chain.unshift([cur.z, cur.order]);
      cur = cur.parent ? by[cur.parent] : null;
    }
    return chain;
  };
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || [0, 0], y = b[i] || [0, 0];
      if (x[0] !== y[0]) return x[0] - y[0];
      if (x[1] !== y[1]) return x[1] - y[1];
    }
    return 0;
  };
  const inside = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  return (x, y) => {
    const c = L.filter(l => l.hit && inside(l.rect, x, y));
    if (!c.length) return null;
    c.sort((p, q) => cmp(key(q), key(p)));
    return c[0].name;
  };
}

/* ── colours: distinct hues, and the look pad is the alarming one ──────────── */
const COLOR = {
  fx:     '#00f5ff',
  help:   '#00ff9d',
  topbar: '#0b6b78',
  close:  '#ffbe0b',
  panel:  '#bf00ff',
  joy:    '#ff006e',
  look:   '#22242e',
  null:   '#000000'
};

const SCALE = 1;
const PAD = 26;
const GAPX = 34;
const KEYH = 74;
const W = PAD * 2 + VW * 2 * SCALE + GAPX;
const H = PAD * 2 + VH * SCALE + KEYH;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#04040a';
ctx.fillRect(0, 0, W, H);

function drawPanel(ox, barInsideHud) {
  const hit = makeHit(buildLayers(barInsideHud));
  for (let y = 0; y < VH; y += 2) {
    for (let x = 0; x < VW; x += 2) {
      const n = hit(x, y);
      ctx.fillStyle = COLOR[n] || '#ff0000';
      ctx.fillRect(ox + x * SCALE, PAD + y * SCALE, 2 * SCALE, 2 * SCALE);
    }
  }
  /* frame: green if every control is reachable, red if the pad ate them */
  const fxOk = hit(Math.round((chipFXX1 + chipFXX2) / 2), chipY + chipH / 2) === 'fx';
  const clOk = hit(Math.round((closeX1 + closeX2) / 2), Math.round((closeY1 + closeY2) / 2)) === 'close';
  const paOk = hit(Math.round(VW / 2), Math.round(panelTop + (VH - panelTop) / 2)) === 'panel';
  const good = fxOk && clOk && paOk;
  ctx.strokeStyle = good ? '#00ff9d' : '#ff2d55';
  ctx.lineWidth = 5;
  ctx.strokeRect(ox - 2.5, PAD - 2.5, VW * SCALE + 5, VH * SCALE + 5);
  return good;
}

const leftOk = drawPanel(PAD, false);                       // v13 fixed
const rightOk = drawPanel(PAD + VW * SCALE + GAPX, true);   // v11 broken

/* colour key as swatches (no text — zero fonts in this container) */
const keys = ['fx', 'help', 'topbar', 'close', 'panel', 'joy', 'look'];
let kx = PAD;
const ky = PAD + VH * SCALE + 18;
keys.forEach(k => {
  ctx.fillStyle = COLOR[k];
  ctx.fillRect(kx, ky, 44, 22);
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(kx + .5, ky + .5, 44, 22);
  kx += 54;
});

fs.writeFileSync(OUT, canvas.toBuffer('image/png'));

console.log('wrote ' + OUT);
console.log('  LEFT  (v13, current): all controls reachable = ' + leftOk);
console.log('  RIGHT (v11, old)    : all controls reachable = ' + rightOk);
if (!leftOk) { console.error('THE CURRENT LAYOUT IS BROKEN'); process.exit(1); }
if (rightOk) { console.error('the old layout should have been broken — model is wrong'); process.exit(1); }
