#!/usr/bin/env node
/*
 * orphan.test.js — the two faults the diag report from a real phone exposed.
 *
 * FAULT 1: index.html opened on its own, with no css/ js/ vendor/ next to it.
 *   The phone's diag report showed all 15 files MISSING (0) from
 *   file:///…/mark.via.gp/cache/content/ — a browser's cache folder. Only
 *   index.html had been extracted there, so the page was unstyled and dead with
 *   no explanation. A boot guard must detect this and say so, and its message
 *   must be readable WITHOUT the stylesheet that is missing.
 *
 * FAULT 2: the touch look-pad swallowed every button tap.
 *   .mobile-bar was z-index:80 and .look-pad inside it is inset:0 with
 *   pointer-events:auto, while the whole HUD is z-index:70 — an invisible sheet
 *   over the entire UI. The user reported "top buttons not working by touch and
 *   exit button not working by touch" on the standalone build, which is exactly
 *   this. Asserted here as a numeric z-order invariant.
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

console.log('\n### ORPHANED index.html + TOUCH LAYERING ###\n');

const html = read('index.html');
const css = read('css/style.css');

/* ══════════════════════ FAULT 1 ══════════════════════ */
console.log('=== 1. the sentinel wiring exists on both sides ===');
ok('css/style.css defines --sentinel:ok', /--sentinel:\s*ok/.test(css));
ok('index.html reads --sentinel back', /--sentinel/.test(html));
ok('the check runs after DOM parse, not before the stylesheet had a chance',
  /DOMContentLoaded['"]?\s*,\s*checkSiblings/.test(html));

/* Boot the page with the stylesheet DELIBERATELY ABSENT. jsdom does not fetch
   external files, so a plain load already simulates "css/style.css 404s". */
function boot(withStylesheet) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(e.message));

  /* Only the inline boot guard is under test here; the vendored libs and the
     app scripts are external <script src> which jsdom won't fetch. That is
     precisely the orphaned-file condition. */
  let src = html;
  if (withStylesheet) {
    // inline the real stylesheet so the sentinel resolves
    src = src.replace(
      /<link rel="stylesheet" href="css\/style\.css">/,
      '<style>' + css + '</style>'
    );
  }

  const dom = new JSDOM(src, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'file:///storage/emulated/0/Android/data/mark.via.gp/cache/content/index.html'
  });
  return { win: dom.window, doc: dom.window.document, errs };
}

