#!/usr/bin/env node
/*
 * hittest.test.js — VISUAL/GEOMETRIC verification of the touch fix.
 *
 * The user asked to "check visual too". A rendered PNG cannot answer the real
 * question (the look pad is transparent — it is invisible by design, so a
 * screenshot looks identical whether it covers the buttons or not), and this
 * container has zero fonts so no label would render anyway.
 *
 * What actually matters is: WHEN A FINGER LANDS ON THE FX BUTTON, WHICH ELEMENT
 * RECEIVES THE TOUCH? That is a geometry + stacking-order question, and it can
 * be answered exactly. This file:
 *
 *   1. lays out the page for a 384x687 viewport (the user's SM-A137F, from his
 *      own diag report) by hand, from the real CSS values;
 *   2. builds the CSS painting order properly, INCLUDING stacking contexts —
 *      the thing v11 got wrong;
 *   3. hit-tests the real tap coordinates and asserts the topmost element with
 *      pointer-events:auto is the control the user is aiming at.
 *
 * It then prints an ASCII map of the layers so the result is inspectable by eye.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + l); }
  else { fail++; console.log('  FAIL  ' + l + (x ? '  → ' + x : '')); }
};

/* ── read the real numbers out of the CSS instead of hard-coding them ───────── */
function zOf(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|\\})\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  if (!m) return null;
  const z = m[1].match(/z-index:\s*(-?\d+)/);
  return z ? parseInt(z[1], 10) : null;
}

const Z = {
  hud: zOf('.hud'),
  lookPad: zOf('.look-pad'),
  joyWrap: zOf('.joy-wrap'),
  panels: zOf('.panels'),
  mobileBar: zOf('.mobile-bar')
};

console.log('\n### TOUCH HIT-TEST · 384x687 (SM-A137F) ###\n');
console.log('=== z-index values read from css/style.css ===');
Object.keys(Z).forEach(k => console.log(`  ${k.padEnd(10)} ${Z[k] === null ? 'auto' : Z[k]}`));

/* ── is #mobileBar a child of #hud? (the v11 bug) ───────────────────────────── */
const hudStart = html.indexOf('<div class="hud');
const hudSlice = html.slice(hudStart);
/* find where the hud div closes by counting divs */
let depth = 0, hudEnd = -1;
const tagRe = /<div\b|<\/div>/g;
tagRe.lastIndex = 0;
let mm;
while ((mm = tagRe.exec(hudSlice))) {
  if (mm[0] === '</div>') { depth--; if (depth === 0) { hudEnd = mm.index; break; } }
  else depth++;
}
const hudInner = hudEnd > 0 ? hudSlice.slice(0, hudEnd) : hudSlice;
const barInsideHud = /class="mobile-bar/.test(hudInner);

console.log('\n=== DOM ancestry ===');
ok('#mobileBar is NOT a child of #hud', !barInsideHud,
  'it is inside #hud, so #hud\'s z-index traps the look pad');

/* ── viewport + layout, from the user\'s device ──────────────────────────────── */
const VW = 384, VH = 687;

/* .topbar: position:absolute;top:0;left:0;right:0; padding:14px clamp(...)
   At 384px wide the clamp(14px,2.4vw,30px) resolves to 14px (2.4vw = 9.2px).
   Content height: logo h1 clamp(.95rem,2.1vw,1.5rem) -> .95rem = 15.2px, plus
   4px margin + .48rem sub (7.7px) => ~27px, +28px padding => ~55px.
   At <=900px .topbar wraps and the nav takes a full row: padding 11px 14px and
   the nav row adds ~40px on mobile (min-height:42px). */
const topbarH = 11 + 27 + 9 + 42 + 11;   // ≈100px

/* .chip on mobile: padding 11px 15px, min-height 42px, font .6rem.
   The two chips sit in .topright at the right edge, gap clamp(4px,1vw,14px). */
const chipH = 42;
const chipFXW = 15 + 38 + 15;   // "FX ON" ≈ 38px at .6rem Orbitron tracking
const chipHelpW = 15 + 10 + 15; // "?"
const gap = 14;
const chipY = 11;               // first row, top padding
const chipHelpX2 = VW - 14;                       // right padding
const chipHelpX1 = chipHelpX2 - chipHelpW;
const chipFXX2 = chipHelpX1 - gap;
const chipFXX1 = chipFXX2 - chipFXW;

/* .panel on mobile (<=720px): top:auto;bottom:0;left:0;right:0;width:100%;
   max-height:62vh;  => y from VH-0.62*VH to VH */
