/* Headless functional test: loads the real HTML + all app JS inside jsdom with
   a stubbed THREE and a recording 2D canvas context. Verifies DOM assembly,
   card generation (photo + fallback), movement math, billboarding, proximity
   panels, keyboard and the mobile joystick. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MOBILE = process.argv.includes('--mobile');
// ?mobile=1 forces the touch UI even with a desktop UA — proves the override works
const FORCE_QS = process.argv.includes('--force-qs');
/* --weak-gpu reports a 256-vector fragment uniform budget, which is what a
   mid-range Android actually returns. This is the exact condition that
   black-screened v6, so it gets its own full run. */
const WEAK_GPU = process.argv.includes('--weak-gpu');   // 256 vectors -> low
const MID_GPU  = process.argv.includes('--mid-gpu');    // 320 vectors -> mid
/* --one-context: the device hands out exactly ONE WebGL context, then null.
   --no-webgl:    the device refuses WebGL entirely. */
const ONE_CONTEXT = process.argv.includes('--one-context');
const NO_WEBGL = process.argv.includes('--no-webgl');
const FORCED_TIER = FORCE_QS;   // ?fx=low overrides whatever the probe says
const QUERY = FORCE_QS ? '?mobile=1&fx=low' : '';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const eq = (name, a, b) => ok(name, a === b, `(got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

/* ------------------------------------------------ recording 2D context --- */
/* Recording 2D context. There are no fonts in this container, so a rendered
   PNG can't prove the minimap labels exist — but the draw calls can. Every
   fillText/strokeText/fillRect/arc is logged so tests assert on real output
   instead of trusting a screenshot. */
function make2D(canvas) {
  const noop = () => {};
  const log = {
    fillText: [], strokeText: [], fillRects: [], strokeRects: [],
    arcs: [], dashes: 0, gradients: 0
  };
  const ctx = {
    canvas, __log: log,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '', textAlign: 'start', textBaseline: 'alphabetic',
    shadowColor: 'transparent', shadowBlur: 0,
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, clip: noop,
    clearRect: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop,
    getLineDash: () => [],
    drawImage: noop, putImageData: noop,
    measureText: t => ({ width: String(t).length * 7 }),
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),

    arc(x, y, r) { log.arcs.push({ x, y, r, style: ctx.strokeStyle, fill: ctx.fillStyle }); },
    fillRect(x, y, w, h) { log.fillRects.push({ x, y, w, h, style: ctx.fillStyle }); },
    strokeRect(x, y, w, h) { log.strokeRects.push({ x, y, w, h, style: ctx.strokeStyle }); },
    fillText(s, x, y) { log.fillText.push({ s: String(s), x, y, font: ctx.font, style: ctx.fillStyle }); },
    strokeText(s, x, y) { log.strokeText.push({ s: String(s), x, y }); },
    setLineDash(a) { if (a && a.length) log.dashes++; },
    createLinearGradient() { log.gradients++; return { addColorStop: noop }; },
    createRadialGradient() { log.gradients++; return { addColorStop: noop }; }
  };
  return ctx;
}

/* ---------------------------------------------------------- THREE stub --- */
function makeThreeStub() {
  class V2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new V3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
  }
  class Euler {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.order = 'XYZ'; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Quat { copy() { return this; } }
  class Obj3D {
    constructor() {
      this.position = new V3(); this.rotation = new Euler(); this.scale = new V3(1, 1, 1);
      this.quaternion = new Quat(); this.children = []; this.visible = true;
      this.material = null; this.userData = {};
    }
    add(o) { this.children.push(o); return this; }
    remove(o) { const i = this.children.indexOf(o); if (i > -1) this.children.splice(i, 1); return this; }
    rotateY(a) { this.rotation.y += a; return this; }
    rotateX(a) { this.rotation.x += a; return this; }
    translateZ() { return this; }
    lookAt() { return this; }
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse && c.traverse(fn)); }
  }
  const Geo = class { constructor() { this.attributes = {}; } setAttribute(k, v) { this.attributes[k] = v; return this; } getAttribute(k) { return this.attributes[k]; } dispose() {} };
  const Mat = class {
    constructor(o = {}) { Object.assign(this, { opacity: 1, transparent: false }, o); }
    dispose() {}
  };

  return {
    Vector2: V2, Vector3: V3, Euler, Quaternion: Quat, Object3D: Obj3D,
    Group: class extends Obj3D {},
    Scene: class extends Obj3D { constructor() { super(); this.background = null; this.fog = null; } },
    Color: class { constructor(h) { this.hex = h; this.r = .5; this.g = .5; this.b = .5; } },
    FogExp2: class { constructor(c, d) { this.color = c; this.density = d; } },
    PerspectiveCamera: class extends Obj3D {
      constructor(f, a, n, fa) { super(); this.fov = f; this.aspect = a; this.near = n; this.far = fa; }
      updateProjectionMatrix() {}
    },
    WebGLRenderer: class {
      constructor(o) {
        this.domElement = o && o.canvas; this._c = 0; this._compiles = 0;
        this.capabilities = { getMaxAnisotropy: () => 8 }; this.shadowMap = {};
        this.toneMappingExposure = 1;
      }
      setSize() {} setPixelRatio() {} render() { this._c++; }
      compile() { this._compiles++; }
    },
    AmbientLight: class extends Obj3D { constructor() { super(); this.isAmbientLight = true; } },
    DirectionalLight: class extends Obj3D {
      constructor(c, i) { super(); this.intensity = i; this.isDirectionalLight = true; }
    },
    HemisphereLight: class extends Obj3D { constructor() { super(); this.isHemisphereLight = true; } },
    PointLight: class extends Obj3D {
      constructor(c, i, d) {
        super(); this.color = c; this.intensity = i; this.distance = d;
        this.isPointLight = true;
      }
    },
    Mesh: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    Points: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    Sprite: class extends Obj3D {
      constructor(m) { super(); this.material = m || { opacity: 1 }; this.isSprite = true; }
    },
    LineSegments: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    GridHelper: class extends Obj3D { constructor() { super(); this.material = new Mat(); } },
    BufferGeometry: Geo,
    BufferAttribute: class { constructor(a, i) { this.array = a; this.itemSize = i; this.count = a.length / i; this.needsUpdate = false; } },
    PlaneGeometry: Geo, BoxGeometry: Geo, SphereGeometry: Geo, CylinderGeometry: Geo,
    TorusGeometry: Geo, RingGeometry: Geo, IcosahedronGeometry: Geo, OctahedronGeometry: Geo,
    EdgesGeometry: Geo, CircleGeometry: Geo,
    MeshBasicMaterial: Mat, MeshStandardMaterial: Mat, LineBasicMaterial: Mat,
    PointsMaterial: Mat, SpriteMaterial: Mat, ShaderMaterial: Mat,
    CanvasTexture: class { constructor(c) { this.image = c; this.encoding = null; this.anisotropy = 1; this.needsUpdate = false; } dispose() {} },
    Clock: class {
      constructor() { this.elapsedTime = 0; }
      getDelta() { this.elapsedTime += 0.016; return 0.016; }
    },
    Raycaster: class { setFromCamera() {} intersectObjects() { return []; } },
    EffectComposer: undefined, RenderPass: undefined, ShaderPass: undefined,
    AdditiveBlending: 2, DoubleSide: 2, BackSide: 1, FrontSide: 0,
    sRGBEncoding: 3001, ACESFilmicToneMapping: 4,
    MathUtils: { lerp: (a, b, t) => a + (b - a) * t }
  };
}

/* ------------------------------------------------------------- harness --- */
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(read('index.html'), {
  runScripts: 'outside-only', pretendToBeVisual: true,
  virtualConsole: vc, url: 'http://localhost:8080/' + QUERY
});
const win = dom.window, doc = win.document;

/* Fake WebGL context so the GPU capability probe in world.js has something to
   interrogate. FRAG_UNIFORMS decides the tier the probe picks. */
let FRAG_UNIFORMS = WEAK_GPU ? 256 : MID_GPU ? 320 : 1024;
const GL_ENUM = { MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, MAX_TEXTURE_SIZE: 0x0D33 };

/* glCalls counts how many times a WebGL context was REQUESTED across the whole
   page. On plenty of Android WebViews the second request returns null, which is
   what left the canvas black: the probe took one context, then three.js asked
   for another and got nothing. --one-context reproduces that device exactly. */
let glCalls = 0;
const GL_HANDED_OUT = [];

function makeGL(canvas) {
  const gl = {
    __isFakeGL: true,
    __canvas: canvas,
    MAX_FRAGMENT_UNIFORM_VECTORS: GL_ENUM.MAX_FRAGMENT_UNIFORM_VECTORS,
    MAX_TEXTURE_SIZE: GL_ENUM.MAX_TEXTURE_SIZE,
    getParameter(p) {
      if (p === GL_ENUM.MAX_FRAGMENT_UNIFORM_VECTORS) return FRAG_UNIFORMS;
      if (p === GL_ENUM.MAX_TEXTURE_SIZE) return 4096;
      return 0;
    },
    getExtension() { return null; }
  };
  GL_HANDED_OUT.push(gl);
  return gl;
}

win.HTMLCanvasElement.prototype.getContext = function (t) {
  if (t === '2d') return make2D(this);
  if (t === 'webgl' || t === 'webgl2' || t === 'experimental-webgl') {
    glCalls++;
    // ONE_CONTEXT: only the very first request succeeds, like a strict WebView
    if (ONE_CONTEXT && glCalls > 1) return null;
    if (NO_WEBGL) return null;
    return makeGL(this);
  }
  return null;
};
win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

// Image stub: assets/* "load" only when we say so; default is a 404 (fallback art)
let IMAGES_EXIST = false;
class FakeImage {
  constructor() { this.width = 1200; this.height = 1800; this._src = ''; }
  set src(v) {
    this._src = v;
    setTimeout(() => {
      if (IMAGES_EXIST && /^assets\//.test(v)) { if (this.onload) this.onload(); }
      else if (this.onerror) this.onerror(new Error('404'));
    }, 0);
  }
  get src() { return this._src; }
}
win.Image = FakeImage;

let rafQueue = [];
win.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
win.cancelAnimationFrame = () => {};
Object.defineProperty(win, 'devicePixelRatio', { value: 1, configurable: true });

win.HTMLCanvasElement.prototype.requestPointerLock = function () {
  Object.defineProperty(doc, 'pointerLockElement', { value: this, configurable: true });
  doc.dispatchEvent(new win.Event('pointerlockchange'));
};
doc.exitPointerLock = function () {
  Object.defineProperty(doc, 'pointerLockElement', { value: null, configurable: true });
  doc.dispatchEvent(new win.Event('pointerlockchange'));
};
Object.defineProperty(doc, 'pointerLockElement', { value: null, configurable: true });

// mobile switch: userAgent + coarse pointer
if (MOBILE) {
  Object.defineProperty(win.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36',
    configurable: true
  });
}
win.matchMedia = q => ({ matches: MOBILE && /coarse/.test(q), media: q, addListener() {}, removeListener() {} });

// getBoundingClientRect for the joystick
win.Element.prototype.getBoundingClientRect = function () {
  if (this.id === 'joy') return { left: 40, top: 500, width: 126, height: 126, right: 166, bottom: 626 };
  return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
};

// jsdom doesn't resolve the --map custom property from the stylesheet, so feed
// the value the breakpoint would give. MAP_CSS is switched per run below.
let MAP_CSS = (MOBILE || WEAK_GPU || MID_GPU) ? '140px' : '240px';
const realGCS = win.getComputedStyle.bind(win);
win.getComputedStyle = function (el, ps) {
  const cs = realGCS(el, ps);
  if (el === doc.documentElement) {
    return { getPropertyValue: n => (n === '--map' ? MAP_CSS : cs.getPropertyValue(n)) };
  }
  return cs;
};

win.THREE = makeThreeStub();
win.performance = win.performance || { now: () => Date.now() };

/* Run the INLINE boot-guard script from index.html. jsdom's
   runScripts:'outside-only' does not execute inline scripts, so without this the
   guard that reports failures on the page is never installed and the failure
   tests can't see it. Extract it from the real markup rather than duplicating
   it here, so the test exercises exactly what ships. */
{
  const html = read('index.html');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  if (inline && /__bootFail/.test(inline[1])) {
    try { win.eval(inline[1]); }
    catch (e) { errors.push('inline boot guard: ' + e.message); }
  } else {
    errors.push('inline boot guard is MISSING from index.html');
  }
}

/* Load the app scripts in the SAME ORDER index.html does, and read that order
   FROM index.html rather than hardcoding it. A hardcoded list silently skips any
   newly added file — which is exactly what happened when photos.js, lightbox.js
   and audio.js were added: the suite kept passing while the real page had
   already changed. */
const files = (read('index.html').match(/<script src="(js\/[^"]+)"><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1]);
if (!files.length) errors.push('no app <script src="js/…"> found in index.html');
for (const f of files) {
  try { win.eval(read(f)); }
  catch (e) { errors.push(`${f}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
}

