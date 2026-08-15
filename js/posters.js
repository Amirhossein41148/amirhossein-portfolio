/* =========================================================================
   POSTERS — procedurally drawn chibi-style art on <canvas>.
   No external images: everything is generated at runtime, so nothing can
   404, hotlink-block, or leak a tracking request. Each function returns a
   canvas that is used BOTH in the DOM cards and as a three.js texture.

   TO ADD A NEW POSTER: write drawX(ctx, W, H) and register it in POSTERS.
   ========================================================================= */

const P = {
  // helpers ---------------------------------------------------------------
  grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  },
  radial(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  },
  circle(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  },
  ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  },
  glow(ctx, colour, blur, fn) {
    ctx.save(); ctx.shadowColor = colour; ctx.shadowBlur = blur; fn(); ctx.restore();
  },
  // cute chibi face: two big eyes + blush + smile
  chibiFace(ctx, cx, cy, s, eye = '#12121c', blush = 'rgba(255,120,150,.55)') {
    P.ellipse(ctx, cx - s * 0.34, cy, s * 0.15, s * 0.21, eye);
    P.ellipse(ctx, cx + s * 0.34, cy, s * 0.15, s * 0.21, eye);
    P.circle(ctx, cx - s * 0.30, cy - s * 0.07, s * 0.055, '#ffffff');
    P.circle(ctx, cx + s * 0.38, cy - s * 0.07, s * 0.055, '#ffffff');
    P.ellipse(ctx, cx - s * 0.62, cy + s * 0.20, s * 0.16, s * 0.09, blush);
    P.ellipse(ctx, cx + s * 0.62, cy + s * 0.20, s * 0.16, s * 0.09, blush);
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.26, s * 0.20, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = eye; ctx.lineWidth = Math.max(2, s * 0.055);
    ctx.lineCap = 'round'; ctx.stroke();
  },
  stars(ctx, W, H, n, colour = 'rgba(255,255,255,.85)') {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H * 0.6, r = Math.random() * 1.6 + 0.4;
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      P.circle(ctx, x, y, r, colour);
    }
    ctx.globalAlpha = 1;
  },
  scan(ctx, W, H, alpha = 0.07) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  },
  frame(ctx, W, H, colour) {
    ctx.strokeStyle = colour; ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    // corner ticks
    ctx.strokeStyle = colour; ctx.lineWidth = 3;
    const c = 26;
    [[12, 12, 1, 1], [W - 12, 12, -1, 1], [12, H - 12, 1, -1], [W - 12, H - 12, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * c); ctx.lineTo(x, y); ctx.lineTo(x + sx * c, y);
        ctx.stroke();
      });
  },
  caption(ctx, W, H, title, sub, colour) {
    const g = P.grad(ctx, 0, H * 0.62, 0, H, [[0, 'rgba(6,6,12,0)'], [0.55, 'rgba(6,6,12,.86)'], [1, 'rgba(6,6,12,.97)']]);
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.textAlign = 'center';
    P.glow(ctx, colour, 18, () => {
      ctx.fillStyle = colour;
      ctx.font = `700 ${Math.round(W * 0.082)}px Orbitron, system-ui, sans-serif`;
      ctx.fillText(title, W / 2, H * 0.875);
    });
    ctx.fillStyle = 'rgba(226,232,255,.72)';
    ctx.font = `500 ${Math.round(W * 0.045)}px Rajdhani, system-ui, sans-serif`;
    ctx.fillText(sub, W / 2, H * 0.945);
  }
};

