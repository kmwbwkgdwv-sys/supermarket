// ===== キャラクター（キャラメイク対応・被り物たくさん） =====
import * as THREE from 'three';
import { faceTexture, eyeTexture, nameTexture, bubbleTexture, canvasTex, emoji, shade, surf } from '../textures.js';
import { mat, smat, glassMat, T, box, rbox, cyl, sph, plane, torus, cone, bakeGroup, M, vcolor, merge } from './geo.js';
import { mulberry32 } from '../util.js';

export const SKINS = ['#ffe0c4', '#f8cfa8', '#f1b98c', '#d99b6c', '#b87a4b', '#8d5a36', '#6b4226', '#ffd6e8'];
export const HAIR_COLORS = ['#2b1d16', '#4a2f1f', '#7b4a2a', '#c58a4b', '#f0d27a', '#f5f0e6', '#9e9e9e', '#d63031', '#ff7aa8', '#7c4dff', '#2e86de', '#20bf6b'];
export const CLOTH_COLORS = ['#ff6b35', '#e63946', '#f4a261', '#ffd23f', '#06d6a0', '#2a9d8f', '#118ab2', '#3a86ff', '#7b2cbf', '#ff70a6', '#ffffff', '#adb5bd', '#495057', '#212529', '#8d6e63', '#6d4c41'];
export const OPT = {
  hair: [['none', 'ボウズ'], ['short', 'ショート'], ['spiky', 'ツンツン'], ['sidepart', '七三'], ['bob', 'ボブ'], ['long', 'ロング'], ['ponytail', 'ポニテ'], ['twintail', 'ツイン'], ['bun', 'おだんご'], ['afro', 'アフロ'], ['mohawk', 'モヒカン'], ['curly', 'くるくる']],
  eyes: [['dot', 'てん'], ['round', 'まんまる'], ['happy', 'にっこり'], ['sleepy', 'ねむい'], ['sparkle', 'キラキラ'], ['wink', 'ウインク'], ['angry', 'むっ'], ['cool', 'クール']],
  mouth: [['smile', 'スマイル'], ['grin', 'ニカッ'], ['open', 'あーん'], ['cat', 'ねこ口'], ['flat', 'むー'], ['tongue', 'ぺろ'], ['o', 'おっ']],
  brow: [['normal', 'ふつう'], ['thick', 'ふと眉'], ['none', 'なし']],
  hat: [['none', 'なし', '🙂'], ['cap', 'キャップ', '🧢'], ['beanie', 'ニット帽', '🧶'], ['chef', 'コック帽', '👨‍🍳'], ['cowboy', 'カウボーイ', '🤠'], ['tophat', 'シルクハット', '🎩'],
    ['crown', '王冠', '👑'], ['bunny', 'うさ耳', '🐰'], ['cat', 'ねこ耳', '🐱'], ['bear', 'くまフード', '🐻'], ['frog', 'カエル帽', '🐸'], ['viking', 'バイキング', '⚔️'],
    ['propeller', 'プロペラ', '🚁'], ['party', 'パーティー', '🥳'], ['headphones', 'ヘッドホン', '🎧'], ['halo', '天使の輪', '😇'], ['pumpkin', 'かぼちゃ頭', '🎃'], ['paperbag', '紙袋', '🛍️'],
    ['fish', 'おさかな', '🐟'], ['santa', 'サンタ帽', '🎅'], ['witch', '魔女帽', '🧙'], ['duck', 'アヒル', '🦆'], ['dino', 'きょうりゅう', '🦖'], ['trafficcone', '三角コーン', '🚧'],
    ['pirate', '海賊帽', '🏴‍☠️'], ['sombrero', 'ソンブレロ', '🇲🇽'], ['astronaut', 'うちゅう', '🧑‍🚀'], ['flowercrown', '花かんむり', '🌸'], ['banana', 'バナナ', '🍌'], ['kabuto', 'かぶと', '🏯'],
    ['hachimaki', 'はちまき', '🎌'], ['mushroom', 'キノコ', '🍄'], ['unicorn', 'ユニコーン', '🦄'], ['sprout', 'ふたば', '🌱'], ['onigiri', 'おにぎり', '🍙'], ['ufo', 'UFO', '🛸']],
  acc: [['none', 'なし'], ['round', '丸メガネ'], ['sun', 'サングラス'], ['star', 'スター眼鏡'], ['monocle', '片メガネ'], ['mask', 'マスク'], ['mustache', 'おひげ'], ['beard', 'あごひげ'], ['clown', 'ピエロ鼻'], ['bandaid', 'ばんそうこう'], ['eyepatch', '眼帯']],
  top: [['tshirt', 'Tシャツ'], ['hoodie', 'パーカー'], ['apron', 'エプロン'], ['suit', 'スーツ'], ['overalls', 'オーバーオール'], ['stripe', 'ボーダー'], ['jersey', 'ユニフォーム'], ['dress', 'ワンピース']],
  bottom: [['pants', 'ズボン'], ['shorts', '短パン'], ['skirt', 'スカート']],
};

