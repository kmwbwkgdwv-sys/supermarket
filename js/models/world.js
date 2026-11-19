// ===== 店舗の建物と周辺の街並み =====
import * as THREE from 'three';
import { tex, surf, signTexture, canvasTex, emoji, FONT, shade } from '../textures.js';
import { mat, smat, glassMat, T, box, rbox, cyl, sph, plane, cone, torus, add, M, bakeGroup, merge, vgrad, wuv } from './geo.js';
import { basic } from './fixtures.js';
import { SALES, SALES_X1, BAY, STRIP, STOCK_SECTIONS, MANAGER, DOCK, DOOR, BUILDING, BACK_Z, ALL_BAYS, DELIVERY_AREA, PLAYER_BOUNDS, bayRect, bayAt, getWalls, doorOpen } from '../data.js';
import { mulberry32 } from '../util.js';

const C = (c, o = {}) => mat(c, { r: 0.7, ...o });
const WALL_H = 4.6, CEIL = 3.8;
// 壁テクスチャ1枚の実寸（m）
const PT = 2.4, BTU = 1.0, BTV = 1.15, WT = 1.2;
let hazardStripe = null;
const stripeTex = () => hazardStripe ||= canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#ffcc00'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d1d1d'; for (let i = -2; i < 4; i++) { c.beginPath(); c.moveTo(i * 64, h); c.lineTo(i * 64 + 32, h); c.lineTo(i * 64 + 32 + h, 0); c.lineTo(i * 64 + h, 0); c.fill(); } }, { repeat: [1, 1] });
// 床・天井の面を広げてもタイルの大きさが変わらないように UV を伸ばす（元は幅30m用）
function uvScale(g, su, sv = 1) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return g; }
const WS = () => (BUILDING.maxX - BUILDING.minX) / 30;
function wallMats() {
  return { paint: smat(surf('wall'), 0xffffff, { r: 0.85 }), base: mat(0x4a4f56, { r: 0.6 }), wains: smat(surf('wainscot'), 0xffffff, { r: 0.5 }), rail: mat(0x7d858e, { r: 0.45, m: 0.2 }), cove: mat(0xf4f3ef, { r: 0.6 }) };
}
// 室内の壁：塗装＋腰壁（羽目板）＋見切り＋巾木＋天井の回り縁
function interiorWall(g, mats, w, h, d, cx, y, cz) {
  const { paint, wains, rail, base, cove } = mats;
  add(g, wuv(T(box(w, h, d), cx, y, cz), PT), paint);
  if (y !== 0) return;
  // 飾りは壁より少しだけ大きく（端の面がぴったり重なると模様が2重にちらつくので、長さ方向にも数mmはみ出させる）
  const lx = d < w ? 0.012 : 0.02, lz = w < d ? 0.012 : 0.02;
  add(g, T(box(w + lx, 0.12, d + lz), cx, 0, cz), base);
  add(g, wuv(T(box(w + lx * 0.6, 1.0, d + lz * 0.6), cx, 0.12, cz), WT), wains);
  add(g, T(box(w + lx * 1.5, 0.05, d + lz * 1.5), cx, 1.12, cz), rail);
  if (h >= CEIL) add(g, T(box(w + lx, 0.07, d + lz), cx, CEIL - 0.07, cz), cove);
}
const L = BUILDING.minX, R = BUILDING.maxX, CX = (L + R) / 2, CZ = (BUILDING.minZ + BUILDING.maxZ) / 2;
const FZ = BUILDING.maxZ; // 正面の壁
const YARD_X = PLAYER_BOUNDS.maxX + 0.5, YARD_Z = PLAYER_BOUNDS.minZ - 0.5; // 裏の敷地（フェンスの位置）
const TRUCK = [DOCK.x + 6.6, (DOCK.z0 + DOCK.z1) / 2]; // 搬入口の前（建物から3mあけて停める）