const panelTop = Math.round(VH - 0.62 * VH);
/* .panel-head sticky at top:3px inside it; .panel-x is 42px on mobile, sits at
   the right end of the head row (margin-left:auto on .panel-status before it) */
const headH = 11 + 42 + 11;
const closeSize = 42;
const closeX2 = VW - 14;
const closeX1 = closeX2 - closeSize;
const closeY1 = panelTop + 3 + 11;
const closeY2 = closeY1 + closeSize;

/* .joy-wrap: left:max(16px,safe) bottom:max(20px,safe); joy is 126px, sprint
   button above it, label below. */
const joySize = 126;
const joyX1 = 16, joyX2 = 16 + joySize;
const joyY2 = VH - 20 - 18;            // minus the MOVE label
const joyY1 = joyY2 - joySize;

/* ── the layer model, WITH stacking contexts ────────────────────────────────── */
/* Each entry: name, rect, z (null = auto), parent (name or null), interactive */
const layers = [
  { name: '#scene',    rect: [0, 0, VW, VH],                   z: null, parent: null, hit: false },
  { name: '#hud',      rect: [0, 0, VW, VH],                   z: Z.hud, parent: null, hit: false },
  { name: '.topbar',   rect: [0, 0, VW, topbarH],              z: null, parent: '#hud', hit: true },
  { name: '#bloomBtn', rect: [chipFXX1, chipY, chipFXX2, chipY + chipH],   z: null, parent: '.topbar', hit: true },
  { name: '#helpBtn',  rect: [chipHelpX1, chipY, chipHelpX2, chipY + chipH], z: null, parent: '.topbar', hit: true },
  { name: '.panels',   rect: [0, 0, VW, VH],                   z: Z.panels, parent: '#hud', hit: false },
  { name: '.panel',    rect: [0, panelTop, VW, VH],            z: null, parent: '.panels', hit: true },
  { name: '.panel-x',  rect: [closeX1, closeY1, closeX2, closeY2], z: null, parent: '.panel', hit: true },
  { name: '#mobileBar', rect: [0, 0, VW, VH],                  z: Z.mobileBar, parent: barInsideHud ? '#hud' : null, hit: false },
  { name: '.look-pad', rect: [0, 0, VW, VH],                   z: Z.lookPad, parent: '#mobileBar', hit: true },
  { name: '.joy-wrap', rect: [joyX1, joyY1, joyX2, joyY2],     z: Z.joyWrap, parent: '#mobileBar', hit: true }
];

const byName = {};
layers.forEach((l, i) => { l.order = i; byName[l.name] = l; });

/* The painting key of an element is the chain of (z-index, DOM order) pairs from
   the root down through every ancestor that CREATES A STACKING CONTEXT — and
   only those. An ancestor with `z-index:auto` creates none, so its children
   participate in the nearest ancestor context that does (here, the root). Getting
   this wrong in either direction is exactly the class of mistake that produced
   the bug: v11 compared two raw numbers and ignored the contexts entirely. */
function paintKey(l) {
  const chain = [[l.z === null ? 0 : l.z, l.order]];
  let cur = l.parent ? byName[l.parent] : null;
  while (cur) {
    /* only a stacking context re-anchors the comparison */
    if (cur.z !== null) chain.unshift([cur.z, cur.order]);
    cur = cur.parent ? byName[cur.parent] : null;
  }
  return chain;
}

function cmpKey(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || [0, 0], y = b[i] || [0, 0];
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] - y[1];
  }
  return 0;
}

const inside = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];

function hitTest(x, y) {
  const cands = layers.filter(l => l.hit && inside(l.rect, x, y));
  if (!cands.length) return null;
  cands.sort((p, q) => cmpKey(paintKey(q), paintKey(p)));  // topmost first
  return cands[0];
}

/* ── the actual taps the user reported as broken ────────────────────────────── */
console.log('\n=== hit-testing the taps the user says are broken ===');

