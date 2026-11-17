// ===== ゲームセッション（操作・同期・描画の橋渡し） =====
import * as THREE from 'three';
import { Sim, normalizeStore, getPrice, priceLimit } from './sim.js';
import { FIXTURES, PRODUCTS, boxProd, PLAYER_BOUNDS, PLAYER_SPAWN, BUILDING, MANAGER, STAFF_ROLES, TRASH_TYPES, DELIVERY_AREA, marketPrice, getWalls, fixtureFootprint, snapFixture, worldToLocal, pickSlot, pickBoxSlot,
  checkoutSpot, localToWorld, slotCapacity, pickTag, tagLocal } from './data.js';
import { clamp, yen, dist, angleLerp, lerp } from './util.js';
import { toast, h, modal, confirmBox } from './ui.js';
import { sanitizeAvatar } from './models/character.js';

const RAY = new THREE.Raycaster();
const V2 = new THREE.Vector2();
const REACH = 2.5;

export class Game {
  constructor(app, opts) {
    const { mode, room, roomId } = opts;
    this.app = app; this.mode = mode; this.room = room; this.roomId = roomId;
    this.me = app.profile.pid;
    this.R = app.renderer; this.input = app.input; this.ui = app.gameUI;
    this.ui.bind(this);
    this.players = {};
    this.events = [];
    this.local = !!opts.local;
    // ひとり・ホスト：自分のお店で遊ぶ（ホストがみんなで進めた分も自分のお店に保存）。参加した側はホストのお店を見るだけ
    if (mode !== 'client') { this.sim = new Sim(app.profile.store); this.store = this.sim.store; this.sim.players[this.me] = { x: 0, z: 0, name: app.profile.name }; this.sim.room = !!room; this.sim.custCap = app.renderer.lite ? 24 : 36; }
    else { this.store = null; }
    this.dyn = null;
    const [sx, sz] = PLAYER_SPAWN;
    this.pc = { x: sx + (Math.random() - 0.5), z: sz, y: 0, vy: 0, ry: Math.PI, yaw: Math.PI, pitch: 0.18, grounded: true };
    this.state = 'walk'; // walk | reg | build
    this.regFid = null;
    this.build = { sel: null, moving: null, r: 0, x: 0, z: 0, ok: false };
    this.timers = { net: 0, store: 0, dyn: 0, save: 0, cloud: 0, rank: 0, repeat: 0 };
    this.lastParts = {};
    this.chat = {};
    this.colRev = -1;
    this.setUIBlock(false); // 前の画面の状態を引き継がない
    this.camDist = 3.4;
    if (room) this._bindRoom();
    this.ui.show(true);
    this.input.setRoom(!!room);
    this.input.wheelOff = this.input.on('wheel', (d) => { this.camDist = clamp(this.camDist + d * 0.4, 1.8, 6); });
    if (room) this.ui.setRoom([h('b', {}, '👥 ルーム ' + roomId), h('span', { class: 'plist2' })]);
    if (!this.app.profile.tutorialDone && mode !== 'client') setTimeout(() => { if (this.app.game === this) this.help(true); }, 600);
    // 何もない状態から：まずは発注
    setTimeout(() => { const st = this.store; if (st && st.day === 1 && st.phase === 'prep' && !st.boxes.length && !st.fixtures.some((f) => f.s && f.s.some((x) => x[1] > 0))) toast('📋 まずは入口の右のパソコン室（倉庫から入る）のボードで商品を発注しよう！', 'ok', 5000); }, 2500);
  }
  _bindRoom() {
    const R = this.room;
    R.on('players', (pl) => {
      const prev = this.players;
      this.players = {};
      for (const [uid, p] of Object.entries(pl)) {
        if (uid === this.me) continue;
        let av = p.av; if (typeof av === 'string') { try { av = JSON.parse(av); } catch (e) { av = null; } }
        this.players[uid] = { ...p, av: sanitizeAvatar(av) };
        if (this.sim) this.sim.players[uid] = { x: p.x, z: p.z, name: p.n };
        if (!prev[uid]) toast(`👋 ${p.n || '???'} さんが参加しました`, 'ok');
      }
      for (const uid of Object.keys(prev)) if (!this.players[uid]) { toast(`${prev[uid].n || '???'} さんが退出しました`); if (this.sim) this.sim.playerLeft(uid); }
      const names = [this.app.profile.name, ...Object.values(this.players).map((p) => p.n)];
      const el = this.ui.roomInfo.querySelector('.plist2'); if (el) el.textContent = ` ${names.length}/4人：` + names.join('・');
    });
    R.on('action', ({ uid, a }) => { if (this.sim) { try { this.sim.act(uid, typeof a === 'string' ? JSON.parse(a) : a); } catch (e) { console.warn(e); } } });
    R.on('store', (parts) => {
      try {
        let changed = false;
        for (const k of ['core', 'fx', 'bx']) if (parts[k] && parts[k] !== this.lastParts[k]) { this.lastParts[k] = parts[k]; changed = true; }
        if (!changed || !this.lastParts.core || !this.lastParts.fx || !this.lastParts.bx) return;
        const core = JSON.parse(this.lastParts.core);
        const st = { ...core, fixtures: JSON.parse(this.lastParts.fx), boxes: JSON.parse(this.lastParts.bx) };
        st.rev = (this.store?.rev || 0) + 1;
        st.time = this.dyn?.time ?? this.store?.time ?? core.time ?? 480;
        const prevPhase = this.store?.phase;
        this.store = st;
        if (this.roomId) this.app.rememberRoom(this.roomId, st); // 参加したルームを覚えておく（ルーム画面の「前に遊んだルーム」）
        if (prevPhase === 'summary' && st.phase !== 'summary') this.ui.closeSummary();
        this.ui.refresh();
      } catch (e) { console.warn('store parse', e); }
    });
    R.on('dyn', (d) => { this.dyn = d; if (this.store) this.store.time = d.time; });
    R.on('event', (e) => { try { this.handleEvent(typeof e === 'string' ? JSON.parse(e) : e); } catch (err) { console.warn(err); } });
    R.on('chat', (c) => this.onChat(c));
    R.on('closed', (why) => { if (this._closing) return; this._closing = true; toast('⚠ ' + why, 'warn', 4000); this.app.endGame(true); });
    if (R.requestState) { R.requestState(); setTimeout(() => { if (this.app.game === this && !this.store) R.requestState(); }, 300); }
    // それでも店が届かないときは数秒おきに取り直す（ホストが準備中で何も変えていなくても入れるように）
    this._stateRetry = setInterval(() => { if (this.app.game !== this) return clearInterval(this._stateRetry); if (!this.store && R.requestState) R.requestState(); else if (this.store) clearInterval(this._stateRetry); }, 2000);
  }
  setUIBlock(v) {
    this.uiBlock = v; this.input.uiBlock = v;
    if (v) this.input.releasePointer();
  }
  act(a) {
    if (this.sim) this.sim.act(this.me, a);
    else if (this.room) this.room.sendAction(a);
  }