/* ---------------------------- BERSERK (chibi Guts) --------------------- */
function drawBerserk(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, [[0, '#2a0308'], [0.45, '#4a0510'], [1, '#0a0004']]);
  ctx.fillRect(0, 0, W, H);
  // blood moon
  P.circle(ctx, W * 0.76, H * 0.2, W * 0.15, P.radial(ctx, W * 0.76, H * 0.2, W * 0.15,
    [[0, '#ffd9dd'], [0.45, '#ff5a6e'], [1, 'rgba(255,45,85,0)']]));
  P.stars(ctx, W, H, 40, 'rgba(255,200,200,.8)');
  // jagged skyline
  ctx.fillStyle = '#170208';
  ctx.beginPath(); ctx.moveTo(0, H * 0.72);
  for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * (0.62 + Math.random() * 0.13));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

  const cx = W * 0.40, cy = H * 0.50, s = W * 0.16;
  // Dragonslayer — huge slab sword behind him
  ctx.save();
  ctx.translate(cx + s * 1.05, cy + s * 0.15); ctx.rotate(-0.42);
  ctx.fillStyle = '#6d7480'; ctx.fillRect(-s * 0.20, -s * 2.25, s * 0.40, s * 2.55);
  ctx.fillStyle = '#9aa2ad'; ctx.fillRect(-s * 0.20, -s * 2.25, s * 0.14, s * 2.55);
  ctx.fillStyle = '#3b2016'; ctx.fillRect(-s * 0.09, s * 0.30, s * 0.18, s * 0.62);
  ctx.fillStyle = '#c9922e'; ctx.fillRect(-s * 0.26, s * 0.24, s * 0.52, s * 0.11);
  ctx.restore();
  // body — black armour
  ctx.fillStyle = '#14141c';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.78, cy + s * 1.55);
  ctx.lineTo(cx - s * 0.62, cy + s * 0.30);
  ctx.quadraticCurveTo(cx, cy + s * 0.02, cx + s * 0.62, cy + s * 0.30);
  ctx.lineTo(cx + s * 0.78, cy + s * 1.55);
  ctx.closePath(); ctx.fill();
  // red cape
  ctx.fillStyle = '#8c1020';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.60, cy + s * 0.28);
  ctx.quadraticCurveTo(cx - s * 1.30, cy + s * 1.00, cx - s * 0.95, cy + s * 1.60);
  ctx.lineTo(cx - s * 0.30, cy + s * 1.45); ctx.closePath(); ctx.fill();
  // prosthetic left arm
  ctx.fillStyle = '#5d646f';
  ctx.fillRect(cx - s * 1.02, cy + s * 0.42, s * 0.30, s * 0.92);
  ctx.fillStyle = '#868e99';
  ctx.fillRect(cx - s * 1.02, cy + s * 0.42, s * 0.12, s * 0.92);
  // head
  P.circle(ctx, cx, cy - s * 0.28, s * 0.72, '#f6d4b6');
  // spiky black hair
  ctx.fillStyle = '#0e0e14';
  ctx.beginPath(); ctx.moveTo(cx - s * 0.74, cy - s * 0.34);
  const spikes = [[-0.60, -1.14], [-0.34, -0.72], [-0.10, -1.28], [0.16, -0.74], [0.42, -1.20], [0.66, -0.70], [0.76, -0.30]];
  spikes.forEach(([dx, dy]) => ctx.lineTo(cx + s * dx, cy + s * dy));
  ctx.quadraticCurveTo(cx, cy - s * 0.90, cx - s * 0.74, cy - s * 0.34);
  ctx.fill();
  P.chibiFace(ctx, cx, cy - s * 0.24, s * 0.62);
  // scar over right eye + brand of sacrifice on neck
  ctx.strokeStyle = '#b8503f'; ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath(); ctx.moveTo(cx + s * 0.14, cy - s * 0.62); ctx.lineTo(cx + s * 0.34, cy - s * 0.06); ctx.stroke();
  P.glow(ctx, '#ff2d55', 12, () => {
    ctx.strokeStyle = '#ff4d67'; ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.16, cy + s * 0.46); ctx.lineTo(cx + s * 0.02, cy + s * 0.62);
    ctx.lineTo(cx - s * 0.14, cy + s * 0.70); ctx.closePath(); ctx.stroke();
  });

  P.scan(ctx, W, H, 0.06);
  P.frame(ctx, W, H, '#ff2d55');
  P.caption(ctx, W, H, 'BERSERK', 'Chibi Guts · Black Swordsman', '#ff2d55');
}