export class World {
  constructor(scene, { lite }) {
    this.scene = scene; this.lite = lite;
    this.root = new THREE.Group(); scene.add(this.root);
    this.obstacles = []; // 外の当たり判定
    this.dynamic = new THREE.Group(); this.root.add(this.dynamic);
    for (const fn of ['_sky', '_ground', '_town', '_building']) { try { this[fn](); } catch (e) { console.warn('world ' + fn, e); } }
    this.doorOpen = 0; this.doors ||= []; this.lamps ||= [];
    this.lampMat ||= new THREE.MeshBasicMaterial({ color: 0x777777 }); this.panelMat ||= new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.awningMat ||= mat(0xffffff); this.skyMat ||= { uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } } };
  }
  _sky() {
    const g = new THREE.SphereGeometry(180, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#4f9ee8') }, mid: { value: new THREE.Color('#c4e4f7') }, bot: { value: new THREE.Color('#e9e6dc') }, sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vp; void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, min(1.0, -h * 4.0)); float s = max(dot(normalize(vp), normalize(sunDir)), 0.0); c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.12); gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }',
    });
    this.sky = new THREE.Mesh(g, this.skyMat); this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // 雲（やわらかい塊）
    const cm = C(0xffffff, { r: 1 }), r = mulberry32(5);
    const parts = [];
    for (let i = 0; i < (this.lite ? 7 : 16); i++) {
      const x = (r() - 0.5) * 220, z = (r() - 0.5) * 220, y = 48 + r() * 25;
      for (let k = 0; k < 6; k++) parts.push(T(new THREE.IcosahedronGeometry(4 + r() * 5, 2), x + k * 5 - 12 + r() * 3, y + r() * 3, z + (r() - 0.5) * 8, 0, 0, 0, 1.4, 0.55, 1));
    }
    this.clouds = M(merge(parts), cm, false); this.scene.add(this.clouds);
  }
  _ground() {
    const Rt = this.root;
    const lay = (g, m) => { const o = add(Rt, g, m); o.castShadow = false; return o; };
    lay(T(plane(400, 400), 0, -0.02, 0, -Math.PI / 2), smat(surf('grass'), 0xffffff, { r: 1 }));
    lay(T(plane(120, 3.7), 0, 0.006, 7.85, -Math.PI / 2), smat(surf('sidewalk'), 0xffffff, { r: 0.9 }));
    lay(T(plane(120, 3), 0, 0.006, 29.5, -Math.PI / 2), smat(surf('sidewalk'), 0xffffff, { r: 0.9 }));
    lay(T(rbox(120, 0.14, 0.3, 0.03), 0, 0, 9.75), C(0xd2cdc3, { r: 0.8 }));
    lay(T(plane(R - L + 34, 10.5), CX + 2, 0.004, 15.1, -Math.PI / 2), smat(surf('asphalt'), 0xffffff, { r: 0.95 }));
    lay(T(plane(300, 7.5), 0, 0.003, 24.1, -Math.PI / 2), mat(0xffffff, { map: tex('road'), r: 0.9 }));
    const lines = [];
    const A = DELIVERY_AREA;
    for (let x = L - 12.6; x <= R + 16; x += 2.8) { if (x < A.minX - 0.6 || x > A.maxX + 0.6) lines.push(T(box(0.12, 0.01, 4.4), x, 0.005, 12.4)); lines.push(T(box(0.12, 0.01, 4.4), x, 0.005, 17.6)); }
    // 荷物置き場（発注した段ボールが空から降ってくる場所）
    const zw = A.maxX - A.minX + 0.5, zd = A.maxZ - A.minZ + 0.5;
    const zone = canvasTex(512, Math.round(512 * zd / zw), (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,204,0,0.16)'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#ffcc00'; c.lineWidth = 12; c.strokeRect(8, 8, W - 16, H - 16);
      c.strokeStyle = 'rgba(255,204,0,0.55)'; c.lineWidth = 8; for (let x = -H; x < W; x += 46) { c.beginPath(); c.moveTo(x, H - 18); c.lineTo(x + 26, H - 44); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.font = `900 ${Math.round(H * 0.2)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('📦 荷物置き場', W / 2, H * 0.45);
    });
    lay(T(plane(zw, zd), (A.minX + A.maxX) / 2, 0.008, (A.minZ + A.maxZ) / 2, -Math.PI / 2, 0, Math.PI), mat(0xffffff, { map: zone, t: true, r: 0.9 }));
    lines.push(T(box(R - L + 30, 0.01, 0.12), CX + 2, 0.005, 15));
    lay(merge(lines), C(0xf2f0e8, { r: 0.6 }));
    // 裏と右の搬入路（アスファルト）と搬入口の前の土間。建物の床と重ならないように建物の外だけに敷く
    const asph = smat(surf('asphalt'), 0xdddddd, { r: 0.95 });
    const bz = BACK_Z - 0.15, xl = L - 8;
    lay(T(plane(YARD_X - xl, bz - YARD_Z), (xl + YARD_X) / 2, 0.002, (YARD_Z + bz) / 2, -Math.PI / 2), asph);          // 裏
    lay(T(plane(YARD_X - (R + 0.15), FZ - bz), (R + 0.15 + YARD_X) / 2, 0.002, (bz + FZ) / 2, -Math.PI / 2), asph);   // 右
    lay(T(plane(3.2, DOCK.z1 - DOCK.z0 + 1.2), R + 0.15 + 1.6, 0.01, (DOCK.z0 + DOCK.z1) / 2, -Math.PI / 2), smat(surf('concrete'), 0xffffff, { r: 0.9 }));
  }
  _town() {
    const g = new THREE.Group(), r = mulberry32(42);
    const trunk = C(0x7a5236, { r: 0.95 });
    const leafM = mat('#ffffff', { vc: true, r: 0.85 });
    const tree = (x, z, s = 1) => {
      add(g, cyl(0.1 * s, 0.17 * s, 2.0 * s, 8), trunk, x, 0, z);
      for (let b = 0; b < 3; b++) { const a = r() * 6.28; add(g, T(cyl(0.03 * s, 0.06 * s, 0.9 * s, 6), 0, 0, 0, 0.7, a, 0), trunk, x, 1.4 * s, z); }
      const blobs = 7;
      for (let k = 0; k < blobs; k++) {
        const a = k / blobs * 6.28 + r(), rad = (0.5 + r() * 0.5) * s;
        const geo = T(new THREE.IcosahedronGeometry((0.75 + r() * 0.35) * s, 2), x + Math.cos(a) * rad, (2.3 + r() * 1.1) * s, z + Math.sin(a) * rad, r(), r(), 0, 1, 0.82, 1);
        const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i); const f = 1 + 0.09 * Math.sin(px * 7.1 + py * 3.3 + pz * 5.7); pos.setXYZ(i, x + (px - x) * f, py, z + (pz - z) * f); }
        geo.computeVertexNormals();
        vgrad(geo, '#2f6b33', '#7dbb5a', 1.6 * s, 3.8 * s);
        add(g, geo, leafM);
      }
      add(g, T(new THREE.IcosahedronGeometry(0.85 * s, 2), x, 3.4 * s, z, 0, 0, 0, 1, 0.8, 1), mat('#5f9c48', { r: 0.85 }));
      this.obstacles.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    };
    for (const x of [L - 9, L - 1, L + 7, L + 15, L + 23, R - 1.5, R + 6]) tree(x, 10.5, 0.85);
    for (let i = 0; i < 24; i++) { const a = r() * Math.PI * 2, d = 40 + r() * 30; tree(Math.cos(a) * d, Math.sin(a) * d * 0.8 - 6, 0.9 + r() * 0.7); }
    for (const [x, z] of [[L - 4, -4], [L - 5, 2], [L - 4, -12], [L - 4.5, -20], [YARD_X + 3, -2], [YARD_X + 3.5, -12], [YARD_X + 3, 4], [YARD_X + 4, -22], [L + 4, YARD_Z - 3], [CX, YARD_Z - 3.5], [R - 2, YARD_Z - 3]]) tree(x, z, 1.05);
    // 植え込み
    const bushM = mat('#ffffff', { vc: true, r: 0.9 });
    for (let x = L + 0.5; x <= R - 0.5; x += 1.15) if (Math.abs(x) > 2.4) { const geo = T(new THREE.IcosahedronGeometry(0.42, 2), x, 0.3, 6.62, 0, x, 0, 1.1, 0.75, 0.6); vgrad(geo, '#2c5f2e', '#5f9c48', 0, 0.6); add(g, geo, bushM); }
    const planter = smat(surf('brick'), 0xbbbbbb, { r: 0.9 });
    for (const [x0, x1] of [[L + 0.25, -2.0], [2.0, R - 0.25]]) add(g, T(box(x1 - x0, 0.25, 0.7), (x0 + x1) / 2, 0, 6.62), planter); // 入口の前はあける
    // 街灯
    const pole = C(0x2b2f36, { r: 0.4, m: 0.6 });
    this.lamps = [];
    for (let x = L + 5; x <= R + 10; x += 10) {
      add(g, cyl(0.06, 0.09, 4.8, 10), pole, x, 0, 9.4);
      add(g, T(cyl(0.035, 0.035, 1.1, 8), 0, 0, 0, Math.PI / 2, 0, 0), pole, x, 4.7, 9.4);
      add(g, T(rbox(0.5, 0.12, 0.25, 0.04), 0, 4.55), pole, x, 0, 8.85);
      this.lamps.push([x, 8.5]);
      this.obstacles.push({ minX: x - 0.15, maxX: x + 0.15, minZ: 9.25, maxZ: 9.55 });
    }
    const lampGeo = merge(this.lamps.map(([x]) => T(box(0.4, 0.02, 0.18), x, 4.54, 8.85)));
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x777777, toneMapped: false });
    g.add(M(lampGeo, this.lampMat, false));
    // 駐車中の車
    const carCols = [0xc62828, 0x1e5aa8, 0xe8e8e8, 0x2b2b2b, 0x2a9d8f, 0x8a8f96, 0xb8860b];
    const spots = [L - 9.5, L - 4, L + 1.6, L + 7.2, L + 12.8, L + 18.4, L + 24, R + 0.6, R + 6.2]; // 荷物置き場・大きい段ボールの置き場はあける
    spots.forEach((x, i) => { if (r() < 0.75) this._car(g, x + 1.4, i % 2 ? 12.3 : 17.7, i % 2 ? Math.PI : 0, carCols[i % carCols.length]); });
    // 遠くの建物
    const bcol = [0xe7d7c1, 0xd9c3a5, 0xbfd3dc, 0xd4cbe0, 0xc9dfc9, 0xeed6d3];
    for (let i = 0; i < 14; i++) {
      const x = -72 + i * 11 + r() * 3, h = 6 + r() * 12, w = 7 + r() * 3, zz = 38 + r() * 4;
      add(g, rbox(w, h, 8, 0.15), C(bcol[i % bcol.length], { r: 0.9 }), x, 0, zz);
      for (let k = 0; k < Math.floor(h / 3); k++) add(g, T(box(w * 0.78, 1.1, 0.06), 0, 1.4 + k * 3), C(0x7fa6bd, { r: 0.15, m: 0.4 }), x, 0, zz - 4.0);
      add(g, T(box(w + 0.3, 0.4, 8.3), 0, h), C(shade('#' + bcol[i % bcol.length].toString(16).padStart(6, '0'), -0.2), { r: 0.9 }), x, 0, zz);
    }
    // 裏と右のフェンス（敷地のはし）
    const fence = C(0x6b7280, { r: 0.5, m: 0.5 }), wire = mat(0x9aa3ad, { map: tex('wire'), r: 0.5, m: 0.5, t: true, op: 0.9 });
    const fx0 = L - 8;
    for (let x = fx0; x <= YARD_X; x += 2) add(g, cyl(0.03, 0.03, 1.6, 6), fence, x, 0, YARD_Z);
    add(g, T(box(YARD_X - fx0, 1.4, 0.02), 0, 0.15), wire, (fx0 + YARD_X) / 2, 0, YARD_Z);
    for (let z = YARD_Z + 2; z <= FZ - 1; z += 2) add(g, cyl(0.03, 0.03, 1.6, 6), fence, YARD_X, 0, z);
    add(g, T(box(0.02, 1.4, FZ - 1 - YARD_Z), 0, 0.15), wire, YARD_X, 0, (YARD_Z + FZ - 1) / 2);
    this._truck(g, TRUCK[0], TRUCK[1]);
    const baked = bakeGroup(g);
    baked.traverse((o) => { if (o.isMesh) o.castShadow = !this.lite; });
    this.root.add(baked);
  }
  _car(g, x, z, ry, col) {
    const c = new THREE.Group(), body = C(col, { r: 0.25, m: 0.45 });
    add(c, T(rbox(1.82, 0.6, 4.3, 0.24), 0, 0.3), body);
    add(c, T(rbox(1.62, 0.56, 2.3, 0.26), 0, 0.78, -0.25), body);
    add(c, T(rbox(1.64, 0.42, 2.0, 0.18), 0, 0.84, -0.25), C(0x1d2a33, { r: 0.08, m: 0.6 }));
    for (const [wx, wz] of [[-0.84, 1.35], [0.84, 1.35], [-0.84, -1.35], [0.84, -1.35]]) {
      add(c, T(cyl(0.34, 0.34, 0.24, 18), 0, 0, 0, 0, 0, Math.PI / 2), C(0x161616, { r: 0.85 }), wx, 0.34, wz);
      add(c, T(cyl(0.2, 0.2, 0.25, 12), 0, 0, 0, 0, 0, Math.PI / 2), C(0xbfc5cc, { r: 0.25, m: 0.9 }), wx * 1.01, 0.34, wz);
    }
    for (const s of [-1, 1]) add(c, T(rbox(0.36, 0.13, 0.05, 0.02), s * 0.62, 0.62, 2.13), C(0xfffbe6, { e: 0x444433, r: 0.2 }));
    for (const s of [-1, 1]) add(c, T(rbox(0.36, 0.12, 0.05, 0.02), s * 0.62, 0.66, -2.13), C(0xb71c1c, { r: 0.3 }));
    add(c, T(box(0.9, 0.18, 0.04), 0, 0.42, 2.15), C(0x222222, { r: 0.6 }));
    c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
    this.obstacles.push({ minX: x - 1, maxX: x + 1, minZ: z - 2.2, maxZ: z + 2.2 });
  }
  _truck(g, x, z) {
    const t = new THREE.Group();
    add(t, T(rbox(2.4, 2.6, 5.2, 0.06), 0, 0.65, -0.9), C(0xf4f4f2, { r: 0.55, m: 0.15 }));
    add(t, T(plane(4.6, 1.5), 0, 2.0, 0, 0, Math.PI / 2), basic(signTexture('マートメイツ物流', { w: 1024, h: 256, bg: '#ff6b35', emojiL: '🚚', radius: 40, shine: true })), 1.21, 0, -0.9);
    add(t, T(plane(4.6, 1.5), 0, 2.0, 0, 0, -Math.PI / 2), basic(signTexture('マートメイツ物流', { w: 1024, h: 256, bg: '#ff6b35', emojiL: '🚚', radius: 40, shine: true })), -1.21, 0, -0.9);
    add(t, T(rbox(2.3, 1.9, 1.9, 0.25), 0, 0.55, 2.6), C(0xff6b35, { r: 0.3, m: 0.35 }));
    add(t, T(box(2.1, 0.8, 0.05), 0, 1.45, 3.55), C(0x1d2a33, { r: 0.08, m: 0.6 }));
    add(t, T(box(2.4, 0.25, 7.2), 0, 0.4, 0.2), C(0x2b2f36, { r: 0.6 }));
    for (const [wx, wz] of [[-1.08, 2.6], [1.08, 2.6], [-1.08, -1.9], [1.08, -1.9], [-1.08, -2.8], [1.08, -2.8]]) add(t, T(cyl(0.46, 0.46, 0.3, 18), 0, 0, 0, 0, 0, Math.PI / 2), C(0x161616, { r: 0.85 }), wx, 0.46, wz);
    t.position.set(x, 0, z); t.rotation.y = Math.PI / 2; g.add(t); // 荷台の後ろを搬入口（-x）へ向ける
    this.obstacles.push({ minX: x - 3.8, maxX: x + 3.8, minZ: z - 1.3, maxZ: z + 1.3 });
  }
  _building() {
    const g = new THREE.Group();
    const Rt = this.root;
    // 床：売り場はタイル、倉庫はコンクリート、パソコン室は木（重ならないように分けて敷く）
    const SW = SALES_X1 - L, SD = FZ - BACK_Z;
    const floor = add(Rt, uvScale(T(plane(SW, SD), (L + SALES_X1) / 2, 0.003, CZ, -Math.PI / 2), SW / 30, SD / 10), smat(surf('floor'), 0xffffff, { r: 0.85, env: 0.9 })); floor.castShadow = false;
    const KW = STRIP.x1 - STRIP.x0, KD = MANAGER.z0 - BACK_Z;
    const fl2 = add(Rt, uvScale(T(plane(KW, KD), (STRIP.x0 + STRIP.x1) / 2, 0.004, (BACK_Z + MANAGER.z0) / 2, -Math.PI / 2), KW / 30, KD / 8), smat(surf('concrete'), 0xffffff, { r: 0.85 })); fl2.castShadow = false;
    const fl3 = add(Rt, T(plane(MANAGER.x1 - MANAGER.x0, MANAGER.z1 - MANAGER.z0), (MANAGER.x0 + MANAGER.x1) / 2, 0.006, (MANAGER.z0 + MANAGER.z1) / 2, -Math.PI / 2), smat(surf('wood'), 0xd8c0a0, { r: 0.55 })); fl3.castShadow = false;
    const brick = smat(surf('brickW'), 0xffffff, { r: 0.9 });
    const paint = smat(surf('wall'), 0xffffff, { r: 0.85 });
    const trim = C(0x2f343a, { r: 0.4, m: 0.5 });
    const wm = wallMats();
    // 外壁（内側=塗装＋腰壁 外側=レンガ＋石の基礎）
    const stone = C(0x8e8a84, { r: 0.85 });
    const wall = (x0, x1, z0, z1, h, y, outer) => {
      const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      interiorWall(g, wm, w, h, d, cx, y, cz);
      if (outer) {
        const [ox, oz] = outer, bw = ox ? 0.06 : w + 0.12, bd = oz ? 0.06 : d + 0.12, bx = cx + ox * (w / 2 + 0.03), bz = cz + oz * (d / 2 + 0.03);
        add(g, wuv(T(box(bw, h + 0.01, bd), bx, y, bz), BTU, BTV), brick);
        if (y === 0) add(g, T(box(bw + Math.abs(ox) * 0.04, 0.35, bd + Math.abs(oz) * 0.04), bx, 0, bz), stone);
        if (y + h >= WALL_H - 0.01) add(g, T(box(bw + Math.abs(ox) * 0.06, 0.12, bd + Math.abs(oz) * 0.06), bx, y + h - 0.12, bz), C(0xe8e4dc, { r: 0.7 }));
      }
    };
    wall(L - 0.12, L + 0.12, BACK_Z - 0.12, FZ + 0.12, WALL_H, 0, [-1, 0]);   // 左
    wall(L, R, BACK_Z - 0.12, BACK_Z + 0.12, WALL_H, 0, [0, -1]);             // 奥
    // 右（搬入口つき）
    wall(R - 0.12, R + 0.12, BACK_Z - 0.12, DOCK.z0, WALL_H, 0, [1, 0]);
    wall(R - 0.12, R + 0.12, DOCK.z1, FZ + 0.12, WALL_H, 0, [1, 0]);
    wall(R - 0.12, R + 0.12, DOCK.z0, DOCK.z1, WALL_H - 3.0, 3.0, [1, 0]);
    // 建物の奥の角（横の壁と奥の壁の面が重なってちらつかないよう、角を柱でおおう）
    for (const x of [L, R]) {
      const x0 = x === L ? L - 0.24 : R - 0.14, x1 = x === L ? L + 0.14 : R + 0.24;
      add(g, wuv(T(box(x1 - x0, WALL_H, 0.37), (x0 + x1) / 2, 0, BACK_Z - 0.035), BTU, BTV), brick);
      add(g, T(box(x1 - x0 + 0.04, 0.37, 0.41), (x0 + x1) / 2, 0, BACK_Z - 0.035), stone);
    }
    // シャッター（上に巻き上げた状態）とドックのバンパー・表示
    const dcz = (DOCK.z0 + DOCK.z1) / 2;
    add(g, T(cyl(0.22, 0.22, DOCK.z1 - DOCK.z0 + 0.2, 16), R + 0.3, 2.8, dcz, Math.PI / 2, 0, 0), C(0x9ea7b0, { r: 0.4, m: 0.6 }));
    for (const z of [DOCK.z0 + 0.2, DOCK.z1 - 0.2]) add(g, T(box(0.15, 0.4, 0.25), R + 0.2, 0.3, z), C(0x111111, { r: 0.9 }));
    add(g, T(plane(2.4, 0.5), R + 0.2, 3.35, dcz, 0, Math.PI / 2), basic(signTexture('搬入口', { w: 512, h: 128, bg: '#3a3f45', fg: '#ffd23f', radius: 16 })));
    // パソコン室の正面の壁（外はレンガ。中はボードを掛ける壁）
    wall(STRIP.x0, R, FZ - 0.12, FZ + 0.12, WALL_H, 0, [0, 1]);
    add(g, T(plane(2.6, 0.62), (MANAGER.x0 + MANAGER.x1) / 2, 3.35, FZ + 0.16), basic(signTexture('STAFF ROOM', { w: 768, h: 184, bg: '#3a3f45', fg: '#ffffff', emojiL: '💻', radius: 24 })));
    this._managerDecor(g);
    // 正面：ガラス張りの店構え
    const glass = glassMat();
    const frontSeg = (x0, x1) => {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      add(g, T(box(w, 0.45, 0.24), cx, 0, 6), trim);
      add(g, wuv(T(box(w, WALL_H - 3.2, 0.24), cx, 3.2, 6), PT), paint);
      add(g, wuv(T(box(w, WALL_H - 3.2, 0.06), cx, 3.2, 6.13), BTU, BTV), brick);
      const pane = M(T(box(w, 2.75, 0.03), cx, 0.45, 6), glass, false); this.root.add(pane);
      const n = Math.max(1, Math.round(w / 2.5));
      for (let i = 0; i <= n; i++) add(g, T(box(0.07, 2.75, 0.12), x0 + i * w / n, 0.45, 6), trim);
      add(g, T(box(w, 0.08, 0.14), cx, 3.16, 6), trim);
    };
    frontSeg(L, -DOOR.half - 0.25); frontSeg(DOOR.half + 0.25, STRIP.x0);
    // 建物の正面の角（横の壁と正面の壁の面が重なってちらつかないよう、角を柱でおおう）
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? L - 0.24 : R - 0.14, x1 = s < 0 ? L + 0.14 : R + 0.24;
      add(g, wuv(T(box(x1 - x0, WALL_H, 0.37), (x0 + x1) / 2, 0, FZ + 0.035), BTU, BTV), brick);
      add(g, T(box(x1 - x0 + 0.04, 0.37, 0.41), (x0 + x1) / 2, 0, FZ + 0.035), stone);
    }
    add(g, wuv(T(box(DOOR.half * 2 + 0.5, WALL_H - 3.0, 0.24), 0, 3.0, 6), PT), paint);
    for (const x of [-DOOR.half - 0.12, DOOR.half + 0.12]) add(g, T(box(0.24, 3.0, 0.3), x, 0, 6), trim);
    add(g, T(box(DOOR.half * 2 + 0.5, 0.25, 0.4), 0, 2.85, 6), trim);
    add(g, T(rbox(0.5, 0.12, 0.2, 0.04), 0, 2.65, 5.75), C(0x222222, { r: 0.4 }));
    // 自動ドア
    this.doors = [];
    for (const s of [-1, 1]) {
      const d = new THREE.Group();
      d.add(M(T(box(1.2, 2.8, 0.03), 0, 0), glass, false));
      d.add(M(T(box(1.2, 0.08, 0.06), 0, 0), trim)); d.add(M(T(box(1.2, 0.08, 0.06), 0, 2.72), trim));
      d.add(M(T(box(0.06, 2.8, 0.06), s * 0.57, 0), trim));
      d.position.set(s * 0.6, 0, 6.05); d.userData.base = s * 0.6; d.userData.s = s;
      this.root.add(d); this.doors.push(d);
    }
    const mat2 = add(Rt, T(rbox(2.6, 0.012, 1.4, 0.004), 0, 0.003, 5.1), C(0x2b3a44, { r: 1 })); mat2.castShadow = false;
    // 天井
    const ceil = M(uvScale(T(plane(R - L, FZ - BACK_Z), CX, CEIL, CZ, Math.PI / 2), WS(), (FZ - BACK_Z) / 18), smat(surf('ceiling'), 0xffffff, { r: 0.9 }), false);
    this.root.add(ceil); this.ceiling = ceil;
    this.panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex('troffer'), toneMapped: false });
    // 屋根・パラペット・室外機
    this.roofMat = C(0x8d939b, { r: 0.92 });
    add(g, T(box(R - L + 0.6, 0.4, FZ - BACK_Z + 0.6), CX, WALL_H, CZ), this.roofMat);
    add(g, T(box(24, 0.6, 0.3), 0, WALL_H, FZ + 0.2), C(0xf2f0eb, { r: 0.6 }));
    for (const [x, z] of [[-30, -8], [-24, -3], [-17, -10], [-9, -6], [-3, -11], [2, -4], [9, -8], [11, 2], [-27, 2], [-13, 0]]) { add(g, T(rbox(1.6, 0.9, 1.2, 0.05), x, WALL_H + 0.4, z), C(0xd6d6d6, { r: 0.5, m: 0.4 })); add(g, T(cyl(0.45, 0.45, 0.05, 16), x, WALL_H + 1.3, z), C(0x555555)); }
    // ひさし
    this.awningMat = mat(0xffffff, { map: tex('stripes'), r: 0.75 });
    for (const [x0, x1] of [[L, -2.2], [2.2, STRIP.x0 - 0.1]]) add(g, T(box(x1 - x0, 0.05, 1.3), (x0 + x1) / 2, 3.28, 6.6, 0.35), this.awningMat);
    // 店内ポスター・時計
    // 売り場の右の壁（パソコン室の裏）にもポスター。左の壁のは売り場を広げると見える
    const posters = [['毎日がお買い得！', '#e63946', '🛒', [L + 0.14, -1.5, Math.PI / 2]], ['新鮮・安心', '#2a9d8f', '🥬', [L + 0.14, -8.5, Math.PI / 2]], ['ポイント2倍デー', '#3a86ff', '✨', [L + 0.14, 3.5, Math.PI / 2]], ['スタッフ募集中', '#f4a261', '🙋', [STRIP.x0 - 0.135, 4.6, -Math.PI / 2]]];
    for (const [t, c, e, [x, z, ry]] of posters) { const p = M(T(plane(1.5, 1.0), 0, 2.3), basic(signTexture(t, { w: 384, h: 256, bg: c, emojiL: e, radius: 24, shine: true })), false); p.position.set(x, 0, z); p.rotation.y = ry; this.root.add(p); }
    this.clock = new THREE.Group();
    this.clock.add(M(T(cyl(0.38, 0.38, 0.06, 32), 0, 0, 0, Math.PI / 2), C(0xffffff, { r: 0.4 })));
    this.clock.add(M(T(torus(0.38, 0.035, 8, 32), 0, 0, 0.03), C(0x333333, { r: 0.3, m: 0.6 })));
    this.hourHand = M(T(box(0.035, 0.2, 0.01), 0, 0, 0.07), C(0x222222)); this.minHand = M(T(box(0.022, 0.3, 0.01), 0, 0, 0.08), C(0x222222));
    this.clock.add(this.hourHand, this.minHand);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.clock.add(M(T(box(0.025, i % 3 ? 0.04 : 0.07, 0.01), Math.sin(a) * 0.31, Math.cos(a) * 0.31, 0.035, 0, 0, -a), C(0x333333))); }
    this.clock.position.set(0, 3.3, 5.84); this.clock.rotation.y = Math.PI; this.root.add(this.clock);
    const baked = bakeGroup(g);
    baked.traverse((o) => { if (o.isMesh) o.castShadow = !this.lite && o.material !== this.roofMat && o.material !== this.awningMat; });
    this.root.add(baked);
  }
  _managerDecor(g) {
    const z0 = MANAGER.z0;
    // ロッカー（出入口の右・奥の壁ぎわ）・ウォーターサーバー・テーブルといす
    const lx = MANAGER.door[1] + 1.8;
    for (let i = 0; i < 2; i++) add(g, T(rbox(0.42, 1.8, 0.45, 0.01), lx + i * 0.44, 0, z0 + 0.36), C(0x7f8c99, { r: 0.4, m: 0.5 }));
    const wx = MANAGER.x1 - 1.2;
    add(g, T(rbox(0.32, 1.0, 0.32, 0.03), wx, 0, z0 + 0.4), C(0xf2f2f2, { r: 0.4 }));
    add(g, T(cyl(0.14, 0.14, 0.4, 16), wx, 1.0, z0 + 0.4), mat(0x9fd3ff, { r: 0.05, t: true, op: 0.6 }));
    const tx = MANAGER.x1 - 3.4, tz = z0 + 2.6;
    add(g, T(rbox(1.2, 0.04, 0.6, 0.01), tx, 0.74, tz), smat(surf('wood'), 0xffffff, { r: 0.5 }));
    for (const [x, z] of [[tx - 0.5, tz - 0.25], [tx + 0.5, tz - 0.25], [tx - 0.5, tz + 0.25], [tx + 0.5, tz + 0.25]]) add(g, T(cyl(0.02, 0.02, 0.74, 6), x, 0, z), C(0x333333, { m: 0.6, r: 0.4 }));
    this.obstacles.push({ minX: lx - 0.25, maxX: lx + 0.7, minZ: z0, maxZ: z0 + 0.62 }, { minX: wx - 0.2, maxX: wx + 0.2, minZ: z0, maxZ: z0 + 0.6 }, { minX: tx - 0.62, maxX: tx + 0.62, minZ: tz - 0.32, maxZ: tz + 0.32 });
  }
  // 店の状態で変わるもの（店名看板・開店表示・区画・柱・照明）
  updateStore(store) {
    const key = [store.name, store.color, JSON.stringify(store.bays), JSON.stringify(store.stock), store.phase === 'open'].join('|');
    if (key === this._key) return;
    this._key = key;
    try { this._updateStore(store); } catch (e) { console.warn('updateStore', e); }
  }
  _updateStore(store) {
    for (const o of this.dynamic.children) o.traverse((m) => { if (m.isMesh && m.geometry) m.geometry.dispose(); });
    this.dynamic.clear();
    const D = this.dynamic, g = new THREE.Group();
    const wm = wallMats(), paint = wm.paint, base = wm.base;
    const ply = smat(surf('plywood'), 0xffffff, { r: 0.85 }), stripe = mat(0xffffff, { map: stripeTex(), r: 0.7 });
    const partSign = basic(signTexture('🚧 拡張予定地', { w: 768, h: 192, bg: '#2b2f33', fg: '#ffd23f', radius: 28 }));
    // 看板
    const sign = M(T(plane(9, 1.3), 0, 3.3, 6.29), basic(signTexture(store.name, { w: 1536, h: 220, bg: store.color, fg: '#ffffff', stroke: shade(store.color, -0.25), emojiL: '🛒', radius: 50, shine: true })), false);
    D.add(sign);
    const lit = store.phase === 'open';
    const ot = basic(signTexture(lit ? 'OPEN' : 'CLOSED', { w: 512, h: 196, bg: '#111', fg: lit ? '#ff4fd8' : '#666', glow: lit ? '#ff4fd8' : null, radius: 40 }));
    D.add(M(T(plane(1.1, 0.42), 2.4, 2.2, 5.96, 0, Math.PI), ot, false));
    D.add(M(T(plane(1.1, 0.42), 2.4, 2.2, 6.04), ot, false));
    this.awningMat.color.set(store.color).lerp(new THREE.Color('#ffffff'), 0.45);
    // 仕切り壁・柱（判定と同じデータから作る）
    for (const w of getWalls(store)) {
      const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2, sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
      if (w.type === 'inner') interiorWall(g, wm, sx, CEIL, sz, cx, 0, cz);
      else if (w.type === 'part') {
        // 仮設の合板の壁＋足元のトラ柄＋「拡張予定地」の札
        add(g, wuv(T(box(sx, CEIL, sz), cx, 0, cz), 1.2, 2.4), ply);
        add(g, wuv(T(box(sx + (sx < sz ? 0.01 : 0.012), 0.3, sz + (sz < sx ? 0.01 : 0.012)), cx, 0.02, cz), 0.5), stripe);
        const len = Math.max(sx, sz);
        for (let k = 0; k < Math.max(1, Math.floor(len / 5)); k++) for (const sd of [1, -1]) {
          const off = -len / 2 + (k + 0.5) * len / Math.max(1, Math.floor(len / 5));
          const pl = M(T(plane(2.2, 0.55), 0, 0), partSign, false);
          if (w.axis === 'x') { pl.position.set(cx + off, 1.75, cz + sd * (sz / 2 + 0.006)); pl.rotation.y = sd > 0 ? 0 : Math.PI; }
          else { pl.position.set(cx + sd * (sx / 2 + 0.006), 1.75, cz + off); pl.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; }
          D.add(pl);
        }
      }
      else if (w.type === 'pillar') { add(g, wuv(T(rbox(0.44, CEIL, 0.44, 0.02), cx, 0, cz), PT), paint); add(g, T(box(0.48, 0.14, 0.48), cx, 0, cz), base); add(g, T(box(0.47, 0.05, 0.47), cx, 1.12, cz), wm.rail); }
    }
    // 倉庫入口の上の壁とのれん・表示
    const strip = new THREE.MeshStandardMaterial({ color: 0xd8eef7, transparent: true, opacity: 0.32, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    for (const s of STOCK_SECTIONS) {
      if (!doorOpen(store, s)) continue; // 出入口は倉庫1の1つだけ
      const cz = (s.door[0] + s.door[1]) / 2, w = s.door[1] - s.door[0];
      add(g, wuv(T(box(0.24, CEIL - 2.5, w), STRIP.x0, 2.5, cz), PT), paint);
      add(g, T(plane(1.6, 0.36), STRIP.x0 - 0.13, 2.75, cz, 0, -Math.PI / 2), basic(signTexture(s.r === 1 ? '倉庫・パソコン室' : 'STAFF ONLY', { w: 512, h: 128, bg: '#3a3f45', fg: '#ffd23f', radius: 20 })));
      for (let z = s.door[0] + 0.12; z < s.door[1]; z += 0.22) { const st = M(T(plane(0.2, 2.35), STRIP.x0, 1.27, z, 0, Math.PI / 2 + 0.12), strip, false); st.userData.noRay = true; D.add(st); }
    }
    // パソコン室の出入口（倉庫側）の上の壁と表示
    { const cx = (MANAGER.door[0] + MANAGER.door[1]) / 2, w = MANAGER.door[1] - MANAGER.door[0];
      add(g, wuv(T(box(w, CEIL - 2.3, 0.24), cx, 2.3, MANAGER.z0), PT), paint);
      add(g, T(plane(1.5, 0.35), cx, 2.6, MANAGER.z0 - 0.13, 0, Math.PI), basic(signTexture('パソコン室', { w: 512, h: 128, bg: '#3a3f45', fg: '#ffffff', radius: 16 }))); }
    // 照明（買った区画だけ点灯）・梁・未購入区画の床
    const lights = [], beams = [];
    for (const id of ALL_BAYS) {
      const b = bayRect(id), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (store.bays?.[id]) {
        for (const dx of [-1.25, 1.25]) for (const dz of [-1.25, 1.25]) lights.push(T(plane(1.2, 0.6), cx + dx, CEIL - 0.012, cz + dz, Math.PI / 2));
        beams.push(T(box(BAY, 0.35, 0.3), cx, CEIL - 0.35, b.minZ));
      } else {
        const f = M(T(plane(BAY - 0.1, BAY - 0.1), cx, 0.008, cz, -Math.PI / 2), smat(surf('concrete'), 0x9a9890, { r: 0.95 }), false); D.add(f);
        if (b.r === 0) { const sheet = M(T(plane(BAY - 0.2, 2.6), cx, 0.5, 5.86, 0, Math.PI), mat(0xf4f4f0, { r: 0.9, side: THREE.DoubleSide }), false); D.add(sheet); }
      }
    }
    for (const s of STOCK_SECTIONS) {
      const cx = (s.x0 + s.x1) / 2;
      if (store.stock?.[s.id]) for (const dx of [-2.5, 2.5]) for (const z of (s.z1 - s.z0 < 6 ? [(s.z0 + s.z1) / 2] : [s.z1 - 2.3, s.z0 + 2.3])) lights.push(T(plane(1.6, 0.25), cx + dx, CEIL - 0.012, z, Math.PI / 2));
      else { const f = M(T(plane(s.x1 - s.x0 - 0.1, s.z1 - s.z0 - 0.1), cx, 0.008, (s.z0 + s.z1) / 2, -Math.PI / 2), smat(surf('concrete'), 0x8f8d86, { r: 0.95 }), false); D.add(f); }
    }
    const mcx = (MANAGER.x0 + MANAGER.x1) / 2, mcz = (MANAGER.z0 + MANAGER.z1) / 2;
    for (const dx of [-2.5, 2.5]) lights.push(T(plane(1.6, 0.25), mcx + dx, CEIL - 0.012, mcz, Math.PI / 2));
    if (lights.length) D.add(M(merge(lights), this.panelMat, false));
    if (beams.length) add(g, wuv(merge(beams), PT), paint);
    const baked = bakeGroup(g);
    baked.traverse((o) => { if (o.isMesh) o.castShadow = !this.lite; });
    D.add(baked);
    // 室内灯の位置（描画側が使う）
    this.lightSpots = [];
    for (const id of ALL_BAYS) if (store.bays?.[id]) { const b = bayRect(id); this.lightSpots.push([(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]); }
    for (const s of STOCK_SECTIONS) if (store.stock?.[s.id]) this.lightSpots.push([(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]);
    this.lightSpots.push([mcx, mcz]);
  }
  update(dt, timeMin, chars) {
    // 自動ドア
    let near = false;
    for (const [x, z] of chars) if (Math.abs(x - DOOR.x) < 2.2 && Math.abs(z - DOOR.z) < 2.6) { near = true; break; }
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    for (const d of this.doors) d.position.x = d.userData.base + d.userData.s * this.doorOpen * 1.15;
    // 時計
    const h = (timeMin / 60) % 12, m = timeMin % 60;
    if (this.hourHand) { this.hourHand.rotation.z = -h / 12 * Math.PI * 2; this.minHand.rotation.z = -m / 60 * Math.PI * 2; }
    if (this.clouds) this.clouds.position.x = (this.clouds.position.x + dt * 0.6) % 80;
  }
}
