// ===== 商品の3Dモデル（全部それっぽい形で作る） =====
import * as THREE from 'three';
import { PRODUCTS } from '../data.js';
import { labelTexture, tex, canvasTex } from '../textures.js';
import { mat, T, box, rbox, cyl, sph, lathe, plane, torus, cone, bakeParts, vcolor, vgrad } from './geo.js';

const metal = () => mat(0xc9cdd2, { r: 0.3, m: 0.8 });
const white = () => mat(0xffffff, { r: 0.5 });
const L = (p, v) => mat(0xffffff, { map: labelTexture(p, v), r: 0.45 });
const C = (c, o = {}) => mat(c, { r: 0.5, ...o });

// 正面・背面にラベルを貼る
function decal(parts, p, w, h, y, z, variant = 'front', both = true) {
  const m = L(p, variant);
  parts.push({ g: T(plane(w, h), 0, y, z + 0.0015), m });
  if (both) parts.push({ g: T(plane(w, h), 0, y, -z - 0.0015, 0, Math.PI), m });
}
function can(parts, p, r, h, { top = metal() } = {}) {
  // 底と天面は巻き締めのフチ付き、側面にラベル
  parts.push({ g: lathe([[0, 0.006], [r * 0.8, 0.002], [r * 0.93, 0], [r * 0.99, 0.003], [r, h * 0.05]], 24), m: top });
  parts.push({ g: T(cyl(r, r, h * 0.87, 24, true), 0, h * 0.05), m: L(p, 'wrap') });
  parts.push({ g: lathe([[r, h * 0.92], [r * 0.97, h * 0.95], [r * 0.95, h * 0.985], [r * 0.97, h], [r * 0.9, h], [r * 0.87, h * 0.985], [0, h * 0.985]], 24), m: top });
  parts.push({ g: T(torus(r * 0.98, r * 0.03, 4, 24), 0, h * 0.92, 0, Math.PI / 2), m: top });
}
function bottle(parts, p, liquid, cap, { r = 0.034, h = 0.23, op = 1 } = {}) {
  const pts = [[0, 0.004], [r * 0.6, 0], [r * 0.85, 0.004], [r, 0.014], [r, h * 0.12], [r * 0.9, h * 0.15], [r, h * 0.19], [r, h * 0.56], [r * 0.96, h * 0.62], [r * 0.7, h * 0.74], [r * 0.42, h * 0.84], [r * 0.38, h * 0.87], [r * 0.38, h * 0.9], [0, h * 0.9]];
  const shell = op < 1;
  if (shell) {
    // 透明なPETの中に飲み物
    parts.push({ g: lathe(pts.map(([x, y]) => [x * 0.93, Math.min(y, h * 0.8)]), 20), m: mat(liquid, { r: 0.1, t: true, op: Math.min(0.85, op + 0.2) }) });
    parts.push({ g: lathe(pts, 20), m: mat(0xeaf6ff, { r: 0.04, m: 0.1, t: true, op: 0.22 }) });
  } else parts.push({ g: lathe(pts, 20), m: mat(liquid, { r: 0.1, m: 0.05 }) });
  parts.push({ g: T(cyl(r * 1.015, r * 1.015, h * 0.3, 20, true), 0, h * 0.22), m: L(p, 'wrap') });
  parts.push({ g: T(cyl(r * 0.43, r * 0.43, h * 0.09, 16), 0, h * 0.895), m: C(cap, { r: 0.35 }) });
  parts.push({ g: T(torus(r * 0.43, r * 0.04, 4, 16), 0, h * 0.9, 0, Math.PI / 2), m: C(cap, { r: 0.35 }) });
}
function carton(parts, p, w, h, d, body = 0xffffff) {
  parts.push({ g: box(w, h * 0.78, d), m: C(body) });
  // 切妻屋根（三角柱）
  const r = w / 1.732, hr = h * 0.14;
  let roof = new THREE.CylinderGeometry(r, r, d, 3, 1);
  T(roof, 0, 0, 0, -Math.PI / 2, 0, 0);
  roof.translate(0, 0.5 * r, 0); roof.scale(1, hr / (1.5 * r), 1); roof.translate(0, h * 0.78, 0);
  roof = roof.toNonIndexed(); roof.computeVertexNormals();
  parts.push({ g: roof, m: C(body) });
  parts.push({ g: T(box(w * 0.04, h * 0.08, d), 0, h * 0.9), m: C(body) });
  decal(parts, p, w * 0.96, h * 0.7, h * 0.4, d / 2, 'tall');
}
function pillowBag(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d, 8, 10, 2), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2), z = pos.getZ(i);
    const k = (1 - x * x * 0.75) * (1 - Math.pow(Math.abs(y), 6) * 0.95);
    pos.setZ(i, z * Math.max(0.05, k));
  }
  g.computeVertexNormals();
  return T(g, 0, h / 2, 0);
}

