// Textures procédurales générées sur canvas (aucun asset externe requis).
import * as THREE from 'three';

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function mk(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function grain(ctx, size, r, amt) {
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function wrapDraw(size, x, y, rad, fn) {
  for (let ox = -1; ox <= 1; ox++)
    for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * size, py = y + oy * size;
      if (px + rad < 0 || px - rad > size || py + rad < 0 || py - rad > size) continue;
      fn(px, py);
    }
}

function blotches(ctx, size, r, n, rMin, rMax, cols, aMax) {
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, rad = rMin + r() * (rMax - rMin);
    const a = r() * aMax, c = cols[(r() * cols.length) | 0];
    wrapDraw(size, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
}

function specks(ctx, size, r, n, cols, aMax, sMax = 2) {
  for (let i = 0; i < n; i++) {
    const c = cols[(r() * cols.length) | 0];
    ctx.fillStyle = `rgba(${c},${r() * aMax})`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * sMax, 1 + r() * sMax);
  }
}

function cracks(ctx, size, r, n, a) {
  ctx.strokeStyle = `rgba(25,25,25,${a})`;
  for (let i = 0; i < n; i++) {
    let x = r() * size, y = r() * size, ang = r() * Math.PI * 2;
    ctx.lineWidth = 0.6 + r() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 8 + r() * 30;
    for (let j = 0; j < steps; j++) {
      ang += (r() - 0.5) * 0.9; x += Math.cos(ang) * 6; y += Math.sin(ang) * 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function concrete(seed = 1) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#9b9a94'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 160, 10, 70, ['70,70,66', '170,168,160', '110,105,95'], 0.14);
  specks(ctx, S, r, 4000, ['50,50,50', '200,200,195'], 0.35);
  cracks(ctx, S, r, 6, 0.35);
  // joints de dalles
  ctx.fillStyle = 'rgba(60,60,58,0.35)'; ctx.fillRect(0, 0, S, 2); ctx.fillRect(0, 0, 2, S);
  grain(ctx, S, r, 18);
  return c;
}

function brick(seed = 2) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#a69d90'; ctx.fillRect(0, 0, S, S);
  const bh = 32, bw = 96;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const v = r();
      const R = 130 + v * 40, G = 62 + v * 22, B = 45 + v * 15;
      ctx.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  blotches(ctx, S, r, 80, 10, 60, ['40,30,25', '200,190,170'], 0.15);
  specks(ctx, S, r, 2500, ['30,20,15', '210,200,190'], 0.3);
  grain(ctx, S, r, 22);
  return c;
}

function plaster(seed = 3) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#d2cab8'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 140, 15, 80, ['150,140,120', '235,230,220', '120,110,95'], 0.16);
  // coulures
  for (let i = 0; i < 40; i++) {
    const x = r() * S, w = 2 + r() * 10, h = 40 + r() * 200;
    const g = ctx.createLinearGradient(0, S - h, 0, S);
    g.addColorStop(0, 'rgba(90,80,65,0)'); g.addColorStop(1, `rgba(90,80,65,${0.1 + r() * 0.2})`);
    ctx.fillStyle = g; ctx.fillRect(x, S - h, w, h);
  }
  cracks(ctx, S, r, 5, 0.3);
  specks(ctx, S, r, 2500, ['80,75,65', '255,255,250'], 0.25);
  grain(ctx, S, r, 14);
  return c;
}

function metal(seed = 4) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  for (let x = 0; x < S; x++) {
    const v = 175 + 45 * Math.sin((x / S) * Math.PI * 2 * 16) + 10 * Math.sin((x / S) * Math.PI * 2 * 48);
    ctx.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    ctx.fillRect(x, 0, 1, S);
  }
  blotches(ctx, S, r, 90, 8, 50, ['120,70,40', '90,60,45', '220,220,220'], 0.25);
  for (let i = 0; i < 70; i++) {
    const x = r() * S, h = 30 + r() * 220, y = r() * S;
    ctx.fillStyle = `rgba(70,45,30,${0.05 + r() * 0.15})`;
    ctx.fillRect(x, y, 1 + r() * 4, h);
  }
  ctx.fillStyle = 'rgba(30,30,30,0.5)'; ctx.fillRect(0, 0, S, 3); ctx.fillRect(0, S - 3, S, 3);
  specks(ctx, S, r, 1500, ['40,40,40', '240,240,240'], 0.3);
  grain(ctx, S, r, 16);
  return c;
}

