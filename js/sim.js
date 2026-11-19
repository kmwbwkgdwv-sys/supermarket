// ===== 経営シミュレーション（ホスト側で実行・three.js 非依存） =====
import {
  PRODUCTS, PRODUCTS_LIST, FIXTURES, SKILLS, STAFF_ROLES, STAFF_NAMES, BOX_SIZES, DELIVERY_AREA,
  OPEN_TIME, GAME_MIN_PER_SEC, SPAWN_POINTS, PLAYER_BOUNDS, START_BAYS, START_STOCK, OLD_BACK_Z, OLD_STOCK_Z, V12_STOCK_Z, V13, OLD_START_BAYS_V8, STAFF_HOME, SALES, STOCK_SECTIONS, bayAt, doorOpen, snapFixture,
  getWalls, zones, keepClear, expandTargets, fixtureFootprint, marketPrice, marketCost, OLD_LICENSES, slotCapacity, slotAccess, rackAccess, checkoutSpot, canPlace,
  staffLimit, STAFF_SLOTS, slotWage, staffSlotOpen, checkoutLimit, closeTime, xpNeed, costMult, productUnlocked, fixtureUnlocked, localToWorld, CELL, TRASH_TYPES, ORDER_MAX_BOXES, SHIPPING_FEE,
  MAX_LEVEL, spForLevel, spTotalNew, spTotalOld, SELF_MAX, boxUnits, wageFor, MANAGER, XP_YEN, BUILDING, EMPTY_BOX, EMPTY_BOX_PRICE, boxProd, boxLook,
} from './data.js';
import { NavGrid } from './nav.js';
import { rand, randi, pick, dist, dist2, clamp } from './util.js';

export function newStore(name) {
  const st = {
    v: 15, name: name || 'マートメイツ', money: 40000, day: 1, level: 1, xp: 0, sp: 1, rep: 50,
    skills: { start: true, prod_food1: true }, prices: {}, market: {}, marketPrev: {}, staff: [], nid: 100, phase: 'prep', time: OPEN_TIME,
    totalSales: 0, totalCustomers: 0, rev: 1, created: Date.now(), color: '#ff6b35',
    today: { sales: 0, served: 0, lost: 0, orders: 0, ship: 0, xp: 0, vend: 0, recycle: 0 },
    bays: Object.fromEntries(START_BAYS.map((b) => [b, 1])),
    stock: Object.fromEntries(START_STOCK.map((b) => [b, 1])),
    fixtures: initialFixtures(),
    boxes: [], reviews: [], crates: [],
  };
  // 最初は棚も倉庫も空っぽ。マネージャーボードで発注して補充するところから
  return st;
}
function initialFixtures() {
  return [
    // パソコン室（入口の右）：正面の壁にマネージャーボード、左右の壁にフランチャイズボードと拡張ボード
    { id: 1, t: 'mboard', x: 10, z: 5.62, r: 2 },
    { id: 2, t: 'fboard', x: 14.62, z: 3.5, r: 3 },
    { id: 3, t: 'xboard', x: 5.38, z: 3.5, r: 1 },
    { id: 4, t: 'recycle', x: 16.4, z: 3, r: 1 }, // 建物の右の外（搬入口から出てすぐ）
    { id: 5, t: 'checkout', x: 3, z: 3.25, r: 2 },
    { id: 6, t: 'shelf', x: -3, z: -3.5, r: 0, s: emptySlots('shelf') },
    { id: 7, t: 'shelf', x: -3, z: -0.75, r: 0, s: emptySlots('shelf') },
    { id: 8, t: 'rack', x: 12.5, z: -3.4, r: 0 },
    { id: 9, t: 'basket', x: -2.25, z: 4.75, r: 0 },
    { id: 10, t: 'plant', x: -4.5, z: 5.5, r: 0 },
    { id: 11, t: 'trash', x: 4.5, z: 5.5, r: 0 },
    { id: 12, t: 'opensign', x: 2.25, z: 5.25, r: 0 },
    { id: 13, t: 'dumpster', x: 12.3, z: 0.43, r: 2 },
  ];
}
// 旧レイアウト(v1)のセーブを新しい店舗に引っ越す：設備代は全額返金、棚の商品は箱に戻す
function migrateV1(st) {
  let refund = 0;
  const count = {};
  for (const f of st.fixtures || []) {
    const d = FIXTURES[f.t];
    if (d && !d.fixed && ![2, 3, 4, 5, 6, 7].includes(f.id)) refund += d.price;
    for (const s of f.s || []) if (s && s[0] && s[1] > 0 && PRODUCTS[s[0]]) count[s[0]] = (count[s[0]] || 0) + s[1];
  }
  for (const b of st.boxes || []) if (PRODUCTS[b.p] && b.n > 0) count[b.p] = (count[b.p] || 0) + b.n;
  if (st.skills?.exp1) { delete st.skills.exp1; st.sp = (st.sp || 0) + 3; }
  if (st.skills?.exp2) { delete st.skills.exp2; st.sp = (st.sp || 0) + 4; }
  st.nid = Math.max(st.nid || 100, 200);
  st.fixtures = initialFixtures(); st._fresh = true; // 最新の配置で作り直したので、後の引っ越し（v8・v9）でずらさない
  st.bays = { b20: 1, b21: 1, b30: 1, b31: 1 }; // v2〜v5 の番号（v6 で付け替える）
  st.stock = Object.fromEntries(START_STOCK.map((b) => [b, 1]));
  st.boxes = [];
  for (const [p, n0] of Object.entries(count)) { let n = n0; while (n > 0) { const k = Math.min(n, PRODUCTS[p].qty); st.boxes.push({ id: st.nid++, p, n: k, loc: null }); n -= k; } }
  st.money = (st.money || 0) + refund;
  st.v = 2;
}
export function emptySlots(t) { return (FIXTURES[t].slots || []).map(() => [null, 0]); }
// 売値：自分で決めた値段。決めていなければ相場どおり
export const getPrice = (store, pid) => store.prices[pid] ?? marketPrice(store, pid);
// これより高いとお客さんは買わない：相場の+20%（スキル「ブランド力」で+30%）
export const PRICE_OK = 1.2;
export const priceLimit = (store, pid) => Math.floor(marketPrice(store, pid) * (PRICE_OK + (store.skills?.mk_price ? 0.1 : 0)));

// 保存データの整合性を直す（読込時）
export function normalizeStore(st) {
  const fromV = st.v || 1;
  if ((st.v || 1) < 2) migrateV1(st);
  if (st.v < 3) {
    // 商品ライセンス → 商品ツリーへ。以前から売れていた商品はそのまま売れる
    st.skills ||= {};
    for (const [old, list] of Object.entries(OLD_LICENSES)) if (st.skills[old]) { delete st.skills[old]; for (const k of list) st.skills[k] = true; }
    st.skills.prod_food1 = true; st.skills.prod_food2 = true;
    if (!(st.fixtures || []).some((f) => f.t === 'opensign')) st.fixtures.push({ id: Math.max(200, st.nid || 0) + 50, t: 'opensign', x: 2.25, z: 5.25, r: 0 });
    st.nid = Math.max(st.nid || 0, 300);
    st.v = 3;
  }
  if (st.v < 4) {
    // v4：大型ゴミ箱を倉庫に。段ボールは閉じた状態から
    st.fixtures = (st.fixtures || []).filter((f) => FIXTURES[f.t]);
    if (!st.fixtures.some((f) => f.t === 'dumpster')) {
      for (const [x, z, r] of [[-0.9, -11.43, 0], [3.4, -11.43, 0], [-4.3, -5.2, 1], [1, -6, 0]]) {
        const fp = fixtureFootprint('dumpster', x, z, r);
        const hit = st.fixtures.some((f) => { const o = fixtureFootprint(f.t, f.x, f.z, f.r); return o.minX < fp.maxX && o.maxX > fp.minX && o.minZ < fp.maxZ && o.maxZ > fp.minZ; });
        if (!hit) { st.fixtures.push({ id: Math.max(400, st.nid || 0) + 1, t: 'dumpster', x, z, r }); break; }
      }
    }
    st.nid = Math.max(st.nid || 0, 420);
    st.v = 4;
  }
  if (st.v < 5) {
    // v5：棚は1段3枠に。1枠＝段ボール1箱ぶん。入りきらない分は箱に戻して棚の前に置く
    const OLD2 = { shelf: 4, gondola: 4, fridge: 4 };
    let nid = Math.max(st.nid || 0, 500);
    for (const f of st.fixtures || []) {
      const def = FIXTURES[f.t];
      if (!def?.slots || !Array.isArray(f.s)) continue;
      let src = f.s;
      if (OLD2[f.t] && src.length === OLD2[f.t] * 2 * (f.t === 'gondola' ? 2 : 1)) {
        const lv = OLD2[f.t], ns = def.slots.map(() => [null, 0]);
        src.forEach((x, i) => { const side = Math.floor(i / (lv * 2)), rem = i % (lv * 2), l = Math.floor(rem / 2), c = rem % 2; ns[side * lv * 3 + l * 3 + (c ? 2 : 0)] = x; });
        src = ns;
      }
      const extra = {};
      f.s = def.slots.map((sl, i) => {
        const x = src[i]; if (!Array.isArray(x) || !x[0] || !PRODUCTS[x[0]]) return [null, 0];
        const [pid, n] = x;
        if (!canPlace(pid, sl)) { extra[pid] = (extra[pid] || 0) + (n || 0); return [null, 0]; }
        const cap = slotCapacity(pid, sl);
        if (n > cap) extra[pid] = (extra[pid] || 0) + n - cap;
        return [pid, Math.min(n || 0, cap)];
      });
      let k = 0;
      for (const [pid, n0] of Object.entries(extra)) {
        let n = n0;
        while (n > 0) {
          const take = Math.min(n, PRODUCTS[pid].qty); n -= take;
          const [x, z] = localToWorld(f, -0.4 + (k % 3) * 0.4, def.d / 2 + 0.45);
          st.boxes.push({ id: nid++, p: pid, n: take, loc: { t: 'f', x, y: Math.floor(k / 3) * 0.42, z, ry: 0 }, o: false }); k++;
        }
      }
    }
    st.nid = nid;
    st.v = 5;
  }
  if (st.v < 6) {
    // v6：建物を左右に広げた（売り場10列）。区画の番号を付け替えて、広くなった最初の売り場も使えるようにする
    const nb = {};
    for (const id of Object.keys(st.bays || {})) if (/^b\d\d$/.test(id)) nb['b' + (+id[1] + 2) + id[2]] = 1;
    for (const id of OLD_START_BAYS_V8.slice(0, 8)) nb[id] = 1;
    st.bays = nb;
    st.v = 6;
  }
  if (st.v < 7) {
    // v7：雇用枠は「従業員 No.1〜10」のスキルに。前の雇用スキルは同じ人数ぶんの枠に置きかえる
    const sk = st.skills || {}, n = sk.staff3 ? 6 : sk.staff2 ? 4 : sk.staff1 ? 2 : 0;
    delete sk.staff1; delete sk.staff2; delete sk.staff3;
    for (let i = 1; i <= Math.max(n, Math.min(10, (st.staff || []).length)); i++) sk['staff_h' + i] = true;
    (st.staff || []).slice(0, 10).forEach((o, i) => { const sl = STAFF_SLOTS[i]; o.slot = sl.no; o.spd = sl.spd; o.wage = slotWage(STAFF_ROLES[o.role] || STAFF_ROLES.stocker, sl.no); });
    if (st.staff) st.staff = st.staff.slice(0, 10);
    st.v = 7;
  }
  if (st.v < 8) {
    // v8：売り場を奥にも広げられるように（奥行き最大20m）。倉庫・マネージャー室を10m奥へ引っ越し、
    // 倉庫へつながる真ん中の奥の売り場（4区画）をプレゼント
    const dz = V13.BACK_Z - OLD_BACK_Z;
    if (!st._fresh) for (const f of st.fixtures || []) if (f.z < OLD_BACK_Z) f.z += dz;
    for (const b of st.boxes || []) if (b.loc?.t === 'f' && b.loc.z < OLD_BACK_Z && b.loc.z > -40) b.loc.z += dz;
    st.bays ||= {};
    for (const id of OLD_START_BAYS_V8) st.bays[id] = 1;
    st.v = 8;
  }
  if (st.v < 9) {
    // v9：倉庫も奥に広げられるように（手前8m＋奥8m）。マネージャー室・搬入口・奥の壁ぎわの物を8m奥へ引っ越し、
    // 真ん中の奥の倉庫をプレゼント（マネージャー室と搬入口につながる）
    const dz = V13.STOCK_Z - OLD_STOCK_Z, cut = OLD_STOCK_Z + 1;
    if (!st._fresh) for (const f of st.fixtures || []) if (f.z < cut) f.z += dz;
    for (const b of st.boxes || []) if (b.loc?.t === 'f' && b.loc.z < cut && b.loc.z > -60) b.loc.z += dz;
    st.stock ||= {};
    for (const id of V13.START_STOCK) st.stock[id] = 1;
    st.v = 9;
  }
  if (st.v < 10) {
    // v10：レベル上限30・レベルアップのSPが増えた。今のレベルまでに増えるはずだった分のSPをまとめてプレゼント
    const lv = Math.min(MAX_LEVEL, st.level || 1);
    st.sp = (st.sp || 0) + Math.max(0, spTotalNew(lv) - spTotalOld(lv));
    if ((st.level || 1) > MAX_LEVEL) { st.level = MAX_LEVEL; st.xp = 0; }
    st.v = 10;
  }
  if (st.v < 11) {
    // v11：従業員は最大15人に。日給は能力（はやさ）に見合った額に。今いる人のはやさはそのまま
    for (const o of st.staff || []) { o.spd ||= STAFF_SLOTS[(o.slot || 1) - 1]?.spd || 1; o.wage = wageFor(STAFF_ROLES[o.role] || STAFF_ROLES.stocker, o.spd); }
    st.v = 11;
  }
  if (st.v < 12) {
    // v12：倉庫係の仕事はなくなった → 品出し係に
    for (const o of st.staff || []) if (!STAFF_ROLES[o.role]) { o.role = 'stocker'; o.wage = wageFor(STAFF_ROLES.stocker, o.spd); }
    st.v = 12;
  }
  st.crates ||= [];
  if (st.v < 13) {
    // v13：倉庫の奥行きを半分に（1列8m → 4m）。v9〜v12 のセーブだけ、倉庫の中を縮めてマネージャー室を手前に戻す
    if (fromV >= 9 && !st._fresh) shrinkStorageV13(st);
    st.v = 13;
  }
  if (st.v < 14) {
    // v14：倉庫とパソコン室を店の右側へ。売り場は左と奥に広げる形に（最大 40m×20m）
    migrateV14(st);
    st.v = 14;
  }
  if (st.v < 15) {
    // v15：倉庫2・3の売り場側の出入口をなくした（出入口は倉庫1だけ）。その出入口に置いてあった段ボールは売り場側へ
    const gaps = [[-7.6, -5.6], [-12.6, -10.6]], x0 = STOCK_SECTIONS[0].x0;
    for (const o of [...(st.boxes || []), ...(st.crates || [])]) {
      const L = o.loc; if (L?.t !== 'f') continue;
      if (Math.abs(L.x - x0) < 0.45 && gaps.some(([a, b]) => L.z > a - 0.3 && L.z < b + 0.3)) { L.x = x0 - 0.55; L.y = 0; }
    }
    st.v = 15;
  }
  // 持ったままの大きい段ボールは店の前に戻す
  for (const c of st.crates) if (c.loc?.t !== 'f') c.loc = crateSpot(st);
  for (const o of st.staff || []) if (!STAFF_ROLES[o.role]) { o.role = 'stocker'; o.wage = wageFor(STAFF_ROLES.stocker, o.spd); }
  delete st._fresh;
  st.reviews ||= [];
  if (st.level >= MAX_LEVEL) st.xp = 0;
  st.market ||= {}; st.marketPrev ||= {};
  st.bays ||= Object.fromEntries(START_BAYS.map((b) => [b, 1])); st.stock ||= Object.fromEntries(START_STOCK.map((b) => [b, 1]));
  st.skills ||= { start: true }; st.prices ||= {}; st.staff ||= []; st.boxes ||= []; st.fixtures ||= [];
  st.today ||= { sales: 0, served: 0, lost: 0, orders: 0, xp: 0, vend: 0 };
  st.rev ||= 1;
  if (st.phase !== 'prep' && st.phase !== 'summary') { st.phase = 'prep'; st.time = OPEN_TIME; }
  if (st.phase === 'summary') { st.phase = 'prep'; st.day++; st.time = OPEN_TIME; st.today = { sales: 0, served: 0, lost: 0, orders: 0, xp: 0, vend: 0, recycle: 0 }; }
  for (const f of st.fixtures) {
    const def = FIXTURES[f.t];
    if (def?.slots) { f.s ||= emptySlots(f.t); while (f.s.length < def.slots.length) f.s.push([null, 0]); f.s = f.s.map((x) => (Array.isArray(x) ? [x[0] ?? null, x[1] || 0] : [null, 0])); }
  }
  st.fixtures = st.fixtures.filter((f) => FIXTURES[f.t]);
  st.boxes = st.boxes.filter((b) => PRODUCTS[b.p] || (b.p === EMPTY_BOX.id && !b.n));
  let k = 0;
  for (const b of st.boxes) if (b.loc?.t === 'h' || !b.loc) b.loc = deliverySpot(st, k++);
  return st;
}

