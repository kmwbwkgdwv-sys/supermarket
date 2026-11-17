// ===== 画面UI（タイトル・メニュー・設定・ランキング・キャラメイク） =====
import { yen, fmtDuration, formatCode, normalizeCode, randomCode, escapeText } from './util.js';
import { TRACKS, saveCustom } from './audio.js';
import { OPT, SKINS, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS, randomAvatar, sanitizeAvatar } from './models/character.js';

// ---------- DOMヘルパー ----------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);

let toastRoot;
export function toast(msg, kind = 'info', ms = 2600) {
  toastRoot ||= $('#toasts');
  const t = h('div', { class: 'toast ' + kind }, msg);
  // 同じ文が続けて出るときは古い方を消す（連打で画面が埋まらないように）
  for (const o of [...toastRoot.children]) if (o.textContent === String(msg)) o.remove();
  toastRoot.append(t);
  const maxN = document.body.classList.contains('has-modal') ? 2 : 4;
  while (toastRoot.children.length > maxN) toastRoot.firstChild.remove();
  if (document.body.classList.contains('has-modal')) ms = Math.min(ms, 1800); // メニュー中は短めに
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

// モーダル（閉じると onClose）
export function modal(title, body, { onClose, wide, cls, noClose } = {}) {
  const root = $('#modals');
  const close = () => { wrap.remove(); if (!root.children.length) document.body.classList.remove('has-modal'); onClose && onClose(); };
  const card = h('div', { class: 'card modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') },
    h('div', { class: 'modal-head' }, h('h2', {}, title), noClose ? null : h('button', { class: 'x', onclick: close, 'aria-label': '閉じる' }, '✕')),
    h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap && !noClose) close(); } }, card);
  root.append(wrap); document.body.classList.add('has-modal');
  return { close, el: card, body: card.querySelector('.modal-body') };
}
export function confirmBox(msg, okLabel = 'OK') {
  return new Promise((res) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; res(v); };
    const m = modal('確認', [h('p', {}, msg), h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => { fin(false); m.close(); } }, 'キャンセル'),
      h('button', { class: 'btn', onclick: () => { fin(true); m.close(); } }, okLabel))], { onClose: () => fin(false) });
  });
}
export function promptBox(title, value, { max = 16, placeholder = '' } = {}) {
  return new Promise((res) => {
    const inp = h('input', { class: 'inp', value: value || '', maxlength: max, placeholder });
    let done = false;
    const ok = () => { done = true; m.close(); res(inp.value.trim()); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    const m = modal(title, [inp, h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: ok }, '決定'))], { onClose: () => { if (!done) res(null); } });
    setTimeout(() => inp.focus(), 50);
  });
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('コピーしました', 'ok'); }
  catch (e) { toast('コピーできませんでした。長押しで選択してください', 'warn'); }
}
function screen(cls, ...kids) {
  const s = $('#screen'); s.innerHTML = ''; s.className = 'screen ' + cls; s.append(...kids); s.classList.remove('hidden');
  return s;
}
export function hideScreen() { const s = $('#screen'); try { document.activeElement?.blur?.(); } catch (e) { /* noop */ } s.classList.add('hidden'); s.innerHTML = ''; if (window.scrollX || window.scrollY) window.scrollTo(0, 0); }
const logo = () => h('div', { class: 'logo' }, h('div', { class: 'logo-badge' }, '🛒'), h('div', {}, h('div', { class: 'logo-title' }, 'マートメイツ'), h('div', { class: 'logo-sub' }, 'MART MATES — みんなでスーパー経営')));

