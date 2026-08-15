#!/usr/bin/env node
/*
 * mobile-layout.test.js — the phone layout, asserted against the real CSS.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The "anime shelf is too small on Android" bug has now been fixed twice. The
 * first fix did not take effect, and the reason is a trap worth pinning down
 * permanently:
 *
 *   The full-screen geometry was written as `body.is-mobile .panel { ... }`.
 *   `body.is-mobile` is added by JS, only after IS_MOBILE decides the device is
 *   a phone — a guess built from the user agent and `pointer:coarse`. That guess
 *   is wrong on a narrow desktop window, on a Windows touchscreen laptop, and in
 *   DevTools device mode without touch emulation. When it is wrong the class
 *   never arrives, every rule hanging off it is dead, and the layout falls
 *   through to the plain `.panel` rule — which still capped the height. The
 *   panel came back cramped and the CSS looked correct while doing nothing.
 *
 * So: viewport SIZE decides layout (it is a fact), the is-mobile guess only
 * hides the walk controls (the one thing it is genuinely needed for). These
 * assertions encode exactly that split, plus the numbers that make the panel
 * actually reach the edges.
 *
 * This is a CSS contract test. It parses the stylesheet rather than rendering
 * it, because jsdom does not evaluate media queries — a rendering check here
 * would silently pass no matter what the CSS said.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cssRaw = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
/* Strip comments before parsing. This stylesheet is heavily commented, and the
   comments mention selectors by name — `body.is-mobile.panel-open`, `.panel`,
   `44vh` — so a selector regex run over the raw text happily matches prose and
   reports a rule that does not exist. Caught by exactly that false positive. */
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (l, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + l); }
  else { fail++; console.log('  FAIL  ' + l + (x ? '  ' + x : '')); }
};

console.log('\n### MOBILE LAYOUT — PANELS AND LIGHTBOX FILL THE SCREEN ###\n');

/* ── a tiny media-query-aware slicer ───────────────────────────────────────
   Returns the CONCATENATED bodies of every top-level @media block whose
   condition contains all the given fragments. Concatenated, not just the first
   match: this stylesheet deliberately has two `(max-width:720px)` blocks — one
   next to the panel rules, one next to the lightbox rules — and returning only
   the first made every lightbox assertion below fail against correct CSS.
   Brace-counted, so nested blocks do not confuse it. */
function mediaBlock(...fragments) {
  const re = /@media([^{]+)\{/g;
  let m;
  const parts = [];
  while ((m = re.exec(css))) {
    const cond = m[1];
    if (!fragments.every(f => cond.includes(f))) continue;
    let i = m.index + m[0].length, depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    parts.push(css.slice(m.index + m[0].length, i - 1));
  }
  return parts.length ? parts.join('\n') : null;
}

/* Body of a single rule inside a given chunk of CSS. Anchored so `.panel` does
   not also match `.panel-head`, and so a grouped selector's tail is ignored. */
function rule(chunk, selector) {
  if (!chunk) return null;
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[};])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm');
  const m = chunk.match(re);
  return m ? m[1] : null;
}

/* ═══════════════ 1. the phone panel is full-bleed ═══════════════ */
console.log('=== 1. portrait phone: the panel fills the screen ===');

const phone = mediaBlock('max-width:720px');
ok('a (max-width:720px) block exists', !!phone);

const panel = rule(phone, '.panel');
ok('.panel is restyled inside the 720px block', !!panel);

ok('max-height is released (this was the actual bug: 62vh / 44vh)',
  /max-height:\s*none/.test(panel || ''), panel && panel.slice(0, 90));
ok('it spans the full width', /left:\s*0/.test(panel || '') && /right:\s*0/.test(panel || ''));
ok('it reaches the bottom edge', /bottom:\s*0/.test(panel || ''));
ok('width is 100%', /width:\s*100%/.test(panel || ''));
ok('the top edge clears the wrapped HUD bar (>= 100px)',
  /top:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*(1[0-9][0-9])px\)/.test(panel || ''),
  panel && (panel.match(/top:[^;]*/) || [''])[0]);
ok('the notch is accounted for (safe-area-inset-top)',
  /safe-area-inset-top/.test(panel || ''));
ok('.panel.open clears the slide-in transform on a phone',
  /transform:\s*none/.test(rule(phone, '.panel.open') || ''));

/* The cards themselves must get the room the new height buys. */
console.log('\n=== 2. the shelf uses the space ===');
ok('the card grid is retuned for a phone', !!rule(phone, '.card-grid'));
ok('art cards are retuned for a phone', !!rule(phone, '.card.art'));
ok('two columns at phone width', /grid-template-columns:\s*1fr 1fr/.test(rule(phone, '.grid2') || ''));

/* ═══════════════ 2. the geometry is SIZE-gated, not guess-gated ═══════════ */
console.log('\n=== 3. the fix cannot be defeated by a wrong is-mobile guess ===');

/* Find every `body.is-mobile ... .panel { ... }` rule anywhere in the file and
   prove none of them carries the layout. If the geometry ever moves back onto
   the class, this fails. */
const isMobilePanelRules = [];
const imRe = /body\.is-mobile[^{]*\.panel\s*\{([^}]*)\}/g;
let im;
while ((im = imRe.exec(css))) isMobilePanelRules.push(im[1]);

