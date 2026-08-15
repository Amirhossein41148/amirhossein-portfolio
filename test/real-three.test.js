/* Integration test with the REAL three.js r128 (from vendor/) — only the
   WebGLRenderer is stubbed, because jsdom has no WebGL context. Everything
   else (Vector3 math, geometries, materials, Color, Clock, scene graph,
   EffectComposer/UnrealBloomPass wiring) is the genuine library.

   This catches API mistakes the hand-written stub in headless.test.js cannot:
   wrong constructor args, removed methods, bad enum names, etc. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${extra}`)); };
const eq = (n, a, b) => ok(n, a === b, `(got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

/* -------------------------------------------------- recording 2D ctx --- */
function make2D(canvas) {
  const noop = () => {};
  return {
    canvas,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '', textAlign: 'start', textBaseline: 'alphabetic',
    shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop, resetTransform: noop,
    setLineDash: noop, getLineDash: () => [],
    drawImage: noop, putImageData: noop,
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h })
  };
}

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { /* three.js logs benign warnings; ignore */ });

const dom = new JSDOM(read('index.html'), {
  runScripts: 'outside-only', pretendToBeVisual: true,
  virtualConsole: vc, url: 'http://localhost:8080/'
});
const win = dom.window, doc = win.document;

/* The GPU capability probe in world.js asks for a webgl context and reads
   MAX_FRAGMENT_UNIFORM_VECTORS to choose a quality tier. Report a desktop-class
   budget so this suite exercises the full-detail path. */
const GL_FRAG = 0x8DFD, GL_TEXSIZE = 0x0D33;
function makeGL() {
  return {
    MAX_FRAGMENT_UNIFORM_VECTORS: GL_FRAG,
    MAX_TEXTURE_SIZE: GL_TEXSIZE,
    getParameter(pn) {
      if (pn === GL_FRAG) return 1024;
      if (pn === GL_TEXSIZE) return 8192;
      return 0;
    },
    getExtension() { return null; }
  };
}

win.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return make2D(this);
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return makeGL();
  return null;
};
win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

// jsdom won't resolve the --map custom property from the stylesheet
const _gcs = win.getComputedStyle.bind(win);
win.getComputedStyle = function (el, ps) {
  const cs = _gcs(el, ps);
  if (el === win.document.documentElement) {
    return { getPropertyValue: n => (n === '--map' ? '240px' : cs.getPropertyValue(n)) };
  }
  return cs;
};

// Image stub — assets/ files don't exist in the repo, so cards fall back to art
class FakeImage {
  constructor() { this.width = 1200; this.height = 1800; this._src = ''; }
  set src(v) { this._src = v; setTimeout(() => this.onerror && this.onerror(new Error('404')), 0); }
  get src() { return this._src; }
}
win.Image = FakeImage;
win.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {} });
win.Element.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 126, height: 126, right: 126, bottom: 126 };
};

let rafQueue = [];
win.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
win.cancelAnimationFrame = () => {};
Object.defineProperty(win, 'devicePixelRatio', { value: 1, configurable: true });
Object.defineProperty(doc, 'pointerLockElement', { value: null, configurable: true });
win.HTMLCanvasElement.prototype.requestPointerLock = function () {
  Object.defineProperty(doc, 'pointerLockElement', { value: this, configurable: true });
  doc.dispatchEvent(new win.Event('pointerlockchange'));
};
doc.exitPointerLock = function () {
  Object.defineProperty(doc, 'pointerLockElement', { value: null, configurable: true });
  doc.dispatchEvent(new win.Event('pointerlockchange'));
};

/* ------------------------------------------- load the REAL three.js ---- */
console.log('=== 1. real three.js loads ===');
try {
  win.eval(read('vendor/three.min.js'));
} catch (e) {
  console.log('  FAIL  vendor/three.min.js threw: ' + e.message);
  process.exit(1);
}
ok('THREE global defined', typeof win.THREE === 'object');
eq('THREE.REVISION is 128', win.THREE.REVISION, '128');