// ---------- 起動〜プロフィール ----------
export function showWelcome(app) {
  screen('center',
    h('div', { class: 'card hero' }, logo(),
      h('p', { class: 'muted' }, '商品を並べて、レジを打って、お店を大きくしよう！最大4人で協力プレイ。'),
      h('button', { class: 'btn big', onclick: () => showNewProfile(app) }, '🆕 はじめから'),
      h('button', { class: 'btn big ghost', onclick: () => showRestore(app) }, '🔑 引き継ぎコードで続きから'),
      onlineChip(app)));
}
function onlineChip(app) {
  const c = h('div', { class: 'chip' }, '☁ 接続確認中…');
  app.cloud.ready.then((ok) => { c.textContent = ok ? '☁ オンライン機能 OK' : '⚠ ' + (app.cloud.error || 'オフライン'); c.classList.toggle('bad', !ok); });
  return c;
}
function showNewProfile(app) {
  const inp = h('input', { class: 'inp', maxlength: 12, placeholder: 'プレイヤー名（12文字まで）' });
  const go = () => {
    const n = inp.value.trim();
    if (!n) return toast('名前を入力してね', 'warn');
    app.createProfile(n);
    showCode(app, true);
  };
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  screen('center', h('div', { class: 'card hero' }, logo(), h('h2', {}, 'プレイヤー名を決めよう'), inp,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => showWelcome(app) }, '戻る'), h('button', { class: 'btn', onclick: go }, '決定'))));
  setTimeout(() => inp.focus(), 50);
}
export function showCode(app, first) {
  const p = app.profile;
  const status = h('div', { class: 'chip' }, '保存中…');
  const start = h('button', { class: 'btn big', disabled: first ? true : null }, first ? '保存してキャラメイクへ ▶' : '閉じる');
  const doSync = async () => {
    status.textContent = '☁ クラウドに保存中…';
    const r = await app.syncNow();
    status.textContent = r.ok ? '✅ 保存・同期しました' : `💾 この端末に保存しました（${r.reason}）`;
    status.classList.toggle('bad', !r.ok);
    start.disabled = false;
  };
  start.onclick = () => (first ? app.openEditor(true) : app.showMenu());
  screen('center', h('div', { class: 'card hero' },
    h('h2', {}, '🔑 あなたの引き継ぎコード'),
    h('p', { class: 'muted' }, '機種変更や別の端末で続きから遊ぶときに使います。スクショやメモで必ず保存してね！'),
    h('div', { class: 'code', onclick: () => copyText(formatCode(p.code)) }, formatCode(p.code)),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => copyText(formatCode(p.code)) }, '📋 コピー'), h('button', { class: 'btn ghost', onclick: doSync }, '☁ 再同期')),
    status, start));
  doSync();
}
function showRestore(app) {
  const inp = h('input', { class: 'inp code-inp', maxlength: 14, placeholder: 'XXXX-XXXX-XXXX', autocapitalize: 'characters' });
  const msg = h('p', { class: 'muted' }, '');
  const go = async () => {
    msg.textContent = '検索中…';
    try { await app.restore(inp.value); toast('データを復元しました！', 'ok'); app.showMenu(); }
    catch (e) { msg.textContent = '⚠ ' + e.message; }
  };
  screen('center', h('div', { class: 'card hero' }, h('h2', {}, '🔑 引き継ぎコードを入力'), inp, msg,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => showWelcome(app) }, '戻る'), h('button', { class: 'btn', onclick: go }, '復元する'))));
}

// ---------- メインメニュー ----------
export function showMenu(app) {
  const p = app.profile, st = p.store;
  const sync = h('div', { class: 'chip' }, p.synced ? '☁ 同期 ' + new Date(p.synced).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '💾 端末に保存');
  screen('menu',
    h('div', { class: 'menu-left' },
      logo(),
      h('div', { class: 'card pcard' },
        h('div', { class: 'pc-name' }, '👤 ' + p.name),
        h('div', { class: 'pc-store' }, '🏪 ' + st.name),
        h('div', { class: 'pc-stats' },
          stat('店レベル', 'Lv.' + st.level), stat('総売上', yen(st.totalSales)), stat('営業日', st.day + '日目'), stat('プレイ時間', fmtDuration(p.playTime))),
        sync),
      h('div', { class: 'menu-btns' },
        h('button', { class: 'btn big', onclick: () => app.startSolo() }, '🏪 ひとりで経営'),
        h('button', { class: 'btn big alt', onclick: () => showRoom(app) }, '👥 みんなで経営（ルーム）'),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn', onclick: () => app.openEditor(false) }, '🎨 キャラメイク'),
          h('button', { class: 'btn', onclick: () => showRanking(app) }, '🏆 ランキング'),
          h('button', { class: 'btn ghost', onclick: () => openSettings(app) }, '⚙️ 設定'),
          h('button', { class: 'btn ghost', onclick: () => showCode(app, false) }, '🔑 引き継ぎコード')))));
}
const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

