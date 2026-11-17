// ===== ゲームデータ定義（three.js 非依存） =====
export const CELL = 0.5;
// ---------- 店舗レイアウト（原作風：5m区画を少しずつ買い足して広げる） ----------
export const BAY = 5;
export const SALES = { x0: -25, z0: 6, cols: 10, rows: 4 }; // 売り場区画 b{列}{行}  行0=通り側（幅50m×奥行20m・最大40区画）
export const BACK_Z = -14;    // 売り場と倉庫の境目（売り場は奥へ4列まで広がる）
export const STOCK_MID_Z = -18; // 倉庫の手前の列と奥の列の境目
export const STOCK_Z = -22;   // 倉庫の奥の壁（倉庫は手前4m＋奥4mの2列・最大で奥行き8m）
export const OLD_STOCK_Z = -22; // v8 までの倉庫の奥の壁（セーブ移行用）
export const V12_STOCK_Z = -30; // v9〜v12（倉庫が奥行き16mだったころ）の奥の壁（セーブ移行用）
// 倉庫の区画：横5列×縦2列（r=0 手前＝売り場側に出入口あり／r=1 奥）。c は左から 0〜4
export const STOCK_SECTIONS = [
  { id: 'st4', name: '倉庫A', c: 0, r: 0, x0: -25, x1: -15, door: [-23, -21] },
  { id: 'st2', name: '倉庫B', c: 1, r: 0, x0: -15, x1: -5, door: [-13, -11] },
  { id: 'st0', name: '倉庫C', c: 2, r: 0, x0: -5, x1: 5, door: [2, 4] },
  { id: 'st1', name: '倉庫D', c: 3, r: 0, x0: 5, x1: 15, door: [11, 13] },
  { id: 'st3', name: '倉庫E', c: 4, r: 0, x0: 15, x1: 25, door: [21, 23] },
  { id: 'sb4', name: '倉庫A奥', c: 0, r: 1, x0: -25, x1: -15 },
  { id: 'sb2', name: '倉庫B奥', c: 1, r: 1, x0: -15, x1: -5 },
  { id: 'sb0', name: '倉庫C奥', c: 2, r: 1, x0: -5, x1: 5 },
  { id: 'sb1', name: '倉庫D奥', c: 3, r: 1, x0: 5, x1: 15 },
  { id: 'sb3', name: '倉庫E奥', c: 4, r: 1, x0: 15, x1: 25 },
];
for (const s of STOCK_SECTIONS) { s.z1 = s.r === 0 ? BACK_Z : STOCK_MID_Z; s.z0 = s.r === 0 ? STOCK_MID_Z : STOCK_Z; }
export const STOCK_COLS = 5, STOCK_ROWS = 2;
export const stockAt = (c, r) => STOCK_SECTIONS.find((s) => s.c === c && s.r === r);
export const STOCK_ORDER = ['st4', 'st2', 'st0', 'st1', 'st3']; // 手前の列・左から順
export const MANAGER = { x0: -5, x1: 0, z0: -27.5, z1: -22, door: [-3.6, -2.1] };
export const DOCK = { x0: 0.6, x1: 4.6, z: -22 };
export const DOOR = { x: 0, z: 6, half: 1.2 };
export const BUILDING = { minX: -25, maxX: 25, minZ: -22, maxZ: 6 };
// 最初から使える売り場：手前の 20m×10m（8区画）＋倉庫へつながる真ん中の奥 10m×10m（4区画）。
// そこから左右にも奥にも1区画ずつ広げられる
export const START_BAYS = ['b30', 'b31', 'b40', 'b41', 'b50', 'b51', 'b60', 'b61', 'b42', 'b43', 'b52', 'b53'];
export const OLD_BACK_Z = -4; // v7 までの売り場の奥（セーブ移行用）
export const START_STOCK = ['st0', 'sb0']; // 真ん中の倉庫（手前＋奥）。奥の壁にマネージャー室と搬入口
export const NAV_BOUNDS = { minX: -32, maxX: 32, minZ: -29, maxZ: 14 };
export const PLAYER_BOUNDS = { minX: -33, maxX: 33, minZ: -34, maxZ: 17 };
export const SPAWN_POINTS = [[-27.5, 8.2], [27.5, 8.2], [-27.5, 7.4], [27.5, 7.4]];
export const PLAYER_SPAWN = [0, 3.6];
export const DELIVERY_AREA = { minX: 2.2, maxX: 7.2, minZ: 10.4, maxZ: 13.0 }; // 店の前の駐車場（空から箱が降ってくる）
// 発注：1回の配達で運べるのは段ボール最大10箱、送料は1回1000円（固定）
export const ORDER_MAX_BOXES = 10;
export const SHIPPING_FEE = 1000;
export const OPEN_TIME = 8 * 60;
export const CLOSE_TIME = 22 * 60;
export const GAME_MIN_PER_SEC = 1.7;

export function bayRect(id) {
  const c = +id[1], r = +id[2];
  const x0 = SALES.x0 + c * BAY, z1 = SALES.z0 - r * BAY;
  return { id, c, r, minX: x0, maxX: x0 + BAY, minZ: z1 - BAY, maxZ: z1, kind: 'sales' };
}
export const ALL_BAYS = [];
for (let r = 0; r < SALES.rows; r++) for (let c = 0; c < SALES.cols; c++) ALL_BAYS.push('b' + c + r);
export function bayAt(x, z) {
  const c = Math.floor((x - SALES.x0) / BAY), r = Math.floor((SALES.z0 - z) / BAY);
  if (c < 0 || c >= SALES.cols || r < 0 || r >= SALES.rows) return null;
  return 'b' + c + r;
}
export function stockRect(sec) { return { id: sec.id, minX: sec.x0, maxX: sec.x1, minZ: sec.z0, maxZ: sec.z1, kind: 'storage' }; }
// 使える区画の一覧（配置判定・経路探索用）
export function zones(store) {
  const out = [];
  for (const id of ALL_BAYS) if (store.bays?.[id]) out.push(bayRect(id));
  for (const s of STOCK_SECTIONS) if (store.stock?.[s.id]) out.push(stockRect(s));
  out.push({ id: 'mgr', minX: MANAGER.x0, maxX: MANAGER.x1, minZ: MANAGER.z0, maxZ: MANAGER.z1, kind: 'office' });
  return out;
}
export function expandTargets(store) {
  const out = [];
  for (const id of ALL_BAYS) {
    if (store.bays?.[id]) continue;
    const { c, r } = bayRect(id);
    const nb = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].some(([a, b]) => store.bays?.['b' + a + b]);
    out.push({ id, kind: 'bay', can: nb, cost: expandCost(store, id) });
  }
  // 倉庫も今ある倉庫のとなり（左右・手前と奥）から
  for (const s of STOCK_SECTIONS) {
    if (store.stock?.[s.id]) continue;
    const nb = [[s.c - 1, s.r], [s.c + 1, s.r], [s.c, 1 - s.r]].some(([c, r]) => { const o = stockAt(c, r); return o && store.stock?.[o.id]; });
    out.push({ id: s.id, kind: 'stock', can: nb, cost: expandCost(store, s.id), name: s.name });
  }
  return out;
}
export function expandCost(store, id) {
  if (id.startsWith('b')) { const n = Math.max(0, Object.keys(store.bays || {}).length - START_BAYS.length); return Math.round(15000 * Math.pow(1.14, n) / 500) * 500; }
  const n = Math.max(0, Object.keys(store.stock || {}).length - START_STOCK.length); return Math.round(30000 * Math.pow(1.3, n) / 500) * 500;
}
// 置けない場所（入口・通路・荷受け場の確保）
export function keepClear(store) {
  const k = [
    { minX: -1.7, maxX: 1.7, minZ: 4.0, maxZ: 6 },
    { minX: MANAGER.door[0] - 0.4, maxX: MANAGER.door[1] + 0.4, minZ: STOCK_Z, maxZ: STOCK_Z + 1.3 },
  ];
  for (const s of STOCK_SECTIONS) if (s.door) k.push({ minX: s.door[0] - 0.4, maxX: s.door[1] + 0.4, minZ: BACK_Z - 1.2, maxZ: BACK_Z + 1.2 });
  k.push({ minX: DOCK.x0 - 0.2, maxX: DOCK.x1 + 0.2, minZ: STOCK_Z, maxZ: STOCK_Z + 1.2 }); // 搬入口
  return k;
}

