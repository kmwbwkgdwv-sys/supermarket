// ===== ナビゲーショングリッドとA*経路探索（three.js 非依存） =====
import { CELL, NAV_BOUNDS, DELIVERY_AREA, zones, getWalls, fixtureFootprint } from './data.js';

export class NavGrid {
  constructor() {
    const b = NAV_BOUNDS;
    this.minX = b.minX; this.minZ = b.minZ;
    this.w = Math.round((b.maxX - b.minX) / CELL);
    this.h = Math.round((b.maxZ - b.minZ) / CELL);
    this.cells = new Uint8Array(this.w * this.h); // 0=通行可, 1=不可
    this.version = 0;
  }
  cx(x) { return Math.floor((x - this.minX) / CELL); }
  cz(z) { return Math.floor((z - this.minZ) / CELL); }
  wx(i) { return this.minX + (i + 0.5) * CELL; }
  wz(j) { return this.minZ + (j + 0.5) * CELL; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  free(i, j) { return this.inside(i, j) && this.cells[j * this.w + i] === 0; }
  freeAt(x, z) { return this.free(this.cx(x), this.cz(z)); }

  build(store) {
    this.cells.fill(1);
    const open = (r) => this._mark(r, 0, -0.01);
    open({ minX: NAV_BOUNDS.minX, maxX: NAV_BOUNDS.maxX, minZ: 6.3, maxZ: 9.6 }); // 歩道
    open({ minX: -1.1, maxX: 1.1, minZ: 5.5, maxZ: 6.5 }); // 入口
    open({ minX: DELIVERY_AREA.minX - 0.4, maxX: DELIVERY_AREA.maxX + 0.4, minZ: 9.0, maxZ: DELIVERY_AREA.maxZ + 0.5 }); // 店の前の荷物置き場
    for (const z of zones(store)) open(z);
    for (const w of getWalls(store)) this._mark(w, 1, w.type === 'pillar' ? 0.3 : 0.22);
    for (const f of store.fixtures) {
      const fp = fixtureFootprint(f.t, f.x, f.z, f.r);
      this._mark(fp, 1, 0.12);
    }
    this.version++;
  }
  // r を margin 分広げた範囲にセル中心が入るセルを v にする
  _mark(r, v, margin) {
    const i0 = Math.max(0, this.cx(r.minX - margin) - 1), i1 = Math.min(this.w - 1, this.cx(r.maxX + margin) + 1);
    const j0 = Math.max(0, this.cz(r.minZ - margin) - 1), j1 = Math.min(this.h - 1, this.cz(r.maxZ + margin) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.wx(i), z = this.wz(j);
      if (x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin) this.cells[j * this.w + i] = v;
    }
  }
  nearestFree(x, z, maxR = 8) {
    const ci = this.cx(x), cj = this.cz(z);
    if (this.free(ci, cj)) return [ci, cj];
    let best = null, bd = 1e9;
    for (let r = 1; r <= maxR; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r) continue;
        if (!this.free(i, j)) continue;
        const d = (this.wx(i) - x) ** 2 + (this.wz(j) - z) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return null;
  }
  // 経路: [[x,z], ...]（開始点は含まない）
  findPath(sx, sz, tx, tz) {
    const s = this.nearestFree(sx, sz, 4), t = this.nearestFree(tx, tz, 6);
    if (!s || !t) return null;
    const W = this.w, N = W * this.h;
    const si = s[1] * W + s[0], ti = t[1] * W + t[0];
    if (si === ti) return [[tx, tz]];
    const g = this._g || (this._g = new Float32Array(N));
    const came = this._came || (this._came = new Int32Array(N));
    const stamp = this._stamp || (this._stamp = new Uint32Array(N));
    const closed = this._closed || (this._closed = new Uint32Array(N));
    this._run = (this._run || 0) + 1; const run = this._run;
    const heap = new Heap();
    const tx0 = t[0], tz0 = t[1];
    const hfn = (i, j) => { const dx = Math.abs(i - tx0), dz = Math.abs(j - tz0); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    g[si] = 0; stamp[si] = run; came[si] = -1;
    heap.push(si, hfn(s[0], s[1]));
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false, iter = 0;
    while (heap.size && iter++ < 20000) {
      const cur = heap.pop();
      if (cur === ti) { found = true; break; }
      if (closed[cur] === run) continue;
      closed[cur] = run;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, c] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
        const n = nj * W + ni;
        if (closed[n] === run) continue;
        const ng = g[cur] + c;
        if (stamp[n] !== run || ng < g[n]) {
          stamp[n] = run; g[n] = ng; came[n] = cur;
          heap.push(n, ng + hfn(ni, nj));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = ti; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => [this.wx(c % W), this.wz((c / W) | 0)]);
    // 経路の間引き（見通しが通る点をスキップ）
    const out = [];
    let anchor = [sx, sz], k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) { if (this.lineFree(anchor[0], anchor[1], pts[m][0], pts[m][1])) { far = m; break; } }
      out.push(pts[far]); anchor = pts[far]; k = far;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    // 最終点は目標座標そのもの（通行可なら）
    if (this.freeAt(tx, tz)) out[out.length - 1] = [tx, tz];
    return out;
  }
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * 0.35));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!this.freeAt(x, z)) return false;
      // 体の幅ぶん左右も確認
      const nx = -(bz - az) / (d || 1) * 0.2, nz = (bx - ax) / (d || 1) * 0.2;
      if (!this.freeAt(x + nx, z + nz) || !this.freeAt(x - nx, z - nz)) return false;
    }
    return true;
  }
}

class Heap {
  constructor() { this.a = []; this.p = []; }
  get size() { return this.a.length; }
  push(v, pr) {
    const a = this.a, p = this.p; a.push(v); p.push(pr);
    let i = a.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (p[q] <= p[i]) break; [a[q], a[i]] = [a[i], a[q]]; [p[q], p[i]] = [p[i], p[q]]; i = q; }
  }
  pop() {
    const a = this.a, p = this.p, top = a[0];
    const lv = a.pop(), lp = p.pop();
    if (a.length) {
      a[0] = lv; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [p[m], p[i]] = [p[i], p[m]]; i = m;
      }
    }
    return top;
  }
}
