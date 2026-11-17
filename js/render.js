// ===== 描画：店の状態 → 3Dシーン =====
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FIXTURES, PRODUCTS, BOX_SIZES, slotPositions, marketPrice, tagLocal } from './data.js';
import { buildFixture, getBeltTex } from './models/fixtures.js';
import { productParts, productMesh } from './models/products.js';
import { Character, randomAvatar } from './models/character.js';
import { World } from './models/world.js';
import { bakeGroup, mat, setLiteMaterials, Q } from './models/geo.js';
import { boxAtlas, priceTagTexture, setAniso, setTexQuality, tex, canvasTex, rr, FONT } from './textures.js';
import { angleLerp, lerp } from './util.js';
import { getPrice, priceLimit } from './sim.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
function fixMatrix(f) { return new THREE.Matrix4().compose(new THREE.Vector3(f.x, 0, f.z), new THREE.Quaternion().setFromAxisAngle(UP, f.r * Math.PI / 2), new THREE.Vector3(1, 1, 1)); }

// 商品をまとめて描画するインスタンス管理
class Instancer {
  constructor(root, makeParts, { cast = false } = {}) { this.root = root; this.make = makeParts; this.cast = cast; this.map = new Map(); }
  begin() { for (const e of this.map.values()) e.list.length = 0; }
  push(key, matrix, id) {
    let e = this.map.get(key);
    if (!e) { e = { list: [], ids: [], meshes: [], cap: 0 }; this.map.set(key, e); }
    e.list.push(matrix.clone()); e.ids[e.list.length - 1] = id;
  }
  end() {
    for (const [key, e] of this.map) {
      const n = e.list.length;
      if (n > e.cap) {
        for (const m of e.meshes) { this.root.remove(m); m.dispose(); }
        e.cap = Math.max(8, Math.ceil(n * 1.5));
        e.meshes = this.make(key).map(({ g, m }) => {
          const im = new THREE.InstancedMesh(g, m, e.cap);
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.castShadow = this.cast; im.receiveShadow = false; im.frustumCulled = false;
          im.userData.inst = e; im.userData.key = key;
          this.root.add(im);
          return im;
        });
      }
      for (const im of e.meshes) {
        for (let i = 0; i < n; i++) im.setMatrixAt(i, e.list[i]);
        im.count = n; im.visible = n > 0;
        im.instanceMatrix.needsUpdate = true;
        im.boundingSphere = null; // レイキャスト用に再計算させる
      }
    }
  }
}

const boxGeoCache = {};
function boxGeo(bx) {
  if (boxGeoCache[bx]) return boxGeoCache[bx];
  const [w, h, d] = BOX_SIZES[bx];
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setY(i, f === 2 || f === 3 ? uv.getY(i) * 0.5 : 0.5 + uv.getY(i) * 0.5);
  }
  return (boxGeoCache[bx] = g);
}