function showRoom(app) {
  const inp = h('input', { class: 'inp code-inp', maxlength: 12, placeholder: 'ルームID（英数字4〜12文字）', value: app.lastRoom || '', autocapitalize: 'characters' });
  const msg = h('p', { class: 'muted' }, '');
  const useLocal = h('input', { type: 'checkbox' });
  const go = async () => {
    const id = normalizeCode(inp.value);
    if (id.length < 4) { msg.textContent = '⚠ 4文字以上で入力してね'; return; }
    msg.textContent = '接続中…';
    try { await app.startRoom(id, useLocal.checked || !app.cloud.configured); }
    catch (e) { msg.textContent = '⚠ ' + e.message; }
  };
  screen('center', h('div', { class: 'card hero' }, h('h2', {}, '👥 ルームに参加・作成'),
    h('p', { class: 'muted' }, '同じルームIDを入力した最大4人で、1つのお店を一緒に経営できます。最初に入った人がホスト（ホストのお店で遊びます）。'),
    inp, h('button', { class: 'btn ghost small', onclick: () => { inp.value = randomCode(6); } }, '🎲 ランダムなIDを作る'),
    app.cloud.configured ? h('label', { class: 'chk' }, useLocal, ' 同じ端末のタブ同士でテスト（オフライン）') :
      h('p', { class: 'warnbox' }, '⚠ Firebase未設定のため、同じ端末の別タブとだけ遊べます（READMEの手順で設定するとネット対戦できます）'),
    msg,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => app.showMenu() }, '戻る'), h('button', { class: 'btn', onclick: go }, '参加する ▶'))));
}

// ---------- ランキング ----------
const HAT_ICON = Object.fromEntries(OPT.hat.map((x) => [x[0], x[2]]));
export function showRanking(app) {
  const list = h('div', { class: 'rank-list' }, h('p', { class: 'muted' }, '読み込み中…'));
  const mine = h('div', { class: 'rank-mine' });
  let field = 'lv';
  const tabs = h('div', { class: 'tabs' });
  const T = [['lv', '🏪 店レベル'], ['s', '💴 総売上'], ['p', '⏱ プレイ時間']];
  const load = async () => {
    tabs.innerHTML = '';
    for (const [k, n] of T) tabs.append(h('button', { class: 'tab' + (k === field ? ' on' : ''), onclick: () => { field = k; load(); } }, n));
    list.innerHTML = ''; list.append(h('p', { class: 'muted' }, '読み込み中…'));
    await app.pushRank();
    try {
      const rows = await app.cloud.topRanks(field, 50);
      list.innerHTML = '';
      if (!rows.length) list.append(h('p', { class: 'muted' }, 'まだ誰もいません'));
      rows.forEach((r, i) => list.append(rankRow(i + 1, r, r.id === app.profile.pid)));
      const me = rows.findIndex((r) => r.id === app.profile.pid);
      let rank = me >= 0 ? me + 1 : await app.cloud.myRank(field, app.rankValue(field));
      mine.innerHTML = '';
      mine.append(rankRow(rank || '-', { n: app.profile.name, ...app.rankSelf() }, true));
    } catch (e) {
      list.innerHTML = '';
      list.append(h('p', { class: 'warnbox' }, '⚠ ランキングはオンライン機能（Firebase）の設定後に使えます。'), h('p', { class: 'muted' }, e.message));
      mine.innerHTML = ''; mine.append(rankRow('-', { n: app.profile.name, ...app.rankSelf() }, true));
    }
  };
  screen('center', h('div', { class: 'card hero wide' }, h('h2', {}, '🏆 ランキング'), tabs, list, h('div', { class: 'muted small' }, 'あなたの記録'), mine,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => app.showMenu() }, '戻る'))));
  load();
}
function rankRow(rank, r, me) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
  return h('div', { class: 'rank-row' + (me ? ' me' : '') },
    h('div', { class: 'rk' }, String(medal)),
    h('div', { class: 'rn' }, h('div', { class: 'nm' }, (HAT_ICON[r.h] || '🙂') + ' ' + (r.n || '???')), h('div', { class: 'sn' }, '🏪 ' + (r.st || ''))),
    h('div', { class: 'rv' }, h('span', {}, 'Lv.' + (r.lv || 1)), h('span', {}, yen(r.s || 0)), h('span', {}, fmtDuration(r.p || 0))));
}