export function defaultAvatar() {
  return { skin: SKINS[1], hair: 'short', hairColor: HAIR_COLORS[1], eyeColor: '#5b3a24', eyes: 'dot', mouth: 'smile', brow: 'normal', blush: true, hat: 'cap', hatColor: '#ff6b35',
    acc: 'none', top: 'tshirt', topColor: '#3a86ff', bottom: 'pants', bottomColor: '#495057', shoeColor: '#ffffff', height: 1 };
}
export function randomAvatar(seed, { hatChance = 0.3, limited = false } = {}) {
  const r = mulberry32(seed), P = (a) => a[Math.floor(r() * a.length)];
  const ids = (k) => OPT[k].map((o) => o[0]);
  const av = {
    skin: P(SKINS.slice(0, 7)), hair: P(ids('hair')), hairColor: P(HAIR_COLORS.slice(0, 7).concat(HAIR_COLORS)), eyeColor: P(['#5b3a24', '#2b1d16', '#3a6ea5', '#3f8f5a', '#8a6a3a']), eyes: limited ? P(['dot', 'round', 'happy']) : P(ids('eyes')),
    mouth: limited ? P(['smile', 'grin', 'flat']) : P(ids('mouth')), brow: P(['normal', 'thick']), blush: r() < 0.5,
    hat: r() < hatChance ? P(ids('hat').slice(1)) : 'none', hatColor: P(CLOTH_COLORS), acc: r() < 0.25 ? P(ids('acc').slice(1)) : 'none',
    top: P(ids('top').filter((t) => t !== 'apron')), topColor: P(CLOTH_COLORS), bottom: P(ids('bottom')), bottomColor: P(CLOTH_COLORS), shoeColor: P(CLOTH_COLORS), height: 0.92 + r() * 0.16,
  };
  if (limited) { av.acc = ['mustache', 'beard', 'eyepatch', 'bandaid'].includes(av.acc) ? 'none' : av.acc; }
  return av;
}
export function sanitizeAvatar(av) {
  const d = defaultAvatar(), o = { ...d, ...(av || {}) };
  for (const k of ['hair', 'eyes', 'mouth', 'brow', 'hat', 'acc', 'top', 'bottom']) if (!OPT[k].some((x) => x[0] === o[k])) o[k] = d[k];
  for (const k of ['skin', 'hairColor', 'hatColor', 'topColor', 'bottomColor', 'shoeColor', 'eyeColor']) if (!/^#[0-9a-fA-F]{6}$/.test(o[k] || '')) o[k] = d[k];
  o.height = Math.min(1.12, Math.max(0.88, +o.height || 1));
  o.blush = !!o.blush;
  return o;
}

const C = (c, o = {}) => mat(c, { r: 0.6, ...o });
const R = 0.25; // 頭の半径
const HEAD_Y = 0.24;

// ---------- 髪 ----------
function capGeo(r, th = 0.56, tilt = -0.25) { return T(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * th), 0, 0, 0, tilt, 0, 0); }
// 髪の毛の流れ（細い筋の明暗）
let hairStreak = null;
const hairMap = () => hairStreak ||= canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
  const r = mulberry32(77);
  for (let i = 0; i < 220; i++) { const x = r() * w, lw = 0.6 + r() * 1.8; g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.25 + r() * 0.4})` : `rgba(0,0,0,${0.08 + r() * 0.18})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 10, h * 0.33, x + (r() - 0.5) * 10, h * 0.66, x + (r() - 0.5) * 8, h); g.stroke(); }
  const gl = g.createLinearGradient(0, 0, 0, h); gl.addColorStop(0.18, 'rgba(255,255,255,0)'); gl.addColorStop(0.28, 'rgba(255,255,255,0.35)'); gl.addColorStop(0.38, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
});
function buildHair(h, av) {
  const m = mat(av.hairColor, { map: hairMap(), r: 0.62 });
  const a = (g) => { const o = M(g, m); h.add(o); return o; };
  switch (av.hair) {
    case 'none': return;
    case 'short': a(capGeo(R * 1.06)); break;
    case 'spiky': a(capGeo(R * 1.05)); for (let i = 0; i < 9; i++) { const ang = i * 0.7; a(T(cone(0.06, 0.16, 6), Math.cos(ang) * 0.12, R * 0.78, Math.sin(ang) * 0.12 - 0.03, Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5)); } break;
    case 'sidepart': a(capGeo(R * 1.06)); a(T(sph(0.13, 12, 8), -0.08, R * 0.75, 0.1, 0, 0, 0.3, 1.3, 0.55, 0.9)); break;
    case 'bob': a(capGeo(R * 1.1, 0.72, -0.35)); a(T(cyl(R * 1.1, R * 1.15, 0.2, 18, true), 0, -0.12, -0.02, 0, 0, 0, 1, 1, 0.95)); break;
    case 'long': a(capGeo(R * 1.08, 0.62, -0.35)); a(T(rbox(0.46, 0.55, 0.16, 0.07), 0, -0.48, -0.16)); break;
    case 'ponytail': a(capGeo(R * 1.06)); a(T(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), 0, -0.05, -0.32, 0.5)); a(T(sph(0.05, 8, 6), 0, 0.1, -0.27)); break;
    case 'twintail': a(capGeo(R * 1.06)); for (const s of [-1, 1]) { a(T(new THREE.CapsuleGeometry(0.065, 0.26, 4, 8), s * 0.3, -0.1, -0.05, 0, 0, s * 0.35)); a(T(sph(0.05, 8, 6), s * 0.25, 0.08, -0.05)); } break;
    case 'bun': a(capGeo(R * 1.06)); a(T(sph(0.11, 12, 10), 0, R * 1.05, -0.06)); break;
    case 'afro': a(T(sph(0.36, 16, 12), 0, 0.08, -0.06)); break;
    case 'mohawk': for (let i = 0; i < 6; i++) a(T(box(0.06, 0.16, 0.08), 0, R * 0.85 + Math.sin(i / 5 * Math.PI) * 0.04, 0.15 - i * 0.07, -0.3 + i * 0.12)); break;
    case 'curly': a(capGeo(R * 1.04)); for (let i = 0; i < 16; i++) { const ang = i * 2.4, el = 0.3 + (i % 4) * 0.25; a(T(sph(0.07, 8, 6), Math.cos(ang) * Math.cos(el) * R * 1.05, Math.sin(el) * R * 1.05 + 0.02, Math.sin(ang) * Math.cos(el) * R * 1.05 - 0.04)); } break;
    default: a(capGeo(R * 1.06));
  }
}

