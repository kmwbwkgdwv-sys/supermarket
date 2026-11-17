// ===== ジオメトリ・マテリアルの共通ヘルパー =====
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const Q = { lite: false };
const matCache = new Map();
// 色や質感からマテリアルを共有キャッシュで取得
export function mat(color, o = {}) {
  const key = JSON.stringify([color, o.r, o.m, o.e, o.ei, o.t, o.op, o.map?.uuid, o.side, o.vc, o.flat, o.dw, o.nm?.uuid, o.rm?.uuid, o.ns, o.env]);
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: color ?? 0xffffff, roughness: o.r ?? 0.6, metalness: o.m ?? 0,
    emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    transparent: !!o.t, opacity: o.op ?? 1, map: o.map || null,
    side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc, flatShading: !!o.flat,
    depthWrite: o.dw ?? !o.t,
  });
  if (o.nm) { m.normalMap = o.nm; m.normalScale.set(o.ns ?? 1, o.ns ?? 1); }
  if (o.rm) m.roughnessMap = o.rm;
  if (o.env != null) m.envMapIntensity = o.env;
  m.userData.key = key; m.userData.metal = m.metalness; m.userData.plain = !o.map && !o.nm && !o.rm && !o.t && !o.vc && !o.e;
  if (Q.lite) m.metalness = m.metalness * 0.25;
  matCache.set(key, m);
  return m;
}
// 質感セット（surf()の戻り値）からマテリアル
export function smat(set, color = 0xffffff, o = {}) { return mat(color, { ...o, map: set.map, nm: set.normalMap, rm: set.roughnessMap }); }
// 軽量モードでは環境マップを使わないので金属感を弱める
export function setLiteMaterials(lite) {
  Q.lite = lite;
  for (const m of matCache.values()) { m.metalness = lite ? (m.userData.metal || 0) * 0.25 : (m.userData.metal || 0); m.needsUpdate = true; }
}
export const glassMat = () => mat(0xd8f0ff, { r: 0.05, m: 0.1, t: true, op: 0.22 });

// 変形してから返す
export function T(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}
// 底面が y=0 の箱/角丸箱/円柱
export const box = (w, h, d) => T(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
export function rbox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return T(new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 0.0005)), 0, h / 2, 0);
}
export const cyl = (rt, rb, h, seg = 16, open = false, ts = Math.PI, tl = Math.PI * 2) => T(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl), 0, h / 2, 0);
export const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
export const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, Math.PI);
export const plane = (w, h) => new THREE.PlaneGeometry(w, h);
export const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const cone = (r, h, seg = 12) => T(new THREE.ConeGeometry(r, h, seg), 0, h / 2, 0);

// 面ごとに実寸でUVを振り直す（壁などのテクスチャが引き伸ばされないように）。tu/tv = テクスチャ1枚の大きさ(m)
export function wuv(g, tu = 1, tv = tu) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  if (!nor || !uv) return g;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / tu, z / tu);
    else if (nx >= nz) uv.setXY(i, z / tu, y / tv);
    else uv.setXY(i, x / tu, y / tv);
  }
  uv.needsUpdate = true;
  return g;
}
// 頂点カラーを付与
export function vcolor(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function vgrad(g, c0, c1, y0, y1) {
  const a = new THREE.Color(c0), b = new THREE.Color(c1), pos = g.attributes.position, n = pos.count, arr = new Float32Array(n * 3), t = new THREE.Color();
  for (let i = 0; i < n; i++) { const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0))); t.copy(a).lerp(b, k); arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// 属性をそろえて結合（index無し・position/normal/uv[/color]）
export function merge(geos, withColor = false) {
  const list = geos.map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.normal) x.computeVertexNormals();
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
    if (withColor && !x.attributes.color) vcolor(x, 0xffffff);
    if (!withColor && x.attributes.color) x.deleteAttribute('color');
    x.clearGroups();
    return x;
  });
  return mergeGeometries(list, false);
}

// パーツ配列 [{g, m}] をマテリアルごとに結合
export function bakeParts(parts) {
  const by = new Map();
  for (const p of parts) { const k = p.m.uuid; if (!by.has(k)) by.set(k, { m: p.m, gs: [] }); by.get(k).gs.push(p.g); }
  return [...by.values()].map(({ m, gs }) => ({ m, g: merge(gs, !!m.vertexColors) }));
}

// Groupの中のメッシュを結合して描画回数を減らす。
// 単色の質感は「粗さ・金属感」が同じものを頂点カラーでまとめて1回で描く
export function bakeGroup(group, { keep = () => false, vc = true } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map(), kept = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (keep(o)) { kept.push(o); return; }
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let m = o.material, k = m.uuid;
    if (vc && m.isMeshStandardMaterial && m.userData.plain) {
      const r = Math.round(m.roughness * 20) / 20, mt = Math.round((m.userData.metal ?? m.metalness) * 20) / 20;
      vcolor(g, m.color);
      m = mat('#ffffff', { r, m: mt, vc: true, side: m.side, flat: m.flatShading || undefined });
      k = m.uuid;
    }
    if (!by.has(k)) by.set(k, { m, gs: [], cast: o.castShadow });
    by.get(k).gs.push(g);
  });
  const out = new THREE.Group();
  out.name = group.name;
  for (const { m, gs, cast } of by.values()) {
    const mesh = new THREE.Mesh(merge(gs, !!m.vertexColors), m);
    mesh.castShadow = cast !== false; mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const o of kept) {
    const wm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.parent.remove(o);
    wm.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

// 簡易メッシュ生成
export function M(g, m, cast = true) { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; }
export function add(parent, g, m, x = 0, y = 0, z = 0, ry = 0) { const o = M(g, m); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }
