// ===== 入力（キーボード/マウス/タッチ・ボタン配置の編集） =====
import { clamp, Emitter } from './util.js';

export const BUTTONS = {
  act: { label: 'A', big: true, pos: [87, 70] },
  alt: { label: 'B', pos: [74, 83] },
  box: { label: '📦', pos: [62, 84] },
  jump: { label: '⤒', pos: [92, 50], small: true },
  run: { label: '🏃', pos: [76, 60], small: true, toggle: true },
  build: { label: '🔨', pos: [95, 30], small: true },
  cam: { label: '🎥', pos: [95, 41], small: true },
  chat: { label: '💬', pos: [95, 19], small: true, roomOnly: true },
  menu: { label: '≡', pos: [95, 8], small: true },
};
export const JOY_DEFAULT = [16, 72];

const KEYMAP = { KeyE: 'act', Enter2: 'act', KeyQ: 'alt', KeyF: 'box', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyB: 'build', KeyV: 'cam', KeyT: 'chat', Escape: 'menu', KeyR: 'rotate', Tab: 'tab' };

export class Input extends Emitter {
  constructor(canvas, overlay, settings) {
    super();
    this.canvas = canvas; this.overlay = overlay; this.settings = settings;
    this.keys = new Set();
    this.down = new Set(); this.edges = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.runToggle = false;
    this.enabled = true; this.uiBlock = false;
    this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.lookTouch = null;
    this.taps = [];
    this.buttons = {};
    this._buildTouchUI();
    this._bind();
  }
  get touchVisible() { const t = this.settings.touchUI || 'auto'; return t === 'on' || (t === 'auto' && this.touchMode); }