/* ------------------------ MUSHOKU TENSEI (child Rudeus) --------------- */
function drawMushoku(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, [[0, '#062042'], [0.5, '#0b3a72'], [1, '#03101f']]);
  ctx.fillRect(0, 0, W, H);
  P.stars(ctx, W, H, 55, 'rgba(200,230,255,.9)');
  // magic circle behind him
  ctx.save(); ctx.translate(W * 0.5, H * 0.44);
  P.glow(ctx, '#3da9ff', 26, () => {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, 0, W * (0.18 + i * 0.055), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110,200,255,${0.5 - i * 0.13})`; ctx.lineWidth = 2; ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r0 = W * 0.18, r1 = W * 0.29;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.strokeStyle = 'rgba(140,215,255,.42)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
  });
  ctx.restore();

  const cx = W * 0.5, cy = H * 0.48, s = W * 0.15;
  // blue mage robe
  ctx.fillStyle = '#1b4fa8';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy + s * 0.34);
  ctx.quadraticCurveTo(cx - s * 1.05, cy + s * 1.70, cx - s * 0.85, cy + s * 1.78);
  ctx.lineTo(cx + s * 0.85, cy + s * 1.78);
  ctx.quadraticCurveTo(cx + s * 1.05, cy + s * 1.70, cx + s * 0.55, cy + s * 0.34);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b68cf';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.30, cy + s * 0.40); ctx.lineTo(cx, cy + s * 1.74);
  ctx.lineTo(cx + s * 0.30, cy + s * 0.40); ctx.closePath(); ctx.fill();
  // gold trim
  ctx.strokeStyle = '#f0c04a'; ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.beginPath(); ctx.moveTo(cx - s * 0.80, cy + s * 1.70); ctx.lineTo(cx + s * 0.80, cy + s * 1.70); ctx.stroke();
  // staff with glowing orb
  ctx.strokeStyle = '#7b5230'; ctx.lineWidth = Math.max(3, s * 0.11);
  ctx.beginPath(); ctx.moveTo(cx + s * 0.92, cy + s * 1.62); ctx.lineTo(cx + s * 0.72, cy - s * 1.10); ctx.stroke();
  P.glow(ctx, '#7de3ff', 30, () => P.circle(ctx, cx + s * 0.70, cy - s * 1.20, s * 0.24, '#c8f4ff'));
  // hands
  P.circle(ctx, cx + s * 0.86, cy + s * 0.72, s * 0.16, '#f9dcc0');
  P.circle(ctx, cx - s * 0.62, cy + s * 0.80, s * 0.16, '#f9dcc0');
  // head
  P.circle(ctx, cx, cy - s * 0.36, s * 0.74, '#fbe0c6');
  // brown hair with side sweep
  ctx.fillStyle = '#6b4426';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.46, s * 0.78, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(cx + s * 0.30, cy - s * 0.86, cx - s * 0.20, cy - s * 0.70);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.76, cy - s * 0.42);
  ctx.quadraticCurveTo(cx - s * 0.92, cy + s * 0.10, cx - s * 0.66, cy + s * 0.16);
  ctx.quadraticCurveTo(cx - s * 0.70, cy - s * 0.20, cx - s * 0.60, cy - s * 0.44);
  ctx.fillStyle = '#6b4426'; ctx.fill();
  P.chibiFace(ctx, cx, cy - s * 0.30, s * 0.64);

  P.scan(ctx, W, H, 0.05);
  P.frame(ctx, W, H, '#3da9ff');
  P.caption(ctx, W, H, 'MUSHOKU TENSEI', 'Rudeus · childhood arc', '#3da9ff');
}

/* -------------------------------- PONYO ------------------------------- */
function drawPonyo(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, [[0, '#a5e2ff'], [0.40, '#43acea'], [1, '#093a63']]);
  ctx.fillRect(0, 0, W, H);
  // sun
  P.circle(ctx, W * 0.22, H * 0.16, W * 0.10, P.radial(ctx, W * 0.22, H * 0.16, W * 0.10,
    [[0, '#fffbe8'], [0.5, '#ffe58a'], [1, 'rgba(255,229,138,0)']]));
  // stacked waves
  const waves = [
    { y: 0.58, c: '#2b8fd0' }, { y: 0.66, c: '#1f7bbb' },
    { y: 0.74, c: '#166aa3' }, { y: 0.84, c: '#0d5688' }
  ];
  waves.forEach((w, i) => {
    ctx.beginPath(); ctx.moveTo(0, H * w.y);
    for (let x = 0; x <= W; x += 12) {
      ctx.lineTo(x, H * w.y + Math.sin(x / 28 + i * 1.3) * H * 0.028);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fillStyle = w.c; ctx.fill();
  });
  // foam
  ctx.strokeStyle = 'rgba(255,255,255,.62)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = H * 0.58 + Math.sin(x / 28) * H * 0.028;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  const cx = W * 0.55, cy = H * 0.44, s = W * 0.15;
  // red dress
  ctx.fillStyle = '#e8354a';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, cy + s * 0.40);
  ctx.quadraticCurveTo(cx - s * 0.98, cy + s * 1.58, cx, cy + s * 1.62);
  ctx.quadraticCurveTo(cx + s * 0.98, cy + s * 1.58, cx + s * 0.52, cy + s * 0.40);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillRect(cx - s * 0.40, cy + s * 0.42, s * 0.80, s * 0.16);
  // arms up in joy
  ctx.strokeStyle = '#ffe0c8'; ctx.lineWidth = s * 0.26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - s * 0.46, cy + s * 0.52); ctx.lineTo(cx - s * 1.10, cy - s * 0.30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.46, cy + s * 0.52); ctx.lineTo(cx + s * 1.10, cy - s * 0.30); ctx.stroke();
  // head
  P.circle(ctx, cx, cy - s * 0.34, s * 0.76, '#ffe4cf');
  // orange bob hair
  ctx.fillStyle = '#f0602e';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.42, s * 0.84, Math.PI * 0.98, Math.PI * 2.02);
  ctx.quadraticCurveTo(cx + s * 0.84, cy + s * 0.16, cx + s * 0.62, cy + s * 0.10);
  ctx.quadraticCurveTo(cx, cy - s * 0.24, cx - s * 0.62, cy + s * 0.10);
  ctx.quadraticCurveTo(cx - s * 0.84, cy + s * 0.16, cx - s * 0.84, cy - s * 0.42);
  ctx.fill();
  P.chibiFace(ctx, cx, cy - s * 0.28, s * 0.66);
  // little fish friends
  [[0.14, 0.70], [0.84, 0.76], [0.30, 0.86]].forEach(([fx, fy]) => {
    const x = W * fx, y = H * fy, r = W * 0.026;
    P.circle(ctx, x, y, r, '#ff8a5c');
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 2.1, y - r * 0.8);
    ctx.lineTo(x - r * 2.1, y + r * 0.8); ctx.closePath(); ctx.fillStyle = '#ff8a5c'; ctx.fill();
    P.circle(ctx, x + r * 0.35, y - r * 0.25, r * 0.20, '#0d2a3d');
  });

  P.scan(ctx, W, H, 0.04);
  P.frame(ctx, W, H, '#ff5c8a');
  P.caption(ctx, W, H, 'PONYO', 'Studio Ghibli · 2008', '#ff5c8a');
}

/* ------------------------------ NAUSICAÄ ------------------------------ */
function drawNausicaa(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, [[0, '#ffd77a'], [0.38, '#e88b3c'], [0.72, '#8d4a2a'], [1, '#2a1508']]);
  ctx.fillRect(0, 0, W, H);
  // hazy sun
  P.circle(ctx, W * 0.5, H * 0.30, W * 0.20, P.radial(ctx, W * 0.5, H * 0.30, W * 0.20,
    [[0, 'rgba(255,251,224,.95)'], [0.55, 'rgba(255,214,120,.45)'], [1, 'rgba(255,214,120,0)']]));
  // layered dunes
  [['#b3652f', 0.62], ['#8e4d24', 0.72], ['#6b3a1b', 0.84]].forEach(([c, y]) => {
    ctx.beginPath(); ctx.moveTo(0, H * y);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * y - Math.sin(x / 55) * H * 0.035);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fillStyle = c; ctx.fill();
  });
  // spore drift
  for (let i = 0; i < 45; i++) {
    ctx.globalAlpha = 0.16 + Math.random() * 0.3;
    P.circle(ctx, Math.random() * W, Math.random() * H * 0.8, Math.random() * 2.6 + 0.6, '#fff3cf');
  }
  ctx.globalAlpha = 1;

  // Möwe glider
  const gx = W * 0.5, gy = H * 0.44, s = W * 0.15;
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.10);
  ctx.fillStyle = '#f2ede0';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 1.85, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8d0bd';
  ctx.beginPath(); ctx.ellipse(0, s * 0.10, s * 1.85, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c1b8a2';
  ctx.beginPath(); ctx.moveTo(-s * 0.20, 0); ctx.lineTo(-s * 0.62, -s * 0.34); ctx.lineTo(-s * 0.14, -s * 0.06); ctx.closePath(); ctx.fill();
  ctx.restore();
  // pilot in blue
  ctx.fillStyle = '#2f6fb0';
  ctx.beginPath();
  ctx.moveTo(gx - s * 0.26, gy + s * 0.12);
  ctx.quadraticCurveTo(gx, gy + s * 1.02, gx + s * 0.26, gy + s * 0.12);
  ctx.closePath(); ctx.fill();
  P.circle(ctx, gx, gy - s * 0.24, s * 0.34, '#ffe0c4');
  ctx.fillStyle = '#c9702c';
  ctx.beginPath(); ctx.arc(gx, gy - s * 0.30, s * 0.38, Math.PI * 0.96, Math.PI * 2.04); ctx.fill();
  P.chibiFace(ctx, gx, gy - s * 0.20, s * 0.28);
  // ohmu eyes glowing in the dust below
  for (let i = 0; i < 5; i++) {
    const ox = W * (0.16 + i * 0.17), oy = H * (0.80 + (i % 2) * 0.05);
    P.glow(ctx, '#7dffd0', 16, () => P.circle(ctx, ox, oy, W * 0.017, '#c8ffe9'));
  }

  P.scan(ctx, W, H, 0.05);
  P.frame(ctx, W, H, '#ffc42e');
  P.caption(ctx, W, H, 'NAUSICAÄ', 'Valley of the Wind · 1984', '#ffc42e');
}

/* --------------------- WHEN MARNIE WAS THERE -------------------------- */
function drawMarnie(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, [[0, '#0a1c3a'], [0.42, '#12386b'], [1, '#050d1c']]);
  ctx.fillRect(0, 0, W, H);
  P.stars(ctx, W, H, 70, 'rgba(220,240,255,.95)');
  // full moon
  P.circle(ctx, W * 0.74, H * 0.20, W * 0.115, P.radial(ctx, W * 0.74, H * 0.20, W * 0.115,
    [[0, '#ffffff'], [0.62, '#e8f4ff'], [1, 'rgba(200,230,255,.15)']]));
  // marsh water
  ctx.fillStyle = P.grad(ctx, 0, H * 0.62, 0, H, [[0, '#12406f'], [1, '#061527']]);
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  // moon reflection shimmer
  for (let i = 0; i < 16; i++) {
    const y = H * (0.64 + i * 0.021);
    const w = W * (0.06 + Math.random() * 0.08);
    ctx.globalAlpha = 0.30 - i * 0.016;
    ctx.fillStyle = '#dff0ff';
    ctx.fillRect(W * 0.74 - w / 2, y, w, 2.4);
  }
  ctx.globalAlpha = 1;

  // the marsh house
  const hx = W * 0.32, hy = H * 0.62, hw = W * 0.30, hh = H * 0.24;
  ctx.fillStyle = '#1d2a3f'; ctx.fillRect(hx - hw / 2, hy - hh, hw, hh);
  ctx.fillStyle = '#0f1826';
  ctx.beginPath();
  ctx.moveTo(hx - hw * 0.60, hy - hh);
  ctx.lineTo(hx, hy - hh - H * 0.10);
  ctx.lineTo(hx + hw * 0.60, hy - hh);
  ctx.closePath(); ctx.fill();
  // warm windows
  const win = [[-0.28, -0.74], [0.06, -0.74], [-0.28, -0.34], [0.06, -0.34]];
  win.forEach(([dx, dy]) => {
    P.glow(ctx, '#ffcf7a', 20, () => {
      ctx.fillStyle = '#ffd98f';
      ctx.fillRect(hx + hw * dx, hy + hh * dy, hw * 0.20, hh * 0.24);
    });
  });
  // house reflection
  ctx.save(); ctx.globalAlpha = 0.24; ctx.scale(1, -1);
  ctx.fillStyle = '#1d2a3f';
  ctx.fillRect(hx - hw / 2, -(hy + hh) - hh * 0.02, hw, hh);
  ctx.restore(); ctx.globalAlpha = 1;
  // reeds
  ctx.strokeStyle = '#0b1a2c'; ctx.lineWidth = 2.4;
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W, h = H * (0.06 + Math.random() * 0.10);
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + (Math.random() - 0.5) * 12, H - h); ctx.stroke();
  }
  // two small silhouettes on the jetty
  [[0.60, '#0b1524'], [0.66, '#0b1524']].forEach(([fx, c], i) => {
    const x = W * fx, y = H * 0.70, s = W * 0.030;
    P.circle(ctx, x, y - s * 2.0, s * 0.62, c);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.68, y); ctx.quadraticCurveTo(x, y - s * 1.5, x + s * 0.68, y);
    ctx.closePath(); ctx.fill();
    if (i === 1) { // Marnie's blonde hair catches the moon
      P.glow(ctx, '#ffe9a8', 10, () => P.circle(ctx, x, y - s * 2.15, s * 0.66, 'rgba(255,233,168,.75)'));
    }
  });

  P.scan(ctx, W, H, 0.05);
  P.frame(ctx, W, H, '#8ad7ff');
  P.caption(ctx, W, H, 'WHEN MARNIE WAS THERE', 'Studio Ghibli · 2014', '#8ad7ff');
}

/* ═══════════════════════════ GAME CARDS (600x800, 3:4) ═══════════════════ */

function gameShell(ctx, W, H, bg, accent, title, sub, drawArt) {
  ctx.fillStyle = P.grad(ctx, 0, 0, 0, H, bg);
  ctx.fillRect(0, 0, W, H);
  drawArt(ctx, W, H);
  P.scan(ctx, W, H, 0.05);
  P.frame(ctx, W, H, accent);
  P.caption(ctx, W, H, title, sub, accent);
}

/* ROBLOX — tilted red studded block */
function drawRoblox(ctx, W, H) {
  gameShell(ctx, W, H,
    [[0, '#2a0c0c'], [0.5, '#5a1414'], [1, '#0d0303']], '#ff3b3b',
    'ROBLOX', 'Building + play', (c, W, H) => {
      P.stars(c, W, H, 30, 'rgba(255,190,190,.7)');
      const cx = W * 0.5, cy = H * 0.40, s = W * 0.26;
      // isometric cube
      c.fillStyle = '#c22c2c';
      c.beginPath();
      c.moveTo(cx, cy - s);            c.lineTo(cx + s, cy - s * 0.5);
      c.lineTo(cx + s, cy + s * 0.5);  c.lineTo(cx, cy + s);
      c.lineTo(cx - s, cy + s * 0.5);  c.lineTo(cx - s, cy - s * 0.5);
      c.closePath(); c.fill();
      c.fillStyle = '#e64545';
      c.beginPath();
      c.moveTo(cx, cy - s); c.lineTo(cx + s, cy - s * 0.5);
      c.lineTo(cx, cy);     c.lineTo(cx - s, cy - s * 0.5);
      c.closePath(); c.fill();
      c.fillStyle = '#8f1d1d';
      c.beginPath();
      c.moveTo(cx, cy); c.lineTo(cx + s, cy - s * 0.5);
      c.lineTo(cx + s, cy + s * 0.5); c.lineTo(cx, cy + s);
      c.closePath(); c.fill();
      // studs on the top face
      [[-0.42, -0.30], [0.0, -0.50], [0.42, -0.30], [0.0, -0.10]].forEach(([dx, dy]) => {
        P.ellipse(c, cx + s * dx, cy + s * dy, s * 0.15, s * 0.075, '#ff6b6b');
      });
      P.glow(c, '#ff3b3b', 26, () => {
        c.strokeStyle = 'rgba(255,120,120,.55)'; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, s * 1.5, 0, Math.PI * 2); c.stroke();
      });
    });
}

/* CS2 — crosshair + bullet impacts */
function drawCs2(ctx, W, H) {
  gameShell(ctx, W, H,
    [[0, '#2a1a06'], [0.5, '#4d3208'], [1, '#0d0802']], '#ffa62e',
    'CS2', 'Competitive FPS', (c, W, H) => {
      // dust-style horizon
      c.fillStyle = '#6b4a12';
      c.beginPath(); c.moveTo(0, H * 0.52);
      for (let x = 0; x <= W; x += W / 10) c.lineTo(x, H * (0.44 + Math.random() * 0.10));
      c.lineTo(W, H); c.lineTo(0, H); c.fill();
      const cx = W * 0.5, cy = H * 0.36, g = W * 0.055, len = W * 0.19;
      P.glow(c, '#ffd27a', 22, () => {
        c.strokeStyle = '#ffe9b8'; c.lineWidth = Math.max(3, W * 0.017); c.lineCap = 'round';
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
          c.beginPath();
          c.moveTo(cx + dx * g, cy + dy * g);
          c.lineTo(cx + dx * (g + len), cy + dy * (g + len));
          c.stroke();
        });
        c.beginPath(); c.arc(cx, cy, W * 0.012, 0, Math.PI * 2);
        c.fillStyle = '#fff3d6'; c.fill();
      });
      // bullet holes
      for (let i = 0; i < 7; i++) {
        const x = W * (0.10 + Math.random() * 0.80), y = H * (0.12 + Math.random() * 0.42);
        P.circle(c, x, y, W * 0.016, 'rgba(20,12,4,.85)');
        c.strokeStyle = 'rgba(255,210,140,.30)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(x, y, W * 0.030, 0, Math.PI * 2); c.stroke();
      }
    });
}

/* UNDERTALE — heart soul + bone bullets */
function drawUndertale(ctx, W, H) {
  gameShell(ctx, W, H,
    [[0, '#050510'], [0.5, '#0a0a1e'], [1, '#020208']], '#d8d8ff',
    'UNDERTALE', 'Pacifist & genocide', (c, W, H) => {
      P.stars(c, W, H, 80, 'rgba(255,255,255,.95)');
      // battle box
      c.strokeStyle = '#e8e8ff'; c.lineWidth = Math.max(3, W * 0.012);
      c.strokeRect(W * 0.16, H * 0.20, W * 0.68, H * 0.36);
      // red soul heart
      const hx = W * 0.5, hy = H * 0.38, s = W * 0.085;
      P.glow(c, '#ff2b4a', 28, () => {
        c.fillStyle = '#ff3355';
        c.beginPath();
        c.moveTo(hx, hy + s * 0.85);
        c.bezierCurveTo(hx - s * 1.5, hy - s * 0.25, hx - s * 0.5, hy - s * 1.15, hx, hy - s * 0.35);
        c.bezierCurveTo(hx + s * 0.5, hy - s * 1.15, hx + s * 1.5, hy - s * 0.25, hx, hy + s * 0.85);
        c.fill();
      });
      // bone bullets
      c.fillStyle = '#f2f2ff';
      [[0.24, 0.30], [0.74, 0.46], [0.30, 0.50]].forEach(([bx, by]) => {
        const x = W * bx, y = H * by, bw = W * 0.10, bh = W * 0.022;
        c.fillRect(x - bw / 2, y - bh / 2, bw, bh);
        [[-bw / 2, -1], [-bw / 2, 1], [bw / 2, -1], [bw / 2, 1]].forEach(([ox, oy]) => {
          P.circle(c, x + ox, y + oy * bh, bh * 0.95, '#f2f2ff');
        });
      });
    });
}

/* DELTARUNE — dark fountain + spade */
function drawDeltarune(ctx, W, H) {
  gameShell(ctx, W, H,
    [[0, '#160a2e'], [0.5, '#2a1152'], [1, '#06030f']], '#8a5cff',
    'DELTARUNE', 'Chapters 1–4', (c, W, H) => {
      P.stars(c, W, H, 60, 'rgba(220,200,255,.9)');
      // fountain beam
      const fx = W * 0.5;
      const g = P.grad(c, fx, H * 0.68, fx, H * 0.10,
        [[0, 'rgba(160,110,255,.65)'], [1, 'rgba(160,110,255,0)']]);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(fx - W * 0.075, H * 0.68); c.lineTo(fx + W * 0.075, H * 0.68);
      c.lineTo(fx + W * 0.028, H * 0.08); c.lineTo(fx - W * 0.028, H * 0.08);
      c.closePath(); c.fill();
      // pool
      P.ellipse(c, fx, H * 0.68, W * 0.22, H * 0.035, '#3a1c6e');
      P.ellipse(c, fx, H * 0.675, W * 0.16, H * 0.024, '#6a3cc0');
      // spade
      const sx = fx, sy = H * 0.40, s = W * 0.095;
      P.glow(c, '#b98cff', 24, () => {
        c.fillStyle = '#e6d8ff';
        c.beginPath();
        c.moveTo(sx, sy - s * 1.15);
        c.bezierCurveTo(sx + s * 1.30, sy + s * 0.18, sx + s * 0.42, sy + s * 0.80, sx, sy + s * 0.35);
        c.bezierCurveTo(sx - s * 0.42, sy + s * 0.80, sx - s * 1.30, sy + s * 0.18, sx, sy - s * 1.15);
        c.fill();
        c.fillRect(sx - s * 0.11, sy + s * 0.28, s * 0.22, s * 0.62);
        P.ellipse(c, sx, sy + s * 0.92, s * 0.34, s * 0.13, '#e6d8ff');
      });
    });
}

/* MOBILE LEGENDS — crossed blades + lane diamond */
function drawMlbb(ctx, W, H) {
  gameShell(ctx, W, H,
    [[0, '#04241f'], [0.5, '#0a4a3e'], [1, '#01100d']], '#2ee6c5',
    'MOBILE LEGENDS', 'MOBA — jungle / roam', (c, W, H) => {
      P.stars(c, W, H, 34, 'rgba(190,255,240,.8)');
      const cx = W * 0.5, cy = H * 0.38;
      // lane diamond
      c.strokeStyle = 'rgba(46,230,197,.35)'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(cx, cy - H * 0.20); c.lineTo(cx + W * 0.30, cy);
      c.lineTo(cx, cy + H * 0.20); c.lineTo(cx - W * 0.30, cy);
      c.closePath(); c.stroke();
      // three lanes
      c.strokeStyle = 'rgba(46,230,197,.22)';
      [[-0.30, 0.30], [0, 0], [0.30, -0.30]].forEach(([a, b]) => {
        c.beginPath();
        c.moveTo(cx + W * a, cy - H * 0.20); c.lineTo(cx + W * b, cy + H * 0.20);
        c.stroke();
      });
      // crossed swords
      const drawBlade = (rot) => {
        c.save(); c.translate(cx, cy); c.rotate(rot);
        c.fillStyle = '#cfe9e3'; c.fillRect(-W * 0.016, -H * 0.17, W * 0.032, H * 0.28);
        c.fillStyle = '#8fbfb5'; c.fillRect(-W * 0.016, -H * 0.17, W * 0.013, H * 0.28);
        c.fillStyle = '#d6a44a'; c.fillRect(-W * 0.055, H * 0.10, W * 0.11, H * 0.017);
        c.fillStyle = '#6b4a1e'; c.fillRect(-W * 0.012, H * 0.115, W * 0.024, H * 0.075);
        c.restore();
      };
      P.glow(c, '#2ee6c5', 20, () => { drawBlade(0.42); drawBlade(-0.42); });
      P.glow(c, '#2ee6c5', 26, () => P.circle(c, cx, cy, W * 0.030, '#b8fff0'));
    });
}

/* ═══════════════════ PROFILE (500x500, square fallback) ═════════════════ */
function drawProfile(ctx, W, H) {
  ctx.fillStyle = P.grad(ctx, 0, 0, W, H, [[0, '#1b0a3a'], [0.55, '#3a0f5e'], [1, '#0a0418']]);
  ctx.fillRect(0, 0, W, H);
  P.stars(ctx, W, H, 40, 'rgba(220,200,255,.75)');

  const cx = W / 2, cy = H * 0.52, s = W * 0.20;
  // shoulders
  ctx.fillStyle = '#141426';
  ctx.beginPath();
  ctx.moveTo(cx - s * 1.75, H);
  ctx.quadraticCurveTo(cx - s * 1.55, cy + s * 0.80, cx, cy + s * 0.70);
  ctx.quadraticCurveTo(cx + s * 1.55, cy + s * 0.80, cx + s * 1.75, H);
  ctx.closePath(); ctx.fill();
  // neon collar
  P.glow(ctx, '#00f5ff', 18, () => {
    ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = Math.max(2, s * 0.075);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy + s * 0.78);
    ctx.quadraticCurveTo(cx, cy + s * 1.05, cx + s * 0.85, cy + s * 0.78);
    ctx.stroke();
  });
  // head
  P.circle(ctx, cx, cy - s * 0.15, s * 0.86, '#f7dcc0');
  // hair
  ctx.fillStyle = '#1c1410';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.30, s * 0.92, Math.PI * 0.98, Math.PI * 2.02);
  ctx.quadraticCurveTo(cx + s * 0.55, cy - s * 0.55, cx, cy - s * 0.72);
  ctx.quadraticCurveTo(cx - s * 0.55, cy - s * 0.55, cx - s * 0.92, cy - s * 0.30);
  ctx.fill();
  P.chibiFace(ctx, cx, cy - s * 0.10, s * 0.70);
  // cyber visor glow across the eyes
  P.glow(ctx, '#00f5ff', 22, () => {
    ctx.fillStyle = 'rgba(0,245,255,.20)';
    ctx.fillRect(cx - s * 0.92, cy - s * 0.34, s * 1.84, s * 0.30);
    ctx.strokeStyle = 'rgba(0,245,255,.75)'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - s * 0.92, cy - s * 0.34, s * 1.84, s * 0.30);
  });
  P.scan(ctx, W, H, 0.05);
  P.frame(ctx, W, H, '#bf00ff');
  ctx.textAlign = 'center';
  P.glow(ctx, '#00f5ff', 16, () => {
    ctx.fillStyle = '#e9ecff';
    ctx.font = `700 ${Math.round(W * 0.072)}px Orbitron, system-ui, sans-serif`;
    ctx.fillText('AS', cx, H * 0.93);
  });
}

/* ---------------------------- registry -------------------------------- */
const POSTERS = {
  // anime — 2:3
  berserk:  drawBerserk,
  mushoku:  drawMushoku,
  ponyo:    drawPonyo,
  nausicaa: drawNausicaa,
  marnie:   drawMarnie,
  // games — 3:4
  roblox:    drawRoblox,
  cs2:       drawCs2,
  undertale: drawUndertale,
  deltarune: drawDeltarune,
  mlbb:      drawMlbb,
  // profile — 1:1
  profile:   drawProfile
};

const _posterCache = {};

/** Render a poster to a fresh canvas. Cached by key+size. */
function makePoster(key, W = 600, H = 900) {
  const id = `${key}_${W}x${H}`;
  if (_posterCache[id]) return _posterCache[id];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const fn = POSTERS[key];
  if (fn) {
    fn(ctx, W, H);
  } else {
    ctx.fillStyle = '#12121c'; ctx.fillRect(0, 0, W, H);
    P.frame(ctx, W, H, '#00f5ff');
    P.caption(ctx, W, H, String(key).toUpperCase(), 'no artwork yet', '#00f5ff');
  }
  _posterCache[id] = cv;
  return cv;
}

/* ═══════════════════════ IMAGE-WITH-FALLBACK LOADER ═════════════════════
   Tries to load `src` (your photo in assets/). If it 404s or is missing, the
   drawn artwork for `key` is used instead. Either way you get a canvas at the
   exact target size, cover-cropped from the centre so aspect never distorts.

   makeCard(key, src, W, H, onReady, opts)
     onReady(canvas, usedImage)  fires once the decision is made
     opts.decor       { title, sub, accent } — repaints the neon frame and
                      caption on top of your photo so it still reads as a card
     opts.forTexture  true when the canvas will be uploaded to WebGL. Enables
                      the taint check below, which is REQUIRED for three.js.

   ░░ THREE BUGS LIVED HERE — DO NOT REINTRODUCE THEM ░░

   1. `img.crossOrigin = 'anonymous'` used to be set on EVERY image, including
      the relative ones in assets/. That one line is why no photo ever appeared
      when index.html was opened directly (file://) — the normal case for a PC
      double-click and for a folder unzipped on Android. A file:// image has an
      opaque origin, so an anonymous CORS request for it can never succeed:
      onerror fired for all ten photos and every card silently fell back to
      drawn art. Verified in Chrome — the same file loads WITHOUT the attribute
      and fails WITH it. crossOrigin only means anything for a genuinely
      cross-origin URL, so only such a URL gets it now.

   2. Drawing a file:// image into a canvas TAINTS that canvas. A tainted canvas
      cannot be uploaded as a WebGL texture: three.js throws SecurityError on
      every frame, the render loop's fallback path throws too, and the entire
      3D scene goes black — far worse than one missing picture. So a photo bound
      for a texture is trial-drawn into a 1x1 scratch canvas first; if that
      cannot be read back, the photo is refused and the (always safe) drawn art
      is kept. The real canvas is never touched, because tainting is permanent.
      DOM cards in the panels pass forTexture:false and DO show the photo —
      display never needs readback, so those are safe either way.

   3. Ten full-size photos decoding at once is an out-of-memory risk on a phone
      (cs2.jpg alone is 1792x2400 ≈ 17 MB decoded). OOM shows up as a lost
      WebGL context — another black screen. Loads now go through a small queue,
      and each decoded image is released as soon as it has been drawn.
   ===================================================================== */
function isCrossOrigin(src) {
  /* data: and blob: are same-origin by definition, but `new URL(...).origin`
     reports "null" for them — which made this return true and put a pointless
     (and on some engines fatal) crossOrigin attribute on every baked photo.
     Check them explicitly and first. */
  if (/^(data|blob):/i.test(src)) return false;
  // no scheme and no protocol-relative prefix => relative path => same origin
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^\/\//.test(src)) return false;
  try {
    return new URL(src, location.href).origin !== location.origin;
  } catch (e) {
    return false;
  }
}

/* Would drawing this image poison a canvas for WebGL? Test on a throwaway. */
function taintsCanvas(img) {
  try {
    const t = document.createElement('canvas');
    t.width = t.height = 1;
    const tc = t.getContext('2d');
    tc.drawImage(img, 0, 0, 1, 1);
    tc.getImageData(0, 0, 1, 1);
    return false;
  } catch (e) {
    return true;
  }
}

/* ── decode queue ──────────────────────────────────────────────────────────
   Two at a time on a phone, four on a desktop. Keeps peak memory bounded so a
   mid-range Android never loses its WebGL context while the gallery loads. */
const _imgQueue = [];
let _imgActive = 0;
function _queueLimit() {
  return (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ? 2 : 4;
}
function _pump() {
  while (_imgActive < _queueLimit() && _imgQueue.length) {
    const job = _imgQueue.shift();
    _imgActive++;
    job(() => { _imgActive--; _pump(); });
  }
}
/* exposed so a test can prove the queue actually drains */
function imgQueueState() { return { queued: _imgQueue.length, active: _imgActive }; }

function decorate(ctx, W, H, decor) {
  if (!decor) return;
  const accent = decor.accent || '#00f5ff';
  P.scan(ctx, W, H, 0.045);
  P.frame(ctx, W, H, accent);
  if (decor.title) P.caption(ctx, W, H, decor.title, decor.sub || '', accent);
}

function makeCard(key, src, W, H, onReady, opts) {
  opts = opts || {};
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const drawFallback = () => {
    const art = makePoster(key, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(art, 0, 0, W, H);
  };

  // paint the fallback immediately so nothing is ever blank
  drawFallback();

  const finish = (used) => {
    cv._usedImage = used;
    if (onReady) onReady(cv, used);
  };

  if (!src) {
    // async so callers can rely on onReady never firing before they return
    setTimeout(() => finish(false), 0);
    return cv;
  }

  _imgQueue.push((release) => {
    let settled = false;
    const img = new Image();
    // ONLY for a real cross-origin URL — see note 1 above.
    if (isCrossOrigin(src)) img.crossOrigin = 'anonymous';

    const done = (used) => {
      if (settled) return;
      settled = true;
      img.onload = img.onerror = null;
      img.src = '';                 // let the decoded bitmap go — note 3
      release();
      finish(used);
    };

    img.onload = () => {
      if (!img.width || !img.height) return done(false);   // decoded to nothing
      if (opts.forTexture && taintsCanvas(img)) {          // note 2
        cv._taintRefused = true;
        return done(false);
      }
      // cover-crop into W x H
      const ir = img.width / img.height, tr = W / H;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
      else         { sh = img.width / tr;  sy = (img.height - sh) / 2; }
      try {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      } catch (e) {
        drawFallback();                                    // never leave it half-drawn
        return done(false);
      }
      // keep the neon frame + caption on top of your photo
      if (opts.decor) decorate(ctx, W, H, opts.decor);
      else if (typeof cv._decorate === 'function') cv._decorate(ctx, W, H);
      done(true);
    };

    img.onerror = () => done(false);

    // A photo that never resolves must not wedge the queue.
    setTimeout(() => { if (!settled) done(false); }, 15000);

    img.src = src;
  });
  _pump();

  return cv;
}

window.makePoster = makePoster;
window.makeCard = makeCard;
window.imgQueueState = imgQueueState;
window.POSTERS = POSTERS;
window.P = P;