// ---------- 被り物 ----------
function buildHat(h, av, keep) {
  const hc = av.hatColor || '#ff6b35';
  const A = (g, m) => { const o = M(g, m); h.add(o); return o; };
  const top = R * 0.82;
  switch (av.hat) {
    case 'cap': A(T(new THREE.SphereGeometry(R * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.18, 0), C(hc)); A(T(cyl(0.2, 0.2, 0.025, 16), 0, R * 0.22, 0.2, 0, 0, 0, 1, 1, 0.9), C(hc)); A(T(sph(0.025, 6, 4), 0, R * 1.28), C(hc)); break;
    case 'beanie': A(T(new THREE.SphereGeometry(R * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.2, 0, 0, 0, 0, 1, 1.15, 1), C(hc, { r: 0.95 })); A(T(torus(R * 1.08, 0.045, 8, 20), 0, R * 0.22, 0, Math.PI / 2), C(hc, { r: 0.95 })); A(T(sph(0.08, 10, 8), 0, R * 1.5), C('#ffffff', { r: 1 })); break;
    case 'chef': A(T(cyl(R * 0.95, R * 0.95, 0.2, 18), 0, R * 0.55), C('#ffffff', { r: 0.9 })); for (let i = 0; i < 6; i++) A(T(sph(0.13, 10, 8), Math.cos(i) * 0.1, R * 0.55 + 0.25, Math.sin(i) * 0.1), C('#ffffff', { r: 0.9 })); break;
    case 'cowboy': A(T(cyl(0.42, 0.42, 0.025, 20), 0, R * 0.6, 0, 0, 0, 0, 1, 1, 0.85), C('#a0522d')); A(T(cyl(0.17, 0.2, 0.2, 14), 0, R * 0.6), C('#a0522d')); A(T(cyl(0.2, 0.2, 0.04, 14), 0, R * 0.62), C('#3b2a20')); break;
    case 'tophat': A(T(cyl(0.34, 0.34, 0.025, 20), 0, R * 0.72), C('#1b1b1f', { r: 0.4 })); A(T(cyl(0.18, 0.18, 0.36, 18), 0, R * 0.72), C('#1b1b1f', { r: 0.4 })); A(T(cyl(0.185, 0.185, 0.06, 18), 0, R * 0.74), C(hc)); break;
    case 'crown': { const g = C('#ffcc33', { r: 0.25, m: 0.8 }); A(T(cyl(0.17, 0.17, 0.1, 16, true), 0, top - 0.02), g); for (let i = 0; i < 6; i++) A(T(cone(0.045, 0.12, 4), Math.cos(i * 1.047) * 0.16, top + 0.07, Math.sin(i * 1.047) * 0.16), g); for (let i = 0; i < 6; i++) A(T(sph(0.022, 8, 6), Math.cos(i * 1.047 + 0.5) * 0.172, top + 0.03, Math.sin(i * 1.047 + 0.5) * 0.172), C(['#e63946', '#3a86ff', '#06d6a0'][i % 3], { r: 0.1 })); break; }
    case 'bunny': for (const s of [-1, 1]) { A(T(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), s * 0.1, top + 0.2, -0.02, 0, 0, -s * 0.18, 1, 1, 0.55), C('#ffffff')); A(T(new THREE.CapsuleGeometry(0.03, 0.22, 4, 6), s * 0.1, top + 0.2, 0.012, 0, 0, -s * 0.18, 1, 1, 0.3), C('#ffb3c6')); } break;
    case 'cat': for (const s of [-1, 1]) { A(T(cone(0.09, 0.16, 4), s * 0.15, top - 0.04, 0, 0, Math.PI / 4, -s * 0.35), C(hc)); A(T(cone(0.05, 0.1, 4), s * 0.15, top - 0.02, 0.02, 0, Math.PI / 4, -s * 0.35), C('#ffb3c6')); } break;
    case 'bear': A(T(new THREE.SphereGeometry(R * 1.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 0.01, -0.02, -0.4, 0, 0), C('#8d5a36', { r: 0.95 })); for (const s of [-1, 1]) { A(T(sph(0.08, 10, 8), s * 0.2, top + 0.02, -0.04), C('#8d5a36', { r: 0.95 })); A(T(sph(0.045, 8, 6), s * 0.2, top + 0.02, 0.0), C('#f1c27d')); } break;
    case 'frog': A(T(new THREE.SphereGeometry(R * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.02, 0, -0.25), C('#4caf50', { r: 0.5 })); for (const s of [-1, 1]) { A(T(sph(0.08, 12, 8), s * 0.12, top + 0.06, 0.08), C('#ffffff', { r: 0.3 })); A(T(sph(0.04, 8, 6), s * 0.12, top + 0.07, 0.15), C('#111111', { r: 0.2 })); } A(T(sph(0.04, 8, 6), 0, top - 0.05, 0.2, 0, 0, 0, 2.2, 0.4, 1), C('#e57373')); break;
    case 'viking': { A(T(new THREE.SphereGeometry(R * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.12, 0), C('#9ea7b0', { r: 0.3, m: 0.8 })); A(T(torus(R * 1.08, 0.025, 6, 20), 0, R * 0.14, 0, Math.PI / 2), C('#c9a227', { r: 0.3, m: 0.8 }));
      for (const s of [-1, 1]) { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 0.22, top - 0.05, 0), new THREE.Vector3(s * 0.42, top, 0), new THREE.Vector3(s * 0.38, top + 0.25, 0)); A(new THREE.TubeGeometry(curve, 8, 0.035, 6), C('#fff3d6', { r: 0.5 })); } break; }
    case 'propeller': { A(T(new THREE.SphereGeometry(R * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.15, 0), mat('#ffffff', { map: propTex(), r: 0.6 })); A(T(cyl(0.012, 0.012, 0.1, 6), 0, top + 0.08), C('#333')); A(T(box(0.18, 0.025, 0.012), 0, top + 0.06, 0.012), C('#111')); const pr = new THREE.Group(); pr.add(M(T(box(0.42, 0.012, 0.07), 0, 0), C('#e63946'))); pr.add(M(T(box(0.07, 0.012, 0.42), 0, 0), C('#3a86ff'))); pr.position.y = top + 0.18; pr.userData.keep = true; pr.userData.spin = true; h.add(pr); keep.push(pr); break; }
    case 'party': A(T(cone(0.13, 0.36, 16), 0, top - 0.02), mat('#ffffff', { map: partyTex(hc), r: 0.5 })); A(T(sph(0.05, 10, 8), 0, top + 0.36), C('#ffd23f')); break;
    case 'headphones': { const g = C(hc, { r: 0.35 }); A(T(torus(R * 1.08, 0.025, 6, 20, Math.PI), 0, 0.02, 0, 0, 0, 0), g); for (const s of [-1, 1]) A(T(cyl(0.09, 0.09, 0.07, 14), s * (R + 0.02), -0.03, 0, 0, 0, Math.PI / 2), C('#222', { r: 0.4 })); break; }
    case 'halo': { const o = A(T(torus(0.17, 0.022, 8, 24), 0, top + 0.2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, toneMapped: false })); o.castShadow = false; break; }
    case 'pumpkin': { const pm = C('#ff8c1a', { r: 0.55 }); for (let i = 0; i < 8; i++) A(T(sph(0.21, 12, 10), Math.cos(i * 0.785) * 0.1, 0.02, Math.sin(i * 0.785) * 0.1, 0, -i * 0.785, 0, 0.75, 0.95, 1.15), pm); A(T(cyl(0.03, 0.04, 0.1, 6), 0, R * 0.8), C('#3e7b27')); A(T(plane(0.34, 0.22), 0, 0.0, R * 1.18), new THREE.MeshBasicMaterial({ map: pumpkinFace(), transparent: true, toneMapped: false })); break; }
    case 'paperbag': A(T(box(0.56, 0.62, 0.54), 0, -0.32), mat('#ffffff', { map: bagTex(), r: 0.95 })); break;
    case 'fish': { const fm = C(hc === '#ffffff' ? '#4cc9f0' : hc, { r: 0.35 }); A(T(sph(0.22, 16, 10), 0, top + 0.08, 0, 0, 0, 0, 0.55, 0.5, 1.2), fm); A(T(cone(0.13, 0.16, 4), 0, top + 0.08, -0.32, -Math.PI / 2, 0, Math.PI / 4, 1, 1, 0.3), fm); for (const s of [-1, 1]) { A(T(sph(0.035, 8, 6), s * 0.1, top + 0.13, 0.14), C('#ffffff')); A(T(sph(0.018, 6, 4), s * 0.115, top + 0.135, 0.165), C('#111')); } break; }
    case 'santa': { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top - 0.05, 0), new THREE.Vector3(0, top + 0.28, 0), new THREE.Vector3(0.06, top + 0.2, -0.25)); A(T(cone(R * 1.05, 0.3, 18), 0, top - 0.08, -0.02, -0.4), C('#d62828')); A(T(torus(R * 1.04, 0.05, 8, 22), 0, top - 0.06, -0.01, Math.PI / 2 - 0.25), C('#ffffff', { r: 1 })); A(T(sph(0.06, 10, 8), 0, top + 0.18, -0.15), C('#ffffff', { r: 1 })); void curve; break; }
    case 'witch': A(T(cyl(0.45, 0.45, 0.02, 24), 0, top - 0.06), C('#2b2340')); A(T(cone(0.2, 0.5, 18), 0, top - 0.05, 0, -0.18), C('#2b2340')); A(T(cyl(0.2, 0.2, 0.05, 18), 0, top - 0.04), C(hc)); break;
    case 'duck': A(T(sph(0.17, 14, 10), 0, top + 0.08, -0.02, 0, 0, 0, 1, 0.75, 1.2), C('#ffd60a', { r: 0.45 })); A(T(sph(0.1, 12, 8), 0, top + 0.24, 0.12), C('#ffd60a', { r: 0.45 })); A(T(sph(0.05, 8, 6), 0, top + 0.22, 0.23, 0, 0, 0, 1.2, 0.5, 1.4), C('#ff8c1a')); for (const s of [-1, 1]) A(T(sph(0.018, 6, 4), s * 0.05, top + 0.27, 0.2), C('#111')); break;
    case 'dino': { const dm = C(hc === '#ffffff' ? '#52b788' : '#52b788', { r: 0.8 }); A(T(new THREE.SphereGeometry(R * 1.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.01, -0.02, -0.45), dm); for (let i = 0; i < 5; i++) A(T(cone(0.05, 0.1, 4), 0, top + 0.03 - i * 0.04 * (i > 2 ? 2 : 0.3), 0.1 - i * 0.09, -0.4 * i * 0.3), C('#ffd166')); A(T(cyl(R * 1.05, R * 1.05, 0.03, 20, true), 0, top - 0.04, 0.06, -1.1, 0, 0, 1, 1, 0.3), C('#ffffff')); break; }
    case 'trafficcone': A(T(cone(0.2, 0.5, 16), 0, top - 0.06), mat('#ffffff', { map: coneTex(), r: 0.45 })); A(T(box(0.42, 0.04, 0.42), 0, top - 0.08), C('#ff6d00')); break;
    case 'pirate': A(T(cyl(0.36, 0.36, 0.03, 3), 0, top - 0.03, 0, 0, 0, 0, 1, 1, 0.9), C('#1b1b1f')); A(T(new THREE.SphereGeometry(R * 1.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, top - 0.06, 0, 0, 0, 0, 1, 0.8, 1), C('#1b1b1f')); A(T(plane(0.12, 0.12), 0, top + 0.08, 0.255), new THREE.MeshBasicMaterial({ map: skullTex(), transparent: true })); break;
    case 'sombrero': A(T(cyl(0.58, 0.58, 0.03, 24), 0, top - 0.06), mat('#ffffff', { map: sombreroTex(), r: 0.8 })); A(T(cone(0.2, 0.3, 18), 0, top - 0.05), C('#e9c46a', { r: 0.8 })); A(T(cyl(0.18, 0.2, 0.06, 18), 0, top - 0.02), C(hc)); break;
    case 'astronaut': { const o = A(T(sph(0.36, 20, 14), 0, 0.02), glassMat()); o.castShadow = false; A(T(torus(0.26, 0.06, 8, 22), 0, -0.25, 0, Math.PI / 2), C('#f5f5f5', { r: 0.4 })); A(T(box(0.12, 0.06, 0.02), 0, -0.3, 0.3), C('#3a86ff')); break; }
    case 'flowercrown': { const cols = ['#ff70a6', '#ffd23f', '#ffffff', '#c77dff', '#ff9f1c']; for (let i = 0; i < 12; i++) { const a = i * 0.5236; A(T(sph(0.045, 8, 6), Math.cos(a) * R * 0.98, R * 0.45, Math.sin(a) * R * 0.98), C(cols[i % 5], { r: 0.5 })); A(T(sph(0.03, 6, 4), Math.cos(a + 0.26) * R * 0.98, R * 0.42, Math.sin(a + 0.26) * R * 0.98, 0, 0, 0, 1.4, 0.5, 0.8), C('#52b788')); } break; }
    case 'banana': { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.05, top - 0.05, 0), new THREE.Vector3(0.18, top + 0.2, 0), new THREE.Vector3(0.0, top + 0.5, 0)); A(new THREE.TubeGeometry(curve, 12, 0.08, 10), C('#ffd60a', { r: 0.45 })); A(T(cyl(0.02, 0.025, 0.06, 6), 0, top + 0.48), C('#6b4423')); break; }
    case 'kabuto': { A(T(new THREE.SphereGeometry(R * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.12, 0), C('#2b2d42', { r: 0.3, m: 0.5 })); A(T(cyl(0.36, 0.38, 0.05, 20, true), 0, R * 0.05, -0.02, -0.25), C('#2b2d42', { r: 0.3, m: 0.5 })); const gm = C('#ffcc33', { r: 0.2, m: 0.9 }); for (const s of [-1, 1]) A(T(box(0.04, 0.3, 0.02), s * 0.08, top - 0.05, R * 0.95, 0, 0, -s * 0.45), gm); A(T(sph(0.04, 8, 6), 0, top - 0.06, R * 1.0), C('#d62828')); break; }
    case 'hachimaki': A(T(cyl(R * 1.03, R * 1.03, 0.07, 20, true), 0, R * 0.32), C('#ffffff', { r: 0.9 })); A(T(sph(0.03, 8, 6), 0, R * 0.36, R * 1.02, 0, 0, 0, 1, 1, 0.3), C('#d62828')); for (const s of [-1, 1]) A(T(box(0.05, 0.15, 0.01), s * 0.04, R * 0.18, -R * 1.02, 0, 0, s * 0.4), C('#ffffff')); break;
    case 'mushroom': A(T(new THREE.SphereGeometry(0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, top - 0.04, 0, 0, 0, 0, 1, 0.7, 1), mat('#ffffff', { map: mushroomTex(), r: 0.5 })); break;
    case 'unicorn': A(T(new THREE.ConeGeometry(0.05, 0.28, 10), 0, top + 0.16, 0.12, 0.35), C('#ffd6f6', { r: 0.25, m: 0.4 })); for (const s of [-1, 1]) A(T(cone(0.05, 0.1, 4), s * 0.17, top - 0.04, -0.02, 0, 0, -s * 0.4), C('#ffffff')); A(T(sph(0.1, 10, 8), 0, top - 0.02, -0.18, 0, 0, 0, 0.6, 1, 1.3), C('#c77dff')); break;
    case 'sprout': A(T(cyl(0.01, 0.012, 0.12, 6), 0, top), C('#52b788')); for (const s of [-1, 1]) A(T(sph(0.07, 10, 6), s * 0.07, top + 0.12, 0, 0, 0, s * 0.5, 1, 0.25, 0.6), C('#74c69d', { r: 0.5 })); break;
    case 'onigiri': A(T(cyl(0.2, 0.2, 0.18, 3), 0, top - 0.05, 0, 0, Math.PI / 6, 0, 1, 1, 0.75), C('#ffffff', { r: 0.9 })); A(T(box(0.16, 0.12, 0.13), 0, top - 0.05), C('#1b4332', { r: 0.8 })); break;
    case 'ufo': { A(T(sph(0.3, 18, 8), 0, top + 0.14, 0, 0, 0, 0, 1, 0.22, 1), C('#b0bec5', { r: 0.2, m: 0.85 })); const o = A(T(sph(0.12, 14, 10), 0, top + 0.2), glassMat()); o.castShadow = false; for (let i = 0; i < 6; i++) A(T(sph(0.025, 6, 4), Math.cos(i * 1.05) * 0.26, top + 0.13, Math.sin(i * 1.05) * 0.26), new THREE.MeshBasicMaterial({ color: ['#ff4d6d', '#ffd23f', '#4cc9f0'][i % 3], toneMapped: false })); break; }
    default: break;
  }
}
function buildAcc(h, av) {
  const A = (g, m) => { const o = M(g, m, false); h.add(o); return o; };
  const z = R * 1.06, y = 0.03;
  switch (av.acc) {
    case 'round': for (const s of [-1, 1]) A(T(torus(0.055, 0.009, 6, 16), s * 0.075, y, z), C('#222', { m: 0.5 })); A(T(box(0.04, 0.01, 0.01), 0, y, z + 0.01), C('#222')); break;
    case 'sun': for (const s of [-1, 1]) A(T(rbox(0.11, 0.07, 0.02, 0.02), s * 0.075, y - 0.035, z), C('#111', { r: 0.1, m: 0.5 })); A(T(box(0.26, 0.012, 0.015), 0, y + 0.03, z), C('#111')); break;
    case 'star': for (const s of [-1, 1]) A(T(plane(0.14, 0.14), s * 0.08, y, z + 0.02), new THREE.MeshBasicMaterial({ map: starTex(), transparent: true })); break;
    case 'monocle': A(T(torus(0.055, 0.01, 6, 16), 0.075, y, z), C('#d4af37', { m: 0.9, r: 0.2 })); A(T(cyl(0.003, 0.003, 0.2, 4), 0.12, y - 0.2, z), C('#d4af37', { m: 0.9 })); break;
    case 'mask': A(new THREE.SphereGeometry(R * 1.02, 16, 8, Math.PI * 0.22, Math.PI * 0.56, Math.PI * 0.56, Math.PI * 0.24), C('#e3f2fd', { r: 0.9, side: THREE.DoubleSide })); break;
    case 'clown': A(T(sph(0.045, 10, 8), 0, -0.02, R * 1.0), C('#ff1744', { r: 0.25 })); break;
    default: break;
  }
}

// ---------- 小物テクスチャ ----------
const tc = {};
function propTex() { return tc.prop ||= canvasTex(128, 64, (g, w, h) => { const c = ['#e63946', '#ffd23f', '#3a86ff', '#06d6a0']; for (let i = 0; i < 4; i++) { g.fillStyle = c[i]; g.fillRect(i * w / 4, 0, w / 4, h); } }); }
function partyTex(c) { return (tc['party' + c] ||= canvasTex(128, 64, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i * 37) % w, (i * 23) % h, 5, 0, 7); g.fill(); } })); }
function coneTex() { return tc.cone ||= canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#ff6d00'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.25, w, h * 0.15); g.fillRect(0, h * 0.58, w, h * 0.15); }); }
function bagTex() { return tc.bag ||= canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#c8a27a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b1d16'; g.beginPath(); g.ellipse(w * 0.36, h * 0.42, 8, 10, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w * 0.64, h * 0.42, 8, 10, 0, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = '#2b1d16'; g.beginPath(); g.arc(w / 2, h * 0.55, 14, 0.3, Math.PI - 0.3); g.stroke(); }); }
function pumpkinFace() { return tc.pf ||= canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#ffde59'; g.beginPath(); g.moveTo(20, 30); g.lineTo(40, 10); g.lineTo(55, 34); g.fill(); g.beginPath(); g.moveTo(108, 30); g.lineTo(88, 10); g.lineTo(73, 34); g.fill(); g.beginPath(); g.moveTo(15, 55); for (let i = 0; i <= 8; i++) g.lineTo(15 + i * 12.25, i % 2 ? 62 : 52); g.lineTo(113, 60); g.quadraticCurveTo(64, 100, 15, 60); g.fill(); }); }
function skullTex() { return tc.sk ||= canvasTex(64, 64, (g) => emoji(g, '☠️', 32, 32, 50)); }
function starTex() { return tc.st ||= canvasTex(64, 64, (g) => emoji(g, '⭐', 32, 32, 56)); }
function sombreroTex() { return tc.so ||= canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9c46a'; g.fillRect(0, 0, w, h); const c = ['#e63946', '#2a9d8f', '#ffd23f']; for (let i = 0; i < 3; i++) { g.strokeStyle = c[i]; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 50 - i * 8, 0, 7); g.stroke(); } }); }
function mushroomTex() { return tc.mu ||= canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#e63946'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; [[16, 16, 9], [52, 10, 7], [90, 20, 10], [30, 42, 7], [72, 44, 8], [112, 46, 6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }); }
function stripeTex(c) { return (tc['str' + c] ||= canvasTex(64, 64, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let y = 4; y < h; y += 16) g.fillRect(0, y, w, 7); })); }
function jerseyTex(c) { return (tc['jer' + c] ||= canvasTex(128, 128, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = '900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('10', w / 2, h / 2); })); }

// ---------- キャラクター本体 ----------
// ---------- キャラクター本体（7頭身・肘/膝の関節つき） ----------
export const EYE_COLORS = ['#5b3a24', '#2b1d16', '#3a6ea5', '#3f8f5a', '#8a6a3a', '#6b6b6b', '#8e44ad', '#c0392b'];
const LIDS = { dot: 0.32, round: 0.22, happy: 0.6, sleepy: 0.56, sparkle: 0.24, wink: 0.32, angry: 0.44, cool: 0.47 };
const capsule = (r, len, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, len, cs, rs);
// 先細りの手足（上の太さ・ふくらみ・下の太さ）。カプセルの代わりに使うと筋肉のついた自然な形になる
function limb(rTop, rMid, rBot, len, midAt = 0.35, rs = 12) {
  const h = len / 2, pts = [];
  const cap = (r, cy, from, to, n) => { for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r), cy + Math.sin(a) * r)); } };
  cap(rBot, -h, -Math.PI / 2, 0, 4);
  pts.push(new THREE.Vector2(rMid, h - len * midAt));
  cap(rTop, h, 0, Math.PI / 2, 4);
  return new THREE.LatheGeometry(pts, rs);
}
export class Character {
  constructor(av, { lite = false, small = false, uniform = null } = {}) {
    this.av = sanitizeAvatar(av);
    if (uniform) { this.av.top = 'apron'; this.av.topColor = '#ffffff'; this.av.apronColor = uniform; if (this.av.hat === 'none' || Math.random() < 0.5) { this.av.hat = 'cap'; this.av.hatColor = uniform; } }
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.lite = lite;
    this.phase = Math.random() * 10; this.t = Math.random() * 10;
    this.anim = 'idle'; this.carry = false; this.speed = 0;
    this.spin = [];
    this.parts = {};
    this._build(small);
    this.body.scale.setScalar(this.av.height);
  }
  _pv(name, parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); this[name] = g; this.parts[name] = new THREE.Group(); return this.parts[name]; }
  _build(small) {
    const av = this.av;
    const skin = C(av.skin, { r: 0.55 });
    const topC = av.top === 'suit' ? '#2b2d42' : av.top === 'apron' ? '#ffffff' : av.topColor;
    // 近くで見るキャラ（プレイヤー・店員）は布の織り目つき
    const fab = !small && !this.lite;
    const cloth = fab ? smat(surf('fabric'), topC, { r: 0.88 }) : C(topC, { r: 0.85 });
    const pantsC = av.top === 'overalls' ? '#3d5a80' : av.top === 'suit' && av.bottom === 'pants' ? '#2b2d42' : av.bottomColor;
    const pants = fab ? smat(surf('fabric'), pantsC, { r: 0.9 }) : C(pantsC, { r: 0.85 });
    const shoe = C(av.shoeColor, { r: 0.5 }), sole = C('#2b2b2b', { r: 0.8 });
    const A = (grp, g, m, x = 0, y = 0, z = 0) => { const o = M(g, m); o.position.set(x, y, z); grp.add(o); return o; };
    const longSleeve = av.top === 'hoodie' || av.top === 'suit';
    const torsoMat = av.top === 'stripe' ? mat('#ffffff', { map: stripeTex(av.topColor), r: 0.85 }) : av.top === 'jersey' ? mat('#ffffff', { map: jerseyTex(av.topColor), r: 0.8 }) : cloth;
    const sleeveMat = av.top === 'stripe' ? torsoMat : cloth;

    // 脚（太もも→ひざ→すね→くつ）
    for (const [side, sx] of [['L', -1], ['R', 1]]) {
      const th = this._pv('thigh' + side, this.body, sx * 0.095, 0.93, 0);
      const legMat = av.bottom === 'skirt' || av.top === 'dress' ? skin : pants;
      const bareThigh = legMat === skin || av.bottom === 'shorts';
      A(th, bareThigh ? limb(0.07, 0.066, 0.052, 0.3, 0.3) : limb(0.074, 0.072, 0.06, 0.3, 0.3), legMat, 0, -0.21, 0);
      if (av.bottom === 'shorts') { A(th, T(cyl(0.08, 0.086, 0.24, 12, true), 0, -0.25), pants); A(th, T(torus(0.086, 0.006, 5, 14), 0, -0.25, 0, Math.PI / 2), C(shade(pantsC, -0.12), { r: 0.85 })); }
      const kn = this._pv('knee' + side, this[`thigh${side}`], 0, -0.43, 0);
      const longPants = av.bottom === 'pants' || av.top === 'overalls';
      const shinMat = longPants ? pants : skin;
      // ズボンはまっすぐ、素足はふくらはぎのふくらみ
      A(kn, longPants ? limb(0.062, 0.06, 0.055, 0.38, 0.3) : limb(0.054, 0.06, 0.036, 0.38, 0.28), shinMat, 0, -0.235, 0);
      if (longPants && !small) A(kn, T(torus(0.054, 0.005, 5, 14), 0, -0.43, 0, Math.PI / 2), C(shade(pantsC, -0.12), { r: 0.9 })); // すその折り返し
      if (!longPants && !small) A(kn, T(cyl(0.04, 0.042, 0.035, 12, true), 0, -0.455), C(av.shoeColor === '#ffffff' ? '#e8e8e8' : '#f4f4f4', { r: 0.9 })); // くつした
      // 足首から先（くつ）は足首の関節につける
      const an = this._pv('ankle' + side, this['knee' + side], 0, -0.45, 0);
      A(an, T(rbox(0.105, 0.07, 0.25, 0.03), 0, -0.04, 0.045), shoe);
      A(an, T(rbox(0.11, 0.02, 0.26, 0.008), 0, -0.05, 0.045), sole);
      A(an, T(rbox(0.104, 0.024, 0.07, 0.01), 0, -0.048, -0.045), sole); // かかと
      if (!small) {
        A(an, T(sph(0.054, 12, 8), 0, -0.02, 0.13, 0, 0, 0, 1, 0.62, 1.1), shoe); // つま先の丸み
        A(an, T(rbox(0.07, 0.012, 0.09, 0.004), 0, 0.017, 0.07, -0.25), C(shade(av.shoeColor, -0.12), { r: 0.6 })); // ベロ
        for (let i = 0; i < 3; i++) A(an, T(box(0.06, 0.005, 0.008), 0, 0.01 - i * 0.006, 0.05 + i * 0.026, -0.25), C('#f4f4f4', { r: 0.7 })); // くつひも
        A(an, T(cyl(0.056, 0.056, 0.012, 14, true), 0, 0, 0.005, 0, 0, 0, 1, 1, 1.05), shoe);
        A(an, T(box(0.112, 0.008, 0.2), 0, -0.033, 0.06), C(shade(av.shoeColor, -0.2), { r: 0.6 })); // くつの縫い目
      }
    }
    // 胴体（回転体で胸・腰のくびれ）
    const P = this._pv('torso', this.body, 0, 0.92, 0);
    const prof = [[0, -0.03], [0.14, -0.02], [0.158, 0.05], [0.142, 0.17], [0.156, 0.29], [0.172, 0.4], [0.178, 0.45], [0.12, 0.505], [0.05, 0.53], [0, 0.535]];
    const tg = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18, 0); tg.scale(1, 1, 0.64);
    A(P, tg, torsoMat);
    const pv = new THREE.LatheGeometry([[0, -0.05], [0.142, -0.04], [0.16, 0.02], [0.15, 0.1], [0, 0.11]].map(([x, y]) => new THREE.Vector2(x, y)), 18, 0); pv.scale(1, 1, 0.66);
    A(P, pv, av.top === 'dress' ? cloth : pants);
    for (const s of [-1, 1]) A(P, T(sph(0.07, 14, 8), s * 0.128, 0.462, -0.004, 0, 0, -s * 0.32, 1.5, 0.52, 0.86), torsoMat); // 首から肩へのライン
    if (av.top !== 'dress' && av.bottom !== 'skirt') for (const s of [-1, 1]) A(P, T(sph(0.074, 12, 8), s * 0.064, -0.012, -0.058, 0, 0, 0, 1, 0.95, 0.8), pants); // おしり
    if (['tshirt', 'stripe', 'jersey', 'hoodie'].includes(av.top) || !av.top) A(P, T(cyl(0.16, 0.168, 0.07, 18, true), 0, 0.045, 0, 0, 0, 0, 1, 1, 0.68), torsoMat); // シャツのすそ
    if (av.top !== 'dress' && av.bottom !== 'skirt' && !small) {
      const seam = C(shade(pantsC, -0.16), { r: 0.9 });
      for (const s of [-1, 1]) A(P, T(box(0.05, 0.004, 0.004), s * 0.1, 0.035, 0.1, 0, s * 0.5, s * 0.55), seam); // ポケットの口
      A(P, T(box(0.004, 0.07, 0.004), 0.012, 0.0, 0.106), seam); // 前の縫い目
    }
    if (av.bottom === 'skirt' || av.top === 'dress') A(P, new THREE.LatheGeometry([[0.255, -0.36], [0.262, -0.34], [0.205, -0.12], [0.152, 0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 20, 0), mat(av.top === 'dress' ? topC : pantsC, { r: 0.85, side: THREE.DoubleSide }));
    if (av.top !== 'dress') A(P, T(cyl(0.152, 0.152, 0.04, 18, true), 0, 0.07, 0, 0, 0, 0, 1, 1, 0.66), C('#3b2f2a', { r: 0.5 }));
    if (av.top !== 'dress' && !small) { A(P, T(rbox(0.045, 0.034, 0.01, 0.004), 0, 0.073, 0.1), C('#c9a227', { r: 0.25, m: 0.85 })); for (const s of [-1, 1]) A(P, T(box(0.012, 0.05, 0.006), s * 0.07, 0.065, 0.098), C('#3b2f2a', { r: 0.5 })); }
    // 襟まわり（Tシャツはリブ、えりの縫い目）
    if (['tshirt', 'stripe', 'jersey'].includes(av.top) || !av.top) A(P, T(torus(0.068, 0.011, 6, 18), 0, 0.508, 0.012, Math.PI / 2 + 0.18, 0, 0, 1, 0.66, 1), C(shade(topC, -0.1), { r: 0.85 }));
    if (av.top === 'tshirt' && !small) A(P, T(box(0.05, 0.004, 0.004), 0.07, 0.36, 0.113), C(shade(topC, -0.18), { r: 0.8 }));
    if (av.top === 'hoodie') { A(P, T(torus(0.11, 0.05, 8, 18), 0, 0.5, -0.06, Math.PI / 2 + 0.35), cloth); A(P, T(rbox(0.2, 0.09, 0.03, 0.02), 0, 0.12, 0.09), C(shade(av.topColor, -0.08), { r: 0.9 })); for (const s of [-1, 1]) A(P, T(cyl(0.005, 0.005, 0.12, 4), s * 0.04, 0.34, 0.112), C('#ffffff')); }
    if (av.top === 'apron') { const ac = C(av.apronColor || '#ff6b35', { r: 0.85 }); A(P, T(box(0.26, 0.52, 0.012), 0, -0.2, 0.108), ac); A(P, T(box(0.1, 0.06, 0.008), 0.05, 0.2, 0.116), C('#ffffff')); for (const s of [-1, 1]) A(P, T(box(0.025, 0.16, 0.012), s * 0.08, 0.33, 0.1, -0.1), ac); A(P, T(cyl(0.155, 0.155, 0.025, 18, true), 0, 0.12, 0, 0, 0, 0, 1, 1, 0.68), ac); }
    if (av.top === 'suit') { A(P, T(cone(0.06, 0.18, 3), 0, 0.33, 0.1, Math.PI, 0, 0, 1, 1, 0.25), C('#ffffff')); A(P, T(box(0.03, 0.17, 0.012), 0, 0.29, 0.112), C('#c0392b')); for (let i = 0; i < 2; i++) A(P, T(sph(0.008, 6, 4), 0, 0.12 + i * 0.07, 0.104), C('#111')); }
    if (av.top === 'overalls') { const d = C('#3d5a80', { r: 0.85 }); A(P, T(box(0.22, 0.2, 0.012), 0, 0.12, 0.103), d); for (const s of [-1, 1]) { A(P, T(box(0.035, 0.22, 0.012), s * 0.08, 0.3, 0.1, -0.12), d); A(P, T(sph(0.012, 6, 4), s * 0.08, 0.31, 0.112), C('#ffd166', { m: 0.8, r: 0.3 })); } }
    if (av.top === 'jersey') A(P, T(torus(0.07, 0.012, 6, 16, Math.PI), 0, 0.5, 0.045, Math.PI / 2 + 0.25, 0, Math.PI), C('#ffffff'));
    // 腕（肩→ひじ→手）
    for (const [side, sx] of [['L', -1], ['R', 1]]) {
      const sh = this._pv('shoulder' + side, this.torso, sx * 0.205, 0.44, 0);
      A(sh, sph(0.058, 12, 8), sleeveMat, 0, -0.01, 0);
      A(sh, limb(0.05, 0.048, 0.039, 0.18, 0.38), longSleeve ? sleeveMat : skin, 0, -0.14, 0);
      if (!longSleeve) { A(sh, T(cyl(0.056, 0.052, 0.12, 12, true), 0, -0.12), sleeveMat); A(sh, T(torus(0.053, 0.007, 5, 14), 0, -0.12, 0, Math.PI / 2), C(shade(topC, -0.1), { r: 0.85 })); }
      const el = this._pv('elbow' + side, this['shoulder' + side], 0, -0.27, 0);
      A(el, limb(0.041, 0.042, 0.029, 0.18, 0.3), longSleeve ? sleeveMat : skin, 0, -0.125, 0);
      if (longSleeve) A(el, T(cyl(0.041, 0.041, 0.03, 10), 0, -0.235), sleeveMat);
      if (small) {
        A(el, T(sph(0.042, 10, 8), 0, -0.27, 0.005, 0, 0, 0, 0.75, 1.15, 0.55), skin);
        A(el, T(capsule(0.012, 0.035, 2, 6), sx * -0.03, -0.25, 0.022, 0.3, 0, sx * 0.5), skin);
      } else {
        // 手のひら＋指4本＋親指
        A(el, T(rbox(0.058, 0.06, 0.026, 0.011), 0, -0.305, 0.004), skin);
        A(el, T(sph(0.03, 10, 8), 0, -0.252, 0.004, 0, 0, 0, 1, 0.7, 0.6), skin);
        for (let i = 0; i < 4; i++) {
          const fx = -0.021 + i * 0.014, len = [0.026, 0.032, 0.03, 0.022][i];
          A(el, T(capsule(0.0072, len, 2, 6), fx, -0.302 - len / 2, 0.006 + len * 0.16, 0.28 + i * 0.03, 0, 0), skin);
        }
        A(el, T(capsule(0.0085, 0.026, 2, 6), sx * -0.032, -0.28, 0.014, 0.35, 0, sx * 0.62), skin);
      }
    }
    // 首と頭（頭は単位空間で作って縮小：帽子・髪と共通）
    const NK = this._pv('neck', this.torso, 0, 0.52, 0);
    A(NK, cyl(0.045, 0.05, 0.08, 10), skin);
    const u = 0.4, hs = [0.9 * u, 1.12 * u, 1.0 * u];
    const hg = new THREE.Group(); hg.position.set(0, 0.06 + R * hs[1], 0.008); hg.scale.set(...hs); NK.add(hg);
    const coversHead = ['pumpkin', 'paperbag'].includes(av.hat);
    if (!coversHead) {
      A(hg, sph(R, small ? 22 : 30, small ? 16 : 22), mat('#ffffff', { map: faceTexture(av, small), r: 0.55 }));
      for (const s of [-1, 1]) A(hg, T(sph(0.055, 10, 8), s * R * 0.96, -0.01, -0.01, 0, 0, 0, 0.38, 1, 0.66), skin);
      if (!small) for (const s of [-1, 1]) A(hg, T(sph(0.03, 8, 6), s * 0.262, -0.012, -0.004, 0, 0, 0, 0.2, 0.72, 0.5), C(shade(av.skin, -0.14), { r: 0.6 })); // 耳の中のくぼみ
      // 目（立体の目玉＋まぶた）
      const eyeM = mat('#ffffff', { map: eyeTexture(av.eyeColor || '#5b3a24', av.eyes === 'sparkle'), r: 0.15 });
      for (const s of [-1, 1]) {
        const ex = s * 0.085, ey = 0.03, ez = 0.198;
        A(hg, sph(0.042, 16, 12), eyeM, ex, ey, ez);
        let k = LIDS[av.eyes] ?? 0.32;
        if (av.eyes === 'wink' && s > 0) k = 0.97;
        const lid = M(new THREE.SphereGeometry(0.0455, 16, 8, 0, Math.PI * 2, 0, Math.PI * k), skin);
        lid.position.set(ex, ey, ez); lid.rotation.x = 0.25;
        if (av.eyes === 'angry') lid.rotation.z = -s * 0.38;
        hg.add(lid);
        if (av.eyes === 'happy') { const lo = M(new THREE.SphereGeometry(0.0455, 16, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), skin); lo.position.set(ex, ey, ez); hg.add(lo); }
        // まつげのライン
        A(hg, T(torus(0.043, 0.006, 4, 12, Math.PI * 0.9), ex, ey + 0.004, ez + 0.006, -0.5 + (k - 0.32) * 1.6, 0, Math.PI * 0.05), C('#2a1d18', { r: 0.6 }));
        if (av.brow !== 'none') {
          const tilt = av.eyes === 'angry' ? s * 0.42 : av.eyes === 'sleepy' ? -s * 0.15 : -s * 0.08;
          A(hg, T(rbox(0.085, av.brow === 'thick' ? 0.026 : 0.016, 0.022, 0.007), ex, 0.105 + (av.eyes === 'round' ? 0.012 : 0), 0.212, -0.2, 0, tilt), C(shade(av.hairColor || '#3b2a20', -0.08), { r: 0.8 }));
        }
      }
      // 鼻
      A(hg, T(sph(0.034, 10, 8), 0, -0.035, 0.232, 0, 0, 0, 0.72, 1.05, 0.9), skin);
      A(hg, T(capsule(0.016, 0.06, 3, 6), 0, 0.005, 0.226, 0.25), skin);
      try { if (!(['astronaut', 'bear', 'dino', 'frog'].includes(av.hat) && av.hair !== 'none') || av.hat === 'astronaut') buildHair(hg, av); } catch (e) { console.warn('hair', e); }
      try { buildAcc(hg, av); } catch (e) { console.warn('acc', e); }
    }
    const keep = [];
    try { buildHat(hg, av, keep); } catch (e) { console.warn('hat', av.hat, e); }
    for (const k2 of keep) hg.remove(k2);
    // まばたき用のまぶた（ふだんは隠しておき、ときどき一瞬だけ出す）
    let blinkLids = null;
    if (!coversHead && !this.lite && !small) {
      const gs = [-1, 1].map((s) => { const g = new THREE.SphereGeometry(0.0468, 14, 10); g.translate(s * 0.085, 0.03, 0.198); return g; });
      blinkLids = M(merge(gs), C(av.skin, { r: 0.55 }), false);
      blinkLids.visible = false;
    }
    // 頭の部品は neck の parts へ移す
    this.parts.neck.add(hg);
    // 部位ごとに結合（単色は頂点カラーでまとめる）
    for (const [name, grp] of Object.entries(this.parts)) {
      const pivot = this[name];
      const baked = bakeGroup(grp);
      for (const c of [...baked.children]) pivot.add(c);
    }
    // 回る部品（プロペラ）は頭の動きに合わせて付ける
    for (const k2 of keep) {
      const holder = new THREE.Group(); holder.position.copy(hg.position); holder.scale.copy(hg.scale);
      holder.add(k2); this.neck.add(holder); if (k2.userData.spin) this.spin.push(k2);
    }
    if (blinkLids) {
      const holder = new THREE.Group(); holder.position.copy(hg.position); holder.scale.copy(hg.scale);
      holder.add(blinkLids); this.neck.add(holder); this.blink = blinkLids; this.blinkT = 1 + Math.random() * 3;
    }
    this.head = this.neck;
    this.armL = this.elbowL; this.armR = this.elbowR; // かご・荷物の取り付け先
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = !this.lite; o.receiveShadow = false; } });
  }
  setName(text, color) {
    if (this.nameSprite) { this.nameSprite.material.map.dispose(); this.nameSprite.material.dispose(); this.root.remove(this.nameSprite); this.nameSprite = null; }
    if (!text) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(text, color), depthWrite: false, transparent: true }));
    sp.scale.set(0.8, 0.2, 1); sp.position.y = 1.98 * this.av.height + (this.av.hat !== 'none' ? 0.14 : 0);
    sp.renderOrder = 5;
    this.root.add(sp); this.nameSprite = sp;
  }
  setBubble(kind, text) {
    const key = kind ? kind + (text || '') : null;
    if (key === this.bubbleKey) return;
    this.bubbleKey = key;
    if (this.bubble) { if (this.bubble.userData.own) this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.root.remove(this.bubble); this.bubble = null; }
    if (!kind) return;
    const t = bubbleTexture(kind, text);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
    const chat = kind === 'chat';
    sp.scale.set(chat ? 1.5 : 0.38, chat ? 0.375 : 0.38, 1);
    sp.position.y = 2.18 * this.av.height + (this.av.hat !== 'none' ? 0.16 : 0) + (chat ? 0.12 : 0);
    sp.userData.own = chat; sp.renderOrder = 6;
    this.root.add(sp); this.bubble = sp;
  }
  update(dt) {
    this.t += dt;
    const a = this.anim, walk = a === 'walk';
    if (walk) this.phase += dt * (4.6 + this.speed * 3.8);
    const s = walk ? Math.sin(this.phase) : 0;
    const k = Math.min(1, dt * 12);
    const to = (o, ax, v) => { o.rotation[ax] += (v - o.rotation[ax]) * k; };
    // 脚
    to(this.thighL, 'x', -s * 0.55); to(this.thighR, 'x', s * 0.55);
    to(this.kneeL, 'x', walk ? 0.08 + Math.max(0, Math.sin(this.phase - 1.1)) * 0.95 : 0.04);
    to(this.kneeR, 'x', walk ? 0.08 + Math.max(0, Math.sin(this.phase + Math.PI - 1.1)) * 0.95 : 0.04);
    // 足首：前に出した足はつま先が上がり、けり出す足はつま先が下がる
    if (this.ankleL) { to(this.ankleL, 'x', walk ? Math.sin(this.phase - 0.35) * 0.24 : 0); to(this.ankleR, 'x', walk ? -Math.sin(this.phase - 0.35) * 0.24 : 0); }
    // 腕
    // 前にふる腕はひじが少し曲がる
    let sl = s * 0.42, sr = -s * 0.42, el = -0.2 - Math.max(0, -s) * 0.28, er = -0.2 - Math.max(0, s) * 0.28, zl = -0.07, zr = 0.07;
    if (!walk) { const b = Math.sin(this.t * 1.5) * 0.03; sl = b; sr = -b; el = -0.12; er = -0.12; }
    if (this.carry) { sl = sr = -1.05; el = er = -0.75; zl = 0.18; zr = -0.18; }
    else if (a === 'reach') { sr = -1.4 + Math.sin(this.t * 6) * 0.2; er = -0.25; sl = -0.15; }
    else if (a === 'scan') { sr = -0.55; er = -1.05 + Math.sin(this.t * 7) * 0.25; sl = -0.45; el = -0.95; }
    else if (a === 'wave') { sr = -0.15; zr = 2.55; er = -0.6 + Math.sin(this.t * 9) * 0.45; }
    to(this.shoulderL, 'x', sl); to(this.shoulderR, 'x', sr); to(this.elbowL, 'x', el); to(this.elbowR, 'x', er);
    to(this.shoulderL, 'z', zl); to(this.shoulderR, 'z', zr);
    // 体
    this.body.position.y = walk ? Math.abs(Math.cos(this.phase)) * 0.028 : Math.sin(this.t * 2) * 0.004;
    to(this.torso, 'y', s * 0.07); to(this.torso, 'x', walk ? 0.04 : 0);
    to(this.torso, 'z', walk ? Math.sin(this.phase) * 0.022 : Math.sin(this.t * 0.45) * 0.01); // 体重の移動で少し左右にゆれる
    this.torso.scale.y = 1 + (walk ? 0 : Math.sin(this.t * 1.7) * 0.006); // 呼吸
    if (this.blink) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blink.visible = true; if (this.blinkT <= -0.11) { this.blink.visible = false; this.blinkT = 2 + Math.random() * 4.5; } }
    }
    to(this.neck, 'y', !walk && a === 'idle' ? Math.sin(this.t * 0.7) * 0.2 : -s * 0.05);
    for (const sp of this.spin) sp.rotation.y += dt * 14;
  }
  dispose() {
    this.setName(null); this.setBubble(null);
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.root.removeFromParent();
  }
}