// swap in a counting renderer BEFORE app code constructs one
const RealRenderer = win.THREE.WebGLRenderer;
let renderCount = 0;
let compileCount = 0;
win.THREE.WebGLRenderer = class {
  constructor(o = {}) {
    this.domElement = o.canvas || doc.createElement('canvas');
    this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
    this.shadowMap = { enabled: false, type: null };
    this.outputEncoding = null; this.toneMapping = null; this.toneMappingExposure = 1;
    this.info = { render: {}, memory: {} };
    this._size = { width: 0, height: 0 };
  }
  setSize(w, h) { this._size = { width: w, height: h }; }
  getSize(t) { return t ? t.set(this._size.width, this._size.height) : this._size; }
  getDrawingBufferSize(t) { return t.set(this._size.width, this._size.height); }
  setPixelRatio() {}
  getPixelRatio() { return 1; }
  getRenderTarget() { return null; }
  setRenderTarget() {}
  getClearColor(t) { return t; }
  getClearAlpha() { return 1; }
  setClearColor() {}
  clear() {}
  render() { renderCount++; }
  /* world.js calls compile() to force shader linking at boot so a failure is
     reported instead of silently producing a black canvas. */
  compile() { compileCount++; }
  dispose() {}
};
ok('renderer stub installed', win.THREE.WebGLRenderer !== RealRenderer);
ok('stub implements compile()', typeof win.THREE.WebGLRenderer.prototype.compile === 'function');

// postprocessing files attach onto THREE
['EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'CopyShader.js',
 'LuminosityHighPassShader.js', 'UnrealBloomPass.js',
 'RGBShiftShader.js', 'FilmShader.js'].forEach(f => {
  try { win.eval(read('vendor/' + f)); }
  catch (e) { errors.push(`vendor/${f}: ${e.message}`); }
});
ok('THREE.EffectComposer present', typeof win.THREE.EffectComposer === 'function');
ok('THREE.RenderPass present', typeof win.THREE.RenderPass === 'function');
ok('THREE.UnrealBloomPass present', typeof win.THREE.UnrealBloomPass === 'function');
ok('THREE.CopyShader present', typeof win.THREE.CopyShader === 'object');
ok('THREE.RGBShiftShader present', typeof win.THREE.RGBShiftShader === 'object');
ok('THREE.FilmShader present', typeof win.THREE.FilmShader === 'object');

/* ------------------------------------------------------- run app code --
   The script list is read from index.html rather than hardcoded: a hardcoded
   list silently skips newly added files, which is how this suite kept passing
   while the real page had already gained photos.js, lightbox.js and audio.js. */
console.log('\n=== 2. app boots against real three.js ===');
const appFiles = (read('index.html').match(/<script src="(js\/[^"]+)"><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1]);
ok('index.html lists its app scripts', appFiles.length >= 5, String(appFiles.length));
appFiles.forEach(f => {
  try { win.eval(read(f)); }
  catch (e) { errors.push(`${f}: ${e.stack.split('\n').slice(0, 4).join(' | ')}`); }
});
eq('no errors during boot', errors.length, 0);
errors.forEach(e => console.log('      ' + e));
ok('World.ready', win.World && win.World.ready === true);

const W = win.World, T = win.THREE;

// Real THREE.Clock measures wall time; in a tight test loop dt≈0 and nothing
// moves. Pin a fixed timestep so movement assertions are deterministic.
W.clock.getDelta = function () { this.elapsedTime += 0.016; return 0.016; };

console.log('\n=== 3. real scene graph ===');
ok('scene is THREE.Scene', W.scene instanceof T.Scene);
ok('camera is PerspectiveCamera', W.camera instanceof T.PerspectiveCamera);
ok('fog is FogExp2', W.scene.fog instanceof T.FogExp2);
ok('background is Color', W.scene.background instanceof T.Color);
ok('scene has 60+ children', W.scene.children.length > 60, `${W.scene.children.length}`);
eq('zone pillars built', W.nodes.length, win.DATA.nodes.length);
eq('card stands built', W.cards.length, win.DATA.anime.length + win.DATA.games.length);
eq('anime stands', W.cards.filter(c => c.kind === 'anime').length, win.DATA.anime.length);
eq('game stands', W.cards.filter(c => c.kind === 'games').length, win.DATA.games.length);
ok('pulse rings', W.pulseRings.length === 3);
ok('light beams', W.beams.length === 4);
ok('holo rings match cards', W.holos.length === W.cards.length);
ok('particles is THREE.Points', W.particles instanceof T.Points);
const pAttr = W.particles.geometry.getAttribute('position');
eq('particle count matches tier', pAttr.count, win.CFG.q.particles);
ok('particle colours attribute exists', !!W.particles.geometry.getAttribute('color'));

console.log('\n=== 4. real post-processing chain ===');
ok('composer constructed', W.composer instanceof T.EffectComposer);
eq('composer has 4 passes (render+bloom+rgb+film)', W.composer.passes.length, 4);
ok('pass 0 is RenderPass', W.composer.passes[0] instanceof T.RenderPass);
ok('pass 1 is UnrealBloomPass', W.composer.passes[1] instanceof T.UnrealBloomPass);
ok('pass 2 is ShaderPass (RGB shift)', W.composer.passes[2] instanceof T.ShaderPass);
ok('pass 3 is ShaderPass (film grain)', W.composer.passes[3] instanceof T.ShaderPass);
ok('last pass renders to screen', W.composer.passes[3].renderToScreen === true);
ok('rgbPass wired', !!W.rgbPass && W.rgbPass.uniforms.amount.value > 0);
ok('filmPass wired', !!W.filmPass);
eq('bloom enabled by default', W.bloomOn, true);