const cases = [
  { label: 'the FX button in the top bar',
    x: Math.round((chipFXX1 + chipFXX2) / 2), y: Math.round(chipY + chipH / 2),
    want: '#bloomBtn' },
  { label: 'the ? (help) button in the top bar',
    x: Math.round((chipHelpX1 + chipHelpX2) / 2), y: Math.round(chipY + chipH / 2),
    want: '#helpBtn' },
  { label: 'the ✕ close button on an open panel',
    x: Math.round((closeX1 + closeX2) / 2), y: Math.round((closeY1 + closeY2) / 2),
    want: '.panel-x' },
  { label: 'the middle of a panel (a scroll drag)',
    x: Math.round(VW / 2), y: Math.round(panelTop + (VH - panelTop) / 2),
    want: '.panel' },
  { label: 'the joystick',
    x: Math.round((joyX1 + joyX2) / 2), y: Math.round((joyY1 + joyY2) / 2),
    want: '.joy-wrap' },
  { label: 'empty sky (should still look around)',
    x: Math.round(VW / 2), y: Math.round(topbarH + 40),
    want: '.look-pad' }
];

cases.forEach(c => {
  const got = hitTest(c.x, c.y);
  ok(`(${String(c.x).padStart(3)},${String(c.y).padStart(3)}) ${c.label} → ${got ? got.name : 'nothing'}`,
    !!got && got.name === c.want, `expected ${c.want}`);
});

/* ── a visual layer map, so the result can be eyeballed ─────────────────────── */
console.log('\n=== what the finger reaches, drawn (each cell = a real hit-test) ===');
const COLS = 48, ROWS = 24;
const glyph = {
  '#bloomBtn': 'F', '#helpBtn': '?', '.panel-x': 'X', '.panel': 'P',
  '.joy-wrap': 'J', '.look-pad': '.', '.topbar': 'T', null: ' '
};
const rows = [];
for (let r = 0; r < ROWS; r++) {
  let line = '';
  for (let c = 0; c < COLS; c++) {
    const x = Math.round((c + 0.5) * VW / COLS);
    const y = Math.round((r + 0.5) * VH / ROWS);
    const h = hitTest(x, y);
    line += glyph[h ? h.name : null] !== undefined ? glyph[h ? h.name : null] : '#';
  }
  rows.push('  |' + line + '|');
}
console.log('  +' + '-'.repeat(COLS) + '+');
rows.forEach(r => console.log(r));
console.log('  +' + '-'.repeat(COLS) + '+');
console.log('   F=FX  ?=help  T=topbar  X=close  P=panel(scrolls)  J=joystick  .=look');

/* Assert the map is not a solid field of look-pad, which is what the bug looked
   like, and that each control actually appears somewhere. */
const mapStr = rows.join('\n');

console.log('\n=== the map proves every control is reachable ===');
ok('the FX button is reachable somewhere', mapStr.includes('F'));
ok('the help button is reachable somewhere', mapStr.includes('?'));
ok('the panel close button is reachable somewhere', mapStr.includes('X'));
ok('the panel body is reachable (so it can scroll)', mapStr.includes('P'));
ok('the joystick is reachable', mapStr.includes('J'));
ok('the look pad still owns the empty middle', mapStr.includes('.'));
const lookCells = (mapStr.match(/\./g) || []).length;
const total = COLS * ROWS;
ok('the look pad does NOT cover everything',
  lookCells < total * 0.75, `${lookCells}/${total} cells`);
ok('the look pad still covers a useful area for looking around',
  lookCells > total * 0.15, `${lookCells}/${total} cells`);

/* ── REGRESSION PROOF ────────────────────────────────────────────────────────
   Re-run the identical hit-test with #mobileBar put back inside #hud (the v11
   layout). If the harness is any good it MUST report the bug the user saw.
   A test that passes on both the broken and the fixed layout proves nothing. */
console.log('\n=== the v11 layout must FAIL this same test ===');
byName['#mobileBar'].parent = '#hud';
const brokenFX = hitTest(Math.round((chipFXX1 + chipFXX2) / 2),
                         Math.round(chipY + chipH / 2));
const brokenClose = hitTest(Math.round((closeX1 + closeX2) / 2),
                            Math.round((closeY1 + closeY2) / 2));
const brokenPanel = hitTest(Math.round(VW / 2),
                            Math.round(panelTop + (VH - panelTop) / 2));
ok('with #mobileBar inside #hud the FX button is swallowed by the look pad',
  brokenFX && brokenFX.name === '.look-pad', 'got ' + (brokenFX && brokenFX.name));
ok('...and so is the panel close button',
  brokenClose && brokenClose.name === '.look-pad', 'got ' + (brokenClose && brokenClose.name));
ok('...and the panel cannot be scrolled either',
  brokenPanel && brokenPanel.name === '.look-pad', 'got ' + (brokenPanel && brokenPanel.name));
byName['#mobileBar'].parent = barInsideHud ? '#hud' : null;   // restore

console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
process.exit(fail ? 1 : 0);
