// ===== 設備（棚・冷蔵ケース・レジ・看板など）の3Dモデル =====
import * as THREE from 'three';
import { FIXTURES } from '../data.js';
import { tex, surf, signTexture, canvasTex, emoji, FONT, rr, shade } from '../textures.js';
import { mat, smat, glassMat, T, box, rbox, cyl, sph, lathe, plane, torus, cone, add, M, vcolor } from './geo.js';

const basicCache = new Map();
export function basic(map, o = {}) {
  const k = map.uuid + JSON.stringify(o);
  if (!basicCache.has(k)) basicCache.set(k, new THREE.MeshBasicMaterial({ map, transparent: !!o.t, side: o.side ?? THREE.FrontSide, toneMapped: false, depthWrite: o.dw ?? true }));
  return basicCache.get(k);
}
const C = (c, o = {}) => mat(c, { r: 0.55, ...o });
const METAL = () => smat(surf('metal'), 0xeef0f2, { r: 0.42, m: 0.55 });
const PAINT = (c) => C(c, { r: 0.42, m: 0.25 });
const DARK = () => C(0x3a3f45, { r: 0.45, m: 0.4 });
const WOOD = () => smat(surf('wood'), 0xffffff, { r: 0.65 });
const CHROME = () => C(0xdfe3e8, { r: 0.18, m: 0.9 });

let beltTex = null;
export function getBeltTex() { return beltTex ||= tex('belt'); }

