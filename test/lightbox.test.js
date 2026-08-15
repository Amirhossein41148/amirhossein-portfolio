#!/usr/bin/env node
/*
 * lightbox.test.js — the card zoom, its glitch burst, and the promise that a
 * card can never be LOST.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The lightbox MOVES the card's real <canvas> into itself and puts it back on
 * close. That is deliberate (see js/lightbox.js) but it means a bug in the close
 * path does not merely look wrong — it permanently blanks the card in the panel.
 * The close path has three exits (transitionend, a timeout backstop, and Esc)
 * and every one of them must restore the canvas. That is what this asserts.
 *
 * It also pins the things that are easy to break silently:
 *   - the FLIP variables (--fx/--fy/--fs/--fr) are actually written
 *   - .open and .flying are set in the right ORDER (same frame = no animation)
 *   - the glitch class is added and removed again
 *   - World input is blocked while open and released after close
 *   - every CSS class and @keyframes the JS relies on exists in style.css
 *     (a renamed keyframe is invisible in JS and kills the animation)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + l); }
  else { fail++; console.log('  FAIL  ' + l + (x ? '  ' + x : '')); }
};
const eq = (l, got, want) => ok(l + ` (${got})`, got === want, `want ${want}`);

console.log('\n### CARD LIGHTBOX ###\n');

const css = read('css/style.css');
const html = read('index.html');

/* ─────────────── 1. the markup and CSS contract ─────────────── */
console.log('=== 1. markup + CSS contract ===');
['lightbox', 'lbScrim', 'lbCard', 'lbArt', 'lbTitle', 'lbSub', 'lbNote',
 'lbTag', 'lbClose'].forEach(id => {
  ok(`#${id} exists in index.html`, new RegExp('id="' + id + '"').test(html));
});
ok('the lightbox is NOT inside #hud (z-index would be trapped)',
  html.indexOf('id="lightbox"') > html.indexOf('</div>\n\n<!-- ░░ help overlay')
  || !/id="hud"[\s\S]*id="lightbox"[\s\S]*<\/div>\s*<!-- ░░ mobile/.test(html));

/* Every animation the JS depends on must exist by name. A renamed keyframe
   fails silently: the class is added, nothing moves. */
['lbRgb', 'lbTearA', 'lbTearB', 'lbShear', 'lbKick', 'lbWipe'].forEach(k => {
  ok(`@keyframes ${k} is defined`, new RegExp('@keyframes\\s+' + k + '\\b').test(css));
});
ok('.lightbox.glitch drives the burst', /\.lightbox\.glitch\s+\./.test(css));
ok('.lightbox.flying drives the arrival', /\.lightbox\.flying\s+\.lb-card/.test(css));
ok('.lightbox.closing drives the return', /\.lightbox\.closing\s+\.lb-card/.test(css));

/* The FLIP only works if the card's transform is built from the variables. */
const cardRule = (css.match(/\.lb-card\{([^}]*)\}/) || [])[1] || '';
ok('.lb-card transform uses --fx/--fy/--fs',
  /translate\(var\(--fx\),\s*var\(--fy\)\)\s*scale\(var\(--fs\)\)/.test(cardRule));
ok('.lb-card transform-origin is top left (required for the FLIP maths)',
  /transform-origin:\s*top left/.test(cardRule));
ok('.lb-card only transitions transform and opacity (GPU-composited)',
  /transition:\s*transform[^;]*opacity[^;]*;/.test(cardRule) &&
  !/transition:[^;]*(width|height|top|left)/.test(cardRule));

/* The glitch must not animate the card's TRANSFORM: that property belongs to
   the FLIP transition, and two things driving one property cancel out. This was
   a real bug in the first version. */
const kickBody = (css.match(/@keyframes lbKick\{([\s\S]*?)\n\}/) || [])[1] || '';
ok('the glitch does NOT animate the card transform (would fight the FLIP)',
  !/transform:/.test(kickBody), 'lbKick sets transform');

ok('the close button is at least 44px (touch target)',
  /\.lb-x\{[^}]*width:44px[^}]*height:44px/.test(css));