// 開いた段ボール：上面なし＋内側＋外に開いたフタ4枚
const openGeoCache = {};
function openBoxParts(pid) {
  const p = PRODUCTS[pid], bx = p.bx;
  let geo = openGeoCache[bx];
  if (!geo) {
    const [w, h, d] = BOX_SIZES[bx];
    const outer = boxGeo(bx).clone();
    const idx = Array.from(outer.index.array); idx.splice(12, 6); outer.setIndex(idx); outer.clearGroups();
    const inner = new THREE.BoxGeometry(w - 0.012, h - 0.006, d - 0.012); inner.translate(0, (h - 0.006) / 2 + 0.004, 0);
    const ii = Array.from(inner.index.array); ii.splice(12, 6); inner.setIndex(ii); inner.clearGroups();
    const t = 0.004, fl = [];
    const flap = (gw, gd, ox, oz, rx, rz, x, z) => { const g = new THREE.BoxGeometry(gw, t, gd); g.translate(ox, 0, oz); g.rotateX(rx); g.rotateZ(rz); g.translate(x, h, z); fl.push(g); };
    flap(w - 0.004, d / 2, 0, d / 4, 1.15, 0, 0, d / 2);      // 手前：外へ垂れる
    flap(w - 0.004, d / 2, 0, -d / 4, -1.15, 0, 0, -d / 2);   // 奥
    flap(w / 2 * 0.92, d - 0.004, w / 4 * 0.92, 0, 0, 0.35, w / 2, 0);   // 右：少し上向き
    flap(w / 2 * 0.92, d - 0.004, -w / 4 * 0.92, 0, 0, -0.35, -w / 2, 0); // 左
    geo = openGeoCache[bx] = { outer, inner, flaps: mergeFlat(fl) };
  }
  return [
    { g: geo.outer, m: mat(0xffffff, { map: boxAtlas(p), r: 0.85 }) },
    { g: geo.inner, m: mat(0x9c7444, { r: 0.95, side: THREE.BackSide }) },
    { g: geo.flaps, m: mat(0xc99a62, { r: 0.9 }) },
  ];
}
function mergeFlat(list) {
  const pos = [], nor = [], uv = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
// 開いた段ボールの中の商品の並べ方（下の段から）
const inBoxCache = {};
function inBoxLayout(pid) {
  if (inBoxCache[pid]) return inBoxCache[pid];
  const p = PRODUCTS[pid], [w, h, d] = BOX_SIZES[p.bx];
  const iw = w - 0.03, id = d - 0.03;
  let [pw, ph, pd] = p.size, yaw = 0;
  const fit = (a, b) => Math.max(1, Math.floor(iw / a)) * Math.max(1, Math.floor(id / b));
  if (fit(pd, pw) > fit(pw, pd)) { [pw, pd] = [pd, pw]; yaw = Math.PI / 2; }
  const cols = Math.max(1, Math.floor(iw / pw)), rows = Math.max(1, Math.floor(id / pd)), layers = Math.max(1, Math.floor((h - 0.01) / ph));
  const gx = Math.min(pw, iw / cols), gz = Math.min(pd, id / rows), out = [];
  for (let l = 0; l < layers; l++) for (let r0 = 0; r0 < rows; r0++) for (let c = 0; c < cols; c++) out.push([(c - (cols - 1) / 2) * gx, 0.006 + l * ph, (r0 - (rows - 1) / 2) * gz, yaw]);
  return (inBoxCache[pid] = out.slice(0, Math.max(p.qty, cols * rows)));
}
const _m3 = new THREE.Matrix4(), _s2 = new THREE.Vector3(1, 1, 1);

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.lite = !!settings.lite;
    setLiteMaterials(this.lite);
    this.r = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, powerPreference: 'high-performance', alpha: false });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.0;
    setAniso(Math.min(this.lite ? 2 : 8, this.r.capabilities.getMaxAnisotropy()));
    setTexQuality(!this.lite, !this.lite && !!settings.ultra);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfe9ff, 45, 160);
    this.camera = new THREE.PerspectiveCamera(settings.fov || 68, 1, 0.08, 200);
    this.hemi = new THREE.HemisphereLight(0xe8f4ff, 0xb7a58f, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(0, 0, -13); // 建物（奥行き約42m）の真ん中あたり
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.indoor = [];
    for (let i = 0; i < (this.lite ? 0 : 6); i++) {
      const l = new THREE.PointLight(0xfff3e2, 0, 14, 2); l.position.set(0, 3.4, 0); this.scene.add(l); this.indoor.push(l);
    }
    if (!this.lite) {
      try {
        const pm = new THREE.PMREMGenerator(this.r);
        this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environment = this.envTex;
        pm.dispose();
      } catch (e) { console.warn('環境マップなしで続行', e); }
    }
    this.applySettings(settings);
    this.world = new World(this.scene, { lite: this.lite });
    this.fixRoot = new THREE.Group(); this.scene.add(this.fixRoot);
    this.prodRoot = new THREE.Group(); this.scene.add(this.prodRoot);
    this.charRoot = new THREE.Group(); this.scene.add(this.charRoot);
    this.fixViews = new Map();
    this.products = new Instancer(this.prodRoot, (pid) => productParts(pid));
    this.tags = new Instancer(this.prodRoot, (key) => {
      const [pid, price, warn] = key.split('|');
      return [{ g: new THREE.PlaneGeometry(0.1, 0.05), m: new THREE.MeshBasicMaterial({ map: priceTagTexture(PRODUCTS[pid].icon, +price, warn === '1'), toneMapped: false }) }];
    });
    this.boxes = new Instancer(this.prodRoot, (key) => {
      const [pid, open] = key.split('|');
      return open ? openBoxParts(pid) : [{ g: boxGeo(PRODUCTS[pid].bx), m: mat(0xffffff, { map: boxAtlas(PRODUCTS[pid]), r: 0.85 }) }];
    }, { cast: !this.lite });
    this.boxItems = new Instancer(this.prodRoot, (pid) => productParts(pid));
    this.custItems = new Instancer(this.prodRoot, (pid) => productParts(pid)); // お客さんのかごの中・手に持った商品
    this._seenBox = new Set(); this._fall = new Map(); this._boxT0 = 0;
    this.belts = new Map();
    this.chars = new Map();
    this.storeRev = -1; this.regKey = '';
    this.highlight = null;
    this.ghost = null;
    this.t = 0;
    this.resize();
  }
  applySettings(s) {
    this.settings = s;
    const ultra = !this.lite && !!s.ultra;
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1 : 2) * (s.res || 1);
    this.dpr = Math.max(0.4, dpr);
    this.r.setPixelRatio(this.dpr);
    const sh = !this.lite && s.shadows !== false;
    const changed = this.r.shadowMap.enabled !== sh;
    this.r.shadowMap.enabled = sh; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    if (changed && this.scene) this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.sun.castShadow = sh;
    const ms = ultra ? 4096 : s.res < 0.8 ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== ms) { this.sun.shadow.mapSize.set(ms, ms); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.camera.fov = s.fov || 68; this.camera.updateProjectionMatrix();
    this.scene.fog.far = this.lite ? 90 : 160;
    if (ultra !== !!this.composer && ultra !== this._postWanted) this.enablePost(ultra);
    this.resize();
  }
  // 最高画質：画面のすき間の陰(SSAO)・発光のにじみ(ブルーム)・MSAA
  async enablePost(on) {
    this._postWanted = on;
    if (!on) { if (this.composer) { this.composer.dispose?.(); this.composer = null; } return; }
    try {
      const base = 'three/addons/postprocessing/';
      const [{ EffectComposer }, { RenderPass }, { SSAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all(
        ['EffectComposer', 'RenderPass', 'SSAOPass', 'UnrealBloomPass', 'OutputPass'].map((n) => import(base + n + '.js')));
      if (!this._postWanted) return;
      const w = window.innerWidth, h = window.innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(this.r, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      const ao = new SSAOPass(this.scene, this.camera, w, h, 16);
      ao.kernelRadius = 0.45; ao.minDistance = 0.00008; ao.maxDistance = 0.0035;
      c.addPass(ao);
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.45, 0.93));
      c.addPass(new OutputPass());
      this.composer = c; this.aoPass = ao;
      this.resize();
    } catch (e) { console.warn('高画質エフェクトを使えません', e); this.composer = null; }
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(Math.min(this.dpr || 1, 1.5)); this.composer.setSize(w, h); }
  }

  // ---------- 時間帯の光 ----------
  setTime(min) {
    const h = min / 60;
    const day = THREE.MathUtils.clamp(1 - Math.abs(h - 13) / 8, 0, 1); // 13時が最大
    const dusk = Math.max(0, 1 - Math.abs(h - 18) / 1.6);
    const night = THREE.MathUtils.clamp((h - 18.5) / 1.5, 0, 1);
    const top = new THREE.Color('#5fb4ff').lerp(new THREE.Color('#ff9a62'), dusk * 0.6).lerp(new THREE.Color('#0d1b3d'), night);
    const midc = new THREE.Color('#c9ecff').lerp(new THREE.Color('#ffc58a'), dusk).lerp(new THREE.Color('#25305a'), night);
    this.world.skyMat.uniforms.top.value.copy(top); this.world.skyMat.uniforms.mid.value.copy(midc);
    this.scene.fog.color.copy(midc);
    const env = !this.lite;
    this.sun.intensity = (env ? 1.6 : 2.2) * (0.55 + 0.45 * day) * (1 - night * 0.6);
    this.sun.color.set('#fff4e0').lerp(new THREE.Color('#ffb070'), dusk).lerp(new THREE.Color('#9fb6ff'), night);
    const ang = (h - 6) / 14 * Math.PI;
    this.sun.position.set(Math.cos(ang) * 18, 34, -1 + Math.sin(ang) * 6);
    this.hemi.intensity = (env ? 0.7 : 1.5) * (1 - night * 0.35);
    const indoor = env ? 6 + night * 16 + dusk * 6 : 0;
    for (const l of this.indoor) l.intensity = indoor;
    this.world.lampMat.color.set(night > 0.2 || dusk > 0.5 ? '#ffe9a8' : '#777777');
    this.world.panelMat.color.setScalar(1);
  }

  // ---------- 店の状態を反映 ----------
  _placeIndoor() {
    const spots = this.world.lightSpots || [];
    const n = this.indoor.length; // 数が少ないので、照明のある場所から均等に選ぶ
    this.indoor.forEach((l, i) => { const s = spots.length > n ? spots[Math.floor((i + 0.5) * spots.length / n)] : spots[i]; l.visible = !!s; if (s) l.position.set(s[0], 3.4, s[1]); });
  }
  syncStore(store) {
    const wk = this.world._key;
    this.world.updateStore(store);
    if (wk !== this.world._key) this._placeIndoor();
    if (store.rev === this.storeRev) return;
    this.storeRev = store.rev;
    this.store = store;
    const seen = new Set();
    let lane = 0;
    for (const f of store.fixtures) {
      if (f.t === 'checkout') lane++;
      const key = [f.t, f.x, f.z, f.r, f.tx, f.c, store.color, f.t === 'checkout' ? lane : 0, f.t === 'opensign' ? store.phase === 'open' : 0].join('|');
      seen.add(f.id);
      const v = this.fixViews.get(f.id);
      if (v && v.key === key) continue;
      if (v) { this.fixRoot.remove(v.group); v.group.traverse((o) => o.isMesh && o.geometry.dispose()); }
      let g;
      try { g = bakeGroup(buildFixture(f, { color: store.color, lane, phase: store.phase })); }
      catch (e) { console.warn('設備モデル失敗', f.t, e); g = new THREE.Group(); const d = FIXTURES[f.t]; const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, 1, d.d).translate(0, 0.5, 0), mat(0xcccccc)); g.add(m); }
      g.position.set(f.x, 0, f.z); g.rotation.y = f.r * Math.PI / 2;
      g.traverse((o) => { if (o.isMesh) { o.userData.fid = f.id; o.castShadow = !this.lite && !o.material.transparent; o.receiveShadow = !this.lite; } });
      this.fixRoot.add(g);
      this.fixViews.set(f.id, { key, group: g, m: fixMatrix(f) });
    }
    // 開店前は看板の上に「OPENにしよう」の目印
    const sign = store.fixtures.find((f) => f.t === 'opensign');
    if (!this.signHint) {
      this.signHint = new THREE.Sprite(new THREE.SpriteMaterial({ map: signHintTex(), depthTest: false, transparent: true, toneMapped: false }));
      this.signHint.scale.set(1.1, 0.42, 1); this.signHint.renderOrder = 9; this.scene.add(this.signHint);
    }
    this.signHint.visible = !!sign && store.phase === 'prep';
    if (sign) this.signHint.position.set(sign.x, 2.05, sign.z);
    for (const [id, v] of this.fixViews) if (!seen.has(id)) { this.fixRoot.remove(v.group); v.group.traverse((o) => o.isMesh && o.geometry.dispose()); this.fixViews.delete(id); }
    // 棚の商品と値札
    this.products.begin(); this.tags.begin();
    const tagRot = new THREE.Matrix4();
    for (const f of store.fixtures) {
      if (!f.s) continue;
      const def = FIXTURES[f.t], fm = this.fixViews.get(f.id).m;
      f.s.forEach(([p, n], si) => {
        if (!p || !PRODUCTS[p]) return;
        const sl = def.slots[si];
        const pos = slotPositions(p, sl);
        const lim = Math.min(n, pos.length); // 入っている数はすべて表示する
        for (let i = 0; i < lim; i++) {
          const [x, y, z, yaw] = pos[i];
          _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, yaw), _s);
          this.products.push(p, _m2.multiplyMatrices(fm, _m), null);
        }
        const price = getPrice(store, p), warn = price > priceLimit(store, p) ? 1 : 0;
        const [tx, ty, tz] = tagLocal(f.t, sl); // 値札（狙うと値段を変えられる）
        _m.compose(_v.set(tx, ty, tz), _q.setFromAxisAngle(UP, sl.side < 0 ? Math.PI : 0), _s);
        this.tags.push(`${p}|${price}|${warn}`, _m2.multiplyMatrices(fm, _m), { fid: f.id, si });
      });
    }
    this.products.end(); this.tags.end();
  }
  // 段ボール（棚の上・床・手持ち）
  // 一人称：自分が持っている箱はカメラの前に描き、両手を添える
  _fpRig(av, size) {
    if (!this.fpHands) {
      if (!this.camera.parent) this.scene.add(this.camera);
      this.fpHands = new THREE.Group(); this.fpHands.name = 'fpHands'; this.camera.add(this.fpHands);
    }
    const key = [av.skin, av.top, av.topColor, size.join(',')].join('|');
    if (this._fpKey !== key) {
      this._fpKey = key;
      for (const o of this.fpHands.children) o.geometry?.dispose();
      this.fpHands.clear();
      const skin = mat(av.skin, { r: 0.55 }), sleeve = mat(av.top === 'suit' ? '#2b2d42' : av.top === 'apron' ? '#ffffff' : av.topColor, { r: 0.8 });
      const [w, h] = size;
      for (const s of [-1, 1]) {
        const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.07, 4, 10), skin);
        hand.rotation.x = Math.PI / 2; hand.position.set(s * (w / 2 + 0.012), -0.02, 0.02); hand.scale.set(0.7, 1, 1.15);
        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.04, 3, 8), skin);
        thumb.position.set(s * (w / 2 - 0.01), 0.035, 0.07); thumb.rotation.z = s * 0.6;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.55, 12).translate(0, -0.275, 0), sleeve);
        arm.position.set(s * (w / 2 + 0.02), -0.02, 0.07); arm.rotation.set(-1.25, 0, s * 0.32);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.05, 12), skin);
        cuff.position.set(s * (w / 2 + 0.02), -0.025, 0.08); cuff.rotation.x = -1.25;
        for (const m of [hand, thumb, arm, cuff]) { m.renderOrder = 2; this.fpHands.add(m); }
      }
    }
    this.fpHands.visible = true;
  }
  syncBoxes(store, holders, fp) {
    this.boxes.begin(); this.boxItems.begin();
    let fpOn = false, batch = 0;
    const now = performance.now() / 1000;
    if (!this._boxT0) this._boxT0 = now;
    const ready = now - this._boxT0 > 1.5; // 最初に読み込んだ箱は降らせない
    for (const b of store.boxes) {
      const p = PRODUCTS[b.p]; if (!p) continue;
      const L = b.loc;
      if (!this._seenBox.has(b.id)) {
        this._seenBox.add(b.id);
        if (ready && b.drop && L.t === 'f') this._fall.set(b.id, now + batch++ * 0.12);
      }
      if (L.t === 'f') {
        let y = L.y, spin = 0;
        const f0 = this._fall.get(b.id);
        if (f0 != null) {
          // 空から降ってくる（落ちたら少しはねる）
          const t = now - f0, H = 14, T = Math.sqrt(2 * H / 19);
          if (t < 0) y += H;
          else if (t < T) { y += H - 0.5 * 19 * t * t; spin = (T - t) * 1.6; }
          else if (t < T + 0.25) { const k = (t - T) / 0.25; y += Math.sin(k * Math.PI) * 0.12; }
          else this._fall.delete(b.id);
        }
        _m.compose(_v.set(L.x, y, L.z), _q.setFromAxisAngle(UP, (L.ry || 0) + spin), _s);
      }
      else if (L.t === 'r') {
        const v = this.fixViews.get(L.fid), def = store.fixtures.find((f) => f.id === L.fid);
        if (!v || !def) continue;
        const s = FIXTURES[def.t].boxSlots?.[L.si]; if (!s) continue;
        _m2.compose(_v.set(s.x, s.y, s.z), _q.identity(), _s);
        _m.multiplyMatrices(v.m, _m2);
      } else if (L.t === 'h' && fp && L.who === fp.who) {
        // カメラの右下前方に持つ（少し揺らす）
        const sz = BOX_SIZES[p.bx || 'm'], bob = fp.bob || 0;
        const ox = 0.0, oy = -0.3 - sz[1] / 2 + bob, oz = -0.5 - sz[2] / 2;
        this.camera.updateMatrixWorld();
        _m2.compose(_v.set(ox, oy, oz), _q.setFromEuler(_e.set(0.12, 0, 0)), _s);
        _m.multiplyMatrices(this.camera.matrixWorld, _m2);
        this._fpRig(fp.av, sz);
        this.fpHands.position.set(ox, oy + sz[1] * 0.45, oz); this.fpHands.rotation.set(0.12, 0, 0);
        fpOn = true;
      } else if (L.t === 'h') {
        const ch = holders(L.who);
        if (!ch) continue;
        const o = ch.root;
        _e.set(0, o.rotation.y, 0);
        const off = new THREE.Vector3(0, 0.98 * ch.av.height, 0.38).applyEuler(_e);
        _m.compose(_v.copy(o.position).add(off), _q.setFromEuler(_e), _s);
      } else continue;
      this.boxes.push(b.o ? b.p + '|o' : b.p, _m, b.id);
      // 開いている箱は中身が見える
      if (b.o && b.n > 0) {
        const lay = inBoxLayout(b.p), n = Math.min(b.n, lay.length);
        for (let i = 0; i < n; i++) { const [x, y, z, yaw] = lay[i]; _m2.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, yaw), _s); this.boxItems.push(b.p, _m3.multiplyMatrices(_m, _m2), null); }
      }
    }
    this.boxes.end(); this.boxItems.end();
    if (!fpOn && this.fpHands) this.fpHands.visible = false;
  }
  // レジのベルト上の商品
  syncRegs(store, regs) {
    const key = JSON.stringify(Object.entries(regs || {}).map(([fid, r]) => [fid, r.b.map((x) => x[0] + x[1])]));
    if (key === this.regKey && this.storeRev === this._regStoreRev) return;
    this.regKey = key; this._regStoreRev = this.storeRev;
    for (const g of this.belts.values()) { this.scene.remove(g); }
    this.belts.clear();
    for (const [fid, r] of Object.entries(regs || {})) {
      const f = store.fixtures.find((o) => o.id === +fid), v = this.fixViews.get(+fid);
      if (!f || !v || !r.b?.length) continue;
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.z); g.rotation.y = f.r * Math.PI / 2;
      let z = 1.1;
      r.b.forEach(([p, s], i) => {
        if (!PRODUCTS[p]) return;
        if (f.t === 'selfcheckout') { if (s) return; const it = productMesh(p); it.position.set(-0.15 + (i % 3) * 0.12, 0.89, -0.15 + Math.floor(i / 3) * 0.12); g.add(it); return; }
        const it = productMesh(p);
        if (s) { it.position.set(0.15 + (i % 3) * 0.08, 0.86, -0.95 + Math.floor(i / 3) * 0.08 % 0.3); it.scale.setScalar(0.8); }
        else { const d = PRODUCTS[p].size[2]; z -= Math.max(0.1, d) + 0.04; it.position.set(0.08, 0.885, Math.max(-0.1, z + 0.12)); }
        it.traverse((o) => { if (o.isMesh) { o.userData.belt = { fid: +fid, i }; o.castShadow = false; } });
        g.add(it);
      });
      this.scene.add(g); this.belts.set(+fid, g);
    }
  }
  // キャラクター（客・従業員・プレイヤー）
  syncChars(list, dt) {
    const seen = new Set();
    this.custItems.begin();
    for (const e of list) {
      seen.add(e.key);
      let v = this.chars.get(e.key);
      if (!v) {
        const ch = new Character(e.av, { lite: this.lite, small: e.small, uniform: e.uniform });
        if (e.name) ch.setName(e.name, e.nameColor);
        ch.root.position.set(e.x, e.y || 0, e.z); ch.root.rotation.y = e.ry || 0;
        this.charRoot.add(ch.root);
        if (e.kind === 'cust') { ch.basket = basketMesh(); ch.armL.add(ch.basket); ch.basket.position.set(0, -0.32, 0.02); ch.basket.scale.setScalar(0.85); }
        v = { ch, x: e.x, z: e.z };
        this.chars.set(e.key, v);
      }
      const ch = v.ch, o = ch.root;
      if (e.local) { o.position.set(e.x, e.y || 0, e.z); o.rotation.y = e.ry; }
      else {
        const k = Math.min(1, dt * 10);
        o.position.x = lerp(o.position.x, e.x, k); o.position.z = lerp(o.position.z, e.z, k); o.position.y = lerp(o.position.y, e.y || 0, k);
        o.rotation.y = angleLerp(o.rotation.y, e.ry || 0, Math.min(1, dt * 10));
      }
      const sp = Math.hypot(o.position.x - v.x, o.position.z - v.z) / Math.max(dt, 1e-3);
      v.x = o.position.x; v.z = o.position.z;
      ch.speed = sp;
      ch.anim = e.an && e.an !== 'walk' ? e.an : sp > 0.25 ? 'walk' : 'idle';
      if (e.an === 'walk' && sp < 0.05 && !e.local) ch.anim = 'walk';
      ch.carry = !!e.carry;
      if (ch.basket) ch.basket.visible = (e.basket || 0) > 0 && !e.carry;
      if (e.bubble !== undefined) ch.setBubble(e.bubble || null, e.bubbleText);
      ch.root.visible = e.visible !== false;
      ch.update(dt);
      if (e.kind === 'cust' && ch.root.visible && (e.items || e.hold)) this._custGoods(ch, e);
    }
    this.custItems.end();
    for (const [k, v] of this.chars) if (!seen.has(k)) { v.ch.dispose(); this.chars.delete(k); }
  }
  getChar(key) { return this.chars.get(key)?.ch; }
  // かごに入れた商品（最大8個）と、いま手に取った商品を描く
  _custGoods(ch, e) {
    ch.root.updateMatrixWorld(true);
    const fit = (pid, m) => { const s = PRODUCTS[pid]?.size; if (!s) return 0; return Math.min(1, m / Math.max(s[0], s[2]), 0.17 / s[1]); };
    if (e.items && ch.basket?.visible) {
      const ids = e.items.split(',').filter((p) => PRODUCTS[p]);
      ids.forEach((pid, i) => {
        const k = fit(pid, 0.1);
        const x = -0.09 + (i % 3) * 0.09, z = -0.045 + (Math.floor(i / 3) % 2) * 0.09, y = -0.13 + Math.floor(i / 6) * 0.05;
        _m2.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, i * 0.9), _s2.set(k, k, k));
        this.custItems.push(pid, _m3.multiplyMatrices(ch.basket.matrixWorld, _m2), null);
      });
    }
    if (e.hold && PRODUCTS[e.hold] && ch.armR) {
      const k = fit(e.hold, 0.13);
      _m2.compose(_v.set(0, -0.36, 0.06), _q.setFromAxisAngle(UP, 0), _s2.set(k, k, k));
      this.custItems.push(e.hold, _m3.multiplyMatrices(ch.armR.matrixWorld, _m2), null);
    }
  }

  // ---------- 選択ハイライト・設置ゴースト ----------
  setHighlight(fid, slotBox) {
    const k = fid == null ? '' : fid + '|' + (slotBox ? slotBox.join(',') : '');
    if (k === this._hlKey) return;
    this._hlKey = k;
    if (this.highlight) { this.scene.remove(this.highlight); this.highlight.geometry.dispose(); this.highlight = null; }
    if (fid == null) return;
    const v = this.fixViews.get(fid); if (!v) return;
    let geo;
    if (slotBox) { const [x, y, z, w, h, d] = slotBox; geo = new THREE.BoxGeometry(w, h, d); geo.translate(x, y + h / 2, z); }
    else { const bb = new THREE.Box3().setFromObject(v.group); const sz = bb.getSize(new THREE.Vector3()); const c = bb.getCenter(new THREE.Vector3()); geo = new THREE.BoxGeometry(sz.x + 0.04, sz.y + 0.04, sz.z + 0.04); geo.translate(c.x - v.group.position.x, c.y, c.z - v.group.position.z); geo.rotateY(0); }
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, depthTest: false }));
    line.renderOrder = 10;
    if (slotBox) { line.position.copy(v.group.position); line.rotation.copy(v.group.rotation); }
    else line.position.copy(v.group.position);
    this.scene.add(line); this.highlight = line;
  }
  // 建築メニュー用：設備の3Dモデルを小さな画像にする。
  // 画面とは別の描画先（レンダーターゲット）に1フレーム1枚ずつ描くので、ゲーム画面には一切触れない。
  thumbUrl(type, color) { return this._thumbs?.get(type + '|' + color) ?? null; }
  requestThumbs(types, color, done) {
    this._thumbs ||= new Map(); this._thumbQ ||= [];
    let added = false;
    for (const t of types) {
      const k = t + '|' + color;
      if (this._thumbs.has(k) || this._thumbQ.some((q) => q.k === k)) continue;
      this._thumbQ.push({ t, color, k }); added = true;
    }
    if (added || this._thumbQ.length) this._thumbDone = done;
  }
  _thumbTick() {
    const q = this._thumbQ; if (!q || !q.length) return;
    const it = q.shift();
    this._thumbs.set(it.k, this._makeThumb(it.t, it.color));
    if (!q.length) { const d = this._thumbDone; this._thumbDone = null; try { d?.(); } catch (e) { /* 無視 */ } }
  }
  _makeThumb(type, color) {
    const R = this.r, S = 128, SS = 256;
    let g = null, url = null;
    const prevRT = R.getRenderTarget();
    try {
      const scene = this._thumbScene ||= (() => {
        const s = new THREE.Scene(); s.background = new THREE.Color(0xeef2f6);
        s.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a2, 1.4));
        const d = new THREE.DirectionalLight(0xffffff, 1.8); d.position.set(3, 5, 4); s.add(d);
        return s;
      })();
      scene.environment = this.scene.environment || null;
      this._thumbRT ||= new THREE.WebGLRenderTarget(SS, SS);
      const def = FIXTURES[type];
      g = bakeGroup(buildFixture({ t: type, x: 0, z: 0, r: 0, s: (def.slots || []).map(() => [null, 0]), tx: def.text ? 'SALE' : undefined, c: '#ffffff' }, { color, lane: 1, phase: 'open' }));
      scene.add(g);
      const bb = new THREE.Box3().setFromObject(g), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 80);
      const rad = Math.max(0.3, size.length() / 2), far = rad / Math.sin(THREE.MathUtils.degToRad(14));
      cam.position.copy(ctr).addScaledVector(new THREE.Vector3(0.62, 0.5, 1).normalize(), far); cam.lookAt(ctr);
      R.setRenderTarget(this._thumbRT);
      R.render(scene, cam);
      const buf = new Uint8Array(SS * SS * 4);
      R.readRenderTargetPixels(this._thumbRT, 0, 0, SS, SS, buf);
      // 線形の色 → トーンマップ（ACES近似）→ sRGB
      const lut = this._thumbLut ||= (() => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) { const x = i / 255 * 1.1; const t = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); l[i] = 255 * (t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055); } return l; })();
      const c = document.createElement('canvas'); c.width = c.height = SS;
      const ctx = c.getContext('2d'), img = ctx.createImageData(SS, SS);
      for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) {
        const si = ((SS - 1 - y) * SS + x) * 4, di = (y * SS + x) * 4;
        img.data[di] = lut[buf[si]]; img.data[di + 1] = lut[buf[si + 1]]; img.data[di + 2] = lut[buf[si + 2]]; img.data[di + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const out = document.createElement('canvas'); out.width = out.height = S;
      out.getContext('2d').drawImage(c, 0, 0, S, S);
      url = out.toDataURL('image/png');
      if (typeof url !== 'string' || !url.startsWith('data:image')) url = null;
    } catch (e) { url = null; }
    finally {
      try { R.setRenderTarget(prevRT ?? null); } catch (e) { /* 無視 */ }
      if (g) { try { this._thumbScene?.remove(g); g.traverse((o) => o.geometry?.dispose?.()); } catch (e) { /* 無視 */ } }
    }
    return url;
  }
  setGhost(type, x, z, r, ok, store) {
    const k = type ? type : '';
    if (k !== this._ghostKey) {
      this._ghostKey = k;
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
      if (type) {
        const g = bakeGroup(buildFixture({ t: type, x: 0, z: 0, r: 0, tx: 'NEW', c: '#ffffff' }, { color: store?.color || '#ff6b35', lane: 0 }));
        this.ghostMats = [new THREE.MeshBasicMaterial({ color: 0x4cff8a, transparent: true, opacity: 0.45, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xff4c4c, transparent: true, opacity: 0.45, depthWrite: false })];
        g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMats[0]; o.castShadow = false; o.userData.noRay = true; } });
        const def = FIXTURES[type];
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.d), this.ghostMats[0]); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; g.add(pad);
        this.ghost = g; this.scene.add(g);
      }
    }
    if (this.ghost) {
      this.ghost.position.set(x, 0, z); this.ghost.rotation.y = r * Math.PI / 2;
      const m = this.ghostMats[ok ? 0 : 1];
      this.ghost.traverse((o) => { if (o.isMesh) o.material = m; });
    }
  }
  setFixtureHidden(fid) {
    for (const [id, v] of this.fixViews) v.group.visible = id !== fid;
  }

  // ---------- レイキャスト ----------
  pick(raycaster, { boxes = true, fixtures = true, belts = false, skip = null } = {}) {
    const objs = [];
    if (fixtures) this.fixRoot.traverse((o) => { if (o.isMesh && !o.userData.noRay) objs.push(o); });
    if (boxes) for (const e of this.boxes.map.values()) for (const m of e.meshes) if (m.count > 0) objs.push(m);
    if (belts) for (const g of this.belts.values()) g.traverse((o) => o.isMesh && objs.push(o));
    const hits = raycaster.intersectObjects(objs, false);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.belt) return { type: 'belt', ...o.userData.belt, point: h.point, dist: h.distance };
      if (o.isInstancedMesh && o.userData.inst) { const id = o.userData.inst.ids[h.instanceId]; if (id != null && !(skip && skip.has(id))) return { type: 'box', bid: id, point: h.point, dist: h.distance }; continue; }
      if (o.userData.fid != null) return { type: 'fixture', fid: o.userData.fid, point: h.point, dist: h.distance };
    }
    return null;
  }
  // 足元・設備の下の柔らかい影（AOの代わり）
  syncBlobs(store, extra) {
    if (!this.blobs) {
      const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mk = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
      this.blobs = new Instancer(this.prodRoot, (k) => [{ g: flat, m: mk(tex(k === 'c' ? 'blob' : 'blobRect')) }]);
    }
    this.blobs.begin();
    const put = (k, x, z, sx, sz, ry = 0, y = 0.012) => { _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, ry), _s.set(sx, 1, sz)); this.blobs.push(k, _m, null); _s.set(1, 1, 1); };
    for (const f of store.fixtures) {
      const d = FIXTURES[f.t]; if (!d || ['mboard', 'fboard', 'xboard', 'banner', 'neon', 'signstand'].includes(f.t)) continue;
      const big = f.t === 'checkout' || d.d >= 1;
      put('r', f.x, f.z, d.w * 1.35 + 0.3, d.d * 1.35 + (big ? 0.3 : 0.45), f.r * Math.PI / 2);
    }
    for (const b of store.boxes) if (b.loc.t === 'f' && b.loc.y < 0.05) { const s = BOX_SIZES[PRODUCTS[b.p]?.bx || 'm']; put('r', b.loc.x, b.loc.z, s[0] * 1.6, s[2] * 1.6, b.loc.ry || 0); }
    for (const [x, z] of extra) put('c', x, z, 0.85, 0.85);
    this.blobs.end();
  }
  update(dt) {
    this.t += dt;
    const bt = getBeltTex(); bt.offset.y = (bt.offset.y + dt * 0.25) % 1;
  }
  render() {
    try { this._thumbTick(); } catch (e) { /* サムネイルは失敗しても無視 */ }
    if (this.signHint?.visible) this.signHint.position.y = 2.05 + Math.sin(performance.now() / 260) * 0.06;
    if (this.composer) { try { this.composer.render(); return; } catch (e) { console.warn('post error', e); this.composer = null; } }
    this.r.render(this.scene, this.camera);
  }
}

