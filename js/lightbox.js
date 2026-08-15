/* =========================================================================
   LIGHTBOX — tap a card, it flies to the middle of the screen, full size,
   with a glitch + neon burst. Tap ✕ (or Esc, or the backdrop) and it flies
   back to exactly where it came from.

   Works for BOTH entry points:
     • a card in the ANIME / GAMES panel  → flies from that thumbnail
     • a stand out in the gallery ring    → flies from the stand's projected
       screen position, so it still comes "from its place in the shelf"

   ░░ HOW THE ANIMATION WORKS (and why it is done this way) ░░
   This is a FLIP: measure the source rectangle, express it as a transform
   relative to the lightbox's final centred rect, start there, animate to
   identity. Only `transform` and `opacity` ever animate — both are composited
   on the GPU, so it stays smooth on a mid-range Android. Animating width /
   height / top / left instead would relayout every frame and stutter badly on
   exactly the devices this project keeps having trouble with.

   ░░ THE CANVAS IS MOVED, NOT COPIED ░░
   The card's existing <canvas> is appended into the lightbox and put back in
   its slot on close. Copying it would mean a second full-size canvas (up to
   600x900) plus keeping the two in sync when a photo finishes decoding. Moving
   it is free and always current. Everything needed to restore it is captured
   first, so an interrupted close can still put it back.
   ========================================================================= */