function wood(seed = 5) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#9c7748'; ctx.fillRect(0, 0, S, S);
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const y = (p * S) / planks, h = S / planks;
    const v = r();
    ctx.fillStyle = `rgb(${(140 + v * 30) | 0},${(105 + v * 22) | 0},${(65 + v * 15) | 0})`;
    ctx.fillRect(0, y + 2, S, h - 4);
    for (let l = 0; l < 30; l++) {
      ctx.strokeStyle = `rgba(80,55,30,${0.1 + r() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const yy = y + r() * h;
      ctx.moveTo(0, yy);
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + l) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,25,10,0.7)'; ctx.fillRect(0, y, S, 3);
  }
  // cadre de caisse
  ctx.strokeStyle = '#5e4326'; ctx.lineWidth = 44; ctx.strokeRect(22, 22, S - 44, S - 44);
  ctx.lineWidth = 36; ctx.beginPath(); ctx.moveTo(40, 40); ctx.lineTo(S - 40, S - 40); ctx.stroke();
  ctx.strokeStyle = 'rgba(20,12,5,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(44, 44, S - 88, S - 88);
  for (const [x, y] of [[22, 22], [S - 22, 22], [22, S - 22], [S - 22, S - 22]]) {
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  }
  grain(ctx, S, r, 20);
  return c;
}

function sandbag(seed = 6) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#6c6248'; ctx.fillRect(0, 0, S, S);
  const rows = 6, bh = S / rows, bw = S / 3;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 4; col++) {
      const x = col * bw + off, y = row * bh;
      const g = ctx.createRadialGradient(x + bw / 2, y + bh / 2, 5, x + bw / 2, y + bh / 2, bw / 1.6);
      const v = r() * 20;
      g.addColorStop(0, `rgb(${178 + v},${162 + v},${120 + v})`);
      g.addColorStop(1, `rgb(${110 + v},${98 + v},${70 + v})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + bw / 2, y + bh / 2, bw / 2 - 3, bh / 2 - 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  specks(ctx, S, r, 3000, ['60,50,30', '220,210,180'], 0.3);
  grain(ctx, S, r, 20);
  return c;
}

function asphalt(seed = 7) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#47474a'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 100, 10, 70, ['30,30,32', '90,90,92'], 0.2);
  specks(ctx, S, r, 9000, ['20,20,20', '140,140,140', '90,85,80'], 0.5, 2);
  cracks(ctx, S, r, 8, 0.45);
  grain(ctx, S, r, 20);
  return c;
}

function dirt(seed = 8) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#6e6550'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 220, 10, 70, ['90,80,58', '120,110,80', '70,72,48', '95,100,62', '55,50,40'], 0.3);
  specks(ctx, S, r, 9000, ['40,35,28', '150,140,120', '110,105,90'], 0.6, 3);
  grain(ctx, S, r, 26);
  return c;
}

function tiles(seed = 9) {
  const S = 512, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#5a5650'; ctx.fillRect(0, 0, S, S);
  const n = 4, t = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = r() * 20;
      ctx.fillStyle = `rgb(${150 + v},${145 + v},${135 + v})`;
      ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    }
  blotches(ctx, S, r, 80, 10, 60, ['60,55,45', '200,200,190'], 0.18);
  specks(ctx, S, r, 2000, ['40,40,40'], 0.3);
  grain(ctx, S, r, 14);
  return c;
}

function paint(seed = 10) {
  const S = 256, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 60, 8, 40, ['150,140,120', '255,255,255', '100,80,60'], 0.25);
  specks(ctx, S, r, 800, ['60,50,40'], 0.4);
  grain(ctx, S, r, 10);
  return c;
}

function ammo(seed = 11) {
  const S = 256, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = '#4c5a34'; ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, r, 40, 8, 40, ['30,35,20', '110,120,80'], 0.25);
  ctx.fillStyle = '#d6b032'; ctx.fillRect(0, S * 0.42, S, S * 0.16);
  ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('MUNITIONS', S / 2, S / 2 + 2);
  ctx.strokeStyle = '#2a321c'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, S - 10, S - 10);
  grain(ctx, S, r, 14);
  return c;
}

function holeTex() {
  const S = 64, [c, ctx] = mk(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.22, 'rgba(10,10,10,0.95)');
  g.addColorStop(0.35, 'rgba(40,38,35,0.7)');
  g.addColorStop(1, 'rgba(60,55,50,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return c;
}

function scorchTex() {
  const S = 256, [c, ctx] = mk(S), r = rng(77);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(5,5,5,0.95)');
  g.addColorStop(0.5, 'rgba(15,12,10,0.7)');
  g.addColorStop(1, 'rgba(20,18,15,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`;
    ctx.lineWidth = 2 + r() * 4;
    const a = r() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48); ctx.stroke();
  }
  return c;
}

function flashTex() {
  const S = 128, [c, ctx] = mk(S);
  ctx.translate(S / 2, S / 2);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    const g = ctx.createLinearGradient(0, 0, 0, -S / 2);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(0.4, 'rgba(255,170,60,0.8)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, -S / 2); ctx.lineTo(7, 0); ctx.fill();
  }
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
  g2.addColorStop(0, 'rgba(255,255,230,1)'); g2.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  return c;
}