console.log(`\n### MODE: ${MOBILE ? 'MOBILE' : 'DESKTOP'}`
  + `${FORCE_QS ? ' (forced via ?mobile=1)' : ''}`
  + `${WEAK_GPU ? ' · WEAK GPU (256 uniform vectors)' : ''}`
  + `${MID_GPU ? ' · MID GPU (320 uniform vectors)' : ''}`
  + `${ONE_CONTEXT ? ' · ONE WEBGL CONTEXT ONLY' : ''}`
  + `${NO_WEBGL ? ' · NO WEBGL AT ALL' : ''} ###`);

/* ══════════ HOSTILE-DEVICE RUNS ══════════
   These simulate the phones that showed a black screen. The scene is EXPECTED
   not to boot; what's under test is that the failure is reported on the page
   instead of leaving the visitor staring at nothing. */
if (NO_WEBGL || ONE_CONTEXT) {
  console.log('\n=== hostile device: the failure must be visible ===');

  if (NO_WEBGL) {
    ok('probe reports WebGL unavailable', win.GPU && win.GPU.ok === false);
    ok('probe explains why', !!(win.GPU && win.GPU.reason), win.GPU && win.GPU.reason);
    ok('World never claims to be ready', !win.World.ready);
  }

  if (ONE_CONTEXT) {
    /* The probe takes context #1 on the real canvas and hands it to three.js,
       so ONE context is enough for the whole page. This is the actual fix. */
    ok('probe succeeded on the single available context',
      win.GPU && win.GPU.ok === true);
    ok('probe used the real #scene canvas, not a throwaway',
      win.GPU.canvas === doc.getElementById('scene'));
    ok('probe kept the context to hand to three.js', !!win.GPU.gl);
    eq('only ONE webgl context was ever requested', glCalls, 1);
    ok('the scene booted on a one-context device', win.World.ready === true,
      'World.ready=' + win.World.ready);
    ok('no script errors', errors.length === 0);
    errors.forEach(e => console.log('      ' + e));
  }

  if (NO_WEBGL) {
    const box = doc.getElementById('bootError');
    const detail = doc.getElementById('bootErrorDetail');
    ok('the boot-error card is shown', box && box.classList.contains('show'));
    ok('the card explains the problem in words',
      detail && detail.textContent.length > 40,
      detail ? detail.textContent.slice(0, 60) + '…' : 'EMPTY');
    ok('the card reports the browser', /browser/i.test(detail.textContent));
    ok('the card reports the webgl state', /webgl/i.test(detail.textContent));
    ok('a low-quality escape link is offered', !!doc.getElementById('beLowLink'));
    ok('the loader is not left spinning silently',
      /could not|not available|refused|error|failed/i
        .test(doc.getElementById('loadStat').textContent),
      doc.getElementById('loadStat').textContent);
  }

  console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
  process.exit(fail ? 1 : 0);
}