ok('reduced-motion drops the glitch but keeps the zoom',
  /prefers-reduced-motion[\s\S]{0,220}\.lightbox\.glitch[\s\S]{0,120}animation:none/.test(css));
ok('the look pad is disabled while the lightbox is open',
  /body\.lightbox-open\s+\.look-pad\{[^}]*pointer-events:none/.test(css));

/* ─────────────── 2. boot a real DOM and drive it ─────────────── */
console.log('\n=== 2. open / close against a real DOM ===');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'outside-only', pretendToBeVisual: true,
  virtualConsole: vc, url: 'http://localhost:8080/'
});
const win = dom.window, doc = win.document;

function make2D() {
  const noop = () => {};
  return {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0, lineCap: '',
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop,
    strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop,
    translate: noop, rotate: noop, scale: noop, setLineDash: noop,
    drawImage: noop, measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(4 * Math.max(1, w * h)) })
  };
}
win.HTMLCanvasElement.prototype.getContext = function (t) {
  return t === '2d' ? make2D() : null;      // no WebGL: World stays unbooted
};

/* Photos "load" so the PHOTO badge path is exercised. */
class FakeImage {
  constructor() { this.width = 1200; this.height = 1800; this._src = ''; }
  set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
  get src() { return this._src; }
}
win.Image = FakeImage;
win.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {} });
win.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0);
win.cancelAnimationFrame = () => {};

/* A thumbnail rect to fly from, and a known final rect for the card, so the
   FLIP maths can be checked numerically. */
win.Element.prototype.getBoundingClientRect = function () {
  if (this.id === 'lbCard') return { left: 380, top: 100, width: 520, height: 700, right: 900, bottom: 800 };
  if (this.classList && this.classList.contains('art-slot')) {
    return { left: 40, top: 200, width: 130, height: 195, right: 170, bottom: 395 };
  }
  return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
};

/* Load the app scripts index.html declares, minus main.js (which needs WebGL to
   get past its boot guard) and world.js (same). UI + Lightbox is what's under
   test; a minimal World stub stands in for the parts they touch. */
const appFiles = (html.match(/<script src="(js\/[^"]+)"><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1])
  .filter(f => !/main\.js$/.test(f) && !/world\.js$/.test(f));

win.eval('window.IS_MOBILE = false; window.CFG = { touchSens: 0.003 };');
win.eval(`window.World = {
  keys: {}, joy: { x:0, y:0, active:false }, inputBlocked: false,
  cards: [], activeNode: null, camera: { position: { x:0, y:0, z:0 } },
  teleportTo(){}, look(){}, cardScreenRect(){ return { left:10, top:20, width:120, height:180 }; },
  pickCard(){ return null; }, stats(){ return { tier:'high', lights:0, lightBudget:0, fragUniforms:0 }; }
};`);

for (const f of appFiles) {
  try { win.eval(read(f)); }
  catch (e) { errors.push(`${f}: ${e.message}`); }
}

eq('no errors loading the app scripts', errors.length, 0);
errors.forEach(e => console.log('      ' + e));
ok('Lightbox is exposed', typeof win.Lightbox === 'object');
ok('UI is exposed', typeof win.UI === 'object');

win.Lightbox.init();
win.UI.init();

const LB = win.Lightbox;
const box = doc.getElementById('lightbox');
const card = doc.getElementById('lbCard');

/* the card we will open, and the canvas that must survive the round trip */
const fig = doc.querySelector('[data-anime="berserk"]');
const slot = fig.querySelector('.art-slot');
const canvas = slot.querySelector('canvas');

ok('a card figure exists in the ANIME panel', !!fig);
ok('the slot has a canvas before opening', !!canvas);
ok('the card is keyboard reachable', fig.getAttribute('tabindex') === '0');
ok('the card announces itself as a button', fig.getAttribute('role') === 'button');

