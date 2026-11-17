// ===== Firebase（引き継ぎ・ランキング・ルーム）とローカル代替 =====
import { FIREBASE_CONFIG } from './firebase-config.js';
import { Emitter } from './util.js';

const FB_VER = '10.12.2';
const MAX_PLAYERS = 4;

export class Cloud {
  constructor() { this.ok = false; this.error = null; this.uid = null; this.ready = this._init(); }
  get configured() { return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL && !String(FIREBASE_CONFIG.apiKey).includes('YOUR_')); }
  async _init() {
    if (!this.configured) { this.error = 'Firebaseが未設定です（js/firebase-config.js）'; return false; }
    try {
      const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
      const [appM, dbM, authM] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-database.js'), import(base + 'firebase-auth.js')]);
      this.F = dbM;
      this.app = appM.initializeApp(FIREBASE_CONFIG);
      this.db = dbM.getDatabase(this.app);
      const auth = authM.getAuth(this.app);
      try { const cred = await authM.signInAnonymously(auth); this.uid = cred.user.uid; }
      catch (e) { console.warn('匿名ログイン失敗（ルールが auth != null なら有効化が必要）', e); }
      this.ok = true;
      return true;
    } catch (e) {
      console.warn('Firebase初期化失敗', e);
      this.error = 'オンラインに接続できません';
      return false;
    }
  }
  ref(p) { return this.F.ref(this.db, p); }
  async saveProfile(code, data) {
    if (!(await this.ready)) return false;
    await this.F.set(this.ref('saves/' + code), { d: JSON.stringify(data), t: Date.now() });
    return true;
  }
  async loadProfile(code) {
    if (!(await this.ready)) throw new Error(this.error || 'オフラインです');
    const snap = await this.F.get(this.ref('saves/' + code));
    if (!snap.exists()) return null;
    const v = snap.val();
    return { data: JSON.parse(v.d), t: v.t };
  }
  async putRank(pid, entry) {
    if (!(await this.ready)) return false;
    await this.F.set(this.ref('lb/' + pid), entry);
    return true;
  }
  async topRanks(field, n = 50) {
    if (!(await this.ready)) throw new Error(this.error || 'オフラインです');
    const F = this.F;
    const snap = await F.get(F.query(this.ref('lb'), F.orderByChild(field), F.limitToLast(n)));
    const out = [];
    snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
    return out.sort((a, b) => (b[field] || 0) - (a[field] || 0));
  }
  async myRank(field, value) {
    if (!(await this.ready)) return null;
    const F = this.F;
    try { const snap = await F.get(F.query(this.ref('lb'), F.orderByChild(field), F.startAfter(value))); return snap.size + 1; } catch (e) { return null; }
  }
}