// 壁（矩形の当たり判定）。type: front=ガラス正面, outer=外壁, inner=倉庫仕切り, part=未購入区画の仮壁, pillar=柱
export function getWalls(store) {
  const T = 0.12, w = [];
  const bays = store?.bays || {}, stock = store?.stock || {};
  const H = (x0, x1, z, type) => { if (x1 - x0 > 0.01) w.push({ minX: x0, maxX: x1, minZ: z - T, maxZ: z + T, type, axis: 'x' }); };
  const V = (z0, z1, x, type) => { if (z1 - z0 > 0.01) w.push({ minX: x - T, maxX: x + T, minZ: z0, maxZ: z1, type, axis: 'z' }); };
  const L = BUILDING.minX, R = BUILDING.maxX;
  H(L, -DOOR.half, 6, 'front'); H(DOOR.half, R, 6, 'front');
  V(STOCK_Z, 6, L, 'outer'); V(STOCK_Z, 6, R, 'outer');
  H(L, MANAGER.door[0], STOCK_Z, 'outer'); H(MANAGER.door[1], DOCK.x0, STOCK_Z, 'outer'); H(DOCK.x1, R, STOCK_Z, 'outer');
  V(MANAGER.z0, MANAGER.z1, MANAGER.x0, 'outer'); V(MANAGER.z0, MANAGER.z1, MANAGER.x1, 'outer'); H(MANAGER.x0, MANAGER.x1, MANAGER.z0, 'outer');
  // 売り場と倉庫の境（両側が使えるときだけ出入口が開く）
  const gaps = STOCK_SECTIONS.filter((s) => s.door && stock[s.id] && bays[bayAt((s.door[0] + s.door[1]) / 2, BACK_Z + 1)]).map((s) => s.door).sort((a, b) => a[0] - b[0]);
  let x = L;
  for (const [g0, g1] of gaps) { H(x, g0, BACK_Z, 'inner'); x = g1; }
  H(x, R, BACK_Z, 'inner');
  // 未購入の売り場区画との仕切り
  for (const id of ALL_BAYS) {
    if (!bays[id]) continue;
    const b = bayRect(id);
    if (b.c > 0 && !bays['b' + (b.c - 1) + b.r]) V(b.minZ, b.maxZ, b.minX, 'part');
    if (b.c < SALES.cols - 1 && !bays['b' + (b.c + 1) + b.r]) V(b.minZ, b.maxZ, b.maxX, 'part');
    if (b.r < SALES.rows - 1 && !bays['b' + b.c + (b.r + 1)]) H(b.minX, b.maxX, b.minZ, 'part'); // 奥が未購入
    if (b.r > 0 && !bays['b' + b.c + (b.r - 1)]) H(b.minX, b.maxX, b.maxZ, 'part');               // 手前が未購入
  }
  // 倉庫どうしの仕切り（使える倉庫と使えない倉庫の境目）
  for (const s of STOCK_SECTIONS) {
    const right = stockAt(s.c + 1, s.r);
    if (right && !!stock[s.id] !== !!stock[right.id]) V(s.z0, s.z1, s.x1, 'part');
    const back = stockAt(s.c, s.r + 1);
    if (back && !!stock[s.id] !== !!stock[back.id]) H(s.x0, s.x1, s.z0, 'part');
  }
  // 区画の境目の柱
  for (let i = 1; i < SALES.cols; i++) for (let j = 1; j < SALES.rows; j++) {
    const px = SALES.x0 + i * BAY, pz = SALES.z0 - j * BAY;
    const near = ['b' + (i - 1) + (j - 1), 'b' + i + (j - 1), 'b' + (i - 1) + j, 'b' + i + j].some((id) => bays[id]);
    if (near) w.push({ minX: px - 0.22, maxX: px + 0.22, minZ: pz - 0.22, maxZ: pz + 0.22, type: 'pillar', x: px, z: pz });
  }
  return w;
}

// ---------- 商品 ----------
// place: 置ける棚の種類 / size: [幅,高さ,奥行] / stack: 積み段数 / bx: 箱サイズ
export const CATEGORIES = {
  food: { name: '食品', icon: '🥫' }, drink: { name: '飲料', icon: '🥤' }, chilled: { name: '冷蔵', icon: '🥛' },
  frozen: { name: '冷凍', icon: '🧊' }, produce: { name: '青果', icon: '🍎' }, bakery: { name: 'パン', icon: '🍞' },
  house: { name: '日用品', icon: '🧴' }, premium: { name: '高級品', icon: '💎' },
};
const P = (id, name, cat, place, cost, price, qty, size, max, stack, bx, icon, color, lic) =>
  ({ id, name, cat, place, cost, price, qty, size, max, stack, bx, icon, color, lic });