// 設備をつくる（設置したとき）
function newFixture(st, t, x, z, r) {
  const def = FIXTURES[t];
  const f = { id: st.nid++, t, x, z, r };
  if (def.slots) f.s = emptySlots(t);
  if (def.text) { f.tx = t === 'banner' ? '食品' : t === 'neon' ? 'OPEN' : t === 'hangsign' ? '本日のおすすめ' : 'いらっしゃいませ'; f.c = t === 'neon' ? '#ff4fd8' : '#ffffff'; }
  return f;
}
// 大きい段ボールが届く場所（店の前の荷物置き場の横。ほかの箱と重ならない所）
export function crateSpot(st) {
  const taken = [...(st.crates || []).filter((c) => c.loc?.t === 'f').map((c) => [c.loc.x, c.loc.z, 0.75]), ...(st.boxes || []).filter((b) => b.loc?.t === 'f').map((b) => [b.loc.x, b.loc.z, 0.45])];
  const free = (x, z) => taken.every(([tx, tz, r]) => Math.abs(tx - x) > r + 0.55 || Math.abs(tz - z) > r + 0.45);
  for (const z of [11.0, 12.3, 13.6, 14.9]) for (const x of [-1.6, -3.0, -4.4, -5.8, -7.2, 8.6, 10.0, 11.4]) if (free(x, z)) return { t: 'f', x, y: 0, z, ry: 0 };
  return { t: 'f', x: -2 - Math.random() * 6, y: 0, z: 11 + Math.random() * 4, ry: 0 };
}
// v13：奥行き16mだった倉庫を8mに縮める（昔のレイアウトの座標のまま。はみ出しは v14 の引っ越しで直す）
function shrinkStorageV13(st) {
  const B = V13.BACK_Z, mid = V12_STOCK_Z + 1; // これより奥はマネージャー室・裏口（そのまま8m手前へ）
  const zmap = (z) => (z < mid ? z + (V13.STOCK_Z - V12_STOCK_Z) : z < B ? B + (z - B) * 0.5 : z);
  for (const f of st.fixtures) if (f.z < B) f.z = zmap(f.z);
  for (const b of st.boxes) if (b.loc?.t === 'f' && b.loc.z < B && b.loc.z > -60) b.loc.z = zmap(b.loc.z);
  for (const c of st.crates) if (c.loc?.t === 'f' && c.loc.z < B) c.loc.z = zmap(c.loc.z);
}
// 移行用：Sim のメソッド（置けるか判定・積む高さなど）を store だけで使う
function simOf(st) { const S = Object.create(Sim.prototype); S.store = st; S.dyn = newDyn(); return S; }
// 設備を大きい段ボールに戻す（棚の商品・在庫棚の箱は店の前の荷物置き場へ）
function packFixture(st, f, k0 = 40) {
  st.fixtures = st.fixtures.filter((o) => o !== f);
  let k = k0 + st.boxes.filter((b) => b.loc?.t === 'f' && inArea(b.loc, DELIVERY_AREA)).length;
  for (const b of st.boxes) if (b.loc?.t === 'r' && b.loc.fid === f.id) b.loc = deliverySpot(st, k++);
  for (const s of f.s || []) if (s[0] && s[1] > 0 && PRODUCTS[s[0]]) {
    let n = s[1];
    while (n > 0) { const take = Math.min(n, PRODUCTS[s[0]].qty); n -= take; st.boxes.push({ id: st.nid++, p: s[0], n: take, loc: deliverySpot(st, k++), o: false }); }
  }
  st.crates.push({ id: st.nid++, ft: f.t, loc: crateSpot(st) });
}
// 背中を壁（区画のふち）につけて置ける所をさがす（倉庫の中を通れるように、前は 0.9m あける）
const fixFront = (t, x, z, r, dep = 0.9) => {
  const fp = fixtureFootprint(t, x, z, r);
  return r === 0 ? { minX: fp.minX, maxX: fp.maxX, minZ: fp.maxZ, maxZ: fp.maxZ + dep } : r === 2 ? { minX: fp.minX, maxX: fp.maxX, minZ: fp.minZ - dep, maxZ: fp.minZ }
    : r === 1 ? { minX: fp.maxX, maxX: fp.maxX + dep, minZ: fp.minZ, maxZ: fp.maxZ } : { minX: fp.minX - dep, maxX: fp.minX, minZ: fp.minZ, maxZ: fp.maxZ };
};
const rectHit = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;
function placeAgainstWall(S, f, kinds) {
  const st = S.store, zs = zones(st).filter((z) => kinds.includes(z.kind));
  const cands = [];
  for (const zn of zs) for (let r = 0; r < 4; r++) {
    const fp0 = fixtureFootprint(f.t, 0, 0, r);
    for (let x = zn.minX + fp0.rw / 2; x <= zn.maxX - fp0.rw / 2 + 1e-6; x += CELL) for (let z = zn.minZ + fp0.rd / 2; z <= zn.maxZ - fp0.rd / 2 + 1e-6; z += CELL) {
      const [sx, sz] = snapFixture(f.t, x, z, r), fp = fixtureFootprint(f.t, sx, sz, r);
      const gap = r === 0 ? fp.minZ - zn.minZ : r === 2 ? zn.maxZ - fp.maxZ : r === 1 ? fp.minX - zn.minX : zn.maxX - fp.maxX;
      if (gap < -0.01 || gap > 0.8) continue;
      cands.push([gap, sx, sz, r]);
    }
  }
  cands.sort((a, b) => a[0] - b[0] || b[2] - a[2] || a[1] - b[1]);
  const others = st.fixtures.filter((o) => o !== f && !FIXTURES[o.t]?.air && !FIXTURES[o.t]?.fixed);
  for (const [, x, z, r] of cands) {
    if (S.canPlaceFixture(f.t, x, z, r, f.id) !== true) continue;
    const fr = fixFront(f.t, x, z, r), fp = fixtureFootprint(f.t, x, z, r);
    if (others.some((o) => rectHit(fr, fixtureFootprint(o.t, o.x, o.z, o.r)) || rectHit(fp, fixFront(o.t, o.x, o.z, o.r)))) continue;
    f.x = x; f.z = z; f.r = r; return true;
  }
  return false;
}
// いちばん近くの置ける所（maxD m まで）
function placeNear(S, f, maxD) {
  const st = S.store, cands = [];
  for (const zn of zones(st)) for (let r of [f.r, (f.r + 2) % 4, (f.r + 1) % 4, (f.r + 3) % 4]) {
    for (let x = zn.minX + 0.25; x < zn.maxX; x += CELL) for (let z = zn.minZ + 0.25; z < zn.maxZ; z += CELL) {
      const d = Math.hypot(x - f.x, z - f.z); if (d > maxD) continue;
      cands.push([d + (r !== f.r ? 0.6 : 0), x, z, r]);
    }
  }
  cands.sort((a, b) => a[0] - b[0]);
  for (const [, x, z, r] of cands) { const [sx, sz] = snapFixture(f.t, x, z, r); if (S.canPlaceFixture(f.t, sx, sz, r, f.id) === true) { f.x = sx; f.z = sz; f.r = r; return true; } }
  return false;
}
const expandPrice = (base, mul, i) => Math.round(base * Math.pow(mul, i) / 500) * 500;
// v14：右側の列（パソコン室＋倉庫）へ引っ越す
function migrateV14(st) {
  st.fixtures ||= []; st.boxes ||= []; st.crates ||= [];
  // 売り場：同じ場所はそのまま（列の番号は+2）。右はし（x 5〜25）の区画はなくなる → 最後に買った分から代金を返す
  const oldBays = Object.keys(st.bays || {}).filter((id) => /^b\d\d$/.test(id));
  const mapBay = (id) => { const c = +id[1] + 2, r = +id[2]; return c < SALES.cols && r < SALES.rows ? 'b' + c + r : null; };
  const nb = {};
  for (const id of oldBays) { const n = mapBay(id); if (n) nb[n] = 1; }
  for (const id of START_BAYS) nb[id] = 1;
  // 昔の「最初からある区画」のうち、新しい最初の区画より多い分（タダでもらった分）は拡張の値段に数えない
  st.freeBays = OLD_START_BAYS_V8.map(mapBay).filter((id) => id && !START_BAYS.includes(id)).length;
  const oldPaid = Math.max(0, oldBays.length - OLD_START_BAYS_V8.length);
  const newPaid = Math.max(0, Object.keys(nb).length - START_BAYS.length - st.freeBays);
  let refund = 0;
  for (let i = newPaid; i < oldPaid; i++) refund += expandPrice(15000, 1.14, i);
  st.bays = nb;
  // 倉庫：買い足した数だけ奥へ（最大2区画）。入りきらない分は代金を返す
  const oldStock = Object.keys(st.stock || {}).filter((id) => V13.STOCK_IDS.includes(id));
  const sPaid = Math.max(0, oldStock.length - V13.START_STOCK.length);
  const ns = Object.fromEntries(START_STOCK.map((b) => [b, 1]));
  const more = STOCK_SECTIONS.filter((s) => !ns[s.id]).sort((a, b) => a.r - b.r);
  const give = Math.min(sPaid, more.length);
  for (const s of more.slice(0, give)) ns[s.id] = 1;
  for (let i = give; i < sPaid; i++) refund += expandPrice(30000, 1.3, i);
  st.stock = ns;
  st.moveNote = refund || 1; // 次に開いたとき「改装しました」と知らせる
  if (refund) st.money = (st.money || 0) + refund;
  // パソコン室のボードとリサイクルボックスは新しい場所へ（古い発注パソコンは片づける）
  const init = initialFixtures();
  st.fixtures = st.fixtures.filter((f) => f.t !== 'pc');
  for (const t of ['mboard', 'fboard', 'xboard', 'recycle']) {
    const d = init.find((f) => f.t === t), list = st.fixtures.filter((f) => f.t === t);
    if (!list.length) st.fixtures.push({ ...d, id: st.nid++ });
    list.forEach((f, i) => { if (i === 0) { f.x = d.x; f.z = d.z; f.r = d.r; } else st.fixtures = st.fixtures.filter((o) => o !== f); });
  }
  if (st._fresh) return; // v1 から作り直したセーブは、もう新しい配置
  const S = simOf(st), B = V13.BACK_Z;
  const isStore = (f) => !FIXTURES[f.t]?.fixed;
  // 1) 昔の倉庫（建物の奥）の設備：新しい倉庫の壁ぎわへ。在庫棚から先に。入らなければ大きい段ボールに
  const back = st.fixtures.filter((f) => isStore(f) && f.z < B).sort((a, b) => (FIXTURES[b.t].boxSlots?.length || 0) - (FIXTURES[a.t].boxSlots?.length || 0));
  for (const f of back) { f.x = 1e4; f.z = 1e4; } // いったんどかしておく（おたがいに重ならないように）
  for (const f of back) if (!placeAgainstWall(S, f, ['storage'])) packFixture(st, f);
  // 2) 売り場の設備：なくなった区画の物は大きい段ボールに。残る区画で壁・出入口と重なった物は近くへ（3mまで）
  for (const f of [...st.fixtures]) {
    if (!isStore(f) || back.includes(f)) continue;
    if (S.canPlaceFixture(f.t, f.x, f.z, f.r, f.id) === true) continue;
    const inBay = !!st.bays[bayAt(f.x, f.z)];
    const ox = f.x, oz = f.z, or = f.r;
    if (inBay && placeNear(S, f, 3)) continue;
    f.x = ox; f.z = oz; f.r = or;
    packFixture(st, f);
  }
  // 3) 床の段ボール：昔の倉庫の物は新しい倉庫の床へ。建物の中で使えない所にある物は店の前へ
  let k = 60 + st.boxes.filter((b) => b.loc?.t === 'f' && inArea(b.loc, DELIVERY_AREA)).length;
  const zs = zones(st), inZone = (x, z) => zs.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ && o.kind !== 'office');
  for (const b of st.boxes) {
    const L = b.loc; if (L?.t !== 'f') continue;
    if (L.z < B && L.z > -60) {
      const sp = S.storageFloorSpot(STAFF_HOME[0], STAFF_HOME[1], b);
      if (sp) { b.loc = { t: 'f', x: sp[0], y: S.stackHeight(sp[0], sp[1], b), z: sp[1], ry: L.ry || 0 }; continue; }
      b.loc = deliverySpot(st, k++); continue;
    }
    if (L.z <= BUILDING.maxZ && !inZone(L.x, L.z)) b.loc = deliverySpot(st, k++); // 店の前（歩道より手前）以外で使えない所
  }
  // 4) 外に置いてあった大きい段ボールで、建物の中や奥に入ってしまった物は店の前へ
  for (const c of st.crates) if (c.loc?.t === 'f' && c.loc.z <= BUILDING.maxZ && !inZone(c.loc.x, c.loc.z)) c.loc = crateSpot(st);
  for (const b of st.boxes) if (b.loc?.t === 'f') b.loc.y = S.stackHeight(b.loc.x, b.loc.z, b);
}
// 設備を置く場所：狙った所に置けないとき（壁・柱・ほかの棚に少しかかる、区画のはしを狙ったなど）は、
// となり（1m、大きい物は少し広く）で置ける所に寄せる。avoid(x, z) が true の所（自分と重なる所など）はよける
export function fitPlacement(store, type, x, z, r, ignoreId, avoid = () => false) {
  const S = { store }, chk = (xx, zz) => Sim.prototype.canPlaceFixture.call(S, type, xx, zz, r, ignoreId);
  const check = chk(x, z);
  if (check === true && !avoid(x, z)) return { x, z, ok: true, why: true };
  // 寄せる範囲：1m（大きい物は半分の大きさ＋0.5mまで。壁の根元を狙っても背中を壁につけて置ける）
  const fp = fixtureFootprint(type, 0, 0, r), R = Math.max(1, Math.ceil((Math.max(fp.rw, fp.rd) / 2 + 0.5) * 2) / 2);
  const steps = []; for (let v = -R; v <= R + 1e-6; v += 0.5) steps.push(v);
  const cands = [];
  for (const dx of steps) for (const dz of steps) {
    if (!dx && !dz) continue;
    const [cx, cz] = snapFixture(type, x + dx, z + dz, r);
    cands.push([Math.hypot(cx - x, cz - z), cx, cz]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  for (const [, cx, cz] of cands) if (!avoid(cx, cz) && chk(cx, cz) === true) return { x: cx, z: cz, ok: true, why: true };
  return { x, z, ok: false, why: check === true ? '自分と重なっています（少し離れてね）' : check };
}
function deliverySpot(st, k) {
  const A = DELIVERY_AREA, cols = Math.floor((A.maxX - A.minX) / 0.7), rows = Math.floor((A.maxZ - A.minZ) / 0.56);
  const per = cols * rows, layer = Math.floor(k / per), i = k % per;
  const j = ((k * 2654435761) >>> 0) / 4294967296; // 少しだけバラつかせる
  return { t: 'f', x: A.minX + 0.35 + (i % cols) * 0.7 + (j - 0.5) * 0.08, y: layer * 0.42, z: A.minZ + 0.3 + Math.floor(i / cols) * 0.56 + (j - 0.5) * 0.06, ry: (j - 0.5) * 0.5 };
}

export function newDyn() { return { customers: [], staffRt: {}, regs: {}, deliveries: [], spawnT: 3, cid: 1 }; }

const BUBBLE_T = 2.6;

export class Sim {
  constructor(store) {
    this.store = normalizeStore(store);
    this.dyn = newDyn();
    this.nav = new NavGrid();
    this.nav.build(this.store);
    this.events = [];
    this.players = {}; // uid -> {x,z,name}
    this.dynRev = 0;
    if (this.store.moveNote) {
      const r = this.store.moveNote; delete this.store.moveNote;
      this.toast(null, '🏗️ お店を改装しました！倉庫とパソコン室は入口の右側へ。売り場は左と奥に広げられます' + (r > 1 ? `（使えなくなった区画の代金 ¥${r.toLocaleString()} を返金）` : ''), 'ok');
    }
  }
  bump() { this.store.rev++; }
  ev(e) { this.events.push(e); }
  toast(to, msg, kind = 'info') { this.ev({ t: 'toast', to, msg, kind }); }
  err(to, msg) { this.ev({ t: 'toast', to, msg, kind: 'err' }); this.ev({ t: 'sfx', s: 'err', to }); }
  // 発注・スキル・従業員・拡張などは、マネージャー室（パソコン室）のボードの前でしかできない
  atBoard(uid) {
    if (this.requireBoard === false) return true;
    const p = this.players[uid];
    if (!p) return false;
    const m = 0.8;
    if (p.x > MANAGER.x0 - m && p.x < MANAGER.x1 + m && p.z > MANAGER.z0 - m && p.z < MANAGER.z1 + m) return true;
    return this.store.fixtures.some((f) => BOARD_TYPES.includes(f.t) && dist(p.x, p.z, f.x, f.z) < 3.2);
  }
  sfx(s, x, z) { this.ev({ t: 'sfx', s, x, z }); }
  fx(id) { return this.store.fixtures.find((f) => f.id === id); }
  box(id) { return this.store.boxes.find((b) => b.id === id); }
  heldBox(who) { return this.store.boxes.find((b) => b.loc.t === 'h' && b.loc.who === who); }
  reg(fid) { return (this.dyn.regs[fid] ||= { q: [], op: null, belt: [], ph: 'idle', pay: null, cust: null }); }
  hasSkill(id) { return !!this.store.skills[id]; }

  // ---------- プレイヤー操作 ----------
  act(uid, a) {
    const fn = this['a_' + a.t];
    if (!fn) return;
    try { fn.call(this, uid, a); } catch (e) { console.error('action error', a, e); }
  }
  a_pick(uid, a) {
    if (this.heldBox(uid) || this.heldCrate(uid)) return this.err(uid, 'すでに箱を持っています');
    const b = this.box(a.bid);
    if (!b || b.loc.t === 'h') return;
    if (b.loc.t === 'f') { // 上に積まれた箱があれば上から取る
      const top = this.store.boxes.filter((o) => o.loc.t === 'f' && Math.abs(o.loc.x - b.loc.x) < 0.3 && Math.abs(o.loc.z - b.loc.z) < 0.3).sort((p, q) => q.loc.y - p.loc.y)[0];
      if (top && top !== b && top.loc.y > b.loc.y) return this.a_pick(uid, { bid: top.id });
    }
    b.loc = { t: 'h', who: uid }; delete b.drop;
    this.sfx('pick'); this.bump();
  }
  a_drop(uid, a) {
    const b = this.heldBox(uid);
    if (!b) return;
    const x = clamp(+a.x || 0, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX), z = clamp(+a.z || 0, PLAYER_BOUNDS.minZ, PLAYER_BOUNDS.maxZ);
    b.loc = { t: 'f', x, y: this.stackHeight(x, z, b), z, ry: +a.ry || 0 };
    this.sfx('place'); this.bump();
  }
  stackHeight(x, z, self) {
    let y = 0;
    for (const o of this.store.boxes) {
      if (o === self || o.loc.t !== 'f') continue;
      if (Math.abs(o.loc.x - x) < 0.4 && Math.abs(o.loc.z - z) < 0.35) y = Math.max(y, o.loc.y + BOX_SIZES[boxProd(boxLook(o)).bx][1]);
    }
    return Math.min(y, 2.4);
  }
  a_rackBox(uid, a) {
    const b = this.heldBox(uid), f = this.fx(a.fid);
    if (!b || !f || !FIXTURES[f.t].boxSlots) return;
    const si = a.si | 0;
    if (si < 0 || si >= FIXTURES[f.t].boxSlots.length) return;
    if (this.store.boxes.some((o) => o.loc.t === 'r' && o.loc.fid === f.id && o.loc.si === si)) return this.err(uid, 'その場所は埋まっています');
    b.loc = { t: 'r', fid: f.id, si };
    this.sfx('place'); this.bump();
  }
  // 段ボールを開ける／閉じる（開けている間だけ棚に出し入れできる）
  a_boxOpen(uid, a) {
    const b = this.heldBox(uid) || (a.bid != null ? this.box(a.bid) : null);
    if (!b || (b.loc.t === 'h' && b.loc.who !== uid)) return;
    b.o = a.open == null ? !b.o : !!a.open;
    this.sfx(b.o ? 'boxopen' : 'boxclose'); this.bump();
  }
  a_discard(uid, a = {}) {
    const b = this.heldBox(uid);
    if (!b) return;
    if (b.n > 0) return this.err(uid, '中身が残っている箱は捨てられません');
    const f = a.fid != null ? this.fx(a.fid) : null;
    if (!f || !TRASH_TYPES.includes(f.t)) return this.err(uid, '空の段ボールはゴミ箱に捨てよう');
    this.store.boxes = this.store.boxes.filter((o) => o !== b);
    this.sfx('trash'); this.bump();
  }
  a_stock(uid, a) {
    const b = this.heldBox(uid), f = this.fx(a.fid);
    if (!b || !f || !f.s) return;
    const r = this.stockOne(b, f, a.si | 0);
    if (r === 'kind') this.err(uid, `${PRODUCTS[b.p].name}はこの棚に置けません`);
    else if (r === 'other') this.err(uid, '別の商品が置かれています');
    else if (r === 'full') this.err(uid, '棚がいっぱいです');
    else if (r === 'empty') this.err(uid, '箱が空です');
    else if (r === 'closed') this.err(uid, '段ボールを開けてから補充しよう');
  }
  stockOne(b, f, si) {
    const slot = FIXTURES[f.t].slots[si], s = f.s[si];
    if (!slot || !s) return 'bad';
    if (!b.o) return 'closed';
    if (b.n <= 0) return 'empty';
    if (s[0] && s[0] !== b.p) { if (s[1] > 0) return 'other'; }
    if (!canPlace(b.p, slot)) return 'kind';
    s[0] = b.p;
    if (s[1] >= slotCapacity(b.p, slot)) return 'full';
    s[1]++; b.n--;
    this.sfx('stock', f.x, f.z); this.bump();
    return 'ok';
  }
  a_unstock(uid, a) {
    const b = this.heldBox(uid), f = this.fx(a.fid);
    if (!b || !f || !f.s) return;
    const s = f.s[a.si | 0];
    if (!s || !s[0] || s[1] <= 0) return;
    if (!b.o) return this.err(uid, '段ボールを開けてから回収しよう');
    // 空の段ボールには、どの商品でも1種類だけ詰められる（詰めるとその商品の箱になる）
    if (b.p !== s[0] && b.n > 0) return this.err(uid, `この箱には${PRODUCTS[b.p]?.name || '別の商品'}が入っています（1箱に1種類だけ）`);
    if (b.n >= PRODUCTS[s[0]].qty) return this.err(uid, '箱がいっぱいです');
    b.p = s[0]; s[1]--; b.n++;
    this.sfx('pick'); this.bump();
  }
  a_clearSlot(uid, a) {
    const f = this.fx(a.fid); if (!f?.s) return;
    const s = f.s[a.si | 0];
    if (s && s[1] === 0) { s[0] = null; this.bump(); }
  }
  a_price(uid, a) {
    if (!PRODUCTS[a.pid]) return;
    if (a.v == null || a.v === 'market') delete this.store.prices[a.pid]; // 相場に合わせる
    else this.store.prices[a.pid] = clamp(Math.round(+a.v || 0), 1, 999999);
    this.bump();
  }
  a_priceAll(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const k = +a.k || 1;
    for (const p of PRODUCTS_LIST) { if (!productUnlocked(p.id, this.store.skills)) continue; if (k === 1) delete this.store.prices[p.id]; else this.store.prices[p.id] = Math.max(1, Math.round(marketPrice(this.store, p.id) * k / 10) * 10 - 2); }
    this.toast(uid, k === 1 ? '全商品を相場どおりにしました' : `全商品を相場の${Math.round(k * 100)}%にしました`, 'ok');
    this.bump();
  }
  a_order(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const items = (a.items || []).filter(([p, n]) => n > 0 && (p === EMPTY_BOX.id || (PRODUCTS[p] && productUnlocked(p, this.store.skills)))).map(([p, n, half]) => [p, Math.min(ORDER_MAX_BOXES, n | 0), half && p !== EMPTY_BOX.id ? 1 : 0]);
    if (!items.length) return;
    const boxes = items.reduce((t, [, n]) => t + n, 0);
    if (boxes > ORDER_MAX_BOXES) return this.err(uid, `1回の配達は最大${ORDER_MAX_BOXES}箱までです`);
    const goods = orderCost(this.store, items), cost = goods + SHIPPING_FEE;
    if (cost > this.store.money) return this.err(uid, 'お金が足りません（送料もかかります）');
    this.store.money -= cost; this.store.today.orders += goods; this.store.today.ship = (this.store.today.ship || 0) + SHIPPING_FEE;
    this.dyn.deliveries.push({ t: this.hasSkill('mk_express') ? 0.6 : 10, items });
    this.toast(null, this.hasSkill('mk_express') ? '発注しました！すぐ店の前に届きます' : '発注しました！10秒ほどで店の前に届きます', 'ok');
    this.sfx('cash'); this.bump();
  }
  // 設備を買う：店の前に大きい段ボールで届く（持って置きたい場所で開けると設置される）
  a_buy(uid, a) {
    const st = this.store, def = FIXTURES[a.ft];
    if (!def || def.fixed || !fixtureUnlocked(a.ft, st.skills)) return;
    if (def.price > st.money) return this.err(uid, 'お金が足りません');
    const count = (t) => st.fixtures.filter((f) => f.t === t).length + st.crates.filter((c) => c.ft === t).length;
    if (a.ft === 'checkout' && count('checkout') >= checkoutLimit(st.skills)) return this.err(uid, 'レジはこれ以上置けません（スキルで増設）');
    if (a.ft === 'selfcheckout' && count('selfcheckout') >= SELF_MAX) return this.err(uid, `セルフレジは${SELF_MAX}台までです`);
    st.money -= def.price;
    const c = { id: st.nid++, ft: a.ft, loc: crateSpot(st), drop: 1 };
    st.crates.push(c);
    this.toast(uid, `📦 ${def.icon} ${def.name}が大きい段ボールで店の前に届きます！持って、置きたい場所で「ここに置く」`, 'ok');
    this.sfx('truck'); this.bump();
  }
  heldCrate(who) { return this.store.crates.find((c) => c.loc.t === 'h' && c.loc.who === who); }
  crate(id) { return this.store.crates.find((c) => c.id === id); }
  a_cratePick(uid, a) {
    if (this.heldBox(uid) || this.heldCrate(uid)) return this.err(uid, 'すでに箱を持っています');
    const c = this.crate(a.cid);
    if (!c || c.loc.t === 'h') return;
    c.loc = { t: 'h', who: uid }; delete c.drop;
    this.sfx('pick'); this.bump();
  }
  a_crateDrop(uid, a) {
    const c = this.heldCrate(uid);
    if (!c) return;
    const x = clamp(+a.x || 0, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX), z = clamp(+a.z || 0, PLAYER_BOUNDS.minZ, PLAYER_BOUNDS.maxZ);
    c.loc = { t: 'f', x, y: 0, z, ry: +a.ry || 0 };
    this.sfx('place'); this.bump();
  }
  // 持っている大きい段ボールを開けて、その場所に設置する
  a_unpack(uid, a) {
    const st = this.store, c = this.heldCrate(uid);
    if (!c) return;
    const def = FIXTURES[c.ft]; if (!def) return;
    const r = a.r & 3;
    const ok = this.canPlaceFixture(c.ft, a.x, a.z, r, null, true);
    if (ok !== true) return this.err(uid, ok);
    st.fixtures.push(newFixture(st, c.ft, a.x, a.z, r));
    st.crates = st.crates.filter((o) => o !== c);
    this.nav.build(st);
    this.toast(uid, `🔨 ${def.icon} ${def.name}を置きました！`, 'ok');
    this.sfx('build', a.x, a.z); this.bump();
  }
  // 段ボールのままなら返品できる（全額もどる）
  a_crateReturn(uid, a) {
    const st = this.store, c = this.crate(a.cid);
    if (!c || (c.loc.t === 'h' && c.loc.who !== uid)) return;
    const def = FIXTURES[c.ft];
    st.crates = st.crates.filter((o) => o !== c);
    st.money += def?.price || 0;
    this.toast(uid, `↩ ${def?.name || '設備'}を返品しました（+${(def?.price || 0).toLocaleString()}円）`, 'ok');
    this.sfx('coin'); this.bump();
  }
  a_move(uid, a) {
    const f = this.fx(a.fid);
    if (!f || FIXTURES[f.t].fixed) return;
    const r = a.r & 3;
    const ok = this.canPlaceFixture(f.t, a.x, a.z, r, f.id);
    if (ok !== true) return this.err(uid, ok);
    f.x = a.x; f.z = a.z; f.r = r;
    if (this.dyn.regs[f.id]) this.resetReg(f.id, true);
    this.nav.build(this.store);
    this.sfx('build', a.x, a.z); this.bump();
  }
  a_sell(uid, a) {
    const f = this.fx(a.fid);
    if (!f || FIXTURES[f.t].fixed) return;
    const def = FIXTURES[f.t];
    if (f.s && f.s.some((s) => s[1] > 0)) return this.err(uid, '商品が並んでいる棚は売却できません');
    if (this.store.boxes.some((b) => b.loc.t === 'r' && b.loc.fid === f.id)) return this.err(uid, '箱が載っている在庫棚は売却できません');
    if (def.cat === 'checkout' && this.dyn.regs[f.id]) this.resetReg(f.id, true);
    delete this.dyn.regs[f.id];
    this.store.fixtures = this.store.fixtures.filter((o) => o !== f);
    this.store.money += Math.floor(def.price / 2);
    this.nav.build(this.store);
    this.sfx('cash'); this.bump();
  }
  a_text(uid, a) {
    const f = this.fx(a.fid);
    if (!f || !FIXTURES[f.t].text) return;
    f.tx = String(a.v || '').slice(0, 24); if (a.c) f.c = String(a.c).slice(0, 9);
    this.bump();
  }
  a_storeName(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    this.store.name = String(a.v || '').slice(0, 16) || 'マートメイツ';
    if (a.c) this.store.color = String(a.c).slice(0, 9);
    this.bump();
  }
  a_expand(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const st = this.store, t = expandTargets(st).find((x) => x.id === a.id);
    if (!t) return;
    if (!t.can) return this.err(uid, t.kind === 'bay' ? '買ってある売り場のとなりから広げてください' : '使っている倉庫のとなりから広げてください');
    if (st.money < t.cost) return this.err(uid, 'お金が足りません');
    st.money -= t.cost;
    const before = STOCK_SECTIONS.filter((x) => doorOpen(st, x)).map((x) => x.id);
    if (t.kind === 'bay') st.bays[t.id] = 1; else st.stock[t.id] = 1;
    this.nav.build(st);
    this.toast(null, t.kind === 'bay' ? '🧱 売り場を広げました！' : '📦 倉庫を広げました！', 'ok');
    // 新しく開いた倉庫の出入口の前に設備があれば知らせる（倉庫どうしは中でつながっているので、ふさがっていても使える）
    for (const x of STOCK_SECTIONS) {
      if (before.includes(x.id) || !doorOpen(st, x)) continue;
      const r = { minX: x.x0 - 1.2, maxX: x.x0 + 1.2, minZ: x.door[0] - 0.4, maxZ: x.door[1] + 0.4 };
      const blocked = st.fixtures.some((f) => { if (FIXTURES[f.t]?.air) return false; const o = fixtureFootprint(f.t, f.x, f.z, f.r); return o.minX < r.maxX && o.maxX > r.minX && o.minZ < r.maxZ && o.maxZ > r.minZ; });
      if (blocked) this.toast(uid, `🚪 ${x.name}の出入口の前に設備があります。通れるように動かしてね`, 'warn');
    }
    this.sfx('build'); this.bump();
  }
  a_recycle(uid) {
    const b = this.heldBox(uid);
    if (!b) return;
    if (b.n > 0) return this.err(uid, '空の箱だけリサイクルできます');
    const v = this.hasSkill('mk_recycle') ? 160 : 80;
    this.store.boxes = this.store.boxes.filter((o) => o !== b);
    this.store.money += v; this.store.today.recycle = (this.store.today.recycle || 0) + v;
    this.toast(uid, `♻️ リサイクル +¥${v}`, 'money');
    this.sfx('cash'); this.bump();
  }
  // 入口の看板を OPEN / CLOSED に裏返す
  a_open(uid) {
    const st = this.store;
    if (st.phase === 'prep') { st.phase = 'open'; this.toast(null, '🟢 看板をOPENにしました！営業スタート', 'ok'); this.sfx('bell'); }
    else if (st.phase === 'open') { st.phase = 'closing'; this.toast(null, '🔴 看板をCLOSEDに。最後のお客さんの会計をしたら1日が終わります'); this.sfx('click'); }
    this.bump();
  }
  a_nextDay(uid) {
    const st = this.store;
    if (st.phase !== 'summary') return;
    st.phase = 'prep'; st.day++; st.time = OPEN_TIME;
    st.today = { sales: 0, served: 0, lost: 0, orders: 0, xp: 0, vend: 0, recycle: 0 };
    this.updateMarket();
    this.dyn.customers = [];
    for (const fid in this.dyn.regs) this.resetReg(+fid, true);
    // 相場ニュース（いちばん上がった／下がった商品）
    let up = null, down = null;
    for (const p of PRODUCTS_LIST) {
      if (!productUnlocked(p.id, st.skills)) continue;
      const prev = st.marketPrev?.[p.id], now = marketPrice(st, p.id); if (!prev) continue;
      const d = (now - prev) / prev;
      if (!up || d > up[1]) up = [p.id, d];
      if (!down || d < down[1]) down = [p.id, d];
    }
    this.ev({ t: 'newday', day: st.day, up: up && up[1] > 0.03 ? [up[0], Math.round(up[1] * 100)] : null, down: down && down[1] < -0.03 ? [down[0], Math.round(-down[1] * 100)] : null });
    this.bump();
  }
  // 相場の変動（ゆるやかに平均へ戻るランダムウォーク）
  updateMarket() {
    const st = this.store;
    st.marketPrev = {};
    for (const p of PRODUCTS_LIST) {
      const m = st.market[p.id] ?? 1;
      st.marketPrev[p.id] = marketPrice(st, p.id);
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.09;
      st.market[p.id] = +clamp(1 + (m - 1) * 0.8 + g, 0.75, 1.35).toFixed(3);
    }
  }
  a_skill(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const sk = SKILLS[a.id], st = this.store;
    if (!sk || st.skills[sk.id]) return;
    if (!sk.req.every((r) => st.skills[r])) return this.err(uid, '前のスキルを先に解放してください');
    if (sk.lv && st.level < sk.lv) return this.err(uid, `お店のレベルが${sk.lv}になると解放できます`);
    if (st.sp < sk.cost) return this.err(uid, 'スキルポイントが足りません');
    st.sp -= sk.cost; st.skills[sk.id] = true;
    if (sk.id === 'exp1' || sk.id === 'exp2') this.nav.build(st);
    const who = this.room ? this.players[uid]?.name : null;
    this.toast(null, `🌟 ${who ? who + 'さんが' : ''}スキル「${sk.name}」を解放！（のこりSP ${st.sp}）`, 'ok');
    this.sfx('levelup'); this.bump();
  }
  a_hire(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const st = this.store, role = STAFF_ROLES[a.role];
    if (!role) return;
    // どの枠（No.1〜15）の人を雇うか。指定がなければ空いている一番若い番号
    const used = new Set(st.staff.map((o) => o.slot));
    const no = a.slot ? a.slot | 0 : (STAFF_SLOTS.find((sl) => staffSlotOpen(st.skills, sl.no) && !used.has(sl.no))?.no || 0);
    const sl = STAFF_SLOTS.find((o) => o.no === no);
    if (!sl || !staffSlotOpen(st.skills, no)) return this.err(uid, 'スキルボードで「従業員」の枠を解放してください');
    if (used.has(no)) return this.err(uid, 'その枠にはもう人がいます');
    const seed = (a.seed >>> 0) || randi(1, 1e9);
    const s = { id: st.nid++, role: a.role, name: staffName(a.name) || pick(STAFF_NAMES), seed, slot: no, spd: sl.spd, wage: slotWage(role, no) };
    st.staff.push(s);
    this.toast(null, `No.${no}「${sl.title}」な${s.name}さんを${role.name}として雇いました！（日給 ¥${s.wage.toLocaleString()}）`, 'ok');
    this.sfx('bell'); this.bump();
  }
  // 従業員の仕事を変える
  // 従業員の名前を変える
  a_staffName(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const s = this.store.staff.find((o) => o.id === a.sid), name = staffName(a.name);
    if (!s || !name || s.name === name) return;
    this.toast(null, `${s.name}さんの名前を「${name}」にしました`, 'ok');
    s.name = name; this.bump();
  }
  a_staffRole(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const st = this.store, s = st.staff.find((o) => o.id === a.sid), role = STAFF_ROLES[a.role];
    if (!s || !role || s.role === a.role) return;
    this.releaseStaff(s);
    s.role = a.role; s.wage = wageFor(role, s.spd || STAFF_SLOTS[(s.slot || 1) - 1]?.spd);
    this.toast(null, `${s.name}さんを${role.name}にしました`, 'ok');
    this.bump();
  }
  releaseStaff(s) {
    const who = 's:' + s.id, rt = this.dyn.staffRt[s.id];
    const b = this.heldBox(who);
    if (b) b.loc = { t: 'f', x: rt?.x ?? STAFF_HOME[0], y: this.stackHeight(rt?.x ?? STAFF_HOME[0], rt?.z ?? STAFF_HOME[1], b), z: rt?.z ?? STAFF_HOME[1], ry: 0 };
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === who) this.dyn.regs[fid].op = null;
    if (rt) { rt.st = 'idle'; rt.t = 0.5; rt.path = null; rt.bid = null; rt.fid = null; rt.msg = null; }
  }
  a_fire(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const st = this.store, s = st.staff.find((o) => o.id === a.sid);
    if (!s) return;
    const who = 's:' + s.id;
    const b = this.heldBox(who); const rt = this.dyn.staffRt[s.id];
    if (b) b.loc = { t: 'f', x: rt?.x ?? STAFF_HOME[0], y: this.stackHeight(rt?.x ?? STAFF_HOME[0], rt?.z ?? STAFF_HOME[1], b), z: rt?.z ?? STAFF_HOME[1], ry: 0 };
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === who) this.dyn.regs[fid].op = null;
    st.staff = st.staff.filter((o) => o !== s);
    delete this.dyn.staffRt[s.id];
    this.bump();
  }
  a_regEnter(uid, a) {
    const f = this.fx(a.fid);
    if (!f || f.t !== 'checkout') return;
    const r = this.reg(f.id);
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === uid) this.dyn.regs[fid].op = null;
    if (r.op && !String(r.op).startsWith('s:') && r.op !== uid) return this.err(uid, '他のプレイヤーが担当中です');
    if (r.op && String(r.op).startsWith('s:')) { const rt = this.dyn.staffRt[r.op.slice(2)]; if (rt) { rt.st = 'idle'; rt.t = 2; } }
    r.op = uid; this.dynRev++;
  }
  a_regLeave(uid) {
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === uid) this.dyn.regs[fid].op = null;
    this.dynRev++;
  }
  a_scan(uid, a) {
    const r = this.dyn.regs[a.fid];
    if (!r || r.op !== uid || r.ph !== 'scan') return;
    this.scanItem(a.fid, r, a.i | 0);
    if (this.hasSkill('mk_scan')) { const j = r.belt.findIndex((b) => !b.s); if (j >= 0) this.scanItem(a.fid, r, j); }
  }
  scanItem(fid, r, i) {
    const it = r.belt[i];
    if (!it || it.s) return;
    it.s = 1;
    const f = this.fx(fid);
    this.sfx('scan', f?.x, f?.z);
    if (r.belt.every((b) => b.s)) {
      const total = r.belt.reduce((s, b) => s + b.price, 0);
      const m = Math.random() < 0.55 ? 'card' : 'cash';
      r.ph = 'pay'; r.pay = { m, total, given: m === 'cash' ? cashGiven(total) : total };
    }
    this.dynRev++;
  }
  a_pay(uid, a) {
    const r = this.dyn.regs[a.fid];
    if (!r || r.op !== uid || r.ph !== 'pay') return;
    if (r.pay.m === 'cash' && (a.change | 0) !== r.pay.given - r.pay.total) return this.err(uid, `おつりが違います（${(a.change | 0).toLocaleString()}円）`);
    this.completeSale(a.fid, r, uid);
  }
  playerLeft(uid) {
    const p = this.players[uid];
    const b = this.heldBox(uid);
    if (b) b.loc = { t: 'f', x: p?.x ?? 0, y: 0, z: p?.z ?? 0, ry: 0 };
    const c = this.heldCrate(uid);
    if (c) c.loc = { t: 'f', x: p?.x ?? 0, y: 0, z: p?.z ?? 0, ry: 0 };
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === uid) this.dyn.regs[fid].op = null;
    delete this.players[uid];
    this.bump();
  }

  canPlaceFixture(t, x, z, r, ignoreId) {
    const def = FIXTURES[t], st = this.store;
    const fp = fixtureFootprint(t, x, z, r);
    const eps = 0.01;
    const zs = zones(st);
    // 全セルが使える区画の中か
    for (let cx = fp.minX + CELL / 2; cx < fp.maxX; cx += CELL) for (let cz = fp.minZ + CELL / 2; cz < fp.maxZ; cz += CELL) {
      const zone = zs.find((zn) => cx > zn.minX && cx < zn.maxX && cz > zn.minZ && cz < zn.maxZ);
      if (!zone) return '買ってある区画の中にしか置けません';
      if (zone.kind === 'office') return 'パソコン室には置けません';
      if (def.place === 'sales' && zone.kind !== 'sales') return 'これは売り場にしか置けません';
    }
    const hit = (o) => fp.minX < o.maxX - eps && fp.maxX > o.minX + eps && fp.minZ < o.maxZ - eps && fp.maxZ > o.minZ + eps;
    const walls = getWalls(st);
    if (walls.some((w) => w.type === 'pillar' && hit(w))) return '柱と重なっています';
    if (walls.some(hit)) return '壁と重なっています';
    if (!def.air && keepClear(st).some(hit)) return '入口・通路・荷受け場には置けません';
    for (const f of this.store.fixtures) {
      if (f.id === ignoreId) continue;
      if (!!FIXTURES[f.t]?.air !== !!def.air) continue; // 天井から吊るす物と床に置く物は重なってOK
      if (hit(fixtureFootprint(f.t, f.x, f.z, f.r))) return def.air ? 'ほかの吊り看板と重なっています' : '他の設備と重なっています';
    }
    if (def.cat === 'checkout' && t === 'checkout' && ignoreId == null) {
      if (this.store.fixtures.filter((f) => f.t === 'checkout').length >= checkoutLimit(st.skills)) return 'レジはこれ以上置けません（スキルで増設）';
    }
    if (t === 'selfcheckout' && ignoreId == null && this.store.fixtures.filter((f) => f.t === 'selfcheckout').length >= SELF_MAX) return `セルフレジは${SELF_MAX}台までです`;
    return true;
  }

  // ---------- 毎フレーム更新 ----------
  tick(dt) {
    dt = Math.min(dt, 0.1);
    const st = this.store, dyn = this.dyn;
    if (st.phase === 'open' || st.phase === 'closing') {
      st.time += dt * GAME_MIN_PER_SEC;
      if (st.phase === 'open' && st.time >= closeTime(st.skills)) {
        st.phase = 'closing'; this.toast(null, '閉店時間です！最後のお客さんの会計をしよう', 'warn'); this.bump();
      }
      if (st.phase === 'open') this.updateSpawn(dt);
      if (st.phase === 'closing' && dyn.customers.length === 0) this.finishDay();
    }
    if (dyn.dropT > 0 && (dyn.dropT -= dt) <= 0) { for (const b of st.boxes) delete b.drop; } // 落下演出の印は数秒で消す
    for (const d of dyn.deliveries) d.t -= dt;
    const ready = dyn.deliveries.filter((d) => d.t <= 0);
    if (ready.length) {
      dyn.deliveries = dyn.deliveries.filter((d) => d.t > 0);
      for (const d of ready) this.deliver(d.items);
    }
    for (const c of dyn.customers) this.updateCustomer(c, dt);
    dyn.customers = dyn.customers.filter((c) => !c.gone);
    for (const s of st.staff) this.updateStaff(s, dt);
    for (const fid in dyn.regs) this.updateReg(+fid, dyn.regs[fid], dt);
  }

  deliver(items) {
    let k = this.store.boxes.filter((b) => b.loc.t === 'f' && inArea(b.loc, DELIVERY_AREA)).length;
    for (const [p, n, half] of items) for (let i = 0; i < n; i++) {
      if (!PRODUCTS[p] && p !== EMPTY_BOX.id) continue;
      const loc = deliverySpot(this.store, k++);
      loc.y = this.stackHeight(loc.x, loc.z, null);
      this.store.boxes.push({ id: this.store.nid++, p, n: PRODUCTS[p] ? boxUnits(p, half) : 0, loc, o: false, drop: 1 });
    }
    this.toast(null, '📦 店の前に段ボールが届きました！倉庫に運ぶか、そのまま補充しよう', 'ok');
    this.dyn.dropT = 6;
    this.sfx('drop'); this.bump();
  }

  updateSpawn(dt) {
    const st = this.store, dyn = this.dyn;
    dyn.spawnT -= dt;
    if (dyn.spawnT > 0) return;
    const t = st.time;
    const curve = 0.65 + 0.55 * Math.exp(-(((t - 720) / 100) ** 2)) + 0.7 * Math.exp(-(((t - 1080) / 110) ** 2));
    const f = customerFactors(st);
    const mult = curve * f.ads * f.rep * f.lv * f.size;
    dyn.spawnT = (15 / mult) * rand(0.6, 1.4);
    const nReg = st.fixtures.filter((x) => FIXTURES[x.t].cat === 'checkout').length;
    const maxC = Math.min(this.custCap || 36, 4 + st.level + nReg * 2 + Math.floor(Object.keys(st.bays || {}).length / 4));
    if (dyn.customers.length >= maxC) return;
    this.spawnCustomer();
  }
  spawnCustomer() {
    const st = this.store;
    const [sx, sz] = pick(SPAWN_POINTS);
    const stocked = new Map();
    for (const f of st.fixtures) if (f.s) f.s.forEach((s) => { if (s[0]) stocked.set(s[0], (stocked.get(s[0]) || 0) + 1); });
    const unlocked = PRODUCTS_LIST.filter((p) => productUnlocked(p.id, st.skills)).map((p) => p.id);
    const vip = this.hasSkill('mk_vip');
    const n = randi(1, Math.min(7, 2 + Math.floor(st.level / 3) + (vip ? 1 : 0)));
    const list = [];
    for (let i = 0; i < n; i++) {
      let p;
      if (stocked.size && Math.random() < 0.85) p = pick([...stocked.keys()]);
      else p = pick(unlocked);
      if (!list.find((l) => l.p === p)) list.push({ p, q: Math.random() < (vip ? 0.45 : 0.7) ? 1 : randi(2, vip ? 4 : 3) });
    }
    const c = {
      id: this.dyn.cid++, av: randi(1, 2 ** 30), x: sx, z: sz, ry: 0, st: 'enter', path: null, pi: 0,
      list, li: 0, basket: [], t: 0, pat: rand(80, 130), bub: null, bt: 0, reg: null, an: 'walk', spd: rand(1.25, 1.6), mood: 0,
      miss: [], pricey: [], cheap: [], qT: 0, noSelf: Math.random() < 0.35, // 3人に1人くらいはセルフレジを使いたがらない
    };
    this.dyn.customers.push(c);
    for (const f of st.fixtures) if (f.t === 'vending' && Math.random() < 0.18) { st.money += 160; st.today.vend += 160; }
    this.nextShop(c);
  }
  goto(e, x, z) {
    e.path = this.nav.findPath(e.x, e.z, x, z); e.pi = 0;
    return !!e.path;
  }
  bubble(c, k) { c.bub = k; c.bt = BUBBLE_T; }
  // ---------- 評判（口コミ） ----------
  // お客さんが帰るときに★1〜5で評価。評判（0〜100）はみんなの評価の移動平均
  review(c, angry) {
    if (c.rv) return; c.rv = 1;
    const st = this.store;
    const why = [];
    let s = 4.1;
    if (angry) { s = 1; why.push(c.why || 'angry'); }
    else {
      for (const p of c.miss) { s -= 0.85; why.push(['miss', p]); }
      for (const p of c.pricey) { s -= 0.7; why.push(['pricey', p]); }
      if (!c.basket.length) s -= 0.5;
      if (c.paid) {
        if (c.qT > 75) { s -= 1.1; why.push('waitL'); } else if (c.qT > 40) { s -= 0.5; why.push('wait'); } else if (c.qT < 14) { s += 0.3; why.push('fast'); }
      }
      if (c.cheap.length) { s += 0.4; why.push(['cheap', c.cheap[0]]); }
      const kinds = new Set(); for (const f of st.fixtures) if (f.s) for (const x of f.s) if (x[0] && x[1] > 0) kinds.add(x[0]);
      if (kinds.size >= 25) { s += 0.3; why.push('variety'); } else if (kinds.size <= 4) { s -= 0.3; why.push('few'); }
      const mess = st.boxes.filter((b) => b.loc.t === 'f' && b.n === 0 && st.bays[bayAt(b.loc.x, b.loc.z)]).length; // 売り場の床の空き箱
      if (mess >= 3) { s -= 0.4; why.push('mess'); }
      if (st.skills.mk_rep) s += 0.3;
      s += Math.min(0.3, st.fixtures.filter((f) => FIXTURES[f.t]?.cat === 'deco').length * 0.04);
    }
    s = clamp(s, 1, 5);
    const stars = Math.round(s);
    const k = st.skills.mk_rep && s < 3 ? 0.025 : 0.04;
    st.rep = clamp(st.rep + ((s - 1) * 25 - st.rep) * k, 0, 100);
    const rv = (st.today.rv ||= [0, 0, 0, 0, 0]); rv[stars - 1]++;
    // 口コミは何人かに1人が書く（悪いときほど書きたくなる）
    if (Math.random() < (stars <= 2 ? 0.75 : stars >= 5 ? 0.5 : 0.3)) {
      const m = reviewText(stars, why, s);
      const r = { d: st.day, t: Math.round(st.time), s: stars, m, av: c.av };
      st.reviews = [r, ...(st.reviews || [])].slice(0, 40);
      this.ev({ t: 'review', r });
    }
  }
  nextShop(c) {
    const st = this.store;
    while (c.li < c.list.length) {
      const want = c.list[c.li];
      let best = null, bd = 1e9, anyAssigned = null;
      for (const f of st.fixtures) {
        if (!f.s) continue;
        f.s.forEach((s, si) => {
          if (s[0] !== want.p) return;
          const [ax, az] = slotAccess(f, si);
          if (!anyAssigned) anyAssigned = { f, si, ax, az };
          if (s[1] <= 0) return;
          const d = dist2(c.x, c.z, ax, az);
          if (d < bd) { bd = d; best = { f, si, ax, az }; }
        });
      }
      const tgt = best || anyAssigned;
      if (!tgt) { c.li++; c.mood -= 1; this.bubble(c, 'none'); if (c.miss.length < 3) c.miss.push(want.p); continue; }
      c.tgt = { fid: tgt.f.id, si: tgt.si };
      c.st = 'go'; c.an = 'walk';
      if (!this.goto(c, tgt.ax, tgt.az)) { c.li++; continue; }
      return;
    }
    this.toCheckout(c);
  }
  toCheckout(c) {
    const st = this.store;
    if (!c.basket.length) return this.leave(c);
    let regs = st.fixtures.filter((f) => FIXTURES[f.t].cat === 'checkout');
    if (c.noSelf) regs = regs.filter((f) => f.t !== 'selfcheckout');
    if (!regs.length) { c.why = c.noSelf && st.fixtures.some((f) => f.t === 'selfcheckout') ? 'selfonly' : 'noreg'; return this.leave(c, true); }
    let best = null, bs = 1e9;
    for (const f of regs) {
      const r = this.reg(f.id), self = f.t === 'selfcheckout';
      const score = r.q.length * (self ? 14 : 10) + (self ? 3 + c.basket.length * 1.2 : r.op ? 0 : 4) + dist(c.x, c.z, f.x, f.z) * 0.3;
      if (score < bs) { bs = score; best = f; }
    }
    const r = this.reg(best.id);
    r.q.push(c.id); c.reg = best.id; c.st = 'q'; c.qi = -1;
    this.updateQueuePos(c);
  }
  updateQueuePos(c) {
    const r = this.dyn.regs[c.reg], f = this.fx(c.reg);
    if (!r || !f) { c.reg = null; return this.toCheckout(c); }
    const qi = r.q.indexOf(c.id);
    if (qi !== c.qi) {
      c.qi = qi;
      const [x, z] = checkoutSpot(f, qi);
      c.an = 'walk';
      if (!this.goto(c, x, z)) { c.path = [[x, z]]; c.pi = 0; }
    }
  }
  lose(c) {
    const st = this.store;
    st.today.lost++;
  }
  leave(c, angry) {
    if (c.reg) { const r = this.dyn.regs[c.reg]; if (r) { r.q = r.q.filter((id) => id !== c.id); if (r.cust === c.id) this.resetReg(c.reg); } c.reg = null; }
    if (angry) { this.bubble(c, 'angry'); this.lose(c); }
    if (c.st !== 'out') this.review(c, angry);
    c.st = 'out'; c.an = 'walk';
    const [sx, sz] = pick(SPAWN_POINTS);
    if (!this.goto(c, sx, sz)) c.gone = true;
  }
  updateCustomer(c, dt) {
    if (c.bt > 0) { c.bt -= dt; if (c.bt <= 0) c.bub = null; }
    if (c.holdT > 0 && (c.holdT -= dt) <= 0) c.hold = null;
    const st = this.store;
    switch (c.st) {
      case 'go': {
        if (stepPath(c, dt, c.spd)) {
          const f = this.fx(c.tgt.fid);
          if (!f) { c.li++; return this.nextShop(c); }
          const sl = FIXTURES[f.t].slots[c.tgt.si];
          const [wx, wz] = localToWorld(f, sl.x, sl.z);
          c.ry = Math.atan2(wx - c.x, wz - c.z);
          c.st = 'take'; c.t = 0.7; c.an = 'reach'; c.took = 0;
        }
        break;
      }
      case 'take': {
        c.t -= dt;
        if (c.t > 0) break;
        const f = this.fx(c.tgt.fid), want = c.list[c.li];
        const s = f?.s?.[c.tgt.si];
        if (!s || s[0] !== want.p || s[1] <= 0) {
          if (!c.took) { this.bubble(c, 'empty'); c.mood -= 1; if (c.miss.length < 3) c.miss.push(want.p); }
          c.li++; return this.nextShop(c);
        }
        if (!c.took) {
          if (getPrice(st, want.p) > priceLimit(st, want.p)) { this.bubble(c, 'pricey'); c.mood -= 1; if (c.pricey.length < 3) c.pricey.push(want.p); c.li++; return this.nextShop(c); }
          if (getPrice(st, want.p) <= marketPrice(st, want.p) * 0.85) { this.bubble(c, 'cheap'); c.cheap.push(want.p); }
        }
        s[1]--; c.took++;
        c.hold = want.p; c.holdT = 0.45; // 手に取った商品をしばらく手に持つ → かごへ
        c.basket.push({ p: want.p, price: getPrice(st, want.p) });
        this.bump();
        if (c.took >= want.q) { c.li++; c.an = 'walk'; return this.nextShop(c); }
        c.t = 0.55;
        break;
      }
      case 'q': {
        this.updateQueuePos(c);
        if (c.st !== 'q') break;
        const arrived = stepPath(c, dt, c.spd);
        c.an = arrived ? 'idle' : 'walk';
        c.qT += dt;
        c.pat -= dt * (c.qi > 0 ? 0.8 : 1);
        if (c.pat <= 0) { c.why = 'waitAngry'; return this.leave(c, true); }
        if (c.pat < 25 && !c.bub) this.bubble(c, 'wait');
        const r = this.dyn.regs[c.reg];
        if (arrived && c.qi === 0 && r && r.ph === 'idle') {
          const f = this.fx(c.reg);
          const [cx, cz] = localToWorld(f, 0, FIXTURES[f.t].cust[1]);
          c.ry = Math.atan2(cx - c.x, cz - c.z);
          if (f.t === 'checkout') c.ry = Math.atan2(...localDir(f, -1, 0));
          r.belt = c.basket.map((b) => ({ p: b.p, price: b.price, s: 0 }));
          r.ph = 'scan'; r.cust = c.id; r.t = 0;
          c.st = 'pay'; c.an = 'idle';
          if (f.t === 'selfcheckout') { r.op = 'self'; r.t = -2.2; } // セルフレジは使い方に迷う時間がある
          this.dynRev++;
        }
        break;
      }
      case 'pay': {
        c.qT += dt;
        c.pat -= dt * 0.6;
        if (c.pat <= 0) { c.why = 'waitAngry'; return this.leave(c, true); }
        if (c.pat < 20 && !c.bub) this.bubble(c, 'wait');
        break;
      }
      case 'out': {
        if (stepPath(c, dt, c.spd)) c.gone = true;
        break;
      }
      default: break;
    }
  }
  completeSale(fid, r, who) {
    const st = this.store;
    const c = this.dyn.customers.find((o) => o.id === r.cust);
    const total = r.pay?.total ?? r.belt.reduce((s, b) => s + b.price, 0);
    st.money += total; st.today.sales += total; st.totalSales += total; st.today.served++; st.totalCustomers++;
    const items = (st.today.items ||= {});
    for (const b of r.belt) { const e = (items[b.p] ||= [0, 0]); e[0]++; e[1] += b.price; }
    const gx = Math.max(1, Math.round(total / XP_YEN)); st.today.xp += gx;
    if (st.level < MAX_LEVEL) st.xp += gx;
    while (st.level < MAX_LEVEL && st.xp >= xpNeed(st.level)) {
      st.xp -= xpNeed(st.level); st.level++;
      const gain = spForLevel(st.level); st.sp += gain;
      if (st.level >= MAX_LEVEL) st.xp = 0;
      const newProd = Object.values(SKILLS).filter((k) => k.lv === st.level && !st.skills[k.id]).map((k) => k.name);
      this.ev({ t: 'levelup', level: st.level, sp: gain, max: st.level >= MAX_LEVEL, prods: newProd }); this.sfx('levelup');
    }
    if (c) c.paid = true;
    const f = this.fx(fid);
    this.sfx('cash', f?.x, f?.z);
    this.ev({ t: 'sale', total, who });
    r.q = r.q.filter((id) => id !== r.cust);
    r.belt = []; r.ph = 'idle'; r.pay = null; r.cust = null;
    if (r.op === 'self') r.op = null;
    if (c) { c.reg = null; this.bubble(c, c.mood >= 0 ? 'happy' : 'ok'); this.leave(c); }
    this.dynRev++; this.bump();
  }
  resetReg(fid, all) {
    const r = this.dyn.regs[fid];
    if (!r) return;
    r.belt = []; r.ph = 'idle'; r.pay = null; r.cust = null;
    if (r.op === 'self') r.op = null;
    if (all) {
      for (const cid of r.q) { const c = this.dyn.customers.find((o) => o.id === cid); if (c) { c.reg = null; c.qi = -1; this.toCheckout(c); } }
      r.q = r.q.filter((cid) => this.dyn.customers.find((o) => o.id === cid && o.reg === fid));
    }
    this.dynRev++;
  }
  updateReg(fid, r, dt) {
    const f = this.fx(fid);
    if (!f) { delete this.dyn.regs[fid]; return; }
    if (r.ph === 'idle') return;
    const auto = r.op === 'self' || (r.op && String(r.op).startsWith('s:'));
    if (!auto) return;
    const self = r.op === 'self';
    const opRt = !self ? this.dyn.staffRt[String(r.op).slice(2)] : null;
    // セルフレジはお客さんが自分でスキャンするのでかなり遅い（1点 約2.6秒＋支払い 約3.5秒）
    const spd = self ? 0.46 : (opRt?.k || 1) * (this.hasSkill('mk_scan') ? 1.5 : 1);
    r.t = (r.t || 0) + dt * spd;
    if (r.ph === 'scan' && r.t >= (self ? 1.2 : 0.75)) {
      r.t = 0;
      const j = r.belt.findIndex((b) => !b.s);
      if (j >= 0) this.scanItem(fid, r, j);
    } else if (r.ph === 'pay' && r.t >= 1.6) {
      r.t = 0; this.completeSale(fid, r, r.op);
    }
  }

  // ---------- 従業員AI ----------
  updateStaff(s, dt) {
    const dyn = this.dyn, st = this.store;
    let rt = dyn.staffRt[s.id];
    if (!rt) {
      const [x, z] = [STAFF_HOME[0] + rand(-1, 1), STAFF_HOME[1] + rand(-0.6, 0.6)]; // 倉庫から出勤
      rt = dyn.staffRt[s.id] = { x, z, ry: 0, st: 'idle', t: rand(0.5, 2), path: null, pi: 0, an: 'idle' };
    }
    const who = 's:' + s.id;
    // 個体差：No.1 は遅く、No.10 はとても速い（歩く速さも作業の速さも）
    const k = rt.k = (s.spd || 1) * (st.skills.staff_speed ? 1.35 : 1);
    const spd = 1.9 * k;
    if (rt.st !== 'idle' && rt.path && rt.pi < (rt.path?.length || 0)) rt.an = 'walk';
    if (s.role === 'cashier') return this.staffCashier(s, rt, dt, spd, who);
    if (s.role === 'stocker') return this.staffStocker(s, rt, dt, spd, who);
    if (s.role === 'cleaner') return this.staffCleaner(s, rt, dt, spd, who);
    if (s.role === 'pricer') return this.staffPricer(s, rt, dt, spd, who);
  }
  // 値付け係：値札をまわって、売れるいちばん高い値段（高すぎるの1歩手前＝相場の+20%、ブランド力で+30%）に付けかえる
  staffPricer(s, rt, dt, spd) {
    const st = this.store;
    if (rt.st === 'totag') {
      const f = this.fx(rt.fid);
      if (!f || !f.s?.[rt.si]?.[0]) { rt.st = 'idle'; rt.t = 0.3; rt.pid = null; return; }
      if (stepPath(rt, dt, spd)) { rt.ry = Math.atan2(f.x - rt.x, f.z - rt.z); rt.st = 'retag'; rt.t = 1.4; }
      return;
    }
    if (rt.st === 'retag') {
      rt.an = 'reach'; rt.t -= dt * (rt.k || 1);
      if (rt.t > 0) return;
      const p = this.fx(rt.fid)?.s?.[rt.si]?.[0];
      if (p) { const v = priceLimit(st, p); if (getPrice(st, p) !== v) { st.prices[p] = v; this.sfx('place', rt.x, rt.z); this.bump(); } }
      rt.st = 'idle'; rt.t = 0.5; rt.pid = null; return;
    }
    if (!this.staffIdle(rt, dt)) return;
    const tags = [];
    for (const f of st.fixtures) if (f.s) f.s.forEach((x, si) => { if (x[0]) tags.push([f, si, x[0]]); });
    if (!tags.length) { rt.msg = 'notag'; return; }
    // ほかの値付け係が向かっている商品はまかせる（値段は商品ごとなので、1か所変えれば同じ商品の値札は全部変わる）
    const claimed = new Set(st.staff.filter((o) => o !== s && o.role === 'pricer').map((o) => this.dyn.staffRt[o.id]?.pid).filter(Boolean));
    const todo = tags.filter(([, , p]) => !claimed.has(p) && getPrice(st, p) !== priceLimit(st, p));
    rt.msg = null;
    if (!todo.length) { rt.t = 1.5; return; }
    const near = (t) => { const [ax, az] = slotAccess(t[0], t[1]); return dist2(rt.x, rt.z, ax, az); };
    todo.sort((a, b) => near(a) - near(b));
    for (const [f, si, p] of todo.slice(0, 4)) { const [ax, az] = slotAccess(f, si); if (this.goto(rt, ax, az)) { rt.st = 'totag'; rt.fid = f.id; rt.si = si; rt.pid = p; return; } }
  }
  // ゴミ捨て係：空の段ボールを拾ってゴミ箱へ
  staffCleaner(s, rt, dt, spd, who) {
    const held = this.heldBox(who);
    if (rt.st === 'tobox') {
      const b = this.box(rt.bid);
      if (!b || b.loc.t === 'h' || b.n > 0) { rt.st = 'idle'; rt.t = 0.3; return; }
      if (stepPath(rt, dt, spd)) {
        b.loc = { t: 'h', who }; this.bump();
        const bin = this.nearestTrash(rt.x, rt.z);
        if (!bin) { rt.st = 'idle'; return; }
        const [ax, az] = trashAccess(bin);
        if (this.goto(rt, ax, az)) { rt.st = 'totrash'; rt.fid = bin.id; } else rt.st = 'idle';
      }
      return;
    }
    if (rt.st === 'totrash') {
      if (!held) { rt.st = 'idle'; return; }
      if (stepPath(rt, dt, spd)) {
        const f = this.fx(rt.fid);
        if (f) rt.ry = Math.atan2(f.x - rt.x, f.z - rt.z);
        rt.st = 'throw'; rt.t = 0.35;
      }
      return;
    }
    if (rt.st === 'throw') {
      rt.an = 'reach'; rt.t -= dt * (rt.k || 1);
      if (rt.t > 0) return;
      if (held) { this.store.boxes = this.store.boxes.filter((o) => o !== held); this.sfx('trash', rt.x, rt.z); this.bump(); }
      rt.st = 'idle'; rt.t = 0.4; return;
    }
    if (held) {
      if (held.n > 0) { held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: 0 }; this.bump(); }
      else { const bin = this.nearestTrash(rt.x, rt.z); if (bin) { const [ax, az] = trashAccess(bin); if (this.goto(rt, ax, az)) { rt.st = 'totrash'; rt.fid = bin.id; return; } } }
    }
    if (!this.staffIdle(rt, dt)) return;
    if (!this.nearestTrash(rt.x, rt.z)) { rt.msg = 'trash'; return; }
    const claimed = new Set(this.store.staff.filter((o) => o !== s).map((o) => this.dyn.staffRt[o.id]?.bid));
    // 空になった箱は床からも在庫棚からも捨てる。買ったまま使っていない空き箱は捨てない（模様替え用）
    const empty = this.store.boxes.filter((b) => b.n <= 0 && (b.loc.t === 'f' || b.loc.t === 'r') && b.p !== EMPTY_BOX.id && !claimed.has(b.id));
    if (!empty.length) { rt.msg = null; rt.t = 1.2; return; }
    empty.sort((a, b) => { const [ax, az] = this.boxAccess(a), [bx, bz] = this.boxAccess(b); return dist2(rt.x, rt.z, ax, az) - dist2(rt.x, rt.z, bx, bz); });
    for (const b of empty.slice(0, 4)) { const [bx, bz] = this.boxAccess(b); if (this.goto(rt, bx, bz)) { rt.st = 'tobox'; rt.bid = b.id; rt.msg = null; return; } }
  }
  nearestTrash(x, z) {
    let best = null, bd = 1e9;
    for (const f of this.store.fixtures) if (TRASH_TYPES.includes(f.t)) { const d = dist2(x, z, f.x, f.z); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  staffIdle(rt, dt) {
    rt.an = 'idle'; rt.t -= dt;
    if (rt.t <= 0) { rt.t = rand(2, 5); rt.st = 'idle'; return true; }
    return false;
  }
  staffCashier(s, rt, dt, spd, who) {
    const mine = Object.entries(this.dyn.regs).find(([, r]) => r.op === who);
    if (mine) { rt.an = 'idle'; const f = this.fx(+mine[0]); if (f) rt.ry = Math.atan2(...localDir(f, 1, 0)); return; }
    if (rt.st === 'toreg') {
      const r = this.dyn.regs[rt.fid], f = this.fx(rt.fid);
      if (!f || !r || (r.op && r.op !== who)) { rt.st = 'idle'; rt.t = 0.5; return; }
      if (stepPath(rt, dt, spd)) { r.op = who; this.dynRev++; }
      return;
    }
    if (!this.staffIdle(rt, dt)) return;
    const free = this.store.fixtures.filter((f) => f.t === 'checkout' && !this.reg(f.id).op && !this.store.staff.some((o) => o !== s && this.dyn.staffRt[o.id]?.st === 'toreg' && this.dyn.staffRt[o.id]?.fid === f.id));
    if (!free.length) return;
    free.sort((a, b) => this.reg(b.id).q.length - this.reg(a.id).q.length);
    const f = free[0];
    const [x, z] = checkoutSpot(f, -1);
    if (this.goto(rt, x, z)) { rt.st = 'toreg'; rt.fid = f.id; }
  }
  staffStocker(s, rt, dt, spd, who) {
    const st = this.store;
    const held = this.heldBox(who);
    switch (rt.st) {
      case 'tobox': {
        const b = this.box(rt.bid);
        if (!b || b.loc.t === 'h') { rt.st = 'idle'; rt.t = 0.3; return; }
        if (stepPath(rt, dt, spd)) {
          b.loc = { t: 'h', who }; b.o = true; this.sfx('boxopen', rt.x, rt.z); this.bump();
          const f = this.fx(rt.fid);
          if (!f) { rt.st = 'return'; return; }
          const [ax, az] = slotAccess(f, rt.si);
          rt.st = this.goto(rt, ax, az) ? 'toslot' : 'return';
        }
        return;
      }
      case 'toslot': {
        if (!held) { rt.st = 'idle'; return; }
        if (stepPath(rt, dt, spd)) { rt.st = 'stocking'; rt.t = 0.3; const f = this.fx(rt.fid); if (f) rt.ry = Math.atan2(...localDir(f, 0, -FIXTURES[f.t].slots[rt.si].side)); }
        return;
      }
      case 'stocking': {
        rt.an = 'reach'; rt.t -= dt * (rt.k || 1);
        if (rt.t > 0) return;
        rt.t = 0.32;
        const f = this.fx(rt.fid);
        const r = f && held ? this.stockOne(held, f, rt.si) : 'bad';
        if (r !== 'ok') rt.st = 'return';
        return;
      }
      case 'return': {
        if (!held) { rt.st = 'idle'; rt.t = 0.5; return; }
        if (held.n <= 0) {
          // 空き箱はゴミ箱へ（ゴミ捨て係がいれば床に置いて任せる）
          const bin = this.nearestTrash(rt.x, rt.z);
          if (bin && !st.staff.some((o) => o.role === 'cleaner')) { const [ax, az] = trashAccess(bin); if (this.goto(rt, ax, az)) { rt.st = 'totrash'; rt.fid = bin.id; return; } }
          held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: rt.ry }; this.bump(); rt.st = 'idle'; rt.t = 0.6; return;
        }
        // 余った商品の入った箱は閉じて在庫棚へ（どの在庫棚でもOK。空いている一番近い段）
        held.o = false;
        const spot = this.freeRackSlot(rt.x, rt.z);
        if (spot) {
          const [ax, az] = rackAccess(spot.f, spot.si);
          if (this.goto(rt, ax, az)) { rt.st = 'torack'; rt.fid = spot.f.id; rt.si = spot.si; rt.msg = null; return; }
        }
        // 在庫棚がいっぱい（またはない）ときは倉庫の床に積んでおく
        const fl = this.storageFloorSpot(rt.x, rt.z, held);
        if (fl && this.goto(rt, fl[0], fl[1])) { rt.st = 'tofloor'; rt.fx2 = fl[0]; rt.fz2 = fl[1]; rt.msg = 'rackfull'; return; }
        held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: rt.ry }; this.bump(); rt.st = 'idle';
        return;
      }
      case 'tofloor': {
        if (!held) { rt.st = 'idle'; return; }
        if (stepPath(rt, dt, spd)) { held.loc = { t: 'f', x: rt.fx2, y: this.stackHeight(rt.fx2, rt.fz2, held), z: rt.fz2, ry: 0 }; this.sfx('place', rt.x, rt.z); this.bump(); rt.st = 'idle'; rt.t = 0.5; }
        return;
      }
      case 'toempty': {
        // 在庫棚の空き箱を取る → return で（空なので）ゴミ箱へ
        const b = this.box(rt.bid);
        if (!b || b.loc.t !== 'r' || b.n > 0) { rt.st = 'idle'; rt.t = 0.3; return; }
        if (stepPath(rt, dt, spd)) { b.loc = { t: 'h', who }; b.o = false; this.sfx('pick', rt.x, rt.z); this.bump(); rt.st = 'return'; }
        return;
      }
      case 'tostore': {
        // 外や倉庫の床に置きっぱなしの箱を取りに行く → 在庫棚へ
        const b = this.box(rt.bid);
        if (!b || b.loc.t !== 'f' || b.n <= 0) { rt.st = 'idle'; rt.t = 0.3; return; }
        if (stepPath(rt, dt, spd)) { b.loc = { t: 'h', who }; b.o = false; delete b.drop; this.sfx('pick', rt.x, rt.z); this.bump(); rt.st = 'return'; }
        return;
      }
      case 'torack': {
        if (!held) { rt.st = 'idle'; return; }
        if (stepPath(rt, dt, spd)) {
          const occupied = this.store.boxes.some((o) => o.loc.t === 'r' && o.loc.fid === rt.fid && o.loc.si === rt.si);
          if (occupied || !this.fx(rt.fid)) { rt.st = 'return'; return; }
          held.loc = { t: 'r', fid: rt.fid, si: rt.si }; this.bump(); rt.st = 'idle'; rt.t = 0.5;
        }
        return;
      }
      case 'totrash': {
        if (!held) { rt.st = 'idle'; return; }
        if (stepPath(rt, dt, spd)) { this.store.boxes = this.store.boxes.filter((o) => o !== held); this.sfx('trash', rt.x, rt.z); this.bump(); rt.st = 'idle'; rt.t = 0.5; }
        return;
      }
      default: {
        if (held) { rt.st = 'return'; return; }
        if (!this.staffIdle(rt, dt)) return;
        // 値札（商品ラベル）のついた棚がなければ働かない
        const tagged = st.fixtures.some((f) => f.s && f.s.some((x) => x[0]));
        if (!tagged) { rt.msg = 'notag'; return; }
        const job = this.findStockJob(rt, s);
        if (!job) {
          // 補充することがなければ、余った商品の箱を在庫棚へ片付ける
          const sj = this.findStoreJob(rt, s);
          if (sj) { const [bx, bz] = this.boxAccess(sj); if (this.goto(rt, bx, bz)) { rt.st = 'tostore'; rt.bid = sj.id; rt.msg = null; return; } }
          // ゴミ捨て係がいないときは、在庫棚の空になった箱をゴミ箱へ（棚をあける）
          const ej = this.findRackEmpty(rt, s);
          if (ej) { const [bx, bz] = this.boxAccess(ej); if (this.goto(rt, bx, bz)) { rt.st = 'toempty'; rt.bid = ej.id; rt.msg = null; return; } }
          rt.msg = this._noStock ? 'nobox' : null; return;
        }
        rt.msg = null;
        const [bx, bz] = this.boxAccess(job.b);
        if (this.goto(rt, bx, bz)) { rt.st = 'tobox'; rt.bid = job.b.id; rt.fid = job.f.id; rt.si = job.si; }
      }
    }
  }
  // 在庫棚にある空になった箱（ゴミ捨て係がいないとき品出し係が捨てる。買ったまま使っていない空き箱は残す）
  findRackEmpty(rt, me) {
    const st = this.store;
    if (st.staff.some((o) => o.role === 'cleaner') || !this.nearestTrash(rt.x, rt.z)) return null;
    const claimed = new Set(st.staff.filter((o) => o !== me).map((o) => this.dyn.staffRt[o.id]?.bid).filter(Boolean));
    let best = null, bd = 1e9;
    for (const b of st.boxes) {
      if (b.loc.t !== 'r' || b.n > 0 || b.p === EMPTY_BOX.id || claimed.has(b.id)) continue;
      const [x, z] = this.boxAccess(b), d = dist2(rt.x, rt.z, x, z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // 片付ける箱：店の外（荷物置き場など）に置いてある箱と、在庫棚に空きがあるときの倉庫の床の箱（売り場の床の箱はプレイヤーが使っているかもしれないので触らない）
  findStoreJob(rt, me) {
    const st = this.store;
    const claimed = new Set(st.staff.filter((o) => o !== me).map((o) => this.dyn.staffRt[o.id]?.bid).filter(Boolean));
    const rackFree = !!this.freeRackSlot(rt.x, rt.z);
    const zs = zones(st);
    let best = null, bd = 1e9;
    for (const b of st.boxes) {
      if (b.loc.t !== 'f' || b.n <= 0 || claimed.has(b.id)) continue;
      const z = zs.find((o) => b.loc.x > o.minX && b.loc.x < o.maxX && b.loc.z > o.minZ && b.loc.z < o.maxZ);
      const outside = !z && !(b.loc.x > BUILDING.minX && b.loc.x < BUILDING.maxX && b.loc.z > BUILDING.minZ && b.loc.z < BUILDING.maxZ);
      const inStorage = z?.kind === 'storage';
      if (!(outside || (inStorage && rackFree))) continue;
      const d = dist2(rt.x, rt.z, b.loc.x, b.loc.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // 倉庫の床で箱を置ける所（設備・入口の前をよけて、なるべく積む。高さ1.3mまで）
  storageFloorSpot(x, z, held) {
    const st = this.store, zs = zones(st).filter((o) => o.kind === 'storage');
    const fps = st.fixtures.map((f) => fixtureFootprint(f.t, f.x, f.z, f.r)), clear = keepClear(st);
    const inside = (r, px, pz, m) => px > r.minX - m && px < r.maxX + m && pz > r.minZ - m && pz < r.maxZ + m;
    let best = null, bd = 1e9;
    for (const zn of zs) for (let px = zn.minX + 0.7; px <= zn.maxX - 0.7; px += 0.8) for (let pz = zn.minZ + 0.7; pz <= zn.maxZ - 0.7; pz += 0.7) {
      if (fps.some((r) => inside(r, px, pz, 0.45)) || clear.some((r) => inside(r, px, pz, 0.3))) continue;
      const h = this.stackHeight(px, pz, held);
      if (h > 1.3) continue;
      const d = dist2(x, z, px, pz) - h * 6; // 積んである所を少し優先
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    return best;
  }
  findStockJob(rt, me) {
    const st = this.store;
    const claimed = new Set(st.staff.filter((o) => o !== me).map((o) => this.dyn.staffRt[o.id]).filter((r) => r && r.st !== 'idle').map((r) => r.fid + ':' + r.si));
    const claimedBox = new Set(st.staff.filter((o) => o !== me).map((o) => this.dyn.staffRt[o.id]?.bid));
    let best = null, bs = 1e9, wanted = false;
    for (const f of st.fixtures) {
      if (!f.s) continue;
      f.s.forEach((s, si) => {
        if (!s[0] || claimed.has(f.id + ':' + si)) return;
        const cap = slotCapacity(s[0], FIXTURES[f.t].slots[si]);
        if (s[1] >= cap) return; // 値札の棚がいっぱいでなければ補充しに行く
        wanted = true;
        for (const b of st.boxes) {
          if (b.p !== s[0] || b.n <= 0 || b.loc.t === 'h' || claimedBox.has(b.id)) continue;
          const [bx, bz] = this.boxAccess(b);
          const score = s[1] / cap * 30 + dist(rt.x, rt.z, bx, bz) + dist(bx, bz, f.x, f.z) * 0.5;
          if (score < bs) { bs = score; best = { f, si, b }; }
        }
      });
    }
    this._noStock = wanted && !best; // 補充したい棚はあるのに在庫がない
    return best;
  }
  boxAccess(b) {
    if (b.loc.t === 'r') { const f = this.fx(b.loc.fid); if (f) return rackAccess(f, b.loc.si); }
    return [b.loc.x, b.loc.z];
  }
  freeRackSlot(x, z) {
    let best = null, bd = 1e9;
    for (const f of this.store.fixtures) {
      const def = FIXTURES[f.t];
      if (!def.boxSlots) continue;
      def.boxSlots.forEach((_, si) => {
        if (this.store.boxes.some((o) => o.loc.t === 'r' && o.loc.fid === f.id && o.loc.si === si)) return;
        if (this.store.staff.some((o) => { const r = this.dyn.staffRt[o.id]; return r && r.st === 'torack' && r.fid === f.id && r.si === si; })) return;
        const d = dist2(x, z, f.x, f.z) + si * 0.01;
        if (d < bd) { bd = d; best = { f, si }; }
      });
    }
    return best;
  }
  finishDay() {
    const st = this.store;
    const wageMul = st.skills.staff_wage ? 0.75 : 1;
    const wages = Math.round(st.staff.reduce((s, o) => s + o.wage, 0) * wageMul);
    const bills = 500 + st.fixtures.length * 60;
    st.money -= wages + bills;
    const top = Object.entries(st.today.items || {}).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6);
    const data = { top, prevProfit: st.last?.profit ?? null, day: st.day, recycle: st.today.recycle || 0, sales: st.today.sales, served: st.today.served, lost: st.today.lost, orders: st.today.orders, ship: st.today.ship || 0, wages, bills, vend: st.today.vend, xp: st.today.xp, level: st.level, rep: Math.round(st.rep), repPrev: st.last?.rep ?? null, rv: st.today.rv || [0, 0, 0, 0, 0], money: st.money };
    data.profit = data.sales + data.vend + data.recycle - data.orders - data.ship - wages - bills;
    st.phase = 'summary'; st.last = data;
    for (const fid in this.dyn.regs) this.resetReg(+fid, true);
    this.ev({ t: 'summary', data });
    this.sfx('bell'); this.bump();
  }

  // ---------- ネット同期用スナップショット ----------
  dynSnapshot() {
    const d = this.dyn;
    const regs = {};
    for (const fid in d.regs) { const r = d.regs[fid]; regs[fid] = { op: r.op, ph: r.ph, b: r.belt.map((x) => [x.p, x.s, x.price]), pay: r.pay, q: r.q.length, cu: r.cust }; }
    return {
      time: this.store.time,
      c: d.customers.map((c) => [c.id, c.av, +c.x.toFixed(2), +c.z.toFixed(2), +c.ry.toFixed(2), c.an, c.bub || '', c.basket.length, c.basket.slice(0, 8).map((b) => b.p).join(','), c.hold || '']),
      s: this.store.staff.map((s) => { const r = d.staffRt[s.id] || {}; return [s.id, +(r.x || 0).toFixed(2), +(r.z || 0).toFixed(2), +(r.ry || 0).toFixed(2), r.an || 'idle', r.st === 'idle' || !r.st ? r.msg || '' : '']; }),
      r: regs,
      dl: d.deliveries.length,
    };
  }
}

export function stepPath(e, dt, spd) {
  if (!e.path || e.pi >= e.path.length) return true;
  let remain = spd * dt;
  while (remain > 0 && e.pi < e.path.length) {
    const [tx, tz] = e.path[e.pi];
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 1e-4) e.ry = Math.atan2(dx, dz);
    if (d <= remain) { e.x = tx; e.z = tz; e.pi++; remain -= d; }
    else { e.x += dx / d * remain; e.z += dz / d * remain; remain = 0; }
  }
  e.an = e.pi >= e.path.length ? 'idle' : 'walk';
  return e.pi >= e.path.length;
}
// 設備ローカル方向(lx,lz)のワールド方向
function localDir(f, lx, lz) { const a = f.r * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return [lx * c + lz * s, -lx * s + lz * c]; }
function trashAccess(f) { const d = FIXTURES[f.t]; return localToWorld(f, 0, d.d / 2 + 0.45); }
function inArea(l, A) { return l.x >= A.minX - 0.5 && l.x <= A.maxX + 0.5 && l.z >= A.minZ - 0.5 && l.z <= A.maxZ + 0.5; }

export function cashGiven(total) {
  const r = Math.random();
  const up = (u) => Math.ceil(total / u) * u;
  let g = r < 0.3 ? up(1000) : r < 0.5 ? up(500) : r < 0.65 ? up(100) : r < 0.85 ? up(5000) : up(10000);
  if (g < total) g = up(1000);
  return g;
}
// 送料こみの支払い額
// 来店の勢い：レベル・売り場の広さ・評判・広告。ゲーム画面の評判タブにも出す
const BOARD_TYPES = ['mboard', 'fboard', 'xboard', 'pc'];
// 従業員の名前：10文字まで・改行なし
const staffName = (v) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 10);
const BOARD_ONLY = '📋 パソコン室（入口の右）のボードの前で操作してください';
export function customerFactors(st) {
  const bays = Math.max(1, Object.keys(st.bays || {}).length);
  return {
    lv: 1 + 0.06 * ((st.level || 1) - 1),           // Lv30 で約2.7倍
    size: Math.pow(bays / START_BAYS.length, 0.55),  // 売り場32区画（最大）で約2.5倍
    rep: 0.5 + (st.rep ?? 50) / 100,                 // 評判0で0.5倍〜100で1.5倍
    ads: (st.skills?.mk_ads ? 1.25 : 1) * (st.skills?.mk_ads2 ? 1.5 : 1),
  };
}
export const repStars = (rep) => 1 + clamp(rep ?? 50, 0, 100) / 25; // 評判0〜100 → ★1.0〜5.0
const RV = {
  miss: (n) => pick([`${n}が売り切れてた…`, `${n}を買いに来たのになかった`, `${n}を置いてほしい`]),
  pricey: (n) => pick([`${n}が高すぎる！`, `${n}はほかの店のほうが安い`, `${n}の値段にびっくり`]),
  cheap: (n) => pick([`${n}が安くて助かる！`, `${n}がお買い得だった`]),
  waitL: () => pick(['レジでずっと待たされた…', 'レジが全然進まない', 'レジの人を増やしてほしい']),
  wait: () => pick(['レジでけっこう待った', 'レジがもう少し早いといいな']),
  fast: () => pick(['レジが早くて気持ちいい', 'サクッと買えた！']),
  variety: () => pick(['品揃えがよくて楽しい！', 'なんでもそろってて便利']),
  few: () => pick(['棚がスカスカ…', '商品が少なすぎる']),
  mess: () => pick(['通路に段ボールが置きっぱなし', 'お店が散らかってた']),
  waitAngry: () => pick(['待たされすぎ！もう来ない', 'レジが遅すぎて帰った']),
  selfonly: () => pick(['セルフレジしかなくて困った…', 'セルフレジの使い方がわからない']),
  noreg: () => 'レジがなくて買えなかった',
  angry: () => 'もう来ない！',
  5: () => pick(['また来ます！', '最高のスーパー！', '近所にあってうれしい']), 4: () => pick(['いいお店でした', '感じのいいお店']),
  3: () => pick(['ふつうかな', 'まあまあ']), 2: () => pick(['うーん…', 'ちょっと残念']), 1: () => 'もう来ない',
};
function reviewText(stars, why, s) {
  const bad = why.filter((w) => ['miss', 'pricey', 'waitL', 'wait', 'few', 'mess', 'waitAngry', 'selfonly', 'noreg', 'angry'].includes(Array.isArray(w) ? w[0] : w));
  const good = why.filter((w) => ['cheap', 'fast', 'variety'].includes(Array.isArray(w) ? w[0] : w));
  const w = stars <= 3 ? bad[0] || null : (Math.random() < 0.6 && good.length ? pick(good) : null);
  if (!w) return RV[stars]();
  const [k, p] = Array.isArray(w) ? w : [w];
  return RV[k](PRODUCTS[p]?.name || '');
}
export function orderTotal(store, items) { return items.length ? orderCost(store, items) + SHIPPING_FEE : 0; }
export function orderCost(store, items) {
  const m = costMult(store.skills);
  return Math.round(items.reduce((s, [p, n, half]) => s + (p === EMPTY_BOX.id ? EMPTY_BOX_PRICE / m : marketCost(store, p) * boxUnits(p, half)) * n, 0) * m);
}
