// ===== アプリ全体（起動・画面遷移・メインループ） =====
import * as THREE from 'three';
import { Renderer, avatarPreview } from './render.js';
import { Character, randomAvatar, sanitizeAvatar } from './models/character.js';
import { Input } from './input.js';
import { Music, Sfx } from './audio.js';
import { Cloud, FirebaseRoom, LocalRoom } from './net.js';
import { loadSettings, saveSettings, loadProfile, createProfile, saveProfileLocal, syncUp, syncDown, restoreByCode, rankEntry, listOwnStores, switchStore, importStore } from './save.js';
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
      syncDown(this.cloud, this.profile).then((p) => { if (p !== this.profile && this.mode === 'menu') { this.profile = p; toast('☁ クラウドの新しいデータを読み込みました', 'ok'); this.showMenu(); } this.pushRank(); this.importRoomShops(); });
    } else showWelcome(this);
  }

  // ---------- プロフィール ----------
  createProfile(name) { this.profile = createProfile(name); this.saveLocal(); }
  async restore(code) { this.profile = await restoreByCode(this.cloud, code); this.pushRank(); }
  saveLocal() { if (this.profile) saveProfileLocal(this.profile); }
  async syncNow() { if (!this.profile) return { ok: false, reason: 'データなし' }; this.saveLocal(); const r = await syncUp(this.cloud, this.profile); if (r.ok) this.pushRank(); return r; }
  saveGame(cloud) {
    if (!this.profile) return;
    // ひとりで遊ぶとき・ホストのとき：自分のお店に保存（ルームに参加した側は何も保存しない）
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
  // ひとりで経営：いまの自分のお店（ルームでホストして進めた分もそのまま続きから）
  async startSolo() {
    hideScreen();
    this.game = new Game(this, { mode: 'solo' });
    this.mode = 'game';
    this.renderer.resize();
    this.input.layout();
  }
  async startRoom(id, local) {
    const me = this.profile.pid;
    const room = local ? new LocalRoom(id, me) : new FirebaseRoom(this.cloud, id, me);
    if (!local && !(await this.cloud.ready)) throw new Error(this.cloud.error || 'オンラインに接続できません');
    const { role } = await room.join({ n: this.profile.name, av: JSON.stringify(this.profile.av), x: 0, z: 3, ry: 0, an: 'idle' });
    if (role === 'host') {
      // ホストは自分のお店にみんなを呼ぶ。みんなで進めた分はそのお店に保存され、ひとりで遊ぶときも続きから
      const own = listOwnStores(this.profile);
      const pick = await choiceBox('🏪 ホストになってお店を開く', `ルーム「${id}」にはまだ誰もいません。あなたがホストになって、自分のお店にみんなを呼びます。どのお店で経営しますか？（みんなで進めた分はそのお店に保存されて、ひとりで遊ぶときも続きから遊べます。参加した人のお店は変わりません）`, [
        ...own.map((o) => ['s:' + o.sid, `${o.cur ? '⭐' : '🏪'} ${o.n || 'お店'}`, `Lv.${o.lv || 1}・${o.day || 1}日目`]),
        ['wait', '↩ やめる（友だちのルームに入りたい）', 'IDが合っているか確認して、友だちが先に入ってから参加してね'],
      ]);
      if (!pick || pick === 'wait') { room.leave(); throw new Error(pick === 'wait' ? 'もどりました。友だちが先にルームに入ってから、同じIDで参加してね' : 'キャンセルしました'); }
      const sid = pick.slice(2);
      if (sid !== this.profile.cur && switchStore(this.profile, sid)) { this.saveLocal(); this.renderer.storeRev = -1; }
    }
    this.lastRoom = id;
    hideScreen();
    this.game = new Game(this, { mode: role, room, roomId: id, local });
    this.mode = 'game';
    this.renderer.resize();
    if (role === 'host') this.rememberRoom(id, this.profile.store);
    toast(role === 'host' ? `🏪 「${this.profile.store.name}」でルーム「${id}」を開きました！友だちに同じIDを教えよう` : `👥 ルーム「${id}」に参加しました（参加したお店は保存されません。自分のお店はそのまま）`, 'ok', 4000);
  }
  // 前に遊んだルームを覚えておく（ルーム画面に出す）
  rememberRoom(id, st) {
    if (!this.profile || !st) return;
    const prev = (this.profile.rooms || []).find((r) => r.id === id);
    const e = { id, n: String(st.name || '').slice(0, 16), lv: st.level, day: st.day, t: Date.now() };
    const list = (this.profile.rooms || []).filter((r) => r.id !== id);
    this.profile.rooms = [e, ...list].slice(0, 8);
    if (!prev || prev.lv !== e.lv || prev.day !== e.day || prev.n !== e.n) this.saveLocal();
  }
  // 前の版の「みんなの店」（ホストしたルームのお店）を、自分のお店に取りこむ（1回だけ）。
  // 自分のお店をコピーして作ったお店なら、進んでいる方を自分のお店にする。新しく作ったお店は自分のお店の一覧に足す
  async importRoomShops() {
    const p = this.profile;
    if (!p || p.roomsImported) return;
    const hosted = (p.rooms || []).filter((r) => r.h);
    let cloudOk = !this.cloud.configured;
    if (this.cloud.configured) { try { cloudOk = !!(await this.cloud.ready); } catch (e) { cloudOk = false; } }
    const found = [];
    for (const r of hosted) {
      let best = null;
      try { const l = JSON.parse(localStorage.getItem('martmates.shop.' + r.id) || 'null'); if (l?.d) best = l; } catch (e) { /* noop */ }
      if (cloudOk && this.cloud.configured) { try { const c = await this.cloud.loadShop(r.id); if (c?.d && (!best || (c.t || 0) >= (best.t || 0))) best = c; } catch (e) { cloudOk = false; } }
      if (best) { try { found.push([best.t || 0, normalizeStore(JSON.parse(best.d))]); } catch (e) { /* 読めないデータは飛ばす */ } }
    }
    const done = [];
    for (const [, st] of found.sort((a, b) => a[0] - b[0])) { const r = importStore(p, st); if (r && r !== 'full') done.push(`${st.name}（Lv.${st.level}）`); }
    if (!cloudOk && hosted.length) { if (done.length) this.saveLocal(); return; } // 通信できないときは次の起動でもう一度
    p.roomsImported = 1;
    for (const r of p.rooms || []) delete r.h;
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('martmates.shop.')) localStorage.removeItem(k); } } catch (e) { /* noop */ }
    this.saveLocal(); this.syncNow();
    if (done.length) { toast(`🏪 ルームで育てたお店を自分のお店にしました：${done.join('、')}（「ひとりで経営」で続きから遊べます）`, 'ok', 6000); if (this.mode === 'menu') this.showMenu(); }
  }
  endGame(fromClose) {
    if (!this.game) return;
    const g = this.game; this.game = null;
    if (g.sim) this.profile.store = g.sim.store; // ひとり・ホスト：自分のお店に保存（参加した側は保存しない）
    g.stop();
    this.saveGame(true);
    this.pushRank();
    this.renderer.storeRev = -1;
    this.showMenu();
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