console.log('\n=== 1. load & wiring ===');
eq('no script errors', errors.length, 0);
errors.forEach(e => console.log('      ' + e));
eq('exactly one WebGL context requested for the whole page', glCalls, 1);
ok('the probe used the real #scene canvas',
  win.GPU.canvas === doc.getElementById('scene'));
ok('DATA exposed', !!win.DATA);
ok('SIZES exposed', !!win.SIZES);
ok('World exposed', !!win.World);
ok('UI exposed', !!win.UI);
ok('makePoster exposed', typeof win.makePoster === 'function');
ok('makeCard exposed', typeof win.makeCard === 'function');
ok('World.ready', win.World && win.World.ready === true);
eq('IS_MOBILE detected', win.IS_MOBILE, MOBILE || FORCE_QS);
if (FORCE_QS) {
  ok('?mobile=1 forces touch UI on a desktop UA', win.IS_MOBILE === true);
  ok('?fx=low forces the low tier', win.TIER === 'low' && win.FX_LOW === true,
    `tier=${win.TIER}`);
  ok('?fx=low really cuts the particle count', win.CFG.q.particles === 700,
    String(win.CFG.q.particles));
}

console.log('\n=== 2. declared card sizes ===');
eq('anime is 600x900', `${win.SIZES.anime.w}x${win.SIZES.anime.h}`, '600x900');
eq('games is 600x800', `${win.SIZES.game.w}x${win.SIZES.game.h}`, '600x800');
eq('profile is 500x500', `${win.SIZES.profile.w}x${win.SIZES.profile.h}`, '500x500');

console.log('\n=== 3. DOM assembly from DATA ===');
const navBtns = doc.querySelectorAll('#nav .nav-item');
eq('nav items match DATA.nodes', navBtns.length, win.DATA.nodes.length);
eq('panels match DATA.nodes', doc.querySelectorAll('#panels .panel').length, win.DATA.nodes.length);
win.DATA.nodes.forEach(n => ok(`panel #panel-${n.id} exists`, !!doc.getElementById('panel-' + n.id)));
eq('anime cards', doc.querySelectorAll('#panel-anime .card.art').length, win.DATA.anime.length);
eq('game cards (art style, same as anime)', doc.querySelectorAll('#panel-games .card.art').length, win.DATA.games.length);
ok('Marnie card present', !!doc.querySelector('[data-anime="marnie"]'));
ok('profile slot present', !!doc.querySelector('.avatar-slot[data-key="profile"]'));
eq('skill bars', doc.querySelectorAll('#panel-about .skill').length, win.DATA.skills.length);

console.log('\n=== 4. canvas sizes written into the DOM ===');
const animeSlot = doc.querySelector('#panel-anime .art-slot');
const gameSlot = doc.querySelector('#panel-games .art-slot');
const profSlot = doc.querySelector('.avatar-slot');
eq('anime slot canvas is 600x900',
  `${animeSlot.querySelector('canvas').width}x${animeSlot.querySelector('canvas').height}`, '600x900');
eq('game slot canvas is 600x800',
  `${gameSlot.querySelector('canvas').width}x${gameSlot.querySelector('canvas').height}`, '600x800');
