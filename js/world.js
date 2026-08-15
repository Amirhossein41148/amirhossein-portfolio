/* =========================================================================
   WORLD — the three.js city.

   v2 changes:
   • Card galleries (anime 600x900 + games 600x800) that BILLBOARD toward the
     player, so text is never mirrored and there is no "back side".
   • Photo support: assets/… images are used when present, drawn art otherwise.
   • More effects: bloom + RGB-shift chromatic aberration + film grain,
     lightning flashes, ground pulse rings, spinning holograms, light beams.
   • Quality tiers so phones stay smooth.
   Depends on: THREE r128, DATA, SIZES, makeCard/makePoster (posters.js)
   ========================================================================= */

/* ── URL overrides, handy for testing on a desktop ──────────────────────────
     ?mobile=1   force the touch UI (joystick + look pad)
     ?mobile=0   force the desktop UI
     ?fx=low     force the reduced-quality tier
     ?fx=high    force the full-quality tier
   ------------------------------------------------------------------------ */
const QS = new URLSearchParams(location.search);

const IS_MOBILE = QS.get('mobile') === '1' ? true
  : QS.get('mobile') === '0' ? false
  : (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent)
     || (window.matchMedia && matchMedia('(pointer: coarse)').matches));

/* ══════════════════ GPU CAPABILITY PROBE ══════════════════════════════════
   The v6 build died on phones with a BLACK SCREEN. Cause: three.js forward-
   renders, so every light is compiled as uniforms into every material's
   fragment shader. v6 created 21 PointLights (10 of them one-per-card), which
   needs ~126 uniform vectors before textures/fog/tonemapping are counted.
   Mid-range Android caps MAX_FRAGMENT_UNIFORM_VECTORS at 224-256, so the
   shader failed to LINK and nothing was ever drawn.

   So: ask the GPU what it can take, then pick a tier that fits. Never assume.
   ------------------------------------------------------------------------ */
function probeGPU() {
  const out = {
    ok: false, fragUniforms: 0, maxTexture: 0, renderer: '', tier: 'low',
    reason: '', gl: null, canvas: null, webgl2: false
  };

  /* CRITICAL: probe the REAL canvas we will render into, and keep the context.
     v7 created a throwaway probe canvas and then let three.js create a second
     context. Desktop browsers allow ~16 live WebGL contexts, but plenty of
     Android WebViews and older iOS Safari allow very few — sometimes one — so
     the renderer's context creation silently returned null and the scene never
     drew. One context, created once, handed to three.js. */
  let cv = null;
  try {
    cv = document.getElementById('scene');
  } catch (e) { /* fall through */ }
  if (!cv) {
    try { cv = document.createElement('canvas'); } catch (e) {
      out.reason = 'Cannot create a canvas element.';
      return out;
    }
  }
  out.canvas = cv;

  const attrs = {
    alpha: false, antialias: false, depth: true, stencil: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false
  };

  let gl = null;
  try {
    gl = cv.getContext('webgl2', attrs);
    if (gl) out.webgl2 = true;
    if (!gl) gl = cv.getContext('webgl', attrs);
    if (!gl) gl = cv.getContext('experimental-webgl', attrs);
  } catch (e) {
    out.reason = 'WebGL threw: ' + e.message;
    return out;
  }
  if (!gl) {
    out.reason = 'This browser or device refused to create a WebGL context. ' +
      'Hardware acceleration may be disabled.';
    return out;
  }

  out.ok = true;
  out.gl = gl;

  try {
    out.fragUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 0;
    out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) out.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
  } catch (e) { /* keep defaults */ }

  const u = out.fragUniforms;
  const soft = IS_MOBILE ? 0 : 1;
  // Tier from the real uniform budget, not from the user agent.
  if (u >= 900 && soft) out.tier = 'ultra';
  else if (u >= 500 && soft) out.tier = 'high';
  else if (u >= 260) out.tier = 'mid';
  else out.tier = 'low';

  /* A phone reporting a big budget is still a phone: thermal and fill-rate
     limited. Cap mobile at 'mid' regardless of what it claims. */
  if (IS_MOBILE && (out.tier === 'ultra' || out.tier === 'high')) out.tier = 'mid';

  return out;
}

const GPU = probeGPU();

/* ?fx=low|mid|high|ultra forces a tier; ?fx also still accepts low/high */
const FORCED = QS.get('fx');
const TIER = (FORCED && /^(low|mid|high|ultra)$/.test(FORCED)) ? FORCED : GPU.tier;
const FX_LOW = TIER === 'low' || TIER === 'mid';

/* ── Tier table ────────────────────────────────────────────────────────────
   `lights` is the hard cap on real PointLights added to the scene. Card glow
   and pillar glow fall back to additive meshes, which cost zero uniforms.
   ------------------------------------------------------------------------ */
const TIERS = {
  low:   { particles: 700,  floaters: 14, towerRings: 1, towerDetail: 'flat',
           bloom: 0.42, grain: false, rgb: false, pixelRatio: 1.25,
           lights: 3, beams: 2, pulses: 2, holos: false, antialias: false,
           minimap: 200, fog: 0.020, far: 300 },
  mid:   { particles: 1200, floaters: 22, towerRings: 2, towerDetail: 'tex',
           bloom: 0.52, grain: false, rgb: true, pixelRatio: 1.5,
           lights: 5, beams: 3, pulses: 3, holos: true, antialias: false,
           minimap: 220, fog: 0.018, far: 340 },
  high:  { particles: 2000, floaters: 38, towerRings: 3, towerDetail: 'tex',
           bloom: 0.66, grain: true, rgb: true, pixelRatio: 1.75,
           lights: 8, beams: 4, pulses: 3, holos: true, antialias: true,
           minimap: 240, fog: 0.016, far: 420 },
  ultra: { particles: 2600, floaters: 50, towerRings: 3, towerDetail: 'tex',
           bloom: 0.72, grain: true, rgb: true, pixelRatio: 2,
           lights: 10, beams: 4, pulses: 3, holos: true, antialias: true,
           minimap: 240, fog: 0.016, far: 420 }
};

