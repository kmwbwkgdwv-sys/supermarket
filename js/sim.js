// ===== 経営シミュレーション（ホスト側で実行・three.js 非依存） =====
import {
  PRODUCTS, PRODUCTS_LIST, FIXTURES, SKILLS, STAFF_ROLES, STAFF_NAMES, BOX_SIZES, DELIVERY_AREA,
  OPEN_TIME, GAME_MIN_PER_SEC, SPAWN_POINTS, PLAYER_BOUNDS, START_BAYS, START_STOCK, BACK_Z, STOCK_Z, OLD_BACK_Z, OLD_STOCK_Z,
  getWalls, zones, keepClear, expandTargets, fixtureFootprint, marketPrice, marketCost, OLD_LICENSES, slotCapacity, slotAccess, rackAccess, checkoutSpot, canPlace,
  staffLimit, STAFF_SLOTS, slotWage, staffSlotOpen, checkoutLimit, closeTime, xpNeed, costMult, productUnlocked, fixtureUnlocked, localToWorld, CELL, TRASH_TYPES, ORDER_MAX_BOXES, SHIPPING_FEE,
  MAX_LEVEL, spForLevel, spTotalNew, spTotalOld, SELF_MAX, boxUnits, wageFor, MANAGER,
} from './data.js';
import { NavGrid } from './nav.js';
import { rand, randi, pick, dist, dist2, clamp } from './util.js';