  // ---------- イベント ----------
  handleEvent(e) {
    const me = this.me;
    switch (e.t) {
      case 'toast': if (!e.to || e.to === me) toast(e.msg, e.kind); break;
      case 'sfx': {
        if (e.to && e.to !== me) break;
        let v = 1;
        if (e.x != null) v = clamp(1.1 - dist(e.x, e.z, this.pc.x, this.pc.z) / 22, 0.1, 1);
        this.app.sfx.play(e.s, v); break;
      }
      case 'levelup':
        toast(e.max ? `👑 最高レベル Lv.${e.level} に到達！（SP+${e.sp || 1}）` : `🎉 レベルアップ！ Lv.${e.level}（SP+${e.sp || 1}）${this.room ? '　SPはルームのみんなで共有' : ''}`, 'level', 3500);
        if (e.prods?.length) setTimeout(() => toast(`🆕 スキルボードで新しく解放できるようになりました：${e.prods.join("・")}`, "ok", 5000), 1200);
        break;
      case 'summary': this.ui.closeAll(); this.ui.showSummary(e.data, this.mode !== 'client'); this.leaveRegister(true); if (this.sim) this.app.saveGame(true); break;
      case 'newday': {
        this.ui.closeSummary(); toast(`☀️ ${e.day}日目の朝！準備ができたら入口の看板をOPENにしよう`, 'ok', 3600);
        const news = [e.up && PRODUCTS[e.up[0]] ? `${PRODUCTS[e.up[0]].icon}${PRODUCTS[e.up[0]].name} ▲${e.up[1]}%` : '', e.down && PRODUCTS[e.down[0]] ? `${PRODUCTS[e.down[0]].icon}${PRODUCTS[e.down[0]].name} ▼${e.down[1]}%` : ''].filter(Boolean);
        if (news.length) setTimeout(() => toast('📈 今日の相場：' + news.join('　'), '', 4200), 900);
        break;
      }
      case 'sale': if (e.who === me) toast(`💴 +${yen(e.total)}`, 'money', 1400); break;
      case 'review': {
        // 口コミはときどきだけ知らせる（とても良い・悪いとき）
        const r = e.r, now = performance.now();
        if (!r || (r.s > 1 && r.s < 5) || now - (this._rvT || 0) < 25000) break;
        this._rvT = now;
        toast(`💬 口コミ ${'★'.repeat(r.s)}${'☆'.repeat(5 - r.s)}「${r.m}」`, r.s <= 2 ? 'warn' : 'ok', 3200);
        break;
      }
      default: break;
    }
  }
  onChat(c) {
    this.ui.addChat(c);
    this.chat[c.uid] = { text: String(c.m || '').slice(0, 40), t: 5 };
    if (c.uid !== this.me) this.app.sfx.play('chat');
  }
  sendChat(text) {
    if (!this.room) return;
    this.room.sendChat({ uid: this.me, n: this.app.profile.name, m: text.slice(0, 60) });
  }