const CFG = {
  walkSpeed: 7.6,
  sprintMul: 2.05,
  accel: 12,
  friction: 9,
  lookSens: 0.0022,
  touchSens: 0.0034,
  pitchLimit: Math.PI / 2.4,
  eyeHeight: 1.72,
  bob: { amp: 0.055, freq: 9.5 },
  bounds: 52,
  /* How much of the world the minimap covers. Larger than `bounds` on purpose:
     the tower rings sit at radius 68 / 92 / 120, so a map limited to the
     walkable area (52) showed an empty square. 100 fits the first two rings
     whole and clips the third to arcs, which reads as a real city plan. */
  mapExtent: 100,

  tier: TIER,
  gpu: GPU,
  q: TIERS[TIER] || TIERS.low,

  colors: {
    cyan: 0x00f5ff, pink: 0xff006e, purple: 0xbf00ff,
    gold: 0xffbe0b, mint: 0x00ff9d, bg: 0x04040a
  }
};

const World = {
  scene: null, camera: null, renderer: null, composer: null, clock: null,
  bloomPass: null, rgbPass: null, filmPass: null,
  nodes: [], cards: [], particles: null, floaters: [], ringSpinners: [],
  pulseRings: [], beams: [], holos: [], towerFootprints: [],
  yaw: 0, pitch: 0,
  vel: null,
  keys: Object.create(null),
  joy: { x: 0, y: 0, active: false },     // -1..1 from the on-screen stick
  locked: false, bobT: 0, activeNode: null,
  bloomOn: true, ready: false,
  inputBlocked: false,                    // true while the lightbox is open
  storm: { t: 3, flash: 0 },
  _tmpV: null,
  lightBudget: 0, lightsUsed: 0, renderFails: 0,

  /* Only hands out a real PointLight while the tier's budget allows it.
     Everything else gets an additive glow sprite, which costs no uniforms —
     this is what keeps the fragment shader inside a phone's limit. */
  _light(colour, intensity, distance, decay) {
    if (this.lightsUsed >= this.lightBudget) return null;
    this.lightsUsed++;
    return new THREE.PointLight(colour, intensity, distance, decay || 2);
  },

  /* Fake glow: a camera-facing additive disc. Zero shader cost. */
  _glowSprite(colour, size, opacity) {
    if (!this._glowTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
      this._glowTex = new THREE.CanvasTexture(cv);
    }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: colour, transparent: true,
      opacity: opacity == null ? 0.55 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spr.scale.set(size, size, 1);
    return spr;
  },

  /* Drop everything built so far so init() can be retried from scratch on a
     lower tier. Without this the retry would stack a second scene on top of the
     first and run out of memory on the very device we're trying to rescue. */
  reset() {
    this.ready = false;
    try {
      if (this.scene) {
        this.scene.traverse(o => {
          if (o.geometry && o.geometry.dispose) o.geometry.dispose();
          const m = o.material;
          if (m) {
            (Array.isArray(m) ? m : [m]).forEach(mm => {
              if (mm.map && mm.map.dispose) mm.map.dispose();
              if (mm.dispose) mm.dispose();
            });
          }
        });
      }
    } catch (e) { /* best effort */ }

    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.bloomPass = this.rgbPass = this.filmPass = null;
    this.nodes = [];
    this.cards = [];
    this.floaters = [];
    this.ringSpinners = [];
    this.pulseRings = [];
    this.beams = [];
    this.holos = [];
    this.towerFootprints = [];
    this.particles = null;
    this._facadeCache = {};
    this.lightsUsed = 0;
    this.renderFails = 0;

    // keep the same renderer/context — creating another is what mobile hates
    if (this.renderer && this.renderer.renderLists) {
      try { this.renderer.renderLists.dispose(); } catch (e) { /* ignore */ }
    }
  },

  /* Rewrite the active tier to the cheapest settings for a retry. */
  forceLowTier() {
    CFG.tier = 'low';
    CFG.q = TIERS.low;
    this.bloomOn = false;
    if (typeof window !== 'undefined') window.TIER = 'low';
  },

  /* ---------------------------------------------------------------- init */
  init(canvas) {
    if (!GPU.ok) throw new Error(GPU.reason || 'WebGL unavailable');
    if (window.__bootlog) __bootlog('Starting renderer…');

    this.lightBudget = CFG.q.lights;
    this.lightsUsed = 0;

    this.clock = new THREE.Clock();
    this.vel = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CFG.colors.bg);
    this.scene.fog = new THREE.FogExp2(CFG.colors.bg, CFG.q.fog);

    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, CFG.q.far);
    // YXZ: yaw on Y then pitch on X. Any other order bleeds pitch into roll
    // and visibly tilts the horizon while looking around.
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, CFG.eyeHeight, 10);

    /* Reuse the renderer across a retry. Building a second WebGLRenderer means
       a second context, which is exactly what mobile refuses. */
    if (!this.renderer) {
      const opts = {
        canvas,
        antialias: CFG.q.antialias,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false
      };
      if (GPU.gl && GPU.canvas === canvas) opts.context = GPU.gl;

      try {
        this.renderer = new THREE.WebGLRenderer(opts);
      } catch (e) {
        // last resort: let three.js make its own context with plain defaults
        if (window.__bootlog) __bootlog('Retrying renderer without shared context…');
        this.renderer = new THREE.WebGLRenderer({
          canvas, antialias: false, failIfMajorPerformanceCaveat: false
        });
      }
    }

    /* Mobile GPUs are fill-rate bound: at devicePixelRatio 3 a 1080p phone
       renders ~7M pixels a frame and thermally throttles within seconds. */
    const dpr = Math.min(devicePixelRatio || 1, CFG.q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    /* If the context is lost (backgrounded tab, GPU reset, thermal throttle)
       the canvas goes black permanently unless we handle it. */
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.contextLost = true;
      if (window.__bootFail) {
        __bootFail('The graphics context was lost.',
          'This usually means the GPU reset or the device ran low on memory. Reload to recover.');
      }
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });

    if (window.__bootlog) __bootlog('Building the city…');
    this._lights();
    this._ground();
    this._skyDome();
    this._city();
    this._centralTower();
    this._nodes();
    this._galleries();
    this._particles();
    this._floaters();
    this._pulseRings();
    this._beams();

    if (window.__bootlog) __bootlog('Compiling shaders…');
    this._composer();

    /* Force every shader to compile NOW, while we can still report a failure,
       instead of discovering it silently on the first frame. On a device that
       can't take the scene this is where it throws — with a message. */
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      throw new Error('Shader compilation failed: ' + (e && e.message ? e.message : e));
    }

    /* Draw one frame right now, before the loader is dismissed. If the GPU
       can't render this scene we find out here, synchronously, and can report
       it — rather than hiding the loader to reveal a black page. */
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (e) {
      throw new Error('First render failed: ' + (e && e.message ? e.message : e));
    }

    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 250));
    this.ready = true;
    if (window.__bootlog) __bootlog('Scene ready.');
  },

  /* -------------------------------------------------------------- lights */
  _lights() {
    // The three global lights are cheap and always present.
    this.scene.add(new THREE.AmbientLight(0x2a2a52, IS_MOBILE ? 1.15 : 0.9));

    this.moon = new THREE.DirectionalLight(0x8f9cff, 0.55);
    this.moon.position.set(44, 80, -34);
    this.scene.add(this.moon);

    this.scene.add(new THREE.HemisphereLight(0x203a6a, 0x0a0a14, IS_MOBILE ? 0.68 : 0.5));

    // Corner accents: orb + additive glow always, real light only if budget
    // remains after the important ones (pillars) have taken theirs.
    const rim = [
      [-38, 7, -38, CFG.colors.cyan], [38, 7, -38, CFG.colors.pink],
      [-38, 7, 38, CFG.colors.purple], [38, 7, 38, CFG.colors.gold]
    ];
    rim.forEach(([x, y, z, c]) => {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 12),
        new THREE.MeshBasicMaterial({ color: c })
      );
      orb.position.set(x, y, z);
      this.scene.add(orb);

      const glow = this._glowSprite(c, 7, 0.4);
      glow.position.set(x, y, z);
      this.scene.add(glow);

      this.floaters.push({ mesh: orb, kind: 'spinY', speed: 0.6 });
    });

    // Lightning: reuse the directional moon light instead of adding a point
    // light, so the flash costs nothing extra in the shader.
    this.stormLight = { intensity: 0 };   // kept for API compatibility
  },

  /* -------------------------------------------------------------- ground */
  _ground() {
    const size = CFG.bounds * 2 + 46;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0x080810, metalness: 0.93, roughness: 0.26 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const g1 = new THREE.GridHelper(size, 92, CFG.colors.cyan, 0x101024);
    g1.material.opacity = 0.30; g1.material.transparent = true;
    g1.position.y = 0.02; this.scene.add(g1);

    const g2 = new THREE.GridHelper(CFG.bounds, 24, CFG.colors.pink, 0x14041c);
    g2.material.opacity = 0.20; g2.material.transparent = true;
    g2.position.y = 0.03; this.scene.add(g2);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CFG.bounds + 1.5, 0.10, 8, 128),
      new THREE.MeshBasicMaterial({ color: CFG.colors.cyan, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.9;
    this.scene.add(ring);
  },

  _skyDome() {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(165, 165, 78, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x1a1040, side: THREE.BackSide, transparent: true, opacity: 0.55 })
    );
    cyl.position.y = 24;
    this.scene.add(cyl);
  },

  /* ---------------------------------------------------------------- city
     v7: window strips are BAKED INTO A TEXTURE instead of being ~8 separate
     meshes per tower. v6 spawned ~416 strip meshes + 104 body/edge meshes;
     that alone was ~600 draw calls a frame. Now each tower is 1 mesh (+1
     shared-material edge outline on capable tiers), so the look is kept but
     the GPU work collapses by roughly 10x.
     -------------------------------------------------------------------- */
  _facadeTexture(accent) {
    this._facadeCache = this._facadeCache || {};
    const key = accent;
    if (this._facadeCache[key]) return this._facadeCache[key];

    const W = 128, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    c.fillStyle = '#0c0c18';
    c.fillRect(0, 0, W, H);

    const hex = '#' + accent.toString(16).padStart(6, '0');
    const rows = 26, cols = 6;
    const cellW = W / cols, cellH = H / rows;

    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const lit = Math.random();
        if (lit < 0.42) continue;                 // dark window
        c.globalAlpha = 0.22 + Math.random() * 0.62;
        c.fillStyle = lit > 0.88 ? '#ffffff' : hex;
        const pad = cellW * 0.22;
        c.fillRect(k * cellW + pad, r * cellH + cellH * 0.24,
                   cellW - pad * 2, cellH * 0.42);
      }
    }

    // horizontal floor bands
    c.globalAlpha = 0.16;
    c.fillStyle = hex;
    for (let r = 0; r < rows; r += 4) {
      c.fillRect(0, r * cellH + cellH * 0.9, W, 1.4);
    }
    c.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._facadeCache[key] = tex;
    return tex;
  },

  _city() {
    const specs = [
      { r: 68, n: 14, hMin: 14, hMax: 40 },
      { r: 92, n: 18, hMin: 20, hMax: 64 },
      { r: 120, n: 20, hMin: 26, hMax: 80 }
    ].slice(0, CFG.q.towerRings);

    const accents = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple, CFG.colors.gold];
    const flat = CFG.q.towerDetail === 'flat';
    let i = 0;

    // one shared material per accent → the renderer can batch state changes
    const mats = accents.map(col => flat
      ? new THREE.MeshBasicMaterial({ color: 0x11111e })
      : new THREE.MeshStandardMaterial({
          color: 0xffffff, map: this._facadeTexture(col),
          metalness: 0.55, roughness: 0.55
        })
    );

    specs.forEach(({ r, n, hMin, hMax }) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.16;
        /* Jitter is deliberately smaller than the 24-unit gap between rings
           (was ±8, which smeared the three rings into one cloud on the
           minimap). ±5 keeps the skyline organic but the city plan legible. */
        const rr = r + (Math.random() - 0.5) * 10;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const w = 6 + Math.random() * 9, d = 6 + Math.random() * 9;
        const h = hMin + Math.random() * (hMax - hMin);
        const idx = i++ % accents.length;
        const col = accents[idx];

        const geo = new THREE.BoxGeometry(w, h, d);
        const body = new THREE.Mesh(geo, mats[idx]);
        body.position.set(x, h / 2, z);
        this.scene.add(body);

        // remembered so the minimap can draw a real city plan
        this.towerFootprints.push({ x, z, w, d, h });

        // Edge outline keeps the wireframe-neon look; skipped on the low tier.
        if (!flat) {
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.32 })
          );
          edges.position.copy(body.position);
          this.scene.add(edges);
        }

        if (h > 46) {
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 8, 8),
            new THREE.MeshBasicMaterial({ color: CFG.colors.pink })
          );
          beacon.position.set(x, h + 0.7, z);
          this.scene.add(beacon);
          this.floaters.push({ mesh: beacon, kind: 'blink', t: Math.random() * 10 });
        }
      }
    });
  },

  _centralTower() {
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 2.6, 36, 10),
      new THREE.MeshStandardMaterial({ color: 0x0b0b16, metalness: 0.9, roughness: 0.2 })
    );
    spire.position.y = 18; this.scene.add(spire);

    const tipLight = this._light(CFG.colors.cyan, 3.4, 76);
    if (tipLight) { tipLight.position.set(0, 37, 0); this.scene.add(tipLight); }

    // glow sprite carries the look whether or not a real light was available
    const tipGlow = this._glowSprite(0xdcfaff, 14, 0.5);
    tipGlow.position.set(0, 37, 0);
    this.scene.add(tipGlow);

    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xdcfaff })
    );
    tip.position.y = 37; this.scene.add(tip);
    this.floaters.push({ mesh: tip, kind: 'spinY', speed: 0.5 });

    const cols = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple, CFG.colors.gold, CFG.colors.mint];
    const nRings = CFG.q.towerDetail === 'flat' ? 4 : 6;
    for (let i = 0; i < nRings; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.5 + i * 0.58, 0.085, 8, 64),
        new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.74 })
      );
      ring.position.y = 4.5 + i * 5.4;
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
      this.ringSpinners.push({ mesh: ring, dir: i % 2 ? 1 : -1, speed: 0.20 + i * 0.055 });
    }
  },

  /* -------------------------------------------------------------- nodes */
  _labelSprite(text, colourHex, scale = 6.6) {
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 160;
    const c = cv.getContext('2d');
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = colourHex; c.shadowBlur = 28;
    c.fillStyle = colourHex;
    c.font = '700 76px Orbitron, system-ui, sans-serif';
    c.fillText(text, 320, 84);
    c.shadowBlur = 0; c.globalAlpha = 0.35; c.fillStyle = '#ffffff';
    c.fillText(text, 320, 84);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    /* 640x160 is not power-of-two. WebGL1 — i.e. most Android browsers — cannot
       build mipmaps for a NPOT texture and renders it BLACK if you ask it to.
       Clamp and use non-mip filtering so the zone labels are visible on a phone. */
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(scale, scale / 4, 1);
    return spr;
  },

  _nodes() {
    DATA.nodes.forEach(n => {
      const g = new THREE.Group();
      const hex = '#' + n.colour.toString(16).padStart(6, '0');

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.5, 0.42, 6),
        new THREE.MeshStandardMaterial({ color: 0x11111f, metalness: 0.88, roughness: 0.24 })
      );
      base.position.y = 0.21; g.add(base);

      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(2.28, 0.075, 8, 40),
        new THREE.MeshBasicMaterial({ color: n.colour })
      );
      trim.rotation.x = Math.PI / 2; trim.position.y = 0.46; g.add(trim);

      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.30, 0.36, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.94, roughness: 0.16 })
      );
      col.position.y = 2.1; g.add(col);

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.80, 1),
        new THREE.MeshBasicMaterial({ color: n.colour, transparent: true, opacity: 0.92 })
      );
      core.position.y = 4.6; g.add(core);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.38, 0.05, 8, 48),
        new THREE.MeshBasicMaterial({ color: n.colour, transparent: true, opacity: 0.6 })
      );
      halo.position.y = 4.6; halo.rotation.x = Math.PI / 2.6; g.add(halo);

      const light = this._light(n.colour, 2.4, 28);
      if (light) { light.position.y = 4.6; g.add(light); }

      // always-present additive glow so the pillar reads as lit even when the
      // light budget is spent (low-end phones)
      const glow = this._glowSprite(n.colour, 6.5, 0.5);
      glow.position.y = 4.6; g.add(glow);

      const label = this._labelSprite(n.label, hex);
      label.position.y = 6.8; g.add(label);

      const prox = new THREE.Mesh(
        new THREE.RingGeometry(n.radius - 0.12, n.radius, 56),
        new THREE.MeshBasicMaterial({
          color: n.colour, transparent: true, opacity: 0.18, side: THREE.DoubleSide
        })
      );
      prox.rotation.x = -Math.PI / 2; prox.position.y = 0.05; g.add(prox);

      g.position.set(n.x, 0, n.z);
      this.scene.add(g);

      this.nodes.push({
        id: n.id, group: g, core, halo, light, glow, prox, label,
        position: new THREE.Vector3(n.x, 0, n.z),
        radius: n.radius, baseIntensity: 2.4
      });
    });
  },

  /* ══════════════════════════ CARD GALLERIES ══════════════════════════
     One monolith per card. Each is a BILLBOARD: every frame it yaws to face
     the player (upright, no tilt), so you always read the front and the text
     can never appear mirrored. The old fixed-orientation panels are gone.
     ================================================================= */
  _makeCardMesh(entry, size, kind) {
    const target = { w: size.w, h: size.h };
    // world size: keep the exact source aspect ratio
    const worldH = kind === 'anime' ? 5.4 : 4.8;
    const worldW = worldH * (target.w / target.h);

    /* forTexture:true — a canvas that has been tainted by a file:// photo
       cannot be uploaded to WebGL: three.js throws SecurityError on EVERY
       frame and the whole scene goes black. makeCard checks for that and
       keeps the drawn art instead, which is always safe. The photo still
       shows on the DOM card in the panel, where readback is never needed.
       `decor` repaints the frame + title over the photo. */
    const decor = {
      title: entry.title || entry.name || '',
      sub: entry.sub || entry.note || '',
      accent: entry.css || '#00f5ff'
    };

    /* ░░ WHY THIS USES PHOTOS[] AND NOT entry.img ░░
       A photo loaded from a file:// URL taints any canvas it is drawn into, and
       WebGL rejects a tainted canvas: texImage2D throws SecurityError. Verified
       in Chrome — both the raw <img> and the canvas route fail:
         raw Image  -> "The image element contains cross-origin data"
         via canvas -> "Tainted canvases may not be loaded"
       There is no header you can set on a file:// URL to fix that, which is why
       the card stands in the gallery rings NEVER showed a real picture while the
       DOM cards in the panels did — those only need to be displayed, not read
       back. js/photos.js carries the same pictures as data: URIs, which count as
       same-origin and so upload cleanly. Falls back to the plain asset path if
       photos.js has not been baked. */
    const baked = (typeof PHOTOS !== 'undefined' && PHOTOS[entry.key]) || null;
    const src = baked || entry.img;

    const cv = makeCard(entry.key, src, target.w, target.h, (canvas, used) => {
      // when the photo finishes loading, refresh the texture.
      // `mesh` is assigned a few lines below; the callback is always async, but
      // guard anyway so a synchronous future change can never throw here and
      // take the whole boot down with it.
      if (typeof mesh !== 'undefined' && mesh.material && mesh.material.map) {
        mesh.material.map.needsUpdate = true;
        mesh._usedPhoto = !!used;
      }
    }, { forTexture: true, decor });

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    /* A 600x900 canvas is not power-of-two. WebGL1 (every older Android
       browser) cannot mip a NPOT texture: it silently renders BLACK unless
       both filters are non-mip and wrapping is clamped. Desktop WebGL2 hid
       this, phones did not. */
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

    // FrontSide only: with billboarding you never see the back, and this
    // guarantees no mirrored text even for a single frame.
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, transparent: false })
    );

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW + 0.30, worldH + 0.30),
      new THREE.MeshBasicMaterial({ color: entry.accent, transparent: true, opacity: 0.42 })
    );

    return { mesh, frame, worldW, worldH, canvas: cv, srcW: target.w, srcH: target.h };
  },

  _galleries() {
    DATA.nodes.forEach(node => {
      if (!node.gallery) return;
      const list = DATA[node.gallery];
      const size = node.gallery === 'anime' ? SIZES.anime : SIZES.game;
      const R = node.gallery === 'anime' ? 10.5 : 9.6;

      list.forEach((entry, i) => {
        const t = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        const x = node.x + Math.cos(t) * R;
        const z = node.z + Math.sin(t) * R;

        const built = this._makeCardMesh(entry, size, node.gallery);
        const { mesh, frame, worldW, worldH, canvas, srcW, srcH } = built;
        const yBase = worldH / 2 + 1.30;

        mesh.position.set(x, yBase, z);
        frame.position.set(x, yBase, z);
        this.scene.add(frame);
        this.scene.add(mesh);

        // pedestal
        const ped = new THREE.Mesh(
          new THREE.CylinderGeometry(1.25, 1.45, 1.30, 6),
          new THREE.MeshStandardMaterial({ color: 0x101020, metalness: 0.85, roughness: 0.3 })
        );
        ped.position.set(x, 0.65, z);
        this.scene.add(ped);

        const pedRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.32, 0.05, 8, 32),
          new THREE.MeshBasicMaterial({ color: entry.accent })
        );
        pedRing.rotation.x = Math.PI / 2;
        pedRing.position.set(x, 1.31, z);
        this.scene.add(pedRing);

        /* v6 gave every card its own PointLight — 10 lights, which is what
           blew the phone's fragment-uniform budget and black-screened the
           whole scene. Now it's an additive glow sprite: same neon look,
           zero shader cost. */
        const pl = this._glowSprite(entry.accent, 6.2, 0.42);
        pl.position.set(x, 3.6, z);
        this.scene.add(pl);

        // hologram ring that spins around the card (skipped on the low tier)
        if (CFG.q.holos) {
          const holo = new THREE.Mesh(
            new THREE.TorusGeometry(1.9, 0.028, 6, 40),
            new THREE.MeshBasicMaterial({
              color: entry.accent, transparent: true, opacity: 0.45,
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
          holo.position.set(x, yBase, z);
          holo.rotation.x = Math.PI / 2.2;
          this.scene.add(holo);
          this.holos.push({ mesh: holo, speed: 0.6 + Math.random() * 0.5 });
        }

        this.cards.push({
          kind: node.gallery, key: entry.key, mesh, frame, light: pl,
          base: yBase, phase: i * 0.7, accent: entry.accent,
          worldW, worldH, srcW, srcH, canvas
        });
      });
    });
  },

  /* ----------------------------------------------------------- particles */
  _particles() {
    const N = CFG.q.particles;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const pal = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple, CFG.colors.gold, CFG.colors.mint]
      .map(h => new THREE.Color(h));

    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
      const c = pal[(Math.random() * pal.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.21, vertexColors: true, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    this.scene.add(this.particles);
  },

  _floaters() {
    const pal = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple, CFG.colors.gold, CFG.colors.mint];
    const nCube = Math.round(CFG.q.floaters * 0.68);
    const nRing = CFG.q.floaters - nCube;

    for (let i = 0; i < nCube; i++) {
      const s = 0.28 + Math.random() * 0.62;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({
          color: pal[(Math.random() * pal.length) | 0], transparent: true, opacity: 0.42,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      m.position.set((Math.random() - 0.5) * 84, 3 + Math.random() * 24, (Math.random() - 0.5) * 84);
      this.scene.add(m);
      this.floaters.push({
        mesh: m, kind: 'drift', baseY: m.position.y, phase: Math.random() * 6.28,
        rx: (Math.random() - 0.5) * 0.7, ry: (Math.random() - 0.5) * 0.7,
        amp: 0.4 + Math.random() * 1.1, speed: 0.4 + Math.random() * 0.8
      });
    }
    for (let i = 0; i < nRing; i++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.75 + Math.random() * 0.9, 0.035, 6, 30),
        new THREE.MeshBasicMaterial({
          color: pal[(Math.random() * pal.length) | 0], transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      m.position.set((Math.random() - 0.5) * 76, 4 + Math.random() * 22, (Math.random() - 0.5) * 76);
      m.rotation.set(Math.random() * 3.14, Math.random() * 3.14, 0);
      this.scene.add(m);
      this.floaters.push({
        mesh: m, kind: 'drift', baseY: m.position.y, phase: Math.random() * 6.28,
        rx: (Math.random() - 0.5) * 0.5, ry: (Math.random() - 0.5) * 0.9,
        amp: 0.5 + Math.random() * 1.2, speed: 0.35 + Math.random() * 0.7
      });
    }
  },

  /* expanding rings on the floor, like a synth pulse */
  _pulseRings() {
    const pal = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple];
    const n = CFG.q.pulses;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.25, 64),
        new THREE.MeshBasicMaterial({
          color: pal[i % pal.length], transparent: true, opacity: 0.5, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.06;
      this.scene.add(m);
      this.pulseRings.push({ mesh: m, t: i * 1.5, period: 4.5, max: CFG.bounds * 0.85 });
    }
  },

  /* vertical light shafts sweeping the sky */
  _beams() {
    const pal = [CFG.colors.cyan, CFG.colors.pink, CFG.colors.purple, CFG.colors.gold];
    const n = CFG.q.beams;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.CylinderGeometry(0.10, 2.4, 46, 10, 1, true);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: pal[i % pal.length], transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
      const a = (i / n) * Math.PI * 2;
      m.position.set(Math.cos(a) * 30, 23, Math.sin(a) * 30);
      this.scene.add(m);
      this.beams.push({ mesh: m, phase: i * 1.6, tilt: 0.16 });
    }
  },

  /* ----------------------------------------------------------- composer */
  _composer() {
    const need = ['EffectComposer', 'RenderPass', 'ShaderPass', 'UnrealBloomPass'];
    if (!need.every(k => typeof THREE[k] === 'function')) {
      this.bloomOn = false; this.composer = null; return;
    }
    try {
      this.composer = new THREE.EffectComposer(this.renderer);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

      // Bloom at half resolution on weak tiers — the biggest single win for
      // fill-rate-limited mobile GPUs, and visually near-identical.
      const scale = CFG.tier === 'low' ? 0.5 : CFG.tier === 'mid' ? 0.7 : 1;
      this.bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(innerWidth * scale, innerHeight * scale),
        CFG.q.bloom, 0.55, 0.22
      );
      this.composer.addPass(this.bloomPass);

      // chromatic aberration — subtle, ramps up when sprinting
      if (THREE.RGBShiftShader && CFG.q.rgb) {
        this.rgbPass = new THREE.ShaderPass(THREE.RGBShiftShader);
        this.rgbPass.uniforms.amount.value = 0.0011;
        this.composer.addPass(this.rgbPass);
      }
      // film grain + scanlines
      if (THREE.FilmShader && CFG.q.grain) {
        this.filmPass = new THREE.ShaderPass(THREE.FilmShader);
        const u = this.filmPass.uniforms;
        if (u.nIntensity) u.nIntensity.value = 0.22;
        if (u.sIntensity) u.sIntensity.value = 0.14;
        if (u.sCount) u.sCount.value = 900;
        if (u.grayscale) u.grayscale.value = 0;
        this.composer.addPass(this.filmPass);
      }
      const last = this.composer.passes[this.composer.passes.length - 1];
      if (last) last.renderToScreen = true;
    } catch (e) {
      console.warn('[world] post-processing unavailable:', e);
      this.composer = null; this.bloomOn = false;
    }
  },

  toggleBloom() {
    if (!this.composer) return false;
    this.bloomOn = !this.bloomOn;
    return this.bloomOn;
  },

  _resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;                 // phones report 0 mid-rotation
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloomPass && this.bloomPass.resolution) {
      const scale = CFG.tier === 'low' ? 0.5 : CFG.tier === 'mid' ? 0.7 : 1;
      this.bloomPass.resolution.set(w * scale, h * scale);
    }
  },

  /* ------------------------------------------------------------ control */
  look(dx, dy, sens) {
    if (this.inputBlocked) return;      // a modal is up — see _move()
    const s = sens || CFG.lookSens;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-CFG.pitchLimit, Math.min(CFG.pitchLimit, this.pitch));
  },

  teleportTo(id) {
    const n = this.nodes.find(x => x.id === id);
    if (!n) return;
    const len = Math.hypot(n.position.x, n.position.z) || 1;
    const k = (len + 7) / len;
    this.camera.position.set(n.position.x * k, CFG.eyeHeight, n.position.z * k);
    this.yaw = Math.atan2(
      this.camera.position.x - n.position.x,
      this.camera.position.z - n.position.z
    );
    this.pitch = -0.05;
    this.vel.set(0, 0, 0);
  },

  _move(dt) {
    /* A modal (the lightbox) owns the input while it is up: no walking, no
       looking. Without this you could drift away while reading a card and the
       "fly back to its place" animation would land somewhere meaningless. */
    if (this.inputBlocked) {
      this.vel.lerp(new THREE.Vector3(), Math.min(1, CFG.friction * dt));
      this.camera.position.addScaledVector(this.vel, dt);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    // keyboard
    let f = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    let r = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
    // on-screen stick (analogue, wins when engaged)
    if (this.joy.active) { f = -this.joy.y; r = this.joy.x; }

    const mag = Math.min(1, Math.hypot(f, r));
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight || this.joy.sprint;
    const target = CFG.walkSpeed * (sprint ? CFG.sprintMul : 1) * (mag || 0);

    const fwd = this._tmpV.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, r);

    if (wish.lengthSq() > 0.0001 && target > 0) {
      wish.normalize().multiplyScalar(target);
      this.vel.lerp(wish, Math.min(1, CFG.accel * dt));
      this.bobT += dt * CFG.bob.freq * (sprint ? 1.35 : 1);
    } else {
      this.vel.lerp(new THREE.Vector3(), Math.min(1, CFG.friction * dt));
      this.bobT += dt * 1.6;
    }

    this.camera.position.addScaledVector(this.vel, dt);

    const B = CFG.bounds;
    this.camera.position.x = Math.max(-B, Math.min(B, this.camera.position.x));
    this.camera.position.z = Math.max(-B, Math.min(B, this.camera.position.z));

    const moving = this.vel.length() > 0.4;
    this.camera.position.y = CFG.eyeHeight + (moving ? Math.sin(this.bobT) * CFG.bob.amp : 0);

    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // speed-reactive chromatic aberration + slight FOV kick
    if (this.rgbPass) {
      const sp = this.vel.length() / (CFG.walkSpeed * CFG.sprintMul);
      this.rgbPass.uniforms.amount.value = 0.0009 + sp * 0.0026;
    }
    const wantFov = 74 + (sprint && moving ? 5 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  },

  _proximity() {
    let best = null, bestD = Infinity;
    const p = this.camera.position;

    this.nodes.forEach(n => {
      const d = Math.hypot(p.x - n.position.x, p.z - n.position.z);
      const inside = d < n.radius;
      const k = inside ? 1 : Math.max(0, 1 - (d - n.radius) / 8);
      n.prox.material.opacity = 0.16 + k * 0.42;
      if (n.light) n.light.intensity = n.baseIntensity + k * 2.6;
      if (n.glow) {
        n.glow.material.opacity = 0.42 + k * 0.34;
        const s = 6.5 + k * 2.4;
        n.glow.scale.set(s, s, 1);
      }
      n.core.scale.setScalar(1 + k * 0.22);
      if (inside && d < bestD) { bestD = d; best = n.id; }
    });

    if (best !== this.activeNode) {
      this.activeNode = best;
      if (best) UI.openPanel(best, true);
      else UI.closePanel(true);
    }
  },

  /* every card yaws to face the player — kills mirrored text for good */
  _billboard() {
    const p = this.camera.position;
    this.cards.forEach(c => {
      const a = Math.atan2(p.x - c.mesh.position.x, p.z - c.mesh.position.z);
      c.mesh.rotation.set(0, a, 0);
      c.frame.rotation.set(0, a, 0);
      // frame sits just behind the art relative to the viewer
      c.frame.position.x = c.mesh.position.x - Math.sin(a) * 0.04;
      c.frame.position.z = c.mesh.position.z - Math.cos(a) * 0.04;
    });
  },

  _animate(dt, t) {
    // particles rise and wrap
    const arr = this.particles.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * 0.55;
      if (arr[i] > 50) arr[i] = 0;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.rotation.y += dt * 0.006;

    this.ringSpinners.forEach(r => { r.mesh.rotation.z += dt * r.speed * r.dir; });

    this.floaters.forEach(f => {
      if (f.kind === 'drift') {
        f.mesh.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * f.amp;
        f.mesh.rotation.x += dt * f.rx;
        f.mesh.rotation.y += dt * f.ry;
      } else if (f.kind === 'spinY') {
        f.mesh.rotation.y += dt * f.speed;
        f.mesh.rotation.x += dt * f.speed * 0.4;
      } else if (f.kind === 'blink') {
        f.t += dt;
        f.mesh.visible = Math.sin(f.t * 2.2) > -0.2;
      }
    });

    this.nodes.forEach((n, i) => {
      n.core.rotation.y += dt * 0.8;
      n.core.rotation.x += dt * 0.35;
      n.core.position.y = 4.6 + Math.sin(t * 1.5 + i) * 0.20;
      n.halo.rotation.z += dt * 0.5;
      n.halo.position.y = n.core.position.y;
      n.label.position.y = 6.8 + Math.sin(t * 1.2 + i) * 0.10;
    });

    this.cards.forEach((c, i) => {
      const y = c.base + Math.sin(t * 0.9 + c.phase) * 0.09;
      c.mesh.position.y = y;
      c.frame.position.y = y;
      c.frame.material.opacity = 0.30 + Math.sin(t * 1.8 + i) * 0.13;
      // c.light is a glow sprite now (see _galleries) — pulse its opacity
      if (c.light && c.light.material) {
        c.light.material.opacity = 0.34 + Math.sin(t * 2.2 + i) * 0.12;
      }
    });

    this.holos.forEach((h, i) => {
      h.mesh.rotation.z += dt * h.speed;
      h.mesh.rotation.y = Math.sin(t * 0.5 + i) * 0.4;
    });

    this.pulseRings.forEach(p => {
      p.t += dt;
      const k = (p.t % p.period) / p.period;
      const s = 1 + k * p.max;
      p.mesh.scale.set(s, s, 1);
      p.mesh.material.opacity = 0.45 * (1 - k);
    });

    this.beams.forEach((b, i) => {
      b.mesh.rotation.z = Math.sin(t * 0.30 + b.phase) * b.tilt;
      b.mesh.rotation.x = Math.cos(t * 0.24 + b.phase) * b.tilt;
      b.mesh.material.opacity = 0.07 + Math.abs(Math.sin(t * 0.6 + b.phase)) * 0.09;
    });

    // lightning — driven through the directional moon light, so no extra
    // PointLight (and therefore no extra shader uniforms) is needed
    this.storm.t -= dt;
    if (this.storm.t <= 0) { this.storm.flash = 1; this.storm.t = 5 + Math.random() * 9; }
    if (this.storm.flash > 0) {
      this.storm.flash = Math.max(0, this.storm.flash - dt * 3.6);
      const f = this.storm.flash;
      this.stormLight.intensity = f * f * 5.5;      // reported for tests/HUD
      this.moon.intensity = 0.55 + f * 1.9;
      this.renderer.toneMappingExposure = 1.18 + f * 0.5;
      if (this.filmPass && this.filmPass.uniforms.nIntensity) {
        this.filmPass.uniforms.nIntensity.value = 0.22 + f * 0.35;
      }
    }
    if (this.filmPass && this.filmPass.uniforms.time) {
      this.filmPass.uniforms.time.value = t;
    }
  },

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this._move(dt);
    this._proximity();
    this._billboard();
    this._animate(dt, t);

    /* Self-healing render: if the composer throws (driver quirk, lost context,
       out-of-memory on a weak phone) fall back to a plain render instead of
       letting the exception kill the animation loop and leave a black page. */
    try {
      if (this.composer && this.bloomOn) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    } catch (e) {
      this.renderFails++;
      if (this.renderFails === 1) {
        console.warn('[world] render failed, dropping post-processing:', e);
        this.bloomOn = false;
        this.composer = null;
      }
      if (this.renderFails < 12) {
        try { this.renderer.render(this.scene, this.camera); } catch (e2) { /* give up quietly */ }
      }
    }

    return { dt, t };
  },

  /* ══════════════════════ CLICK / TAP A CARD STAND ══════════════════════
     Turns a screen point into "which card stand did that hit?" so tapping a
     stand out in the gallery ring opens the same lightbox a panel card does.

     Uses a Raycaster against ONLY the card meshes — not the whole scene — so a
     tower or a particle can never swallow the hit, and the cost is 10 plane
     intersections rather than a full scene traverse.

     Returns { kind, key, rect } where rect is the stand's approximate on-screen
     box, which the lightbox flies the picture out of. */
  pickCard(clientX, clientY) {
    if (!this.ready || !this.camera || !this.cards.length) return null;
    if (!this._ray) this._ray = new THREE.Raycaster();

    const ndc = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1
    );
    this._ray.setFromCamera(ndc, this.camera);

    const meshes = this.cards.map(c => c.mesh);
    const hits = this._ray.intersectObjects(meshes, false);
    if (!hits.length) return null;

    /* Only count a stand you could plausibly be looking at. Without a distance
       cap you could tap a card 90 units away through the middle of the city. */
    if (hits[0].distance > 40) return null;

    const card = this.cards.find(c => c.mesh === hits[0].object);
    if (!card) return null;

    return { kind: card.kind, key: card.key, card, rect: this.cardScreenRect(card) };
  },

  /* Project a card's four corners and return the screen-space bounding box.
     The lightbox uses it as the FLIP source, so the picture appears to lift off
     the stand itself rather than fading in from nowhere. */
  cardScreenRect(card) {
    const c = this.camera;
    const hw = card.worldW / 2, hh = card.worldH / 2;
    const q = card.mesh.quaternion;
    const xs = [], ys = [];

    [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].forEach(([dx, dy]) => {
      const v = new THREE.Vector3(dx, dy, 0).applyQuaternion(q).add(card.mesh.position);
      v.project(c);
      xs.push((v.x * 0.5 + 0.5) * innerWidth);
      ys.push((-v.y * 0.5 + 0.5) * innerHeight);
    });

    const left = Math.min.apply(null, xs), right = Math.max.apply(null, xs);
    const top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
    return {
      left, top, width: Math.max(2, right - left), height: Math.max(2, bottom - top)
    };
  },

  /* what the HUD/diagnostics line reports */
  stats() {
    return {
      tier: CFG.tier,
      lights: this.lightsUsed,
      lightBudget: this.lightBudget,
      fragUniforms: GPU.fragUniforms,
      gpu: GPU.renderer,
      objects: this.scene ? this.scene.children.length : 0,
      passes: this.composer ? this.composer.passes.length : 0
    };
  }
};

window.World = World;
window.CFG = CFG;
window.IS_MOBILE = IS_MOBILE;
window.FX_LOW = FX_LOW;
window.TIER = TIER;
window.GPU = GPU;