let _signHint = null;
function signHintTex() {
  return _signHint ||= canvasTex(320, 120, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.strokeStyle = '#16a34a'; c.lineWidth = 6; rr(c, 6, 6, w - 12, h - 36, 26); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(w / 2 - 14, h - 32); c.lineTo(w / 2, h - 8); c.lineTo(w / 2 + 14, h - 32); c.fillStyle = '#16a34a'; c.fill();
    c.fillStyle = '#16a34a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 36px ${FONT}`; c.fillText('OPENにしよう！', w / 2, (h - 30) / 2 + 3);
  });
}
function basketMesh() {
  const g = new THREE.Group(), red = mat(0xe53935, { r: 0.45 });
  const parts = [[0.3, 0.012, 0.2, 0, 0, 0], [0.3, 0.14, 0.01, 0, 0, 0.1], [0.3, 0.14, 0.01, 0, 0, -0.1], [0.01, 0.14, 0.2, 0.15, 0, 0], [0.01, 0.14, 0.2, -0.15, 0, 0]];
  for (const [w, h, d, x, y, z] of parts) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), red); m.position.set(x, y - 0.14, z); g.add(m); }
  const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 12, Math.PI), mat(0x333333)); hnd.position.y = -0.0; g.add(hnd);
  g.rotation.y = Math.PI / 2;
  return g;
}

// 3Dプレビュー用（キャラメイク画面）
export function avatarPreview(renderer) {
  const scene = new THREE.Scene();
  scene.background = null;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b8a8, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 3); scene.add(d);
  if (renderer.envTex) scene.environment = renderer.envTex;
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.12, 40), mat(0xffffff, { r: 0.4 }));
  stage.position.y = -0.06; scene.add(stage);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.03, 8, 40), mat(0xff6b35, { r: 0.4 })); ring.rotation.x = Math.PI / 2; scene.add(ring);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  return { scene, cam };
}
export { Character, randomAvatar };