// ---------- 設定 ----------
export function openSettings(app, { inGame = false, onClose } = {}) {
  const s = app.settings;
  const save = () => app.applySettings();
  const sw = (key, label, after) => { const c = h('input', { type: 'checkbox' }); c.checked = !!s[key]; c.onchange = () => { s[key] = c.checked; save(); after && after(); }; return h('label', { class: 'set-row' }, h('span', {}, label), h('span', { class: 'switch' }, c, h('i'))); };
  const slider = (key, label, min, max, step, fmt = (v) => v) => {
    const out = h('b', {}, fmt(s[key]));
    const r = h('input', { type: 'range', min, max, step, value: s[key] });
    r.oninput = () => { s[key] = +r.value; out.textContent = fmt(s[key]); save(); };
    return h('div', { class: 'set-row' }, h('span', {}, label, ' ', out), r);
  };
  const select = (key, label, opts, after) => {
    const sel = h('select', { class: 'sel' }, opts.map(([v, n]) => h('option', { value: v, selected: s[key] === v ? true : null }, n)));
    sel.onchange = () => { s[key] = sel.value; save(); after && after(); };
    return h('div', { class: 'set-row' }, h('span', {}, label), sel);
  };
  const liteRow = (() => {
    const c = h('input', { type: 'checkbox' }); c.checked = !!s.lite;
    c.onchange = async () => { s.lite = c.checked; if (c.checked) s.shadows = false; save(); if (await confirmBox('軽量化モードの切り替えは再読み込みで反映されます。今すぐ再読み込みしますか？（進行は保存されます）', '再読み込み')) app.reload(); };
    return h('label', { class: 'set-row' }, h('span', {}, '🪶 軽量化モード（古い端末向け）'), h('span', { class: 'switch' }, c, h('i')));
  })();
  const fileInp = h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
  fileInp.onchange = async () => {
    const f = fileInp.files[0]; if (!f) return;
    try { await saveCustom(f); s.bgm = 'custom'; save(); app.music.current = null; app.music.play('custom'); toast('自分の曲をBGMにしました', 'ok'); m.close(); app.reopenSettings(inGame); }
    catch (e) { toast('曲を保存できませんでした', 'err'); }
  };
  const p = app.profile;
  const body = [
    h('h3', {}, '🖥 グラフィック'),
    liteRow,
    sw('ultra', '✨ 最高画質（原作に近い陰影・光のにじみ／PC・高性能端末向け）', () => { if (s.lite && s.ultra) toast('軽量化モードをオフにすると使えます', 'warn'); }),
    sw('shadows', '影を表示', () => { if (s.lite) toast('軽量化モード中は影が出ません', 'warn'); }),
    slider('res', '描画解像度', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    slider('fov', '視野角', 55, 90, 1, (v) => v + '°'),
    sw('names', '名前を表示'),
    h('h3', {}, '🎮 操作'),
    slider('sens', '視点感度', 0.2, 3, 0.05, (v) => v.toFixed(2)),
    sw('invertY', '上下反転'),
    select('cam', 'カメラ', [['first', '一人称（おすすめ）'], ['third', '三人称（後ろから）']]),
    select('touchUI', 'タッチボタン', [['auto', '自動'], ['on', '常に表示'], ['off', '表示しない']], () => app.input.layout()),
    slider('btnScale', 'ボタンサイズ', 0.6, 1.6, 0.05, (v) => Math.round(v * 100) + '%'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => { m.close(); app.editLayout(() => app.reopenSettings(inGame)); } }, '✋ ボタン配置を編集'),
      h('button', { class: 'btn small ghost', onclick: () => { app.input.resetLayout(); save(); toast('配置を初期化しました'); } }, '↺ 配置リセット')),
    h('h3', {}, '🎵 サウンド'),
    select('bgm', 'BGM', [...TRACKS.map((t) => [t.id, `${t.name}（${t.mood}）`]), ['custom', '📁 自分の曲'], ['off', 'なし']], () => app.music.play(s.bgm)),
    h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => fileInp.click() }, '📁 端末の曲を選ぶ'), fileInp),
    slider('bgmVol', 'BGM音量', 0, 1, 0.05, (v) => Math.round(v * 100)),
    slider('sfxVol', '効果音', 0, 1, 0.05, (v) => Math.round(v * 100)),
    h('p', { class: 'muted small' }, '🔊 BGMと効果音はいっしょに鳴ります。ゲームの中だけで鳴るので、ダイナミックアイランドやロック画面には表示されません。'),
    sw('silentPlay', 'マナーモード中も音を出す', () => app.music.play(s.bgm)),
    h('p', { class: 'muted small' }, '※ アプリを閉じたり画面をロックしたりすると、BGMと効果音は止まります（戻ると続きから流れます）。'),
    h('h3', {}, '💾 データ'),
    p ? h('div', { class: 'set-row' }, h('span', {}, '引き継ぎコード'), h('b', { class: 'mono' }, formatCode(p.code))) : null,
    p ? h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => { const r = await app.syncNow(); toast(r.ok ? '同期しました' : '同期できません：' + r.reason, r.ok ? 'ok' : 'warn'); } }, '☁ 今すぐ同期'),
      h('button', { class: 'btn small ghost', onclick: () => copyText(formatCode(p.code)) }, '📋 コードをコピー')) : null,
  ];
  const m = modal('⚙️ 設定', body, { wide: true, onClose });
  return m;
}