// lic = 解放に必要なスキルボードの商品ノード
export const PRODUCTS_LIST = [
  // 食品
  P('soup', '缶スープ', 'food', ['dry'], 90, 150, 24, [0.08, 0.11, 0.08], 20, 2, 'm', '🥫', '#d63b2f', 'prod_food1'),
  P('tuna', 'ツナ缶', 'food', ['dry'], 80, 130, 24, [0.09, 0.045, 0.09], 24, 3, 's', '🐟', '#2f7fd6', 'prod_food1'),
  P('pasta', 'パスタ', 'food', ['dry'], 120, 198, 16, [0.09, 0.26, 0.05], 14, 1, 'm', '🍝', '#f2b705', 'prod_food1'),
  P('chips', 'ポテトチップス', 'food', ['dry'], 90, 148, 16, [0.17, 0.23, 0.07], 10, 1, 'l', '🥔', '#ffc93c', 'prod_food1'),
  P('noodle', 'カップ麺', 'food', ['dry'], 110, 178, 18, [0.11, 0.1, 0.11], 12, 2, 'm', '🍜', '#f4a261', 'prod_food1'),
  P('cookies', 'クッキー', 'food', ['dry'], 150, 248, 16, [0.15, 0.06, 0.1], 12, 3, 'm', '🍪', '#8a5a3c', 'prod_food1'),
  P('cereal', 'シリアル', 'food', ['dry'], 250, 398, 10, [0.19, 0.28, 0.07], 8, 1, 'l', '🥣', '#ff7a29', 'prod_food2'),
  P('ketchup', 'ケチャップ', 'food', ['dry'], 140, 228, 16, [0.07, 0.19, 0.05], 14, 1, 'm', '🍅', '#c8102e', 'prod_food2'),
  P('jam', 'いちごジャム', 'food', ['dry'], 220, 348, 12, [0.08, 0.1, 0.08], 14, 2, 's', '🍓', '#e0245e', 'prod_food2'),
  P('rice', 'お米 5kg', 'food', ['dry'], 1400, 2180, 6, [0.25, 0.34, 0.12], 4, 1, 'l', '🍚', '#d8c99b', 'prod_food2'),
  P('curry', 'カレールー', 'food', ['dry'], 160, 258, 20, [0.17, 0.1, 0.04], 16, 2, 's', '🍛', '#c97b1a', 'prod_food3'),
  P('honey', 'はちみつ', 'food', ['dry'], 300, 480, 12, [0.07, 0.16, 0.07], 12, 1, 'm', '🍯', '#e8a317', 'prod_food3'),
  P('flour', '小麦粉', 'food', ['dry'], 140, 228, 12, [0.13, 0.22, 0.07], 10, 1, 'm', '🌾', '#3d7cc9', 'prod_food4'),
  P('sugar', '上白糖', 'food', ['dry'], 120, 198, 12, [0.12, 0.18, 0.06], 10, 1, 'm', '🍬', '#e85d9a', 'prod_food4'),
  P('oil', 'サラダ油', 'food', ['dry'], 260, 398, 12, [0.08, 0.25, 0.06], 10, 1, 'm', '🫒', '#d4a017', 'prod_food4'),
  // 飲料
  P('water', '天然水', 'drink', ['dry', 'chilled'], 60, 108, 24, [0.07, 0.23, 0.07], 15, 1, 'm', '💧', '#4cc9f0', 'prod_drink1'),
  P('tea', '緑茶', 'drink', ['dry', 'chilled'], 70, 128, 24, [0.07, 0.23, 0.07], 15, 1, 'm', '🍵', '#40916c', 'prod_drink1'),
  P('coffee', '缶コーヒー', 'drink', ['dry', 'chilled'], 60, 118, 30, [0.06, 0.12, 0.06], 20, 2, 's', '☕', '#6f4e37', 'prod_drink1'),
  P('soda', 'ポップソーダ', 'drink', ['dry', 'chilled'], 90, 158, 24, [0.07, 0.25, 0.07], 15, 1, 'm', '🥤', '#e63946', 'prod_drink2'),
  P('ojuice', 'オレンジジュース', 'drink', ['dry', 'chilled'], 130, 218, 12, [0.08, 0.21, 0.08], 12, 1, 'm', '🍊', '#ff9f1c', 'prod_drink2'),
  P('energy', 'エナジードリンク', 'drink', ['dry', 'chilled'], 120, 208, 24, [0.06, 0.16, 0.06], 20, 1, 's', '⚡', '#1b998b', 'prod_drink2'),
  // 冷蔵
  P('milk', '牛乳', 'chilled', ['chilled'], 140, 228, 12, [0.08, 0.21, 0.08], 12, 1, 'm', '🥛', '#2b6cb0', 'prod_chilled1'),
  P('yogurt', 'ヨーグルト', 'chilled', ['chilled'], 70, 128, 24, [0.08, 0.07, 0.08], 20, 2, 's', '🍶', '#f78fb3', 'prod_chilled1'),
  P('eggs', 'たまご', 'chilled', ['chilled'], 160, 258, 12, [0.18, 0.07, 0.1], 10, 2, 'm', '🥚', '#e9d8a6', 'prod_chilled1'),
  P('cheese', 'チーズ', 'chilled', ['chilled'], 280, 448, 12, [0.12, 0.07, 0.1], 12, 2, 's', '🧀', '#ffcb47', 'prod_chilled2'),
  P('sausage', 'ソーセージ', 'chilled', ['chilled'], 200, 328, 12, [0.16, 0.04, 0.1], 12, 3, 's', '🌭', '#c0392b', 'prod_chilled2'),
  P('tofu', '絹ごし豆腐', 'chilled', ['chilled'], 50, 98, 20, [0.11, 0.05, 0.09], 16, 2, 's', '🥢', '#4a7fb5', 'prod_chilled2'),
  P('natto', '納豆3パック', 'chilled', ['chilled'], 60, 98, 20, [0.1, 0.08, 0.1], 16, 2, 's', '🫘', '#b5651d', 'prod_chilled2'),
  // 冷凍
  P('pudding', 'プリン3個', 'chilled', ['chilled'], 90, 158, 18, [0.14, 0.07, 0.07], 16, 2, 's', '🍮', '#e9a23b', 'prod_chilled1'),
  P('sushi', 'にぎり寿司', 'chilled', ['chilled'], 420, 698, 8, [0.2, 0.05, 0.13], 10, 2, 'm', '🍣', '#1d3557', 'prod_chilled3'),
  P('salad', 'カットサラダ', 'chilled', ['chilled'], 110, 198, 12, [0.15, 0.06, 0.12], 12, 2, 's', '🥗', '#52b788', 'prod_chilled3'),
  P('butter', 'バター', 'chilled', ['chilled'], 280, 458, 16, [0.12, 0.05, 0.07], 16, 3, 's', '🧈', '#f6d365', 'prod_chilled3'),
  P('kakigori', 'かき氷カップ', 'frozen', ['frozen'], 90, 158, 16, [0.09, 0.09, 0.09], 20, 2, 's', '🍧', '#4cc9f0', 'prod_frozen1'),
  P('udon', '冷凍うどん5玉', 'frozen', ['frozen'], 190, 318, 10, [0.2, 0.05, 0.26], 12, 4, 'm', '🍜', '#f1e3c6', 'prod_frozen3'),
  P('karaage', '冷凍からあげ', 'frozen', ['frozen'], 260, 428, 10, [0.18, 0.05, 0.25], 12, 4, 'm', '🍗', '#d97706', 'prod_frozen3'),
  P('shrimp', '冷凍えび', 'frozen', ['frozen'], 480, 798, 8, [0.18, 0.045, 0.22], 10, 4, 'm', '🦐', '#e85d5d', 'prod_frozen3'),
  P('icecream', 'アイスクリーム', 'frozen', ['frozen'], 220, 358, 12, [0.12, 0.1, 0.12], 18, 2, 'm', '🍨', '#ff8fab', 'prod_frozen1'),
  P('pizza', '冷凍ピザ', 'frozen', ['frozen'], 380, 598, 8, [0.25, 0.045, 0.25], 12, 4, 'l', '🍕', '#e76f51', 'prod_frozen1'),
  P('gyoza', '冷凍ぎょうざ', 'frozen', ['frozen'], 200, 328, 10, [0.18, 0.04, 0.24], 14, 4, 'm', '🥟', '#f4e3b2', 'prod_frozen2'),
  P('fries', '冷凍ポテト', 'frozen', ['frozen'], 180, 298, 10, [0.2, 0.05, 0.27], 12, 4, 'm', '🍟', '#d62828', 'prod_frozen2'),
  P('icebar', 'アイスバー6本', 'frozen', ['frozen'], 200, 328, 12, [0.18, 0.05, 0.12], 16, 3, 'm', '🍦', '#4cc9f0', 'prod_frozen2'),
  // 青果
  P('apple', 'りんご', 'produce', ['produce'], 70, 128, 30, [0.09, 0.09, 0.09], 24, 2, 'm', '🍎', '#d62828', 'prod_produce1'),
  P('banana', 'バナナ', 'produce', ['produce'], 100, 178, 16, [0.2, 0.08, 0.13], 10, 2, 'm', '🍌', '#ffd60a', 'prod_produce1'),
  P('carrot', 'にんじん', 'produce', ['produce'], 30, 68, 30, [0.045, 0.045, 0.2], 24, 2, 'm', '🥕', '#f77f00', 'prod_produce1'),
  P('tomato', 'トマト', 'produce', ['produce'], 60, 108, 30, [0.08, 0.07, 0.08], 24, 2, 'm', '🍅', '#e63946', 'prod_produce1'),
  P('cabbage', 'キャベツ', 'produce', ['produce'], 120, 198, 10, [0.17, 0.15, 0.17], 8, 1, 'l', '🥬', '#95d5b2', 'prod_produce2'),
  P('onion', '玉ねぎ', 'produce', ['produce'], 30, 58, 30, [0.08, 0.08, 0.08], 24, 2, 'm', '🧅', '#c98b4a', 'prod_produce2'),
  P('potato', 'じゃがいも', 'produce', ['produce'], 30, 48, 30, [0.09, 0.06, 0.07], 24, 2, 'm', '🥔', '#b08654', 'prod_produce2'),
  P('watermelon', 'スイカ', 'produce', ['produce'], 900, 1480, 4, [0.27, 0.25, 0.27], 6, 1, 'l', '🍉', '#2d6a4f', 'prod_produce3'),
  P('grapes', 'ぶどう', 'produce', ['produce'], 300, 498, 10, [0.12, 0.15, 0.1], 8, 1, 'm', '🍇', '#6a2c70', 'prod_produce3'),
  P('pineapple', 'パイナップル', 'produce', ['produce'], 280, 450, 8, [0.13, 0.3, 0.13], 6, 1, 'l', '🍍', '#e0a526', 'prod_produce3'),
  P('pumpkin', 'かぼちゃ', 'produce', ['produce'], 250, 398, 6, [0.2, 0.15, 0.2], 6, 1, 'l', '🎃', '#2f5d34', 'prod_produce3'),
  // パン
  P('bread', '食パン', 'bakery', ['bakery', 'dry'], 130, 208, 10, [0.13, 0.13, 0.22], 8, 1, 'm', '🍞', '#e9c46a', 'prod_bakery1'),
  P('croissant', 'クロワッサン', 'bakery', ['bakery', 'dry'], 80, 148, 20, [0.13, 0.06, 0.08], 16, 2, 'm', '🥐', '#d4a373', 'prod_bakery1'),
  P('donut', 'ドーナツ', 'bakery', ['bakery', 'dry'], 70, 128, 20, [0.1, 0.04, 0.1], 16, 2, 's', '🍩', '#ff70a6', 'prod_bakery1'),
  P('melonpan', 'メロンパン', 'bakery', ['bakery', 'dry'], 80, 148, 16, [0.12, 0.065, 0.12], 12, 2, 'm', '🍈', '#e9c46a', 'prod_bakery2'),
  P('baguette', 'フランスパン', 'bakery', ['bakery', 'dry'], 150, 258, 10, [0.42, 0.065, 0.075], 8, 2, 'm', '🥖', '#c68642', 'prod_bakery2'),
  // 日用品
  P('tissue', 'ティッシュ', 'house', ['dry'], 180, 298, 10, [0.24, 0.1, 0.12], 8, 3, 'l', '🤧', '#8ecae6', 'prod_house1'),
  P('tp', 'トイレットペーパー', 'house', ['dry'], 250, 398, 8, [0.23, 0.12, 0.23], 6, 2, 'l', '🧻', '#a8dadc', 'prod_house1'),
  P('toothpaste', '歯みがき粉', 'house', ['dry'], 120, 198, 20, [0.18, 0.04, 0.045], 15, 3, 's', '🪥', '#00b4d8', 'prod_house1'),
  P('detergent', '洗剤', 'house', ['dry'], 260, 428, 8, [0.14, 0.26, 0.09], 8, 1, 'l', '🫧', '#3a86ff', 'prod_house2'),
  P('shampoo', 'シャンプー', 'house', ['dry'], 300, 498, 12, [0.08, 0.24, 0.05], 10, 1, 'm', '🧴', '#9b5de5', 'prod_house2'),
  P('sponge', 'スポンジ3個', 'house', ['dry'], 90, 158, 20, [0.12, 0.05, 0.09], 16, 3, 's', '🧽', '#f9c74f', 'prod_house2'),
  // 高級品
  P('wine', 'ワイン', 'premium', ['dry', 'chilled'], 1200, 1980, 6, [0.08, 0.33, 0.08], 8, 1, 'l', '🍷', '#7b2cbf', 'prod_premium'),
  P('choco', '高級チョコ', 'premium', ['dry'], 800, 1280, 10, [0.16, 0.04, 0.12], 12, 3, 's', '🍫', '#5c2c1d', 'prod_premium'),
  P('wagyu', '和牛', 'premium', ['chilled'], 2400, 3980, 6, [0.2, 0.045, 0.14], 8, 2, 'm', '🥩', '#b5179e', 'prod_premium'),
  // v5 追加
  P('candy', 'キャンディ', 'food', ['dry'], 60, 108, 24, [0.12, 0.17, 0.04], 20, 1, 's', '🍬', '#ff70a6', 'prod_food1'),
  P('senbei', 'おせんべい', 'food', ['dry'], 110, 198, 16, [0.15, 0.22, 0.06], 12, 1, 'm', '🍘', '#a0522d', 'prod_food2'),
  P('mayo', 'マヨネーズ', 'food', ['dry', 'chilled'], 150, 248, 16, [0.07, 0.2, 0.05], 14, 1, 'm', '🥚', '#f2c94c', 'prod_food2'),
  P('soy', 'しょうゆ', 'food', ['dry'], 140, 228, 12, [0.08, 0.24, 0.08], 12, 1, 'm', '🫗', '#5c2c16', 'prod_food3'),
  P('popcorn', 'ポップコーン', 'food', ['dry'], 90, 158, 16, [0.14, 0.24, 0.07], 12, 1, 'l', '🍿', '#e63946', 'prod_food3'),
  P('sports', 'スポーツドリンク', 'drink', ['dry', 'chilled'], 80, 148, 24, [0.07, 0.24, 0.07], 15, 1, 'm', '🧃', '#3a86ff', 'prod_drink1'),
  P('greentea', '緑茶 2L', 'drink', ['dry', 'chilled'], 140, 238, 8, [0.11, 0.32, 0.11], 8, 1, 'l', '🍵', '#2a9d8f', 'prod_drink1'),
  P('beer', 'ビール', 'drink', ['dry', 'chilled'], 160, 268, 24, [0.067, 0.123, 0.067], 24, 2, 'm', '🍺', '#e9c46a', 'prod_drink2'),
  P('battery', '乾電池', 'house', ['dry'], 220, 398, 16, [0.11, 0.17, 0.025], 16, 1, 's', '🔋', '#2b2d42', 'prod_house1'),
  P('mask', 'マスク', 'house', ['dry'], 280, 498, 12, [0.19, 0.1, 0.1], 12, 2, 'm', '😷', '#a8dadc', 'prod_house1'),
  P('trashbag', 'ゴミ袋', 'house', ['dry'], 160, 278, 12, [0.15, 0.04, 0.22], 12, 3, 'm', '🛍️', '#6c757d', 'prod_house2'),
  P('anpan', 'あんパン', 'bakery', ['bakery'], 70, 138, 16, [0.12, 0.05, 0.12], 12, 2, 'm', '🍞', '#b5651d', 'prod_bakery1'),
  P('sandwich', 'サンドイッチ', 'bakery', ['bakery', 'chilled'], 160, 298, 12, [0.13, 0.12, 0.07], 10, 1, 'm', '🥪', '#f4a261', 'prod_bakery2'),
  P('strawberry', 'いちご', 'produce', ['produce', 'chilled'], 380, 598, 12, [0.15, 0.06, 0.1], 10, 2, 'm', '🍓', '#e63946', 'prod_produce2'),
  P('cucumber', 'きゅうり', 'produce', ['produce'], 30, 58, 30, [0.035, 0.035, 0.22], 24, 2, 'm', '🥒', '#2d6a4f', 'prod_produce1'),
  P('lemon', 'レモン', 'produce', ['produce'], 60, 98, 30, [0.065, 0.07, 0.065], 24, 2, 'm', '🍋', '#ffd60a', 'prod_produce3'),
  P('ham', 'ロースハム', 'chilled', ['chilled'], 200, 348, 16, [0.15, 0.03, 0.12], 16, 3, 's', '🥓', '#ff8fa3', 'prod_chilled2'),
  P('kimchi', 'キムチ', 'chilled', ['chilled'], 220, 378, 12, [0.11, 0.08, 0.11], 12, 2, 's', '🌶️', '#d62828', 'prod_chilled3'),
  // v6 追加（レベルが上がると解放）
  P('ramen', '袋ラーメン5食', 'food', ['dry'], 280, 458, 12, [0.2, 0.06, 0.14], 12, 3, 'm', '🍜', '#e76f51', 'prod_food5'),
  P('furikake', 'ふりかけ', 'food', ['dry'], 90, 158, 24, [0.1, 0.15, 0.03], 20, 1, 's', '🍚', '#9b5de5', 'prod_food5'),
  P('gummy', 'グミ', 'food', ['dry'], 70, 128, 24, [0.12, 0.15, 0.03], 20, 1, 's', '🍬', '#00bbf9', 'prod_food5'),
  P('peanut', 'ピーナッツ', 'food', ['dry'], 120, 218, 16, [0.13, 0.2, 0.05], 12, 1, 'm', '🥜', '#c9a227', 'prod_food5'),
  P('retort', 'レトルトカレー', 'food', ['dry'], 130, 228, 24, [0.15, 0.2, 0.03], 20, 1, 'm', '🍛', '#f4a261', 'prod_food5'),
  P('cola', 'コーラ', 'drink', ['dry', 'chilled'], 90, 158, 24, [0.07, 0.25, 0.07], 15, 1, 'm', '🥤', '#b5121b', 'prod_drink3'),
  P('milktea', 'ミルクティー', 'drink', ['dry', 'chilled'], 90, 158, 24, [0.07, 0.23, 0.07], 15, 1, 'm', '🧋', '#c8a27a', 'prod_drink3'),
  P('sparkling', '炭酸水', 'drink', ['dry', 'chilled'], 70, 118, 24, [0.07, 0.24, 0.07], 15, 1, 'm', '🫧', '#90e0ef', 'prod_drink3'),
  P('highball', 'ハイボール缶', 'drink', ['dry', 'chilled'], 140, 228, 24, [0.067, 0.123, 0.067], 24, 2, 'm', '🥃', '#8d5a2b', 'prod_drink3'),
  P('sake', '日本酒', 'drink', ['dry'], 900, 1480, 6, [0.09, 0.36, 0.09], 6, 1, 'l', '🍶', '#1d3557', 'prod_drink4'),
  P('champagne', 'スパークリングワイン', 'drink', ['dry', 'chilled'], 1500, 2480, 6, [0.09, 0.32, 0.09], 6, 1, 'l', '🍾', '#2d6a4f', 'prod_drink4'),
  P('onigiri', 'おにぎり', 'chilled', ['chilled'], 70, 138, 24, [0.1, 0.1, 0.04], 20, 1, 's', '🍙', '#2b2d42', 'prod_chilled4'),
  P('bento', 'お弁当', 'chilled', ['chilled'], 320, 548, 10, [0.22, 0.06, 0.16], 10, 2, 'm', '🍱', '#d62828', 'prod_chilled4'),
  P('cream', '生クリーム', 'chilled', ['chilled'], 220, 368, 16, [0.07, 0.12, 0.05], 16, 1, 's', '🥛', '#ffffff', 'prod_chilled4'),
  P('frozenveg', '冷凍ミックス野菜', 'frozen', ['frozen'], 180, 298, 12, [0.18, 0.04, 0.26], 12, 4, 'm', '🥦', '#2a9d8f', 'prod_frozen4'),
  P('takoyaki', '冷凍たこ焼き', 'frozen', ['frozen'], 240, 398, 12, [0.2, 0.05, 0.25], 12, 4, 'm', '🐙', '#e76f51', 'prod_frozen4'),
  P('mikan', 'みかん', 'produce', ['produce'], 30, 58, 40, [0.06, 0.05, 0.06], 30, 2, 'm', '🍊', '#f77f00', 'prod_produce4'),
  P('broccoli', 'ブロッコリー', 'produce', ['produce'], 100, 178, 16, [0.13, 0.15, 0.13], 12, 1, 'l', '🥦', '#2d6a4f', 'prod_produce4'),
  P('corn', 'とうもろこし', 'produce', ['produce'], 90, 158, 20, [0.06, 0.06, 0.26], 16, 2, 'm', '🌽', '#ffd166', 'prod_produce4'),
  P('eggplant', 'なす', 'produce', ['produce'], 50, 98, 30, [0.06, 0.06, 0.16], 24, 2, 'm', '🍆', '#5a189a', 'prod_produce4'),
  P('peach', 'もも', 'produce', ['produce', 'chilled'], 250, 398, 16, [0.08, 0.08, 0.08], 16, 1, 'm', '🍑', '#ffadad', 'prod_produce5'),
  P('avocado', 'アボカド', 'produce', ['produce'], 90, 158, 24, [0.07, 0.1, 0.07], 20, 1, 'm', '🥑', '#386641', 'prod_produce5'),
  P('mushroom', 'しいたけ', 'produce', ['produce', 'chilled'], 150, 248, 16, [0.14, 0.05, 0.1], 12, 2, 'm', '🍄', '#7f5539', 'prod_produce5'),
  P('currypan', 'カレーパン', 'bakery', ['bakery'], 90, 168, 16, [0.13, 0.06, 0.09], 12, 2, 'm', '🍛', '#c1772f', 'prod_bakery3'),
  P('rollcake', 'ロールケーキ', 'bakery', ['bakery', 'chilled'], 260, 448, 10, [0.2, 0.09, 0.09], 8, 1, 'm', '🍰', '#fff1e6', 'prod_bakery3'),
  P('bagel', 'ベーグル', 'bakery', ['bakery'], 80, 158, 20, [0.11, 0.045, 0.11], 16, 2, 'm', '🥯', '#d4a373', 'prod_bakery3'),
  P('dishsoap', '食器用洗剤', 'house', ['dry'], 130, 218, 16, [0.07, 0.22, 0.05], 14, 1, 'm', '🧴', '#06d6a0', 'prod_house3'),
  P('softener', '柔軟剤', 'house', ['dry'], 280, 458, 8, [0.12, 0.25, 0.08], 8, 1, 'l', '🌸', '#ff70a6', 'prod_house3'),
  P('towel', 'タオル', 'house', ['dry'], 300, 598, 12, [0.2, 0.06, 0.12], 12, 3, 'm', '🧣', '#4cc9f0', 'prod_house3'),
  P('melon', 'マスクメロン', 'premium', ['produce'], 3000, 4980, 4, [0.16, 0.16, 0.16], 4, 1, 'l', '🍈', '#90be6d', 'prod_premium2'),
  P('toro', '大トロ', 'premium', ['chilled'], 2800, 4580, 8, [0.18, 0.035, 0.12], 8, 2, 'm', '🍣', '#ff8fa3', 'prod_premium2'),
];
export const PRODUCTS = Object.fromEntries(PRODUCTS_LIST.map((p) => [p.id, p]));
export const BOX_SIZES = { s: [0.4, 0.22, 0.3], m: [0.5, 0.3, 0.36], l: [0.58, 0.38, 0.42] };

