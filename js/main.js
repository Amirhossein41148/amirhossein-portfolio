/* =========================================================================
   MAIN — boot, input, render loop.
   Desktop: pointer lock + WASD. Mobile: on-screen joystick + look pad (ui.js).
   ========================================================================= */

(function () {
  'use strict';

  const canvas = document.getElementById('scene');

  function fail(msg, detail) {
    // route through the boot guard so the report carries the full diagnostics
    if (window.__bootFail) { window.__bootFail(msg, detail); return; }
    const l = document.getElementById('loadStat');
    if (l) { l.textContent = msg; l.style.color = '#ff5c7a'; }
    console.error('[boot]', msg, detail || '');
  }

  if (typeof THREE === 'undefined') {
    fail('Three.js failed to load.',
         'Check that the vendor/ folder sits next to index.html and that you are serving over http (not file://).');
    return;
  }

  /* UI.init() builds every panel and card. It was outside the try/catch, so a
     throw in there (a bad photo path, a missing element) killed boot with the
     loader still spinning and nothing on screen. */
  try {
    if (window.__bootlog) __bootlog('Building the interface…');
    Lightbox.init();
    UI.init();
    Audio2.init();
  } catch (e) {
    fail('The interface could not be built.', e && e.message ? e.message : String(e));
    return;
  }

  const steps = [
    ['Compiling shaders…', 12],
    ['Building city grid…', 28],
    ['Raising towers…', 44],
    ['Painting cards…', 60],
    ['Wiring neon…', 76],
    ['Calibrating controls…', 92],
    ['Ready.', 100]
  ];

  let stepI = 0;
  const tick = setInterval(() => {
    const [msg, pct] = steps[stepI] || steps[steps.length - 1];
    UI.setProgress(pct, msg);
    if (++stepI >= steps.length) clearInterval(tick);
  }, 180);

  /* Try the detected tier; if the GPU rejects the scene, retry once at the
     lowest tier before giving up. A phone that can't take 'mid' can almost
     always take 'low', and a working low-detail scene beats an error card. */
  let bootError = null;
  try {
    World.init(canvas);
  } catch (e) {
    bootError = e;
    console.warn('[boot] first attempt failed:', e);
  }

  if ((bootError || !World.ready) && window.TIER !== 'low') {
    clearInterval(tick);
    if (window.__bootlog) __bootlog('Retrying at the lowest quality…');
    try {
      World.reset();
      World.forceLowTier();
      World.init(canvas);
      bootError = null;
    } catch (e2) {
      bootError = e2;
    }
  }

  if (bootError || !World.ready) {
    clearInterval(tick);
    const m = bootError && bootError.message ? bootError.message : String(bootError || 'unknown');
    fail('The 3D scene could not start.', m);
    return;
  }

  /* ------------------------------------------------------- pointer lock */
  if (!IS_MOBILE) {
    /* A click has two possible meanings on the canvas: "grab the mouse and
       walk" or "open the card I just clicked". Cards win — otherwise a stand
       could never be opened with a mouse, because the first click would always
       be eaten by the pointer-lock request. */
    const wantLock = () => {
      if (!World.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    };

    canvas.addEventListener('click', (e) => {
      if (Lightbox.isOpen()) return;
      // While the pointer is locked the cursor is centred, so a click cannot be
      // aimed at anything — go straight to walking.
      if (!World.locked) {
        const hit = World.pickCard(e.clientX, e.clientY);
        if (hit) {
          // a function, so the flight target is re-projected on close
          Lightbox.open(hit.kind, hit.key, null,
            () => World.cardScreenRect(hit.card));
          return;
        }
      }
      wantLock();
    });
    document.getElementById('lockNote').addEventListener('click', wantLock);

    document.addEventListener('pointerlockchange', () => {
      World.locked = document.pointerLockElement === canvas;
      UI.setLocked(World.locked);
      if (!World.locked) World.keys = Object.create(null);
    });

    document.addEventListener('mousemove', e => {
      if (World.locked) World.look(e.movementX, e.movementY);
    });
  }

  /* --------------------------------------------------------------- keys */
  const NAV_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };

  addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;

    /* Esc must reach the lightbox first, and no movement key may leak through
       to the world while a card is zoomed. */
    if (Lightbox.isOpen()) {
      if (e.code === 'Escape') { Lightbox.close(); e.preventDefault(); }
      return;
    }

    World.keys[e.code] = true;

    if (e.code in NAV_KEYS) {
      const node = DATA.nodes[NAV_KEYS[e.code]];
      if (node) { World.teleportTo(node.id); UI.openPanel(node.id); }
      e.preventDefault();
    }

    /* Esc is now two-stage. Before, one Esc released the mouse AND closed the
       panel, so you could never unlock in order to scroll the ABOUT text.
       First Esc: release the mouse, keep the panel open so you can read/scroll.
       Second Esc: close the panel. */
    if (e.code === 'Escape') {
      const help = document.getElementById('help');
      if (help.classList.contains('open')) {
        help.classList.remove('open');
      } else if (document.pointerLockElement) {
        document.exitPointerLock();
      } else {
        UI.closePanel();
      }
      e.preventDefault();
    }

    if (e.code === 'KeyB') {
      const on = World.toggleBloom();
      const b = document.getElementById('bloomBtn');
      b.textContent = on ? 'FX ON' : 'FX OFF';
      b.classList.toggle('off', !on);
    }

    if (e.code === 'KeyH' || e.code === 'Slash') {
      document.getElementById('help').classList.toggle('open');
    }

    if (e.code === 'KeyM') {
      Audio2.toggle();
    }

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
         'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  addEventListener('keyup', e => { World.keys[e.code] = false; });
  addEventListener('blur', () => { World.keys = Object.create(null); });

  /* --------------------------------------------------------- main loop */
  let firstFrame = true;

  function loop() {
    requestAnimationFrame(loop);
    if (!World.ready || World.contextLost) return;
    const { dt } = World.frame();
    UI.updateHud(dt);

    if (firstFrame) {
      firstFrame = false;
      // tells the boot watchdog the scene really drew
      window.__FIRST_FRAME = true;
      setTimeout(() => { UI.setProgress(100, 'Ready.'); UI.hideLoader(); }, 1200);
    }
  }
  loop();

  window.__portfolio = { World, UI, DATA, CFG, SIZES, IS_MOBILE };
})();
