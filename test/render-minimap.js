#!/usr/bin/env node
/* Renders the v7 minimap at every breakpoint size into one PNG contact sheet,
   using the REAL UI.drawMinimap() code driven by a real World scene graph.
   This is visual proof the bigger map keeps its detail as it scales down. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createCanvas } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SIZES = [
  { label: 'desktop  240px', css: 240 },
  { label: '≤1180px  200px', css: 200 },
  { label: '≤900px   170px', css: 170 },
  { label: '≤720px   140px', css: 140 },
  { label: '≤430px   118px', css: 118 }
];

const shots = [];

for (const size of SIZES) {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'outside-only', pretendToBeVisual: true,
    url: 'http://localhost:8080/'
  });
  const win = dom.window, doc = win.document;

  // real 2D contexts from @napi-rs/canvas
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') {
      if (!this.__c) this.__c = createCanvas(this.width || 300, this.height || 150);
      if (this.__c.width !== this.width || this.__c.height !== this.height) {
        this.__c = createCanvas(this.width, this.height);
      }
      this.__real = this.__c;
      const ctx = this.__c.getContext('2d');
      /* posters.js draws one canvas onto another. @napi-rs/canvas rejects a
         jsdom HTMLCanvasElement, so unwrap it to the backing napi canvas. */
      if (!ctx.__patched) {
        const orig = ctx.drawImage.bind(ctx);
        ctx.drawImage = function (img, ...rest) {
          const real = img && (img.__real || img.__c);
          return orig(real || img, ...rest);
        };
        ctx.__patched = true;
      }
      return ctx;
    }
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      const F = 0x8DFD, TS = 0x0D33;
      return {
        MAX_FRAGMENT_UNIFORM_VECTORS: F, MAX_TEXTURE_SIZE: TS,
        getParameter: p => (p === F ? 1024 : p === TS ? 8192 : 0),
        getExtension: () => null
      };
    }
    return null;
  };
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

  class FakeImage {
    constructor() { this.width = 1200; this.height = 1800; }
    set src(v) { this._s = v; setTimeout(() => this.onerror && this.onerror(new Error('404')), 0); }
    get src() { return this._s; }
  }
  win.Image = FakeImage;
  win.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {} });
  win.Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 126, height: 126, right: 126, bottom: 126 });
  win.requestAnimationFrame = () => 1;
  win.cancelAnimationFrame = () => {};
  Object.defineProperty(win, 'devicePixelRatio', { value: 2, configurable: true });

  // feed the breakpoint's --map value
  const gcs = win.getComputedStyle.bind(win);
  win.getComputedStyle = function (el, ps) {
    const cs = gcs(el, ps);
    if (el === doc.documentElement) {
      return { getPropertyValue: n => (n === '--map' ? size.css + 'px' : cs.getPropertyValue(n)) };
    }
    return cs;
  };

  // real three.js, stubbed renderer
  win.eval(read('vendor/three.min.js'));
  const T = win.THREE;
  win.THREE.WebGLRenderer = class {
    constructor(o = {}) {
      this.domElement = o.canvas || doc.createElement('canvas');
      this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
      this.shadowMap = {}; this.info = { render: {}, memory: {} };
      this._s = { width: 0, height: 0 };
    }
    setSize(w, h) { this._s = { width: w, height: h }; }
    getSize(t) { return t ? t.set(this._s.width, this._s.height) : this._s; }
    getDrawingBufferSize(t) { return t.set(this._s.width, this._s.height); }
    setPixelRatio() {} getPixelRatio() { return 1; }
    getRenderTarget() { return null; } setRenderTarget() {}
    getClearColor(t) { return t; } getClearAlpha() { return 1; }
    setClearColor() {} clear() {} render() {} compile() {} dispose() {}
  };
  ['EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'CopyShader.js',
   'LuminosityHighPassShader.js', 'UnrealBloomPass.js',
   'RGBShiftShader.js', 'FilmShader.js'].forEach(f => win.eval(read('vendor/' + f)));

  ['js/data.js', 'js/posters.js', 'js/world.js', 'js/ui.js', 'js/main.js']
    .forEach(f => win.eval(read(f)));

  const W = win.World;
  // walk somewhere interesting so the view cone and a zone are in play
  W.camera.position.set(-6, 1.7, 14);
  W.yaw = 0.9;
  win.UI._sizeMinimap();
  win.UI.drawMinimap();

  const cv = doc.getElementById('minimap');
  shots.push({
    label: size.label,
    css: size.css,
    canvas: cv.__real,
    px: cv.width,
    tier: win.TIER,
    towers: W.towerFootprints.length
  });
  console.log(`rendered ${size.label} -> backing store ${cv.width}px, ` +
              `tier ${win.TIER}, ${W.towerFootprints.length} tower footprints`);
}

/* ---- compose the contact sheet ---- */
const PAD = 22, LABEL = 30;
const maxH = Math.max(...shots.map(s => s.canvas.height));
const totalW = shots.reduce((a, s) => a + s.canvas.width + PAD, PAD);
const sheet = createCanvas(totalW, maxH + PAD * 2 + LABEL);
const c = sheet.getContext('2d');

c.fillStyle = '#04040a';
c.fillRect(0, 0, sheet.width, sheet.height);

let x = PAD;
for (const s of shots) {
  c.drawImage(s.canvas, x, PAD);
  c.fillStyle = '#00f5ff';
  c.font = '600 13px sans-serif';
  c.textAlign = 'left';
  c.fillText(s.label, x, PAD + maxH + 20);
  c.fillStyle = '#8d93b5';
  c.font = '11px sans-serif';
  c.fillText(`${s.px}px buffer @2x`, x, PAD + maxH + 34);
  x += s.canvas.width + PAD;
}

// os.tmpdir(): '/tmp' is C:\tmp on Windows and does not exist there.
const out = process.argv[2] || path.join(require('os').tmpdir(), 'minimap-proof.png');
fs.writeFileSync(out, sheet.toBuffer('image/png'));
console.log('\nwrote ' + out + '  (' + sheet.width + 'x' + sheet.height + ')');