// ---------- キャラメイク ----------
export function showEditor(app, first, onDone) {
  const av = sanitizeAvatar(app.profile.av);
  const preview = () => app.setPreviewAvatar(av);
  let tab = 'hat';
  const panel = h('div', { class: 'ed-panel' });
  const tabs = h('div', { class: 'tabs scroll' });
  const TABS = [['hat', '🎩 被り物'], ['face', '😊 顔'], ['hair', '💇 髪'], ['acc', '🕶 アクセ'], ['top', '👕 上'], ['bottom', '👖 下'], ['body', '🧍 体']];
  const swatches = (key, cols) => h('div', { class: 'swatches' }, cols.map((c) => h('button', { class: 'sw' + (av[key] === c ? ' on' : ''), style: { background: c }, onclick: () => { av[key] = c; preview(); draw(); } })));
  const opts = (key, list, withIcon) => h('div', { class: 'opts' + (withIcon ? ' icons' : '') }, list.map((o) => h('button', { class: 'opt' + (av[key] === o[0] ? ' on' : ''), onclick: () => { av[key] = o[0]; preview(); draw(); } }, withIcon ? h('span', { class: 'oi' }, o[2]) : null, h('span', {}, o[1]))));
  const draw = () => {
    tabs.innerHTML = '';
    for (const [k, n] of TABS) tabs.append(h('button', { class: 'tab' + (k === tab ? ' on' : ''), onclick: () => { tab = k; draw(); } }, n));
    panel.innerHTML = '';
    const L = (t) => h('div', { class: 'ed-label' }, t);
    switch (tab) {
      case 'hat': panel.append(L('被り物（' + (OPT.hat.length - 1) + '種類）'), opts('hat', OPT.hat, true), L('帽子の色'), swatches('hatColor', CLOTH_COLORS)); break;
      case 'face': {
        const bl = h('input', { type: 'checkbox' }); bl.checked = av.blush; bl.onchange = () => { av.blush = bl.checked; preview(); };
        panel.append(L('目'), opts('eyes', OPT.eyes), L('目の色'), swatches('eyeColor', EYE_COLORS), L('口'), opts('mouth', OPT.mouth), L('まゆげ'), opts('brow', OPT.brow), h('label', { class: 'chk' }, bl, ' ほっぺ'), L('肌の色'), swatches('skin', SKINS)); break;
      }
      case 'hair': panel.append(L('髪型'), opts('hair', OPT.hair), L('髪の色'), swatches('hairColor', HAIR_COLORS)); break;
      case 'acc': panel.append(L('アクセサリー'), opts('acc', OPT.acc)); break;
      case 'top': panel.append(L('トップス'), opts('top', OPT.top), L('色'), swatches('topColor', CLOTH_COLORS)); break;
      case 'bottom': panel.append(L('ボトムス'), opts('bottom', OPT.bottom), L('色'), swatches('bottomColor', CLOTH_COLORS), L('くつの色'), swatches('shoeColor', CLOTH_COLORS)); break;
      case 'body': {
        const r = h('input', { type: 'range', min: 0.88, max: 1.12, step: 0.01, value: av.height });
        r.oninput = () => { av.height = +r.value; preview(); };
        panel.append(L('身長'), r); break;
      }
    }
  };
  const done = () => { app.profile.av = sanitizeAvatar(av); app.saveLocal(); app.syncNow(); onDone && onDone(); };
  screen('editor',
    h('div', { class: 'ed-top' }, h('h2', {}, '🎨 キャラメイク'), h('div', { class: 'muted small' }, 'ドラッグで回転')),
    h('div', { class: 'ed-sheet card' }, tabs, panel,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => { Object.assign(av, randomAvatar((Math.random() * 1e9) | 0, { hatChance: 0.8 })); preview(); draw(); } }, '🎲 ランダム'),
        h('button', { class: 'btn', onclick: done }, first ? '決定してはじめる ▶' : '保存'))));
  draw(); preview();
}
export { escapeText };
