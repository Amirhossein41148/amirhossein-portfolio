#!/usr/bin/env node
/*
 * standalone.test.js — boot the SINGLE-FILE build the way a browser does.
 *
 * This is the strongest test in the project: every other suite eval()s the
 * source files by hand in a chosen order. Here jsdom is given the bundled HTML
 * with runScripts:'dangerously', so the inline <script> blocks execute in
 * document order exactly as a phone would run them. It catches:
 *   - a </script> sequence inside inlined JS truncating the document
 *   - wrong script order (a pass referencing an undefined shader)
 *   - the boot guard failing to install
 *   - anything that throws only when scripts run as real script elements
 *
 * Usage: node test/standalone.test.js [--no-webgl]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NO_WEBGL = process.argv.includes('--no-webgl');
/* os.tmpdir(), not '/tmp': on Windows '/tmp' resolves to C:\tmp, which does not
   exist, and every run died with ENOENT before testing anything. */
const BUNDLE = path.join(require('os').tmpdir(), 'standalone-test-' + process.pid + '.html');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  ' + extra : '')); }
};
const eq = (label, got, want) => ok(label + ` (${got})`, got === want, `want ${want}`);

console.log(`\n### STANDALONE SINGLE-FILE BUILD${NO_WEBGL ? ' · NO WEBGL' : ''} ###\n`);

/* ------------------------------------------------------------- build it */
console.log('=== 1. the bundler runs and self-verifies ===');
let buildOut = '';
try {
  buildOut = execFileSync(process.execPath,
    [path.join(ROOT, 'test', 'bundle.js'), BUNDLE],
    { encoding: 'utf8' });
  ok('bundle.js exits 0', true);
} catch (e) {
  ok('bundle.js exits 0', false, e.message);
  process.exit(1);
}
/* Assert against the number index.html actually declares, not a literal: the
   count changes every time a script is added, and a hardcoded 14 made this fail
   for the wrong reason instead of catching a genuinely missing file. */
const declaredScripts =
  (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<script src="(?!https?:)[^"]+"><\/script>/g) || []).length;
ok(`all ${declaredScripts} scripts were inlined`,
  new RegExp(declaredScripts + ' script\\(s\\) inlined').test(buildOut),
  buildOut.split('\n').filter(l => /script\(s\)/.test(l)).join(' '));
ok('the stylesheet was inlined', /1 stylesheet\(s\)/.test(buildOut));
ok('remote fonts were dropped', /remote fonts removed: yes/.test(buildOut));