eq('profile canvas is 500x500',
  `${profSlot.querySelector('canvas').width}x${profSlot.querySelector('canvas').height}`, '500x500');
ok('anime slot has 2:3 ratio class', animeSlot.classList.contains('ratio-23'));
ok('game slot has 3:4 ratio class', gameSlot.classList.contains('ratio-34'));

console.log('\n=== 5. photo path wiring ===');
eq('profile src', profSlot.dataset.src, 'assets/profile.jpg');
win.DATA.anime.forEach(a => {
  const el = doc.querySelector(`[data-anime="${a.key}"] .art-slot`);
  eq(`anime ${a.key} src`, el.dataset.src, `assets/anime/${a.key}.jpg`);
});
win.DATA.games.forEach(g => {
  const el = doc.querySelector(`[data-game="${g.key}"] .art-slot`);
  eq(`game ${g.key} src`, el.dataset.src, `assets/games/${g.key}.jpg`);
});

console.log('\n=== 6. fallback art registry ===');
['berserk', 'mushoku', 'ponyo', 'nausicaa', 'marnie',
 'roblox', 'cs2', 'undertale', 'deltarune', 'mlbb', 'profile'].forEach(k => {
  ok(`POSTERS has ${k}`, typeof win.POSTERS[k] === 'function');
});
const cv = win.makePoster('__nope__', 60, 90);
ok('unknown key falls back safely', cv && cv.width === 60);

console.log('\n=== 7. makeCard: fallback on 404, photo on 200, no CORS on local files ===');
(async () => {
  /* Photo loads go through a bounded queue (2 at a time on mobile, 4 on desktop)
     so ten full-size JPEGs cannot spike memory and cost a phone its WebGL
     context. The page has already queued 21 cards by the time this runs, so
     waiting a fixed few milliseconds is not enough — wait for the queue to
     actually drain, then assert. A fixed sleep here was masking a real result. */
  const drain = async () => {
    for (let i = 0; i < 400; i++) {
      const q = win.imgQueueState();
      if (!q.queued && !q.active) return true;
      await new Promise(r => setTimeout(r, 5));
    }
    return false;
  };
  const settle = async () => {
    await drain();
    await new Promise(r => setTimeout(r, 10));
  };

  ok('the load queue drains instead of stalling', await drain());

  IMAGES_EXIST = false;
  let res = null;
  win.makeCard('berserk', 'assets/anime/berserk.jpg', 60, 90, (c, used) => { res = used; });
  await settle();
  eq('404 → drawn art used', res, false);

  IMAGES_EXIST = true;
  res = null;
  win.makeCard('berserk', 'assets/anime/berserk.jpg', 60, 90, (c, used) => { res = used; });
  await settle();
  eq('200 → photo used', res, true);

  /* THE BUG THAT HID EVERY PHOTO: crossOrigin='anonymous' was set on every
     image including the relative ones in assets/. Over file:// that turns each
     load into a CORS request against an opaque origin, which can never succeed,
     so all ten photos fell back to drawn art. It must only ever be set for a
     genuinely cross-origin URL. */
  const seen = [];
  const RealImage = win.Image;
  win.Image = class extends RealImage {
    set crossOrigin(v) { this._co = v; }
    get crossOrigin() { return this._co; }
    set src(v) { seen.push({ src: v, co: this._co }); super.src = v; }
    get src() { return super.src; }
  };
  res = null;
  win.makeCard('cs2', 'assets/games/cs2.jpg', 60, 80, (c, used) => { res = used; });
  await settle();
  const local = seen.find(s => s.src === 'assets/games/cs2.jpg');
  ok('a relative photo path is requested', !!local);
  ok('crossOrigin is NOT set for a local relative path',
    !!local && (local.co === undefined || local.co === null),
    'crossOrigin=' + (local && local.co));

  win.makeCard('cs2', 'https://example.com/x.jpg', 60, 80, () => {});
  await settle();
  const remote = seen.find(s => s.src === 'https://example.com/x.jpg');
  ok('crossOrigin IS set for a real cross-origin URL',
    !!remote && remote.co === 'anonymous',
    'crossOrigin=' + (remote && remote.co));

  /* A baked data: URI is same-origin by definition — setting crossOrigin on one
     is at best pointless and on some engines refuses the load outright. This is
     the path every 3D card stand now takes. */
  win.makeCard('cs2', 'data:image/jpeg;base64,AAAA', 60, 80, () => {});
  await settle();
  const dataUri = seen.find(s => /^data:/.test(s.src));
  ok('a data: URI is loaded without crossOrigin',
    !!dataUri && (dataUri.co === undefined || dataUri.co === null),
    'crossOrigin=' + (dataUri && dataUri.co));

  win.Image = RealImage;
  IMAGES_EXIST = false;

  res = null;
  win.makeCard('ponyo', '', 60, 90, (c, used) => { res = used; });
  await settle();
  eq('empty src → drawn art', res, false);

  runRest();
})();

