/* =========================================================================
   UI — panels, minimap, HUD, and the mobile joystick.
   Every card image goes through makeCard() so your photos in assets/ are used
   when present and the drawn artwork stands in when they're not.
   ========================================================================= */

const UI = {
  el: {}, current: null, minimapCtx: null,
  fpsSamples: [], lastFpsPaint: 0,
  stick: null,

  init() {
    const $ = s => document.querySelector(s);
    this.el = {
      loader: $('#loader'), loadBar: $('#loadBar'), loadStat: $('#loadStat'),
      hud: $('#hud'), nav: $('#nav'), panels: $('#panels'),
      hint: $('#hint'), lockNote: $('#lockNote'),
      minimap: $('#minimap'), coords: $('#coords'), fps: $('#fps'), zone: $('#zone'),
      tierline: $('#tierline'), radar: $('#radar'),
      cursor: $('#cursor'), dot: $('#cursorDot'),
      bloomBtn: $('#bloomBtn'), helpBtn: $('#helpBtn'), help: $('#help'),
      joy: $('#joy'), joyKnob: $('#joyKnob'), joyWrap: $('#joyWrap'),
      sprintBtn: $('#sprintBtn'), lookPad: $('#lookPad'), mobileBar: $('#mobileBar')
    };

    this.minimapCtx = this.el.minimap.getContext('2d');
    this._sizeMinimap();
    addEventListener('resize', () => this._sizeMinimap());
    this._buildNav();
    this._buildPanels();
    this._wireCursor();
    this._wireButtons();
    if (IS_MOBILE) this._enableMobile();
  },

  /* Keep the canvas backing store matched to the CSS size (--map) and the
     device pixel ratio, so the bigger map is genuinely sharper rather than
     just scaled up. */
  _sizeMinimap() {
    const cv = this.el.minimap;
    if (!cv) return;
    const css = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--map'), 10) || 240;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    this.mapCss = css;          // logical size — detail thresholds use this
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
      // Setting width/height resets the drawing surface. Re-acquire the context
      // so we never paint 480px coordinates onto a 240px surface (which clipped
      // the map to its top-left quadrant).
      this.minimapCtx = cv.getContext('2d');
    }
  },

  setProgress(pct, msg) {
    this.el.loadBar.style.width = Math.min(100, pct) + '%';
    if (msg) this.el.loadStat.textContent = msg;
  },
  hideLoader() {
    this.el.loader.classList.add('gone');
    this.el.hud.classList.remove('hidden');
    setTimeout(() => this.el.loader.remove(), 900);
  },

  /* --------------------------------------------------------------- nav */
  _buildNav() {
    const frag = document.createDocumentFragment();
    DATA.nodes.forEach((n, i) => {
      const a = document.createElement('button');
      a.className = 'nav-item';
      a.dataset.section = n.id;
      a.innerHTML = `<span class="nav-key">${i + 1}</span>${n.label}`;
      a.addEventListener('click', () => { World.teleportTo(n.id); this.openPanel(n.id); });
      frag.appendChild(a);
    });
    this.el.nav.appendChild(frag);
  },

  _setNavActive(id) {
    this.el.nav.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.section === id);
    });
  },

  /* ------------------------------------------------------------ panels */
  _panelShell(id, title, statusText, dotClass, bodyHTML) {
    return `
      <section class="panel" id="panel-${id}" data-panel="${id}" aria-hidden="true">
        <header class="panel-head">
          <h2>// ${title}</h2>
          <div class="panel-status"><i class="dot ${dotClass}"></i><span>${statusText}</span></div>
          <button class="panel-x" data-close aria-label="close">✕</button>
        </header>
        <div class="panel-body">${bodyHTML}</div>
      </section>`;
  },

  _buildPanels() {
    const D = DATA;
    const html = [];

    /* ABOUT — 500x500 profile slot */
    html.push(this._panelShell('about', 'USER_PROFILE', 'ONLINE', 'online', `
      <div class="idcard">
        <div class="avatar-wrap">
          <span class="avatar-ring"></span>
          <div class="avatar-slot" data-card="profile" data-key="profile"
               data-src="${D.identity.img}" data-w="${SIZES.profile.w}" data-h="${SIZES.profile.h}"></div>
        </div>
        <div class="idmeta">
          <h3>${D.identity.name}</h3>
          <p class="tagline">${D.identity.tagline}</p>
          <div class="statgrid">
            ${D.identity.stats.map(s => `
              <div class="statcell"><span class="sk">${s.label}</span><span class="sv">${s.value}</span></div>
            `).join('')}
          </div>
        </div>
      </div>
      <h4 class="sub">// BIO</h4>
      ${D.identity.bio.map(p => `<p class="bio">${p}</p>`).join('')}
      <h4 class="sub">// SKILL_MATRIX</h4>
      <div class="skills">
        ${D.skills.map(s => `
          <div class="skill">
            <div class="skill-top"><span>${s.name}</span><span>${s.level}%</span></div>
            <div class="bar"><i style="--w:${s.level}%"></i></div>
          </div>`).join('')}
      </div>`));

    /* GAMES — 600x800 cards, same treatment as anime */
    html.push(this._panelShell('games', 'FAVORITE_GAMES', 'PLAYING', 'gaming', `
      <p class="hintline">Game stands ring the <b>GAMES</b> pillar in-world. Cards always turn to face you.</p>
      <div class="grid2 card-grid">
        ${D.games.map(g => `
          <figure class="card art game" data-game="${g.key}" style="--accent:${g.css}">
            <div class="art-slot ratio-34" data-card="game" data-key="${g.key}"
                 data-src="${g.img}" data-w="${SIZES.game.w}" data-h="${SIZES.game.h}"></div>
            <figcaption>
              <h4>${g.icon} ${g.name}</h4>
              <p>${g.note}</p>
            </figcaption>
          </figure>`).join('')}
      </div>`));

    /* ANIME — 600x900 cards */
    html.push(this._panelShell('anime', 'ANIME_SHELF', 'WATCHING', 'anime', `
      <p class="hintline">Walk the gallery ring behind the <b>ANIME</b> pillar to see these full size.</p>
      <div class="grid2 card-grid">
        ${D.anime.map(a => `
          <figure class="card art anime" data-anime="${a.key}" style="--accent:${a.css}">
            <div class="art-slot ratio-23" data-card="anime" data-key="${a.key}"
                 data-src="${a.img}" data-w="${SIZES.anime.w}" data-h="${SIZES.anime.h}"></div>
            <figcaption>
              <h4>${a.title}</h4>
              <p>${a.sub}</p>
              <small>${a.note}</small>
            </figcaption>
          </figure>`).join('')}
      </div>`));

    /* PROJECTS */
    html.push(this._panelShell('projects', 'PROJECTS', 'SHIPPING', 'project', `
      ${D.projects.map(p => `
        <article class="proj" style="--accent:${p.accent}">
          <div class="proj-head"><h4>${p.name}</h4><span class="ver">${p.version}</span></div>
          <p>${p.desc}</p>
          <div class="plats">${p.platforms.map(x => `<span class="plat">${x}</span>`).join('')}</div>
          <a class="btn" href="${p.url}" target="_blank" rel="noopener">Open on GitHub →</a>
        </article>`).join('')}
      <a class="ghline" href="${D.identity.githubUrl}" target="_blank" rel="noopener">
        <span class="ghi">⌘</span> github.com/${D.identity.github}
      </a>`));

    /* CONTACT */
    html.push(this._panelShell('contact', 'CONTACT', 'REACHABLE', 'contact', `
      <div class="grid2">
        ${D.contact.map(c => `
          <a class="card contact" href="${c.href}" target="_blank" rel="noopener">
            <span class="gicon">${c.icon}</span>
            <h4>${c.label}</h4>
            <p>${c.value}</p>
          </a>`).join('')}
      </div>
      <p class="hintline">Open to collabs on editing, game content and web/3D builds.</p>`));

    this.el.panels.innerHTML = html.join('');
    this._fillArtSlots();

    this.el.panels.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => this.closePanel());
    });

    /* Tapping a card opens the lightbox. Delegated from #panels so it survives
       any future re-render, and keyboard-operable because a card is not a
       <button>: Enter/Space must do what a tap does. */
    this.el.panels.querySelectorAll('.card.art').forEach(fig => {
      const key = fig.dataset.anime || fig.dataset.game;
      const kind = fig.dataset.anime ? 'anime' : 'games';
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', 'open ' + key + ' full size');
      const open = (e) => {
        e.preventDefault();
        Lightbox.open(kind, key, fig.querySelector('.art-slot'));
      };
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') open(e);
      });
    });
  },

  /* every slot gets a canvas: your photo if it loads, drawn art if not */
  _fillArtSlots() {
    this.el.panels.querySelectorAll('[data-card]').forEach(slot => {
      const key = slot.dataset.key;
      const src = slot.dataset.src || '';
      const w = parseInt(slot.dataset.w, 10);
      const h = parseInt(slot.dataset.h, 10);

      /* forTexture:false — this canvas is only ever DISPLAYED, never uploaded
         to WebGL, so a file:// photo tainting it is harmless. That is why your
         photos still appear in the panels even when the page is opened straight
         from the folder with no server. */
      const cv = makeCard(key, src, w, h, (canvas, usedImage) => {
        slot.classList.toggle('has-photo', !!usedImage);
      }, { forTexture: false });
      cv.className = 'art-canvas';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', key);
      slot.appendChild(cv);
    });
  },

  openPanel(id, fromWorld = false) {
    if (this.current === id) return;
    this.el.panels.querySelectorAll('.panel').forEach(p => {
      const on = p.dataset.panel === id;
      p.classList.toggle('open', on);
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    this.current = id;
    this._setNavActive(id);
    // lets the CSS hide the lock note + key hints so they can never sit on
    // top of the panel text you're trying to read
    document.body.classList.add('panel-open');
    const node = DATA.nodes.find(n => n.id === id);
    if (node) this.el.zone.textContent = node.label;
  },

  closePanel() {
    this.el.panels.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    this.current = null;
    this._setNavActive(null);
    document.body.classList.remove('panel-open');
    this.el.zone.textContent = 'OPEN PLAZA';
  },

  /* ------------------------------------------------------------ cursor */
  _wireCursor() {
    if (IS_MOBILE) return;
    addEventListener('mousemove', e => {
      this.el.cursor.style.transform = `translate(${e.clientX - 13}px,${e.clientY - 13}px)`;
      this.el.dot.style.transform = `translate(${e.clientX - 2.5}px,${e.clientY - 2.5}px)`;
    });
    document.addEventListener('mouseover', e => {
      const int = e.target.closest('a,button,.card,.nav-item');
      this.el.cursor.classList.toggle('big', !!int);
    });
  },

  _wireButtons() {
    this.el.bloomBtn.addEventListener('click', () => {
      const on = World.toggleBloom();
      this.el.bloomBtn.textContent = on ? 'FX ON' : 'FX OFF';
      this.el.bloomBtn.classList.toggle('off', !on);
    });
    this.el.helpBtn.addEventListener('click', () => this.el.help.classList.toggle('open'));
    this.el.help.addEventListener('click', e => {
      if (e.target === this.el.help) this.el.help.classList.remove('open');
    });
  },

  setLocked(locked) {
    if (IS_MOBILE) return;
    // Never show the lock note over an open panel — that was the bug where
    // pressing Esc to scroll the ABOUT text popped a badge over the words.
    const suppress = locked || !!this.current;
    this.el.lockNote.classList.toggle('hidden', suppress);
    this.el.hint.classList.toggle('dim', locked);
    this.el.cursor.classList.toggle('hidden', locked);
    this.el.dot.classList.toggle('hidden', locked);
  },

  /* ═════════════════════════ MOBILE CONTROLS ═════════════════════════
     Left: analogue joystick (drag the knob, walk speed scales with distance).
     Right: look pad — drag anywhere to turn the camera.
     Sprint toggle sits above the joystick.
     ================================================================ */
  _enableMobile() {
    document.body.classList.add('is-mobile');
    this.el.mobileBar.classList.remove('hidden');
    this.el.lockNote.classList.add('hidden');

    const joy = this.el.joy, knob = this.el.joyKnob;
    let radius = 52, cx = 0, cy = 0, id = null;

    const measure = () => {
      const r = joy.getBoundingClientRect();
      radius = r.width / 2;
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    };
    measure();
    addEventListener('resize', measure);
    addEventListener('orientationchange', () => setTimeout(measure, 250));

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    const move = (touch) => {
      let dx = touch.clientX - cx, dy = touch.clientY - cy;
      const d = Math.hypot(dx, dy);
      const max = radius * 0.72;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      setKnob(dx, dy);
      World.joy.x = dx / max;
      World.joy.y = dy / max;
      World.joy.active = true;
      joy.classList.add('active');
    };

    const end = () => {
      id = null;
      setKnob(0, 0);
      World.joy.x = World.joy.y = 0;
      World.joy.active = false;
      joy.classList.remove('active');
    };

    joy.addEventListener('touchstart', e => {
      measure();
      id = e.changedTouches[0].identifier;
      move(e.changedTouches[0]);
      e.preventDefault();
    }, { passive: false });

    joy.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === id) move(t);
      e.preventDefault();
    }, { passive: false });

    joy.addEventListener('touchend', e => {
      for (const t of e.changedTouches) if (t.identifier === id) end();
    }, { passive: true });
    joy.addEventListener('touchcancel', end, { passive: true });

    // sprint toggle
    this.el.sprintBtn.addEventListener('click', () => {
      World.joy.sprint = !World.joy.sprint;
      this.el.sprintBtn.classList.toggle('on', World.joy.sprint);
      this.el.sprintBtn.textContent = World.joy.sprint ? 'RUN ON' : 'RUN';
    });

    // look pad
    const pad = this.el.lookPad;
    let lookId = null, lx = 0, ly = 0;
    /* Tap-vs-drag: a tap on a card stand must open it, a drag must look around.
       Tracked by distance and duration from touchstart — anything under ~12px
       and 350ms counts as a tap, which is roughly what every mobile OS uses. */
    let tapX = 0, tapY = 0, tapT = 0, moved = 0;

    pad.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      tapX = t.clientX; tapY = t.clientY; tapT = Date.now(); moved = 0;
    }, { passive: true });
    pad.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        moved = Math.max(moved, Math.hypot(t.clientX - tapX, t.clientY - tapY));
        World.look(t.clientX - lx, t.clientY - ly, CFG.touchSens);
        lx = t.clientX; ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const endLook = () => { lookId = null; };
    pad.addEventListener('touchend', endLook, { passive: true });
    pad.addEventListener('touchcancel', endLook, { passive: true });

    /* A clean tap: did it land on a card stand? If so open the lightbox. This is
       the phone equivalent of the desktop click handler in main.js. */
    pad.addEventListener('touchend', e => {
      if (Lightbox.isOpen()) return;
      if (moved > 12 || Date.now() - tapT > 350) return;      // that was a drag
      const t = e.changedTouches[0];
      if (!t) return;
      const hit = World.pickCard(t.clientX, t.clientY);
      if (hit) {
        Lightbox.open(hit.kind, hit.key, null,
          () => World.cardScreenRect(hit.card));
        tapT = 0;              // consumed: don't let the double-tap fire too
      }
    }, { passive: true });

    // double-tap the look pad to open/close the nearest panel
    let lastTap = 0;
    pad.addEventListener('touchend', () => {
      if (Lightbox.isOpen() || !tapT) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        if (this.current) this.closePanel();
        else if (World.activeNode) this.openPanel(World.activeNode);
      }
      lastTap = now;
    }, { passive: true });
  },

  /* ----------------------------------------------------------- minimap
     v7: bigger canvas (240 on desktop) so it earns real detail — tower
     footprints, a distance-fading grid, gallery ring outlines, labelled
     zones and a proper view cone. Everything scales off S so the smaller
     phone sizes stay legible instead of turning to mush. */
  drawMinimap() {
    const c = this.minimapCtx;
    if (!c) return;
    const S = this.el.minimap.width;      // backing-store pixels
    const L = this.mapCss || S;           // logical (CSS) size
    const k = S / 240;                    // detail scale factor

    /* The map has to cover MORE than the walkable area or the city is invisible:
       you can only walk within ±52, but the tower rings live at radius 68-120.
       Mapping only the bounds meant every tower footprint fell off-canvas and
       the map looked empty. E = 80 shows the inner tower ring surrounding the
       plaza while the walkable area still fills ~65% of the map. */
    const E = CFG.mapExtent;
    const B = CFG.bounds;
    const toPx = v => ((v + E) / (E * 2)) * S;

    c.clearRect(0, 0, S, S);

    // backdrop with a soft radial falloff
    c.fillStyle = 'rgba(4,4,12,.82)';
    c.fillRect(0, 0, S, S);
    const rg = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, 'rgba(0,245,255,.07)');
    rg.addColorStop(1, 'rgba(0,245,255,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, S, S);

    // grid: minor + major
    const cells = L >= 200 ? 12 : 8;
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,245,255,.08)';
    for (let i = 1; i < cells; i++) {
      const p = (i / cells) * S;
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(S, p); c.stroke();
    }
    c.strokeStyle = 'rgba(0,245,255,.17)';
    c.beginPath(); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.stroke();
    c.beginPath(); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.stroke();

    /* Concentric guides at the tower-ring radii. These are what make the map
       read as a city plan rather than a field of scattered blocks. */
    if (L >= 140) {
      c.strokeStyle = 'rgba(130,155,215,.26)';
      [68, 92, 120].forEach(r => {
        c.beginPath();
        c.arc(toPx(0), toPx(0), (r / (E * 2)) * S, 0, Math.PI * 2);
        c.stroke();
      });
    }

    // the walkable boundary — shows where the invisible wall is
    const b0 = toPx(-B), b1 = toPx(B);
    c.strokeStyle = 'rgba(0,245,255,.30)';
    c.setLineDash([4 * k, 4 * k]);
    c.strokeRect(b0, b0, b1 - b0, b1 - b0);
    c.setLineDash([]);

    // tower footprints — gives the map a real city feel
    if (World.towerFootprints && L >= 118) {
      World.towerFootprints.forEach(t => {
        const x = toPx(t.x), y = toPx(t.z);
        const w = Math.max(2, (t.w / (E * 2)) * S);
        const d = Math.max(2, (t.d / (E * 2)) * S);
        // cull on the rect's real extent — culling on the centre alone still
        // queued rects that fell completely outside the canvas
        if (x + w / 2 < 0 || x - w / 2 > S || y + d / 2 < 0 || y - d / 2 > S) return;
        // taller towers read brighter, which gives the plan a sense of skyline
        const a = 0.22 + Math.min(t.h / 80, 1) * 0.30;
        c.fillStyle = `rgba(150,170,235,${a.toFixed(3)})`;
        c.fillRect(x - w / 2, y - d / 2, w, d);
      });
    }

    // gallery ring guides
    if (L >= 170) {
      DATA.nodes.forEach(n => {
        if (!n.gallery) return;
        const R = n.gallery === 'anime' ? 10.5 : 9.6;
        c.strokeStyle = '#' + n.colour.toString(16).padStart(6, '0') + '33';
        c.setLineDash([3 * k, 3 * k]);
        c.beginPath();
        c.arc(toPx(n.x), toPx(n.z), (R / (E * 2)) * S, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      });
    }

    // card stands
    World.cards.forEach(cd => {
      const hex = '#' + cd.accent.toString(16).padStart(6, '0');
      const x = toPx(cd.mesh.position.x), y = toPx(cd.mesh.position.z);
      const s = Math.max(2, 3 * k);
      c.fillStyle = hex + 'cc';
      c.fillRect(x - s / 2, y - s / 2, s, s);
    });

    // zone pillars + trigger radius + label
    DATA.nodes.forEach(n => {
      const hex = '#' + n.colour.toString(16).padStart(6, '0');
      const x = toPx(n.x), y = toPx(n.z);
      const active = UI.current === n.id;

      c.strokeStyle = hex + (active ? '99' : '4d');
      c.lineWidth = active ? 1.8 : 1;
      c.beginPath();
      c.arc(x, y, (n.radius / (E * 2)) * S, 0, Math.PI * 2);
      c.stroke();

      c.save();
      c.shadowColor = hex;
      c.shadowBlur = (active ? 14 : 8) * k;
      c.fillStyle = hex;
      c.beginPath();
      c.arc(x, y, (active ? 4.4 : 3.4) * k, 0, Math.PI * 2);
      c.fill();
      c.restore();

      if (L >= 160) {
        // labels get a dark halo so they stay readable over tower footprints
        const fs = Math.max(7, Math.round(7.5 * k));
        c.font = `700 ${fs}px Orbitron, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const ly = y - 10 * k;
        c.lineWidth = Math.max(2, 3 * k);
        c.strokeStyle = 'rgba(2,2,8,.9)';
        c.strokeText(n.label, x, ly);
        c.fillStyle = active ? hex : 'rgba(214,226,255,.78)';
        c.fillText(n.label, x, ly);
        c.lineWidth = 1;
      }
    });

    // player: view cone + arrow
    const px = toPx(World.camera.position.x), py = toPx(World.camera.position.z);
    c.save();
    c.translate(px, py);
    c.rotate(-World.yaw);

    const coneR = 30 * k;
    const cg = c.createRadialGradient(0, 0, 0, 0, 0, coneR);
    cg.addColorStop(0, 'rgba(255,190,11,.34)');
    cg.addColorStop(1, 'rgba(255,190,11,0)');
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, coneR, -Math.PI / 2 - 0.52, -Math.PI / 2 + 0.52);
    c.closePath();
    c.fill();

    c.save();
    c.shadowColor = '#ffbe0b';
    c.shadowBlur = 9 * k;
    c.fillStyle = '#ffbe0b';
    c.beginPath();
    c.moveTo(0, -6 * k);
    c.lineTo(4.4 * k, 4.4 * k);
    c.lineTo(0, 2.4 * k);
    c.lineTo(-4.4 * k, 4.4 * k);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();

    // frame on top of everything
    c.strokeStyle = 'rgba(0,245,255,.4)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, S - 1, S - 1);
  },

  updateHud(dt) {
    const p = World.camera.position;
    this.el.coords.textContent =
      `X ${p.x.toFixed(1).padStart(6)}  Z ${p.z.toFixed(1).padStart(6)}`;

    this.fpsSamples.push(1 / Math.max(dt, 0.0001));
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const now = performance.now();
    if (now - this.lastFpsPaint > 250) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.el.fps.textContent = Math.round(avg) + ' FPS';
      this.lastFpsPaint = now;

      // show which quality tier the GPU probe picked
      if (this.el.tierline && World.stats) {
        const s = World.stats();
        this.el.tierline.textContent =
          `${s.tier.toUpperCase()} · ${s.lights}/${s.lightBudget} LIGHTS · ${s.fragUniforms}u`;
      }
    }
    this.drawMinimap();
  }
};

window.UI = UI;