/** Normal map dérivée de la luminance du canvas (filtre de Sobel, bords bouclés). */
function normalFrom(src, strength = 2.5) {
  const S = src.width;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const d = sctx.getImageData(0, 0, S, S).data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  const [c, ctx] = mk(S);
  const img = ctx.createImageData(S, S), o = img.data;
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      o[i] = (nx * 0.5 + 0.5) * 255; o[i + 1] = (ny * 0.5 + 0.5) * 255; o[i + 2] = (nz * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Carte de rugosité : zones sombres (crasse, joints) plus rugueuses, zones claires plus lisses. */
function roughFrom(src, base = 0.85, range = 0.25) {
  const S = src.width;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
  const [c, ctx] = mk(S);
  const img = ctx.createImageData(S, S), o = img.data;
  for (let i = 0; i < S * S; i++) {
    const l = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    const v = Math.max(0, Math.min(1, base + (0.5 - l) * range)) * 255;
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Camouflage (taches organiques en couches). */
function camo(seed, cols) {
  const S = 256, [c, ctx] = mk(S), r = rng(seed);
  ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, S, S);
  for (let layer = 1; layer < cols.length; layer++) {
    ctx.fillStyle = cols[layer];
    for (let i = 0; i < 26 - layer * 4; i++) {
      const x = r() * S, y = r() * S, rad = 8 + r() * (34 - layer * 5);
      wrapDraw(S, x, y, rad * 2, (px, py) => {
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.4) {
          const rr = rad * (0.6 + r() * 0.6);
          const X = px + Math.cos(a) * rr * 1.4, Y = py + Math.sin(a) * rr;
          if (a === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.closePath(); ctx.fill();
      });
    }
  }
  specks(ctx, S, r, 1500, ['0,0,0', '255,255,255'], 0.12);
  grain(ctx, S, r, 18);
  return c;
}

/** Brins d'herbe sur fond transparent. */
function grassTex() {
  const S = 256, [c, ctx] = mk(S), r = rng(31);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * (S - 40), h = S * (0.45 + r() * 0.55), w = 3 + r() * 5;
    const bend = (r() - 0.5) * 60;
    const g = ctx.createLinearGradient(0, S, 0, S - h);
    const t = r();
    g.addColorStop(0, `rgb(${40 + t * 20},${50 + t * 20},${25})`);
    g.addColorStop(1, `rgb(${120 + t * 50},${125 + t * 40},${60 + t * 20})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, S);
    ctx.quadraticCurveTo(x + bend * 0.3, S - h * 0.6, x + bend, S - h);
    ctx.quadraticCurveTo(x + bend * 0.3 + w * 0.3, S - h * 0.6, x + w, S);
    ctx.closePath(); ctx.fill();
  }
  return c;
}

/** Bruit métallique fin pour les armes. */
function gunNoise() {
  const S = 256, [c, ctx] = mk(S), r = rng(91);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.06})`;
    ctx.lineWidth = 1;
    const y = r() * S;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (r() - 0.5) * 4); ctx.stroke();
  }
  blotches(ctx, S, r, 30, 6, 30, ['0,0,0', '255,255,255'], 0.12);
  grain(ctx, S, r, 30);
  return c;
}

function toTex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = { hole: toTex(holeTex()), scorch: toTex(scorchTex()), flash: toTex(flashTex()), grass: toTex(grassTex()) };
  const surf = {
    concrete: [concrete(), 3, 0.92], brick: [brick(), 4, 0.88], plaster: [plaster(), 2.5, 0.93], metal: [metal(), 3.5, 0.55],
    wood: [wood(), 3, 0.8], sandbag: [sandbag(), 4, 0.98], asphalt: [asphalt(), 2.5, 0.9], dirt: [dirt(), 3, 0.97],
    tiles: [tiles(), 3, 0.6], paint: [paint(), 1, 0.35], ammo: [ammo(), 1.5, 0.7],
  };
  for (const [k, [cv, str, rough]] of Object.entries(surf)) {
    cache[k] = toTex(cv);
    cache[k + '_n'] = toTex(normalFrom(cv, str), false);
    cache[k + '_r'] = toTex(roughFrom(cv, rough, 0.3), false);
  }
  cache.camoA = toTex(camo(5, ['#5b6342', '#3f4630', '#7a7556', '#2c3022']));
  cache.camoB = toTex(camo(9, ['#9a8a68', '#7b6a4c', '#b5a481', '#5c4f3a']));
  cache.camoC = toTex(camo(13, ['#4a4f58', '#33373e', '#6a6f78', '#24272c']));
  const gn = gunNoise();
  cache.gun_n = toTex(normalFrom(gn, 1.2), false);
  cache.gun_r = toTex(roughFrom(gn, 0.5, 0.5), false);
  return cache;
}