// ---------- Firebase ルーム ----------
export class FirebaseRoom extends Emitter {
  constructor(cloud, id, me) { super(); this.c = cloud; this.id = id; this.me = me; this.unsubs = []; this.joinT = Date.now(); this.role = null; }
  p(sub) { return this.c.ref(`rooms/${this.id}/${sub}`); }
  async join(profileInfo) {
    const F = this.c.F;
    const metaRef = this.p('meta');
    // 端末の時計ずれ対策：サーバー時刻との差を取得
    const off = await new Promise((res) => {
      let u = null; const tm = setTimeout(() => res(0), 3000);
      u = F.onValue(this.c.ref('.info/serverTimeOffset'), (s) => { clearTimeout(tm); res(s.val() || 0); setTimeout(() => u && u(), 0); });
    });
    this.now = () => Date.now() + off;
    const now = this.now();
    const pre = await F.get(this.p('pl'));
    const pl = pre.val() || {};
    const meta0 = (await F.get(metaRef)).val();
    const alive = meta0 && meta0.host && now - (meta0.hb || 0) < 20000 && pl[meta0.host];
    if (alive) {
      if (Object.keys(pl).filter((k) => k !== this.me).length >= MAX_PLAYERS) throw new Error('このルームは満員です（最大4人）');
      this.role = 'client'; this.host = meta0.host;
    } else {
      const res = await F.runTransaction(metaRef, (cur) => {
        if (cur && cur.host && cur.host !== this.me && this.now() - (cur.hb || 0) < 20000) return undefined;
        return { host: this.me, hb: this.now(), t: this.now(), v: 1 };
      });
      if (res.committed && res.snapshot.val()?.host === this.me) {
        this.role = 'host'; this.host = this.me;
        await F.remove(this.p('act')); await F.remove(this.p('ev')); await F.remove(this.p('chat'));
        for (const k of Object.keys(pl)) if (k !== this.me) await F.remove(this.p('pl/' + k));
        F.onDisconnect(this.c.ref(`rooms/${this.id}`)).remove();
        this.hbTimer = setInterval(() => F.update(metaRef, { hb: this.now() }), 5000);
      } else { this.role = 'client'; this.host = res.snapshot.val()?.host; }
    }
    const myRef = this.p('pl/' + this.me);
    await F.set(myRef, { ...profileInfo, t: this.now() });
    F.onDisconnect(myRef).remove();
    // 購読
    this.unsubs.push(F.onValue(this.p('pl'), (s) => this.emit('players', s.val() || {})));
    this.lastHb = null; this.lastHbAt = Date.now();
    this.unsubs.push(F.onValue(metaRef, (s) => {
      const m = s.val();
      if (!m || (this.role === 'client' && m.host !== this.host)) { this.emit('closed', 'ホストが退出しました'); return; }
      if (m.hb !== this.lastHb) { this.lastHb = m.hb; this.lastHbAt = Date.now(); }
    }));
    this.unsubs.push(F.onChildAdded(F.query(this.p('chat'), F.limitToLast(30)), (s) => this.emit('chat', s.val())));
    if (this.role === 'host') {
      this.unsubs.push(F.onChildAdded(this.p('act'), (s) => { const v = s.val(); F.remove(s.ref); if (v) this.emit('action', v); }));
      this.evPrune = setInterval(async () => {
        const snap = await F.get(this.p('ev')); const cut = this.now() - 15000;
        snap.forEach((c) => { if ((c.val()?.t || 0) < cut) F.remove(c.ref); });
      }, 10000);
    } else {
      this.unsubs.push(F.onValue(this.p('st'), (s) => { const v = s.val(); if (v) this.emit('store', v); }));
      this.unsubs.push(F.onValue(this.p('dy'), (s) => { const v = s.val(); if (v) { try { this.emit('dyn', JSON.parse(v)); } catch (e) { /* noop */ } } }));
      // 参加前のイベントは無視（push IDは時系列順）
      let lastKey = null;
      (await F.get(F.query(this.p('ev'), F.limitToLast(1)))).forEach((c) => { lastKey = c.key; });
      this.unsubs.push(F.onChildAdded(F.query(this.p('ev'), F.limitToLast(10)), (s) => { if (lastKey && s.key <= lastKey) return; const v = s.val(); if (v) this.emit('event', v.e); }));
      this.watch = setInterval(() => { if (Date.now() - this.lastHbAt > 25000) this.emit('closed', 'ホストとの接続が切れました'); }, 5000);
    }
    return { role: this.role };
  }
  sendPlayer(st) { this.c.F.update(this.p('pl/' + this.me), st); }
  sendAction(a) { this.c.F.push(this.p('act'), { uid: this.me, a: JSON.stringify(a) }); }
  publishStorePart(part, json) { this.c.F.set(this.p('st/' + part), json); }
  publishDyn(json) { this.c.F.set(this.p('dy'), json); }
  sendEvent(e) { this.c.F.push(this.p('ev'), { e: JSON.stringify(e), t: this.now() }); }
  sendChat(msg) { this.c.F.push(this.p('chat'), { ...msg, t: this.now() }); }
  leave() {
    for (const u of this.unsubs) try { u(); } catch (e) { /* noop */ }
    clearInterval(this.hbTimer); clearInterval(this.evPrune); clearInterval(this.watch);
    const F = this.c.F;
    if (this.role === 'host') F.remove(this.c.ref(`rooms/${this.id}`)); else F.remove(this.p('pl/' + this.me));
  }
}

