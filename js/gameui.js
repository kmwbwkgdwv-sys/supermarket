// ===== ゲーム中のUI（HUD・発注PC・スキルボード・レジ・建築・チャット） =====
import { h, $, modal, toast, confirmBox, promptBox } from './ui.js';
import { PRODUCTS, PRODUCTS_LIST, CATEGORIES, FIXTURES, FIXTURE_CATS, SKILLS, SKILLS_LIST, STAFF_ROLES, STAFF_NAMES,
  productUnlocked, fixtureUnlocked, staffLimit, STAFF_SLOTS, STAFF_MAX, slotWage, xpNeed, closeTime, CHAT_PRESETS, SALES, STOCK_COLS, STOCK_ROWS, stockAt, expandTargets, marketPrice, marketCost, SKILL_BRANCHES, ROOT_POS, ORDER_MAX_BOXES, SHIPPING_FEE, MAX_LEVEL, halfQty } from './data.js';
import { getPrice, orderCost, orderTotal, priceLimit, customerFactors, repStars } from './sim.js';
import { yen, fmtTime, mulberry32, escapeText } from './util.js';

const PHASE = { prep: '準備中', open: '営業中', closing: '閉店準備', summary: '本日の結果' };

export class GameUI {
  constructor() {
    this.hud = $('#hud');
    this.hud.innerHTML = '';
    const H = this.hud;
    this.day = h('div', { class: 'hud-chip' }); this.openBtn = h('button', { class: 'hud-open' });
    this.money = h('div', { class: 'hud-chip money' });
    this.lvText = h('span'); this.lvBar = h('i'); this.sp = h('span', { class: 'sp' });
    this.rep = h('div', { class: 'hud-chip' });
    this.lv = h('button', { class: 'hud-chip lv' }, this.lvText, h('div', { class: 'bar' }, this.lvBar), this.sp);
    H.append(h('div', { class: 'hud-top' }, this.day, this.openBtn, this.money, this.lv, this.rep));
    this.roomInfo = h('div', { class: 'room-info hidden' }); H.append(this.roomInfo);
    this.cross = h('div', { class: 'crosshair' }); H.append(this.cross);
    this.hint = h('div', { class: 'hint hidden' }); H.append(this.hint);
    this.info = h('div', { class: 'target-info hidden' }); H.append(this.info);
    this.chatLog = h('div', { class: 'chatlog' }); H.append(this.chatLog);
    this.keys = h('div', { class: 'pc-keys' }); H.append(this.keys);
    this.reg = h('div', { class: 'reg-ui hidden' }); H.append(this.reg);
    this.build = h('div', { class: 'build-ui hidden' }); H.append(this.build);
    this.deliv = h('div', { class: 'hud-chip deliv hidden' }); H.append(this.deliv);
    this._hudT = 0; this.open = null;
  }
  show(v) { this.hud.classList.toggle('hidden', !v); }
  bind(game) {
    this.g = game;
    this.openBtn.onclick = () => { const ph = game.store.phase; toast(ph === 'prep' ? '🪧 入口の看板をOPENにすると営業スタート！' : ph === 'open' ? '🪧 店じまいするときは入口の看板をCLOSEDに' : '⏳ 残りのお客さんの会計をしよう'); };
    // スキル・評判などはマネージャー室のボードから（ここでは場所を教えるだけ）
    this.lv.onclick = () => toast('🌟 スキルはマネージャー室の「フランチャイズボード」で解放できます', 'info');
    this.rep.onclick = () => toast('💬 評判と口コミはマネージャー室の「マネージャーボード」で見られます', 'info');
  }
  updateHUD(dt, store, dyn, force) {
    this._hudT -= dt;
    if (this._hudT > 0 && !force) return;
    this._hudT = 0.2;
    if (!store) return;
    const t = dyn?.time ?? store.time;
    this.day.innerHTML = `📅 ${store.day}日目 <b>${fmtTime(t)}</b> <small>${PHASE[store.phase] || ''}</small>`;
    const ph = store.phase;
    this.openBtn.textContent = ph === 'prep' ? '🔴 CLOSED（準備中）' : ph === 'open' ? '🟢 OPEN 営業中' : ph === 'closing' ? '⏳ 店じまい中' : '📊 集計中';
    this.openBtn.classList.toggle('isopen', ph === 'open');
    this.openBtn.classList.toggle('pulse', ph === 'prep');
    this.money.textContent = '💴 ' + yen(store.money);
    const maxed = store.level >= MAX_LEVEL;
    this.lvText.textContent = 'Lv.' + store.level + (maxed ? ' MAX' : '');
    this.lvBar.style.width = (maxed ? 100 : Math.min(100, store.xp / xpNeed(store.level) * 100)) + '%';
    this.sp.textContent = store.sp > 0 ? `SP ${store.sp}` : '';
    this.sp.classList.toggle('glow', store.sp > 0);
    this.rep.textContent = '⭐ ' + repStars(store.rep).toFixed(1);
    const n = dyn?.dl || 0;
    this.deliv.classList.toggle('hidden', !n); this.deliv.textContent = `🚚 配送中 ×${n}`;
  }
  setRoom(text) { this.roomInfo.classList.toggle('hidden', !text); this.roomInfo.innerHTML = ''; if (text) this.roomInfo.append(...text); }
  setHint(text, info) {
    this.hint.classList.toggle('hidden', !text);
    if (this.hint._t !== text) { this.hint.textContent = text || ''; this.hint._t = text; }
    this.info.classList.toggle('hidden', !info);
    if (info && this.info._t !== info) { this.info.innerHTML = info; this.info._t = info; }
  }
  setKeys(text) { if (this.keys._t !== text) { this.keys.textContent = text; this.keys._t = text; } }
  showCross(v) { this.cross.classList.toggle('hidden', !v); }