export function newStore(name) {
  const st = {
    v: 11, name: name || 'マートメイツ', money: 40000, day: 1, level: 1, xp: 0, sp: 1, rep: 50,
    skills: { start: true, prod_food1: true }, prices: {}, market: {}, marketPrev: {}, staff: [], nid: 100, phase: 'prep', time: OPEN_TIME,
    totalSales: 0, totalCustomers: 0, rev: 1, created: Date.now(), color: '#ff6b35',
    today: { sales: 0, served: 0, lost: 0, orders: 0, ship: 0, xp: 0, vend: 0, recycle: 0 },
    bays: Object.fromEntries(START_BAYS.map((b) => [b, 1])),
    stock: Object.fromEntries(START_STOCK.map((b) => [b, 1])),
    fixtures: initialFixtures(),
    boxes: [], reviews: [],
  };
  // 最初は棚も倉庫も空っぽ。マネージャーボードで発注して補充するところから
  return st;
}
function initialFixtures() {
  return [
    { id: 1, t: 'mboard', x: -2.5, z: -35.12, r: 0 },
    { id: 2, t: 'fboard', x: -4.62, z: -32.75, r: 1 },
    { id: 3, t: 'xboard', x: -0.38, z: -32.75, r: 3 },
    { id: 4, t: 'recycle', x: 8, z: -31.3, r: 2 },
    { id: 5, t: 'checkout', x: 3, z: 3.25, r: 2 },
    { id: 6, t: 'shelf', x: -3, z: -3.5, r: 0, s: emptySlots('shelf') },
    { id: 7, t: 'shelf', x: -3, z: -0.75, r: 0, s: emptySlots('shelf') },
    { id: 8, t: 'rack', x: -4.25, z: -18, r: 1 },
    { id: 9, t: 'basket', x: -2.25, z: 4.75, r: 0 },
    { id: 10, t: 'plant', x: -4.5, z: 5.5, r: 0 },
    { id: 11, t: 'trash', x: 4.5, z: 5.5, r: 0 },
    { id: 12, t: 'opensign', x: 2.25, z: 5.25, r: 0 },
    { id: 13, t: 'dumpster', x: -0.9, z: -29.43, r: 0 },
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
    for (const id of START_BAYS) nb[id] = 1;
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
    const dz = BACK_Z - OLD_BACK_Z;
    if (!st._fresh) for (const f of st.fixtures || []) if (f.z < OLD_BACK_Z) f.z += dz;
    for (const b of st.boxes || []) if (b.loc?.t === 'f' && b.loc.z < OLD_BACK_Z && b.loc.z > -40) b.loc.z += dz;
    st.bays ||= {};
    for (const id of START_BAYS) st.bays[id] = 1;
    st.v = 8;
  }
  if (st.v < 9) {
    // v9：倉庫も奥に広げられるように（手前8m＋奥8m）。マネージャー室・搬入口・奥の壁ぎわの物を8m奥へ引っ越し、
    // 真ん中の奥の倉庫をプレゼント（マネージャー室と搬入口につながる）
    const dz = STOCK_Z - OLD_STOCK_Z, cut = OLD_STOCK_Z + 1;
    if (!st._fresh) for (const f of st.fixtures || []) if (f.z < cut) f.z += dz;
    for (const b of st.boxes || []) if (b.loc?.t === 'f' && b.loc.z < cut && b.loc.z > -60) b.loc.z += dz;
    st.stock ||= {};
    for (const id of START_STOCK) st.stock[id] = 1;
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
  delete st._fresh;
  st.reviews ||= [];
  if (st.level >= MAX_LEVEL) st.xp = 0;
  st.market ||= {}; st.marketPrev ||= {};
  st.bays ||= Object.fromEntries(START_BAYS.map((b) => [b, 1])); st.stock ||= { st0: 1 };
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
  st.boxes = st.boxes.filter((b) => PRODUCTS[b.p]);
  let k = 0;
  for (const b of st.boxes) if (b.loc?.t === 'h' || !b.loc) b.loc = deliverySpot(st, k++);
  return st;
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
    if (this.heldBox(uid)) return this.err(uid, 'すでに箱を持っています');
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
      if (Math.abs(o.loc.x - x) < 0.4 && Math.abs(o.loc.z - z) < 0.35) y = Math.max(y, o.loc.y + BOX_SIZES[PRODUCTS[o.p].bx][1]);
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
    if (b.p !== s[0] && b.n > 0) return this.err(uid, '同じ商品の箱で回収してください');
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
    const items = (a.items || []).filter(([p, n]) => PRODUCTS[p] && n > 0 && productUnlocked(p, this.store.skills)).map(([p, n, half]) => [p, Math.min(ORDER_MAX_BOXES, n | 0), half ? 1 : 0]);
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
  a_buy(uid, a) {
    const def = FIXTURES[a.ft];
    if (!def || !fixtureUnlocked(a.ft, this.store.skills)) return;
    if (def.price > this.store.money) return this.err(uid, 'お金が足りません');
    const r = a.r & 3;
    const ok = this.canPlaceFixture(a.ft, a.x, a.z, r, null);
    if (ok !== true) return this.err(uid, ok);
    const f = { id: this.store.nid++, t: a.ft, x: a.x, z: a.z, r };
    if (def.slots) f.s = emptySlots(a.ft);
    if (def.text) { f.tx = a.ft === 'banner' ? '食品' : a.ft === 'neon' ? 'OPEN' : 'いらっしゃいませ'; f.c = a.ft === 'neon' ? '#ff4fd8' : '#ffffff'; }
    this.store.fixtures.push(f);
    this.store.money -= def.price;
    this.nav.build(this.store);
    this.sfx('build', a.x, a.z); this.bump();
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
    if (t.kind === 'bay') st.bays[t.id] = 1; else st.stock[t.id] = 1;
    this.nav.build(st);
    this.toast(null, t.kind === 'bay' ? '🧱 売り場を広げました！' : '📦 倉庫を広げました！', 'ok');
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
    const s = { id: st.nid++, role: a.role, name: String(a.name || pick(STAFF_NAMES)).slice(0, 10), seed, slot: no, spd: sl.spd, wage: slotWage(role, no) };
    st.staff.push(s);
    this.toast(null, `No.${no}「${sl.title}」な${s.name}さんを${role.name}として雇いました！（日給 ¥${s.wage.toLocaleString()}）`, 'ok');
    this.sfx('bell'); this.bump();
  }
  // 従業員の仕事を変える
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
    if (b) b.loc = { t: 'f', x: rt?.x ?? 0, y: this.stackHeight(rt?.x ?? 0, rt?.z ?? STOCK_Z + 4, b), z: rt?.z ?? STOCK_Z + 4, ry: 0 };
    for (const fid in this.dyn.regs) if (this.dyn.regs[fid].op === who) this.dyn.regs[fid].op = null;
    if (rt) { rt.st = 'idle'; rt.t = 0.5; rt.path = null; rt.bid = null; rt.fid = null; rt.msg = null; }
  }
  a_fire(uid, a) {
    if (!this.atBoard(uid)) return this.err(uid, BOARD_ONLY);
    const st = this.store, s = st.staff.find((o) => o.id === a.sid);
    if (!s) return;
    const who = 's:' + s.id;
    const b = this.heldBox(who); const rt = this.dyn.staffRt[s.id];
    if (b) b.loc = { t: 'f', x: rt?.x ?? 0, y: 0, z: rt?.z ?? STOCK_Z + 4, ry: 0 };
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
      if (zone.kind === 'office') return 'マネージャー室には置けません';
      if (def.place === 'sales' && zone.kind !== 'sales') return 'これは売り場にしか置けません';
    }
    const hit = (o) => fp.minX < o.maxX - eps && fp.maxX > o.minX + eps && fp.minZ < o.maxZ - eps && fp.maxZ > o.minZ + eps;
    const walls = getWalls(st);
    if (walls.some((w) => w.type === 'pillar' && hit(w))) return '柱と重なっています';
    if (walls.some(hit)) return '壁と重なっています';
    if (keepClear(st).some(hit)) return '入口・通路・荷受け場には置けません';
    for (const f of this.store.fixtures) {
      if (f.id === ignoreId) continue;
      if (hit(fixtureFootprint(f.t, f.x, f.z, f.r))) return '他の設備と重なっています';
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
      if (!PRODUCTS[p]) continue;
      const loc = deliverySpot(this.store, k++);
      loc.y = this.stackHeight(loc.x, loc.z, null);
      this.store.boxes.push({ id: this.store.nid++, p, n: boxUnits(p, half), loc, o: false, drop: 1 });
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
      const mess = st.boxes.filter((b) => b.loc.t === 'f' && b.n === 0 && b.loc.z > -14 && b.loc.z < 6).length;
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
    const gx = Math.ceil(total / 25); st.today.xp += gx;
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
      const [x, z] = [rand(-1, 1), STOCK_Z + 5]; // 倉庫から出勤
      rt = dyn.staffRt[s.id] = { x, z, ry: 0, st: 'idle', t: rand(0.5, 2), path: null, pi: 0, an: 'idle' };
    }
    const who = 's:' + s.id;
    // 個体差：No.1 は遅く、No.10 はとても速い（歩く速さも作業の速さも）
    const k = rt.k = (s.spd || 1) * (st.skills.staff_speed ? 1.35 : 1);
    const spd = 1.9 * k;
    if (rt.st !== 'idle' && rt.path && rt.pi < (rt.path?.length || 0)) rt.an = 'walk';
    if (s.role === 'cashier') return this.staffCashier(s, rt, dt, spd, who);
    if (s.role === 'stocker') return this.staffStocker(s, rt, dt, spd, who);
    if (s.role === 'porter') return this.staffPorter(s, rt, dt, spd, who);
    if (s.role === 'cleaner') return this.staffCleaner(s, rt, dt, spd, who);
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
    const empty = this.store.boxes.filter((b) => b.n <= 0 && b.loc.t !== 'h' && !claimed.has(b.id));
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
        held.o = false;
        const spot = this.freeRackSlot(rt.x, rt.z);
        if (!spot) { held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: rt.ry }; this.bump(); rt.st = 'idle'; return; }
        const [ax, az] = rackAccess(spot.f, spot.si);
        if (this.goto(rt, ax, az)) { rt.st = 'torack'; rt.fid = spot.f.id; rt.si = spot.si; }
        else { held.loc = { t: 'f', x: rt.x, y: 0, z: rt.z, ry: 0 }; this.bump(); rt.st = 'idle'; }
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
        if (!job) { rt.msg = this._noStock ? 'nobox' : null; return; }
        rt.msg = null;
        const [bx, bz] = this.boxAccess(job.b);
        if (this.goto(rt, bx, bz)) { rt.st = 'tobox'; rt.bid = job.b.id; rt.fid = job.f.id; rt.si = job.si; }
      }
    }
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
  staffPorter(s, rt, dt, spd, who) {
    const held = this.heldBox(who);
    if (rt.st === 'tobox') {
      const b = this.box(rt.bid);
      if (!b || b.loc.t !== 'f') { rt.st = 'idle'; rt.t = 0.3; return; }
      if (stepPath(rt, dt, spd)) {
        b.loc = { t: 'h', who }; this.bump();
        const spot = this.freeRackSlot(rt.x, rt.z);
        if (!spot) { b.loc = { t: 'f', x: rt.x, y: 0, z: rt.z, ry: 0 }; rt.st = 'idle'; return; }
        const [ax, az] = rackAccess(spot.f, spot.si);
        if (this.goto(rt, ax, az)) { rt.st = 'torack'; rt.fid = spot.f.id; rt.si = spot.si; } else { b.loc = { t: 'f', x: rt.x, y: 0, z: rt.z, ry: 0 }; rt.st = 'idle'; }
      }
      return;
    }
    if (rt.st === 'torack') {
      if (!held) { rt.st = 'idle'; return; }
      if (stepPath(rt, dt, spd)) {
        const occupied = this.store.boxes.some((o) => o.loc.t === 'r' && o.loc.fid === rt.fid && o.loc.si === rt.si);
        if (occupied || !this.fx(rt.fid)) { const sp = this.freeRackSlot(rt.x, rt.z); if (sp) { const [ax, az] = rackAccess(sp.f, sp.si); rt.fid = sp.f.id; rt.si = sp.si; if (this.goto(rt, ax, az)) return; } held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: 0 }; this.bump(); rt.st = 'idle'; return; }
        held.loc = { t: 'r', fid: rt.fid, si: rt.si }; this.bump(); rt.st = 'idle'; rt.t = 0.4;
      }
      return;
    }
    if (held) { held.loc = { t: 'f', x: rt.x, y: this.stackHeight(rt.x, rt.z, held), z: rt.z, ry: 0 }; this.bump(); }
    if (!this.staffIdle(rt, dt)) return;
    if (!this.freeRackSlot(rt.x, rt.z)) return;
    const claimed = new Set(this.store.staff.map((o) => this.dyn.staffRt[o.id]?.bid));
    const floor = this.store.boxes.filter((b) => b.loc.t === 'f' && b.n > 0 && !claimed.has(b.id) && b.loc.y < 0.05 + 2);
    if (!floor.length) return;
    floor.sort((a, b) => b.loc.y - a.loc.y || dist2(rt.x, rt.z, a.loc.x, a.loc.z) - dist2(rt.x, rt.z, b.loc.x, b.loc.z));
    const b = floor[0];
    if (this.goto(rt, b.loc.x, b.loc.z)) { rt.st = 'tobox'; rt.bid = b.id; }
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
const BOARD_ONLY = '📋 マネージャー室のボードの前で操作してください';
export function customerFactors(st) {
  const bays = Math.max(1, Object.keys(st.bays || {}).length);
  return {
    lv: 1 + 0.06 * ((st.level || 1) - 1),           // Lv30 で約2.7倍
    size: Math.pow(bays / START_BAYS.length, 0.75),  // 売り場40区画で約2.5倍
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
  return Math.round(items.reduce((s, [p, n, half]) => s + marketCost(store, p) * boxUnits(p, half) * n, 0) * m);
}