// ---------- 同じ端末のタブ同士で遊べるローカルルーム（テスト用・Firebase無しでも動く） ----------
export class LocalRoom extends Emitter {
  constructor(id, me) { super(); this.id = id; this.me = me; this.ch = new BroadcastChannel('martmates-room-' + id); this.players = {}; this.role = null; this.chat = []; }
  _send(type, data) { this.ch.postMessage({ type, from: this.me, data }); }
  async join(info) {
    let hostFound = null, count = 0;
    const onMsg = (e) => { const m = e.data; if (m.type === 'here') { count++; if (m.data.host) hostFound = m.from; } };
    this.ch.addEventListener('message', onMsg);
    this._send('who', {});
    await new Promise((r) => setTimeout(r, 450));
    this.ch.removeEventListener('message', onMsg);
    if (hostFound && count >= MAX_PLAYERS) throw new Error('このルームは満員です（最大4人）');
    this.role = hostFound ? 'client' : 'host'; this.host = hostFound || this.me;
    this.players[this.me] = { ...info, t: Date.now() };
    this.ch.onmessage = (e) => this._on(e.data);
    this._send('pl', this.players[this.me]);
    this.ping = setInterval(() => { this._send('pl', this.players[this.me]); this._gc(); }, 1000);
    this.emit('players', { ...this.players });
    return { role: this.role };
  }
  _gc() {
    const now = Date.now(); let ch = false;
    for (const k of Object.keys(this.players)) if (k !== this.me && now - (this.players[k]._seen || 0) > 4000) { delete this.players[k]; ch = true; if (k === this.host && this.role === 'client') this.emit('closed', 'ホストが退出しました'); }
    if (ch) this.emit('players', { ...this.players });
  }
  _on(m) {
    switch (m.type) {
      case 'who': this._send('here', { host: this.role === 'host' }); break;
      case 'pl': this.players[m.from] = { ...(this.players[m.from] || {}), ...m.data, _seen: Date.now() }; this.emit('players', { ...this.players }); break;
      case 'bye': delete this.players[m.from]; this.emit('players', { ...this.players }); if (m.from === this.host && this.role === 'client') this.emit('closed', 'ホストが退出しました'); break;
      case 'act': if (this.role === 'host') this.emit('action', { uid: m.from, a: m.data }); break;
      case 'st': if (this.role === 'client') { this._st = { ...(this._st || {}), [m.data.part]: m.data.json }; this.emit('store', this._st); } break;
      case 'dy': if (this.role === 'client') this.emit('dyn', JSON.parse(m.data)); break;
      case 'ev': if (this.role === 'client') this.emit('event', m.data); break;
      case 'chat': this.emit('chat', m.data); break;
      case 'need': if (this.role === 'host' && this._lastParts) for (const [part, json] of Object.entries(this._lastParts)) this._send('st', { part, json }); break;
    }
  }
  sendPlayer(st) { Object.assign(this.players[this.me], st); this._send('pl', st); }
  sendAction(a) { this._send('act', JSON.stringify(a)); }
  publishStorePart(part, json) { (this._lastParts ||= {})[part] = json; this._send('st', { part, json }); }
  publishDyn(json) { this._send('dy', json); }
  sendEvent(e) { this._send('ev', JSON.stringify(e)); }
  sendChat(msg) { const m = { ...msg, t: Date.now() }; this._send('chat', m); this.emit('chat', m); }
  requestState() { this._send('need', {}); }
  leave() { this._send('bye', {}); clearInterval(this.ping); this.ch.close(); }
}