ok('body.is-mobile .panel rules exist (for safe-area padding)',
  isMobilePanelRules.length >= 1, String(isMobilePanelRules.length));
isMobilePanelRules.forEach((body, i) => {
  ok(`is-mobile .panel rule #${i + 1} sets NO layout geometry`,
    !/(^|;)\s*(top|bottom|left|right|width|max-height)\s*:/.test(body),
    body.trim().slice(0, 80));
});

/* The walk controls DO belong on the class — they are about input, not size. */
ok('the joystick is hidden while a panel is open',
  /body\.is-mobile\.panel-open\s+\.joy-wrap\{[^}]*pointer-events:\s*none/.test(css));
ok('the radar is hidden while a panel is open',
  /body\.is-mobile\.panel-open\s+\.radar\{[^}]*pointer-events:\s*none/.test(css));
ok('the look pad cannot swallow taps through an open panel',
  /body\.is-mobile\.panel-open\s+\.look-pad\{[^}]*pointer-events:\s*none/.test(css));

/* ═══════════════ 3. no stale short-height rule survives ═══════════════ */
console.log('\n=== 4. no leftover cramped-panel rule anywhere ===');

/* Any .panel rule that pins a BARE viewport-relative max-height (44vh, 62vh)
   would re-break this depending on source order. A calc() that subtracts a
   fixed header from 100vh is fine and is what the desktop panel uses — note it
   contains `20vh` inside a clamp(), so this must not match on "contains vh". */
const panelMaxHeights = [];
const pmRe = /(?:^|[};])\s*((?:body[^{]*)?\.panel(?:\.open)?)\s*\{([^}]*)\}/g;
let pm;
while ((pm = pmRe.exec(css))) {
  const mh = pm[2].match(/max-height:\s*([^;]+)/);
  if (mh) panelMaxHeights.push({ sel: pm[1].trim(), value: mh[1].trim() });
}
const shortOnes = panelMaxHeights.filter(r => /^\d+(\.\d+)?vh$/.test(r.value));
ok('no .panel rule caps height at a bare NNvh any more (was 62vh / 44vh)',
  shortOnes.length === 0,
  shortOnes.map(r => r.sel + ' -> ' + r.value).join(', '));
ok('the desktop panel still has a sane height cap',
  panelMaxHeights.some(r => /calc\(100vh/.test(r.value)),
  panelMaxHeights.map(r => r.value).join(' | '));
ok('a phone rule explicitly releases the cap',
  panelMaxHeights.some(r => r.value === 'none'),
  panelMaxHeights.map(r => r.sel + ':' + r.value).join(' | '));

/* ═══════════════ 4. landscape phone keeps the scene visible ═══════════════ */
console.log('\n=== 5. landscape phone: side panel, not full screen ===');
const land = mediaBlock('max-height:520px', 'orientation:landscape');
ok('a landscape-phone block exists', !!land);
const landPanel = rule(land, '.panel');
ok('.panel is restyled for landscape', !!landPanel);
ok('it takes a side, not the whole width',
  /width:\s*min\(/.test(landPanel || ''), landPanel && landPanel.slice(0, 80));
ok('it is pinned to the right edge', /right:\s*0/.test(landPanel || ''));
ok('it still uses the full height', /max-height:\s*none/.test(landPanel || ''));

/* ═══════════════ 5. the lightbox is edge to edge ═══════════════ */
console.log('\n=== 6. portrait phone: the card popup fills the screen ===');
const lbCard = rule(phone, '.lb-card');
ok('.lb-card is restyled for a phone', !!lbCard);
ok('it is the full viewport width', /width:\s*100vw/.test(lbCard || ''));
ok('its width cap is removed', /max-width:\s*none/.test(lbCard || ''));
ok('it is the full height', /height:\s*100%/.test(lbCard || ''));
ok('its height cap is removed', /max-height:\s*none/.test(lbCard || ''));
ok('the rounded corners are dropped at full bleed',
  /border-radius:\s*0/.test(lbCard || ''));
ok('the lightbox padding is removed so the card can reach the edges',
  /padding:\s*0/.test(rule(phone, '.lightbox') || ''));

const lbArt = rule(phone, '.lb-art');
ok('.lb-art flexes to take the leftover height', /flex:\s*1 1 auto/.test(lbArt || ''));
ok('min-height:0 is set (without it a flex child will not shrink and pushes '
  + 'the caption off screen)', /min-height:\s*0/.test(lbArt || ''));

const lbX = rule(phone, '.lb-x');
ok('the close button is at least 44px on a phone',
  /width:\s*(4[4-9]|[5-9]\d)px/.test(lbX || ''), lbX && lbX.slice(0, 60));
ok('the close button clears the notch',
  /safe-area-inset-top/.test(lbX || ''));

/* the FLIP must not be broken by any of this */
console.log('\n=== 7. the zoom animation still works at full bleed ===');
ok('.lb-card keeps a transform built from the FLIP variables',
  /transform:translate\(var\(--fx\),var\(--fy\)\)\s*scale\(var\(--fs\)\)/.test(css));
ok('no phone rule overrides that transform',
  !/transform:\s*(?!translate\(var\(--fx\))/.test(lbCard || ''),
  lbCard && (lbCard.match(/transform:[^;]*/) || [''])[0]);

console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
process.exit(fail ? 1 : 0);