function shelfFrame(g, w, d, h, accent, sides) {
  // 台座（黒）＋前面の幕板（店のテーマ色）
  add(g, rbox(w - 0.02, 0.1, d * 0.94, 0.008), C(0x3d4248, { r: 0.6 }));
  for (const s of sides === 1 ? [1] : [1, -1]) add(g, T(box(w - 0.04, 0.085, 0.012), 0, 0.008), PAINT(accent), 0, 0, s * (d * 0.47 + 0.006));
  // 側板と柱
  for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) add(g, rbox(0.03, h, d, 0.008), PAINT(0xf2f3f4), x, 0, 0);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05, 0]) add(g, box(0.045, h - 0.02, 0.03), C(0x9aa0a6, { r: 0.4, m: 0.5 }), x, 0, sides === 1 ? -d / 2 + 0.03 : 0);
  // 背板（穴あき）
  const peg = mat(0xffffff, { map: tex('pegboard'), r: 0.7 });
  if (sides === 1) add(g, box(w - 0.06, h - 0.14, 0.015), peg, 0, 0.1, -d / 2 + 0.012);
  else add(g, box(w - 0.06, h - 0.14, 0.03), peg, 0, 0.1, 0);
  // 天板とトップの見出しプレート
  add(g, T(rbox(w, 0.04, d * 1.02, 0.01), 0, h - 0.04), PAINT(0xf2f3f4));
  add(g, T(box(w - 0.1, 0.1, 0.012), 0, h - 0.12), PAINT(accent), 0, 0, sides === 1 ? -d / 2 + 0.02 : 0);
}
function boards(g, def, accent, o = {}) {
  const rail = C(0xffffff, { r: 0.35 });
  const cover = mat(0xf4fbff, { r: 0.05, t: true, op: 0.28 });
  const join = def.cat !== 'cold' && !o.perSlot;
  // 同じ高さ・同じ面の枠は1枚の棚板にまとめる
  const groups = new Map();
  for (const s of def.slots) {
    const k = join ? `${s.y}|${s.side}|${s.z}` : s.key;
    const gr = groups.get(k) || { y: s.y, side: s.side, z: s.z, d: s.d, minX: 1e9, maxX: -1e9, xs: [] };
    gr.minX = Math.min(gr.minX, s.x - s.w / 2); gr.maxX = Math.max(gr.maxX, s.x + s.w / 2); gr.xs.push(s.x + s.w / 2 + 0.04);
    groups.set(k, gr);
  }
  const div = mat(0xe8f4ff, { r: 0.1, t: true, op: 0.55 });
  for (const gr of groups.values()) {
    const w = join ? (o.w ?? def.w) - 0.07 : gr.maxX - gr.minX, x = join ? 0 : (gr.minX + gr.maxX) / 2;
    const front = gr.z + gr.side * (gr.d / 2 + 0.012);
    add(g, T(rbox(w, 0.02, gr.d + 0.03, 0.004), 0, gr.y - 0.02, 0), METAL(), x, 0, gr.z - gr.side * 0.005);
    // 値札レール（白）＋透明カバー＋色ライン
    add(g, T(box(w, 0.05, 0.01), 0, gr.y - 0.065, 0), rail, x, 0, front);
    add(g, T(box(w, 0.052, 0.004), 0, gr.y - 0.066, 0), cover, x, 0, gr.z + gr.side * (gr.d / 2 + 0.031));
    add(g, T(box(w, 0.006, 0.012), 0, gr.y - 0.016, 0), PAINT(accent), x, 0, gr.z + gr.side * (gr.d / 2 + 0.013));
    // 枠と枠の間の透明な仕切り板（1枠＝1箱のめやす）
    if (join && !o.noDiv) for (const dx of gr.xs.sort((a, b) => a - b).slice(0, -1)) add(g, T(box(0.006, 0.09, gr.d - 0.02), 0, gr.y, 0), div, dx, 0, gr.z);
  }
}
// 壁掛けの黒板（チョーク描き）
function chalkboard(g, w, h, draw, frame = 0x8b5a2b) {
  add(g, T(rbox(w + 0.1, h + 0.1, 0.05, 0.015), 0, 0.95), C(frame, { r: 0.6 }), 0, 0, -0.2);
  const t = canvasTex(512, Math.round(512 * h / w), (c, W, H) => {
    c.fillStyle = '#26352c'; c.fillRect(0, 0, W, H);
    const r = Math.random; c.globalAlpha = 0.06; for (let i = 0; i < 60; i++) { c.fillStyle = '#fff'; c.fillRect(r() * W, r() * H, 40 + r() * 80, 2 + r() * 6); } c.globalAlpha = 1;
    c.strokeStyle = '#f2efe4'; c.fillStyle = '#f2efe4'; c.lineCap = 'round'; c.lineJoin = 'round';
    draw(c, W, H);
  });
  add(g, T(plane(w, h), 0, 0.95 + 0.05 + h / 2, 0), basic(t), 0, 0, -0.17);
  add(g, T(box(w * 0.8, 0.03, 0.06), 0, 0.98), C(frame, { r: 0.6 }), 0, 0, -0.15);
  for (let i = 0; i < 3; i++) add(g, T(box(0.06, 0.012, 0.012), -w * 0.3 + i * 0.08, 1.01), C(['#fff', '#ffd23f', '#ff8fab'][i]), 0, 0, -0.15);
}
const SIGNFACE = {};
const BUILD = {
  mboard() {
    const g = new THREE.Group();
    chalkboard(g, 1.8, 1.0, (c, W, H) => {
      c.font = `900 40px ${FONT}`; c.fillText('MANAGER BOARD', 24, 56);
      c.font = `700 24px ${FONT}`; ['📦 発注', '🏷 値段', '🧑‍💼 従業員', '🏪 お店'].forEach((t, i) => c.fillText(t, 30 + (i % 2) * 230, 120 + Math.floor(i / 2) * 50));
      c.lineWidth = 4; c.beginPath(); c.moveTo(30, H - 30); [60, 110, 90, 160, 140, 200].forEach((v, i) => c.lineTo(60 + i * 70, H - 30 - v * 0.6)); c.stroke();
      c.strokeRect(24, 80, W - 48, H - 100);
    });
    return g;
  },
  fboard() {
    const g = new THREE.Group();
    chalkboard(g, 1.8, 1.0, (c, W, H) => {
      c.font = `900 38px ${FONT}`; c.fillText('FRANCHISE ★', 24, 52);
      const pts = [[W / 2, 90], [100, 160], [200, 160], [W / 2, 160], [W - 200, 160], [W - 100, 160], [100, 230], [W / 2, 230], [W - 100, 230]];
      c.lineWidth = 3; for (let i = 1; i < pts.length; i++) { const p = pts[i], q = i < 6 ? pts[0] : pts[i - 5]; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(p[0], p[1]); c.stroke(); }
      for (const [x, y] of pts) { c.beginPath(); c.arc(x, y, 16, 0, 7); c.fillStyle = '#26352c'; c.fill(); c.stroke(); c.fillStyle = '#ffd23f'; c.font = '20px sans-serif'; c.fillText('★', x - 9, y + 7); }
    }, 0x5c3a1e);
    return g;
  },
  xboard() {
    const g = new THREE.Group();
    chalkboard(g, 1.3, 0.9, (c, W, H) => {
      c.font = `900 34px ${FONT}`; c.fillText('店舗拡張', 24, 50);
      c.lineWidth = 3; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) c.strokeRect(40 + i * 72, 90 + j * 72, 66, 66);
      c.fillStyle = 'rgba(255,210,63,0.6)'; c.fillRect(184, 90, 138, 138); c.fillStyle = '#f2efe4'; c.font = `700 22px ${FONT}`; c.fillText('いまの売り場', 190, 260);
    }, 0x7a4a24);
    return g;
  },
  recycle() {
    const g = new THREE.Group(), green = C(0x2e7d4f, { r: 0.5, m: 0.25 });
    add(g, rbox(1.9, 1.05, 0.95, 0.04), green, 0, 0.12);
    add(g, T(box(1.94, 0.06, 1.0), 0, 1.17, 0, 0.08), C(0x25663f, { r: 0.45, m: 0.25 }));
    for (const [x, z] of [[-0.8, 0.35], [0.8, 0.35], [-0.8, -0.35], [0.8, -0.35]]) add(g, T(cyl(0.07, 0.07, 0.05, 12), 0, 0.07, 0, 0, 0, Math.PI / 2), C(0x1b1b1b, { r: 0.8 }), x, 0, z);
    const lbl = M(T(plane(0.5, 0.5), 0, 0.65), basic(canvasTex(128, 128, (c) => { c.fillStyle = '#2e7d4f'; c.fillRect(0, 0, 128, 128); emoji(c, '♻️', 64, 64, 96); })));
    lbl.position.z = 0.476; g.add(lbl);
    const lbl2 = M(T(plane(1.2, 0.22), 0, 0.3), basic(signTexture('空き箱リサイクル', { w: 512, h: 96, bg: '#2e7d4f', fg: '#fff' })));
    lbl2.position.z = 0.476; g.add(lbl2);
    return g;
  },
  opensign(f, ctx) {
    // 入口の看板（両面）。OPENで営業スタート
    const g = new THREE.Group(), open = ctx.phase === 'open', dark = DARK();
    add(g, T(cyl(0.2, 0.24, 0.05, 24), 0, 0.025), dark);
    add(g, T(cyl(0.025, 0.025, 1.0, 12), 0, 0.55), CHROME());
    const col = open ? '#16a34a' : '#d9314f';
    const face = SIGNFACE[open] ||= canvasTex(256, 192, (c) => {
      c.fillStyle = '#fffdf6'; rr(c, 4, 4, 248, 184, 26); c.fill();
      c.fillStyle = col; rr(c, 14, 14, 228, 164, 20); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4; c.setLineDash([10, 8]); rr(c, 24, 24, 208, 144, 14); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `900 ${open ? 76 : 58}px ${FONT}`; c.fillText(open ? 'OPEN' : 'CLOSED', 128, 112);
      c.font = `800 26px ${FONT}`; c.fillText(open ? '営業中' : '準備中', 128, 156);
    });
    add(g, T(rbox(0.66, 0.5, 0.05, 0.03), 0, 1.05), C(0x2b2f33, { r: 0.4, m: 0.5 }));
    for (const s of [1, -1]) {
      const p = M(T(plane(0.6, 0.45), 0, 1.3), basic(face)); p.position.z = s * 0.027; if (s < 0) p.rotation.y = Math.PI; g.add(p);
    }
    // 上のランプ
    add(g, T(sph(0.035, 10, 8), 0, 1.58), C(open ? 0x7dffa6 : 0xff8a8a, { r: 0.3, e: open ? 0x2bd46a : 0x6a1010 }));
    g.userData.phaseKey = open;
    return g;
  },
  shelf(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.shelf;
    shelfFrame(g, 2, 0.5, 1.78, ctx.color, 1);
    boards(g, def, ctx.color);
    return g;
  },
  gondola(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.gondola;
    shelfFrame(g, 2, 1, 1.78, ctx.color, 2);
    boards(g, def, ctx.color);
    // 端の装飾パネル
    for (const x of [-1.005, 1.005]) add(g, T(box(0.01, 0.9, 0.7), 0, 0.5), C(shade(ctx.color, 0.15)), x, 0, 0);
    return g;
  },
  bakery(f) {
    const g = new THREE.Group(), def = FIXTURES.bakery, w = WOOD();
    for (const x of [-0.72, 0.72]) add(g, box(0.06, 1.6, 0.5), w, x);
    add(g, T(box(1.5, 1.5, 0.03), 0, 0.05), w, 0, 0, -0.235);
    for (const s of def.slots) if (s.x < 0) {
      add(g, T(box(1.44, 0.03, 0.46), 0, s.y - 0.03), w);
      add(g, T(box(1.44, 0.05, 0.02), 0, s.y - 0.03), w, 0, 0, 0.23);
      // 籐かご
      for (const x of [-0.36, 0.36]) {
        const b = C(0xc8955c, { r: 0.85 });
        add(g, T(box(0.64, 0.012, 0.4), 0, s.y - 0.005), b, x, 0, 0);
        add(g, T(box(0.64, 0.05, 0.012), 0, s.y), b, x, 0, 0.2); add(g, T(box(0.64, 0.05, 0.012), 0, s.y), b, x, 0, -0.2);
      }
    }
    const aw = mat(0xffffff, { map: tex('stripes'), r: 0.7 }); aw.map.repeat.set(4, 1);
    add(g, T(box(1.64, 0.03, 0.42), 0, 1.62, 0.08, -0.35), aw);
    const sign = M(T(plane(0.9, 0.22), 0, 1.75, 0.0), basic(signTexture('BAKERY', { w: 512, h: 128, bg: '#7f4f24', fg: '#fff3d6', emojiL: '🥐', radius: 30 })));
    sign.position.z = -0.21; g.add(sign);
    return g;
  },
  fridge(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.fridge, body = C(0xf3f5f7, { r: 0.35, m: 0.2 });
    add(g, box(2, 0.16, 1), body);
    add(g, T(box(2, 2.12, 0.28), 0, 0, -0.36), body);
    for (const x of [-0.97, 0.97]) add(g, box(0.06, 2.12, 1), body, x);
    add(g, T(box(2, 0.3, 1), 0, 1.86), body);
    const glow = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, toneMapped: false });
    add(g, T(plane(1.86, 1.66), 0, 1.03, -0.219), glow);
    const head = M(T(plane(1.7, 0.2), 0, 2.01, 0.502), basic(signTexture('❄ つめた〜い ❄', { w: 1024, h: 128, bg: '#0b7bd6', fg: '#ffffff' })));
    g.add(head);
    for (const s of def.slots) if (s.x < 0) add(g, T(box(1.86, 0.018, 0.66), 0, s.y - 0.018), mat(0xffffff, { map: tex('wire'), r: 0.4, m: 0.5, t: true, op: 0.95 }), 0, 0, 0.05);
    for (const s of def.slots) if (s.x < 0) add(g, T(box(1.86, 0.04, 0.012), 0, s.y - 0.05), C(ctx.color), 0, 0, 0.385);
    for (const x of [-0.475, 0.475]) {
      add(g, T(box(0.93, 1.68, 0.02), 0, 0.17), glassMat(), x, 0, 0.475);
      const fr = DARK();
      add(g, T(box(0.95, 0.04, 0.03), 0, 0.15), fr, x, 0, 0.475); add(g, T(box(0.95, 0.04, 0.03), 0, 1.83), fr, x, 0, 0.475);
      add(g, T(box(0.03, 1.72, 0.03), 0, 0.15), fr, x - 0.46, 0, 0.475); add(g, T(box(0.03, 1.72, 0.03), 0, 0.15), fr, x + 0.46, 0, 0.475);
      add(g, T(box(0.025, 0.6, 0.04), 0, 0.75), CHROME(), x + (x < 0 ? 0.4 : -0.4), 0, 0.51);
    }
    return g;
  },
  freezer(f, ctx) {
    const g = new THREE.Group(), body = C(0xf6f8fa, { r: 0.35, m: 0.15 });
    add(g, box(1.88, 0.42, 0.88), mat(0xffffff, { map: tex('frost'), r: 0.4 }));
    add(g, box(2, 0.86, 0.06), body, 0, 0, 0.47); add(g, box(2, 0.86, 0.06), body, 0, 0, -0.47);
    for (const x of [-0.97, 0.97]) add(g, box(0.06, 0.86, 1), body, x);
    add(g, T(box(2.0, 0.12, 0.012), 0, 0.12), C(0x1e88e5), 0, 0, 0.505);
    add(g, T(box(2.0, 0.025, 0.014), 0, 0.33), C(ctx.color), 0, 0, 0.505);
    add(g, T(box(0.03, 0.4, 0.86), 0, 0.42), body);
    for (const x of [-0.48, 0.48]) add(g, T(box(0.94, 0.012, 0.9), 0, 0.875, 0, 0.04), glassMat(), x + (x < 0 ? 0 : 0), 0, 0);
    add(g, T(box(2.02, 0.03, 0.04), 0, 0.86), CHROME(), 0, 0, 0.49); add(g, T(box(2.02, 0.03, 0.04), 0, 0.86), CHROME(), 0, 0, -0.49);
    return g;
  },
  produce(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.produce, w = WOOD();
    add(g, box(1.98, 0.5, 0.98), C(0x5b8c3a, { r: 0.8 }));
    add(g, T(box(1.98, 0.28, 0.5), 0, 0.5), C(0x4e7a31, { r: 0.8 }), 0, 0, -0.24);
    for (const s of def.slots) {
      const y = s.y - 0.04;
      add(g, T(box(s.w + 0.04, 0.03, s.d + 0.04), 0, y), w, s.x, 0, s.z);
      for (const [dx, dz, ww, dd] of [[0, s.d / 2 + 0.01, s.w + 0.06, 0.025], [0, -s.d / 2 - 0.01, s.w + 0.06, 0.025], [s.w / 2 + 0.02, 0, 0.025, s.d + 0.04], [-s.w / 2 - 0.02, 0, 0.025, s.d + 0.04]])
        for (const yy of [0.02, 0.075]) add(g, T(box(ww, 0.04, dd), 0, y + yy), w, s.x + dx, 0, s.z + dz);
    }
    for (const x of [-0.95, 0.95]) add(g, cyl(0.025, 0.025, 1.9, 8), C(0x6b4423), x, 0, -0.45);
    const aw = mat(0xffffff, { map: tex('stripes'), r: 0.7, side: THREE.DoubleSide });
    add(g, T(box(2.1, 0.03, 0.7), 0, 1.86, 0.15, -0.3), aw, 0, 0, -0.15);
    const sign = M(T(plane(1.1, 0.26), 0, 1.62), basic(signTexture('とれたて青果', { w: 768, h: 192, bg: '#2d6a4f', fg: '#fff', emojiL: '🥕', radius: 40 })));
    sign.position.z = -0.44; g.add(sign);
    return g;
  },
  lowshelf(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.lowshelf;
    shelfFrame(g, 2, 0.5, 1.0, ctx.color, 1);
    boards(g, def, ctx.color);
    return g;
  },
  endcap(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.endcap;
    shelfFrame(g, 1.25, 0.75, 1.78, ctx.color, 1);
    boards(g, def, ctx.color, { w: 1.25 });
    // おすすめPOP（上部に大きなパネル）
    const pop = M(T(plane(1.1, 0.34), 0, 1.92), basic(signTexture('おすすめ！', { w: 768, h: 240, bg: ctx.color, fg: '#ffffff', emojiL: '⭐', radius: 40 })));
    pop.position.z = -0.33; g.add(pop);
    for (const x of [-0.58, 0.58]) add(g, T(cyl(0.012, 0.012, 0.36, 6), 0, 1.75), CHROME(), x, 0, -0.34);
    return g;
  },
  wallshelf(f, ctx) {
    const g = new THREE.Group(), def = FIXTURES.wallshelf;
    shelfFrame(g, 2, 0.5, 2.14, ctx.color, 1);
    boards(g, def, ctx.color);
    // 上の照明ボックス
    add(g, T(box(1.96, 0.08, 0.16), 0, 2.08), PAINT(0xf2f3f4), 0, 0, -0.14);
    add(g, T(plane(1.9, 0.04), 0, 2.07, 0, -Math.PI / 2 - 0.4), new THREE.MeshBasicMaterial({ color: 0xfff8e8, toneMapped: false }), 0, 0, -0.08);
    return g;
  },
  table(f, ctx) {
    // 平台：腰の高さの台に4つの枠。両側から取れる
    const g = new THREE.Group(), def = FIXTURES.table, w = WOOD();
    add(g, rbox(1.44, 0.72, 0.94, 0.02), w);
    for (const sd of [1, -1]) add(g, T(box(1.3, 0.34, 0.012), 0, 0.2), PAINT(ctx.color), 0, 0, sd * 0.475);
    add(g, T(rbox(1.5, 0.05, 1.0, 0.012), 0, 0.72), C(0x8b6a4a, { r: 0.6 }));
    for (const s of def.slots) {
      add(g, T(box(s.w, 0.06, 0.015), 0, s.y - 0.005), C(0xfafafa, { r: 0.4 }), s.x, 0, s.z + s.side * (s.d / 2 + 0.01));
      add(g, T(box(0.012, 0.05, s.d), 0, s.y - 0.005), C(0xfafafa, { r: 0.4 }), s.x + s.w / 2 + 0.01, 0, s.z);
    }
    add(g, T(box(1.36, 0.05, 0.015), 0, 0.77), C(0xfafafa, { r: 0.4 }));
    for (const [x, z] of [[-0.66, 0.42], [0.66, 0.42], [-0.66, -0.42], [0.66, -0.42]]) add(g, T(cyl(0.035, 0.035, 0.05, 10), 0, 0), DARK(), x, 0, z);
    return g;
  },
  wagon(f, ctx) {
    // 特売ワゴン：ワイヤーのカゴ＋キャスター＋特売POP
    const g = new THREE.Group(), wire = mat(0xffffff, { map: tex('wire'), r: 0.35, m: 0.6, t: true, op: 0.95, side: THREE.DoubleSide });
    const fr = CHROME();
    add(g, T(box(0.92, 0.012, 0.66), 0, 0.48), wire);
    for (const sd of [1, -1]) { add(g, T(box(0.92, 0.32, 0.01), 0, 0.48), wire, 0, 0, sd * 0.33); add(g, T(box(0.01, 0.32, 0.66), 0, 0.48), wire, sd * 0.46, 0, 0); }
    for (const sd of [1, -1]) { add(g, T(box(0.94, 0.02, 0.02), 0, 0.8), fr, 0, 0, sd * 0.33); add(g, T(box(0.02, 0.02, 0.68), 0, 0.8), fr, sd * 0.47, 0, 0); }
    for (const [x, z] of [[-0.44, 0.3], [0.44, 0.3], [-0.44, -0.3], [0.44, -0.3]]) {
      add(g, T(cyl(0.012, 0.012, 0.44, 6), 0, 0.06), fr, x, 0, z);
      add(g, T(cyl(0.04, 0.04, 0.03, 12), 0, 0.04, 0, 0, 0, Math.PI / 2), C(0x222222, { r: 0.8 }), x, 0, z);
    }
    add(g, T(cyl(0.01, 0.01, 0.55, 6), 0, 0.8), fr, 0.4, 0, -0.3);
    const pop = M(T(plane(0.42, 0.3), 0, 1.42), basic(signTexture('特売', { w: 512, h: 360, bg: '#e63946', fg: '#ffe066', radius: 50, emojiL: '🔥' }), { side: THREE.DoubleSide }));
    pop.position.x = 0.4; pop.position.z = -0.3; g.add(pop);
    void ctx;
    return g;
  },
  tiered(f, ctx) {
    // ひな壇：木の階段に木箱を並べた青果台
    const g = new THREE.Group(), def = FIXTURES.tiered, w = WOOD(), cloth = C(0x3e7b4f, { r: 0.85 });
    for (const [y, z] of [[0.3, 0.3], [0.62, 0], [0.94, -0.3]]) {
      add(g, T(box(1.48, y - 0.04, 0.34), 0, 0, z), cloth);
      add(g, T(box(1.5, 0.03, 0.36), 0, y - 0.05, z), w);
    }
    for (const s of def.slots) {
      const y = s.y - 0.03;
      for (const [dx, dz, ww, dd] of [[0, s.d / 2 + 0.01, s.w + 0.04, 0.02], [0, -s.d / 2 - 0.01, s.w + 0.04, 0.02], [s.w / 2 + 0.01, 0, 0.02, s.d], [-s.w / 2 - 0.01, 0, 0.02, s.d]])
        for (const yy of [0.02, 0.07]) add(g, T(box(ww, 0.035, dd), 0, y + yy), w, s.x + dx, 0, s.z + dz);
    }
    const sign = M(T(plane(1.0, 0.24), 0, 1.3), basic(signTexture('旬のおすすめ', { w: 768, h: 192, bg: '#2d6a4f', fg: '#fff', emojiL: '🍓', radius: 40 })));
    sign.position.z = -0.44; g.add(sign);
    for (const x of [-0.6, 0.6]) add(g, T(cyl(0.015, 0.015, 0.5, 6), 0, 0.95), C(0x6b4423), x, 0, -0.46);
    void ctx;
    return g;
  },
  reachin(f, ctx) {
    // ドリンク冷蔵庫：ガラス扉の縦型
    const g = new THREE.Group(), def = FIXTURES.reachin, body = C(0x2b2f36, { r: 0.35, m: 0.4 });
    add(g, box(1.5, 0.14, 0.8), body);
    add(g, T(box(1.5, 2.06, 0.08), 0, 0, -0.36), body);
    for (const x of [-0.72, 0.72]) add(g, box(0.06, 2.06, 0.8), body, x);
    add(g, T(box(1.5, 0.28, 0.8), 0, 1.92), body);
    const glow = new THREE.MeshBasicMaterial({ color: 0xf2f8ff, toneMapped: false });
    add(g, T(plane(1.36, 1.74), 0, 0.15, -0.318), glow);
    for (const x of [-0.69, 0.69]) add(g, T(box(0.02, 1.74, 0.02), 0, 0.15), glow, x * 0.97, 0, 0.3);
    for (const s of def.slots) if (s.x < 0) add(g, T(box(1.38, 0.018, 0.62), 0, s.y - 0.018), mat(0xffffff, { map: tex('wire'), r: 0.4, m: 0.5, t: true, op: 0.95 }), 0, 0, -0.02);
    for (const s of def.slots) if (s.x < 0) add(g, T(box(1.38, 0.035, 0.012), 0, s.y - 0.05), C(ctx.color), 0, 0, 0.3);
    for (const x of [-0.36, 0.36]) {
      add(g, T(box(0.7, 1.78, 0.02), 0, 0.13), glassMat(), x, 0, 0.39);
      const fr = C(0x1b1e22, { r: 0.4, m: 0.5 });
      add(g, T(box(0.72, 0.04, 0.03), 0, 0.12), fr, x, 0, 0.39); add(g, T(box(0.72, 0.04, 0.03), 0, 1.89), fr, x, 0, 0.39);
      add(g, T(box(0.03, 1.8, 0.03), 0, 0.12), fr, x - 0.35, 0, 0.39); add(g, T(box(0.03, 1.8, 0.03), 0, 0.12), fr, x + 0.35, 0, 0.39);
      add(g, T(box(0.025, 0.7, 0.04), 0, 0.7), CHROME(), x + (x < 0 ? 0.3 : -0.3), 0, 0.42);
    }
    const head = M(T(plane(1.3, 0.2), 0, 2.06), basic(signTexture('COLD DRINKS', { w: 1024, h: 160, bg: '#0b7bd6', fg: '#ffffff', emojiL: '🧊' })));
    head.position.z = 0.402; g.add(head);
    return g;
  },
  icebox(f, ctx) {
    // アイスBOX：小さな冷凍ストッカー（スライドするガラスのフタ）
    const g = new THREE.Group(), body = C(0xf6f8fa, { r: 0.35, m: 0.15 });
    add(g, box(1.1, 0.42, 0.62), mat(0xffffff, { map: tex('frost'), r: 0.4 }));
    for (const sd of [1, -1]) add(g, box(1.25, 0.84, 0.07), body, 0, 0, sd * 0.34);
    for (const sd of [1, -1]) add(g, box(0.07, 0.84, 0.75), body, sd * 0.59, 0, 0);
    const side = M(T(plane(1.0, 0.42), 0, 0.2), basic(signTexture('ICE CREAM', { w: 1024, h: 420, bg: '#4cc9f0', fg: '#ffffff', emojiL: '🍦', radius: 60 })));
    side.position.z = 0.376; g.add(side);
    for (const x of [-0.29, 0.29]) add(g, T(box(0.58, 0.012, 0.66), 0, 0.86, 0, 0.03), glassMat(), x);
    add(g, T(box(1.26, 0.03, 0.04), 0, 0.84), CHROME(), 0, 0, 0.36); add(g, T(box(1.26, 0.03, 0.04), 0, 0.84), CHROME(), 0, 0, -0.36);
    add(g, T(box(1.25, 0.03, 0.012), 0, 0.72), C(ctx.color), 0, 0, 0.376);
    return g;
  },
  rack(f) { return storageRack(2, [0.08, 0.74, 1.4], [-1, 1], 2.05); },
  bigrack(f) { return storageRack(3, [0.08, 0.62, 1.16, 1.7], [-1.5, 0, 1.5], 2.3); },
  checkout(f, ctx) {
    const g = new THREE.Group();
    const body = C(0xf2efe9, { r: 0.5 });
    add(g, T(rbox(0.8, 0.84, 2.46, 0.03), 0, 0), body);
    add(g, T(box(0.015, 0.55, 2.3), 0, 0.12), C(ctx.color), 0.405);
    add(g, T(box(0.82, 0.03, 2.48), 0, 0.84), C(0x9aa3ad, { r: 0.3, m: 0.6 }));
    const belt = mat(0xffffff, { map: getBeltTex(), r: 0.8 });
    add(g, T(box(0.48, 0.02, 1.3), 0, 0.87), belt, 0.08, 0, 0.55);
    for (const x of [-0.18, 0.34]) add(g, T(box(0.03, 0.05, 1.32), 0, 0.86), CHROME(), x, 0, 0.55);
    // スキャナー
    add(g, T(box(0.4, 0.012, 0.26), 0, 0.875), C(0x111418, { r: 0.1, m: 0.3 }), 0.08, 0, -0.3);
    add(g, T(plane(0.3, 0.16), 0, 0.882, 0, -Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, toneMapped: false }), 0.08, 0, -0.3);
    add(g, T(box(0.36, 0.16, 0.05), 0, 0.86), C(0x22262b, { r: 0.3 }), 0.08, 0, -0.45);
    // 袋詰め台
    add(g, T(box(0.6, 0.015, 0.55), 0, 0.8), C(0xcfd4da, { m: 0.5, r: 0.3 }), 0.05, 0, -0.95);
    add(g, T(box(0.25, 0.22, 0.15), 0, 0.85), C(0xffffff, { r: 0.9 }), 0.2, 0, -1.05);
    // レジ本体と画面
    add(g, T(cyl(0.025, 0.03, 0.35, 8), 0, 0.85), DARK(), -0.25, 0, -0.55);
    add(g, T(box(0.36, 0.1, 0.3), 0, 0.85), C(0x2b2f36, { r: 0.4 }), -0.22, 0, -0.85);
    const scr = new THREE.Group();
    add(scr, T(box(0.32, 0.24, 0.04), 0, -0.12), C(0x22262b), 0, 0, 0);
    const sm = M(T(plane(0.28, 0.2), 0, 0, 0.021), basic(tex('screenReg')));
    scr.add(sm); scr.position.set(-0.25, 1.3, -0.55); scr.rotation.y = -Math.PI / 2; scr.rotation.x = -0.15; g.add(scr);
    // カード端末（お客さん側）
    add(g, T(box(0.09, 0.13, 0.05), 0, 0.86, 0, -0.5), C(0x1d1f23), 0.33, 0, -0.62);
    // 引き出しとレーン番号灯
    add(g, T(box(0.02, 0.18, 0.4), 0, 0.5), DARK(), -0.405, 0, -0.6);
    add(g, cyl(0.025, 0.025, 1.85, 8), CHROME(), 0.3, 0, -1.18);
    const lamp = M(T(new THREE.BoxGeometry(0.24, 0.24, 0.24), 0, 1.97), basic(signTexture(String(ctx.lane || 1), { w: 128, h: 128, bg: ctx.color, fg: '#fff', radius: 20 })));
    lamp.position.set(0.3, 0, -1.18); g.add(lamp);
    return g;
  },
  selfcheckout(f, ctx) {
    const g = new THREE.Group();
    add(g, T(rbox(0.62, 0.88, 0.5, 0.04), 0, 0), C(0xf3f3f3, { r: 0.4 }), 0, 0, -0.12);
    add(g, T(box(0.64, 0.02, 0.52), 0, 0.88), C(0x2b2f36, { r: 0.3 }), 0, 0, -0.12);
    add(g, T(plane(0.3, 0.2), 0, 0.892, 0, -Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.5, toneMapped: false }), -0.08, 0, -0.05);
    add(g, T(box(0.6, 0.06, 0.012), 0, 0.7), C(ctx.color), 0, 0, 0.135);
    const scr = new THREE.Group();
    add(scr, box(0.42, 0.32, 0.05), C(0x22262b));
    const sm = M(T(plane(0.38, 0.28), 0, 0.16, 0.026), basic(tex('screenSelf'))); scr.add(sm);
    scr.position.set(0, 1.05, -0.3); scr.rotation.x = -0.35; g.add(scr);
    add(g, cyl(0.03, 0.03, 0.2, 8), DARK(), 0, 0.88, -0.3);
    // 袋スタンド
    add(g, T(box(0.32, 0.02, 0.32), 0, 0.7), CHROME(), 0.44, 0, 0.0);
    add(g, T(box(0.26, 0.25, 0.2), 0, 0.72), C(0xffffff, { r: 0.9 }), 0.44, 0, 0.0);
    add(g, cyl(0.02, 0.02, 1.6, 8), CHROME(), -0.42, 0, -0.3);
    add(g, T(sph(0.07, 12, 8), 0, 1.65), new THREE.MeshBasicMaterial({ color: 0x48ff88, toneMapped: false }), -0.42, 0, -0.3);
    return g;
  },
  pc(f) {
    const g = new THREE.Group(), w = WOOD();
    add(g, T(box(1.45, 0.04, 0.72), 0, 0.74), w, 0, 0, -0.12);
    for (const [x, z] of [[-0.68, -0.44], [0.68, -0.44], [-0.68, 0.2], [0.68, 0.2]]) add(g, box(0.05, 0.74, 0.05), DARK(), x, 0, z);
    add(g, T(box(0.5, 0.06, 0.6), 0, 0.5), w, 0.45, 0, -0.12);
    const mon = new THREE.Group();
    add(mon, T(box(0.62, 0.4, 0.04), 0, 0), C(0x1d1f23));
    mon.add(M(T(plane(0.58, 0.36), 0, 0.2, 0.021), basic(tex('screenPC'))));
    mon.position.set(0, 0.95, -0.32); mon.rotation.x = -0.08; g.add(mon);
    add(g, T(cyl(0.02, 0.02, 0.18, 8), 0, 0.77), DARK(), 0, 0, -0.34);
    add(g, T(box(0.22, 0.012, 0.16), 0, 0.77), DARK(), 0, 0, -0.34);
    add(g, T(rbox(0.44, 0.02, 0.14, 0.008), 0, 0.77), C(0x2b2f36), 0, 0, -0.02);
    add(g, T(rbox(0.06, 0.025, 0.09, 0.01), 0, 0.77), C(0x2b2f36), 0.33, 0, -0.02);
    add(g, T(cyl(0.04, 0.035, 0.1, 12), 0, 0.77), C(0xffffff, { r: 0.3 }), -0.5, 0, -0.1);
    add(g, T(box(0.21, 0.004, 0.29), 0, 0.775, 0, 0, 0.3), C(0xffffff, { r: 0.95 }), -0.35, 0, -0.25);
    // 椅子
    const ch = new THREE.Group();
    add(ch, T(cyl(0.24, 0.24, 0.08, 16), 0, 0.46), C(0x30343a));
    add(ch, T(rbox(0.44, 0.48, 0.07, 0.03), 0, 0.55), C(0x30343a), 0, 0, 0.23);
    add(ch, cyl(0.03, 0.03, 0.46, 8), CHROME());
    for (let i = 0; i < 5; i++) add(ch, T(box(0.04, 0.03, 0.28), 0, 0.04, 0.14, 0, i * 1.2566), CHROME());
    ch.position.set(0.05, 0, 0.42); ch.rotation.y = 0.25; g.add(ch);
    const board = M(T(plane(1.1, 0.6), 0, 1.6), basic(canvasTex(256, 140, (c, W, H) => {
      c.fillStyle = '#b5835a'; c.fillRect(0, 0, W, H);
      const notes = [['#fff59d', '発注'], ['#b3e5fc', 'シフト'], ['#f8bbd0', '目標'], ['#c8e6c9', '新商品']];
      notes.forEach(([col, t], i) => { c.save(); c.translate(30 + i * 60, 50 + (i % 2) * 30); c.rotate((i - 1.5) * 0.1); c.fillStyle = col; c.fillRect(-24, -24, 48, 48); c.fillStyle = '#333'; c.font = `700 12px ${FONT}`; c.textAlign = 'center'; c.fillText(t, 0, 4); c.fillStyle = '#e53935'; c.beginPath(); c.arc(0, -18, 4, 0, 7); c.fill(); c.restore(); });
    })));
    board.position.z = -0.48; g.add(board);
    return g;
  },
  plant(f) {
    const g = new THREE.Group();
    add(g, lathe([[0, 0], [0.15, 0], [0.2, 0.38], [0.22, 0.4], [0.22, 0.43], [0, 0.43]], 16), C(0xc4693d, { r: 0.8 }));
    add(g, T(cyl(0.19, 0.19, 0.02, 16), 0, 0.4), C(0x4a3424, { r: 1 }));
    const leaf = [C(0x2f7d32, { r: 0.55 }), C(0x43a047, { r: 0.55 }), C(0x1b5e20, { r: 0.55 })];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39, t = 0.35 + (i % 4) * 0.12, len = 0.55 + (i % 3) * 0.15;
      add(g, T(cyl(0.008, 0.01, len, 5), 0, 0.42, 0, Math.cos(a) * t, 0, Math.sin(a) * t), C(0x3b6e2b));
      const tx = Math.cos(a) * t, tz = Math.sin(a) * t;
      const tip = [-len * Math.sin(tz), 0.42 + len * Math.cos(tz) * Math.cos(tx), len * Math.cos(tz) * Math.sin(tx)];
      add(g, T(sph(0.13, 10, 6), tip[0], tip[1], tip[2], 0.4, a, 0, 1, 0.18, 0.62), leaf[i % 3]);
    }
    return g;
  },
  trash(f) {
    const g = new THREE.Group();
    add(g, cyl(0.2, 0.18, 0.7, 16), C(0x5d7a6b, { r: 0.5, m: 0.2 }));
    add(g, T(sph(0.205, 16, 8), 0, 0.7, 0, 0, 0, 0, 1, 0.35, 1), C(0x4b6457, { r: 0.5, m: 0.2 }));
    add(g, T(box(0.18, 0.03, 0.02), 0, 0.74), C(0x111111), 0, 0, 0.17);
    const lbl = M(T(plane(0.22, 0.22), 0, 0.36), basic(canvasTex(128, 128, (c) => { c.fillStyle = '#5d7a6b'; c.fillRect(0, 0, 128, 128); emoji(c, '♻️', 64, 64, 80); })));
    lbl.position.z = 0.195; g.add(lbl);
    return g;
  },
  dumpster() {
    // 大型ゴミ箱（キャスター付きの金属コンテナ、フタは半分開き）
    const g = new THREE.Group(), body = C(0x2f6f4f, { r: 0.45, m: 0.35 }), dark = C(0x1f4a35, { r: 0.5, m: 0.35 });
    for (const z of [-0.4, 0.4]) add(g, T(box(1.42, 0.86, 0.035), 0, 0.12, z), body);
    for (const x of [-0.69, 0.69]) add(g, T(box(0.035, 0.86, 0.8), x, 0.12, 0), body);
    add(g, T(box(1.36, 0.03, 0.76), 0, 0.12), dark);
    for (const z of [-0.43, 0.43]) add(g, T(box(1.5, 0.06, 0.05), 0, 0.95, z), dark);
    for (const x of [-0.72, 0.72]) add(g, T(box(0.05, 0.06, 0.9), x, 0.95, 0), dark);
    for (let i = 0; i < 4; i++) add(g, T(box(0.04, 0.6, 0.012), -0.45 + i * 0.3, 0.3, 0.42), dark);
    // フタ（奥側は閉じて手前は跳ね上げ）
    add(g, T(box(0.74, 0.03, 0.88), -0.37, 1.0, 0, 0, 0, 0.05), C(0x24543c, { r: 0.4, m: 0.3 }));
    const lid = T(box(0.74, 0.03, 0.88), 0.37, 0, 0, 0, 0, 0); lid.rotateZ(-1.0); lid.translate(0.02, 1.0, 0); add(g, lid, C(0x24543c, { r: 0.4, m: 0.3 }));
    // 中の段ボール
    for (const [x, z, r] of [[-0.3, -0.1, 0.3], [0.25, 0.12, -0.5], [0.0, -0.15, 1.2]]) add(g, T(box(0.5, 0.05, 0.36), x, 0.7, z, 0.2, r, 0.15), C(0xb8895a, { r: 0.9 }));
    for (const [x, z] of [[-0.6, 0.33], [0.6, 0.33], [-0.6, -0.33], [0.6, -0.33]]) { add(g, T(cyl(0.05, 0.05, 0.04, 12), 0, 0.05, 0, 0, 0, Math.PI / 2), C(0x161616, { r: 0.8 }), x, 0, z); add(g, T(box(0.06, 0.06, 0.06), x, 0.08, z), DARK()); }
    const lbl = M(T(plane(0.62, 0.22), 0, 0.62), basic(signTexture('🗑️ ダンボール', { w: 512, h: 160, bg: '#ffffff', fg: '#1f4a35', radius: 20 })));
    lbl.position.z = 0.425; g.add(lbl);
    return g;
  },
  basket(f) {
    const g = new THREE.Group(), red = C(0xe53935, { r: 0.45 });
    add(g, box(0.48, 0.06, 0.4), DARK());
    for (let i = 0; i < 6; i++) {
      const y = 0.06 + i * 0.07;
      add(g, T(box(0.44, 0.012, 0.32), 0, y), red);
      for (const [x, z, w, d] of [[0, 0.16, 0.44, 0.012], [0, -0.16, 0.44, 0.012], [0.22, 0, 0.012, 0.32], [-0.22, 0, 0.012, 0.32]]) add(g, T(box(w, 0.2, d), 0, y), red, x, 0, z);
    }
    for (const z of [-0.08, 0.08]) add(g, T(torus(0.12, 0.008, 6, 12, Math.PI), 0, 0.5, 0), C(0x333333), 0, 0, z);
    return g;
  },
  bench(f) {
    const g = new THREE.Group(), w = WOOD();
    for (let i = 0; i < 3; i++) add(g, T(box(1.45, 0.035, 0.11), 0, 0.42), w, 0, 0, -0.14 + i * 0.13);
    for (let i = 0; i < 2; i++) add(g, T(box(1.45, 0.1, 0.03), 0, 0.58 + i * 0.15, 0, 0.15), w, 0, 0, -0.22);
    for (const x of [-0.6, 0.6]) { add(g, box(0.05, 0.42, 0.42), DARK(), x); add(g, T(box(0.05, 0.4, 0.04), 0, 0.45, 0, 0.15), DARK(), x, 0, -0.22); }
    return g;
  },
  vending(f, ctx) {
    const g = new THREE.Group();
    add(g, rbox(0.95, 1.85, 0.6, 0.04), C(ctx.color, { r: 0.35 }));
    const fp = M(T(plane(0.62, 1.25), 0, 1.15), basic(tex('vending')));
    fp.position.set(-0.1, 0, 0.301); g.add(fp);
    add(g, T(box(0.18, 0.5, 0.02), 0, 0.9), C(0x22262b), 0.34, 0, 0.3);
    add(g, T(box(0.62, 0.16, 0.04), 0, 0.2), C(0x111111), -0.1, 0, 0.29);
    add(g, T(plane(0.6, 0.12), 0, 1.65), basic(signTexture('つめた〜い', { w: 512, h: 96, bg: '#1565c0', fg: '#fff' })), -0.1, 0, 0.302);
    return g;
  },
  gumball(f) {
    const g = new THREE.Group();
    add(g, cyl(0.12, 0.18, 0.7, 14), C(0xd62828, { r: 0.3, m: 0.2 }));
    add(g, T(box(0.2, 0.16, 0.2), 0, 0.7), C(0xc0c4ca, { m: 0.8, r: 0.25 }));
    const cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6'];
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4, r = 0.03 + (i % 5) * 0.025, y = 0.92 + (i % 7) * 0.025;
      add(g, vcolor(T(sph(0.025, 8, 6), Math.cos(a) * r, y, Math.sin(a) * r), cols[i % 6]), mat(0xffffff, { vc: true, r: 0.25 }));
    }
    add(g, T(sph(0.17, 18, 12), 0, 1.02), glassMat());
    add(g, T(cyl(0.06, 0.08, 0.06, 12), 0, 1.17), C(0xd62828, { r: 0.3 }));
    add(g, T(cyl(0.035, 0.035, 0.02, 12), 0, 0.77, 0, Math.PI / 2), CHROME(), 0, 0, 0.1);
    return g;
  },
  flower(f) {
    const g = new THREE.Group();
    add(g, box(0.98, 0.32, 0.46), WOOD());
    add(g, T(box(0.92, 0.02, 0.4), 0, 0.31), C(0x4a3424, { r: 1 }));
    const cols = [0xff595e, 0xffca3a, 0xff70a6, 0xffffff, 0x9b5de5, 0xff924c];
    for (let i = 0; i < 14; i++) {
      const x = -0.4 + (i % 7) * 0.13 + (i > 6 ? 0.06 : 0), z = i > 6 ? 0.08 : -0.08, h = 0.2 + (i % 3) * 0.06;
      add(g, T(cyl(0.006, 0.006, h, 4), 0, 0.32), C(0x2d6a4f), x, 0, z);
      add(g, T(sph(0.035, 8, 6), 0, 0.32 + h, 0, 0, 0, 0, 1, 0.7, 1), C(cols[i % 6], { r: 0.5 }), x, 0, z);
      add(g, T(sph(0.012, 6, 4), 0, 0.345 + h), C(0xffd166), x, 0, z);
      add(g, T(sph(0.03, 6, 4), 0.02, 0.32 + h * 0.4, 0, 0, 0, 0.5, 1, 0.3, 0.6), C(0x52b788), x, 0, z);
    }
    return g;
  },
  signstand(f) {
    const g = new THREE.Group(), w = WOOD();
    const t = signTexture(f.tx || '', { w: 256, h: 320, chalk: true });
    for (const s of [1, -1]) {
      const p = new THREE.Group();
      add(p, T(box(0.46, 0.72, 0.03), 0, 0), w);
      p.add(M(T(plane(0.4, 0.58), 0, 0.37, 0.016), basic(t)));
      p.position.set(0, 0.05, s * 0.12); p.rotation.y = s > 0 ? 0 : Math.PI; p.rotation.x = s > 0 ? -0.22 : 0.22;
      g.add(p);
    }
    return g;
  },
  banner(f, ctx) {
    const g = new THREE.Group();
    add(g, cyl(0.18, 0.2, 0.04, 16), DARK());
    add(g, cyl(0.025, 0.025, 2.65, 8), CHROME());
    add(g, T(box(0.7, 0.03, 0.03), 0, 2.6), CHROME(), 0.0, 0, 0);
    const t = signTexture(f.tx || '', { w: 512, h: 192, bg: f.c && f.c !== '#ffffff' ? f.c : ctx.color, fg: '#ffffff', radius: 30 });
    const board = new THREE.Group();
    add(board, box(0.9, 0.34, 0.03), C(0xffffff));
    board.add(M(T(plane(0.86, 0.32), 0, 0.17, 0.016), basic(t)));
    const back = M(T(plane(0.86, 0.32), 0, 0.17, -0.016, 0, Math.PI), basic(t)); board.add(back);
    board.position.y = 2.16; g.add(board);
    for (const x of [-0.3, 0.3]) add(g, T(cyl(0.004, 0.004, 0.1, 4), 0, 2.5), DARK(), x);
    return g;
  },
  // 天井から吊るす両面の看板
  hangsign(f, ctx) {
    const g = new THREE.Group();
    const W = 1.4, H = 0.46, y0 = 2.5, top = 3.8;
    const bg = f.c && f.c !== '#ffffff' ? f.c : ctx.color;
    const t = signTexture(f.tx || '', { w: 768, h: 256, bg, fg: '#ffffff', radius: 36 });
    const board = new THREE.Group();
    add(board, rbox(W + 0.06, H + 0.06, 0.04, 0.02), C(0xf6f6f6, { r: 0.45 }));
    board.add(M(T(plane(W, H), 0, H / 2 + 0.03, 0.0215), basic(t)));
    board.add(M(T(plane(W, H), 0, H / 2 + 0.03, -0.0215, 0, Math.PI), basic(t)));
    add(board, T(box(W + 0.12, 0.03, 0.05), 0, H + 0.06), CHROME());
    board.position.y = y0; g.add(board);
    const wireY = y0 + H + 0.09, len = top - wireY;
    for (const x of [-W * 0.36, W * 0.36]) {
      add(g, T(cyl(0.004, 0.004, len, 4), 0, wireY), DARK(), x);
      add(g, T(cyl(0.035, 0.035, 0.02, 10), 0, top - 0.02), CHROME(), x); // 天井の金具
      add(g, T(torus(0.012, 0.003, 4, 8), 0, wireY + 0.01, 0, 0, Math.PI / 2), CHROME(), x); // 吊り金具
    }
    return g;
  },
  neon(f) {
    const g = new THREE.Group();
    for (const x of [-0.4, 0.4]) add(g, box(0.04, 1.5, 0.04), DARK(), x, 0, -0.05);
    add(g, T(rbox(0.96, 0.5, 0.06, 0.02), 0, 1.1), C(0x15151a, { r: 0.3 }), 0, 0, -0.05);
    const col = f.c || '#ff4fd8';
    const t = signTexture(f.tx || '', { w: 512, h: 256, bg: null, fg: '#ffffff', glow: col, stroke: col });
    g.add(M(T(plane(0.92, 0.46), 0, 1.12, -0.015), basic(t, { t: true })));
    add(g, T(box(0.5, 0.04, 0.3), 0, 0), DARK(), 0, 0, -0.05);
    return g;
  },
};