function runRest() {
  const W = win.World, T = win.THREE;

  console.log('\n=== 8. world graph ===');
  eq('zone pillars', W.nodes.length, win.DATA.nodes.length);
  eq('card stands = anime + games', W.cards.length, win.DATA.anime.length + win.DATA.games.length);
  eq('anime stands', W.cards.filter(c => c.kind === 'anime').length, win.DATA.anime.length);
  eq('game stands', W.cards.filter(c => c.kind === 'games').length, win.DATA.games.length);
  ok('particles created', !!W.particles);
  eq('particle count matches quality tier',
    W.particles.geometry.getAttribute('position').count, win.CFG.q.particles);
  eq('pulse rings match the tier', W.pulseRings.length, win.CFG.q.pulses);
  eq('light beams match the tier', W.beams.length, win.CFG.q.beams);
  eq('holo rings follow the tier',
    W.holos.length, win.CFG.q.holos ? W.cards.length : 0);
  ok('storm light exists', !!W.stormLight);

  console.log('\n=== 9. card aspect ratios in 3D ===');
  const a3 = W.cards.find(c => c.kind === 'anime');
  const g3 = W.cards.find(c => c.kind === 'games');
  ok('anime and game stands both built', !!a3 && !!g3);
  eq('anime stand source is 600x900', `${a3.srcW}x${a3.srcH}`, '600x900');
  eq('game stand source is 600x800', `${g3.srcW}x${g3.srcH}`, '600x800');
  eq('anime stand canvas is 600x900', `${a3.canvas.width}x${a3.canvas.height}`, '600x900');
  eq('game stand canvas is 600x800', `${g3.canvas.width}x${g3.canvas.height}`, '600x800');
  ok('anime stand keeps 2:3 aspect in world units',
    Math.abs((a3.worldW / a3.worldH) - (600 / 900)) < 1e-6,
    `${(a3.worldW / a3.worldH).toFixed(4)}`);
  ok('game stand keeps 3:4 aspect in world units',
    Math.abs((g3.worldW / g3.worldH) - (600 / 800)) < 1e-6,
    `${(g3.worldW / g3.worldH).toFixed(4)}`);
  ok('anime stands are taller than game stands', a3.worldH > g3.worldH);
  ok('every card clears the ground', W.cards.every(c => c.base - c.worldH / 2 > 0.9));
  ok('all card materials are FrontSide (no mirrored back)',
    W.cards.every(c => c.mesh.material.side === T.FrontSide));
  ok('all card textures are sRGB',
    W.cards.every(c => c.mesh.material.map.encoding === T.sRGBEncoding));

  console.log('\n=== 9b. gallery layout sanity ===');
  {
    // no two stands closer than the widest card, so they never intersect
    let minGap = Infinity, worst = '';
    for (let i = 0; i < W.cards.length; i++) {
      for (let j = i + 1; j < W.cards.length; j++) {
        const a = W.cards[i].mesh.position, b = W.cards[j].mesh.position;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < minGap) { minGap = d; worst = `${W.cards[i].key}/${W.cards[j].key}`; }
      }
    }
    const widest = Math.max(...W.cards.map(c => c.worldW));
    ok('no two card stands intersect', minGap > widest, `min gap ${minGap.toFixed(2)} vs widest ${widest.toFixed(2)} (${worst})`);

    // every stand sits outside its pillar's auto-open radius, so panels don't
    // fight the cards for attention
    let allOutside = true;
    W.cards.forEach(c => {
      const node = win.DATA.nodes.find(n => n.gallery === c.kind);
      const d = Math.hypot(c.mesh.position.x - node.x, c.mesh.position.z - node.z);
      if (d <= node.radius) allOutside = false;
    });
    ok('stands sit outside the pillar trigger radius', allOutside);

    // the two rings must not collide with each other
    let crossMin = Infinity;
    W.cards.filter(c => c.kind === 'anime').forEach(a => {
      W.cards.filter(c => c.kind === 'games').forEach(g => {
        crossMin = Math.min(crossMin, Math.hypot(a.mesh.position.x - g.mesh.position.x,
                                                a.mesh.position.z - g.mesh.position.z));
      });
    });
    ok('anime ring and games ring stay apart', crossMin > widest * 1.5, `closest ${crossMin.toFixed(2)}`);

    // all stands inside the walkable bounds so you can always reach them
    ok('all stands are reachable inside bounds',
      W.cards.every(c => Math.abs(c.mesh.position.x) < win.CFG.bounds &&
                         Math.abs(c.mesh.position.z) < win.CFG.bounds));
  }

  console.log('\n=== 10. BILLBOARD — text can never be mirrored ===');
  const card = W.cards[0];
  const cp = card.mesh.position;
  const angleTo = (px, pz) => Math.atan2(px - cp.x, pz - cp.z);

  [[cp.x, cp.z + 12], [cp.x + 12, cp.z], [cp.x, cp.z - 12], [cp.x - 12, cp.z]].forEach(([px, pz], i) => {
    W.camera.position.set(px, win.CFG.eyeHeight, pz);
    W._billboard();
    const want = angleTo(px, pz);
    ok(`card faces player from side ${i + 1}`, Math.abs(W.camera.rotation.z) < 1e-9 && Math.abs(card.mesh.rotation.y - want) < 1e-6,
      `y=${card.mesh.rotation.y.toFixed(4)} want=${want.toFixed(4)}`);
    // a billboard is never edge-on or reversed: cos of the angle between the
    // card normal and the direction to the player must be positive
    const nx = Math.sin(card.mesh.rotation.y), nz = Math.cos(card.mesh.rotation.y);
    const dx = px - cp.x, dz = pz - cp.z;
    const d = Math.hypot(dx, dz) || 1;
    const dot = (nx * dx + nz * dz) / d;
    ok(`card normal points at player from side ${i + 1}`, dot > 0.999, `dot=${dot.toFixed(5)}`);
    ok(`frame stays flat (no roll) side ${i + 1}`, card.frame.rotation.x === 0 && card.frame.rotation.z === 0);
  });

  console.log('\n=== 11. movement ===');
  W.camera.position.set(0, win.CFG.eyeHeight, 30);
  W.yaw = 0; W.pitch = 0; W.vel.set(0, 0, 0);
  W.keys.KeyW = true;
  for (let i = 0; i < 40; i++) W.frame();
  W.keys.KeyW = false;
  ok('W moves forward (-Z)', W.camera.position.z < 28, `z=${W.camera.position.z.toFixed(2)}`);

  const x0 = W.camera.position.x;
  W.keys.KeyD = true;
  for (let i = 0; i < 30; i++) W.frame();
  W.keys.KeyD = false;
  ok('D strafes right (+X)', W.camera.position.x > x0 + 0.5);

  function travel(sprint) {
    W.camera.position.set(0, win.CFG.eyeHeight, 30); W.yaw = 0; W.vel.set(0, 0, 0);
    W.keys.KeyW = true; W.keys.ShiftLeft = sprint;
    for (let i = 0; i < 30; i++) W.frame();
    W.keys.KeyW = false; W.keys.ShiftLeft = false;
    return 30 - W.camera.position.z;
  }
  const walkD = travel(false), sprintD = travel(true);
  ok('sprint is faster', sprintD > walkD * 1.3, `walk=${walkD.toFixed(2)} sprint=${sprintD.toFixed(2)}`);

  // arrow keys as an alternative
  W.camera.position.set(0, win.CFG.eyeHeight, 30); W.yaw = 0; W.vel.set(0, 0, 0);
  W.keys.ArrowUp = true;
  for (let i = 0; i < 30; i++) W.frame();
  W.keys.ArrowUp = false;
  ok('ArrowUp also walks', W.camera.position.z < 29);

  W.camera.position.set(0, win.CFG.eyeHeight, 0); W.yaw = 0; W.vel.set(0, 0, 0);
  W.keys.KeyW = true;
  for (let i = 0; i < 1200; i++) W.frame();
  W.keys.KeyW = false;
  ok('bounds clamp', Math.abs(W.camera.position.z) <= win.CFG.bounds + 1e-6);

  W.pitch = 0; W.look(0, -1e6);
  ok('pitch clamped up', W.pitch <= win.CFG.pitchLimit + 1e-9);
  W.look(0, 2e6);
  ok('pitch clamped down', W.pitch >= -win.CFG.pitchLimit - 1e-9);

  console.log('\n=== 12. joystick drives movement ===');
  W.camera.position.set(0, win.CFG.eyeHeight, 30);
  W.yaw = 0; W.vel.set(0, 0, 0);
  W.joy.active = true; W.joy.x = 0; W.joy.y = -1;      // push stick up
  for (let i = 0; i < 40; i++) W.frame();
  ok('stick up walks forward', W.camera.position.z < 28, `z=${W.camera.position.z.toFixed(2)}`);

  W.camera.position.set(0, win.CFG.eyeHeight, 0); W.vel.set(0, 0, 0);
  W.joy.x = 1; W.joy.y = 0;                            // push stick right
  for (let i = 0; i < 40; i++) W.frame();
  ok('stick right strafes right', W.camera.position.x > 0.5, `x=${W.camera.position.x.toFixed(2)}`);

  // analogue: half deflection travels less than full
  function joyTravel(mag) {
    W.camera.position.set(0, win.CFG.eyeHeight, 30); W.yaw = 0; W.vel.set(0, 0, 0);
    W.joy.active = true; W.joy.x = 0; W.joy.y = -mag;
    for (let i = 0; i < 30; i++) W.frame();
    return 30 - W.camera.position.z;
  }
  const half = joyTravel(0.4), full = joyTravel(1);
  ok('joystick is analogue (half < full)', half < full * 0.75, `half=${half.toFixed(2)} full=${full.toFixed(2)}`);

  W.joy.active = false; W.joy.x = W.joy.y = 0;
  W.camera.position.set(0, win.CFG.eyeHeight, 30); W.vel.set(0, 0, 0);
  for (let i = 0; i < 40; i++) W.frame();
  ok('releasing the stick stops movement', Math.abs(W.camera.position.z - 30) < 0.6,
    `z=${W.camera.position.z.toFixed(2)}`);

  console.log('\n=== 13. proximity auto-panel ===');
  const target = win.DATA.nodes.find(n => n.id === 'games');
  W.camera.position.set(target.x, win.CFG.eyeHeight, target.z + 1);
  W.vel.set(0, 0, 0); W.frame();
  eq('walking into GAMES opens its panel', win.UI.current, 'games');
  eq('zone label updated', doc.getElementById('zone').textContent, 'GAMES');
  W.camera.position.set(0, win.CFG.eyeHeight, 45); W.frame();
  eq('stepping away closes it', win.UI.current, null);

  console.log('\n=== 14. keys: warp / esc / help / fx ===');
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].forEach((code, i) => {
    win.dispatchEvent(new win.KeyboardEvent('keydown', { code, bubbles: true }));
    win.dispatchEvent(new win.KeyboardEvent('keyup', { code, bubbles: true }));
    eq(`${code} → ${win.DATA.nodes[i].id}`, win.UI.current, win.DATA.nodes[i].id);
  });
  win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  eq('Escape closes', win.UI.current, null);
  win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'KeyH', bubbles: true }));
  ok('H opens help', doc.getElementById('help').classList.contains('open'));
  win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'KeyH', bubbles: true }));
  ok('H closes help', !doc.getElementById('help').classList.contains('open'));
  win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
  ok('FX button reflects state', /FX (ON|OFF)/.test(doc.getElementById('bloomBtn').textContent));

  console.log('\n=== 14b. lock note must never cover the panel text ===');
  {
    const note = doc.getElementById('lockNote');
    const panelsEl = doc.getElementById('panels');

    // z-order: panels sit above the note, so it can't overlap the words
    const zNote = win.getComputedStyle(note).zIndex;
    const zPanels = win.getComputedStyle(panelsEl).zIndex;
    ok('panels declare a z-index above the lock note',
      (parseInt(zPanels, 10) || 3) > (parseInt(zNote, 10) || 1),
      `panels=${zPanels} note=${zNote}`);

    // opening a panel marks the body so CSS can suppress the note + hints
    win.UI.openPanel('about');
    ok('opening a panel sets body.panel-open',
      doc.body.classList.contains('panel-open'));

    // and the JS guard hides it even when the mouse unlocks
    win.UI.setLocked(false);
    ok('unlocking with a panel open keeps the note hidden',
      note.classList.contains('hidden'));

    win.UI.closePanel();
    ok('closing the panel clears body.panel-open',
      !doc.body.classList.contains('panel-open'));
    win.UI.setLocked(false);
    if (win.IS_MOBILE) {
      // touch UI has no pointer lock, so the note stays hidden permanently
      ok('note stays hidden on touch devices', note.classList.contains('hidden'));
    } else {
      ok('note returns once the panel is closed',
        !note.classList.contains('hidden'));
    }
  }

  console.log('\n=== 14c. Esc is two-stage (unlock, then close) ===');
  if (!MOBILE && !FORCE_QS) {
    const canvas = doc.getElementById('scene');
    win.UI.openPanel('about');
    canvas.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('pointer locked with the panel open', W.locked === true);

    // first Esc: release the mouse but KEEP the panel so you can scroll it
    win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    ok('first Esc releases the mouse', W.locked === false);
    eq('first Esc keeps the panel open so you can read it', win.UI.current, 'about');

    // second Esc: now close it
    win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    eq('second Esc closes the panel', win.UI.current, null);
  }

  console.log('\n=== 14d. minimap is bigger and matches --map ===');
  {
    const cv = doc.getElementById('minimap');
    const expectCss = parseInt(MAP_CSS, 10);
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    eq('canvas backing store follows --map x dpr', cv.width, Math.round(expectCss * dpr));
    ok('canvas is square', cv.width === cv.height);
    eq('UI recorded the logical map size', win.UI.mapCss, expectCss);
    if (!MOBILE && !WEAK_GPU && !MID_GPU && !FORCE_QS) {
      ok('desktop map is 240px (was 176px in v6)', expectCss === 240, String(expectCss));
    }
    // drawing must not throw at any size
    let threw = null;
    try { win.UI.drawMinimap(); } catch (e) { threw = e; }
    ok('drawMinimap runs clean', threw === null, threw && threw.message);

    /* Assert what the map ACTUALLY draws. No fonts exist in CI, so a rendered
       PNG can't prove the labels are there — the recorded draw calls can. */
    const L2 = win.UI.mapCss;
    const log = win.UI.minimapCtx.__log;
    log.fillText.length = 0; log.strokeText.length = 0;
    log.fillRects.length = 0; log.arcs.length = 0;
    log.strokeRects.length = 0; log.dashes = 0;
    win.UI.drawMinimap();

    const S2 = cv.width;
    const E2 = win.CFG.mapExtent;

    ok('map extent is wider than the walkable bounds',
      E2 > win.CFG.bounds, `extent ${E2} vs bounds ${win.CFG.bounds}`);

    // tower footprints — the thing that made the map look empty when missing
    const towerRects = log.fillRects.filter(r => /150,170,235/.test(String(r.style)));
    if (L2 >= 118) {
      /* the low tier builds a single tower ring (14 towers), so the floor has
         to follow the tier rather than assume the full 52 */
      const minTowers = win.CFG.q.towerRings === 1 ? 10 : 20;
      ok('tower footprints are drawn', towerRects.length >= minTowers,
        `${towerRects.length} footprints, ${win.CFG.q.towerRings} ring(s)`);
      ok('footprints land inside the canvas',
        towerRects.every(r => r.x + r.w > -8 && r.x < S2 + 8),
        'all on-canvas');
      ok('every footprint is at least 2px',
        towerRects.every(r => r.w >= 2 && r.h >= 2));
    }

    // zone labels
    if (L2 >= 160) {
      const labels = log.fillText.map(f => f.s);
      win.DATA.nodes.forEach(n => {
        ok(`minimap labels ${n.label}`, labels.includes(n.label));
      });
      ok('labels have a dark halo behind them',
        log.strokeText.length === log.fillText.length,
        `${log.strokeText.length} halos / ${log.fillText.length} labels`);
      ok('label font is at least 7px', log.fillText.every(f => {
        const m = /(\d+)px/.exec(f.font); return m && Number(m[1]) >= 7;
      }));
    }

    // player marker + zone rings
    ok('zone trigger rings drawn', log.arcs.length >= win.DATA.nodes.length,
      `${log.arcs.length} arcs`);
    ok('walkable boundary is dashed', log.dashes > 0, `${log.dashes} dashed paths`);
    ok('radial vignette drawn', log.gradients > 0);

    // everything must fit: no draw call may sit entirely off-canvas
    const off = log.fillRects.filter(r =>
      r.x + r.w < 0 || r.y + r.h < 0 || r.x > S2 || r.y > S2);
    eq('no footprint is drawn entirely off-canvas', off.length, 0);
  }

  console.log('\n=== 15. quality tier + LIGHT BUDGET (the phone bug) ===');
  {
    const s = W.stats();
    ok('GPU probe ran', win.GPU && win.GPU.ok === true);
    ok('probe read the fragment uniform budget', win.GPU.fragUniforms > 0,
      String(win.GPU.fragUniforms));
    ok('a tier was chosen', ['low', 'mid', 'high', 'ultra'].includes(win.TIER), win.TIER);

    /* THE REGRESSION GUARD. v6 created 21 PointLights — 10 of them one per
       card — which overflowed a phone's fragment-uniform budget so the shader
       never linked and the canvas stayed black. Lights must now be capped. */
    ok('real lights never exceed the tier budget',
      s.lights <= s.lightBudget, `${s.lights} used / ${s.lightBudget} allowed`);
    ok('light budget is small enough for mobile GPUs',
      s.lightBudget <= 10, String(s.lightBudget));

    // count actual light instances in the scene graph, not just the counter
    let pointLights = 0, allLights = 0;
    W.scene.traverse(o => {
      const n = o.constructor && o.constructor.name;
      if (o instanceof T.PointLight) pointLights++;
      if (o instanceof T.PointLight || o instanceof T.AmbientLight ||
          o instanceof T.DirectionalLight || o instanceof T.HemisphereLight) allLights++;
    });
    ok('scene really contains no more PointLights than budgeted',
      pointLights <= s.lightBudget, `${pointLights} in scene`);
    ok('total lights stay well under a mobile shader limit',
      allLights <= 14, `${allLights} lights total`);

    // cards must NOT own real lights any more — that was the killer
    const cardsWithRealLights = W.cards.filter(c =>
      c.light && c.light.isPointLight === true).length;
    eq('no card owns a PointLight', cardsWithRealLights, 0);
    ok('every card still has a glow object', W.cards.every(c => !!c.light));
    ok('card glow is a Sprite (zero shader cost)',
      W.cards.every(c => c.light.isSprite === true));

    ok('shaders were pre-compiled so failures surface at boot',
      W.renderer._compiles > 0);

    if (win.TIER === 'low') {
      ok('low tier trims particles', win.CFG.q.particles <= 700, String(win.CFG.q.particles));
      ok('low tier drops holograms', win.CFG.q.holos === false);
      ok('low tier uses flat towers', win.CFG.q.towerDetail === 'flat');
    } else {
      ok('tower facades are textured', win.CFG.q.towerDetail === 'tex');
    }

if ((WEAK_GPU || MID_GPU) && !FORCED_TIER) {
      /* These are the real-world Android figures that black-screened v6.
         256 must fall to 'low' (conservative), 320 may take 'mid'. Either way
         the light cost has to fit with room to spare. */
      if (WEAK_GPU) eq('256-uniform GPU falls back to low', win.TIER, 'low');
      if (MID_GPU) eq('320-uniform GPU is classified as mid', win.TIER, 'mid');

      ok('weak-GPU light budget is 5 or fewer', s.lightBudget <= 5,
        String(s.lightBudget));
      ok('estimated light uniform cost fits with room to spare',
        pointLights * 6 < win.GPU.fragUniforms * 0.25,
        `~${pointLights * 6} vectors of ${win.GPU.fragUniforms}`);
      ok('film grain is off on a weak GPU', win.CFG.q.grain === false);
      ok('pixel ratio is capped on a weak GPU', win.CFG.q.pixelRatio <= 1.5,
        String(win.CFG.q.pixelRatio));
    }
  }

  console.log('\n=== 15b. draw-call budget (towers no longer explode) ===');
  {
    /* v6 built ~8 separate window-strip meshes per tower (~416 extra meshes).
       Those are baked into the facade texture now. */
    let meshes = 0, sprites = 0, lines = 0;
    W.scene.traverse(o => {
      if (o instanceof T.Mesh) meshes++;
      else if (o instanceof T.Sprite) sprites++;
      else if (o instanceof T.LineSegments) lines++;
    });
    const total = meshes + sprites + lines;
    /* v6 baseline was ~635 drawables, ~416 of them individual window strips.
       Those are baked into the facade texture now. 330 is a deliberate ceiling:
       generous enough for the full-detail tier, tight enough that re-adding
       per-feature meshes in a loop trips this test. */
    ok('scene object count stays sane', total < 330,
      `${total} drawables (${meshes} mesh, ${sprites} sprite, ${lines} line)`);
    ok('window strips are baked into textures, not meshed',
      meshes < 240, `${meshes} meshes`);
    ok('tower footprints recorded for the minimap',
      W.towerFootprints.length > 0, String(W.towerFootprints.length));
    ok('one footprint per tower body',
      W.towerFootprints.length <= 52, String(W.towerFootprints.length));

    /* The city must read as concentric rings on the minimap. Radial jitter has
       to stay smaller than the gap between rings, or the bands smear into one
       cloud (exactly what ±8 jitter did). Assert the invariant directly rather
       than clustering — clustering is flaky when random radii leave an
       accidental gap inside a single ring. */
    const RING_R = [68, 92, 120].slice(0, win.CFG.q.towerRings);
    const JITTER = 5;                      // ±5 in world.js
    const radii = W.towerFootprints.map(t => Math.hypot(t.x, t.z));

    const strays = radii.filter(r =>
      !RING_R.some(ring => Math.abs(r - ring) <= JITTER + 0.001));
    eq('every tower sits within its ring\'s jitter envelope', strays.length, 0);

    // envelopes must not touch, or the rings visually merge
    for (let i = 1; i < RING_R.length; i++) {
      const gap = (RING_R[i] - JITTER) - (RING_R[i - 1] + JITTER);
      ok(`ring ${i} and ${i + 1} leave a visible gap`, gap > 4,
        `${gap.toFixed(1)} units of clear space`);
    }

    // and each ring must actually be populated
    RING_R.forEach((ring, i) => {
      const n = radii.filter(r => Math.abs(r - ring) <= JITTER + 0.001).length;
      ok(`ring ${i + 1} (r=${ring}) has towers`, n > 0, `${n} towers`);
    });
  }

  console.log('\n=== 16. mobile UI presence ===');
  const bar = doc.getElementById('mobileBar');
  const joyEl = doc.getElementById('joy');
  ok('joystick markup exists', !!joyEl);
  ok('look pad exists', !!doc.getElementById('lookPad'));
  ok('sprint button exists', !!doc.getElementById('sprintBtn'));
  if (MOBILE || FORCE_QS) {
    ok('body gets .is-mobile', doc.body.classList.contains('is-mobile'));
    ok('mobile bar is shown', !bar.classList.contains('hidden'));
    ok('lock note hidden on mobile', doc.getElementById('lockNote').classList.contains('hidden'));

    // simulate a real drag on the stick
    const touch = (x, y, id = 1) => ({ clientX: x, clientY: y, identifier: id });
    const ev = (type, touches) => {
      const e = new win.Event(type, { bubbles: true, cancelable: true });
      e.changedTouches = touches; e.touches = touches;
      return e;
    };
    joyEl.dispatchEvent(ev('touchstart', [touch(103, 563)]));   // centre
    joyEl.dispatchEvent(ev('touchmove', [touch(103, 520)]));    // push up
    ok('drag up sets joy.y negative', W.joy.y < -0.2, `y=${W.joy.y.toFixed(2)}`);
    ok('joy marked active', W.joy.active === true);
    ok('knob moved', /translate/.test(doc.getElementById('joyKnob').style.transform));
    joyEl.dispatchEvent(ev('touchend', [touch(103, 520)]));
    ok('release zeroes the stick', W.joy.active === false && W.joy.x === 0 && W.joy.y === 0);

    // clamp: dragging far outside stays within range
    joyEl.dispatchEvent(ev('touchstart', [touch(103, 563)]));
    joyEl.dispatchEvent(ev('touchmove', [touch(900, 563)]));
    ok('stick magnitude clamped to 1', Math.hypot(W.joy.x, W.joy.y) <= 1.0001,
      `mag=${Math.hypot(W.joy.x, W.joy.y).toFixed(3)}`);
    joyEl.dispatchEvent(ev('touchend', [touch(900, 563)]));

    // sprint toggle
    const sb = doc.getElementById('sprintBtn');
    sb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('sprint toggles on', W.joy.sprint === true);
    ok('sprint button label changes', sb.textContent === 'RUN ON');
    sb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('sprint toggles off', !W.joy.sprint);

    // look pad turns the camera
    const pad = doc.getElementById('lookPad');
    const y0 = W.yaw;
    pad.dispatchEvent(ev('touchstart', [touch(600, 300, 9)]));
    pad.dispatchEvent(ev('touchmove', [touch(680, 300, 9)]));
    ok('look pad changes yaw', W.yaw !== y0, `${y0} → ${W.yaw}`);
    pad.dispatchEvent(ev('touchend', [touch(680, 300, 9)]));
  } else {
    ok('mobile bar hidden on desktop', bar.classList.contains('hidden'));
    const canvas = doc.getElementById('scene');
    canvas.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('pointer lock engages', W.locked === true);
    const y0 = W.yaw;
    doc.dispatchEvent(Object.assign(new win.MouseEvent('mousemove', { bubbles: true }), { movementX: 200, movementY: 0 }));
    ok('mouse look changes yaw', W.yaw !== y0);
    doc.exitPointerLock();
    ok('unlock clears keys', Object.keys(W.keys).length === 0);
  }

  console.log('\n=== 17. render loop + hud ===');
  const before = W.renderer._c;
  let n = 0;
  while (rafQueue.length && n < 6) { const q = rafQueue; rafQueue = []; q.forEach(fn => fn(16 * ++n)); }
  ok('frames rendered', W.renderer._c > before);
  W.camera.position.set(12.34, win.CFG.eyeHeight, -5.67);
  win.UI.updateHud(0.016);
  ok('coords show X and Z', /X\s+12\.3/.test(doc.getElementById('coords').textContent));

  console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
  process.exit(fail ? 1 : 0);
}