const B = {
  soup: (p, P) => can(P, p, 0.039, 0.11),
  tuna: (p, P) => { can(P, p, 0.044, 0.045); P.push({ g: T(torus(0.012, 0.003, 6, 12), 0.015, 0.046, 0, Math.PI / 2), m: metal() }); },
  pasta: (p, P) => { P.push({ g: rbox(0.088, 0.26, 0.05, 0.003), m: C(0xf6f2e4) }); decal(P, p, 0.086, 0.25, 0.13, 0.025, 'tall'); },
  cereal: (p, P) => { P.push({ g: rbox(0.19, 0.28, 0.068, 0.004), m: C(p.color) }); decal(P, p, 0.186, 0.276, 0.14, 0.034, 'tall'); },
  chips: (p, P) => {
    P.push({ g: pillowBag(0.17, 0.21, 0.07), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.25, m: 0.2 }) });
    P.push({ g: T(box(0.17, 0.012, 0.008), 0, 0.0), m: C(0xd0d0d0, { m: 0.6, r: 0.3 }) }); P.push({ g: T(box(0.17, 0.012, 0.008), 0, 0.205), m: C(0xd0d0d0, { m: 0.6, r: 0.3 }) });
  },
  cookies: (p, P) => {
    P.push({ g: rbox(0.15, 0.058, 0.1, 0.01), m: C(p.color) });
    P.push({ g: T(plane(0.14, 0.09), 0, 0.0595, 0, -Math.PI / 2), m: L(p, 'front') });
    for (let i = 0; i < 3; i++) P.push({ g: T(cyl(0.022, 0.022, 0.008, 12), -0.035 + i * 0.035, 0.034, 0.051, Math.PI / 2), m: C(0xc68642) });
  },
  ketchup: (p, P) => {
    P.push({ g: lathe([[0, 0], [0.024, 0], [0.03, 0.02], [0.031, 0.12], [0.026, 0.155], [0.012, 0.17], [0, 0.17]], 16), m: C(0xc8102e, { r: 0.25 }) });
    P.push({ g: T(cyl(0.013, 0.015, 0.025, 12), 0, 0.165), m: white() });
    P.push({ g: T(cyl(0.0315, 0.0315, 0.06, 16, true), 0, 0.045), m: L(p, 'wrap') });
  },
  jam: (p, P) => {
    P.push({ g: lathe([[0, 0], [0.036, 0], [0.039, 0.01], [0.039, 0.075], [0.032, 0.085], [0, 0.085]], 16), m: C(0xa4161a, { r: 0.15 }) });
    P.push({ g: T(cyl(0.035, 0.035, 0.018, 16), 0, 0.082), m: C(0xe63946, { r: 0.4 }) });
    P.push({ g: T(cyl(0.0395, 0.0395, 0.035, 16, true), 0, 0.025), m: L(p, 'wrap') });
  },
  noodle: (p, P) => {
    P.push({ g: cyl(0.055, 0.042, 0.095, 18, true), m: L(p, 'wrap') });
    P.push({ g: T(cyl(0.057, 0.057, 0.004, 18), 0, 0.095), m: C(0xf5f0e6, { m: 0.3, r: 0.4 }) });
    P.push({ g: cyl(0.042, 0.042, 0.002, 18), m: C(0xf5f0e6) });
    P.push({ g: T(box(0.03, 0.002, 0.03), 0.045, 0.096, 0.03), m: C(0xf4a261) });
  },
  rice: (p, P) => { P.push({ g: pillowBag(0.25, 0.34, 0.12), m: C(0xf3eedf, { r: 0.8 }) }); decal(P, p, 0.18, 0.2, 0.17, 0.045, 'tall'); },
  water: (p, P) => bottle(P, p, 0xcfeeff, 0x2f80ed, { op: 0.45 }),
  soda: (p, P) => bottle(P, p, 0x5a1a12, 0xe63946, { h: 0.25 }),
  ojuice: (p, P) => carton(P, p, 0.075, 0.21, 0.075, 0xff9f1c),
  tea: (p, P) => bottle(P, p, 0x8fbf55, 0x2d6a4f, { op: 0.7 }),
  coffee: (p, P) => can(P, p, 0.029, 0.12),
  milk: (p, P) => carton(P, p, 0.078, 0.21, 0.078, 0xffffff),
  yogurt: (p, P) => {
    P.push({ g: cyl(0.04, 0.032, 0.07, 16, true), m: L(p, 'wrap') });
    P.push({ g: T(cyl(0.042, 0.042, 0.003, 16), 0, 0.07), m: C(0xdedede, { m: 0.7, r: 0.3 }) });
    P.push({ g: cyl(0.032, 0.032, 0.002, 16), m: white() });
  },
  cheese: (p, P) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, 0.12, -0.35, 0.35, false); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.065, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 6 });
    T(g, 0, 0, 0, -Math.PI / 2, 0, 0); T(g, -0.06, 0.004, 0);
    P.push({ g, m: mat(0xffffff, { map: tex('cheese'), r: 0.55 }) });
    P.push({ g: T(plane(0.05, 0.03), 0, 0.075, 0.0, -Math.PI / 2), m: L(p, 'front') });
  },
  eggs: (p, P) => {
    P.push({ g: box(0.18, 0.035, 0.1), m: C(0xbfb6a8, { r: 0.95 }) });
    const e = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) e.push(T(sph(0.022, 10, 8), -0.055 + i * 0.055, 0.045, -0.024 + j * 0.048, 0, 0, 0, 1, 1.25, 1));
    for (const g of e) P.push({ g, m: C(0xfff3df, { r: 0.4 }) });
    P.push({ g: T(plane(0.06, 0.03), 0, 0.0352, 0.04, -Math.PI / 2), m: L(p, 'front') });
  },
  sausage: (p, P) => {
    P.push({ g: box(0.16, 0.012, 0.1), m: white() });
    for (let i = 0; i < 4; i++) P.push({ g: T(new THREE.CapsuleGeometry(0.011, 0.12, 4, 8), 0, 0.022, -0.033 + i * 0.022, 0, 0, Math.PI / 2), m: C(0xb5543b, { r: 0.35 }) });
    P.push({ g: T(box(0.16, 0.003, 0.1), 0, 0.034), m: mat(0xffffff, { t: true, op: 0.25, r: 0.1 }) });
    P.push({ g: T(plane(0.07, 0.04), 0.03, 0.0375, 0.02, -Math.PI / 2), m: L(p, 'front') });
  },
  icecream: (p, P) => {
    P.push({ g: cyl(0.06, 0.054, 0.085, 18, true), m: L(p, 'wrap') });
    P.push({ g: T(cyl(0.062, 0.062, 0.016, 18), 0, 0.083), m: C(0xff8fab, { r: 0.35 }) });
    P.push({ g: cyl(0.054, 0.054, 0.002, 18), m: white() });
  },
  pizza: (p, P) => { P.push({ g: box(0.25, 0.04, 0.25), m: C(0xe76f51) }); P.push({ g: T(plane(0.24, 0.24), 0, 0.0405, 0, -Math.PI / 2), m: L(p, 'front') }); },
  gyoza: (p, P) => { const g = pillowBag(0.18, 0.24, 0.04); g.translate(0, -0.12, 0); T(g, 0, 0.02, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  apple: (p, P) => {
    const g = sph(0.045, 16, 12), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i)); if (r < 0.018) pos.setY(i, y * 0.7); }
    g.computeVertexNormals(); T(g, 0, 0.042, 0, 0, 0, 0, 1, 0.92, 1); vgrad(g, '#b51d1d', '#ff5a3c', 0, 0.09);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.35 }) });
    P.push({ g: T(cyl(0.003, 0.004, 0.025, 6), 0, 0.075, 0, 0, 0, 0.2), m: C(0x6b4423) });
    P.push({ g: T(sph(0.012, 8, 6), 0.012, 0.094, 0, 0, 0, 0.6, 1.3, 0.25, 0.7), m: C(0x52b788) });
  },
  banana: (p, P) => {
    for (let i = 0; i < 4; i++) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.09, 0.05, 0), new THREE.Vector3(0, -0.005, 0), new THREE.Vector3(0.09, 0.06, 0));
      const g = new THREE.TubeGeometry(curve, 10, 0.016, 6, false);
      T(g, 0, 0.02, -0.045 + i * 0.03, 0.25 * (i - 1.5) * 0.4, (i - 1.5) * 0.12, 0);
      P.push({ g, m: C(0xffd60a, { r: 0.45 }) });
    }
    P.push({ g: T(cyl(0.012, 0.014, 0.03, 8), -0.098, 0.05, 0, 0, 0, 1.2), m: C(0x6b8e23) });
    P.push({ g: T(sph(0.008, 6, 4), 0.092, 0.08, 0), m: C(0x3b2a20) });
  },
  carrot: (p, P) => {
    const g = T(new THREE.ConeGeometry(0.022, 0.19, 10), 0, 0, 0, Math.PI / 2, 0, 0); T(g, 0, 0.022, 0.0);
    P.push({ g, m: C(0xf77f00, { r: 0.6 }) });
    for (let i = 0; i < 4; i++) P.push({ g: T(new THREE.ConeGeometry(0.006, 0.07, 5), Math.sin(i * 1.6) * 0.006, 0.028, -0.125, -Math.PI / 2 - 0.3 + i * 0.12, 0, (i - 1.5) * 0.3), m: C(0x2d6a4f) });
  },
  tomato: (p, P) => {
    const g = T(sph(0.04, 14, 10), 0, 0.034, 0, 0, 0, 0, 1, 0.82, 1); vgrad(g, '#c1121f', '#ff4d4d', 0, 0.07);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.25 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(box(0.005, 0.002, 0.025), Math.sin(i * 1.256) * 0.01, 0.066, Math.cos(i * 1.256) * 0.01, 0, i * 1.256, 0), m: C(0x2d6a4f) });
    P.push({ g: T(cyl(0.003, 0.003, 0.012, 5), 0, 0.066), m: C(0x2d6a4f) });
  },
  watermelon: (p, P) => { P.push({ g: T(sph(0.135, 20, 14), 0, 0.12, 0, 0, 0, 0, 1, 0.9, 1), m: mat(0xffffff, { map: tex('melon'), r: 0.3 }) }); P.push({ g: T(cyl(0.004, 0.004, 0.02, 5), 0, 0.24), m: C(0x6b4423) }); },
  cabbage: (p, P) => {
    P.push({ g: T(sph(0.07, 14, 10), 0, 0.07), m: C(0xc7e9a0, { r: 0.5 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(sph(0.075, 12, 8, 0), Math.cos(i * 1.25) * 0.012, 0.068, Math.sin(i * 1.25) * 0.012, 0.3 * Math.cos(i), i * 1.25, 0.3 * Math.sin(i), 1.05, 0.9, 0.55), m: mat(0xffffff, { map: tex('leaf'), r: 0.55 }) });
  },
  bread: (p, P) => {
    P.push({ g: rbox(0.12, 0.08, 0.21, 0.015), m: C(0xf1d29b, { r: 0.8 }) });
    P.push({ g: T(new THREE.CylinderGeometry(0.06, 0.06, 0.21, 14, 1, false, -Math.PI / 2, Math.PI), 0, 0.075, 0, -Math.PI / 2, 0, 0), m: C(0xb5651d, { r: 0.7 }) });
    P.push({ g: T(rbox(0.13, 0.14, 0.215, 0.03), 0, 0.0, 0), m: mat(0xffffff, { t: true, op: 0.18, r: 0.15 }) });
    P.push({ g: T(plane(0.08, 0.05), 0, 0.07, 0.1095), m: L(p, 'front') });
  },
  croissant: (p, P) => {
    for (let i = 0; i < 5; i++) {
      const a = -1.0 + i * 0.5, s = 1 - Math.abs(i - 2) * 0.23;
      P.push({ g: T(sph(0.026, 10, 8), Math.sin(a) * 0.04, 0.022 * s + 0.004, Math.cos(a) * 0.035 - 0.02, 0, a, 0, 1.2 * s, 0.85 * s, 0.9 * s), m: C(i % 2 ? 0xc77d2e : 0xd99a4e, { r: 0.55 }) });
    }
  },
  donut: (p, P) => {
    P.push({ g: T(torus(0.033, 0.016, 10, 18), 0, 0.016, 0, Math.PI / 2), m: C(0xd4a373, { r: 0.6 }) });
    P.push({ g: T(torus(0.033, 0.0165, 10, 18), 0, 0.02, 0, Math.PI / 2, 0, 0, 1, 1, 0.6), m: C(0xff70a6, { r: 0.3 }) });
    const sp = [];
    const cols = ['#ffffff', '#4cc9f0', '#ffd60a', '#06d6a0', '#7b2cbf'];
    for (let i = 0; i < 14; i++) { const a = i * 0.45, r = 0.026 + (i % 3) * 0.008; sp.push(vcolor(T(box(0.009, 0.003, 0.003), Math.cos(a) * r, 0.03, Math.sin(a) * r, 0, a * 2, 0), cols[i % 5])); }
    for (const g of sp) P.push({ g, m: mat(0xffffff, { vc: true, r: 0.4 }) });
  },
  tissue: (p, P) => {
    P.push({ g: box(0.24, 0.1, 0.12), m: C(0x8ecae6) });
    decal(P, p, 0.235, 0.095, 0.05, 0.06, 'front');
    P.push({ g: T(plane(0.12, 0.035), 0, 0.1005, 0, -Math.PI / 2), m: C(0x5a9ab5) });
    P.push({ g: T(sph(0.03, 8, 6), 0, 0.105, 0, 0, 0, 0, 1.4, 0.7, 0.5), m: white() });
  },
  tp: (p, P) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      P.push({ g: T(cyl(0.055, 0.055, 0.11, 16), -0.057 + i * 0.114, 0, -0.057 + j * 0.114), m: C(0xfafafa, { r: 0.9 }) });
      P.push({ g: T(cyl(0.02, 0.02, 0.112, 10), -0.057 + i * 0.114, -0.001, -0.057 + j * 0.114), m: C(0xa98467) });
    }
    P.push({ g: T(box(0.235, 0.05, 0.002), 0, 0.03, 0.115), m: L(p, 'front') });
  },
  detergent: (p, P) => {
    P.push({ g: rbox(0.14, 0.2, 0.09, 0.025), m: C(0x3a86ff, { r: 0.35 }) });
    P.push({ g: T(torus(0.035, 0.012, 6, 12, Math.PI), 0.02, 0.2, 0), m: C(0x3a86ff, { r: 0.35 }) });
    P.push({ g: T(cyl(0.02, 0.022, 0.035, 12), -0.04, 0.2), m: C(0xffffff, { r: 0.3 }) });
    P.push({ g: T(plane(0.11, 0.12), 0, 0.1, 0.0452), m: L(p, 'tall') });
  },
  shampoo: (p, P) => {
    P.push({ g: rbox(0.08, 0.17, 0.05, 0.02), m: C(0x9b5de5, { r: 0.2 }) });
    P.push({ g: T(cyl(0.014, 0.014, 0.035, 10), 0, 0.17), m: white() });
    P.push({ g: T(box(0.04, 0.012, 0.012), 0.015, 0.205), m: white() });
    P.push({ g: T(plane(0.066, 0.11), 0, 0.085, 0.0252), m: L(p, 'tall') });
  },
  toothpaste: (p, P) => { P.push({ g: box(0.18, 0.04, 0.045), m: C(0x00b4d8) }); P.push({ g: T(plane(0.17, 0.038), 0, 0.02, 0.0226), m: L(p, 'front') }); P.push({ g: T(plane(0.17, 0.043), 0, 0.0402, 0, -Math.PI / 2), m: L(p, 'front') }); },
  wine: (p, P) => {
    P.push({ g: lathe([[0, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.2], [0.03, 0.235], [0.013, 0.26], [0.012, 0.31], [0, 0.31]], 18), m: C(0x1b3a2a, { r: 0.12, m: 0.3 }) });
    P.push({ g: T(cyl(0.0385, 0.0385, 0.08, 18, true), 0, 0.06), m: mat(0xffffff, { map: labelTexture({ ...p, color: '#f1e9d2' }, 'wrap'), r: 0.6 }) });
    P.push({ g: T(cyl(0.0135, 0.0135, 0.05, 12), 0, 0.275), m: C(0x7b2cbf, { m: 0.6, r: 0.3 }) });
  },
  choco: (p, P) => {
    P.push({ g: box(0.16, 0.04, 0.12), m: C(0x4a2218) });
    P.push({ g: T(plane(0.1, 0.07), 0, 0.0405, 0, -Math.PI / 2), m: L(p, 'front') });
    P.push({ g: T(box(0.162, 0.042, 0.014), 0, -0.001), m: C(0xd4af37, { m: 0.7, r: 0.3 }) });
    P.push({ g: T(box(0.014, 0.042, 0.122), 0.04, -0.001), m: C(0xd4af37, { m: 0.7, r: 0.3 }) });
    P.push({ g: T(torus(0.012, 0.004, 6, 10), 0.04, 0.045, 0, Math.PI / 2, 0, 0, 1.3, 1, 1), m: C(0xd4af37, { m: 0.7, r: 0.3 }) });
  },
  wagyu: (p, P) => {
    P.push({ g: box(0.2, 0.012, 0.14), m: C(0x111111, { r: 0.4 }) });
    P.push({ g: T(rbox(0.17, 0.022, 0.11, 0.008), 0, 0.012), m: mat(0xffffff, { map: tex('marble'), r: 0.45 }) });
    P.push({ g: T(box(0.2, 0.002, 0.14), 0, 0.04), m: mat(0xffffff, { t: true, op: 0.22, r: 0.1 }) });
    P.push({ g: T(plane(0.06, 0.04), 0.055, 0.0425, 0.035, -Math.PI / 2), m: mat(0xffffff, { map: labelTexture({ ...p, color: '#d4af37' }, 'front'), r: 0.4 }) });
  },
};