// ---------- 設備 ----------
function shelfSlots(levels, ys, w, d, h, cols, kind, sides = [1], depth = 0.5) {
  const out = [];
  for (const side of sides) for (let l = 0; l < levels; l++) for (let c = 0; c < cols; c++) {
    const sw = w / cols;
    out.push({ x: -w / 2 + sw * (c + 0.5), y: ys[l], z: sides.length > 1 ? side * depth / 4 : 0, w: sw - 0.08, h, d, side, kind });
  }
  return out;
}
const F = (o) => o;
export const FIXTURES = {
  shelf: F({ name: '商品棚', cat: 'shelf', icon: '🗄️', price: 8000, w: 2, d: 0.5, place: 'sales',
    slots: shelfSlots(4, [0.14, 0.55, 0.96, 1.37], 2, 0.42, 0.37, 3, 'dry'), desc: '食品や日用品を並べる基本の棚（4段×3枠）' }),
  gondola: F({ name: '両面ゴンドラ棚', cat: 'shelf', icon: '🏬', price: 15000, w: 2, d: 1, place: 'sales', req: 'fx_gondola',
    slots: shelfSlots(4, [0.14, 0.55, 0.96, 1.37], 2, 0.42, 0.37, 3, 'dry', [1, -1], 1), desc: '両側から取れる大型の棚（24枠）' }),
  lowshelf: F({ name: 'ロー棚', cat: 'shelf', icon: '🛋️', price: 5000, w: 2, d: 0.5, place: 'sales',
    slots: shelfSlots(2, [0.14, 0.55], 2, 0.42, 0.37, 3, 'dry'), desc: '腰の高さの低い棚。店内を見渡せる（6枠）' }),
  endcap: F({ name: 'エンド棚', cat: 'shelf', icon: '🔚', price: 6000, w: 1.25, d: 0.75, place: 'sales', req: 'fx_shelf2',
    slots: shelfSlots(4, [0.14, 0.55, 0.96, 1.37], 1.25, 0.62, 0.37, 2, 'dry'), desc: '通路の端に置くおすすめ棚（8枠）' }),
  wallshelf: F({ name: '壁面ハイ棚', cat: 'shelf', icon: '🧱', price: 12000, w: 2, d: 0.5, place: 'sales', req: 'fx_shelf3',
    slots: shelfSlots(5, [0.14, 0.53, 0.92, 1.31, 1.7], 2, 0.42, 0.35, 3, 'dry'), desc: '壁ぎわに置く背の高い棚（15枠）' }),
  table: F({ name: '平台', cat: 'shelf', icon: '🟫', price: 7000, w: 1.5, d: 1, place: 'sales', req: 'fx_shelf2',
    slots: [-0.36, 0.36].flatMap((x) => [1, -1].map((side) => ({ x, y: 0.78, z: side * 0.24, w: 0.66, h: 0.42, d: 0.44, side, kind: 'dry' }))), desc: '腰の高さの台に山積み。両側から取れる（4枠）' }),
  wagon: F({ name: '特売ワゴン', cat: 'shelf', icon: '🛒', price: 4500, w: 1, d: 0.75, place: 'sales', req: 'fx_shelf2',
    slots: [{ x: 0, y: 0.5, z: 0, w: 0.86, h: 0.3, d: 0.6, side: 1, kind: 'dry', pile: true }], desc: 'キャスター付きの特売カゴ（1枠）' }),
  tiered: F({ name: 'ひな壇', cat: 'shelf', icon: '🪜', price: 9000, w: 1.5, d: 1, place: 'sales', req: 'fx_shelf3',
    slots: [[0.3, 0.3], [0.62, 0], [0.94, -0.3]].flatMap(([y, z]) => [-0.36, 0.36].map((x) => ({ x, y, z, w: 0.66, h: 0.3, d: 0.3, side: 1, kind: 'produce' }))), desc: '階段状の陳列台。果物や野菜を山盛りに（6枠）' }),
  bakery: F({ name: 'パン棚', cat: 'shelf', icon: '🥖', price: 9000, w: 1.5, d: 0.5, place: 'sales', req: 'prod_bakery1',
    slots: shelfSlots(3, [0.32, 0.76, 1.2], 1.5, 0.42, 0.38, 2, 'bakery'), desc: '木製のおしゃれなパン棚' }),
  fridge: F({ name: '冷蔵ケース', cat: 'cold', icon: '🧊', price: 18000, w: 2, d: 1, place: 'sales', req: 'prod_chilled1',
    slots: shelfSlots(4, [0.2, 0.62, 1.04, 1.46], 2, 0.6, 0.36, 3, 'chilled').map((s) => ({ ...s, z: 0.05 })), desc: '飲み物や乳製品を冷やして並べる（12枠）' }),
  reachin: F({ name: 'ドリンク冷蔵庫', cat: 'cold', icon: '🚪', price: 14000, w: 1.5, d: 0.8, place: 'sales', req: 'prod_chilled2',
    slots: shelfSlots(5, [0.18, 0.54, 0.9, 1.26, 1.62], 1.5, 0.56, 0.32, 2, 'chilled').map((s) => ({ ...s, z: -0.02 })), desc: 'ガラス扉の縦型冷蔵庫（10枠）' }),
  icebox: F({ name: 'アイスBOX', cat: 'cold', icon: '🍦', price: 9000, w: 1.25, d: 0.75, place: 'sales', req: 'prod_frozen1',
    slots: [{ x: 0, y: 0.42, z: 0, w: 1.08, h: 0.34, d: 0.58, side: 1, kind: 'frozen' }], desc: '小さな冷凍ストッカー（1枠）' }),
  freezer: F({ name: '冷凍ケース', cat: 'cold', icon: '❄️', price: 16000, w: 2, d: 1, place: 'sales', req: 'prod_frozen1',
    slots: [{ x: -0.47, y: 0.42, z: 0, w: 0.86, h: 0.36, d: 0.78, side: 1, kind: 'frozen' }, { x: 0.47, y: 0.42, z: 0, w: 0.86, h: 0.36, d: 0.78, side: 1, kind: 'frozen' }], desc: 'アイスや冷凍食品用' }),
  produce: F({ name: '青果台', cat: 'shelf', icon: '🧺', price: 10000, w: 2, d: 1, place: 'sales', req: 'prod_produce1',
    slots: [
      { x: -0.48, y: 0.56, z: 0.24, w: 0.88, h: 0.32, d: 0.44, side: 1, kind: 'produce' }, { x: 0.48, y: 0.56, z: 0.24, w: 0.88, h: 0.32, d: 0.44, side: 1, kind: 'produce' },
      { x: -0.48, y: 0.82, z: -0.24, w: 0.88, h: 0.32, d: 0.44, side: 1, kind: 'produce' }, { x: 0.48, y: 0.82, z: -0.24, w: 0.88, h: 0.32, d: 0.44, side: 1, kind: 'produce' },
    ], desc: '木箱に野菜や果物を山盛りに' }),
  rack: F({ name: '在庫棚', cat: 'storage', icon: '📦', price: 6000, w: 2, d: 0.5, place: 'any',
    boxSlots: [0.08, 0.74, 1.4].flatMap((y) => [-0.66, 0, 0.66].map((x) => ({ x, y, z: 0 }))), desc: '段ボール箱を保管する金属ラック' }),
  bigrack: F({ name: '大型在庫棚', cat: 'storage', icon: '🏗️', price: 12000, w: 3, d: 0.5, place: 'any', req: 'fx_rack2',
    boxSlots: [0.08, 0.62, 1.16, 1.7].flatMap((y) => [-1.08, -0.36, 0.36, 1.08].map((x) => ({ x, y, z: 0 }))), desc: '16箱入る大きなラック' }),
  checkout: F({ name: 'レジカウンター', cat: 'checkout', icon: '🧾', price: 12000, w: 1, d: 2.5, place: 'sales',
    op: [-0.85, -0.45], cust: [0.85, -0.25], q0: 0.85, qStep: 0.8, desc: 'お客さんの会計をする' }),
  selfcheckout: F({ name: 'セルフレジ', cat: 'checkout', icon: '🤖', price: 20000, w: 1, d: 1, place: 'sales', req: 'fx_selfreg',
    cust: [0, 0.85], q0: 0.8, qStep: 0.8, desc: 'お客さんが自分で会計する' }),
  pc: F({ name: '発注パソコン', cat: 'fixed', icon: '💻', price: 0, w: 1.5, d: 1, place: 'any', fixed: true, desc: '' }),
  mboard: F({ name: 'マネージャーボード', cat: 'fixed', icon: '📋', price: 0, w: 2, d: 0.5, place: 'any', fixed: true, desc: '発注・値段・従業員・お店の設定' }),
  fboard: F({ name: 'フランチャイズボード', cat: 'fixed', icon: '🌟', price: 0, w: 2, d: 0.5, place: 'any', fixed: true, desc: 'スキルの解放' }),
  xboard: F({ name: '店舗拡張ボード', cat: 'fixed', icon: '🗺️', price: 0, w: 1.5, d: 0.5, place: 'any', fixed: true, desc: '売り場・倉庫を買い足す' }),
  opensign: F({ name: '入口の看板', cat: 'fixed', icon: '🪧', price: 0, w: 0.6, d: 0.5, place: 'any', fixed: true, desc: 'OPENにすると営業スタート' }),
  recycle: F({ name: 'リサイクルボックス', cat: 'fixed', icon: '♻️', price: 0, w: 2, d: 1, place: 'any', fixed: true, desc: '空き箱を入れるとお金になる' }),
  plant: F({ name: '観葉植物', cat: 'deco', icon: '🪴', price: 1500, w: 0.5, d: 0.5, place: 'any', desc: '店内に緑を' }),
  trash: F({ name: 'ゴミ箱', cat: 'storage', icon: '🗑️', price: 800, w: 0.5, d: 0.5, place: 'any', desc: '空の段ボールを捨てられる' }),
  dumpster: F({ name: '大型ゴミ箱', cat: 'storage', icon: '🗑️', price: 3500, w: 1.5, d: 0.9, place: 'any', desc: '空の段ボールを捨てる大きなゴミ箱' }),
  basket: F({ name: 'カゴ置き場', cat: 'deco', icon: '🧺', price: 1500, w: 0.5, d: 0.5, place: 'any', desc: '買い物カゴが積まれている' }),
  bench: F({ name: 'ベンチ', cat: 'deco', icon: '🪑', price: 3000, w: 1.5, d: 0.5, place: 'any', req: 'fx_deco', desc: 'ひと休み用' }),
  vending: F({ name: '自動販売機', cat: 'deco', icon: '🥤', price: 8000, w: 1, d: 0.5, place: 'any', req: 'fx_deco', desc: '来店客が時々ジュースを買う(小収入)' }),
  gumball: F({ name: 'ガチャマシン', cat: 'deco', icon: '🍬', price: 2500, w: 0.5, d: 0.5, place: 'any', req: 'fx_deco', desc: '子どもが喜ぶ(評判+)' }),
  flower: F({ name: '花壇', cat: 'deco', icon: '🌷', price: 2200, w: 1, d: 0.5, place: 'any', req: 'fx_deco', desc: 'カラフルな花' }),
  signstand: F({ name: 'スタンド看板', cat: 'sign', icon: '🪧', price: 2000, w: 0.5, d: 0.5, place: 'any', req: 'fx_sign', text: true, desc: '好きな文字を書ける黒板看板' }),
  banner: F({ name: '売り場案内板', cat: 'sign', icon: '🏷️', price: 1800, w: 0.5, d: 0.5, place: 'any', req: 'fx_sign', text: true, desc: 'ポールに売り場名を掲げる案内板' }),
  hangsign: F({ name: '吊り看板', cat: 'sign', icon: '🎌', price: 3000, w: 1.5, d: 0.5, place: 'any', req: 'fx_sign', text: true, air: true, desc: '天井から吊るす両面の看板。好きな文字と色にできる（下を通れて、棚の上にも吊るせる）' }),
  neon: F({ name: 'ネオン看板', cat: 'sign', icon: '💡', price: 4500, w: 1, d: 0.5, place: 'any', req: 'fx_sign', text: true, desc: '光る文字の看板' }),
};
export const FIXTURE_CATS = { shelf: '陳列棚', cold: '冷蔵・冷凍', storage: '在庫', checkout: 'レジ', deco: '装飾', sign: '看板' };
for (const [id, f] of Object.entries(FIXTURES)) { f.id = id; (f.slots || []).forEach((s, i) => (s.key = id + i)); }
tuneBoxes();

