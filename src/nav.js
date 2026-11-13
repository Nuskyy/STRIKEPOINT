// Grille de navigation au sol + A* + lissage du chemin.
const NEI = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class NavGrid {
  constructor(boxes, half, cell = 1, inflate = 0.5) {
    this.cell = cell;
    this.o = -half;
    const n = this.n = Math.ceil((2 * half) / cell);
    this.walk = new Uint8Array(n * n).fill(1);
    for (const b of boxes) {
      if (b.max.y <= 0.42 || b.min.y >= 1.7) continue;
      const x0 = Math.max(0, Math.floor((b.min.x - inflate - this.o) / cell));
      const x1 = Math.min(n - 1, Math.floor((b.max.x + inflate - this.o) / cell));
      const z0 = Math.max(0, Math.floor((b.min.z - inflate - this.o) / cell));
      const z1 = Math.min(n - 1, Math.floor((b.max.z + inflate - this.o) / cell));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const cx = this.o + (x + 0.5) * cell, cz = this.o + (z + 0.5) * cell;
          if (cx > b.min.x - inflate && cx < b.max.x + inflate && cz > b.min.z - inflate && cz < b.max.z + inflate)
            this.walk[z * n + x] = 0;
        }
    }
    for (let i = 0; i < n; i++) {
      this.walk[i] = 0; this.walk[(n - 1) * n + i] = 0; this.walk[i * n] = 0; this.walk[i * n + n - 1] = 0;
    }
    this.g = new Float32Array(n * n);
    this.par = new Int32Array(n * n);
    this.seen = new Uint32Array(n * n);
    this.closed = new Uint32Array(n * n);
    this.gen = 0;
    this.hIdx = []; this.hF = [];
  }

  ci(x) { return Math.floor((x - this.o) / this.cell); }
  ok(i, j) { const n = this.n; return i >= 0 && j >= 0 && i < n && j < n && this.walk[j * n + i] === 1; }
  walkableAt(x, z) { return this.ok(this.ci(x), this.ci(z)); }
  center(i, j) { return { x: this.o + (i + 0.5) * this.cell, z: this.o + (j + 0.5) * this.cell }; }

  nearest(i, j, maxR = 8) {
    if (this.ok(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++)
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.ok(i + di, j + dj)) return [i + di, j + dj];
        }
    return null;
  }

  nearestWorld(x, z) {
    const c = this.nearest(this.ci(x), this.ci(z), 12);
    return c ? this.center(c[0], c[1]) : null;
  }

  _push(i, f) {
    const hi = this.hIdx, hf = this.hF;
    let k = hi.length; hi.push(i); hf.push(f);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hi[k] = hi[p]; hf[k] = hf[p]; k = p;
    }
    hi[k] = i; hf[k] = f;
  }

  _pop() {
    const hi = this.hIdx, hf = this.hF;
    const top = hi[0];
    const li = hi.pop(), lf = hf.pop();
    const len = hi.length;
    if (len > 0) {
      let k = 0;
      while (true) {
        let c = 2 * k + 1;
        if (c >= len) break;
        if (c + 1 < len && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hi[k] = hi[c]; hf[k] = hf[c]; k = c;
      }
      hi[k] = li; hf[k] = lf;
    }
    return top;
  }

  findPath(sx, sz, tx, tz) {
    const s = this.nearest(this.ci(sx), this.ci(sz));
    const t = this.nearest(this.ci(tx), this.ci(tz));
    if (!s || !t) return null;
    const n = this.n, gen = ++this.gen;
    const si = s[1] * n + s[0], ti = t[1] * n + t[0];
    const g = this.g, par = this.par, seen = this.seen, closed = this.closed;
    const tiX = t[0], tiZ = t[1];
    const h = (i) => {
      const dx = Math.abs((i % n) - tiX), dz = Math.abs(((i / n) | 0) - tiZ);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    this.hIdx.length = 0; this.hF.length = 0;
    g[si] = 0; seen[si] = gen; par[si] = -1;
    this._push(si, h(si));
    let found = false, iter = 0;
    while (this.hIdx.length && iter++ < 30000) {
      const cur = this._pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === ti) { found = true; break; }
      const ci = cur % n, cj = (cur / n) | 0;
      for (let k = 0; k < 8; k++) {
        const di = NEI[k][0], dj = NEI[k][1];
        const ni = ci + di, nj = cj + dj;
        if (!this.ok(ni, nj)) continue;
        if (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj))) continue;
        const nIdx = nj * n + ni;
        if (closed[nIdx] === gen) continue;
        const ng = g[cur] + NEI[k][2];
        if (seen[nIdx] !== gen || ng < g[nIdx]) {
          seen[nIdx] = gen; g[nIdx] = ng; par[nIdx] = cur;
          this._push(nIdx, ng + h(nIdx));
        }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let c = ti; c !== -1; c = par[c]) pts.push(this.center(c % n, (c / n) | 0));
    pts.reverse();
    if (this.walkableAt(tx, tz)) pts[pts.length - 1] = { x: tx, z: tz };
    return this.smooth(pts);
  }

  lineOk(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(d / 0.3));
    for (let k = 0; k <= steps; k++) {
      if (!this.walkableAt(a.x + (dx * k) / steps, a.z + (dz * k) / steps)) return false;
    }
    return true;
  }

  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let a = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineOk(pts[a], pts[i])) { out.push(pts[i - 1]); a = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  randomPoint(cx = 0, cz = 0, radius = 1e9) {
    for (let k = 0; k < 200; k++) {
      let x, z;
      if (radius > 500) { x = this.o + Math.random() * this.n * this.cell; z = this.o + Math.random() * this.n * this.cell; }
      else { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius; x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; }
      if (this.walkableAt(x, z)) return { x, z };
    }
    return { x: cx, z: cz };
  }
}