  // ---------- 毎フレーム ----------
  update(dt) {
    const st = this.store;
    if (this.sim) {
      this.sim.players[this.me] = { x: this.pc.x, z: this.pc.z, name: this.app.profile.name };
      this.sim.tick(dt);
      this.dyn = this.sim.dynSnapshot();
      if (this.sim.events.length) {
        const evs = this.sim.events.splice(0);
        for (const e of evs) { this.handleEvent(e); if (this.room) this.room.sendEvent(e); }
      }
    }
    if (!this.store) { this.R.camera.position.set(0, 8, 20); this.R.camera.lookAt(0, 1, 0); this.ui.setHint('ホストの店に接続中…'); return; }
    const inp = this.input.poll();
    this._collisions();
    if (inp.edges.has('menu')) { if (this.state === 'build') this.toggleBuild(false); else if (this.state === 'reg') this.leaveRegister(); else this.ui.openPause(); }
    if (inp.edges.has('chat') && this.room) this.ui.openChat();
    if (inp.edges.has('tab') && this.state !== 'build' && this.state !== 'reg' && !this.ui.open) this.ui.openRep();
    if (inp.edges.has('cam')) { this.app.settings.cam = this.app.settings.cam === 'first' ? 'third' : 'first'; this.app.applySettings(); }
    if (inp.edges.has('build')) this.toggleBuild(this.state !== 'build');
    if (this.state === 'reg') this._updateReg(dt, inp);
    else this._updateWalk(dt, inp);
    this._net(dt);
    this._render(dt);
    this.ui.updateHUD(dt, this.store, this.dyn);
    this.app.profile.playTime += dt;
    if (this.sim) {
      this.timers.save += dt;
      if (this.timers.save > 20) { this.timers.save = 0; this.app.saveGame(false); }
    }
    this.timers.rank += dt;
    if (this.timers.rank > 90) { this.timers.rank = 0; this.app.pushRank(); }
  }
  _collisions() {
    const st = this.store;
    if (st.rev === this.colRev) return;
    this.colRev = st.rev;
    this.rects = [...getWalls(st), ...this.R.world.obstacles];
    for (const f of st.fixtures) { if (FIXTURES[f.t]?.air) continue; const fp = fixtureFootprint(f.t, f.x, f.z, f.r); this.rects.push({ minX: fp.minX + 0.04, maxX: fp.maxX - 0.04, minZ: fp.minZ + 0.04, maxZ: fp.maxZ - 0.04, fx: true }); }
  }
  _move(dx, dz) {
    const p = this.pc, r = 0.28;
    p.x += dx; p.z += dz;
    for (let it = 0; it < 3; it++) for (const b of this.rects) {
      if (p.y > 1.2 && b.fx) continue;
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
      const ddx = p.x - cx, ddz = p.z - cz, d2 = ddx * ddx + ddz * ddz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += ddx * k; p.z += ddz * k; }
        else { // 中に入り込んだ：近い辺へ押し出す
          const opts = [[b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
    }
    p.x = clamp(p.x, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX); p.z = clamp(p.z, PLAYER_BOUNDS.minZ, PLAYER_BOUNDS.maxZ);
  }
  get inside() { const p = this.pc; return (p.x > BUILDING.minX && p.x < BUILDING.maxX && p.z > BUILDING.minZ && p.z < BUILDING.maxZ) || (p.x > MANAGER.x0 && p.x < MANAGER.x1 && p.z > MANAGER.z0 && p.z < MANAGER.z1); }
  _camera(dt) {
    const p = this.pc, cam = this.R.camera, s = this.app.settings;
    const height = this.app.profile.av.height || 1;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (s.cam === 'first') {
      // 目の高さ＋歩くと少し揺れる
      this._bobT = (this._bobT || 0) + (this.moving && p.grounded ? dt * 9.5 : 0);
      this._bobA = lerp(this._bobA || 0, this.moving && p.grounded ? 1 : 0, Math.min(1, dt * 8));
      const by = Math.abs(Math.sin(this._bobT)) * 0.035 * this._bobA, bx = Math.cos(this._bobT) * 0.018 * this._bobA;
      this.fpBob = -by * 0.6;
      const ey = p.y + 1.6 * height + by, ex = p.x + Math.cos(p.yaw) * bx, ez = p.z - Math.sin(p.yaw) * bx;
      cam.position.set(ex, ey, ez);
      cam.lookAt(ex + fx * Math.cos(p.pitch), ey - Math.sin(p.pitch), ez + fz * Math.cos(p.pitch));
      return;
    }
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw), sh = 0.42;
    const tx = p.x + rx * sh, ty = p.y + 1.55 * height, tz = p.z + rz * sh;
    let d = this.camDist;
    const dirx = -fx * Math.cos(p.pitch), diry = Math.sin(p.pitch), dirz = -fz * Math.cos(p.pitch);
    // 壁にめり込まないよう短くする
    for (let k = 0.3; k <= d; k += 0.1) {
      const x = tx + dirx * k, y = ty + diry * k, z = tz + dirz * k;
      if ((this.inside && y > 3.55) || this.rects.some((b) => !b.fx && x > b.minX - 0.15 && x < b.maxX + 0.15 && z > b.minZ - 0.15 && z < b.maxZ + 0.15 && y < 4.3)) { d = Math.max(0.4, k - 0.15); break; }
    }
    this._cd = this._cd == null ? d : Math.min(d, this._cd + dt * 4);
    d = this._cd;
    cam.position.set(tx + dirx * d, ty + diry * d, tz + dirz * d);
    cam.lookAt(tx, ty, tz);
  }
  _updateWalk(dt, inp) {
    const p = this.pc, s = this.app.settings;
    p.yaw -= inp.look.x; p.pitch = clamp(p.pitch + inp.look.y, -1.1, 1.25);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    const sp = (inp.run ? 5.6 : 3.5) * (this.state === 'build' ? 1.1 : 1);
    const mx = (fx * inp.move.y + rx * inp.move.x) * sp * dt, mz = (fz * inp.move.y + rz * inp.move.x) * sp * dt;
    this.moving = Math.hypot(mx, mz) > 1e-4;
    if (this.moving) { this._move(mx, mz); if (s.cam !== 'first') p.ry = angleLerp(p.ry, Math.atan2(mx, mz), Math.min(1, dt * 12)); }
    if (s.cam === 'first') p.ry = p.yaw;
    // ジャンプ
    if (inp.edges.has('jump') && p.grounded) { p.vy = 4.6; p.grounded = false; this.app.sfx.play('jump', 0.5); }
    p.vy -= 13 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
    this._camera(dt);
    if (this.state === 'build') return this._updateBuild(dt, inp);
    this._interact(dt, inp);
  }

  // ---------- 狙っている物と行動 ----------
  _target() {
    const cam = this.R.camera, p = this.pc;
    V2.set(0, 0); RAY.setFromCamera(V2, cam); RAY.far = 12;
    RAY.near = this.app.settings.cam === 'first' ? 0.05 : Math.max(0.05, (this._cd || 3) - 0.4); // 自分より後ろの物は狙わない
    const skip = new Set(this.store.boxes.filter((b) => b.loc.t === 'h').map((b) => b.id));
    const hit = this.R.pick(RAY, { boxes: true, fixtures: true, skip });
    RAY.near = 0;
    const front = hit ? (hit.point.x - p.x) * Math.sin(p.yaw) + (hit.point.z - p.z) * Math.cos(p.yaw) : 0;
    if (hit && front > -0.15 && dist(hit.point.x, hit.point.z, p.x, p.z) <= REACH + (hit.type === 'fixture' && ['checkout', 'pc', 'freezer', 'produce', 'mboard', 'fboard', 'xboard', 'recycle', 'opensign', 'dumpster', 'trash'].includes(this.fx(hit.fid)?.t) ? 0.7 : 0)) {
      if (hit.type === 'fixture') {
        const f = this.fx(hit.fid); if (!f) return null;
        const [lx, lz] = worldToLocal(f, hit.point.x, hit.point.z);
        const def = FIXTURES[f.t];
        hit.f = f;
        if (def.slots) { hit.si = pickSlot(f.t, lx, hit.point.y, lz); hit.ti = pickTag(f, lx, hit.point.y, lz); }
        if (def.boxSlots) hit.bi = pickBoxSlot(f.t, lx, hit.point.y);
      }
      return hit;
    }
    // 手前の箱を拾いやすく
    if (!this.held()) {
      let bestC = null, bdc = 1.9;
      for (const c of this.store.crates || []) {
        if (c.loc.t !== 'f') continue;
        const d = dist(c.loc.x, c.loc.z, p.x, p.z), ang = Math.abs(angleLerp(0, Math.atan2(c.loc.x - p.x, c.loc.z - p.z) - p.yaw, 1));
        if (d < bdc && ang < 0.9) { bdc = d; bestC = c; }
      }
      if (bestC) return { type: 'crate', cid: bestC.id, point: { x: bestC.loc.x, y: 0.4, z: bestC.loc.z } };
      let best = null, bd = 1.6;
      for (const b of this.store.boxes) {
        if (b.loc.t !== 'f') continue;
        const d = dist(b.loc.x, b.loc.z, p.x, p.z);
        const ang = Math.abs(angleLerp(0, Math.atan2(b.loc.x - p.x, b.loc.z - p.z) - p.yaw, 1));
        if (d < bd && ang < 1.0) { bd = d; best = b; }
      }
      if (best) return { type: 'box', bid: best.id, point: { x: best.loc.x, y: best.loc.y, z: best.loc.z } };
    }
    return null;
  }
  fx(id) { return this.store.fixtures.find((f) => f.id === id); }
  held() { return this.store.boxes.find((b) => b.loc.t === 'h' && b.loc.who === this.me); }
  dropPoint() { const p = this.pc; return { x: p.x + Math.sin(p.ry) * 0.75, z: p.z + Math.cos(p.ry) * 0.75, ry: p.ry }; }
  heldCrate() { return (this.store?.crates || []).find((c) => c.loc.t === 'h' && c.loc.who === this.me); }
  // 置く場所：画面のまん中で狙った床（自分と重ならないように少し押し出す）
  _placeAim(type, r, ignoreId) {
    const cam = this.R.camera, p = this.pc;
    V2.set(0, 0); RAY.setFromCamera(V2, cam);
    const o = RAY.ray.origin, d = RAY.ray.direction;
    let x, z;
    if (d.y < -0.05) { const k = -o.y / d.y; x = o.x + d.x * k; z = o.z + d.z * k; }
    else { x = p.x + Math.sin(p.yaw) * 3; z = p.z + Math.cos(p.yaw) * 3; }
    const dd = dist(x, z, p.x, p.z); if (dd > 7) { x = p.x + (x - p.x) / dd * 7; z = p.z + (z - p.z) / dd * 7; }
    [x, z] = snapFixture(type, x, z, r);
    const overMe = (xx, zz) => { if (FIXTURES[type]?.air) return false; const f = fixtureFootprint(type, xx, zz, r); return p.x > f.minX - 0.3 && p.x < f.maxX + 0.3 && p.z > f.minZ - 0.3 && p.z < f.maxZ + 0.3; };
    for (let k = 1; k <= 16 && overMe(x, z); k++) [x, z] = snapFixture(type, x + Math.sin(p.yaw) * 0.25, z + Math.cos(p.yaw) * 0.25, r);
    const check = Sim.prototype.canPlaceFixture.call({ store: this.store }, type, x, z, r, ignoreId);
    let ok = check === true, why = check;
    if (ok && overMe(x, z)) { ok = false; why = '自分と重なっています（少し離れてね）'; }
    return { x, z, ok, why };
  }
  // 大きい段ボールを持っているとき：置く場所を選んで「ここに置く」で設置
  _crateActions(c, inp) {
    const def = FIXTURES[c.ft];
    if (inp.edges.has('rotate')) this.crateR = ((this.crateR || 0) + 1) % 4;
    const r = this.crateR || 0, P = this._placeAim(c.ft, r, null);
    this.R.setGhost(c.ft, P.x, P.z, r, P.ok, this.store); this._crateGhost = true;
    return {
      info: `📦 <b>${def.icon} ${def.name}</b>の大きい段ボール`,
      hint: P.ok ? '置きたい場所を狙って「ここに置く」（「回す」で向きを変える）' : '⚠ ' + P.why,
      act: { label: 'ここに置く', fn: () => { if (!P.ok) { toast(P.why, 'warn'); this.app.sfx.play('err'); return; } this.act({ t: 'unpack', x: P.x, z: P.z, r }); } },
      alt: { label: '回す', fn: () => { this.crateR = (r + 1) % 4; } },
      box: { label: '下ろす', icon: '📦', fn: () => this.act({ t: 'crateDrop', ...this.dropPoint() }) },
      slot: null,
    };
  }
  _actions(t) {
    const held = this.held(), st = this.store;
    const A = { act: null, alt: null, hint: '', info: '', slot: null };
    // 床に置いてある大きい段ボール（設備）
    if (t?.type === 'crate') {
      const c = (st.crates || []).find((o) => o.id === t.cid);
      if (c) {
        const def = FIXTURES[c.ft];
        A.info = `📦 <b>${def.icon} ${def.name}</b>の大きい段ボール`;
        if (held) { A.hint = '持っている箱を置いてから持とう'; A.box = { label: '床に置く', fn: () => this.act({ t: 'drop', ...this.dropPoint() }) }; return A; }
        A.act = { label: '持つ', fn: () => { this.crateR = 0; this.act({ t: 'cratePick', cid: c.id }); } };
        A.alt = { label: `返品 +${yen(def.price)}`, fn: async () => { this.setUIBlock(true); const ok = await confirmBox(`${def.icon} ${def.name}を返品しますか？（${yen(def.price)}もどります）`, '返品する'); this.setUIBlock(false); if (ok) this.act({ t: 'crateReturn', cid: c.id }); } };
        A.hint = '持って、置きたい場所で「ここに置く」';
        return A;
      }
    }
    const drop = { label: '床に置く', fn: () => this.act({ t: 'drop', ...this.dropPoint() }) };
    if (held) {
      const p = boxProd(held.p), empty = held.n <= 0;
      A.info = empty ? `📦 <b>空の段ボール</b>${PRODUCTS[held.p] ? `（${p.icon} ${p.name}の箱）` : ''}${held.o ? '（開いている）' : '（閉じている）'}<br>棚の商品を1種類だけ詰めて運べます（模様替えに）`
        : `📦 <b>${p.icon} ${p.name}</b> 残り ${held.n}/${p.qty}${held.o ? '（開いている）' : '（閉じている）'}`;
      A.box = { label: held.o ? '閉じる' : '開ける', fn: () => this.act({ t: 'boxOpen', open: !held.o }) };
      if (t?.type === 'fixture' && t.si != null && t.si >= 0 && empty) {
        // 空の段ボール：どの商品でも詰められる（詰めるとその商品の箱になる）
        const f = t.f, sl = FIXTURES[f.t].slots[t.si], s = f.s[t.si];
        A.slot = [f.id, sl];
        if (s[0] && s[1] > 0) {
          const sp = PRODUCTS[s[0]];
          if (!held.o) { A.act = { label: '開ける', fn: () => this.act({ t: 'boxOpen', open: true }) }; A.hint = `段ボールを開けると${sp.name}を詰められます`; }
          else { A.act = { label: '箱に詰める', repeat: true, fn: () => this.act({ t: 'unstock', fid: f.id, si: t.si }) }; A.hint = `${sp.icon} ${sp.name}を箱に詰める（1箱${sp.qty}個まで）`; }
          A.info += `<br>棚：${sp.icon} ${s[1]}/${slotCapacity(s[0], sl)}`;
        } else A.hint = '空の段ボール：商品が並んでいる棚から詰められます';
        A.alt = drop;
      } else if (t?.type === 'fixture' && t.si != null && t.si >= 0) {
        const f = t.f, sl = FIXTURES[f.t].slots[t.si], s = f.s[t.si];
        const cap = s[0] ? slotCapacity(s[0], sl) : slotCapacity(held.p, sl);
        A.slot = [f.id, sl];
        if (!p.place.includes(sl.kind)) A.hint = `⚠ ${p.name}はこの棚に置けません`;
        else if (s[0] && s[0] !== held.p && s[1] > 0) A.hint = `⚠ ${PRODUCTS[s[0]].name}が並んでいます`;
        else if (s[1] >= cap && (!s[0] || s[0] === held.p)) A.hint = '棚がいっぱいです';
        else if (held.n > 0 && !held.o) { A.act = { label: '開ける', fn: () => this.act({ t: 'boxOpen', open: true }) }; A.hint = '段ボールを開けると補充できます'; }
        else if (held.n > 0) A.act = { label: '補充', repeat: true, fn: () => this.act({ t: 'stock', fid: f.id, si: t.si }) };
        else A.hint = '箱が空です（ゴミ箱に捨てよう）';
        if (s[0] === held.p && s[1] > 0 && held.n < p.qty && held.o) A.alt = { label: '回収', repeat: true, fn: () => this.act({ t: 'unstock', fid: f.id, si: t.si }) };
        else A.alt = drop;
        A.info += s[0] ? `<br>棚：${PRODUCTS[s[0]].icon} ${s[1]}/${cap}` : '<br>棚：空き（補充するとその商品の値札がつきます）';
      } else if (t?.type === 'fixture' && t.bi != null && t.bi >= 0) {
        const occupied = st.boxes.some((b) => b.loc.t === 'r' && b.loc.fid === t.fid && b.loc.si === t.bi);
        const sl = FIXTURES[t.f.t].boxSlots[t.bi];
        A.slot = [t.fid, { x: sl.x, y: sl.y, z: sl.z, w: 0.6, h: 0.45, d: 0.46 }];
        A.act = occupied ? null : { label: '棚に置く', fn: () => this.act({ t: 'rackBox', fid: t.fid, si: t.bi }) };
        if (occupied) A.hint = 'その段は埋まっています';
        A.alt = drop;
      } else if (t?.type === 'fixture' && t.f.t === 'recycle') {
        A.act = held.n === 0 ? { label: 'リサイクル', fn: () => this.act({ t: 'recycle' }) } : null; A.hint = held.n ? '空の箱だけリサイクルできます' : ''; A.alt = drop;
      } else if (t?.type === 'fixture' && t.f.t === 'opensign') {
        Object.assign(A, this._signAction(st)); A.alt = drop;
      } else if (t?.type === 'fixture' && TRASH_TYPES.includes(t.f.t)) {
        const fid = t.f.id;
        A.act = held.n === 0 ? { label: 'ゴミ箱に捨てる', fn: () => this.act({ t: 'discard', fid }) } : null; A.hint = held.n ? '空の段ボールだけ捨てられます' : ''; A.alt = drop;
      } else {
        A.act = drop;
        if (held.n === 0) A.hint = '空の段ボール：棚の商品を詰めて運べます（いらなければゴミ箱🗑️・リサイクル♻️へ）';
      }
      return A;
    }
    if (!t) return A;
    if (t.type === 'box') {
      const b = st.boxes.find((o) => o.id === t.bid); if (!b) return A;
      const p = boxProd(b.p);
      A.info = b.n > 0 ? `📦 <b>${p.icon} ${p.name}</b> ×${b.n}${b.o ? '（開いている）' : ''}` : `📦 <b>空の段ボール</b>${b.o ? '（開いている）' : ''}<br>どの商品でも1種類だけ詰められます`;
      A.act = { label: '拾う', fn: () => this.act({ t: 'pick', bid: b.id }) };
      if (b.loc.t === 'f' && b.loc.y < 0.05) A.alt = { label: b.o ? '閉じる' : '開ける', fn: () => this.act({ t: 'boxOpen', bid: b.id, open: !b.o }) };
      return A;
    }
    const f = t.f, def = FIXTURES[f.t];
    // 棚やレジは狙うだけで「動かす」（F／📦ボタン）
    if (!def.fixed) A.box = { label: '動かす', icon: '🔧', fn: () => this.startMove(f) };
    if (def.slots && t.ti >= 0) {
      // 値札を狙っている → その商品の値段を変えられる
      const s = f.s[t.ti], sl = def.slots[t.ti], p = PRODUCTS[s[0]], price = getPrice(st, s[0]);
      const [tx, ty, tz] = tagLocal(f.t, sl);
      A.slot = [f.id, { x: tx, y: ty - 0.045, z: tz, w: 0.15, h: 0.09, d: 0.05 }];
      A.info = `🏷 <b>${p.icon} ${p.name}</b> の値札<br>売値 <b>${yen(price)}</b>（相場 ${yen(marketPrice(st, s[0]))}・${yen(priceLimit(st, s[0]))}まで売れる）${price > priceLimit(st, s[0]) ? '<br><b style="color:#ff6b81">🚫 高すぎて売れません</b>' : ''}`;
      A.act = { label: '値段を変える', icon: '🏷', fn: () => this.ui.openPrice(s[0]) };
      if (s[1] === 0) A.alt = { label: 'ラベル解除', fn: () => this.act({ t: 'clearSlot', fid: f.id, si: t.ti }) };
      return A;
    } else if (def.slots && t.si >= 0) {
      const s = f.s[t.si], sl = def.slots[t.si];
      A.slot = [f.id, sl];
      if (s[0]) {
        const p = PRODUCTS[s[0]], price = getPrice(st, s[0]);
        A.info = `<b>${p.icon} ${p.name}</b> ${s[1]}/${slotCapacity(s[0], sl)}<br>売値 ${yen(price)}（相場 ${yen(marketPrice(st, s[0]))}）${price > priceLimit(st, s[0]) ? '<br><b style="color:#ff6b81">🚫 高すぎて売れません</b>' : ''}`;
        A.hint = '🏷 棚のふちの値札を狙うと値段を変えられます';
        if (s[1] === 0) A.alt = { label: 'ラベル解除', fn: () => this.act({ t: 'clearSlot', fid: f.id, si: t.si }) };
      } else { A.info = `${def.name}：空き（箱を持って補充）`; A.hint = '商品の箱を持ってきて「補充」しよう'; }
      return A;
    }
    if (f.t === 'opensign') return Object.assign(A, this._signAction(st));
    if (f.t === 'checkout') { A.act = { label: 'レジに入る', fn: () => this.enterRegister(f.id) }; A.info = '🧾 レジカウンター'; return A; }
    if (f.t === 'pc' || f.t === 'mboard') { A.act = { label: '発注・管理', fn: () => this.ui.openPC('order') }; A.info = '📋 マネージャーボード：発注・従業員・評判・お店'; return A; }
    if (f.t === 'fboard') { A.act = { label: 'スキル', fn: () => this.ui.openSkills() }; A.info = '🌟 フランチャイズボード'; return A; }
    if (f.t === 'xboard') { A.act = { label: '店舗拡張', fn: () => this.ui.openExpand() }; A.info = '🗺️ 売り場・倉庫を買い足す'; return A; }
    if (f.t === 'recycle') { A.info = '♻️ 空き箱を入れるとお金になる'; A.hint = '空き箱を持ってくるとリサイクルできます'; return A; }
    if (TRASH_TYPES.includes(f.t)) { A.info = `🗑️ ${def.name}`; A.hint = '空の段ボールを持ってきて捨てよう'; return A; }
    if (def.text) { A.act = { label: '文字を編集', fn: () => this.ui.openText(f.id) }; A.info = `${def.icon} ${def.name}`; return A; }
    if (def.boxSlots) { A.info = `${def.icon} ${def.name}`; A.hint = '箱を持ってきて置けます'; return A; }
    A.info = `${def.icon} ${def.name}`;
    return A;
  }
  _signAction(st) {
    if (st.phase === 'prep') return { act: { label: 'OPENにする', fn: () => this.act({ t: 'open' }) }, info: '🪧 入口の看板：<b style="color:#ff6b81">CLOSED</b>', hint: 'OPENにするとお客さんが来て1日がスタート！' };
    if (st.phase === 'open') return { act: { label: 'CLOSEDにする', fn: () => this.act({ t: 'open' }) }, info: '🪧 入口の看板：<b style="color:#4ade80">OPEN</b>（営業中）', hint: 'CLOSEDにすると新しいお客さんが来なくなり、店じまいします' };
    return { act: null, info: '🪧 入口の看板：<b style="color:#ff6b81">CLOSED</b>', hint: st.phase === 'closing' ? '店じまい中…残りのお客さんの会計をしよう' : '' };
  }
  _interact(dt, inp) {
    const crate = this.heldCrate();
    const t = crate ? null : this._target();
    if (!crate && this._crateGhost) { this._crateGhost = false; this.R.setGhost(null); }
    const A = crate ? this._crateActions(crate, inp) : this._actions(t);
    this.R.setHighlight(A.slot ? A.slot[0] : t?.type === 'fixture' ? t.fid : null, A.slot ? (() => { const s = A.slot[1]; return [s.x, s.y, s.z, s.w, s.h ?? 0.35, s.d]; })() : null);
    this.input.setLabel('act', A.act?.label || '', !!A.act);
    this.input.setLabel('alt', A.alt?.label || '', !!A.alt);
    this.input.setLabel('box', A.box?.label || '', !!A.box, A.box?.icon || '📦'); this.input.setVisible('box', !!A.box);
    this.ui.setHint(A.hint, A.info);
    const k = this.input.touchVisible ? '' : `${A.act ? 'E/左クリック：' + A.act.label + '　' : ''}${A.alt ? 'Q/右クリック：' + A.alt.label + '　' : ''}${A.box ? 'F：' + A.box.label + '　' : ''}B：建築　V：視点　Tab：評判　Esc：メニュー${this.room ? '　Enter：チャット' : ''}`;
    this.ui.setKeys(k);
    this.ui.showCross(true);
    this.timers.repeat -= dt;
    for (const id of ['act', 'alt', 'box']) {
      const a = A[id]; if (!a) continue;
      if (inp.edges.has(id)) { a.fn(); this.timers.repeat = 0.35; this.pc.ry = this.app.settings.cam === 'first' ? this.pc.ry : this.pc.yaw; this.reachT = 0.4; }
      else if (a.repeat && inp.held.has(id) && this.timers.repeat <= 0) { a.fn(); this.timers.repeat = 0.13; this.reachT = 0.3; }
    }
    this.reachT = Math.max(0, (this.reachT || 0) - dt);
  }

  // ---------- レジ ----------
  enterRegister(fid) {
    const f = this.fx(fid); if (!f) return;
    this.act({ t: 'regEnter', fid });
    this.state = 'reg'; this.regFid = fid;
    const [ox, oz] = checkoutSpot(f, -1);
    this.pc.x = ox; this.pc.z = oz; this.pc.y = 0;
    const [cx, cz] = localToWorld(f, 0, 0);
    this.pc.ry = Math.atan2(cx - ox, cz - oz);
    this.input.pointerFree = true; this.input.releasePointer(); this.input.overlay.classList.add('regmode');
    this.input.setLabel('act', 'スキャン', true); this.input.setLabel('alt', '離れる', true); this.input.setVisible('box', false);
    this.R.setHighlight(null);
    this.ui.setHint('', '');
  }
  leaveRegister(silent) {
    if (this.state !== 'reg') return;
    this.act({ t: 'regLeave' });
    this.state = 'walk'; this.regFid = null; this.input.pointerFree = false; this.input.overlay.classList.remove('regmode');
    this.ui.updateReg(null);
    const p = this.pc; p.yaw = p.ry;
    if (!silent) this.app.sfx.play('click');
  }
  scanNext() {
    const r = this.dyn?.r?.[this.regFid]; if (!r || r.ph !== 'scan') return;
    const i = r.b.findIndex((x) => !x[1]); if (i >= 0) this.act({ t: 'scan', fid: this.regFid, i });
  }
  _updateReg(dt, inp) {
    const f = this.fx(this.regFid);
    if (!f) return this.leaveRegister(true);
    const r = this.dyn?.r?.[this.regFid];
    if (r && r.op && r.op !== this.me && !String(r.op).startsWith('s:')) { toast('他の人がレジを担当しています', 'warn'); return this.leaveRegister(true); }
    const cam = this.R.camera;
    const [ox, oz] = checkoutSpot(f, -1);
    const [bx, bz] = localToWorld(f, 0.05, 0.35);
    const back = 0.75;
    const dx = ox - bx, dz = oz - bz, d = Math.hypot(dx, dz);
    cam.position.set(ox + dx / d * back * 0.3, 1.95, oz + dz / d * back * 0.3);
    cam.lookAt(bx, 0.85, bz);
    this.ui.showCross(false);
    this.ui.setKeys(this.input.touchVisible ? '' : '商品をクリック or E：スキャン　Q/Esc：レジを離れる');
    for (const tap of inp.taps) {
      V2.set(tap.x / window.innerWidth * 2 - 1, -(tap.y / window.innerHeight) * 2 + 1);
      RAY.setFromCamera(V2, cam); RAY.far = 6;
      const hit = this.R.pick(RAY, { boxes: false, fixtures: false, belts: true });
      if (hit?.type === 'belt' && hit.fid === this.regFid && r?.ph === 'scan') this.act({ t: 'scan', fid: this.regFid, i: hit.i });
    }
    if (inp.edges.has('act')) this.scanNext();
    if (inp.edges.has('alt') || inp.edges.has('menu')) { this.leaveRegister(); return; }
    if (this.state !== 'reg') return;
    this.ui.updateReg(r || { ph: 'idle', b: [], q: 0 }, this.regFid);
  }

  // ---------- 建築 ----------
  toggleBuild(on, move = null) {
    if (on && (this.held() || this.heldCrate())) { toast('箱を置いてから建築モードにしてね', 'warn'); return; }
    if (on && this.state === 'reg') this.leaveRegister(true);
    this.state = on ? 'build' : 'walk';
    this.build = { sel: null, moving: null, r: 0, x: 0, z: 0, ok: false };
    this.R.setGhost(null); this.R.setFixtureHidden(null);
    if (on && move) { this.build.moving = move; this.build.r = move.r; this.build.quick = true; this.R.setFixtureHidden(move.id); }
    this.ui.showBuild(on, move ? move.t : null, (id) => this.pickBuild(id), move ? { type: move.t, ok: false, why: '' } : null);
    this.ui.setHint('', '');
  }
  // 歩いている状態から、狙った設備をそのまま動かす
  startMove(f) {
    if (this.held()) { toast('箱を置いてから動かしてね', 'warn'); return; }
    this.toggleBuild(true, f);
    if (this.state !== 'build') return;
    toast(`${FIXTURES[f.t].icon} ${FIXTURES[f.t].name}を動かしています。置きたい場所を狙って「ここに移動」`, '', 3000);
  }
  pickBuild(id) { this.build.sel = id; this.build.moving = null; this.R.setGhost(null); this.R.setFixtureHidden(null); this.ui.showBuild(true, id, (x) => this.pickBuild(x)); }
  _updateBuild(dt, inp) {
    const B = this.build, cam = this.R.camera, p = this.pc;
    if (B.sel && !B.moving) {
      const def = FIXTURES[B.sel];
      this.R.setGhost(null); this.R.setHighlight(null);
      this.ui.showBuild(true, B.sel, (xx) => this.pickBuild(xx));
      this.input.setLabel('act', `買う ${yen(def.price)}`, this.store.money >= def.price);
      this.input.setLabel('alt', '', false);
      this.input.setLabel('box', '選択解除', true, '✖'); this.input.setVisible('box', true);
      this.ui.setHint(this.store.money >= def.price ? '買うと店の前に大きい段ボールで届きます。持って、置きたい場所で「ここに置く」' : '⚠ お金が足りません', `${def.icon} ${def.name}　${yen(def.price)}`);
      this.ui.setKeys(this.input.touchVisible ? '' : 'E：買う　F：選択解除　B/Esc：終了');
      if (inp.edges.has('box')) { this.pickBuild(null); return; }
      if (inp.edges.has('act')) { if (this.store.money < def.price) { toast('お金が足りません', 'warn'); this.app.sfx.play('err'); } else { this.act({ t: 'buy', ft: B.sel }); this.pickBuild(null); } }
      return;
    }
    const type = B.moving?.t;
    if (!type) this.ui.showBuild(true, null, (x) => this.pickBuild(x));
    if (inp.edges.has('rotate')) B.r = (B.r + 1) % 4;
    if (type) {
      V2.set(0, 0); RAY.setFromCamera(V2, cam);
      const o = RAY.ray.origin, d = RAY.ray.direction;
      let x, z;
      if (d.y < -0.05) { const k = -o.y / d.y; x = o.x + d.x * k; z = o.z + d.z * k; }
      else { x = p.x + Math.sin(p.yaw) * 3; z = p.z + Math.cos(p.yaw) * 3; }
      const dd = dist(x, z, p.x, p.z); if (dd > 7) { x = p.x + (x - p.x) / dd * 7; z = p.z + (z - p.z) / dd * 7; }
      [x, z] = snapFixture(type, x, z, B.r);
      // 自分と重なる位置なら、向いている方向へ少しずつ押し出す
      const overMe = (xx, zz) => { if (FIXTURES[type]?.air) return false; const f = fixtureFootprint(type, xx, zz, B.r); return p.x > f.minX - 0.3 && p.x < f.maxX + 0.3 && p.z > f.minZ - 0.3 && p.z < f.maxZ + 0.3; };
      for (let k = 1; k <= 16 && overMe(x, z); k++) [x, z] = snapFixture(type, x + Math.sin(p.yaw) * 0.25, z + Math.cos(p.yaw) * 0.25, B.r);
      B.x = x; B.z = z;
      const check = Sim.prototype.canPlaceFixture.call({ store: this.store }, type, x, z, B.r, B.moving?.id ?? null);
      B.ok = check === true; B.why = check;
      if (B.ok && overMe(x, z)) { B.ok = false; B.why = '自分と重なっています（少し離れてね）'; }
      this.ui.showBuild(true, B.sel || B.moving?.t, (xx) => this.pickBuild(xx), B.moving ? { type, ok: B.ok, why: B.why } : null);
      this.R.setGhost(type, x, z, B.r, B.ok, this.store);
      const price = FIXTURES[type].price;
      this.input.setLabel('act', B.moving ? 'ここに移動' : `設置 ${yen(price)}`, B.ok);
      this.input.setLabel('alt', '回転', true);
      this.input.setLabel('box', B.moving ? 'やめる' : '選択解除', true, '✖'); this.input.setVisible('box', true);
      if (inp.edges.has('box')) { if (B.quick) this.toggleBuild(false); else this.pickBuild(null); return; }
      this.ui.setHint(B.ok ? '' : '⚠ ' + B.why, `${FIXTURES[type].icon} ${FIXTURES[type].name}${B.moving ? '（移動中）' : ''}`);
      this.ui.setKeys(this.input.touchVisible ? '' : `E：${B.moving ? '移動' : '設置'}　Q/R：回転　F：${B.moving ? 'やめる' : '選択解除'}　B/Esc：終了`);
      if (inp.edges.has('alt')) B.r = (B.r + 1) % 4;
      if (inp.edges.has('act')) {
        if (!B.ok) { toast(B.why, 'warn'); this.app.sfx.play('err'); }
        else if (B.moving) { this.act({ t: 'move', fid: B.moving.id, x, z, r: B.r }); B.moving = null; this.R.setGhost(null); this.R.setFixtureHidden(null); if (B.quick) { this.toggleBuild(false); return; } }
        else this.act({ t: 'buy', ft: type, x, z, r: B.r });
      }
      this.R.setHighlight(null);
      return;
    }
    // 既存の設備を選ぶ
    const t = this._target();
    const f = t?.type === 'fixture' ? t.f : null;
    const def = f && FIXTURES[f.t];
    this.R.setHighlight(f && !def.fixed ? f.id : null);
    this.input.setVisible('box', false);
    this.input.setLabel('act', f && !def.fixed ? '移動' : '', !!f && !def.fixed);
    this.input.setLabel('alt', f && !def.fixed ? `売却 +${yen(def.price / 2)}` : '', !!f && !def.fixed);
    this.ui.setHint(f ? (def.fixed ? 'これは動かせません' : '') : '置きたい設備をリストから選ぶか、動かしたい棚・レジを狙ってね', f ? `${def.icon} ${def.name}` : '');
    this.ui.setKeys(this.input.touchVisible ? '' : 'E：移動　Q：売却　B/Esc：終了');
    if (f && !def.fixed) {
      if (inp.edges.has('act')) { B.moving = f; B.r = f.r; this.R.setFixtureHidden(f.id); }
      if (inp.edges.has('alt')) this.act({ t: 'sell', fid: f.id });
    }
  }

  // ---------- ネット送受信 ----------
  _net(dt) {
    if (!this.room) return;
    const T = this.timers, p = this.pc;
    T.net -= dt;
    if (T.net <= 0) {
      T.net = 0.1;
      const an = this.state === 'reg' ? 'scan' : this.reachT > 0 ? 'reach' : this.moving ? 'walk' : 'idle';
      const s = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), ry: +p.ry.toFixed(2), an };
      const k = JSON.stringify(s);
      if (k !== this._lastPl || (T.plForce = (T.plForce || 0) + 1) > 20) { this._lastPl = k; T.plForce = 0; this.room.sendPlayer(s); }
    }
    if (this.mode !== 'host') return;
    T.store -= dt; T.dyn -= dt;
    if (T.store <= 0) {
      T.store = 0.4;
      const st = this.store;
      const core = { ...st }; delete core.fixtures; delete core.boxes; delete core.time; delete core.rev;
      const parts = { core: JSON.stringify(core), fx: JSON.stringify(st.fixtures), bx: JSON.stringify(st.boxes) };
      for (const [k, v] of Object.entries(parts)) if (v !== this.lastParts[k]) { this.lastParts[k] = v; this.room.publishStorePart(k, v); }
    }
    if (T.dyn <= 0) { T.dyn = 0.18; this.room.publishDyn(JSON.stringify(this.dyn)); }
  }

  // ---------- 描画 ----------
  _render(dt) {
    const R = this.R, st = this.store, d = this.dyn || { c: [], s: [], r: {} };
    R.setTime(st.time);
    R.syncStore(st);
    const list = [];
    const s = this.app.settings;
    const heldBy = new Set(st.boxes.filter((b) => b.loc.t === 'h').map((b) => b.loc.who));
    const p = this.pc;
    const myAn = this.state === 'reg' ? 'scan' : this.reachT > 0 ? 'reach' : null;
    list.push({ key: 'me', kind: 'player', av: this.app.profile.av, x: p.x, y: p.y, z: p.z, ry: p.ry, local: true, an: myAn, carry: heldBy.has(this.me),
      name: s.names && this.room ? this.app.profile.name : null, nameColor: '#ffe14d', visible: s.cam !== 'first' || this.state === 'reg',
      bubble: this.chat[this.me] ? 'chat' : null, bubbleText: this.chat[this.me]?.text });
    for (const [uid, pl] of Object.entries(this.players)) {
      if (pl.x == null) continue;
      list.push({ key: 'p:' + uid, kind: 'player', av: pl.av, x: pl.x, y: pl.y || 0, z: pl.z, ry: pl.ry || 0, an: pl.an === 'walk' ? null : pl.an, carry: heldBy.has(uid),
        name: s.names ? pl.n : null, bubble: this.chat[uid] ? 'chat' : null, bubbleText: this.chat[uid]?.text });
    }
    for (const c of d.c || []) list.push({ key: 'c:' + c[0], kind: 'cust', av: c[1], seedAv: true, x: c[2], z: c[3], ry: c[4], an: c[5] === 'walk' ? null : c[5], bubble: c[6] || null, basket: c[7], items: c[8] || '', hold: c[9] || '', small: true });
    const staffById = Object.fromEntries(st.staff.map((x) => [x.id, x]));
    for (const e of d.s || []) {
      const sd = staffById[e[0]]; if (!sd) continue;
      list.push({ key: 's:' + e[0] + ':' + sd.seed, kind: 'staff', av: sd.seed, seedAv: true, uniform: st.color, x: e[1], z: e[2], ry: e[3], an: e[4] === 'walk' ? null : e[4], carry: heldBy.has('s:' + e[0]),
        name: s.names ? (STAFF_ROLES[sd.role]?.icon || '') + sd.name : null, nameColor: '#9fe8ff', small: true, bubble: e[5] || null });
    }
    for (const e of list) if (e.seedAv) e.av = this.app.avatarFromSeed(e.av, e.kind);
    for (const k of Object.keys(this.chat)) { this.chat[k].t -= dt; if (this.chat[k].t <= 0) delete this.chat[k]; }
    R.syncChars(list, dt);
    const holders = (who) => R.getChar(who === this.me ? 'me' : who.startsWith('s:') ? [...R.chars.keys()].find((k) => k.startsWith(who + ':')) : 'p:' + who);
    const fpH = s.cam === 'first' && this.state !== 'reg' ? { who: this.me, av: this.app.profile.av, bob: this.fpBob || 0 } : null;
    R.syncBoxes(st, holders, fpH);
    R.syncCrates(st, holders, fpH);
    R.syncRegs(st, d.r || {});
    R.syncBlobs(st, list.filter((e) => e.visible !== false || e.key === 'me').map((e) => { const c = R.getChar(e.key); return c ? [c.root.position.x, c.root.position.z] : [e.x, e.z]; }));
    R.world.update(dt, st.time, [[p.x, p.z], ...(d.c || []).map((c) => [c[2], c[3]]), ...Object.values(this.players).map((pl) => [pl.x, pl.z])]);
    R.update(dt);
  }
  help(first) {
    const m = document.createElement('div');
    const steps = [
      ['📋', '最初は棚も倉庫も空っぽ。まずはパソコン室（入口の右・倉庫から入る）のボードで商品を発注しよう'],
      ['🛒', '発注はカートに入れて注文。1回の配達は最大10箱まで、送料は1回1,000円'],
      ['🪂', '発注した段ボールは店の前の「荷物置き場」に空から降ってくる。倉庫の在庫棚に運ぶか、そのまま補充'],
      ['🗄️', '棚の1枠には段ボール1箱ぶんが入る。1箱ぜんぶ入れると枠がいっぱいになる'],
      ['📦', '段ボールを持って「開ける」（F／📦ボタン）→ 売り場の棚を狙って「補充」（長押しで連続）。閉じていると補充できない'],
      ['🏷️', '補充するとその商品の値札がつく。品出し係は値札のついた棚にだけ補充しに行く（値札がないと働かない）'],
      ['🗑️', '空の段ボールは倉庫の大型ゴミ箱へ。ゴミ捨て係を雇うと自動で捨ててくれる'], ['🪧', '入口の看板を「OPEN」にすると営業スタート（CLOSEDのままだとお客さんは来ない）'],
      ['🧾', 'レジに入って商品をタップ→スキャン、おつりを渡す'], ['🏷️', '商品には毎日変わる相場がある。値段は棚のふちの値札を狙って「値段を変える」で変えられる（相場の+20%までなら売れる）'],
      ['📋', 'パソコン室：ボードで発注・従業員・スキル・店舗拡張。💬 評判と口コミは画面上の⭐（Tab）でいつでも見られる'], ['🌟', 'スキルボードの「🛒 商品」で新しい商品を解放'], ['📊', '閉店すると1日の収支が出て、次の日へ'],
 ['♻️', '空き箱は建物の右の外（搬入口から出てすぐ）のリサイクルボックスに入れるとお金になる'], ['📦', '空の段ボールには、どの商品でも1種類だけ詰められる。棚の商品を詰めて別の棚へ運べば模様替えが楽（空き箱は発注の「📦 空き箱」でも買える）'], ['🗺️', 'お金がたまったら区画を買い足して、売り場は左と奥へ、倉庫は奥へ広げよう'], ['🔨', '建築ボタンで棚・冷蔵ケース・レジ・看板を設置。置いてある棚やレジは狙って「🔧動かす」（F）で移動できる'], ['🎥', 'Vキー／設定で一人称と三人称を切り替え'],
    ];
    m.append(...steps.map(([i, t]) => h('div', { class: 'help-row' }, h('span', { class: 'hi' }, i), h('span', {}, t))));
    const md = modal('❓ 遊び方', [m, h('button', { class: 'btn big', onclick: () => md.close() }, 'わかった！')], { onClose: () => { this.ui.closed(); if (first) { this.app.profile.tutorialDone = true; this.app.saveLocal(); } } });
    this.ui.opened(md);
  }
  stop() {
    if (this.input.wheelOff) this.input.wheelOff();
    this.ui.closeAll(); this.ui.show(false);
    this.R.setHighlight(null); this.R.setGhost(null); this.R.setFixtureHidden(null);
    this.R.syncChars([], 0.016);
    clearInterval(this._stateRetry);
    if (this.room) { try { this.room.leave(); } catch (e) { /* noop */ } }
    this.input.setRoom(false);
    this.input.pointerFree = false;
  }
}