console.log('\n=== 2. orphaned file: the failure must be announced ===');
const a = boot(false);
setTimeout(() => {
  ok('no uncaught errors in the guard itself', a.errs.length === 0, a.errs.join(' | '));
  ok('the guard detected the missing files', a.win.__BOOT_FAILED === true);

  const box = a.doc.getElementById('bootError');
  const detail = a.doc.getElementById('bootErrorDetail');
  ok('the error card is shown', !!box && box.classList.contains('show'));

  const txt = detail ? detail.textContent : '';
  ok('it names the stylesheet as the evidence', /css\/style\.css/.test(txt), txt.slice(0, 80));
  ok('it explains this version is a folder', /FOLDER/i.test(txt));
  ok('it points at the single-file build',
    /SINGLE-FILE/i.test(txt), txt.slice(0, 120));
  ok('it does NOT blame the GPU', !/uniform|shader/i.test(txt.split('browser')[0]));

  /* The whole point: this message must be visible with NO stylesheet. */
  console.log('\n=== 3. the message is readable WITHOUT the stylesheet ===');
  const st = box ? (box.getAttribute('style') || '') : '';
  ok('the card got inline styling', st.length > 40);
  ok('inline styling makes it visible (not display:none)',
    /display:\s*block/.test(st), st.slice(0, 60));
  ok('inline styling gives it a background', /background:\s*#/.test(st));
  ok('inline styling gives it a text colour', /color:\s*#/.test(st));
  ok('it sits above everything', /z-index:\s*99999/.test(st));
  ok('it scrolls if the report is long', /overflow:\s*auto/.test(st));
  const pre = detail ? (detail.getAttribute('style') || '') : '';
  ok('the report block wraps instead of overflowing',
    /white-space:\s*pre-wrap/.test(pre));
  /* No links here by design: on an orphaned page every sibling file is also
     missing, so a link to phone-test.html or diag.html just opens a directory
     listing. Tested explicitly in section 5d. */
  const links = box ? box.getElementsByTagName('a') : [];
  ok('dead sibling links were removed', links.length === 0,
    links.length + ' left');

  console.log('\n=== 4. with the stylesheet present nothing is reported ===');
  const b = boot(true);
  setTimeout(() => {
    ok('the sentinel resolves when the CSS is there',
      b.win.getComputedStyle(b.doc.documentElement)
        .getPropertyValue('--sentinel').trim() === 'ok');
    /* THREE is absent in this harness, so main.js can't run — but the
       missing-files path specifically must NOT fire. */
    const d2 = b.doc.getElementById('bootErrorDetail');
    const t2 = d2 ? d2.textContent : '';
    ok('no missing-files error was raised', !/FOLDER/i.test(t2), t2.slice(0, 80));

    /* ══════════════════════ FAULT 2 ══════════════════════ */
    console.log('\n=== 5. touch layering: buttons must beat the look pad ===');

    /* Must match the selector STANDING ALONE. Matching it anywhere would also
       hit the tail of a grouped selector like
       `.chip,.nav-item,...,.look-pad{touch-action:manipulation}`
       which carries no z-index — that gave a false "no z-index" failure. */
    const zOf = sel => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(?:^|\\})\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm');
      const m = css.match(re);
      if (!m) return null;
      const z = m[1].match(/z-index:\s*(-?\d+)/);
      return z ? parseInt(z[1], 10) : null;
    };

    const zHud = zOf('.hud');
    const zPad = zOf('.look-pad');
    const zJoy = zOf('.joy-wrap');
    const zBar = zOf('.mobile-bar');

    ok('.hud has a z-index', zHud !== null, String(zHud));
    ok('.look-pad has a z-index', zPad !== null, String(zPad));
    ok('.joy-wrap has a z-index', zJoy !== null, String(zJoy));

    /* The bug: an ancestor with its own z-index traps the children inside it,
       so no child z-index can ever climb above .hud. */
    eq('.mobile-bar creates NO stacking context', zBar, null);

    ok('the look pad sits BELOW the hud (so taps reach buttons)',
      zPad < zHud, `look-pad ${zPad} vs hud ${zHud}`);
    ok('the joystick sits ABOVE the hud (never buried by a panel)',
      zJoy > zHud, `joy-wrap ${zJoy} vs hud ${zHud}`);

    console.log('\n=== 6. touch targets are finger-sized and lag-free ===');
    ok('tappable controls declare touch-action:manipulation',
      /touch-action:\s*manipulation/.test(css));

    /* Every selector in the mobile hit-area rules must actually EXIST in the
       markup or the generated DOM. v11 shipped `body.is-mobile .panel-close{...}`
       while the real class is `.panel-x`, so the close button silently kept its
       24px target. A CSS rule for a class nobody has is invisible dead code —
       assert against the real source. */
    const markup = html + read('js/ui.js');
    const hitRules = css.match(/body\.is-mobile\s+\.([a-z-]+)\s*\{/g) || [];
    ok('mobile hit-area rules exist at all', hitRules.length >= 3,
      String(hitRules.length));
    hitRules.forEach(r => {
      const cls = r.match(/\.([a-z-]+)\s*\{$/)[1];
      ok(`.${cls} is a class that really exists in the DOM`,
        new RegExp("class(Name)?\\s*=\\s*['\"`][^'\"`]*\\b" + cls + "\\b").test(markup),
        'no element ever gets class "' + cls + '"');
    });

    ok('chips get a bigger hit area on mobile',
      /body\.is-mobile \.chip\{[^}]*min-height:4\dpx/.test(css));
    ok('nav items get a bigger hit area on mobile',
      /body\.is-mobile \.nav-item\{[^}]*min-height:4\dpx/.test(css));
    ok('the panel close button gets a bigger hit area on mobile',
      /body\.is-mobile \.panel-x\{[^}]*4\dpx/.test(css));
    ok('the close button selector matches the markup (.panel-x, not .panel-close)',
      /class="panel-x"/.test(read('js/ui.js')));

    /* The look pad must still be reachable over the 3D canvas, or looking
       around breaks — check it's above the canvas and the scanline overlays. */
    ok('the look pad is still above the scene canvas', zPad > 1,
      String(zPad));

    /* ══════════════ THE REAL INVARIANT: STACKING CONTEXTS ══════════════
       z-index numbers only compare INSIDE the same stacking context. v11
       "fixed" the tap bug by setting .look-pad to 40 vs .hud's 70 — but
       #mobileBar was a CHILD of #hud, and #hud has a z-index, so it forms a
       stacking context. The pad's 40 was therefore ranked against its siblings
       inside the HUD (.topbar auto, .panels 3) and still won, covering
       everything. Checking the two numbers was not enough; the DOM ancestry has
       to be checked too. */
    console.log('\n=== 5b. the look pad is not trapped inside the HUD ===');
    const d3 = boot(true);
    const padEl = d3.doc.getElementById('lookPad');
    const hudEl = d3.doc.getElementById('hud');
    const barEl = d3.doc.getElementById('mobileBar');
    ok('#lookPad exists', !!padEl);
    ok('#hud exists', !!hudEl);
    ok('#mobileBar is NOT inside #hud (that trapped its z-index)',
      !!hudEl && !!barEl && !hudEl.contains(barEl));
    ok('#lookPad is NOT inside #hud',
      !!hudEl && !!padEl && !hudEl.contains(padEl));
    ok('#joyWrap is NOT inside #hud',
      !!hudEl && !hudEl.contains(d3.doc.getElementById('joyWrap')));

    /* Walk the pad's ancestors: none of them may create a stacking context,
       otherwise its z-index is measured against the wrong siblings again. */
    const zIndexOf = el => {
      if (!el || !el.className || typeof el.className !== 'string') return null;
      for (const cls of el.className.split(/\s+/)) {
        if (!cls) continue;
        const z = zOf('.' + cls);
        if (z !== null) return z;
      }
      return null;
    };
    let anc = padEl ? padEl.parentElement : null;
    const trapped = [];
    while (anc && anc.tagName !== 'BODY' && anc.tagName !== 'HTML') {
      const z = zIndexOf(anc);
      if (z !== null) trapped.push((anc.id || anc.className) + ':' + z);
      anc = anc.parentElement;
    }
    ok('no ancestor of the look pad creates a stacking context',
      trapped.length === 0, 'trapped by ' + trapped.join(', '));

    console.log('\n=== 5c. panels can be scrolled by touch ===');
    ok('.panel scrolls its own overflow', /\.panel\{[^}]*overflow-y:auto/.test(css));
    ok('.panel declares touch-action:pan-y so a drag scrolls it',
      /\.panel\{[^}]*touch-action:pan-y/.test(css));
    ok('.panel enables momentum scrolling on WebKit',
      /\.panel\{[^}]*-webkit-overflow-scrolling:touch/.test(css));
    /* The pad calls preventDefault() on touchmove — that is fine ONLY because it
       can no longer be the element under a panel. The regex allows for the
       tap-vs-drag bookkeeping that now sits between the listener and the call. */
    ok('the look pad still preventDefaults its own touchmove (look must work)',
      /pad\.addEventListener\('touchmove'[\s\S]{0,420}preventDefault/.test(read('js/ui.js')));

    console.log('\n=== 5d. the error card offers nothing that cannot work ===');
    const orphanBox = a.doc.getElementById('bootError');
    ok('no sibling-file links survive on the orphaned page',
      orphanBox.getElementsByTagName('a').length === 0,
      orphanBox.getElementsByTagName('a').length + ' links left');
    ok('the loader is hidden so the report is the only thing on screen',
      (a.doc.getElementById('loader').style.display || '') === 'none');
    ok('the HUD is hidden too',
      (a.doc.getElementById('hud').style.display || '') === 'none');
    ok('the help overlay is hidden too',
      (a.doc.getElementById('help').style.display || '') === 'none');

    /* A visible build number is the only way the user can tell whether the file
       on their phone is the fixed one or a stale copy from the browser cache.
       Three rounds were lost to exactly that ambiguity. */
    console.log('\n=== 7. the build is identifiable on screen ===');
    const pkgVer = JSON.parse(read('package.json')).version;
    const major = pkgVer.split('.')[0];
    ok('package.json has a version', !!pkgVer, pkgVer);
    ok('the loader shows a build number',
      new RegExp('BUILD v' + major).test(html), 'expected BUILD v' + major);
    ok('the top bar shows the same build number',
      new RegExp('PORTFOLIO · v' + major).test(html), 'expected v' + major);

    console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
    process.exit(fail ? 1 : 0);
  }, 350);
}, 350);
