/* =========================================================================
   AUDIO — the soundtrack.

   ░░ WHY THERE IS NO .mp3 IN THIS PROJECT ░░
   Every track you can download is licensed by someone. "Non-copyright" music
   is still copyrighted — it is merely licensed permissively, usually with
   attribution conditions that a portfolio quietly breaks. So the music here is
   GENERATED, in the browser, by the Web Audio API: a synthwave loop built from
   oscillators, a noise buffer and a filter. Nobody owns it, there is nothing to
   credit, it adds ZERO bytes to download, and it cannot 404 on a phone.

   ░░ AUTOPLAY — WHY MUSIC IS "ON" BUT SILENT FOR A MOMENT ░░
     Chrome on Android, Chrome on desktop and Safari on iOS all refuse to let an
     AudioContext make sound until the user has interacted with the page. There is
     no flag, no attribute and no trick that changes this — a <audio autoplay> tag
     is blocked in exactly the same way. So "background music" cannot mean "sound
     before the first touch"; the closest honest thing is:

       - the intent defaults to ON (this.on = true)
       - the FIRST tap / click / keypress anywhere unlocks the context and the
         loop fades in
       - that first gesture already exists in this app: on desktop you click to
         enter the scene, on a phone you touch the joystick or a card

     These unlock listeners run in the CAPTURE phase. They used to be bubble
     phase, and the mobile joystick and look-pad stopPropagation() on their first
     touch — so the unlock never fired on Android until the MUSIC button was
     toggled off and on (the resume() call inside the click finally worked). A
     short retry loop also re-asserts ctx.resume() for the Androids that drop
     back to 'suspended' a beat after the first gesture.

     So in practice the music starts as soon as the visitor does anything at all,
     and the button reads MUSIC ON from the start so it never looks broken.
     The choice is remembered in localStorage: turn it off once and it stays off.

     ░░ MUSICAL SHAPE ░░
     COLD cyberpunk — no happy chords, no warm pads. The Andalusian cadence
     Am - G - F - E (two bars each, 8 bars total, 92 BPM) is the classic
     neon-noir progression.
       bass    saw through a low-pass, pulsing 8ths: root on the beat, a sub
               drop on the offbeat so the groove drives
       arp     square 16ths through a resonant filter that sweeps with the bar
       lead    SPARSE SQUARE melody — the Andalusian descent A G F E — echoed
               through a slapback delay (square reads colder than the old saw)
       pad     two-detune saws, very slow attack, chord tones, darker low-pass
       drums   noise-burst hat on 8ths, filtered noise snare on 2 and 4,
               sine kick on 1 and 3
     Volume is intentionally modest — background music, not a concert. Master
     sits at 0.32 and every voice is trimmed below its old level.
     ========================================================================= */