const Lightbox = {
  el: {},
  openKey: null,
  kind: null,
  slot: null,            // where the canvas came from
  canvas: null,
  _busy: false,
  _lastFocus: null,
  _glitchT: null,

  init() {
    const $ = s => document.querySelector(s);
    this.el = {
      box: $('#lightbox'), card: $('#lbCard'), art: $('#lbArt'),
      title: $('#lbTitle'), sub: $('#lbSub'), note: $('#lbNote'),
      tag: $('#lbTag'), close: $('#lbClose'), scrim: $('#lbScrim')
    };
    if (!this.el.box) return;

    this.el.close.addEventListener('click', e => {
      e.stopPropagation();
      this.close();
    });
    // tapping the dark area closes; tapping the card itself must NOT
    this.el.scrim.addEventListener('click', () => this.close());
    this.el.card.addEventListener('click', e => e.stopPropagation());

    /* Touch events on the card must not reach the look-pad underneath, or
       dragging on the zoomed picture would spin the camera behind it. */
    ['touchstart', 'touchmove', 'touchend'].forEach(ev => {
      this.el.card.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    });
  },

  isOpen() { return !!this.openKey; },

  /* -------------------------------------------------------------- opening */
  /* srcEl      the element to fly from (a panel card's .art-slot), or null
     rectFn     for a 3D stand: a function returning its CURRENT screen rect.
                A function, not a fixed rect, because the stands billboard and
                the camera can still settle — re-measuring on close is what
                makes the picture fly back to where the stand actually is. */
  open(kind, key, srcEl, rectFn) {
    if (this._busy || this.openKey === key) return;
    const list = kind === 'anime' ? DATA.anime : DATA.games;
    const entry = list.find(x => x.key === key);
    if (!entry || !this.el.box) return;

    this.kind = kind;
    this.openKey = key;
    this.rectFn = typeof rectFn === 'function' ? rectFn : null;
    this._lastFocus = document.activeElement;

    // ---- text + accent
    this.el.card.style.setProperty('--accent', entry.css || '#00f5ff');
    this.el.title.textContent = entry.title || entry.name || key.toUpperCase();
    this.el.sub.textContent = entry.sub || entry.note || '';
    this.el.note.textContent = (entry.sub && entry.note) ? entry.note : '';
    this.el.note.hidden = !this.el.note.textContent;

    /* ---- move the real canvas in.
       Even when the tap came from a 3D stand, the canvas used is the PANEL
       card's: it is the full-resolution one, and on file:// it is the only copy
       that is allowed to contain your actual photo (the texture copy has to come
       from js/photos.js — see the note in world.js). */
    this.slot = srcEl || document.querySelector(
      `[data-${kind === 'anime' ? 'anime' : 'game'}="${key}"] .art-slot`);
    this.canvas = this.slot ? this.slot.querySelector('canvas') : null;
    this.el.tag.hidden = !(this.canvas && this.canvas._usedImage);
    if (this.canvas) this.el.art.appendChild(this.canvas);

    /* ---- FLIP: lay the lightbox out at its FINAL size, then set the start
       transform in the same frame so nothing is ever painted in the wrong
       place, then release to identity on the NEXT frame so the browser
       interpolates instead of jumping. */
    this.el.box.classList.add('open');
    this.el.box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');

    this._applyFlip(this._sourceRect());

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.el.box.classList.add('flying');
        this._glitch();
      });
    });

    if (window.Audio2) Audio2.blip(true);

    /* Movement keys must not drive the player while a modal is up, and the
       pointer must be released or the mouse cannot reach the ✕. */
    if (window.World) {
      World.keys = Object.create(null);
      World.joy.x = World.joy.y = 0;
      World.joy.active = false;
      World.inputBlocked = true;
    }
    if (document.pointerLockElement) document.exitPointerLock();

    // focus the close button so Enter/Space closes it
    setTimeout(() => { try { this.el.close.focus({ preventScroll: true }); } catch (e) {} }, 60);
  },

  /* Where should the card fly from / back to?
     A 3D stand re-projects every time. A panel card uses its live rectangle,
     but only if it is actually on screen — a closed panel measures 0x0, and
     flying into a zero-size box looks like the card imploding, so fall back to
     a plain centre zoom in that case. */
  _sourceRect() {
    if (this.rectFn) {
      const r = this.rectFn();
      if (r && r.width > 2 && r.height > 2) return r;
      return null;
    }
    if (!this.slot) return null;
    const r = this.slot.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (r.bottom < 0 || r.top > innerHeight) return null;
    return r;
  },

  /* Compute --fx/--fy/--fs so the card starts exactly over `from`, plus a small
     random tilt (--fr) so no two pops are identical. A perfectly axis-aligned
     zoom is what made the first version feel mechanical. */
  _applyFlip(from) {
    const card = this.el.card;
    // clear any previous transform so the measurement is of the FINAL rect
    card.style.setProperty('--fx', '0px');
    card.style.setProperty('--fy', '0px');
    card.style.setProperty('--fs', '1');
    card.style.setProperty('--fr', '0deg');

    // ±2.2°, re-rolled for every open and every close
    const tilt = (Math.random() * 4.4 - 2.2).toFixed(2) + 'deg';

    if (!from || !from.width || !from.height) {
      // no source: a plain scale-up from the centre
      card.style.setProperty('--fs', '0.82');
      card.style.setProperty('--fr', tilt);
      return;
    }
    const to = card.getBoundingClientRect();
    if (!to.width || !to.height) return;

    const s = Math.max(0.05, Math.min(from.width / to.width, 1.4));
    // transform-origin is top left, so translate the origins onto each other
    card.style.setProperty('--fx', (from.left - to.left) + 'px');
    card.style.setProperty('--fy', (from.top - to.top) + 'px');
    card.style.setProperty('--fs', String(s));
    card.style.setProperty('--fr', tilt);
  },

  /* The glitch burst. 260ms — long enough to register, short enough that it
     still reads as an artifact rather than a rendering bug. */
  _glitch() {
    const box = this.el.box;
    box.classList.remove('glitch');
    // force a reflow so the animation restarts even on a rapid re-open
    void box.offsetWidth;
    box.classList.add('glitch');
    clearTimeout(this._glitchT);
    this._glitchT = setTimeout(() => box.classList.remove('glitch'), 300);
  },

  /* -------------------------------------------------------------- closing */
  close() {
    if (!this.openKey || this._busy) return;
    this._busy = true;

    const box = this.el.box;
    // re-measure: the camera may have settled and the stands billboard
    this._applyFlip(this._sourceRect());

    box.classList.remove('flying');
    box.classList.add('closing');
    this._glitch();
    if (window.Audio2) Audio2.blip(false);

    const finish = () => {
      box.classList.remove('open', 'closing', 'glitch');
      box.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lightbox-open');

      // put the canvas back where it came from
      if (this.canvas && this.slot) this.slot.appendChild(this.canvas);
      this.canvas = null;
      this.slot = null;
      this.rectFn = null;
      this.openKey = null;
      this.kind = null;
      if (window.World) World.inputBlocked = false;

      try { if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus({ preventScroll: true }); }
      catch (e) { /* element may be gone */ }
      this._busy = false;
    };

    /* transitionend is the right signal, but it does not fire if the transition
       is cancelled, or under prefers-reduced-motion where the duration is ~0.
       A timeout backstop means the canvas can never be orphaned in here — if it
       were, the panel card would be permanently blank. */
    let done = false;
    const once = (e) => {
      if (e && e.target !== this.el.card) return;
      if (done) return;
      done = true;
      this.el.card.removeEventListener('transitionend', once);
      finish();
    };
    this.el.card.addEventListener('transitionend', once);
    setTimeout(() => once(null), 420);
  }
};

window.Lightbox = Lightbox;