  _buildTouchUI() {
    const ov = this.overlay;
    ov.innerHTML = '';
    this.joyEl = document.createElement('div'); this.joyEl.className = 'joy';
    this.knob = document.createElement('div'); this.knob.className = 'joy-knob'; this.joyEl.appendChild(this.knob);
    ov.appendChild(this.joyEl);
    for (const [id, b] of Object.entries(BUTTONS)) {
      const el = document.createElement('button');
      el.className = 'tbtn' + (b.big ? ' big' : '') + (b.small ? ' small' : '');
      el.dataset.id = id;
      el.innerHTML = `<span class="ic">${b.label}</span><span class="lb"></span>`;
      ov.appendChild(el);
      this.buttons[id] = el;
      const press = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.editing) return;
        if (b.toggle) { this.runToggle = !this.runToggle; el.classList.toggle('on', this.runToggle); return; }
        this.down.add(id); this.edges.add(id); el.classList.add('pressed');
      };
      const release = (e) => { e.preventDefault(); this.down.delete(id); el.classList.remove('pressed'); };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
      el.addEventListener('mousedown', (e) => { if (!this.touchMode) press(e); });
      el.addEventListener('mouseup', (e) => { if (!this.touchMode) release(e); });
      el.addEventListener('mouseleave', () => { this.down.delete(id); el.classList.remove('pressed'); });
    }
    this.layout();
  }
  layout() {
    const s = this.settings, sc = s.btnScale || 1, L = s.layout || {};
    const W = window.innerWidth, H = window.innerHeight;
    const vis = this.touchVisible;
    this.overlay.classList.toggle('hidden', !vis);
    for (const [id, b] of Object.entries(BUTTONS)) {
      const el = this.buttons[id];
      const [px, py] = L[id] || b.pos;
      const size = (b.big ? 84 : b.small ? 46 : 64) * sc;
      el.style.width = el.style.height = size + 'px';
      el.style.left = (px / 100 * W - size / 2) + 'px';
      el.style.top = (py / 100 * H - size / 2) + 'px';
      el.style.fontSize = (size * 0.38) + 'px';
      el.style.display = b.roomOnly && !this.inRoom ? 'none' : '';
    }
    const [jx, jy] = L.joy || JOY_DEFAULT;
    const js = 130 * sc;
    this.joyR = js / 2;
    this.joyEl.style.width = this.joyEl.style.height = js + 'px';
    this.joyHome = [jx / 100 * W, jy / 100 * H];
    this.joyEl.style.left = (this.joyHome[0] - js / 2) + 'px'; this.joyEl.style.top = (this.joyHome[1] - js / 2) + 'px';
    this.knob.style.width = this.knob.style.height = js * 0.42 + 'px';
  }
  setRoom(v) { this.inRoom = v; this.layout(); }
  setLabel(id, text, enabled = true, icon = null) {
    const el = this.buttons[id]; if (!el) return;
    const lb = el.querySelector('.lb');
    if (lb.textContent !== (text || '')) lb.textContent = text || '';
    if (icon != null) { const ic = el.querySelector('.ic'); if (ic && ic.textContent !== icon) ic.textContent = icon; }
    el.classList.toggle('dim', !enabled || !text);
  }
  setVisible(id, v) { const el = this.buttons[id]; if (el) el.style.visibility = v ? '' : 'hidden'; }

  // ---------- ボタン配置の編集 ----------
  startEdit(onDone) {
    this.editing = true;
    this.overlay.classList.remove('hidden');
    this.overlay.classList.add('editing');
    const items = [...Object.entries(this.buttons), ['joy', this.joyEl]];
    const L = (this.settings.layout ||= {});
    const handlers = [];
    for (const [id, el] of items) {
      el.style.display = ''; el.style.visibility = '';
      const start = (e) => {
        e.preventDefault(); e.stopPropagation();
        const t = e.touches ? e.touches[0] : e;
        const r = el.getBoundingClientRect();
        const ox = t.clientX - (r.left + r.width / 2), oy = t.clientY - (r.top + r.height / 2);
        const mv = (ev) => {
          const p = ev.touches ? ev.touches[0] : ev;
          const x = clamp((p.clientX - ox) / window.innerWidth * 100, 3, 97), y = clamp((p.clientY - oy) / window.innerHeight * 100, 4, 96);
          L[id] = [+x.toFixed(1), +y.toFixed(1)]; this.layout(); this.overlay.classList.remove('hidden');
          for (const [, e2] of items) e2.style.display = '';
        };
        const up = () => { window.removeEventListener('touchmove', mv); window.removeEventListener('mousemove', mv); window.removeEventListener('touchend', up); window.removeEventListener('mouseup', up); };
        window.addEventListener('touchmove', mv, { passive: false }); window.addEventListener('mousemove', mv);
        window.addEventListener('touchend', up); window.addEventListener('mouseup', up);
      };
      el.addEventListener('touchstart', start, { passive: false, capture: true }); el.addEventListener('mousedown', start, { capture: true });
      handlers.push([el, start]);
    }
    this._endEdit = () => {
      for (const [el, h] of handlers) { el.removeEventListener('touchstart', h, { capture: true }); el.removeEventListener('mousedown', h, { capture: true }); }
      this.editing = false; this.overlay.classList.remove('editing'); this.layout(); onDone && onDone();
    };
  }
  endEdit() { this._endEdit && this._endEdit(); }
  resetLayout() { this.settings.layout = {}; this.layout(); if (this.editing) { this.overlay.classList.remove('hidden'); for (const el of Object.values(this.buttons)) el.style.display = ''; } }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      const id = KEYMAP[e.code];
      if (id) { if (!this.down.has(id)) this.edges.add(id); this.down.add(id); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
      if (e.code === 'Enter') this.edges.add('chat');
      if (/^Digit[1-9]$/.test(e.code)) this.edges.add('num' + e.code.slice(5));
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); const id = KEYMAP[e.code]; if (id) this.down.delete(id); });
    window.addEventListener('blur', () => { this.keys.clear(); this.down.clear(); });
    // マウス
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      if (this.pointerFree) { this.taps.push({ x: e.clientX, y: e.clientY }); return; }
      if (document.pointerLockElement !== c) { try { const r = c.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* 埋め込み表示などでは使えない */ } return; }
      if (e.button === 0) { this.down.add('act'); this.edges.add('act'); }
      if (e.button === 2) { this.down.add('alt'); this.edges.add('alt'); }
    });
    c.addEventListener('mouseup', (e) => { if (e.button === 0) this.down.delete('act'); if (e.button === 2) this.down.delete('alt'); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const locked = document.pointerLockElement === c;
      // ポインタロックが使えない環境ではドラッグで視点移動
      const drag = !locked && e.buttons && e.target === c && !this.pointerFree;
      if ((locked || drag) && !this.uiBlock) { this.look.x += e.movementX * 0.0022 * (this.settings.sens || 1); this.look.y += e.movementY * 0.0022 * (this.settings.sens || 1); }
    });
    c.addEventListener('wheel', (e) => this.emit('wheel', Math.sign(e.deltaY)), { passive: true });
    // タッチ（視点・スティック）
    const opts = { passive: false };
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchMode = true;
      for (const t of e.changedTouches) {
        const dj = Math.hypot(t.clientX - this.joyHome[0], t.clientY - this.joyHome[1]);
        if (this.joy.id === null && dj < this.joyR * 1.6 && !this.pointerFree) {
          this.joy = { id: t.identifier, cx: this.joyHome[0], cy: this.joyHome[1], x: 0, y: 0 };
          this._updateJoy(t);
        } else if (this.lookTouch === null) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
        }
      }
    }, opts);
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) this._updateJoy(t);
        else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          const s = 0.0055 * (this.settings.sens || 1);
          this.look.x += (t.clientX - this.lookTouch.x) * s; this.look.y += (t.clientY - this.lookTouch.y) * s;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy = { id: null, x: 0, y: 0 }; this.knob.style.transform = ''; this.joyEl.classList.remove('active'); }
        else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          const lt = this.lookTouch;
          if (Math.hypot(t.clientX - lt.sx, t.clientY - lt.sy) < 14 && performance.now() - lt.t < 350) this.taps.push({ x: t.clientX, y: t.clientY });
          this.lookTouch = null;
        }
      }
    };
    c.addEventListener('touchend', end, opts); c.addEventListener('touchcancel', end, opts);
    window.addEventListener('resize', () => this.layout());
  }
  _updateJoy(t) {
    let dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
    const d = Math.hypot(dx, dy), m = this.joyR;
    if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    this.joy.x = dx / m; this.joy.y = dy / m;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joyEl.classList.add('active');
  }
  // 1フレームごとに呼ぶ
  poll() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.joy.id !== null) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (!this.enabled || this.uiBlock) { x = 0; y = 0; }
    this.move.x = x; this.move.y = y;
    const look = { x: this.look.x, y: this.look.y * (this.settings.invertY ? -1 : 1) };
    this.look.x = 0; this.look.y = 0;
    const edges = this.edges; this.edges = new Set();
    const taps = this.taps; this.taps = [];
    if (!this.enabled || this.uiBlock) return { move: this.move, look: { x: 0, y: 0 }, edges: new Set(), taps: [], run: false, held: new Set() };
    return { move: this.move, look, edges, taps, run: this.runToggle || this.down.has('run'), held: this.down };
  }
  releasePointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }
}