export function fixtureFootprint(fx, x, z, r) {
  const def = FIXTURES[fx];
  const rw = r % 2 ? def.d : def.w, rd = r % 2 ? def.w : def.d;
  return { minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2, rw, rd };
}
// 中心座標をグリッドに合わせる
export function snapFixture(type, x, z, r) {
  const fp = fixtureFootprint(type, 0, 0, r);
  const minX = Math.round((x - fp.rw / 2) / CELL) * CELL, minZ = Math.round((z - fp.rd / 2) / CELL) * CELL;
  return [minX + fp.rw / 2, minZ + fp.rd / 2];
}
export function localToWorld(f, lx, lz) {
  const a = f.r * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}
export function worldToLocal(f, wx, wz) {
  const a = -f.r * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  const dx = wx - f.x, dz = wz - f.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}
export function slotAccess(f, si) {
  const def = FIXTURES[f.t], s = def.slots[si];
  return localToWorld(f, s.x, s.side * (def.d / 2 + 0.45));
}
export function rackAccess(f, si) {
  const def = FIXTURES[f.t], s = def?.boxSlots?.[si];
  if (!s) return [f.x, f.z]; // 在庫棚でなければ設備の前
  return localToWorld(f, s.x, def.d / 2 + 0.5);
}
export function checkoutSpot(f, i) {
  const def = FIXTURES[f.t];
  if (i === -1) return localToWorld(f, def.op[0], def.op[1]);
  if (i === 0) return localToWorld(f, def.cust[0], def.cust[1]);
  return localToWorld(f, def.cust[0], def.cust[1] + def.q0 + (i - 1) * def.qStep);
}