function storageRack(w, levels, posts, h) {
  const g = new THREE.Group();
  const up = C(0x2f6db5, { r: 0.45, m: 0.3 }), beam = C(0xf28c28, { r: 0.45, m: 0.3 }), deck = mat(0xffffff, { map: tex('wire'), r: 0.4, m: 0.5, t: true, op: 0.95 });
  for (const x of posts) for (const z of [-0.22, 0.22]) add(g, box(0.06, h, 0.06), up, x * 0.98, 0, z);
  for (const x of posts) for (let y = 0.25; y < h; y += 0.45) add(g, T(box(0.03, 0.03, 0.42), 0, y, 0, 0.35), up, x * 0.98, 0, 0);
  for (const y of levels) {
    for (const z of [-0.22, 0.22]) add(g, T(box(w, 0.07, 0.05), 0, y - 0.07), beam, 0, 0, z);
    add(g, T(box(w - 0.04, 0.015, 0.44), 0, y - 0.02), deck);
  }
  add(g, T(box(w, 0.07, 0.05), 0, h - 0.07), beam, 0, 0, 0.22); add(g, T(box(w, 0.07, 0.05), 0, h - 0.07), beam, 0, 0, -0.22);
  return g;
}

export function buildFixture(f, ctx) {
  const fn = BUILD[f.t];
  return fn ? fn(f, ctx) : new THREE.Group();
}