const Audio2 = {
  ctx: null,
  master: null,
  wet: null,
  /* Default ON — this is background music, so the intent is "playing" and the
     browser's gesture requirement is the only thing holding it back. Overridden
     from localStorage in init() if the visitor turned it off. */
  on: true,
  started: false,       // has the graph been built
  unlocked: false,      // has the browser let us make sound
  KEY: 'amirhossein.music',
  timer: null,
  step: 0,              // 16th-note counter
  nextTime: 0,
  noiseBuf: null,
  _btn: null,

  BPM: 92,
  /* Andalusian cadence — Am  G  F  E — the classic neon-noir progression.
     Semitone offsets from A2 (45). */
  PROG: [
    { root: 45, third: 48, fifth: 52 },   // A  minor
    { root: 43, third: 47, fifth: 50 },   // G  major
    { root: 41, third: 45, fifth: 48 },   // F  major
    { root: 40, third: 44, fifth: 47 }    // E  major
  ],
  /* 16th-note arpeggio pattern as indices into [root, third, fifth, octave] */
  ARP: [0, 2, 1, 3, 2, 0, 3, 1, 0, 3, 1, 2, 3, 1, 2, 0],

  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

  /* ------------------------------------------------------------------ init */
  init() {
    this._btn = document.getElementById('musicBtn');

    /* Remember the visitor's choice. Default is ON (background music), but if
       they turned it off once, respect that on every later visit. */
    try {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'off') this.on = false;
      else if (saved === 'on') this.on = true;
    } catch (e) { /* private mode / disabled storage: keep the default */ }

    /* The AudioContext is built on the FIRST gesture, not now. Creating it
       earlier just produces a suspended context plus a console warning on some
       Androids. Because `on` defaults to true, that first gesture — the click
       to enter the scene, or the first touch of the joystick — starts the loop
       without the visitor having to find a button.

       Capture phase: some parts of the UI stop propagation of their first
       pointer/touch events; a bubble-phase listener on window would never see
       them and the music would stay silent until the button was toggled
       (the off→on Android bug). Capture sees every event first.
       The retry loop re-asserts ctx.resume() because a few Androids drop the
       context back to 'suspended' a beat after the first unlock. */
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      if (this.on) {
        if (!this.started) this._start();
        else if (this.ctx) this.ctx.resume();
      }
      let tries = 0;
      const retry = () => {
        if (!this.on || !this.ctx) return;
        if (this.ctx.state === 'running') return;
        if (++tries > 8) return;
        this.ctx.resume();
        setTimeout(retry, 120);
      };
      retry();
      this._paint();
    };
    ['pointerdown', 'touchstart', 'touchend', 'pointerup', 'keydown', 'click'].forEach(ev => {
      addEventListener(ev, unlock, { once: true, capture: true, passive: true });
    });

    if (this._btn) {
      this._btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    /* Never keep playing into a pocket: a backgrounded tab on Android would
       otherwise carry on burning battery. */
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) { if (this.ctx.state === 'running') this.ctx.suspend(); }
      else if (this.on) this.ctx.resume();
    });

    this._paint();
  },

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(this.KEY, this.on ? 'on' : 'off'); }
    catch (e) { /* storage unavailable — the toggle still works for this visit */ }

    if (this.on) {
      if (!this.started) this._start();
      else if (this.ctx) this.ctx.resume();
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.6);
      }
    } else if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.35);
    }
    this._paint();
    return this.on;
  },

  _paint() {
    if (!this._btn) return;
    /* Three states, and the middle one matters: "on but not yet unlocked" is not
       a failure, it is the browser waiting for a gesture. Saying MUSIC ON there
       would be a lie, and saying MUSIC would look like it is off. */
    const label = !this.on ? 'MUSIC OFF'
      : (this.unlocked ? 'MUSIC ON' : 'MUSIC ♪');
    this._btn.textContent = label;
    this._btn.classList.toggle('on', this.on && this.unlocked);
    this._btn.setAttribute('aria-pressed', this.on ? 'true' : 'false');
  },

  /* ---------------------------------------------------------------- engine */
  _start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // very old browser: silently skip

    try {
      if (!this.ctx) this.ctx = new AC({ latencyHint: 'playback' });
    } catch (e) {
      return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // master chain: bus -> soft limiter -> out
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.005;
    comp.release.value = 0.22;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    /* A cheap plate-ish reverb: one convolver on a generated noise tail. Gives
       the pads the wet neon-alley sound without shipping an impulse file. */
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.30;
    try {
      const conv = this.ctx.createConvolver();
      conv.buffer = this._reverbTail(1.9);
      this.wet.connect(conv);
      conv.connect(this.master);
    } catch (e) {
      this.wet.connect(this.master);        // no convolver: run dry
    }

    this.noiseBuf = this._noise(1.2);

    /* Slapback echo for the lead — the neon-alley delay tail. Dotted 8th at
       the current tempo so the repeats lock into the groove. */
    this.echo = this.ctx.createDelay(1);
    this.echo.delayTime.value = 60 / this.BPM * 0.75;
    const echoFb = this.ctx.createGain(); echoFb.gain.value = 0.30;
    const echoWet = this.ctx.createGain(); echoWet.gain.value = 0.34;
    this.echo.connect(echoFb); echoFb.connect(this.echo);
    this.echo.connect(echoWet); echoWet.connect(this.master);

    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    /* setInterval + look-ahead scheduling, NOT one timer per note: timers are
       throttled hard on mobile, so notes must be queued into the audio clock
       well before they sound or the groove stutters. */
    this.timer = setInterval(() => this._pump(), 40);
    this.started = true;

    this.master.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.8);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.started = false;
  },

  _noise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  _reverbTail(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
    }
    return buf;
  },

  /* look-ahead scheduler: queue every 16th that falls inside the next 120ms */
  _pump() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const spb = 60 / this.BPM;
    const s16 = spb / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this._schedule(this.step, this.nextTime, s16);
      this.step = (this.step + 1) % 128;      // 8 bars of 16ths
      this.nextTime += s16;
    }
  },

  _schedule(step, t, s16) {
    const bar = Math.floor(step / 16) % 8;
    const chord = this.PROG[Math.floor(bar / 2) % 4];
    const inBar = step % 16;
    const secondHalf = bar >= 4;             // lifts the arp an octave

    /* ── drums ─────────────────────────────────────────────────────────── */
    if (inBar % 8 === 0) this._kick(t);
    if (inBar === 4 || inBar === 12) this._snare(t);
    if (inBar % 2 === 0) this._hat(t, inBar % 4 === 0 ? 0.10 : 0.055);

    /* ── bass: pulsing eighths — root on the beat, sub drop offbeat ───── */
    if (inBar % 2 === 0) {
      const onBeat = inBar % 4 === 0;
      const note = onBeat ? chord.root - 12 : chord.root - 24;
      this._bass(t, this.hz(note), s16 * (onBeat ? 3.2 : 1.8));
    }

    /* ── arpeggio: 16ths ──────────────────────────────────────────────── */
    const deg = this.ARP[inBar];
    const tones = [chord.root, chord.third, chord.fifth, chord.root + 12];
    const midi = tones[deg] + 12 + (secondHalf ? 12 : 0);
    // filter sweep follows position in the 8-bar phrase
    const sweep = 900 + Math.sin((step / 128) * Math.PI * 2) * 700;
    this._arp(t, this.hz(midi), s16 * 0.9, sweep);

    /* ── lead: one note per chord change — the Andalusian descent A G F E
       across the four 2-bar sections, sent through the slapback echo ─── */
    if (inBar === 0 && bar % 2 === 0) {
      this._lead(t, this.hz(chord.root + 24), s16 * 7);
    }

    /* ── pad: one long chord per 2-bar section ────────────────────────── */
    if (inBar === 0 && bar % 2 === 0) {
      this._pad(t, chord, s16 * 32);
    }
  },

  /* ------------------------------------------------------------- voices */
  _bass(t, f, dur) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sawtooth';
    o.frequency.value = f;
    o2.frequency.value = f * 1.002;          // tighter detune = colder, less chorus
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(440, t + 0.06);
    lp.frequency.linearRampToValueAtTime(160, t + dur);
    lp.Q.value = 7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  },

  _arp(t, f, dur, cut) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const bp = this.ctx.createBiquadFilter();
    o.type = 'square';
    o.frequency.value = f;
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(cut, t);
    bp.Q.value = 9;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.070, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g);
    g.connect(this.master);
    g.connect(this.wet);
    o.start(t); o.stop(t + dur + 0.02);
  },

  /* Sparse saw lead with a slapback echo — the neon-alley voice. */
  _lead(t, f, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    o.type = 'square';                   // square = colder, 8-bit cyber lead
    o.frequency.value = f;
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.060, t + 0.02);
    g.gain.setValueAtTime(0.060, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g);
    g.connect(this.master);
    g.connect(this.wet);
    if (this.echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.12);
  },

  _pad(t, chord, dur) {
    [chord.root, chord.third, chord.fifth, chord.root + 12].forEach((m, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = this.hz(m) * (i % 2 ? 1.002 : 0.998);  // tighter detune
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;                              // darker, colder bed
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.020, t + dur * 0.35);   // slow swell
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g);
      g.connect(this.master);
      g.connect(this.wet);
      o.start(t); o.stop(t + dur + 0.05);
    });
  },

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.22);
  },

  _snare(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(bp); bp.connect(g);
    g.connect(this.master);
    g.connect(this.wet);
    s.start(t); s.stop(t + 0.18);
  },

  _hat(t, level) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 1.7;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(hp); hp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 0.06);
  },

  /* A short rising blip for the card zoom, so the UI has a voice too. */
  blip(up) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(up ? 420 : 900, t);
    o.frequency.exponentialRampToValueAtTime(up ? 1250 : 300, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(g); g.connect(this.master); g.connect(this.wet);
    o.start(t); o.stop(t + 0.19);
  }
};

window.Audio2 = Audio2;