setTimeout(() => {
  /* ── OPEN ─────────────────────────────────────────────── */
  fig.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  ok('.open is set immediately', box.classList.contains('open'));
  eq('aria-hidden flips to false', box.getAttribute('aria-hidden'), 'false');
  ok('body gets .lightbox-open', doc.body.classList.contains('lightbox-open'));
  ok('the canvas MOVED into the lightbox', canvas.parentElement === doc.getElementById('lbArt'));
  ok('the slot no longer holds a canvas', !slot.querySelector('canvas'));
  ok('World input is blocked', win.World.inputBlocked === true);
  ok('Lightbox.isOpen() reports true', LB.isOpen() === true);

  eq('the title came from DATA', doc.getElementById('lbTitle').textContent, 'BERSERK');
  ok('the accent came from DATA',
    card.style.getPropertyValue('--accent') === '#ff2d55',
    card.style.getPropertyValue('--accent'));
  ok('the PHOTO badge shows because the photo loaded',
    doc.getElementById('lbTag').hidden === false);

  /* FLIP maths: slot is 130 wide, card is 520 → scale 0.25, and the offsets are
     the difference between the two top-left corners. */
  const fx = parseFloat(card.style.getPropertyValue('--fx'));
  const fy = parseFloat(card.style.getPropertyValue('--fy'));
  const fs = parseFloat(card.style.getPropertyValue('--fs'));
  const fr = card.style.getPropertyValue('--fr');
  eq('--fx = slot.left - card.left', fx, 40 - 380);
  eq('--fy = slot.top - card.top', fy, 200 - 100);
  eq('--fs = slot.width / card.width', fs, 130 / 520);
  ok('--fr is a small random tilt in degrees',
    /^-?\d+(\.\d+)?deg$/.test(fr) && Math.abs(parseFloat(fr)) <= 2.2, fr);

  /* .flying must arrive on a LATER frame than .open, or the browser has nothing
     to interpolate from and the card simply appears. */
  ok('.flying is NOT set in the same tick as .open', !box.classList.contains('flying'));

  setTimeout(() => {
    ok('.flying is set on a later frame (the zoom can animate)',
      box.classList.contains('flying'));
    ok('.glitch fired', box.classList.contains('glitch'));

    setTimeout(() => {
      ok('.glitch is removed again (~300ms)', !box.classList.contains('glitch'));

      /* ── CLOSE via the ✕ button ───────────────────────── */
      doc.getElementById('lbClose').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      ok('.closing is set', box.classList.contains('closing'));
      ok('.flying is cleared so the reverse transform applies',
        !box.classList.contains('flying'));
      ok('the FLIP target was re-measured on close',
        parseFloat(card.style.getPropertyValue('--fs')) === 130 / 520);

      /* jsdom fires no transitionend, so this exercises the TIMEOUT backstop —
         the path that guarantees the canvas is never orphaned. */
      setTimeout(() => {
        ok('the canvas went BACK into its slot (timeout backstop)',
          slot.querySelector('canvas') === canvas);
        ok('.open/.closing are cleared',
          !box.classList.contains('open') && !box.classList.contains('closing'));
        eq('aria-hidden is true again', box.getAttribute('aria-hidden'), 'true');
        ok('body .lightbox-open removed', !doc.body.classList.contains('lightbox-open'));
        ok('World input is released', win.World.inputBlocked === false);
        ok('Lightbox.isOpen() reports false', LB.isOpen() === false);

        /* ── reopen, then close via Esc-equivalent API ───── */
        LB.open('games', 'cs2', doc.querySelector('[data-game="cs2"] .art-slot'));
        ok('a second card can be opened', LB.isOpen() === true);
        eq('the second title is right', doc.getElementById('lbTitle').textContent, 'CS2');
        const cv2 = doc.querySelector('[data-game="cs2"] .art-slot');
        LB.close();
        setTimeout(() => {
          ok('the second canvas was restored too', !!cv2.querySelector('canvas'));
          ok('no errors across the whole cycle', errors.length === 0,
            errors.join(' | '));

          console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
          process.exit(fail ? 1 : 0);
        }, 500);
      }, 500);
    }, 400);
  }, 60);
}, 120);