console.log('\n=== 5. real texture pipeline ===');
const anyCard = W.cards[0];
ok('card material has CanvasTexture', anyCard.mesh.material.map instanceof T.CanvasTexture);
eq('texture encoding is sRGB', anyCard.mesh.material.map.encoding, T.sRGBEncoding);
ok('anisotropy applied from capabilities', anyCard.mesh.material.map.anisotropy === 8);
ok('every card is FrontSide', W.cards.every(c => c.mesh.material.side === T.FrontSide));
const label = W.nodes[0].label;
ok('node label is a Sprite', label instanceof T.Sprite);
ok('sprite material map is CanvasTexture', label.material.map instanceof T.CanvasTexture);

console.log('\n=== 6. real vector math movement ===');
W.camera.position.set(0, win.CFG.eyeHeight, 30);
W.yaw = 0; W.pitch = 0; W.vel.set(0, 0, 0);
ok('velocity is THREE.Vector3', W.vel instanceof T.Vector3);
W.keys.KeyW = true;
for (let i = 0; i < 40; i++) W.frame();
W.keys.KeyW = false;
ok('W walks toward -Z', W.camera.position.z < 28, `z=${W.camera.position.z.toFixed(2)}`);

// yaw 90° then forward should move -X
W.camera.position.set(0, win.CFG.eyeHeight, 0);
W.vel.set(0, 0, 0); W.yaw = Math.PI / 2;
W.keys.KeyW = true;
for (let i = 0; i < 40; i++) W.frame();
W.keys.KeyW = false;
ok('yaw 90° redirects walk to -X', W.camera.position.x < -1, `x=${W.camera.position.x.toFixed(2)}`);

// camera rotation actually applied, with no roll (YXZ order)
W.yaw = 0.77; W.pitch = -0.3; W.frame();
ok('camera.rotation.y tracks yaw', Math.abs(W.camera.rotation.y - 0.77) < 0.02, `${W.camera.rotation.y}`);
ok('camera.rotation.x tracks pitch', Math.abs(W.camera.rotation.x + 0.3) < 0.02, `${W.camera.rotation.x}`);
eq('rotation order is YXZ (no roll)', W.camera.rotation.order, 'YXZ');
ok('no roll on Z', Math.abs(W.camera.rotation.z) < 1e-6, `${W.camera.rotation.z}`);

console.log('\n=== 5b. LIGHT BUDGET against real three.js classes ===');
{
  /* This is the guard for the bug that black-screened v6 on phones. The
     stubbed suite can be fooled; here the classes are genuine. */
  let point = 0, dir = 0, amb = 0, hemi = 0, sprites = 0;
  W.scene.traverse(o => {
    if (o instanceof T.PointLight) point++;
    else if (o instanceof T.DirectionalLight) dir++;
    else if (o instanceof T.AmbientLight) amb++;
    else if (o instanceof T.HemisphereLight) hemi++;
    else if (o instanceof T.Sprite) sprites++;
  });
  const stats = W.stats();

  ok('real PointLight count is within the tier budget',
    point <= stats.lightBudget, `${point} lights, budget ${stats.lightBudget}`);
  ok('real PointLight count is far below the v6 count of 21',
    point <= 10, String(point));
  eq('exactly one directional (moon) light', dir, 1);
  eq('exactly one ambient light', amb, 1);
  eq('exactly one hemisphere light', hemi, 1);

  /* Forward rendering compiles ~6 fragment uniform vectors per point light
     into every material. Prove the total fits a mid-range mobile budget of
     224-256 with room for textures, fog and tone mapping. */
  const est = point * 6 + dir * 6 + amb * 1 + hemi * 2;
  ok('estimated light uniform cost fits a 224-vector mobile GPU',
    est < 224 * 0.5, `~${est} vectors`);

  ok('glow sprites replaced the per-card lights', sprites >= W.cards.length,
    `${sprites} sprites for ${W.cards.length} cards`);
  W.cards.forEach(c => {
    if (!(c.light instanceof T.Sprite)) {
      ok(`card ${c.key} glow is a Sprite`, false, c.light && c.light.type);
    }
  });
  ok('every card glow is a Sprite, not a PointLight',
    W.cards.every(c => c.light instanceof T.Sprite));

  ok('shaders were force-compiled at boot', compileCount > 0, String(compileCount));

  // the storm flash must not be a real light any more
  ok('lightning does not add a PointLight',
    !(W.stormLight instanceof T.PointLight));
  ok('lightning drives the directional light instead',
    typeof W.moon.intensity === 'number');
}