  // ---------- 発注パソコン ----------
  openPC(tab = 'order') {
    const g = this.g;
    const cart = new Map();
    let cat = 'food';
    const body = h('div', { class: 'pc-body' });
    const tabs = h('div', { class: 'tabs' });
    const TABS = [['order', '📦 発注'], ['staff', '🧑‍💼 従業員'], ['rep', '💬 評判'], ['skill', '🌟 スキル'], ['store', '🏪 お店']];
    if (tab === 'price') tab = 'order';
    const total = h('b'); const orderBtn = h('button', { class: 'btn' }, '注文する');
    const draw = () => {
      const st = g.store;
      tabs.innerHTML = '';
      for (const [k, n] of TABS) tabs.append(h('button', { class: 'tab' + (k === tab ? ' on' : ''), onclick: () => { if (k === 'skill') { m.close(); this.openSkills(); return; } tab = k; draw(); } }, n));
      // ＋−を押して描き直してもスクロール位置がもどらないように覚えておく
      const same = body.dataset.k === tab + '|' + cat, keepB = body.scrollTop, keepG = body.querySelector('.pgrid')?.scrollTop || 0;
      body.dataset.k = tab + '|' + cat;
      body.innerHTML = ''; body.className = 'pc-body tab-' + tab;
      requestAnimationFrame(() => { if (same) { body.scrollTop = keepB; const gr = body.querySelector('.pgrid'); if (gr) gr.scrollTop = keepG; } else body.scrollTop = 0; });
      if (tab === 'order') {
        const ctabs = h('div', { class: 'tabs scroll small' });
        for (const [k, c] of Object.entries(CATEGORIES)) ctabs.append(h('button', { class: 'tab' + (k === cat ? ' on' : ''), onclick: () => { cat = k; draw(); } }, c.icon + ' ' + c.name));
        const grid = h('div', { class: 'pgrid' });
        const inCart = [...cart.values()].reduce((t, n) => t + n, 0), full = inCart >= ORDER_MAX_BOXES;
        const qtyRow = (key, label, price) => {
          const n = cart.get(key) || 0;
          return h('div', { class: 'qty' + (key.endsWith('|h') ? ' half' : '') }, h('span', { class: 'ql' }, label, h('small', {}, yen(price))),
            h('button', { onclick: () => { cart.set(key, Math.max(0, n - 1)); draw(); } }, '−'), h('b', {}, n),
            h('button', { class: full ? 'dim' : '', onclick: () => { if (full) { toast(`カートは最大${ORDER_MAX_BOXES}箱までです`, 'warn'); return; } cart.set(key, n + 1); draw(); } }, '＋'));
        };
        const sm = stockMap(st);
        for (const p of PRODUCTS_LIST.filter((x) => x.cat === cat)) {
          const ok = productUnlocked(p.id, st.skills);
          const unitCost = marketCost(st, p.id) * (st.skills.mk_bulk ? 0.9 : 1);
          const boxCost = Math.round(unitCost * p.qty), halfCost = Math.round(unitCost * halfQty(p.id));
          const card = h('div', { class: 'pcard2' + (ok ? '' : ' locked') },
            h('div', { class: 'pe' }, p.icon),
            h('div', { class: 'pn' }, p.name),
            p.place.length === 1 && p.place[0] === 'chilled' ? h('div', { class: 'pbadge cold' }, '🧊 冷蔵ケース専用') : p.place.length === 1 && p.place[0] === 'frozen' ? h('div', { class: 'pbadge frozen' }, '❄️ 冷凍ケース専用') : null,
            h('div', { class: 'pm' }, `📦 1箱${p.qty}個（半分は${halfQty(p.id)}個）`),
            h('div', { class: 'pm' }, `仕入 ${yen(marketCost(st, p.id))} / 相場 ${yen(marketPrice(st, p.id))} `, trend(st, p.id)),
            ok ? stockLine(sm, p.id) : null,
            ok ? h('div', { class: 'qtys' }, qtyRow(p.id, '1箱', boxCost), qtyRow(p.id + '|h', '半分', halfCost))
              : h('div', { class: 'lock' }, '🔒 スキル「' + (SKILLS[p.lic]?.name || '') + '」'));
          grid.append(card);
        }
        // カートのキー：商品ID（1箱）／商品ID|h（半分の箱）→ 注文は [商品, 箱数, ハーフ]
        const items = [...cart.entries()].filter(([, n]) => n > 0).map(([k, n]) => [k.split('|')[0], n, k.endsWith('|h') ? 1 : 0]);
        const goods = orderCost(st, items), cost = orderTotal(st, items);
        total.textContent = yen(cost);
        orderBtn.disabled = !items.length || cost > st.money;
        orderBtn.textContent = items.length ? `🚚 注文する（${inCart}箱）` : '注文する';
        orderBtn.onclick = () => { g.act({ t: 'order', items }); cart.clear(); draw(); };
        // カートの中身（タップで1箱へらす）
        const chips = h('div', { class: 'cart-chips' }, items.length ? items.map(([pid, k, half]) => h('button', { class: 'cchip', onclick: () => { const key = pid + (half ? '|h' : ''); cart.set(key, k - 1); draw(); } }, `${PRODUCTS[pid].icon}${half ? '½' : ''}×${k}`)) : h('span', { class: 'muted small' }, '＋でカートに入れてね'));
        body.append(ctabs, grid, h('div', { class: 'cartbar' },
          h('div', { class: 'cart-l' },
            h('div', { class: 'cart-h' }, h('b', { class: 'cart-n' + (full ? ' full' : '') }, `🛒 ${inCart}/${ORDER_MAX_BOXES}箱`), items.length ? h('button', { class: 'cclear', onclick: () => { cart.clear(); draw(); } }, 'からにする') : null),
            chips),
          h('div', { class: 'cart-r' },
            h('div', { class: 'cart-sum' }, items.length ? `商品 ${yen(goods)} ＋ 送料 ${yen(SHIPPING_FEE)}` : `送料 ${yen(SHIPPING_FEE)}／回（最大${ORDER_MAX_BOXES}箱）`),
            h('div', {}, '合計', h('span', { class: 'muted small' }, '（送料込み）'), total, h('span', { class: 'muted small' }, ` ／ 所持金 ${yen(st.money)}`)),
            orderBtn)));
      } else if (tab === 'rep') {
        body.append(repPanel(st));
      } else if (tab === 'staff') {
        // 従業員の枠 No.1〜15。スキルボードで枠を解放 → 好きな仕事を選んで雇う
        const lim = staffLimit(st.skills);
        const tagged = st.fixtures.reduce((n, f) => n + (f.s ? f.s.filter((x) => x[0]).length : 0), 0);
        const wageMul = st.skills.staff_wage ? 0.75 : 1, wages = Math.round(st.staff.reduce((t, o) => t + o.wage, 0) * wageMul);
        body.append(h('div', { class: 'wage-total' }, `💴 人件費 1日 ${yen(wages)}`, h('span', { class: 'muted small' }, `（${st.staff.length}人分・閉店のときに払います${st.skills.staff_wage ? '・働き方改革で25%引き' : ''}）`)),
          h('p', { class: 'muted small' }, `雇っている人 ${st.staff.length} / 解放した枠 ${lim}（最大${STAFF_MAX}人）。枠はスキルボードの「🧑‍💼 従業員」で お店Lv.5 から解放でき、Lv.30 で15人目。番号が大きいほど足も仕事も速く、そのぶん日給も高い人です。品出し係は値札のついた棚だけ補充します（値札のある段：${tagged}）。`));
        const bar = (spd) => h('span', { class: 'spdbar' }, h('i', { style: { width: Math.round(spd / 2.2 * 100) + '%' } }));
        const r = mulberry32(st.day * 7919 + st.staff.length * 31);
        for (const sl of STAFF_SLOTS) {
          const s = st.staff.find((o) => o.slot === sl.no);
          const open = !!st.skills['staff_h' + sl.no];
          const spd = s?.spd || sl.spd;
          const head = h('div', { class: 'slot-h' }, h('b', {}, `${sl.icon} No.${sl.no}「${sl.title}」`), h('span', { class: 'muted small' }, `はやさ ${Math.round(spd * 100)}%`), bar(spd));
          if (s) {
            const R = STAFF_ROLES[s.role] || STAFF_ROLES.stocker;
            body.append(h('div', { class: 'scard' }, head,
              h('div', { class: 'row between' }, h('span', {}, `${R.icon} ${s.name}さん（${R.name}）`,
                h('button', { class: 'btn tiny ghost', title: '名前を変える', onclick: async () => { const v = await promptBox('✏️ 従業員の名前（10文字まで）', s.name, { max: 10, placeholder: '名前' }); if (v) { g.act({ t: 'staffName', sid: s.id, name: v }); setTimeout(draw, 150); } } }, '✏️')),
                h('span', { class: 'muted small' }, `日給 ${yen(s.wage)}`),
                h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox(`${s.name}さんを解雇しますか？`, '解雇')) { g.act({ t: 'fire', sid: s.id }); setTimeout(draw, 150); } } }, '解雇')),
              h('div', { class: 'roles' }, Object.entries(STAFF_ROLES).map(([k, d]) => h('button', { class: 'role' + (s.role === k ? ' on' : ''), onclick: () => { g.act({ t: 'staffRole', sid: s.id, role: k }); setTimeout(draw, 150); } }, d.icon + ' ' + d.name))),
              h('div', { class: 'muted small' }, R.desc)));
          } else if (open) {
            const name = (this._hireNames ||= {})[sl.no] ?? STAFF_NAMES[Math.floor(r() * STAFF_NAMES.length)], seed = Math.floor(r() * 1e9);
            // 名前は自分で書ける（はじめは候補の名前が入っている）
            const nameInp = h('input', { class: 'inp name-inp', value: name, maxlength: 10, placeholder: '名前' });
            nameInp.oninput = () => { this._hireNames[sl.no] = nameInp.value; };
            body.append(h('div', { class: 'scard free' }, head,
              h('div', { class: 'row name-row' }, h('span', { class: 'muted small' }, '✏️ 名前'), nameInp, h('span', { class: 'muted small' }, 'さんが働きたがっています。仕事を選んで雇おう：')),
              h('div', { class: 'roles' }, Object.entries(STAFF_ROLES).map(([k, d]) => h('button', { class: 'role hire', onclick: () => {
                const nm = nameInp.value.trim();
                if (!nm) { toast('名前を入れてね', 'warn'); nameInp.focus(); return; }
                delete this._hireNames[sl.no];
                g.act({ t: 'hire', role: k, name: nm, seed, slot: sl.no }); setTimeout(draw, 150);
              } }, `${d.icon} ${d.name}で雇う（日給${yen(slotWage(d, sl.no))}）`)))));
          } else {
            body.append(h('div', { class: 'scard locked' }, head, h('div', { class: 'muted small' }, `🔒 スキル「従業員 No.${sl.no}」で解放（お店 Lv.${sl.lv}・${sl.cost}SP）`)));
          }
        }
      } else if (tab === 'store') {
        body.append(
          h('div', { class: 'pc-stats' }, stat('総売上', yen(st.totalSales)), stat('来店客数', st.totalCustomers + '人'), stat('評判', '⭐' + repStars(st.rep).toFixed(1)), stat('営業時間', `8:00〜${fmtTime(closeTime(st.skills))}`)),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: async () => { const v = await promptBox('お店の名前', st.name, { max: 16 }); if (v) g.act({ t: 'storeName', v }); setTimeout(draw, 150); } }, '✏️ 店名を変える'),
          ),
          h('div', { class: 'ed-label' }, 'お店のテーマカラー'),
          h('div', { class: 'swatches' }, ['#ff6b35', '#e63946', '#2a9d8f', '#3a86ff', '#7b2cbf', '#ff70a6', '#f4a261', '#06d6a0', '#118ab2', '#495057'].map((c) =>
            h('button', { class: 'sw' + (st.color === c ? ' on' : ''), style: { background: c }, onclick: () => { g.act({ t: 'storeName', v: st.name, c }); setTimeout(draw, 150); } }))));
      }
    };
    const m = modal('📋 マネージャーボード', [body], { wide: true, cls: 'pcm', onClose: () => this.closed() });
    tabs.classList.add('head-tabs'); m.el.querySelector('.modal-head').insertBefore(tabs, m.el.querySelector('.modal-head .x'));
    this.opened(m); draw();
    this._redraw = draw;
  }
  refresh() { this._redraw && this.open && this._redraw(); }

  openPrice(pid) {
    const g = this.g, p = PRODUCTS[pid];
    const draw = () => { m.body.innerHTML = ''; m.body.append(priceRow(g, g.store, p, true, draw, true, stockMap(g.store))); };
    const m = modal(`🏷 値札：${p.icon} ${p.name}`, [], { onClose: () => this.closed() });
    this.opened(m); draw();
  }
  // 看板の文字（と色）を変える
  openText(fid) {
    const g = this.g, f = g.store.fixtures.find((o) => o.id === fid);
    if (!f) return;
    const def = FIXTURES[f.t];
    const colorable = ['hangsign', 'banner', 'neon'].includes(f.t);
    const COLORS = f.t === 'neon' ? ['#ff4fd8', '#4fd8ff', '#ffe14f', '#5dff7a', '#ff6b4f', '#b77bff', '#ffffff'] : ['#ffffff', '#e63946', '#ff7a1a', '#f2b705', '#2a9d8f', '#1d6fd1', '#6a4c93', '#2b2d42'];
    let col = f.c || COLORS[0];
    const inp = h('input', { class: 'inp', value: (f.tx || '').replace(/\n/g, '/'), maxlength: 24, placeholder: '例：本日のおすすめ' });
    const sw = h('div', { class: 'swatches' });
    const drawSw = () => { sw.innerHTML = ''; for (const c of COLORS) sw.append(h('button', { class: 'sw' + (c === col ? ' on' : ''), title: c === '#ffffff' && f.t !== 'neon' ? 'お店の色' : c, style: { background: c === '#ffffff' && f.t !== 'neon' ? (g.store.color || '#ff6b35') : c }, onclick: () => { col = c; drawSw(); } })); };
    drawSw();
    const ok = () => { g.act({ t: 'text', fid, v: inp.value.trim().replace(/\//g, '\n'), c: colorable ? col : undefined }); m.close(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    const m = modal(`${def.icon} ${def.name}の文字`, [
      h('div', { class: 'muted small' }, '文字は24文字まで。「/」で改行できます'), inp,
      colorable ? h('div', { class: 'muted small' }, f.t === 'neon' ? '光の色' : '看板の色（左はお店の色）') : null, colorable ? sw : null,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: ok }, '決定'))], { onClose: () => this.closed() });
    this.opened(m);
    setTimeout(() => inp.focus(), 60);
  }
  opened(m) { if (this.open && this.open !== m) { const o = this.open; this.open = null; try { o.close(); } catch (e) { /* noop */ } } this.open = m; this.g.setUIBlock(true); }
  closed() { this.open = null; this._redraw = null; this.g.setUIBlock(false); }
  closeAll() { if (this.open) { const o = this.open; this.open = null; o.close(); } }

  // ---------- 店舗拡張ボード ----------
  openExpand() {
    const g = this.g;
    const body = h('div');
    const draw = () => {
      const st = g.store, tg = Object.fromEntries(expandTargets(st).map((t) => [t.id, t]));
      body.innerHTML = '';
      const cell = (id, label, cls) => {
        const t = tg[id], owned = !t;
        const btn = h('button', { class: 'xcell ' + cls + (owned ? ' owned' : t.can ? ' can' : ' locked') },
          h('b', {}, label), h('span', {}, owned ? '✅ 使用中' : t.can ? `¥${t.cost.toLocaleString()}` : '🔒 となりから'));
        if (!owned && t.can) btn.onclick = async () => {
          if (await confirmBox(`${label}を ¥${t.cost.toLocaleString()} で購入しますか？`, '購入')) { g.act({ t: 'expand', id }); setTimeout(draw, 150); }
        };
        return btn;
      };
      const grid = h('div', { class: 'xgrid' });
      grid.append(h('div', { class: 'xrow office' }, h('div', { class: 'xcell office' }, h('b', {}, 'マネージャー室'), h('span', {}, 'ボード類'))));
      // 倉庫：上が奥。左右にも奥にも広げられる
      for (let r = STOCK_ROWS - 1; r >= 0; r--) {
        const stockRow = h('div', { class: 'xrow' });
        stockRow.style.gridTemplateColumns = `repeat(${STOCK_COLS}, 1fr)`;
        for (let c = 0; c < STOCK_COLS; c++) { const s = stockAt(c, r); stockRow.append(cell(s.id, s.name, 'stock')); }
        grid.append(stockRow);
      }
      // 売り場：上が奥（倉庫側）、下が入口側。左右にも奥にも広げられる
      for (let r = SALES.rows - 1; r >= 0; r--) {
        const row = h('div', { class: 'xrow' }); row.style.gridTemplateColumns = `repeat(${SALES.cols}, 1fr)`;
        for (let c = 0; c < SALES.cols; c++) row.append(cell('b' + c + r, `売り場 ${String.fromCharCode(65 + c)}${SALES.rows - r}`, 'bay'));
        grid.append(row);
      }
      grid.append(h('div', { class: 'xstreet' }, '🚶 歩道・入口 🚪'));
      body.append(h('p', { class: 'muted small' }, `所持金 ${'¥' + st.money.toLocaleString()}　／　売り場も倉庫も、左右にも奥にも、いま使っている区画のとなりから1区画ずつ広げられます（買うたびに値上がり）`), grid);
    };
    const m = modal('🗺️ 店舗拡張ボード', body, { wide: true, onClose: () => this.closed() });
    this.opened(m); draw();
    this._redraw = draw;
  }
  // ---------- スキルボード ----------
  openSkills(branch) {
    const g = this.g;
    const wrap = h('div', { class: 'skill-wrap' });
    const info = h('div', { class: 'skill-info' }, 'スキルを選んでください');
    const spTxt = h('b');
    const tabs = h('div', { class: 'tabs' });
    let tab = branch || this._skillTab || 'prod';
    let sel = null;
    const canOf = (st, s) => !st.skills[s.id] && s.req.every((r) => st.skills[r]) && (!s.lv || st.level >= s.lv);
    const draw = () => {
      const st = g.store;
      this._skillTab = tab;
      spTxt.textContent = `所持SP：${st.sp}`;
      tabs.innerHTML = '';
      for (const [k, n] of SKILL_BRANCHES) {
        const list = SKILLS_LIST.filter((s) => s.branch === k);
        const own = list.filter((s) => st.skills[s.id]).length, can = list.filter((s) => canOf(st, s) && st.sp >= s.cost).length;
        tabs.append(h('button', { class: 'tab' + (k === tab ? ' on' : ''), onclick: () => { tab = k; sel = null; draw(); } }, n, h('span', { class: 'tcount' }, ` ${own}/${list.length}`), can ? h('span', { class: 'tbadge' }, can) : null));
      }
      tabs.append(h('span', { class: 'sp-chip', title: 'レベルアップでSPがもらえます' }, `⭐${st.sp}SP`, h('span', { class: 'muted small' }, ` Lv.${st.level}${st.level >= MAX_LEVEL ? ' MAX' : ''}`), g.room ? h('span', { class: 'muted small' }, ' 👥みんなで共有') : null));
      const keepX = wrap.scrollLeft, keepY = wrap.scrollTop, sameTab = wrap.dataset.tab === tab;
      wrap.dataset.tab = tab;
      wrap.innerHTML = '';
      const list = SKILLS_LIST.filter((s) => s.branch === tab);
      const root = ROOT_POS[tab];
      const GX = tab === 'prod' ? 112 : 130, GY = 106;
      const maxX = Math.max(...list.map((s) => s.x), root ? root[0] : 0), maxY = Math.max(...list.map((s) => s.y));
      const W = (maxX + 1) * GX, H = (maxY + 1) * GY + 20;
      const pos = (s) => s.id === 'start' ? [root[0] * GX + GX / 2, GY / 2] : [s.x * GX + GX / 2, s.y * GY + GY / 2];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', W); svg.setAttribute('height', H); svg.classList.add('skill-lines');
      for (const s of list) for (const r of s.req) {
        if (!SKILLS[r] || (SKILLS[r].branch !== tab && r !== 'start')) continue;
        const a = pos(SKILLS[r]), b = pos(s);
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        l.setAttribute('d', `M${a[0]},${a[1]} C${a[0]},${(a[1] + b[1]) / 2} ${b[0]},${(a[1] + b[1]) / 2} ${b[0]},${b[1]}`);
        l.setAttribute('class', st.skills[s.id] ? 'on' : st.skills[r] ? 'can' : '');
        svg.append(l);
      }
      const board = h('div', { class: 'skill-board', style: { width: W + 'px', height: H + 'px' } }, svg);
      const nodes = root ? [SKILLS.start, ...list] : list;
      for (const s of nodes) {
        const owned = !!st.skills[s.id], can = canOf(st, s);
        const [x, y] = pos(s);
        const icon = s.prods?.length ? h('span', { class: 'si prods' }, s.prods.slice(0, 3).map((p) => PRODUCTS[p]?.icon || '').join('')) : h('span', { class: 'si' }, s.icon);
        board.append(h('button', { class: 'snode' + (owned ? ' owned' : can ? ' can' : ' locked') + (sel === s.id ? ' sel' : '') + (s.prods?.length ? ' prod' : ''), style: { left: x - 40 + 'px', top: y - 40 + 'px' }, onclick: () => { sel = s.id; draw(); } },
          icon, h('span', { class: 'sn' }, s.name), owned ? null : h('span', { class: 'sc' }, s.lv && st.level < s.lv ? `Lv.${s.lv}` : s.cost + 'SP')));
      }
      wrap.append(board);
      if (sameTab) { wrap.scrollLeft = keepX; wrap.scrollTop = keepY; } else { wrap.scrollLeft = 0; wrap.scrollTop = 0; }
      const s = SKILLS[sel];
      info.innerHTML = '';
      if (s) {
        const owned = !!st.skills[s.id], can = canOf(st, s);
        info.append(h('div', { class: 'sname' }, s.icon + ' ' + s.name), h('div', { class: 'muted' }, s.desc));
        if (s.prods?.length) info.append(h('div', { class: 'sprods' }, s.prods.map((p) => h('span', { class: 'chip small' }, `${PRODUCTS[p].icon} ${PRODUCTS[p].name} 相場${yen(marketPrice(st, p))}`))));
        if (s.req.length && !owned) info.append(h('div', { class: 'muted small' }, '必要：' + s.req.map((r) => (st.skills[r] ? '✅' : '🔒') + (SKILLS[r]?.name || r)).join('・')));
        if (s.lv && !owned) info.append(h('div', { class: 'small ' + (st.level >= s.lv ? 'muted' : 'warn-t') }, `${st.level >= s.lv ? '✅' : '🔒'} お店のレベル ${s.lv} 以上（いま Lv.${st.level}）`));
        info.append(owned ? h('div', { class: 'chip' }, '✅ 解放済み') :
          h('button', { class: 'btn', disabled: !can || st.sp < s.cost ? true : null, onclick: () => { g.act({ t: 'skill', id: s.id }); setTimeout(draw, 150); } },
            can ? (st.sp >= s.cost ? `${s.cost}SPで解放する` : `SPが足りません（${s.cost}SP）`) : s.lv && st.level < s.lv ? `Lv.${s.lv}で解放できます` : '前のスキルが必要'));
      } else info.append(h('div', { class: 'muted' }, tab === 'prod' ? `🛒 商品スキルを解放すると、新しい商品が発注できるようになります。お店のレベルが上がるほど新しい商品スキルが増えます（いま Lv.${st.level}）。` : 'レベルが上がるとSP（スキルポイント）がもらえます。ノードをタップして解放しよう！'));
    };
    const m = modal('🌟 スキルボード', [wrap, info], { wide: true, cls: 'skills', onClose: () => this.closed() });
    tabs.classList.add('head-tabs'); m.el.querySelector('.modal-head').insertBefore(tabs, m.el.querySelector('.modal-head .x'));
    this.opened(m); draw();
    this._redraw = draw;
  }

  // ---------- ポーズ ----------
  openPause() {
    const g = this.g;
    const m = modal('⏸ メニュー', [
      h('div', { class: 'col' },
        h('button', { class: 'btn big', onclick: () => m.close() }, '▶ 再開'),
        h('div', { class: 'muted small', style: { textAlign: 'center' } }, '📋 発注・従業員・評判・🌟 スキル・🗺️ 店舗拡張は、マネージャー室（倉庫のいちばん奥）のボードの前でできます'),
        h('button', { class: 'btn ghost', onclick: () => { m.close(); g.app.openSettingsInGame(); } }, '⚙️ 設定'),
        h('button', { class: 'btn ghost', onclick: () => { m.close(); g.help(); } }, '❓ 遊び方'),
        g.roomId ? h('div', { class: 'chip' }, `ルームID：${g.roomId}`) : null,
        h('button', { class: 'btn danger', onclick: async () => { m.close(); if (await confirmBox(g.mode === 'client' ? 'ルームから退出しますか？' : '保存してメニューに戻りますか？', '戻る')) g.app.endGame(); } }, g.mode === 'solo' ? '💾 保存してメニューへ' : '🚪 退出する')),
    ], { onClose: () => this.closed() });
    this.opened(m);
  }
  showSummary(d, isHost) {
    const g = this.g;
    const row = (k, v, cls) => h('div', { class: 'sum-row ' + (cls || '') }, h('span', {}, k), h('b', {}, v));
    const income = d.sales + (d.vend || 0) + (d.recycle || 0), cost = d.orders + (d.ship || 0) + d.wages + d.bills;
    const mx = Math.max(1, income, cost);
    const bar = (v, cls) => h('div', { class: 'sum-bar' }, h('i', { class: cls, style: { width: Math.round(v / mx * 100) + '%' } }));
    const diff = d.prevProfit == null ? null : d.profit - d.prevProfit;
    const left = h('div', { class: 'sum-col' },
      h('div', { class: 'sum-h' }, '💰 収入'), bar(income, 'plus'),
      row('売上', '+' + yen(d.sales), 'plus'), d.vend ? row('自販機', '+' + yen(d.vend), 'plus') : null, d.recycle ? row('リサイクル', '+' + yen(d.recycle), 'plus') : null,
      h('div', { class: 'sum-h' }, '💸 支出'), bar(cost, 'minus'),
      row('仕入れ', '−' + yen(d.orders), 'minus'), d.ship ? row('送料', '−' + yen(d.ship), 'minus') : null, row('人件費', '−' + yen(d.wages), 'minus'), row('光熱費・家賃', '−' + yen(d.bills), 'minus'),
      h('div', { class: 'sum-total ' + (d.profit >= 0 ? 'plus' : 'minus') }, h('span', {}, '本日の利益'), h('b', {}, (d.profit >= 0 ? '+' : '−') + yen(Math.abs(d.profit)))),
      diff == null ? null : h('div', { class: 'muted small right' }, `前日比 ${diff >= 0 ? '▲ +' : '▼ −'}${yen(Math.abs(diff))}`),
      row('所持金', yen(d.money)));
    const top = (d.top || []).filter(([p]) => PRODUCTS[p]);
    const right = h('div', { class: 'sum-col' },
      h('div', { class: 'sum-h' }, '🏆 よく売れた商品'),
      top.length ? h('div', { class: 'sum-top' }, top.map(([p, [n, rev]], i) => h('div', { class: 'sum-item' }, h('span', { class: 'rk' }, ['🥇', '🥈', '🥉'][i] || (i + 1) + '.'), h('span', { class: 'ic' }, PRODUCTS[p].icon),
        h('span', { class: 'nm' }, PRODUCTS[p].name), h('span', { class: 'muted small' }, `${n}個`), h('b', {}, yen(rev))))) : h('p', { class: 'muted small' }, '今日は何も売れませんでした…'),
      h('div', { class: 'sum-h' }, '📈 お店の様子'),
      row('お会計したお客さん', d.served + '人'), row('怒って帰ったお客さん', d.lost + '人', d.lost ? 'minus' : ''), row('獲得経験値', d.xp + ' XP'), row('評判', `⭐ ${repStars(d.rep).toFixed(1)}` + (d.repPrev != null ? `（${d.rep >= d.repPrev ? '▲' : '▼'}${Math.abs(repStars(d.rep) - repStars(d.repPrev)).toFixed(1)}）` : ''), d.repPrev != null && d.rep < d.repPrev ? 'minus' : ''),
      (() => { const rv = d.rv || [0, 0, 0, 0, 0], n = rv.reduce((a, b) => a + b, 0); return n ? row('今日の評価', `★${(rv.reduce((a, c, i) => a + c * (i + 1), 0) / n).toFixed(1)}（${n}人）`) : null; })(),
      row('お店のレベル', 'Lv.' + d.level + (d.level >= MAX_LEVEL ? ' MAX' : '')));
    const body = [
      h('div', { class: 'sum-big' }, `${d.day}日目 おつかれさま！`),
      h('div', { class: 'sum-grid' }, left, right),
      isHost ? h('button', { class: 'btn big', onclick: () => { m.close(); g.act({ t: 'nextDay' }); } }, `☀️ 次の日へ（${d.day + 1}日目）`) : h('p', { class: 'muted center' }, 'ホストが次の日を始めるのを待っています…'),
    ];
    const m = modal('📊 本日の収支', body, { wide: true, cls: 'summary', noClose: isHost, onClose: () => this.closed() });
    this.opened(m);
    this.summaryModal = m;
  }
  closeSummary() { if (this.summaryModal) { try { this.summaryModal.close(); } catch (e) { /* noop */ } this.summaryModal = null; } }

  // ---------- レジ ----------
  updateReg(r, fid) {
    if (!r) { this.reg.classList.add('hidden'); this._regKey = ''; this.reg.innerHTML = ''; return; }
    this.reg.classList.remove('hidden');
    const key = JSON.stringify([fid, r.ph, r.b, r.pay, r.q, this._change]);
    if (key === this._regKey) return;
    this._regKey = key;
    const g = this.g, R = this.reg;
    R.innerHTML = '';
    const scanned = r.b.filter((x) => x[1]).length, sum = r.b.filter((x) => x[1]).reduce((s, x) => s + x[2], 0);
    R.append(h('div', { class: 'reg-head' }, h('span', {}, '🧾 レジ'), h('span', { class: 'muted' }, `待ち ${Math.max(0, (r.q || 0) - (r.cu != null ? 1 : 0))}人`),
      h('button', { class: 'btn small ghost', onclick: () => g.leaveRegister() }, '離れる')));
    if (r.ph === 'idle') { R.append(h('div', { class: 'reg-msg' }, 'お客さんを待っています…')); this._change = 0; return; }
    R.append(h('div', { class: 'reg-total' }, h('span', {}, `${scanned}/${r.b.length}点`), h('b', {}, yen(sum))));
    if (r.ph === 'scan') {
      R.append(h('div', { class: 'reg-msg' }, 'ベルトの商品をタップしてスキャン！'), h('button', { class: 'btn big', onclick: () => g.scanNext() }, '📡 次をスキャン'));
      this._change = 0;
    } else if (r.ph === 'pay') {
      const p = r.pay;
      if (p.m === 'card') {
        R.append(h('div', { class: 'reg-msg' }, '💳 カード払い'), h('div', { class: 'reg-card' }, `お会計 ${yen(p.total)}`),
          h('button', { class: 'btn big', onclick: () => g.act({ t: 'pay', fid, change: 0 }) }, '決済する'));
      } else {
        const need = p.given - p.total;
        this._change ||= 0;
        const cur = h('b', { class: this._change === need ? 'ok' : '' }, yen(this._change));
        const coins = [1, 5, 10, 50, 100, 500, 1000, 5000];
        R.append(h('div', { class: 'reg-msg' }, `💴 現金 ${yen(p.given)} お預かり`),
          h('div', { class: 'reg-change' }, h('span', {}, `おつり ${yen(need)} を渡そう`), cur),
          h('div', { class: 'coins' }, coins.map((c) => h('button', { class: 'coin' + (c >= 1000 ? ' bill' : ''), onclick: () => { this._change += c; g.app.sfx.play('coin'); this._regKey = ''; this.updateReg(r, fid); } }, c >= 1000 ? `${c}円札` : `${c}`))),
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { this._change = 0; this._regKey = ''; this.updateReg(r, fid); } }, 'やり直し'),
            h('button', { class: 'btn', onclick: () => { g.act({ t: 'pay', fid, change: this._change }); this._change = 0; } }, '渡す')));
      }
    }
  }
  // ---------- 建築 ----------
  showBuild(open, sel, onPick, mv = null) {
    this.build.classList.toggle('hidden', !open);
    this.build.classList.toggle('moving', !!(open && mv));
    if (!open) return;
    const st = this.g.store;
    // 設備を動かしている間は、カタログではなく小さな案内バーだけ出す
    if (mv) {
      const key = 'mv|' + mv.type;
      if (this._bKey !== key) {
        this._bKey = key;
        const def = FIXTURES[mv.type];
        const B = this.build; B.innerHTML = '';
        this._bStatus = h('div', { class: 'mv-status' });
        const press = (id) => () => this.g.input.edges.add(id);
        B.append(h('div', { class: 'mv-bar' },
          h('div', { class: 'mv-title' }, `🔧 ${def.icon} ${def.name}を移動中`),
          h('div', { class: 'muted small' }, '置きたい場所の床を見てね'),
          this._bStatus,
          h('div', { class: 'row' },
            h('button', { class: 'btn small ghost', onclick: press('alt') }, '🔄 回転'),
            h('button', { class: 'btn small', onclick: press('act') }, '✅ ここに移動'),
            h('button', { class: 'btn small ghost', onclick: press('box') }, '✖ やめる'))));
      }
      if (this._bStatus) {
        const t = mv.ok ? '🟢 ここに置けます' : '🔴 ' + (mv.why || 'ここには置けません');
        if (this._bStatus.textContent !== t) { this._bStatus.textContent = t; this._bStatus.classList.toggle('ng', !mv.ok); }
      }
      return;
    }
    const key = JSON.stringify([sel, st.money, Object.keys(st.skills).length, this._bcat, this._thumbRev || 0]);
    if (key === this._bKey) return;
    this._bKey = key;
    this._bcat ||= 'shelf';
    const B = this.build; B.innerHTML = '';
    const tabs = h('div', { class: 'tabs scroll small' });
    for (const [k, n] of Object.entries(FIXTURE_CATS)) tabs.append(h('button', { class: 'tab' + (k === this._bcat ? ' on' : ''), onclick: () => { this._bcat = k; this._bKey = ''; this.showBuild(true, sel, onPick); } }, n));
    const items = h('div', { class: 'bitems' });
    const R = this.g.R, need = [];
    for (const [id, f] of Object.entries(FIXTURES)) {
      if (f.cat !== this._bcat || f.fixed) continue;
      const ok = fixtureUnlocked(id, st.skills);
      const url = R?.thumbUrl?.(id, st.color);
      if (url === null && R?.thumbUrl && !R._thumbs?.has(id + '|' + st.color)) need.push(id);
      const slots = f.slots ? f.slots.length : 0;
      items.append(h('button', { class: 'bitem' + (sel === id ? ' on' : '') + (ok ? '' : ' locked'), title: f.desc || '', onclick: () => ok ? onPick(id) : toast(`スキル「${SKILLS[f.req]?.name}」で解放`, 'warn') },
        url ? h('img', { class: 'bthumb', src: url, alt: f.name }) : h('span', { class: 'bi' }, f.icon),
        h('span', { class: 'bn' }, f.name), slots ? h('span', { class: 'bs' }, `${slots}枠`) : f.boxSlots ? h('span', { class: 'bs' }, `${f.boxSlots.length}箱`) : null,
        h('span', { class: 'bp' }, ok ? yen(f.price) : '🔒 ' + (SKILLS[f.req]?.name || ''))));
    }
    // 見た目の画像はあとから少しずつ作る（できたら差し替え）
    if (need.length) R.requestThumbs(need, st.color, () => { this._thumbRev = (this._thumbRev || 0) + 1; if (!this.build.classList.contains('hidden') && !this.build.classList.contains('moving')) this.showBuild(true, sel, onPick); });
    B.append(h('div', { class: 'build-head' }, h('b', {}, '🔨 建築モード'), h('span', { class: 'muted small' }, '設備を選んで置く／置いてある棚・レジを狙って「移動」「売却」'), h('button', { class: 'btn small ghost', onclick: () => this.g.toggleBuild(false) }, '終了')), tabs, items);
  }

  // ---------- チャット ----------
  openChat() {
    const g = this.g;
    const inp = h('input', { class: 'inp', maxlength: 60, placeholder: 'メッセージ（60文字まで）' });
    const send = (t) => { t = (t || '').trim(); if (!t) return; g.sendChat(t); inp.value = ''; m.close(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(inp.value); });
    const log = h('div', { class: 'chat-full' }, ...(this._chatHist || []).map((c) => chatLine(c)));
    const m = modal('💬 ルームチャット', [log, h('div', { class: 'presets' }, CHAT_PRESETS.map((p) => h('button', { class: 'chip btnchip', onclick: () => send(p) }, p))),
      h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: () => send(inp.value) }, '送信'))], { onClose: () => this.closed() });
    this.opened(m);
    setTimeout(() => { log.scrollTop = 1e6; inp.focus(); }, 30);
  }
  addChat(c) {
    (this._chatHist ||= []).push(c); if (this._chatHist.length > 50) this._chatHist.shift();
    const line = chatLine(c);
    this.chatLog.append(line);
    while (this.chatLog.children.length > 5) this.chatLog.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 9000);
  }
}
function chatLine(c) { return h('div', { class: 'cline' }, h('b', {}, (c.n || '???') + '：'), document.createTextNode(String(c.m || '').slice(0, 60))); }
const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, String(v)));

