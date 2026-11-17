// ===== アプリ全体（起動・画面遷移・メインループ） =====
import * as THREE from 'three';
import { Renderer, avatarPreview } from './render.js';
import { Character, randomAvatar, sanitizeAvatar } from './models/character.js';
import { Input } from './input.js';
import { Music, Sfx } from './audio.js';
import { Cloud, FirebaseRoom, LocalRoom } from './net.js';
import { loadSettings, saveSettings, loadProfile, createProfile, saveProfileLocal, syncUp, syncDown, restoreByCode, rankEntry, evictOldShop } from './save.js';
const LOCK_MS = 90000; // ひとりで遊んでいる人がいる目印の有効時間
import { showWelcome, showMenu, showCode, showEditor, openSettings, hideScreen, toast, choiceBox, h, $ } from './ui.js';
import { GameUI } from './gameui.js';
import { Game } from './game.js';
import { normalizeStore, newStore } from './sim.js';
import { OPEN_TIME } from './data.js';

class App {
  async boot() {
    const bootMsg = (t, p) => { const m = $('#boot .boot-msg'); if (m) m.textContent = t; const b = $('#boot .bar i'); if (b && p != null) b.style.width = p + '%'; };
    bootMsg('設定を読み込み中…', 10);
    this.settings = loadSettings(); saveSettings(this.settings);
    this.cloud = new Cloud();
    bootMsg('3Dエンジンを準備中…', 30);
    this.renderer = new Renderer($('#c3d'), this.settings);
    this.input = new Input($('#c3d'), $('#touch'), this.settings);
    this.gameUI = new GameUI(); this.gameUI.show(false);
    this.music = new Music(this.settings); this.sfx = new Sfx(this.settings);
    this.music.onLoading = (v) => { this._musicLoading = v; };
    this.music.onChange = () => saveSettings(this.settings);
    this.music.play(this.settings.bgm); // 先に作曲しておく（再生はタップ後）
    // スマホは最初のタップで全画面＋横向き固定を試す（対応ブラウザのみ）
    const lockLandscape = async () => {
      if (this._locked) return; this._locked = true;
      try {
        const coarse = matchMedia('(pointer: coarse)').matches;
        if (coarse && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
      } catch (e) { /* iPhoneなどは非対応：縦向きのときは案内を表示 */ }
    };
    const unlock = () => { this.sfx.unlock(); if (!this.music.unlocked) this.music.unlock(); lockLandscape(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    bootMsg('お店を準備中…', 60);
    this.profile = loadProfile();
    this.avCache = new Map();
    this.mode = 'menu';
    this.last = performance.now();
    this._setupPreviewDrag();
    window.addEventListener('resize', () => this.renderer.resize());
    // 画面を回したとき：少し待ってからもう一度合わせる（iPhoneは回した直後の大きさが古いことがある）
    const refit = () => { for (const ms of [60, 300, 800]) setTimeout(() => { this.renderer.resize(); this.input.layout(); }, ms); };
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
    screen.orientation?.addEventListener?.('change', refit);
    window.addEventListener('pagehide', () => this.saveGame(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveGame(false); });
    bootMsg('完成！', 100);
    requestAnimationFrame((t) => this.loop(t));
    setTimeout(() => $('#boot')?.classList.add('gone'), 250);
    if (this.profile) {
      this.showMenu();
      syncDown(this.cloud, this.profile).then((p) => { if (p !== this.profile && this.mode === 'menu') { this.profile = p; toast('☁ クラウドの新しいデータを読み込みました', 'ok'); this.showMenu(); } this.pushRank(); });
    } else showWelcome(this);
  }

  // ---------- プロフィール ----------
  createProfile(name) { this.profile = createProfile(name); this.saveLocal(); }
  async restore(code) { this.profile = await restoreByCode(this.cloud, code); this.pushRank(); }
  saveLocal() { if (this.profile) saveProfileLocal(this.profile); }
  async syncNow() { if (!this.profile) return { ok: false, reason: 'データなし' }; this.saveLocal(); const r = await syncUp(this.cloud, this.profile); if (r.ok) this.pushRank(); return r; }
  saveGame(cloud) {
    if (!this.profile) return;
    if (this.game?.shared) { this.saveShop(cloud); this.saveLocal(); return; } // ルームのお店はみんなの店として保存（自分のお店は変えない）
    if (this.game?.sim) this.profile.store = this.game.sim.store;
    this.saveLocal();
    const now = Date.now();
    if (cloud || now - (this._lastCloud || 0) > 60000) { this._lastCloud = now; syncUp(this.cloud, this.profile); }
  }
  rankSelf() { const e = rankEntry(this.profile); return e; }
  rankValue(f) { return this.rankSelf()[f]; }
  async pushRank() {
    if (!this.profile || !this.cloud.configured) return;
    try { await this.cloud.putRank(this.profile.pid, rankEntry(this.profile)); } catch (e) { console.warn('rank', e); }
  }

  // ---------- 画面 ----------
  showMenu() { this.mode = 'menu'; this.gameUI.show(false); this.input.overlay.classList.add('hidden'); showMenu(this); }
  openEditor(first) {
    this.mode = 'editor';
    this.preview ||= avatarPreview(this.renderer);
    this.previewYaw = 0.5;
    showEditor(this, first, () => { if (first) { this.startSolo(); } else this.showMenu(); });
  }
  setPreviewAvatar(av) {
    const P = this.preview;
    if (P.ch) P.ch.dispose();
    P.ch = new Character(sanitizeAvatar(av), { lite: this.settings.lite });
    P.ch.anim = 'idle';
    P.scene.add(P.ch.root);
  }
  _setupPreviewDrag() {
    const c = $('#c3d'); let last = null;
    const down = (x) => { if (this.mode === 'editor') last = x; };
    const move = (x) => { if (last != null && this.mode === 'editor') { this.previewYaw += (x - last) * 0.012; last = x; } };
    c.addEventListener('pointerdown', (e) => down(e.clientX)); window.addEventListener('pointermove', (e) => move(e.clientX)); window.addEventListener('pointerup', () => { last = null; });
  }
  applySettings() {
    saveSettings(this.settings);
    this.renderer.applySettings(this.settings);
    this.input.layout();
    this.music.setVolume(this.settings.bgmVol);
  }
  openSettingsInGame() {
    if (this.game) this.game.setUIBlock(true);
    openSettings(this, { inGame: true, onClose: () => { if (this.game) this.game.setUIBlock(false); } });
  }
  reopenSettings(inGame) { if (inGame && this.game) this.openSettingsInGame(); else openSettings(this); }
  editLayout(after) {
    const I = this.input;
    const bar = h('div', { class: 'edit-bar' }, h('b', {}, '✋ ボタンをドラッグして配置'),
      h('button', { class: 'btn small ghost', onclick: () => I.resetLayout() }, 'リセット'),
      h('button', { class: 'btn small', onclick: () => { I.endEdit(); bar.remove(); saveSettings(this.settings); if (!this.game) I.overlay.classList.add('hidden'); after && after(); } }, '完了'));
    document.body.append(bar);
    I.startEdit();
  }
  reload() { this.saveGame(true); setTimeout(() => location.reload(), 300); }
  avatarFromSeed(seed, kind) {
    const k = kind + seed;
    if (!this.avCache.has(k)) { if (this.avCache.size > 400) this.avCache.clear(); this.avCache.set(k, randomAvatar(seed >>> 0, { hatChance: kind === 'staff' ? 0.2 : 0.28, limited: true })); }
    return this.avCache.get(k);
  }

  // ---------- ゲーム開始・終了 ----------
  // ひとりで経営。roomId を渡すと「みんなの店」をひとりで遊ぶ（進めた分はみんなの店に保存）
  async startSolo(opts = {}) {
    let store = null;
    if (opts.roomId) {
      const id = opts.roomId;
      if (this.cloud.configured && (await this.cloud.ready)) {
        // いまルームで遊んでいる人がいたら、ひとりでは開けない（データがぶつからないように）
        try {
          const meta = (await this.cloud.F.get(this.cloud.ref('rooms/' + id + '/meta'))).val();
          if (meta?.host && Date.now() - (meta.hb || 0) < 20000) throw new Error('いまルーム「' + id + '」でみんなが遊んでいます。「みんなで経営」から参加してね');
        } catch (e) { if (e.message.startsWith('いまルーム')) throw e; }
      }
      const got = await this.loadShopRec(id, false);
      if (!got) throw new Error('このルームのお店のデータが見つかりません');
      const { rec } = got;
      if (rec.solo && Date.now() - rec.solo < LOCK_MS && rec.pid && rec.pid !== this.profile.pid) throw new Error(`${rec.by || 'だれか'}さんがこのお店をひとりで遊んでいます。終わるまで待ってね`);
      store = got.store; normalizeStore(store);
    }
    hideScreen();
    this.game = new Game(this, { mode: 'solo', store, roomId: opts.roomId || null });
    this.mode = 'game';
    this.renderer.resize();
    this.input.layout();
    if (store) { this.rememberRoom(opts.roomId, store, true); this.saveShop(true); toast(`🏪 みんなの店「${store.name}」をひとりで遊びます（進めた分はみんなの店に保存）`, 'ok', 3500); }
  }
  async startRoom(id, local) {
    const me = this.profile.pid;
    const room = local ? new LocalRoom(id, me) : new FirebaseRoom(this.cloud, id, me);
    if (!local && !(await this.cloud.ready)) throw new Error(this.cloud.error || 'オンラインに接続できません');
    const { role } = await room.join({ n: this.profile.name, av: JSON.stringify(this.profile.av), x: 0, z: 3, ry: 0, an: 'idle' });
    let store = null, cont = null;
    if (role === 'host') {
      // みんなの店：このルームIDで前に遊んだお店があれば、その続きから（誰がホストでも同じお店）
      const got = await this.loadShopRec(id, local);
      if (got?.rec?.solo && Date.now() - got.rec.solo < LOCK_MS && got.rec.pid && got.rec.pid !== me) { room.leave(); throw new Error(`${got.rec.by || 'だれか'}さんがこのお店をひとりで遊んでいます。終わるまで待ってね`); }
      const saved = got?.store;
      if (saved) { store = saved; cont = saved; }
      else {
        const own = this.profile.store;
        const pick = await choiceBox('🏪 みんなの店を作る', `ルーム「${id}」にはまだ誰もいなくて、お店もありません。どのお店でみんなと経営しますか？（ここで決めたお店がこのルームIDに保存され、次からは誰がホストでも続きから遊べます。自分のお店はコピーして使うので、ルームで何をしても自分のお店は変わりません）`, [
          ['mine', `🏪 自分のお店をコピーして始める`, `${own.name}・Lv.${own.level}・${own.day}日目のコピー`],
          ['new', '🆕 新しいお店で始める', 'Lv.1・1日目から'],
          ['wait', '↩ やめる（友だちのルームに入りたい）', 'IDが合っているか確認して、友だちが先に入ってから参加してね'],
        ]);
        if (!pick || pick === 'wait') { room.leave(); throw new Error(pick === 'wait' ? 'もどりました。友だちが先にルームに入ってから、同じIDで参加してね' : 'キャンセルしました'); }
        store = pick === 'mine' ? JSON.parse(JSON.stringify(own)) : newStore(`${this.profile.name.slice(0, 6)}たちのお店`);
      }
      normalizeStore(store);
    }
    this.lastRoom = id;
    hideScreen();
    this.game = new Game(this, { mode: role, room, roomId: id, store, local });
    this.mode = 'game';
    this.renderer.resize();
    if (role === 'host' && store) { this.rememberRoom(id, store, true); this.saveShop(true); }
    toast(role === 'host' ? (cont ? `🏪 みんなの店「${store.name}」の続きから（Lv.${store.level}・${store.day}日目）！友だちに同じIDを教えよう` : `🏪 ルーム「${id}」を作りました！友だちに同じIDを教えよう`) : `👥 ルーム「${id}」に参加しました`, 'ok', 4000);
  }
  // ---------- みんなの店（ルームIDごとのお店） ----------
  shopKey(id) { return 'martmates.shop.' + id; }
  async loadShop(id, local) { return (await this.loadShopRec(id, local))?.store || null; }
  async loadShopRec(id, local) {
    let best = null;
    try { const l = JSON.parse(localStorage.getItem(this.shopKey(id)) || 'null'); if (l?.d) best = l; } catch (e) { /* noop */ }
    if (!local && this.cloud.configured) {
      try { const c = await this.cloud.loadShop(id); if (c?.d && (!best || (c.t || 0) >= (best.t || 0))) best = c; } catch (e) { console.warn('みんなの店を読み込めません', e); }
    }
    if (!best) return null;
    try { return { rec: best, store: JSON.parse(best.d) }; } catch (e) { return null; }
  }
  saveShop(cloud, g = this.game, ending = false) {
    if (!g?.shared || !g.sim) return;
    const st = g.sim.store, id = g.roomId;
    // solo：ひとりで遊んでいる間はその時刻を入れておく（ほかの人が同時に開かないように）
    const data = { d: JSON.stringify(st), t: Date.now(), n: String(st.name || '').slice(0, 16), lv: st.level, day: st.day, by: this.profile.name, pid: this.profile.pid, solo: g.mode === 'solo' && !ending ? Date.now() : 0 };
    // 端末の中にも控えを置く（いっぱいなら古いルームの控えから消す）
    const json = JSON.stringify(data);
    for (let tries = 0; tries < 10; tries++) {
      try { localStorage.setItem(this.shopKey(id), json); break; } catch (e) { if (!evictOldShop(this.shopKey(id))) break; }
    }
    this.rememberRoom(id, st);
    const now = Date.now();
    if (!g.local && this.cloud.configured && (cloud || now - (this._lastShop || 0) > 30000)) {
      this._lastShop = now;
      this.cloud.saveShop(id, data).catch((e) => console.warn('みんなの店を保存できません', e));
    }
  }
  // 前に遊んだルームを覚えておく（ルーム画面に出す）
  rememberRoom(id, st, host) {
    if (!this.profile || !st) return;
    const prev = (this.profile.rooms || []).find((r) => r.id === id);
    const e = { id, n: String(st.name || '').slice(0, 16), lv: st.level, day: st.day, t: Date.now(), h: !!(host || prev?.h) }; // h：ホストしたことがある（ひとりでも遊べる）
    const list = (this.profile.rooms || []).filter((r) => r.id !== id);
    this.profile.rooms = [e, ...list].slice(0, 8);
    if (!prev || prev.lv !== e.lv || prev.day !== e.day || prev.n !== e.n || prev.h !== e.h) this.saveLocal();
  }
  // 参加したルームのお店の控え（ひとりで続きを遊ぶとき、クラウドが読めなくても使えるように）
  cacheShop(id, st) {
    if (!id || !st) return;
    const data = { d: JSON.stringify(st), t: Date.now(), n: String(st.name || '').slice(0, 16), lv: st.level, day: st.day, by: this.profile.name, pid: this.profile.pid, solo: 0 };
    const json = JSON.stringify(data);
    for (let tries = 0; tries < 10; tries++) {
      try { localStorage.setItem(this.shopKey(id), json); break; } catch (e) { if (!evictOldShop(this.shopKey(id))) break; }
    }
  }
  endGame(fromClose) {
    if (!this.game) return;
    const g = this.game; this.game = null;
    if (g.shared) this.saveShop(true, g, true); // みんなの店を保存
    else if (g.sim) this.profile.store = g.sim.store;
    if (g.mode === 'client' && g.roomId && g.store && !g.local) { this.cacheShop(g.roomId, g.store); this.rememberRoom(g.roomId, g.store); }
    const roomSt = (g.mode === 'host' || g.mode === 'client') && g.roomId ? (g.sim?.store || g.store) : null;
    g.stop();
    this.saveGame(true);
    this.pushRank();
    this.renderer.storeRev = -1;
    this.showMenu();
    if (roomSt) toast(`👥 みんなの店「${roomSt.name}」（Lv.${roomSt.level}）は、メニューの「ひとりで続ける」や「ひとりで経営」→「👥 みんなの店」から、ひとりでも続きを遊べます`, 'info', 5000);
    void fromClose;
  }

  // ---------- メインループ ----------
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const R = this.renderer;
    try {
      if (this.mode === 'game' && this.game) { this.game.update(dt); R.render(); return; }
      if (this.mode === 'editor' && this.preview) { this._renderPreview(dt); return; }
      this._renderMenu(dt);
    } catch (e) { console.error(e); if (!this._errShown) { this._errShown = true; toast('エラー：' + e.message, 'err', 6000); } }
  }
  _renderMenu(dt) {
    const R = this.renderer;
    if (!this.profile) { this._orbit(dt, null); R.render(); return; }
    const st = this.profile.store;
    st.time = st.time || OPEN_TIME;
    R.setTime(10.5 * 60);
    R.syncStore(st);
    R.syncBoxes(st, () => R.getChar('menu-me'));
    R.syncCrates(st, () => null, null);
    R.syncRegs(st, {});
    R.syncChars([{ key: 'menu-me', kind: 'player', av: this.profile.av, x: 0.3, z: 7.4, ry: 0.15, local: true, an: 'wave' }], dt);
    R.syncBlobs(st, [[0.3, 7.4]]);
    R.world.update(dt, 10.5 * 60, [[0.3, 7.4]]);
    R.update(dt);
    this._orbit(dt, st);
    R.render();
  }
  _orbit(dt, st) {
    const cam = this.renderer.camera;
    this._ang = (this._ang ?? 0.35) + dt * 0.05;
    const a = Math.sin(this._ang) * 0.55;
    const portrait = window.innerHeight > window.innerWidth;
    const r = portrait ? 19 : 15;
    cam.position.set(Math.sin(a) * r, 3.2 + Math.sin(this._ang * 0.7) * 0.6, 7 + Math.cos(a) * r);
    cam.lookAt(portrait ? 0 : -2.5, 2.0, 2);
    cam.clearViewOffset();
  }
  _renderPreview(dt) {
    const R = this.renderer, P = this.preview;
    if (P.ch) { P.ch.root.rotation.y = this.previewYaw; P.ch.update(dt); }
    const w = window.innerWidth, hh = window.innerHeight;
    P.cam.aspect = w / hh;
    const portrait = hh > w;
    P.cam.position.set(0, 1.05, portrait ? 6.2 : 5.0);
    P.cam.lookAt(0, 0.95, 0);
    if (portrait) P.cam.setViewOffset(w, hh, 0, hh * 0.24, w, hh); else P.cam.setViewOffset(w, hh, w * 0.2, 0, w, hh);
    P.cam.updateProjectionMatrix();
    R.r.setClearColor(0xfff1e6, 1);
    R.r.render(P.scene, P.cam);
  }
}

window.addEventListener('error', (e) => { const m = document.querySelector('#boot .boot-msg'); if (m && !document.querySelector('#boot.gone')) m.textContent = 'エラー：' + e.message; });
const app = new App();
window.__app = app;
app.boot().catch((e) => { console.error(e); const m = document.querySelector('#boot .boot-msg'); if (m) m.textContent = '起動に失敗しました：' + e.message; });
export default app;