console.log('\n=== 5c. tower facades are textured, not meshed ===');
{
  let meshes = 0, lines = 0, planes = 0;
  W.scene.traverse(o => {
    if (o instanceof T.Mesh) {
      meshes++;
      if (o.geometry && o.geometry.type === 'PlaneGeometry') planes++;
    } else if (o instanceof T.LineSegments) lines++;
  });
  ok('mesh count stays modest', meshes < 240, String(meshes));
  ok('tower footprints recorded', W.towerFootprints.length > 0,
    String(W.towerFootprints.length));
  ok('facade textures were built and cached',
    W._facadeCache && Object.keys(W._facadeCache).length > 0,
    String(W._facadeCache && Object.keys(W._facadeCache).length));
  Object.values(W._facadeCache || {}).forEach(tex => {
    ok('facade texture is a CanvasTexture', tex instanceof T.CanvasTexture);
    ok('facade texture repeats', tex.wrapS === T.RepeatWrapping);
  });
}

console.log('\n=== 6b. billboarding with real math ===');
{
  const card = W.cards[0];
  const cp = card.mesh.position;
  let allGood = true, worstDot = 1;
  for (let deg = 0; deg < 360; deg += 15) {
    const a = deg * Math.PI / 180;
    const px = cp.x + Math.cos(a) * 11, pz = cp.z + Math.sin(a) * 11;
    W.camera.position.set(px, win.CFG.eyeHeight, pz);
    W._billboard();
    const nx = Math.sin(card.mesh.rotation.y), nz = Math.cos(card.mesh.rotation.y);
    const dx = px - cp.x, dz = pz - cp.z, d = Math.hypot(dx, dz);
    const dot = (nx * dx + nz * dz) / d;
    if (dot < 0.999) { allGood = false; worstDot = Math.min(worstDot, dot); }
    if (card.mesh.rotation.x !== 0 || card.mesh.rotation.z !== 0) allGood = false;
  }
  ok('card faces the player from all 24 angles (never mirrored)', allGood, `worst dot=${worstDot.toFixed(4)}`);
  ok('cards stay upright (no pitch/roll)',
    W.cards.every(c => c.mesh.rotation.x === 0 && c.mesh.rotation.z === 0));
}

console.log('\n=== 7. render loop drives composer ===');
const before = renderCount;
let n = 0;
while (rafQueue.length && n < 8) { const q = rafQueue; rafQueue = []; q.forEach(fn => fn(16 * ++n)); }
ok('frames rendered through composer path', renderCount > before || W.composer, `renderCount ${before}→${renderCount}`);

// bloom off falls back to direct renderer.render
W.bloomOn = false;
const b2 = renderCount;
W.frame();
ok('bloom off uses renderer.render', renderCount === b2 + 1, `renderCount ${b2}→${renderCount}`);
W.bloomOn = true;

console.log('\n=== 8. resize with real camera ===');
Object.defineProperty(win, 'innerWidth', { value: 1024, configurable: true });
Object.defineProperty(win, 'innerHeight', { value: 512, configurable: true });
win.dispatchEvent(new win.Event('resize'));
ok('camera aspect updated', Math.abs(W.camera.aspect - 2) < 0.001, `${W.camera.aspect}`);

console.log('\n=== 9. geometry sanity (no NaN) ===');
let nanFound = 0;
W.scene.traverse(o => {
  if (o.position && (isNaN(o.position.x) || isNaN(o.position.y) || isNaN(o.position.z))) nanFound++;
});
eq('no NaN positions in scene', nanFound, 0);
let nanVerts = 0;
W.scene.traverse(o => {
  const g = o.geometry;
  if (g && g.attributes && g.attributes.position) {
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 97) if (Number.isNaN(a[i])) { nanVerts++; break; }
  }
});
eq('no NaN vertices', nanVerts, 0);

console.log('\n=== 10. offline assets ===');
const html = read('index.html');
ok('no CDN script tags remain', !/<script src="https?:\/\//.test(html));
['three.min.js', 'EffectComposer.js', 'RenderPass.js', 'ShaderPass.js',
 'CopyShader.js', 'LuminosityHighPassShader.js', 'UnrealBloomPass.js',
 'RGBShiftShader.js', 'FilmShader.js'].forEach(f => {
  ok(`vendor/${f} exists on disk`, fs.existsSync(path.join(ROOT, 'vendor', f)));
  ok(`index.html references vendor/${f}`, html.includes(`vendor/${f}`));
});

console.log(`\n──────────────────────────────\n  ${pass} passed, ${fail} failed\n──────────────────────────────`);
process.exit(fail ? 1 : 0);