// 在庫：棚に並んでいる数と、倉庫など（段ボールの中）にある数
function stockMap(st) {
  const m = new Map();
  const get = (p) => { let e = m.get(p); if (!e) { e = { shelf: 0, back: 0, boxes: 0 }; m.set(p, e); } return e; };
  for (const f of st.fixtures) if (f.s) for (const [p, n] of f.s) if (p && n > 0) get(p).shelf += n;
  for (const b of st.boxes) if (b.n > 0) { const e = get(b.p); e.back += b.n; e.boxes++; }
  return m;
}
function stockLine(sm, pid) {
  const e = sm.get(pid);
  if (!e || (!e.shelf && !e.back)) return h('div', { class: 'pstock none' }, '在庫 0');
  return h('div', { class: 'pstock' }, `在庫 ${e.shelf + e.back}（棚${e.shelf}・倉庫${e.back}${e.boxes ? `/${e.boxes}箱` : ''}）`);
}
// 相場の上下を表示
function trend(st, pid) {
  const now = marketPrice(st, pid), prev = st.marketPrev?.[pid];
  if (!prev || prev === now) return h('span', { class: 'trend flat' }, '→');
  const d = (now - prev) / prev * 100;
  return h('span', { class: 'trend ' + (d > 0 ? 'up' : 'down') }, `${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(0)}%`);
}
// ---------- 評判（口コミ）パネル ----------
function repPanel(st) {
  const stars = repStars(st.rep), f = customerFactors(st);
  const starBar = (v) => h('span', { class: 'stars' }, h('span', { class: 'stars-bg' }, '★★★★★'), h('span', { class: 'stars-fg', style: { width: (v / 5 * 100) + '%' } }, '★★★★★'));
  const rv = st.today?.rv || [0, 0, 0, 0, 0], n = rv.reduce((a, b) => a + b, 0), mx = Math.max(1, ...rv);
  const dist = h('div', { class: 'rv-dist' }, [5, 4, 3, 2, 1].map((s) => h('div', { class: 'rv-row' }, h('span', {}, '★' + s), h('div', { class: 'sum-bar' }, h('i', { class: s >= 4 ? 'plus' : s <= 2 ? 'minus' : '', style: { width: Math.round(rv[s - 1] / mx * 100) + '%' } })), h('b', {}, rv[s - 1]))));
  const x = (v) => '×' + v.toFixed(2).replace(/0$/, '');
  const left = h('div', { class: 'rv-col' },
    h('div', { class: 'rv-big' }, h('b', {}, stars.toFixed(1)), starBar(stars)),
    h('div', { class: 'muted small' }, `評判 ${Math.round(st.rep)}/100（お客さんの評価の平均）`),
    h('div', { class: 'sum-h' }, `📅 今日の評価 ${n ? '（' + n + '人）' : ''}`), n ? dist : h('p', { class: 'muted small' }, 'まだ評価がありません（営業するとお客さんが評価します）'),
    h('div', { class: 'sum-h' }, '🚶 お客さんの来やすさ'),
    h('div', { class: 'rv-fac' },
      h('div', {}, `⭐ 評判 ${x(f.rep)}`), h('div', {}, `🏪 お店のレベル ${x(f.lv)}`), h('div', {}, `📐 売り場の広さ ${x(f.size)}`), f.ads > 1 ? h('div', {}, `📰 広告 ${x(f.ads)}`) : null,
      h('div', { class: 'rv-total' }, `合計 ${x(f.rep * f.lv * f.size * f.ads)}`)),
    h('div', { class: 'muted small' }, '評判が上がる：品切れなし・お手ごろな値段・レジが早い・品揃えが多い・装飾。下がる：品切れ・高すぎる値段・レジ待ち・通路の空き段ボール'));
  const list = (st.reviews || []).length ? (st.reviews || []).map((r) => h('div', { class: 'rv-item' + (r.s <= 2 ? ' bad' : r.s >= 5 ? ' good' : '') },
    h('div', { class: 'rv-head' }, h('span', { class: 'rv-s' }, '★'.repeat(r.s) + '☆'.repeat(5 - r.s)), h('span', { class: 'muted small' }, `${r.d}日目 ${fmtTime(r.t)}`)),
    h('div', { class: 'rv-m' }, '「' + r.m + '」'))) : [h('p', { class: 'muted small' }, 'まだ口コミはありません')];
  const right = h('div', { class: 'rv-col' }, h('div', { class: 'sum-h' }, '💬 最近の口コミ'), h('div', { class: 'rv-list' }, list));
  return h('div', { class: 'rv-grid' }, left, right);
}
function priceRow(g, st, p, stocked, redraw, big, sm) {
  const cur = getPrice(st, p.id), mk = marketPrice(st, p.id), cost = marketCost(st, p.id), lim = priceLimit(st, p.id);
  const auto = st.prices[p.id] == null;
  const ratio = cur / mk;
  // 上限（相場の+20%）までは必ず売れる。それより高いと売れない
  const mood = cur > lim ? ['🚫 高すぎて売れません', 'bad'] : ratio <= 0.9 ? ['😍 お買い得', 'good'] : ratio <= 1.0 ? ['🙂 ふつう（よく売れる）', 'ok'] : ['🤔 少し高め（まだ売れる）', 'warn'];
  const set = (v) => { g.act({ t: 'price', pid: p.id, v: v === 'market' ? 'market' : Math.max(1, Math.round(v)) }); setTimeout(redraw, 120); };
  const step = cur >= 1000 ? 50 : 10;
  const nice = (v) => (v >= 1000 ? Math.round(v / 10) * 10 - 20 : Math.round(v / 10) * 10 - 2);
  const e = sm?.get(p.id);
  return h('div', { class: 'prow' + (big ? ' big' : '') },
    h('div', { class: 'pe' }, p.icon),
    h('div', { class: 'pinfo' }, h('div', { class: 'pn' }, p.name + (stocked ? '' : ' （未陳列）') + (auto ? ' 🔄' : '')),
      h('div', { class: 'muted small' }, `相場 ${yen(mk)} `, trend(st, p.id), ` ／ 仕入 ${yen(cost)} ／ 利益 ${yen(cur - cost)} ／ 売れる上限 ${yen(lim)}`),
      h('div', { class: 'pmood ' + mood[1] }, mood[0] + (auto ? '（相場に自動で合わせ中）' : ''), e ? h('span', { class: 'pstock inl' }, ` 在庫 ${e.shelf + e.back}（棚${e.shelf}・倉庫${e.back}）`) : null)),
    h('div', { class: 'pctl' },
      h('button', { onclick: () => set(cur - step) }, '−'), h('b', {}, yen(cur)), h('button', { onclick: () => set(cur + step) }, '＋')),
    big ? h('div', { class: 'row wrap' },
      h('button', { class: 'btn small ghost', onclick: () => set(nice(mk * 0.9)) }, '相場−10%'), h('button', { class: 'btn small' + (auto ? '' : ' ghost'), onclick: () => set('market') }, '🔄 相場に合わせる'),
      h('button', { class: 'btn small ghost', onclick: () => set(nice(mk * 1.1)) }, '+10%'), h('button', { class: 'btn small ghost', onclick: () => set(nice(mk * 1.2)) }, '+20%')) : null);
}
export { escapeText };