// でこぼこ（野菜の表面のゆがみ）
function lumpy(g, amt, seed = 1) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = 1 + amt * (Math.sin(x * 61 + seed) * Math.cos(z * 47 + seed * 2) + 0.6 * Math.sin(y * 83 + seed * 3));
    pos.setXYZ(i, x * f, y * (1 + (f - 1) * 0.5), z * f);
  }
  g.computeVertexNormals();
  return g;
}
let melonTex = null;
const melonMap = () => melonTex ||= canvasTex(256, 128, (c, w, h) => {
  const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f7d679'); gr.addColorStop(0.75, '#e9b44c'); gr.addColorStop(1, '#c98a35');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(150,95,30,0.55)'; c.lineWidth = 3;
  for (let x = -h; x < w + h; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h * 0.9, h * 0.8); c.stroke(); c.beginPath(); c.moveTo(x + h * 0.9, 0); c.lineTo(x, h * 0.8); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 160; i++) c.fillRect((i * 97) % w, (i * 53) % (h * 0.8), 2, 2);
});
Object.assign(B, {
  curry: (p, P) => {
    P.push({ g: rbox(0.17, 0.1, 0.04, 0.003), m: C(p.color) });
    decal(P, p, 0.166, 0.096, 0.05, 0.0201, 'front');
    P.push({ g: T(box(0.168, 0.002, 0.038), 0, 0.1), m: C(0x7a3e0a) });
  },
  honey: (p, P) => {
    P.push({ g: lathe([[0, 0], [0.03, 0], [0.034, 0.008], [0.035, 0.1], [0.03, 0.118], [0.025, 0.125], [0, 0.125]], 20), m: mat(0xd98a0b, { r: 0.08, m: 0.05 }) });
    P.push({ g: T(cyl(0.027, 0.027, 0.028, 20), 0, 0.122), m: C(0xd4af37, { r: 0.3, m: 0.7 }) });
    P.push({ g: T(torus(0.027, 0.003, 4, 20), 0, 0.124, 0, Math.PI / 2), m: C(0xd4af37, { r: 0.3, m: 0.7 }) });
    P.push({ g: T(cyl(0.0355, 0.0355, 0.06, 20, true), 0, 0.028), m: L(p, 'wrap') });
    P.push({ g: T(sph(0.006, 8, 6), 0.022, 0.118, 0.02, 0, 0, 0, 1, 1.8, 1), m: mat(0xd98a0b, { r: 0.08 }) });
  },
  flour: (p, P) => {
    P.push({ g: rbox(0.13, 0.19, 0.07, 0.008), m: C(0xf4f1ea, { r: 0.85 }) });
    P.push({ g: T(box(0.13, 0.03, 0.02), 0, 0.19, 0, 0.25), m: C(0xf4f1ea, { r: 0.85 }) });
    P.push({ g: T(box(0.13, 0.008, 0.06), 0, 0.186), m: C(0xe6e1d6, { r: 0.85 }) });
    decal(P, p, 0.124, 0.17, 0.095, 0.0352, 'tall');
  },
  sugar: (p, P) => P.push({ g: pillowBag(0.12, 0.18, 0.06), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.55 }) }),
  oil: (p, P) => bottle(P, p, 0xe8b923, 0x2d6a4f, { r: 0.03, h: 0.25, op: 0.6 }),
  energy: (p, P) => can(P, p, 0.026, 0.16),
  tofu: (p, P) => {
    P.push({ g: box(0.11, 0.045, 0.09), m: mat(0xe6f2fb, { r: 0.2, t: true, op: 0.55 }) });
    P.push({ g: T(rbox(0.1, 0.038, 0.08, 0.004), 0, 0.003), m: C(0xfbfaf4, { r: 0.75 }) });
    P.push({ g: T(plane(0.11, 0.09), 0, 0.0455, 0, -Math.PI / 2), m: L(p, 'front') });
  },
  natto: (p, P) => {
    for (let i = 0; i < 3; i++) P.push({ g: T(rbox(0.098, 0.024, 0.098, 0.006), 0, i * 0.026), m: C(0xf7f7f2, { r: 0.9 }) });
    P.push({ g: T(plane(0.1, 0.07), 0, 0.039, 0.0495), m: L(p, 'front') });
    P.push({ g: T(plane(0.09, 0.09), 0, 0.0785, 0, -Math.PI / 2), m: L(p, 'front') });
  },
  fries: (p, P) => { const g = pillowBag(0.2, 0.27, 0.05); g.translate(0, -0.135, 0); T(g, 0, 0.025, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  icebar: (p, P) => {
    P.push({ g: rbox(0.18, 0.05, 0.12, 0.004), m: C(p.color, { r: 0.4 }) });
    P.push({ g: T(plane(0.17, 0.11), 0, 0.0505, 0, -Math.PI / 2), m: L(p, 'front') });
    P.push({ g: T(plane(0.17, 0.045), 0, 0.025, 0.0605), m: C(0x2a8fbd, { r: 0.4 }) });
  },
  onion: (p, P) => {
    const g = lathe([[0, 0.002], [0.018, 0.004], [0.034, 0.016], [0.04, 0.034], [0.037, 0.05], [0.026, 0.064], [0.01, 0.075], [0.003, 0.082], [0, 0.083]], 18);
    lumpy(g, 0.03, 3); vgrad(g, '#9a5a24', '#e0a86a', 0, 0.08);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.45 }) });
    P.push({ g: T(new THREE.ConeGeometry(0.006, 0.025, 6), 0.002, 0.093, 0, 0, 0, 0.25), m: C(0x8a5a2b, { r: 0.9 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(cyl(0.0012, 0.0008, 0.012, 3), Math.cos(i * 1.3) * 0.006, -0.008, Math.sin(i * 1.3) * 0.006, 0.4 * Math.cos(i), 0, 0.4 * Math.sin(i)), m: C(0xd8c4a0) });
  },
  potato: (p, P) => {
    const g = T(lumpy(sph(0.032, 14, 10), 0.06, 7), 0, 0.026, 0, 0, 0.4, 0, 1.35, 0.8, 1);
    P.push({ g, m: C(0xc29a6a, { r: 0.92 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(sph(0.0035, 5, 4), Math.cos(i * 2.1) * 0.035, 0.026 + Math.sin(i * 3.3) * 0.012, Math.sin(i * 2.1) * 0.026), m: C(0x7d5a36, { r: 1 }) });
  },
  grapes: (p, P) => {
    const bs = [];
    const rows = [6, 6, 5, 5, 4, 3, 2, 1];
    rows.forEach((n, j) => {
      const y = 0.125 - j * 0.015, rad = 0.012 + n * 0.0065;
      for (let i = 0; i < n; i++) { const a = i / n * 6.28 + j * 0.7; bs.push(T(sph(0.0125, 7, 5), Math.cos(a) * rad * 0.9, y, Math.sin(a) * rad * 0.8, 0, 0, 0, 1, 1.1, 1)); }
    });
    for (const g of bs) vgrad(g, '#3c1642', '#7b3f8c', 0, 0.14);
    for (const g of bs) P.push({ g, m: mat(0xffffff, { vc: true, r: 0.32 }) });
    P.push({ g: T(cyl(0.003, 0.004, 0.035, 6), 0, 0.13, 0, 0, 0, 0.3), m: C(0x5c4425, { r: 0.9 }) });
    P.push({ g: T(sph(0.022, 8, 6), 0.02, 0.152, 0, 0, 0, 0.5, 1.2, 0.2, 1), m: C(0x4f8a3c, { r: 0.7 }) });
  },
  pineapple: (p, P) => {
    const body = T(new THREE.IcosahedronGeometry(0.058, 2), 0, 0.09, 0, 0, 0, 0, 1, 1.55, 1);
    vgrad(body, '#8a5716', '#e8b130', 0, 0.18);
    P.push({ g: body, m: mat(0xffffff, { vc: true, r: 0.7, flat: true }) });
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, tilt = 0.25 + (i % 3) * 0.2, len = 0.07 + (i % 4) * 0.015;
      P.push({ g: T(new THREE.ConeGeometry(0.012, len, 4).translate(0, len / 2, 0), Math.cos(a) * 0.008, 0.172, Math.sin(a) * 0.008, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt, 1, 1, 0.35), m: C(i % 2 ? 0x3f7d3a : 0x5c9a4a, { r: 0.6 }) });
    }
  },
  pumpkin: (p, P) => {
    const g = sph(0.095, 28, 16), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const a = Math.atan2(z, x); const k = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 4)), 3); pos.setXYZ(i, x * k, y, z * k); }
    g.computeVertexNormals(); T(g, 0, 0.068, 0, 0, 0, 0, 1, 0.72, 1); vgrad(g, '#18301b', '#3f6e44', 0, 0.13);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.55 }) });
    for (let i = 0; i < 9; i++) P.push({ g: T(sph(0.009, 5, 4), Math.cos(i * 2.2) * 0.07, 0.07 + Math.sin(i * 1.7) * 0.03, Math.sin(i * 2.2) * 0.07, 0, 0, 0, 1, 0.5, 1), m: C(0x8fa86a, { r: 0.8 }) });
    P.push({ g: T(cyl(0.008, 0.012, 0.03, 7), 0, 0.128, 0, 0.2, 0, 0.1), m: C(0x9b7a4a, { r: 0.95 }) });
  },
  melonpan: (p, P) => {
    P.push({ g: lathe([[0, 0], [0.05, 0], [0.058, 0.008], [0.058, 0.02], [0.052, 0.038], [0.038, 0.054], [0.018, 0.062], [0, 0.064]], 24), m: mat(0xffffff, { map: melonMap(), r: 0.75 }) });
    P.push({ g: T(rbox(0.13, 0.075, 0.13, 0.02), 0, -0.002), m: mat(0xffffff, { t: true, op: 0.16, r: 0.1 }) });
    P.push({ g: T(plane(0.05, 0.03), 0.03, 0.066, 0.03, -Math.PI / 2), m: L(p, 'front') });
  },
  baguette: (p, P) => {
    const g = T(new THREE.CapsuleGeometry(0.031, 0.35, 6, 14), 0, 0.034, 0, 0, 0, Math.PI / 2, 1, 1, 1.15);
    vgrad(g, '#a8641f', '#dca15a', 0.005, 0.065);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.8 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(sph(0.022, 10, 6), -0.14 + i * 0.07, 0.06, 0, 0, 0.5, 0, 1.4, 0.18, 0.45), m: C(0xf0cf8e, { r: 0.85 }) });
    P.push({ g: T(cyl(0.039, 0.039, 0.16, 18, true), -0.12, 0.034, 0, 0, 0, Math.PI / 2, 1, 1, 1.12), m: L(p, 'wrap') });
  },
  pudding: (p, P) => {
    for (let i = 0; i < 3; i++) {
      const x = -0.045 + i * 0.045;
      P.push({ g: T(cyl(0.02, 0.016, 0.06, 14, true), x, 0), m: mat(0xeef6ff, { r: 0.1, t: true, op: 0.45 }) });
      P.push({ g: T(cyl(0.018, 0.015, 0.045, 14), x, 0.002), m: C(0xf6d58a, { r: 0.35 }) });
      P.push({ g: T(cyl(0.0185, 0.018, 0.012, 14), x, 0.045), m: C(0x7a3b12, { r: 0.2 }) });
      P.push({ g: T(cyl(0.021, 0.021, 0.002, 14), x, 0.06), m: C(0xe9a23b, { r: 0.4 }) });
    }
    P.push({ g: T(box(0.14, 0.022, 0.044), 0, 0.02), m: L(p, 'front') });
  },
  sushi: (p, P) => {
    P.push({ g: box(0.2, 0.012, 0.13), m: C(0x111111, { r: 0.35 }) });
    P.push({ g: T(box(0.2, 0.003, 0.13), 0, 0.012), m: C(0xb22222, { r: 0.4 }) });
    const tops = [0xf4845f, 0xff9a8b, 0xf7f7f2, 0xffc94a, 0xe63946, 0xf4845f, 0x8bc34a, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const x = -0.07 + (i % 4) * 0.047, z = -0.03 + Math.floor(i / 4) * 0.06;
      P.push({ g: T(rbox(0.036, 0.016, 0.022, 0.007), x, 0.015, z), m: C(0xfbfaf4, { r: 0.85 }) });
      P.push({ g: T(rbox(0.04, 0.006, 0.026, 0.003), x, 0.03, z), m: C(tops[i], { r: 0.3 }) });
    }
    P.push({ g: T(box(0.2, 0.05, 0.13), 0, 0.0), m: mat(0xffffff, { t: true, op: 0.15, r: 0.1 }) });
    P.push({ g: T(plane(0.06, 0.035), 0.06, 0.051, 0.04, -Math.PI / 2), m: L(p, 'front') });
  },
  salad: (p, P) => {
    P.push({ g: cyl(0.07, 0.055, 0.05, 18, true), m: mat(0xeef6ff, { r: 0.1, t: true, op: 0.4 }) });
    P.push({ g: T(sph(0.06, 14, 8), 0, 0.03, 0, 0, 0, 0, 1, 0.35, 1), m: C(0x7fc96b, { r: 0.6 }) });
    for (let i = 0; i < 6; i++) P.push({ g: T(sph(0.012, 8, 6), Math.cos(i) * 0.03, 0.05, Math.sin(i) * 0.03), m: C(i % 2 ? 0xe63946 : 0xffb703, { r: 0.4 }) });
    P.push({ g: T(cyl(0.071, 0.071, 0.004, 18), 0, 0.058), m: mat(0xeef6ff, { r: 0.1, t: true, op: 0.3 }) });
    P.push({ g: T(plane(0.06, 0.04), 0, 0.061, 0, -Math.PI / 2), m: L(p, 'front') });
  },
  butter: (p, P) => { P.push({ g: rbox(0.12, 0.05, 0.07, 0.004), m: C(p.color) }); decal(P, p, 0.115, 0.045, 0.025, 0.0351, 'front'); P.push({ g: T(plane(0.11, 0.065), 0, 0.0505, 0, -Math.PI / 2), m: L(p, 'front') }); },
  kakigori: (p, P) => {
    P.push({ g: cyl(0.045, 0.034, 0.07, 16, true), m: L(p, 'wrap') });
    P.push({ g: cyl(0.034, 0.034, 0.002, 16), m: white() });
    P.push({ g: T(sph(0.045, 14, 8), 0, 0.07, 0, 0, 0, 0, 1, 0.45, 1), m: C(0xbfe9ff, { r: 0.85 }) });
    P.push({ g: T(cyl(0.047, 0.047, 0.003, 16), 0, 0.07), m: mat(0xeef6ff, { r: 0.1, t: true, op: 0.4 }) });
  },
  udon: (p, P) => { const g = pillowBag(0.2, 0.26, 0.05); g.translate(0, -0.13, 0); T(g, 0, 0.025, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  karaage: (p, P) => { const g = pillowBag(0.18, 0.25, 0.05); g.translate(0, -0.125, 0); T(g, 0, 0.025, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  shrimp: (p, P) => {
    P.push({ g: rbox(0.18, 0.045, 0.22, 0.006), m: C(0x1d4e89, { r: 0.4 }) });
    P.push({ g: T(plane(0.17, 0.21), 0, 0.0455, 0, -Math.PI / 2), m: L(p, 'tall') });
  },
  candy: (p, P) => P.push({ g: pillowBag(0.12, 0.17, 0.04), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.2 }) }),
  senbei: (p, P) => P.push({ g: pillowBag(0.15, 0.22, 0.06), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.5 }) }),
  popcorn: (p, P) => P.push({ g: pillowBag(0.14, 0.24, 0.07), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.35, m: 0.1 }) }),
  mayo: (p, P) => {
    // ソフトボトル（下が太い）＋赤いキャップ
    P.push({ g: lathe([[0, 0.003], [0.026, 0], [0.033, 0.02], [0.034, 0.12], [0.03, 0.15], [0.02, 0.165], [0.012, 0.17], [0, 0.17]], 18), m: mat(0xfff4c9, { r: 0.25 }) });
    P.push({ g: T(cyl(0.0345, 0.0345, 0.08, 18, true), 0, 0.03, 0, 0, 0, 0, 1, 1, 0.75), m: L(p, 'wrap') });
    P.push({ g: T(cyl(0.013, 0.018, 0.03, 14), 0, 0.168), m: C(0xd62828, { r: 0.3 }) });
    P.push({ g: T(cone(0.008, 0.012, 10), 0, 0.198), m: C(0xd62828, { r: 0.3 }) });
  },
  soy: (p, P) => bottle(P, p, 0x3b1608, 0xd62828, { r: 0.04, h: 0.24, op: 0.85 }),
  sports: (p, P) => bottle(P, p, 0xbfe3ff, 0x1d4ed8, { r: 0.034, h: 0.24, op: 0.55 }),
  greentea: (p, P) => bottle(P, p, 0x9bb54a, 0x2a9d8f, { r: 0.054, h: 0.32, op: 0.6 }),
  beer: (p, P) => can(P, p, 0.033, 0.123),
  battery: (p, P) => {
    // ブリスターパック：台紙＋透明カバーの中に電池4本
    P.push({ g: rbox(0.11, 0.17, 0.006, 0.003), m: L(p, 'tall') });
    P.push({ g: T(rbox(0.09, 0.1, 0.022, 0.006), 0, 0.02, 0.008), m: mat(0xffffff, { t: true, op: 0.25, r: 0.05 }) });
    for (let i = 0; i < 4; i++) {
      P.push({ g: T(cyl(0.0072, 0.0072, 0.05, 12), -0.024 + i * 0.016, 0.035, 0.012), m: C(0x1b1b1b, { r: 0.3, m: 0.6 }) });
      P.push({ g: T(cyl(0.0074, 0.0074, 0.016, 12), -0.024 + i * 0.016, 0.069, 0.012), m: C(0xd4a017, { r: 0.3, m: 0.7 }) });
    }
  },
  mask: (p, P) => { P.push({ g: rbox(0.19, 0.1, 0.1, 0.004), m: C(0xffffff, { r: 0.6 }) }); decal(P, p, 0.185, 0.095, 0.05, 0.0501, 'front'); P.push({ g: T(plane(0.08, 0.04), 0, 0.1005, 0, -Math.PI / 2), m: C(0xdfe8ee, { r: 0.7 }) }); },
  trashbag: (p, P) => { P.push({ g: rbox(0.15, 0.04, 0.22, 0.012), m: mat(0x5c636a, { r: 0.35, m: 0.1 }) }); P.push({ g: T(plane(0.14, 0.2), 0, 0.0405, 0, -Math.PI / 2), m: L(p, 'tall') }); },
  anpan: (p, P) => {
    const g = lathe([[0, 0], [0.05, 0], [0.058, 0.01], [0.054, 0.03], [0.04, 0.044], [0.02, 0.05], [0, 0.051]], 20);
    vgrad(g, '#7a3e12', '#c0702a', 0.0, 0.05);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.5 }) });
    for (let i = 0; i < 7; i++) P.push({ g: T(sph(0.0035, 5, 4), Math.cos(i * 2.4) * 0.008, 0.051, Math.sin(i * 2.4) * 0.008, 0, 0, 0, 1, 0.5, 1.8), m: C(0xf2e6c9, { r: 0.6 }) });
    P.push({ g: T(rbox(0.125, 0.06, 0.125, 0.02), 0, -0.002), m: mat(0xffffff, { t: true, op: 0.16, r: 0.1 }) });
    P.push({ g: T(plane(0.05, 0.03), 0.03, 0.06, 0.03, -Math.PI / 2), m: L(p, 'front') });
  },
  sandwich: (p, P) => {
    // 三角パック（パン＋具が見える）
    const sh = new THREE.Shape(); sh.moveTo(-0.065, 0); sh.lineTo(0.065, 0); sh.lineTo(0, 0.12); sh.closePath();
    const pack = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false }); pack.translate(0, 0, -0.035);
    P.push({ g: pack, m: mat(0xffffff, { t: true, op: 0.22, r: 0.08 }) });
    const sh2 = new THREE.Shape(); sh2.moveTo(-0.058, 0.004); sh2.lineTo(0.058, 0.004); sh2.lineTo(0, 0.11); sh2.closePath();
    for (const [z, c] of [[-0.03, 0xf3e3c3], [-0.012, 0xf4d35e], [0.0, 0x7fc96b], [0.012, 0xf3e3c3]]) { const g = new THREE.ExtrudeGeometry(sh2, { depth: z === 0 ? 0.008 : 0.016, bevelEnabled: false }); g.translate(0, 0, z); P.push({ g, m: C(c, { r: 0.8 }) }); }
    P.push({ g: T(plane(0.07, 0.035), 0, 0.03, 0.0355), m: L(p, 'front') });
  },
  strawberry: (p, P) => {
    P.push({ g: box(0.15, 0.03, 0.1), m: mat(0xffffff, { t: true, op: 0.3, r: 0.1 }) });
    for (let i = 0; i < 12; i++) {
      const x = -0.055 + (i % 4) * 0.037, z = -0.03 + Math.floor(i / 4) * 0.03, y = 0.03 + (i % 3) * 0.004;
      const g = T(new THREE.ConeGeometry(0.014, 0.03, 7).rotateX(Math.PI), x, y + 0.004, z, 0.6, i, 0.2);
      P.push({ g, m: C(0xd62839, { r: 0.35 }) });
      P.push({ g: T(sph(0.008, 5, 3), x - Math.sin(i) * 0.006, y + 0.014, z, 0, 0, 0, 1, 0.4, 1), m: C(0x3f8f3a, { r: 0.6 }) });
    }
    P.push({ g: T(plane(0.06, 0.03), 0, 0.016, 0.0505), m: L(p, 'front') });
  },
  cucumber: (p, P) => {
    const g = T(new THREE.CapsuleGeometry(0.016, 0.19, 6, 10), 0, 0.017, 0, Math.PI / 2, 0, 0, 1, 1, 1);
    lumpy(g, 0.04, 5); vgrad(g, '#1e4d2b', '#3f7d4a', 0, 0.034);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.45 }) });
    P.push({ g: T(sph(0.006, 6, 4), 0, 0.017, 0.11), m: C(0xf2d16b, { r: 0.6 }) });
  },
  lemon: (p, P) => {
    const g = T(lumpy(sph(0.032, 14, 10), 0.02, 9), 0, 0.034, 0, 0, 0, Math.PI / 2, 1.18, 1, 1);
    P.push({ g, m: C(0xf9d71c, { r: 0.4 }) });
    for (const sx of [1, -1]) P.push({ g: T(sph(0.008, 6, 4), sx * 0.038, 0.034, 0, 0, 0, 0, 1, 0.8, 0.8), m: C(0xf2c80f, { r: 0.4 }) });
  },
  ham: (p, P) => {
    P.push({ g: rbox(0.15, 0.022, 0.12, 0.005), m: C(0xf2f2f2, { r: 0.5 }) });
    for (let i = 0; i < 3; i++) P.push({ g: T(cyl(0.045, 0.045, 0.005, 20), -0.02 + i * 0.02, 0.022 + i * 0.002, 0, 0, 0, 0, 1, 1, 0.9), m: C(0xf4a6b5, { r: 0.45 }) });
    P.push({ g: T(box(0.15, 0.03, 0.12), 0, 0), m: mat(0xffffff, { t: true, op: 0.15, r: 0.05 }) });
    P.push({ g: T(plane(0.07, 0.035), 0.035, 0.0305, 0.03, -Math.PI / 2), m: L(p, 'front') });
  },
  kimchi: (p, P) => {
    P.push({ g: cyl(0.055, 0.05, 0.07, 20), m: mat(0xffffff, { t: true, op: 0.4, r: 0.1 }) });
    P.push({ g: T(cyl(0.05, 0.046, 0.06, 20), 0, 0.003), m: C(0xc1272d, { r: 0.6 }) });
    P.push({ g: T(cyl(0.056, 0.056, 0.012, 20), 0, 0.07), m: C(0x2b2d42, { r: 0.4 }) });
    P.push({ g: T(cyl(0.0555, 0.0555, 0.035, 20, true), 0, 0.02), m: L(p, 'wrap') });
  },
  // ===== v6 追加 =====
  ramen: (p, P) => { const g = pillowBag(0.2, 0.14, 0.06); g.translate(0, -0.07, 0); T(g, 0, 0.03, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.35, m: 0.1 }) }); },
  furikake: (p, P) => P.push({ g: pillowBag(0.1, 0.15, 0.03), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.4 }) }),
  gummy: (p, P) => P.push({ g: pillowBag(0.12, 0.15, 0.03), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.25, m: 0.2 }) }),
  peanut: (p, P) => P.push({ g: pillowBag(0.13, 0.2, 0.05), m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.45 }) }),
  retort: (p, P) => { P.push({ g: rbox(0.15, 0.2, 0.03, 0.006), m: C(p.color) }); decal(P, p, 0.144, 0.19, 0.1, 0.0151, 'tall'); },
  cola: (p, P) => bottle(P, p, 0x3a1208, 0xd62828, { r: 0.034, h: 0.25, op: 0.85 }),
  milktea: (p, P) => bottle(P, p, 0xd9b48f, 0xffffff, { r: 0.034, h: 0.23, op: 0.95 }),
  sparkling: (p, P) => bottle(P, p, 0xe8f7ff, 0x48cae4, { r: 0.034, h: 0.24, op: 0.4 }),
  highball: (p, P) => can(P, p, 0.033, 0.123),
  sake: (p, P) => {
    bottle(P, p, 0x1b4332, 0x1d3557, { r: 0.045, h: 0.36, op: 1 });
    P.push({ g: T(cyl(0.02, 0.02, 0.03, 12), 0, 0.33), m: C(0xe9d8a6, { r: 0.6 }) });
  },
  champagne: (p, P) => {
    bottle(P, p, 0x1b3a26, 0xd4af37, { r: 0.045, h: 0.32, op: 1 });
    P.push({ g: T(cyl(0.018, 0.024, 0.06, 14), 0, 0.27), m: C(0xd4af37, { r: 0.25, m: 0.85 }) });
  },
  onigiri: (p, P) => {
    const sh = new THREE.Shape(); sh.moveTo(-0.048, 0); sh.quadraticCurveTo(-0.052, 0.012, -0.04, 0.03); sh.lineTo(-0.008, 0.088); sh.quadraticCurveTo(0, 0.1, 0.008, 0.088); sh.lineTo(0.04, 0.03); sh.quadraticCurveTo(0.052, 0.012, 0.048, 0); sh.closePath();
    const rice = new THREE.ExtrudeGeometry(sh, { depth: 0.032, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }); rice.translate(0, 0, -0.016);
    P.push({ g: rice, m: C(0xfbfaf4, { r: 0.85 }) });
    P.push({ g: T(box(0.05, 0.045, 0.044), 0, 0.0), m: C(0x1b2a1f, { r: 0.6 }) });
    const film = new THREE.ExtrudeGeometry(sh, { depth: 0.042, bevelEnabled: false }); film.translate(0, 0, -0.021); film.scale(1.06, 1.04, 1);
    P.push({ g: film, m: mat(0xffffff, { t: true, op: 0.18, r: 0.05 }) });
    P.push({ g: T(plane(0.05, 0.022), 0, 0.055, 0.0215), m: L(p, 'front') });
  },
  bento: (p, P) => {
    P.push({ g: rbox(0.22, 0.03, 0.16, 0.008), m: C(0x1b1b1b, { r: 0.3 }) });
    P.push({ g: T(box(0.1, 0.012, 0.14), -0.05, 0.026), m: C(0xfbfaf4, { r: 0.85 }) });
    P.push({ g: T(sph(0.008, 6, 4), -0.05, 0.04, 0), m: C(0xc1121f, { r: 0.4 }) });
    for (const [x, z, c, sx] of [[0.04, -0.04, 0xc1772f, 1.4], [0.075, -0.03, 0xf4d35e, 1], [0.05, 0.035, 0x55a630, 1.2], [0.085, 0.04, 0xe76f51, 1]]) P.push({ g: T(sph(0.016, 8, 6), x, 0.034, z, 0, 0, 0, sx, 0.6, 1), m: C(c, { r: 0.6 }) });
    P.push({ g: T(box(0.22, 0.06, 0.16), 0, 0.0), m: mat(0xffffff, { t: true, op: 0.16, r: 0.05 }) });
    P.push({ g: T(plane(0.08, 0.035), 0.06, 0.0605, 0.05, -Math.PI / 2), m: L(p, 'front') });
  },
  cream: (p, P) => carton(P, p, 0.07, 0.12, 0.05),
  frozenveg: (p, P) => { const g = pillowBag(0.18, 0.26, 0.04); g.translate(0, -0.13, 0); T(g, 0, 0.02, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  takoyaki: (p, P) => { const g = pillowBag(0.2, 0.25, 0.05); g.translate(0, -0.125, 0); T(g, 0, 0.025, 0, -Math.PI / 2, 0, 0); P.push({ g, m: mat(0xffffff, { map: labelTexture(p, 'tall'), r: 0.3, m: 0.15 }) }); },
  mikan: (p, P) => {
    P.push({ g: T(lumpy(sph(0.03, 14, 10), 0.015, 4), 0, 0.024, 0, 0, 0, 0, 1, 0.78, 1), m: C(0xf77f00, { r: 0.55 }) });
    P.push({ g: T(cyl(0.004, 0.005, 0.004, 6), 0, 0.048), m: C(0x4f772d, { r: 0.7 }) });
  },
  broccoli: (p, P) => {
    P.push({ g: T(cyl(0.018, 0.024, 0.07, 10), 0, 0), m: C(0x8ab17d, { r: 0.6 }) });
    for (let i = 0; i < 9; i++) { const a = i * 2.2, rr = i ? 0.035 : 0; P.push({ g: T(lumpy(sph(0.032, 9, 7), 0.08, i), Math.cos(a) * rr, 0.085 + (i ? 0 : 0.015), Math.sin(a) * rr, 0, 0, 0, 1, 0.8, 1), m: C(i % 2 ? 0x2d6a4f : 0x40916c, { r: 0.85 }) }); }
  },
  corn: (p, P) => {
    P.push({ g: T(new THREE.CapsuleGeometry(0.022, 0.17, 6, 12), 0, 0.026, 0, Math.PI / 2, 0, 0), m: C(0xffd166, { r: 0.5 }) });
    for (const [a, l] of [[0.6, 0.2], [-0.5, 0.22], [2.6, 0.18]]) P.push({ g: T(box(0.03, 0.004, l), Math.sin(a) * 0.022, 0.026 + Math.cos(a) * 0.022, -0.03, 0, 0, a), m: C(0x90a955, { r: 0.7 }) });
  },
  eggplant: (p, P) => {
    const g = T(new THREE.CapsuleGeometry(0.026, 0.1, 6, 12), 0, 0.028, 0, Math.PI / 2 - 0.15, 0, 0, 1, 1, 1);
    P.push({ g, m: C(0x3c096c, { r: 0.18 }) });
    P.push({ g: T(new THREE.ConeGeometry(0.02, 0.03, 6).rotateX(-Math.PI / 2), 0, 0.03, -0.075), m: C(0x2d6a4f, { r: 0.7 }) });
  },
  peach: (p, P) => {
    const g = T(sph(0.038, 16, 12), 0, 0.038, 0); vgrad(g, '#f6bd60', '#ff8fab', 0, 0.075);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.8 }) });
    P.push({ g: T(box(0.002, 0.06, 0.004), 0, 0.01, 0.037), m: C(0xe5989b, { r: 0.8 }) });
    P.push({ g: T(sph(0.016, 6, 4), 0.012, 0.075, 0, 0, 0, 0.6, 1.4, 0.2, 0.7), m: C(0x52b788, { r: 0.6 }) });
  },
  avocado: (p, P) => P.push({ g: T(lathe([[0, 0], [0.025, 0.004], [0.034, 0.03], [0.03, 0.06], [0.02, 0.085], [0.008, 0.098], [0, 0.1]], 14), 0, 0, 0, 0.15, 0, 0), m: C(0x283618, { r: 0.75 }) }),
  mushroom: (p, P) => {
    P.push({ g: box(0.14, 0.02, 0.1), m: C(0xf2f2f2, { r: 0.6 }) });
    for (let i = 0; i < 6; i++) { const x = -0.045 + (i % 3) * 0.045, z = -0.022 + Math.floor(i / 3) * 0.044; P.push({ g: T(sph(0.022, 10, 6), x, 0.024, z, 0.2, i, 0, 1, 0.55, 1), m: C(0x7f5539, { r: 0.7 }) }); }
    P.push({ g: T(box(0.14, 0.05, 0.1), 0, 0), m: mat(0xffffff, { t: true, op: 0.14, r: 0.05 }) });
    P.push({ g: T(plane(0.06, 0.03), 0, 0.025, 0.0505), m: L(p, 'front') });
  },
  currypan: (p, P) => {
    const g = T(lumpy(sph(0.05, 14, 10), 0.05, 8), 0, 0.028, 0, 0, 0, 0, 1.25, 0.55, 0.85); vgrad(g, '#9c5a1c', '#d99a4e', 0, 0.06);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.95 }) });
    P.push({ g: T(rbox(0.13, 0.062, 0.095, 0.02), 0, -0.002), m: mat(0xffffff, { t: true, op: 0.14, r: 0.1 }) });
  },
  rollcake: (p, P) => {
    P.push({ g: T(cyl(0.04, 0.04, 0.18, 18), 0, 0.042, 0, 0, 0, Math.PI / 2), m: C(0xf1c27d, { r: 0.85 }) });
    for (const sx of [1, -1]) P.push({ g: T(cyl(0.032, 0.032, 0.002, 18), sx * 0.0905, 0.042, 0, 0, 0, Math.PI / 2), m: C(0xfffbf0, { r: 0.7 }) });
    P.push({ g: T(box(0.2, 0.09, 0.09), 0, 0), m: mat(0xffffff, { t: true, op: 0.16, r: 0.05 }) });
    P.push({ g: T(plane(0.08, 0.035), 0, 0.03, 0.0455), m: L(p, 'front') });
  },
  bagel: (p, P) => { const g = T(new THREE.TorusGeometry(0.036, 0.018, 10, 18), 0, 0.02, 0, Math.PI / 2, 0, 0, 1, 1, 1.15); vgrad(g, '#a0612b', '#deb887', 0.0, 0.04); P.push({ g, m: mat(0xffffff, { vc: true, r: 0.6 }) }); },
  dishsoap: (p, P) => {
    P.push({ g: T(rbox(0.07, 0.17, 0.045, 0.02), 0, 0), m: mat(0x52dcb0, { r: 0.12, t: true, op: 0.85 }) });
    P.push({ g: T(plane(0.06, 0.09), 0, 0.06, 0.0228), m: L(p, 'front') });
    P.push({ g: T(cyl(0.015, 0.02, 0.04, 12), 0, 0.17), m: C(0xffffff, { r: 0.4 }) });
    P.push({ g: T(cone(0.006, 0.015, 8), 0, 0.21), m: C(0xffffff, { r: 0.4 }) });
  },
  softener: (p, P) => {
    P.push({ g: rbox(0.12, 0.21, 0.08, 0.025), m: C(0xffc2d1, { r: 0.3 }) });
    P.push({ g: T(torus(0.025, 0.008, 6, 14), 0.04, 0.16, 0, 0, Math.PI / 2, 0), m: C(0xffc2d1, { r: 0.3 }) });
    P.push({ g: T(cyl(0.022, 0.022, 0.04, 14), -0.025, 0.21), m: C(0xff70a6, { r: 0.4 }) });
    P.push({ g: T(plane(0.1, 0.12), 0, 0.05, 0.0405), m: L(p, 'front') });
  },
  towel: (p, P) => {
    for (let i = 0; i < 3; i++) P.push({ g: T(rbox(0.2, 0.018, 0.12, 0.008), 0, i * 0.019), m: C(i % 2 ? 0x4cc9f0 : 0xbde0fe, { r: 1 }) });
    P.push({ g: T(box(0.04, 0.06, 0.122), 0.06, 0), m: L(p, 'front') });
  },
  melon: (p, P) => {
    const g = T(sph(0.075, 18, 14), 0, 0.075, 0); vgrad(g, '#606c38', '#a7c957', 0, 0.15);
    P.push({ g, m: mat(0xffffff, { vc: true, r: 0.9, map: tex('net') }) });
    P.push({ g: T(cyl(0.004, 0.005, 0.03, 6), 0, 0.15), m: C(0x6b4423) }); P.push({ g: T(cyl(0.003, 0.003, 0.05, 6), 0, 0.17, 0, 0, 0, Math.PI / 2), m: C(0x6b4423) });
    P.push({ g: T(box(0.16, 0.03, 0.16), 0, 0), m: C(0xffffff, { r: 0.6 }) });
  },
  toro: (p, P) => {
    P.push({ g: rbox(0.18, 0.012, 0.12, 0.004), m: C(0x111111, { r: 0.35 }) });
    for (let i = 0; i < 5; i++) P.push({ g: T(rbox(0.03, 0.014, 0.08, 0.004), -0.06 + i * 0.03, 0.012, 0, 0.05, 0, -0.25), m: C(0xffb3c1, { r: 0.25 }) });
    P.push({ g: T(box(0.18, 0.035, 0.12), 0, 0), m: mat(0xffffff, { t: true, op: 0.14, r: 0.05 }) });
    P.push({ g: T(plane(0.07, 0.03), 0.045, 0.036, 0.03, -Math.PI / 2), m: L(p, 'front') });
  },
  sponge: (p, P) => {
    const cols = [0xf9c74f, 0x90be6d, 0xf8961e];
    for (let i = 0; i < 3; i++) {
      P.push({ g: T(rbox(0.036, 0.034, 0.082, 0.006), -0.039 + i * 0.039, 0), m: C(cols[i], { r: 1 }) });
      P.push({ g: T(rbox(0.036, 0.011, 0.082, 0.003), -0.039 + i * 0.039, 0.034), m: C(0x2d6a4f, { r: 1 }) });
    }
    P.push({ g: rbox(0.122, 0.05, 0.088, 0.006), m: mat(0xffffff, { t: true, op: 0.16, r: 0.1 }) });
    P.push({ g: T(plane(0.12, 0.022), 0, 0.038, 0.0445), m: L(p, 'front') });
  },
});

const modelCache = new Map();
// 商品モデル：マテリアル別に結合したパーツ配列
export function productParts(pid) {
  if (modelCache.has(pid)) return modelCache.get(pid);
  const p = PRODUCTS[pid];
  let parts = [], baked;
  const fallback = (pp, P) => P.push({ g: box(...pp.size), m: C(pp.color) });
  try { (B[pid] || fallback)(p, parts); baked = bakeParts(parts); }
  catch (e) { console.warn('商品モデル失敗', pid, e); parts = []; fallback(p, parts); baked = bakeParts(parts); }
  modelCache.set(pid, baked);
  return baked;
}
export function productMesh(pid, scale = 1) {
  const g = new THREE.Group();
  for (const { g: geo, m } of productParts(pid)) { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); }
  g.scale.setScalar(scale);
  g.userData.pid = pid;
  return g;
}