const html = fs.readFileSync(BUNDLE, 'utf8');
ok('output is one file over 600 KB', Buffer.byteLength(html) > 600000,
  (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');

console.log('\n=== 2. nothing remote or external survives ===');
ok('no local <script src> remains', !/<script\s+src="(?!https?:)/i.test(html));
ok('no local stylesheet <link> remains',
  !/<link\s+rel="stylesheet"\s+href="(?!https?:)/i.test(html));
ok('no googleapis reference remains', !/fonts\.googleapis\.com/.test(html));
ok('no gstatic reference remains', !/fonts\.gstatic\.com/.test(html));
/* Any of these would mean the page still needs a network to finish loading. */
const remoteSrc = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
eq('zero remote resources referenced', remoteSrc.length, 0);
if (remoteSrc.length) remoteSrc.slice(0, 5).forEach(r => console.log('      ' + r));

console.log('\n=== 3. the document survived inlining intact ===');
/* A stray </script> inside three.min.js would truncate everything after it,
   so assert the tail of the document is still present and balanced. */
ok('document still ends with </html>', /<\/html>\s*$/.test(html));
const opens = (html.match(/<script\b/gi) || []).length;
const closes = (html.match(/<\/script>/gi) || []).length;
eq('every <script> is closed exactly once', opens, closes);
ok('the boot guard is present', /__bootFail/.test(html));
ok('three.js is present', /THREE/.test(html));
ok('world.js is present', /window\.World/.test(html) || /World\s*=\s*\{/.test(html));
ok('the loader markup is present', /id="loadStat"/.test(html));

/* --------------------------------------------------- run it like a browser */
console.log('\n=== 4. it BOOTS with scripts executing as real <script> tags ===');

const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push('jsdomError: ' + e.message));

/* WebGL + 2D fakes must exist BEFORE the document scripts run, so install them
   from beforeParse. */
function make2D() {
  const noop = () => {};
  const target = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
    getLineDash: () => [],
    canvas: { width: 300, height: 150 }
  };
  return new Proxy(target, {
    get: (o, k) => (k in o ? o[k] : noop),
    set: () => true
  });
}

let glHandouts = 0;
function makeGL() {
  glHandouts++;
  const E = {
    MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, MAX_TEXTURE_SIZE: 0x0D33,
    MAX_VARYING_VECTORS: 0x8DFC, MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872, VERSION: 0x1F02
  };
  const noop = () => {};
  const target = Object.assign({}, E, {
    ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B89,
    LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81,
    getParameter(p) {
      if (p === E.MAX_FRAGMENT_UNIFORM_VECTORS) return 256;  // real mid Android
      if (p === E.MAX_TEXTURE_SIZE) return 4096;
      if (p === E.VERSION) return 'WebGL 1.0';
      return 8;
    },
    /* three.js walks the active uniform/attribute list after linking and reads
       `.name` off each entry. Report zero of both so it doesn't iterate into
       undefined — this is a mock detail, not site behaviour. */
    getActiveUniform: () => ({ name: 'u', size: 1, type: 0x1406 }),
    getActiveAttrib: () => ({ name: 'a', size: 1, type: 0x1406 }),
    getExtension: () => null,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getShaderParameter: () => true,
    getProgramParameter(prog, p) {
      if (p === 0x8B86 || p === 0x8B89) return 0;   // ACTIVE_UNIFORMS / ATTRIBUTES
      return true;                                   // LINK_STATUS etc.
    },
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    createShader: () => ({}), createProgram: () => ({}),
    createBuffer: () => ({}), createTexture: () => ({}),
    createFramebuffer: () => ({}), createRenderbuffer: () => ({}),
    getUniformLocation: () => ({}), getAttribLocation: () => 0,
    getContextAttributes: () => ({ alpha: true }),
    isContextLost: () => false,
    readPixels: (x, y, w, h, f, t, px) => { if (px) { px[0] = 0; px[1] = 245; px[2] = 255; } }
  });
  return new Proxy(target, {
    get: (o, k) => (k in o ? o[k] : noop),
    set: () => true
  });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',      // execute the inline scripts, like a browser
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'file:///sdcard/Download/portfolio-standalone.html',   // the real case
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function (t) {
      if (t === '2d') return make2D();
      if (t === 'webgl' || t === 'webgl2' || t === 'experimental-webgl') {
        return NO_WEBGL ? null : makeGL();
      }
      return null;
    };
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    win.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
    win.cancelAnimationFrame = id => clearTimeout(id);
    win.matchMedia = q => ({
      matches: /coarse/.test(q), media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    Object.defineProperty(win.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 '
        + '(KHTML, like Gecko) Chrome/96 Mobile Safari/537.36',
      configurable: true
    });
    /* THREE.CanvasTexture needs an image with dimensions. */
    win.Image = class {
      constructor() { this.width = 8; this.height = 8; }
      set src(v) { this._src = v; setTimeout(() => this.onerror && this.onerror(new Error('404')), 0); }
      get src() { return this._src; }
      addEventListener() {} removeEventListener() {}
    };
  }
});

const win = dom.window, doc = win.document;

/* Let the deferred DOMContentLoaded handler and a few frames run. */
setTimeout(() => {
  ok('no uncaught errors while running the bundle',
    jsErrors.length === 0, jsErrors.join(' | '));
  ok('the boot guard installed itself', typeof win.__bootFail === 'function');
  ok('THREE loaded from the inlined copy', typeof win.THREE === 'object');
  ok('every postprocessing pass is defined',
    !!(win.THREE && win.THREE.EffectComposer && win.THREE.RenderPass
      && win.THREE.ShaderPass && win.THREE.UnrealBloomPass
      && win.THREE.CopyShader && win.THREE.RGBShiftShader && win.THREE.FilmShader),
    'a wrong script order breaks this');
  ok('DATA is available', !!win.DATA);
  ok('UI is available', !!win.UI);
  ok('World is available', !!win.World);

  if (NO_WEBGL) {
    console.log('\n=== 5. no-WebGL device: the reason must be on screen ===');
    ok('the scene did not claim to be ready', !(win.World && win.World.ready));
    const box = doc.getElementById('bootError');
    ok('the boot-error card is shown', !!box && box.classList.contains('show'));
    const d = doc.getElementById('bootErrorDetail');
    ok('the card says something useful', !!d && d.textContent.length > 40,
      d ? JSON.stringify(d.textContent.slice(0, 70)) : 'EMPTY');
  } else {
    console.log('\n=== 5. it renders on a 256-uniform phone from file:// ===');
    ok('World.ready is true', win.World && win.World.ready === true);
    ok('the probe reported a usable GPU', win.GPU && win.GPU.ok === true);
    eq('exactly one WebGL context was handed out', glHandouts, 1);
    ok('a low tier was chosen for 256 uniforms',
      win.TIER === 'low', 'tier=' + win.TIER);
    ok('the light budget was respected',
      win.World.lightsUsed <= win.CFG.q.lights,
      `${win.World && win.World.lightsUsed} used, budget ${win.CFG && win.CFG.q.lights}`);
    ok('mobile controls were enabled from the phone UA',
      win.IS_MOBILE === true);
    ok('the minimap canvas got a real size',
      doc.getElementById('minimap').width > 0);
    ok('a frame was actually drawn', win.__FIRST_FRAME === true);
    ok('no boot failure was reported', win.__BOOT_FAILED !== true,
      (doc.getElementById('bootErrorDetail') || {}).textContent || '');
    if (win.__BOOT_FAILED) {
      console.log('      BOOT LOG: ' + JSON.stringify(win.__BOOTLOG));
    }
  }

  try { fs.unlinkSync(BUNDLE); } catch (e) { /* ignore */ }

  console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
  process.exit(fail ? 1 : 0);
}, 900);