// 棚の1スロットに並べる位置一覧。1枠に入るのは段ボール1箱ぶん（＝容量は箱の入り数）。
// 1箱ぜんぶ入れると枠いっぱいに見えるよう、列・奥行き・段を枠の大きさに合わせて広げる。
const _layoutCache = new Map();
function fitGrid(slot, size, pile, stack) {
  let [pw, ph, pd] = size, yaw = 0;
  const rot = pile || slot.kind === 'bakery';
  const gap = pile ? 1.0 : 1.04;
  const grid = (a, b) => [Math.max(1, Math.floor(slot.w / (a * gap))), Math.max(1, Math.floor(slot.d / (b * (pile ? 1 : 1.06))))];
  let [C, R] = grid(pw, pd);
  if (rot) { const [c2, r2] = grid(pd, pw); if (c2 * r2 > C * R) { [C, R] = [c2, r2]; [pw, pd] = [pd, pw]; yaw = Math.PI / 2; } }
  const Lmax = Math.max(1, Math.floor(slot.h / ph));
  return { C, R, L: Math.max(1, Math.min(stack || 1, Lmax)), Lmax, pw, ph, pd, yaw };
}
export function slotPositions(pid, slot) {
  const key = pid + '|' + slot.key;
  let out = _layoutCache.get(key);
  if (out) return out;
  const p = PRODUCTS[pid], qty = p.qty;
  const pile = slot.pile || slot.kind === 'produce' || slot.kind === 'frozen';
  const G = fitGrid(slot, p.size, pile, p.stack);
  let { C, R, L } = G;
  while (C * R * L < qty && L < G.Lmax) L++;            // 入りきらなければ段を積む
  let rows = Math.min(R, Math.ceil(qty / (C * L)));     // 手前から必要な列数だけ
  let cols = C;
  if (cols * rows * L < qty) cols = Math.ceil(qty / (rows * L)); // それでも無理なら詰めて並べる
  const gx = Math.min(slot.w / cols, Math.max(G.pw * 1.02, slot.w / cols));
  const gz = slot.d / rows;                              // 奥行き方向は枠いっぱいに広げる
  const x0 = -(cols - 1) * gx / 2;
  out = [];
  const rnd = mulberryLite(key.length * 7919 + pid.charCodeAt(0));
  // 手前の列から埋める（減ってきても前面は最後まで並んで見える）
  for (let r = 0; r < rows; r++) for (let l = 0; l < L; l++) for (let c = 0; c < cols; c++) {
    let lx = x0 + c * gx, lz = slot.d / 2 - gz / 2 - r * gz, ly = l * G.ph, yaw = G.yaw;
    if (pile) {
      lx += (rnd() - 0.5) * gx * 0.3; lz += (rnd() - 0.5) * gz * 0.3;
      yaw += (rnd() - 0.5) * (slot.kind === 'produce' || slot.pile ? 2.4 : 0.4);
      if (l % 2) { lx += gx * 0.25; ly -= G.ph * 0.1; }
    }
    if (slot.kind === 'bakery') yaw += (rnd() - 0.5) * 0.5;
    out.push([slot.x + lx, slot.y + Math.max(0, ly), slot.z + lz * slot.side, yaw + (slot.side < 0 ? Math.PI : 0)]);
  }
  if (pile) out.sort((a, b) => a[1] - b[1]);
  out = out.slice(0, qty);
  _layoutCache.set(key, out);
  return out;
}
// 入り数（1箱の数）を、その商品の基本の陳列枠にぴったり詰まる数にそろえる
function boxFit(bx, size) {
  const [bw, bh, bd] = BOX_SIZES[bx], [pw, ph, pd] = size;
  const f = (a, b) => Math.max(1, Math.floor((bw - 0.03) / a)) * Math.max(1, Math.floor((bd - 0.03) / b));
  return Math.max(f(pw, pd), f(pd, pw)) * Math.max(1, Math.floor((bh - 0.01) / ph));
}
function tuneBoxes() {
  const REF = { dry: FIXTURES.shelf.slots[0], chilled: FIXTURES.fridge.slots[0], frozen: FIXTURES.freezer.slots[0], produce: FIXTURES.produce.slots[0], bakery: FIXTURES.bakery.slots[0] };
  for (const p of PRODUCTS_LIST) {
    const slot = REF[p.place[0]], pile = p.place[0] === 'produce' || p.place[0] === 'frozen';
    const G = fitGrid(slot, p.size, pile, p.stack);
    const pack = G.C * G.R * G.L;
    let bx = p.bx;
    for (const b of ['s', 'm', 'l']) { if ('sml'.indexOf(b) < 'sml'.indexOf(p.bx)) continue; bx = b; if (boxFit(b, p.size) >= pack) break; }
    p.bx = bx;
    p.qty = Math.max(3, Math.min(pack, boxFit(bx, p.size), 48));
    p.max = p.qty;
  }
}
function mulberryLite(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
export const slotCapacity = (pid, slot) => slotPositions(pid, slot).length; // ＝箱1つぶん
export const canPlace = (pid, slot) => PRODUCTS[pid].place.includes(slot.kind);

// ローカル座標の当たり位置から一番近いスロット
export function pickSlot(type, lx, ly, lz) {
  const def = FIXTURES[type];
  let best = -1, bd = 1e9;
  (def.slots || []).forEach((s, i) => {
    if (def.slots.some((o) => o.side !== s.side) && Math.sign(lz || 1) !== s.side) return;
    const cy = s.y + s.h / 2;
    const d = (lx - s.x) ** 2 * 1.0 + (ly - cy) ** 2 * 2.2 + (lz - s.z) ** 2 * 0.3;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
// 値札の位置（棚のローカル座標）。描画と「値札を狙う」判定で共通
export function tagLocal(type, sl) {
  let tx = sl.x, ty = sl.y - 0.04, tz = sl.z + sl.side * (sl.d / 2 + 0.024);
  if (type === 'freezer') { ty = 0.72; tz = 0.506; }
  if (type === 'produce') { ty = sl.y + 0.02; tz = sl.z + sl.d / 2 + 0.045; }
  if (type === 'fridge') { ty = sl.y - 0.03; tz = 0.392; }
  return [tx, ty, tz];
}
// 狙った点の近くにある値札（商品のラベルがついている枠だけ）。スマホでも狙いやすいよう少し広めに判定
export function pickTag(f, lx, ly, lz) {
  const def = FIXTURES[f.t];
  if (!def?.slots || !f.s) return -1;
  const two = def.slots.some((o) => o.side !== def.slots[0].side);
  let best = -1, bd = 1e9;
  def.slots.forEach((sl, i) => {
    if (!f.s[i]?.[0]) return;
    if (two && Math.sign(lz || 1) !== sl.side) return;
    const [tx, ty, tz] = tagLocal(f.t, sl);
    const dx = Math.abs(lx - tx), dy = Math.abs(ly - ty), dz = Math.abs(lz - tz);
    if (dx > Math.max(0.1, sl.w * 0.45) || dy > 0.065 || dz > 0.2) return;
    const dd = dx * dx + dy * dy * 4;
    if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}
export function pickBoxSlot(type, lx, ly) {
  const def = FIXTURES[type];
  let best = -1, bd = 1e9;
  (def.boxSlots || []).forEach((s, i) => {
    const d = (lx - s.x) ** 2 + (ly - (s.y + 0.2)) ** 2 * 1.5;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export const STAFF_ROLES = {
  cashier: { name: 'レジ係', icon: '🧾', wage: 1500, desc: '空いているレジで会計をする' },
  stocker: { name: '品出し係', icon: '📦', wage: 1800, desc: '値札のついた棚へ在庫から補充する（値札がないと働かない）' },
  cleaner: { name: 'ゴミ捨て係', icon: '🗑️', wage: 1000, desc: '空の段ボールをひたすらゴミ箱へ捨てる' },
  pricer: { name: '値付け係', icon: '🏷️', wage: 1300, desc: '値札をまわって、いつも「高すぎる」の1歩手前（売れるいちばん高い値段）に付けかえる。相場が変わっても直してくれる' },
};

// ---------- スキルボード ----------
// 従業員の枠（最大15人）。Lv5 から雇えて、Lv30 で15人目。番号が大きいほど足も仕事も速い（そのぶん日給も高い）
const SLOT_TITLES = ['のんびり', 'マイペース', 'おっとり', 'ゆったり', 'ふつう', 'まじめ', 'しっかり', 'てきぱき', 'きびきび', 'ベテラン', 'はやわざ', 'スピードスター', 'たつじん', 'エース', '伝説の店員'];
const SLOT_ICONS = ['🐢', '🐌', '🐑', '🐼', '🙂', '📘', '💪', '🏃', '⚡', '🎖️', '🚀', '🌪️', '🥷', '👑', '🌟'];
const SLOT_LV = [5, 6, 7, 8, 10, 11, 13, 14, 16, 18, 20, 22, 24, 27, 30];
const SLOT_COST = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4];
// スキルボード上の並び（3列で折り返し）
const SLOT_POS = [[0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4], [1, 4], [0, 4], [0, 5], [1, 5], [2, 5]];
export const STAFF_SLOTS = SLOT_TITLES.map((title, i) => ({ no: i + 1, title, icon: SLOT_ICONS[i], spd: Math.round((0.5 + i * (1.7 / 14)) * 100) / 100, lv: SLOT_LV[i], cost: SLOT_COST[i], pos: SLOT_POS[i] }));
export const STAFF_MAX = STAFF_SLOTS.length;
// 日給は能力（はやさ）に見合った額：はやさ50%の人は仕事の基本給の6割、100%で10割、220%で約2倍
export const wageFor = (role, spd) => Math.round(role.wage * (0.2 + 0.8 * (spd || 1)) / 10) * 10;
export const slotWage = (role, no) => wageFor(role, (STAFF_SLOTS[(no || 1) - 1] || STAFF_SLOTS[0]).spd);
const S = (id, name, icon, cost, x, y, req, desc, branch) => ({ id, name, icon, cost, x, y, req, desc, branch });
export const SKILL_BRANCHES = [['prod', '🛒 商品'], ['shop', '🏪 お店・設備'], ['staff', '🧑‍💼 従業員'], ['biz', '📈 経営']];
export const ROOT_POS = { shop: [1, 0], staff: [1, 0], biz: [2, 0] };
export const SKILLS_LIST = [
  S('start', '開業', '🏪', 0, 0, 0, [], 'あなたのお店がオープン！', 'root'),
  // 商品（解放すると発注できる商品が増える）
  S('prod_food1', '食品 I', '🥫', 0, 0, 0, [], '最初から売れる基本の食品', 'prod'),
  S('prod_food2', '食品 II', '🥣', 1, 0, 1, ['prod_food1'], '', 'prod'),
  S('prod_food3', '食品 III', '🍛', 2, 0, 2, ['prod_food2'], '', 'prod'),
  S('prod_food4', '調味料', '🌾', 2, 0, 3, ['prod_food3'], '', 'prod'),
  S('prod_drink1', '飲料 I', '💧', 1, 1, 1, ['prod_food1'], '', 'prod'),
  S('prod_drink2', '飲料 II', '🥤', 2, 1, 2, ['prod_drink1'], '', 'prod'),
  S('prod_chilled1', '冷蔵 I', '🥛', 2, 2, 1, ['prod_food1'], '冷蔵ケースと冷蔵商品を解放。冷蔵商品は冷蔵ケースでしか売れない', 'prod'),
  S('prod_chilled2', '冷蔵 II', '🧀', 2, 2, 2, ['prod_chilled1'], '冷蔵ケース専用の商品が増える', 'prod'),
  S('prod_chilled3', '冷蔵 III', '🍣', 3, 2, 3, ['prod_chilled2'], 'お寿司やサラダなど（冷蔵ケース専用）', 'prod'),
  S('prod_frozen1', '冷凍 I', '🍨', 2, 3, 2, ['prod_chilled1'], '冷凍ケースと冷凍商品を解放。冷凍商品は冷凍ケースでしか売れない', 'prod'),
  S('prod_frozen2', '冷凍 II', '🍟', 2, 3, 3, ['prod_frozen1'], '冷凍ケース専用の商品が増える', 'prod'),
  S('prod_frozen3', '冷凍 III', '🦐', 3, 3, 4, ['prod_frozen2'], 'うどん・からあげ・えび（冷凍ケース専用）', 'prod'),
  S('prod_produce1', '青果 I', '🍎', 1, 4, 1, ['prod_food1'], '青果台も置けるようになる', 'prod'),
  S('prod_produce2', '青果 II', '🧅', 2, 4, 2, ['prod_produce1'], '', 'prod'),
  S('prod_produce3', '青果 III', '🍍', 3, 4, 3, ['prod_produce2'], '', 'prod'),
  S('prod_bakery1', 'パン I', '🍞', 2, 5, 2, ['prod_produce1'], 'パン棚も置けるようになる', 'prod'),
  S('prod_bakery2', 'パン II', '🥖', 2, 5, 3, ['prod_bakery1'], '', 'prod'),
  S('prod_house1', '日用品 I', '🧻', 1, 6, 1, ['prod_food1'], '', 'prod'),
  S('prod_house2', '日用品 II', '🧴', 2, 6, 2, ['prod_house1'], '', 'prod'),
  S('prod_premium', '高級品', '💎', 3, 7, 3, ['prod_drink2', 'prod_chilled2'], '', 'prod'),
  // レベルが上がるほど新しい商品が増える
  S('prod_drink3', '飲料 III', '🥤', 2, 1, 3, ['prod_drink2'], 'コーラ・ミルクティー・炭酸水・ハイボール', 'prod'),
  S('prod_house3', '日用品 III', '🧽', 2, 6, 3, ['prod_house2'], '食器用洗剤・柔軟剤・タオル', 'prod'),
  S('prod_food5', 'お菓子・麺', '🍜', 2, 0, 4, ['prod_food4'], '袋麺・ふりかけ・グミ・ピーナッツ・レトルトカレー', 'prod'),
  S('prod_chilled4', 'お弁当・おにぎり', '🍙', 3, 2, 4, ['prod_chilled3'], 'おにぎり・お弁当・生クリーム（冷蔵ケース専用）', 'prod'),
  S('prod_produce4', '青果 IV', '🥦', 2, 4, 4, ['prod_produce3'], 'みかん・ブロッコリー・とうもろこし・なす', 'prod'),
  S('prod_drink4', 'お酒', '🍶', 3, 1, 4, ['prod_drink3'], '日本酒・スパークリングワイン', 'prod'),
  S('prod_bakery3', 'パン III', '🥐', 2, 5, 4, ['prod_bakery2'], 'カレーパン・ロールケーキ・ベーグル', 'prod'),
  S('prod_frozen4', '冷凍 IV', '🐙', 3, 3, 5, ['prod_frozen3'], '冷凍野菜・たこ焼き（冷凍ケース専用）', 'prod'),
  S('prod_produce5', '青果 V', '🍑', 3, 4, 5, ['prod_produce4'], 'もも・アボカド・きのこ', 'prod'),
  S('prod_premium2', '特選品', '👑', 4, 7, 5, ['prod_premium'], 'マスクメロン・大トロ', 'prod'),
  // お店・設備
  S('fx_checkout2', 'レジ増設', '🧾', 1, 0, 1, ['start'], 'レジを最大3台まで置ける', 'shop'),
  S('fx_gondola', 'ゴンドラ棚', '🏬', 2, 0, 2, ['fx_checkout2'], '両面ゴンドラ棚が解放', 'shop'),
  S('fx_checkout3', 'レジ増設 II', '🧾', 2, 0, 3, ['fx_gondola'], 'レジを最大6台まで置ける（お客さんが増えたら）', 'shop'),
  S('fx_selfreg', 'セルフレジ', '🤖', 3, 0, 4, ['fx_checkout3'], 'セルフレジを4台まで置ける。お客さんが自分でお会計（ただし遅く、使いたがらない人もいる）', 'shop'),
  S('fx_deco', '装飾アイテム', '🪴', 1, 1, 1, ['start'], 'ベンチ・自販機・ガチャ・花壇が解放', 'shop'),
  S('fx_sign', '看板職人', '🪧', 1, 1, 2, ['fx_deco'], 'スタンド看板・案内板・ネオン看板・吊り看板が解放', 'shop'),
  S('fx_rack2', '大型在庫棚', '🏗️', 2, 2, 1, ['start'], '16箱入る大型在庫棚が解放', 'shop'),
  S('fx_shelf2', 'いろいろな棚', '🔚', 1, 3, 1, ['start'], 'エンド棚・平台・特売ワゴンが解放', 'shop'),
  S('fx_shelf3', '大型陳列', '🧱', 2, 3, 2, ['fx_shelf2'], '壁面ハイ棚・ひな壇が解放', 'shop'),
  // 従業員
  // 従業員を雇える権限（1枠ずつ）。No.1 はのんびり、No.10 はとても速い
  ...STAFF_SLOTS.map((sl, i) => S('staff_h' + sl.no, `従業員 No.${sl.no}`, sl.icon, sl.cost, sl.pos[0], sl.pos[1], i ? ['staff_h' + (sl.no - 1)] : ['start'],
    `「${sl.title}」な人を1人雇える（はやさ ${Math.round(sl.spd * 100)}%・日給 ${slotWage(STAFF_ROLES.cleaner, sl.no).toLocaleString()}〜${slotWage(STAFF_ROLES.stocker, sl.no).toLocaleString()}円）`, 'staff')),
  S('staff_speed', 'テキパキ研修', '⚡', 2, 3, 2, ['staff_h2'], '従業員みんなの動きが35%速くなる', 'staff'),
  S('staff_wage', '働き方改革', '💴', 3, 3, 3, ['staff_speed'], '人件費が25%安くなる', 'staff'),
  // 経営
  S('mk_ads', 'チラシ広告', '📰', 1, 0, 1, ['start'], '来店客が25%増える', 'biz'),
  S('mk_price', 'ブランド力', '✨', 2, 0, 2, ['mk_ads'], '相場の+30%まで買ってもらえる（ふだんは+20%まで）', 'biz'),
  S('mk_bulk', 'まとめ買い契約', '🤝', 2, 0, 3, ['mk_price'], '仕入れ値が10%安くなる', 'biz'),
  S('mk_ads2', 'テレビCM', '📺', 3, 1, 2, ['mk_ads'], '来店客がさらに50%増える', 'biz'),
  S('mk_hours', '営業時間延長', '🌙', 3, 1, 3, ['mk_ads2'], '24時まで営業できる', 'biz'),
  S('mk_express', 'お急ぎ配送', '🚚', 1, 2, 1, ['start'], '発注した商品がすぐ届く', 'biz'),
  S('mk_scan', '高速スキャナー', '📡', 2, 2, 2, ['mk_express'], '1タップで2個スキャン＆レジ係が速くなる', 'biz'),
  S('mk_rep', '接客マナー研修', '😊', 2, 2, 3, ['mk_scan'], '評判が上がりやすく下がりにくい', 'biz'),
  S('mk_recycle', 'リサイクル名人', '♻️', 2, 3, 1, ['start'], '空き箱のリサイクル報酬が2倍', 'biz'),
  S('mk_vip', 'お得意様', '🛍️', 3, 3, 2, ['mk_recycle'], 'お客さんがたくさん買ってくれる', 'biz'),
];
export const SKILLS = Object.fromEntries(SKILLS_LIST.map((s) => [s.id, s]));
for (const sk of SKILLS_LIST) if (sk.branch === 'prod') { sk.prods = PRODUCTS_LIST.filter((p) => p.lic === sk.id).map((p) => p.id); }
// スキルは店のレベルが上がると解放できる。最大Lv30に合わせて、Lv1〜30にちりばめてある
const LV_REQ = {
  // 🛒 商品
  prod_food1: 1, prod_food2: 2, prod_drink1: 2, prod_house1: 2, prod_produce1: 3, prod_chilled1: 4, prod_drink2: 4,
  prod_food3: 5, prod_house2: 5, prod_produce2: 6, prod_bakery1: 6, prod_frozen1: 7, prod_chilled2: 7, prod_food4: 8,
  prod_drink3: 9, prod_produce3: 10, prod_house3: 10, prod_bakery2: 11, prod_chilled3: 12, prod_frozen2: 13, prod_food5: 14,
  prod_premium: 15, prod_produce4: 16, prod_drink4: 17, prod_chilled4: 18, prod_bakery3: 19, prod_frozen3: 21,
  prod_produce5: 23, prod_frozen4: 25, prod_premium2: 28,
  // 🏪 お店・設備
  fx_shelf2: 3, fx_checkout2: 4, fx_deco: 6, fx_gondola: 8, fx_sign: 9, fx_rack2: 12, fx_shelf3: 15, fx_checkout3: 16, fx_selfreg: 20,
  // 🧑‍💼 従業員（No.1〜15 は STAFF_SLOTS の lv）
  staff_speed: 12, staff_wage: 19,
  // 📈 経営
  mk_ads: 3, mk_express: 5, mk_price: 7, mk_rep: 9, mk_recycle: 11, mk_bulk: 13, mk_scan: 14, mk_ads2: 21, mk_vip: 24, mk_hours: 26,
};
for (const sk of SKILLS_LIST) if (LV_REQ[sk.id]) sk.lv = LV_REQ[sk.id];
for (const sl of STAFF_SLOTS) { const sk = SKILLS_LIST.find((k) => k.id === 'staff_h' + sl.no); if (sk) { sk.lv = sl.lv; sk.slot = sl.no; } }
// 前提スキルより低いレベルにならないようにそろえる
for (let pass = 0; pass < 4; pass++) for (const sk of SKILLS_LIST) for (const r of sk.req) { const q = SKILLS_LIST.find((k) => k.id === r); if (q?.lv && (sk.lv || 0) < q.lv) sk.lv = q.lv; }
// 旧ライセンス → 新しい商品ノード（セーブ移行用）
export const OLD_LICENSES = { lic_drink: ['prod_drink1', 'prod_drink2'], lic_chilled: ['prod_chilled1', 'prod_chilled2'], lic_frozen: ['prod_frozen1', 'prod_frozen2'],
  lic_produce: ['prod_produce1', 'prod_produce2'], lic_bakery: ['prod_bakery1'], lic_house: ['prod_house1', 'prod_house2'], lic_premium: ['prod_premium'] };

export const TRASH_TYPES = ['trash', 'dumpster']; // 空き段ボールを捨てられる設備
export const STAFF_NAMES = ['たなか', 'すずき', 'さとう', 'やまだ', 'こばやし', 'いとう', 'わたなべ', 'なかむら', 'かとう', 'よしだ', 'まつもと', 'いのうえ', 'きむら', 'はやし', 'しみず', 'もり', 'あべ', 'いけだ', 'はしもと', 'やまもと'];

export function staffLimit(skills) { return STAFF_SLOTS.filter((sl) => skills['staff_h' + sl.no]).length; }
export const staffSlotOpen = (skills, no) => !!skills['staff_h' + no];
export function checkoutLimit(skills) { return skills.fx_checkout3 ? 6 : skills.fx_checkout2 ? 3 : 1; }
export const SELF_MAX = 4; // セルフレジは4台まで（遅いのでこれだけでは回らない）
// ハーフ箱：中身が半分の箱（値段も半分。送料は同じ）
export const halfQty = (pid) => Math.ceil(PRODUCTS[pid].qty / 2);
export const boxUnits = (pid, half) => (half ? halfQty(pid) : PRODUCTS[pid].qty);
export function closeTime(skills) { return skills.mk_hours ? 24 * 60 : CLOSE_TIME; }
// お店のレベルは最大30。上がるほど次のレベルまでの経験値がどんどん増える（Lv1→2:250 / Lv5:約950 / Lv10:約2,750 / Lv20:約12,800 / Lv29:約68,000）
// 経験値は売上 ¥100 につき 1（XP_YEN）
export const MAX_LEVEL = 30;
export const XP_YEN = 100;
export function xpNeed(level) { return Math.round((250 * Math.pow(1.22, level - 1) + 100 * (level - 1)) / 10) * 10; }
// レベルアップでもらえるSP（高いレベルほど多い）：Lv2〜4は2、Lv5〜9は3 … Lv30は8
export const spForLevel = (lv) => 2 + Math.floor(lv / 5);
export const spTotalNew = (lv) => { let s = 0; for (let l = 2; l <= lv; l++) s += spForLevel(l); return s; };
export const spTotalOld = (lv) => { let s = 0; for (let l = 2; l <= lv; l++) s += l % 5 === 0 ? 2 : 1; return s; };
export function costMult(skills) { return skills.mk_bulk ? 0.9 : 1; }
// 相場（日ごとに上下する）。値段の端数は元の価格に合わせる（例 ¥158）
export function marketPrice(store, pid) {
  const p = PRODUCTS[pid], m = store?.market?.[pid] ?? 1, v = p.price * m;
  if (v >= 1000) return Math.max(10, Math.round(v / 100) * 100 - (p.price % 100 === 80 ? 20 : 0));
  return Math.max(10, Math.round(v / 10) * 10 - (p.price % 10 === 8 ? 2 : 0));
}
export function marketCost(store, pid) { const p = PRODUCTS[pid]; return Math.max(1, Math.round(p.cost * (store?.market?.[pid] ?? 1))); }

export function productUnlocked(pid, skills) { const p = PRODUCTS[pid]; return !p.lic || !!skills[p.lic]; }
export function fixtureUnlocked(t, skills) { const f = FIXTURES[t]; return !f.fixed && (!f.req || !!skills[f.req]); }

export const CHAT_PRESETS = ['レジお願い！', '品出しするね', '発注しておくよ', 'OK!', 'ありがとう！', 'ナイス！', '開店しよう！', 'ちょっと待って'];
