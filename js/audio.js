// ===== BGM（自動作曲→WAV化してバックグラウンド再生）と効果音 =====
import { mulberry32 } from './util.js';

export const TRACKS = [
  { id: 'pop', name: 'いらっしゃいマーチ', mood: '明るいポップ', bpm: 120, root: 60, mode: 'major', prog: [0, 4, 5, 3], bars: 24, style: 'pop', seed: 11 },
  { id: 'lofi', name: 'ローファイ・アイル', mood: 'まったりLo-Fi', bpm: 80, root: 62, mode: 'major', prog: [1, 4, 0, 5], bars: 16, style: 'lofi', seed: 23, sev: true },
  { id: 'bossa', name: 'ボサノバ・レジ', mood: 'おしゃれボサノバ', bpm: 104, root: 57, mode: 'major', prog: [0, 5, 1, 4], bars: 24, style: 'bossa', seed: 37, sev: true },
  { id: 'chip', name: '8ビット・バーゲン', mood: 'レトロゲーム', bpm: 144, root: 64, mode: 'major', prog: [0, 5, 3, 4], bars: 32, style: 'chip', seed: 5 },
  { id: 'jazz', name: 'ナイトシフト', mood: '夜のジャズ', bpm: 96, root: 58, mode: 'major', prog: [1, 4, 0, 0], bars: 24, style: 'jazz', seed: 71, sev: true },
  { id: 'funk', name: 'タイムセール・ファンク', mood: 'ノリノリファンク', bpm: 110, root: 55, mode: 'minor', prog: [0, 0, 3, 4], bars: 24, style: 'funk', seed: 19, sev: true },
];
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function chordNotes(root, mode, deg, sev) {
  const sc = SCALES[mode], out = [];
  for (const k of sev ? [0, 2, 4, 6] : [0, 2, 4]) { const d = deg + k; out.push(root + sc[d % 7] + 12 * Math.floor(d / 7)); }
  return out;
}
function scaleNote(root, mode, step) { const sc = SCALES[mode]; const o = Math.floor(step / 7); return root + sc[((step % 7) + 7) % 7] + 12 * o; }

// ---------- 作曲 ----------
function compose(tr) {
  const r = mulberry32(tr.seed), ev = [];
  const beat = 60 / tr.bpm, bar = beat * 4;
  const swing = tr.style === 'lofi' || tr.style === 'jazz' ? 0.16 : 0;
  const sw = (t8) => (t8 % 2 ? swing * beat : 0);
  const N = (t, dur, inst, midi, vel = 0.5) => ev.push({ t, dur, inst, f: mtof(midi), vel });
  const D = (t, inst, vel = 0.6) => ev.push({ t, dur: 0.3, inst, vel });
  // メロディのモチーフ（4小節）を作って繰り返す
  const rhythms = [[0, 2, 3, 4, 6], [0, 1, 2, 4, 5, 6], [0, 3, 4, 6, 7], [0, 2, 4, 6], [1, 2, 3, 5, 6], [0, 4]];
  const motif = [];
  for (let b = 0; b < 4; b++) {
    const rh = rhythms[Math.floor(r() * rhythms.length)];
    motif.push(rh.map((p, i) => ({ p, step: Math.floor(r() * 5) - 1 + (i === 0 ? 0 : Math.floor(r() * 3) - 1), len: i === rh.length - 1 ? 8 - p : (rh[i + 1] - p) })));
  }
  const motifB = motif.map((m) => m.map((n) => ({ ...n, step: n.step + 2 })));
  for (let b = 0; b < tr.bars; b++) {
    const t0 = b * bar, deg = tr.prog[b % tr.prog.length];
    const ch = chordNotes(tr.root, tr.mode, deg, tr.sev);
    const sec = Math.floor(b / 4) % 4; // A A B A
    const mot = (sec === 2 ? motifB : motif)[b % 4];
    const lastBar = b % 4 === 3;
    // ベース
    const bassRoot = ch[0] - 24;
    if (tr.style === 'jazz') { for (let i = 0; i < 4; i++) N(t0 + i * beat, beat * 0.9, 'bass', bassRoot + [0, 4, 7, 5][i] - (i === 3 ? 1 : 0), 0.55); }
    else if (tr.style === 'bossa') { N(t0, beat * 1.4, 'bass', bassRoot, 0.6); N(t0 + beat * 1.5, beat * 0.4, 'bass', bassRoot + 7, 0.5); N(t0 + beat * 2, beat * 1.4, 'bass', bassRoot + 7, 0.55); N(t0 + beat * 3.5, beat * 0.4, 'bass', bassRoot, 0.5); }
    else if (tr.style === 'funk') { [[0, 0], [0.75, 12], [1.5, 0], [2, 7], [2.5, 10], [3.25, 12], [3.5, 0]].forEach(([p, o]) => N(t0 + p * beat, beat * 0.22, 'bass', bassRoot + o, 0.65)); }
    else if (tr.style === 'lofi') { N(t0, beat * 1.8, 'bass', bassRoot, 0.55); N(t0 + beat * 2.5, beat * 1.2, 'bass', bassRoot + (r() < 0.5 ? 7 : 0), 0.45); }
    else { for (let i = 0; i < 8; i++) N(t0 + i * beat / 2 + sw(i), beat * 0.42, 'bass', bassRoot + (i % 4 === 3 ? 7 : 0), tr.style === 'chip' ? 0.4 : 0.5); }
    // 和音
    if (tr.style === 'pop') { for (let i = 0; i < 4; i++) for (const n of ch) N(t0 + i * beat + (i % 2 ? 0 : 0), beat * 0.8, 'keys', n, 0.16); }
    else if (tr.style === 'lofi' || tr.style === 'jazz') { const hits = tr.style === 'jazz' ? [0, 1.66, 2.5] : [0, 2.5]; for (const h of hits) for (const n of ch) N(t0 + h * beat + 0.02 * r(), beat * (tr.style === 'lofi' ? 2.2 : 0.9), 'ep', n, 0.2); }
    else if (tr.style === 'bossa') { [0, 1.5, 2.5, 3.5].forEach((h) => ch.forEach((n, k) => N(t0 + h * beat + k * 0.012, beat * 0.5, 'pluck', n + (k === 0 ? 12 : 0), 0.22))); }
    else if (tr.style === 'funk') { [0.5, 1.25, 2.5, 3.25].forEach((h) => ch.forEach((n) => N(t0 + h * beat, beat * 0.18, 'clav', n + 12, 0.18))); for (const n of ch) N(t0, bar, 'pad', n, 0.06); }
    else if (tr.style === 'chip') { for (let i = 0; i < 16; i++) N(t0 + i * beat / 4, beat / 4.2, 'pulse2', ch[i % 3] + 12, 0.1); }
    // メロディ
    const lead = { pop: 'lead', lofi: 'ep', bossa: 'flute', chip: 'pulse', jazz: 'vibes', funk: 'lead' }[tr.style];
    const playLead = tr.style !== 'lofi' || b % 8 >= 4;
    if (playLead) for (const n of mot) {
      let base = 7 + n.step + (lastBar && n === mot[mot.length - 1] ? -n.step : 0);
      // 強拍はコードトーンに寄せる
      let midi = scaleNote(tr.root, tr.mode, base);
      if (n.p % 4 === 0) { let best = ch[0] + 12, bd = 99; for (const c of ch) for (const o of [0, 12]) { const d = Math.abs(c + o - midi); if (d < bd) { bd = d; best = c + o; } } midi = best; }
      if (midi < tr.root + 2) midi += 12;
      N(t0 + n.p * beat / 2 + sw(n.p), Math.max(0.12, n.len * beat / 2 * 0.9), lead, midi, tr.style === 'chip' ? 0.16 : 0.24);
    }
    // ドラム
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * beat / 4 + (i % 2 ? swing * beat * 0.5 : 0);
      switch (tr.style) {
        case 'pop': if (i % 8 === 0 || i === 10) D(t, 'kick', 0.9); if (i % 8 === 4) D(t, 'snare', 0.7); if (i % 2 === 0) D(t, 'hat', i % 4 ? 0.25 : 0.4); break;
        case 'lofi': if (i === 0 || i === 7 || i === 10) D(t, 'kick', 0.7); if (i % 8 === 4) D(t, 'snare', 0.4); if (i % 2 === 0) D(t, 'hat', 0.18); break;
        case 'bossa': if (i % 8 === 0 || i % 8 === 6) D(t, 'kick', 0.5); if ([0, 3, 6, 10, 12].includes(i)) D(t, 'rim', 0.45); D(t, 'shaker', i % 2 ? 0.12 : 0.2); break;
        case 'chip': if (i % 8 === 0) D(t, 'nkick', 0.6); if (i % 8 === 4) D(t, 'nsnare', 0.45); if (i % 2 === 0) D(t, 'nhat', 0.14); break;
        case 'jazz': if (i % 4 === 0 || i % 4 === 3) D(t, 'ride', i % 4 === 0 ? 0.3 : 0.18); if (i % 8 === 4) D(t, 'hat', 0.2); if (i === 14 && b % 2) D(t, 'snare', 0.15); break;
        case 'funk': if (i === 0 || i === 3 || i === 10) D(t, 'kick', 0.85); if (i % 8 === 4) D(t, 'snare', 0.75); if (i === 15 || i === 7) D(t, 'snare', 0.2); D(t, 'hat', i % 2 ? 0.16 : 0.3); break;
      }
    }
  }
  return { ev, length: tr.bars * bar, bar };
}

// ---------- 合成（JSで直接波形を作るので速い） ----------
const TAU = Math.PI * 2;
const PAN = { keys: -0.3, ep: -0.2, pluck: 0.3, hat: 0.35, shaker: 0.4, ride: 0.3, clav: 0.35, vibes: -0.25, pulse2: -0.4, rim: -0.3, flute: 0.15 };
function wave(type, ph) {
  const f = ph - Math.floor(ph);
  switch (type) {
    case 'sine': return Math.sin(ph * TAU);
    case 'tri': return 1 - 4 * Math.abs(f - 0.5);
    case 'sq': return f < 0.5 ? 0.8 : -0.8;
    case 'saw': return 2 * f - 1;
    case 'p25': return f < 0.25 ? 0.8 : -0.8;
    case 'p12': return f < 0.125 ? 0.8 : -0.8;
    default: return 0;
  }
}
// 1音を左右バッファに足し込む
function voice(L, R, SR, e, rnd) {
  const inst = e.inst, v = e.vel, f0 = e.f;
  const pan = PAN[inst] || 0, gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  let A = 0.005, D = 0.2, S = 0.6, Rl = 0.08, peak = v, lpf = 0, hpf = 0;
  let gen;
  let p1 = 0, p2 = 0, p3 = 0;
  const dt = 1 / SR;
  switch (inst) {
    case 'bass': A = 0.005; D = 0.15; S = 0.7; Rl = 0.05; peak = v * 0.9; lpf = 900; gen = () => { p1 += f0 * dt; p2 += f0 * 0.5 * dt; return wave('tri', p1) + 0.6 * wave('sine', p2); }; break;
    case 'keys': D = 0.25; S = 0.35; Rl = 0.1; gen = () => { p1 += f0 * dt; p2 += f0 * 2 * dt; return wave('tri', p1) + 0.3 * wave('sine', p2); }; break;
    case 'ep': A = 0.004; D = 0.6; S = 0.5; Rl = 0.25; { let k = 0; gen = (t) => { p2 += f0 * 2 * dt; const idx = 1.2 * Math.exp(-t / 0.3) + 0.1; p1 += f0 * dt; k = Math.sin(p1 * TAU + idx * Math.sin(p2 * TAU)); return k; }; } break;
    case 'pluck': A = 0.002; D = 0.18; S = 0.15; Rl = 0.15; peak = v * 0.8; lpf = 2200; gen = () => { p1 += f0 * dt; p2 += f0 * 1.003 * dt; return wave('tri', p1) + 0.5 * wave('saw', p2); }; break;
    case 'lead': A = 0.01; D = 0.2; S = 0.6; Rl = 0.08; peak = v * 0.36; lpf = 1900; gen = (t) => { const vib = 1 + 0.0035 * Math.sin(t * 5.5 * TAU); p1 += f0 * vib * dt; p2 += f0 * 1.004 * vib * dt; return wave('sq', p1) * 0.7 + wave('saw', p2) * 0.5; }; break;
    case 'flute': A = 0.05; D = 0.3; S = 0.8; Rl = 0.12; peak = v * 0.8; gen = (t) => { const vib = 1 + 0.005 * Math.sin(t * 4.8 * TAU); p1 += f0 * vib * dt; p2 += f0 * 2 * vib * dt; return wave('sine', p1) + 0.15 * wave('tri', p2) + (rnd() - 0.5) * 0.04; }; break;
    case 'vibes': A = 0.002; D = 0.5; S = 0.2; Rl = 0.4; peak = v * 0.9; gen = (t) => { p1 += f0 * dt; p2 += f0 * 4 * dt; return wave('sine', p1) * (1 + 0.15 * Math.sin(t * 6 * TAU)) + 0.12 * wave('sine', p2); }; break;
    case 'clav': A = 0.002; D = 0.08; S = 0.3; Rl = 0.04; peak = v * 1.1; lpf = 2400; hpf = 500; gen = () => { p1 += f0 * dt; return wave('saw', p1); }; break;
    case 'pad': A = 0.4; D = 0.8; S = 0.8; Rl = 0.5; lpf = 900; gen = () => { p1 += f0 * 0.996 * dt; p2 += f0 * 1.004 * dt; return wave('saw', p1) + wave('saw', p2); }; break;
    case 'pulse': A = 0.002; D = 0.1; S = 0.6; Rl = 0.03; peak = v * 0.5; gen = () => { p1 += f0 * dt; return wave('p25', p1); }; break;
    case 'pulse2': A = 0.002; D = 0.05; S = 0.4; Rl = 0.02; peak = v * 0.5; gen = () => { p1 += f0 * dt; return wave('p12', p1); }; break;
    default: return drum(L, R, SR, e, rnd, gl, gr);
  }
  const start = Math.floor(e.t * SR), relEnd = e.dur + Rl * 5, n = Math.min(L.length - start, Math.ceil(relEnd * SR));
  const kl = lpf ? 1 - Math.exp(-TAU * lpf / SR) : 0, kh = hpf ? 1 - Math.exp(-TAU * hpf / SR) : 0;
  let yl = 0, yh = 0, relV = null;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    let env;
    if (t < A) env = peak * t / A;
    else if (t < e.dur) env = peak * (S + (1 - S) * Math.exp(-(t - A) / D));
    else { if (relV === null) relV = peak * (S + (1 - S) * Math.exp(-(e.dur - A) / D)); env = relV * Math.exp(-(t - e.dur) / Rl); }
    let x = gen(t);
    if (kl) { yl += (x - yl) * kl; x = yl; }
    if (kh) { yh += (x - yh) * kh; x = x - yh; }
    x *= env;
    L[start + i] += x * gl; R[start + i] += x * gr;
  }
}
function drum(L, R, SR, e, rnd, gl, gr) {
  const v = e.vel, start = Math.floor(e.t * SR), dt = 1 / SR;
  const len = { kick: 0.35, nkick: 0.3, snare: 0.22, nsnare: 0.18, hat: 0.07, nhat: 0.06, shaker: 0.09, ride: 0.45, rim: 0.05 }[e.inst] || 0.1;
  const n = Math.min(L.length - start, Math.ceil(len * SR));
  let ph = 0, lp = 0, lp2 = 0;
  const kHat = 1 - Math.exp(-TAU * 6000 / SR), kSn = 1 - Math.exp(-TAU * 1500 / SR);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    let x = 0;
    switch (e.inst) {
      case 'kick': case 'nkick': { const f = 42 + 108 * Math.exp(-t / 0.035); ph += f * dt; x = (e.inst === 'nkick' ? wave('sq', ph) * 0.7 : Math.sin(ph * TAU)) * Math.exp(-t / 0.09) * v; break; }
      case 'snare': case 'nsnare': { const nz = rnd() * 2 - 1; lp += (nz - lp) * kSn; ph += 190 * dt; x = ((nz - lp) * 0.7 * Math.exp(-t / 0.045) + (e.inst === 'snare' ? Math.sin(ph * TAU) * 0.5 * Math.exp(-t / 0.03) : 0)) * v; break; }
      case 'hat': case 'nhat': case 'shaker': case 'ride': {
        const nz = rnd() * 2 - 1; lp += (nz - lp) * kHat; lp2 += ((nz - lp) - lp2) * 0.5;
        const dec = e.inst === 'ride' ? 0.12 : e.inst === 'shaker' ? 0.025 : 0.014;
        x = (nz - lp) * 0.5 * Math.exp(-t / dec) * v; if (e.inst === 'ride') { ph += 3800 * dt; x += Math.sin(ph * TAU) * 0.05 * Math.exp(-t / 0.2) * v; } break;
      }
      case 'rim': { ph += 1700 * dt; x = wave('sq', ph) * 0.35 * Math.exp(-t / 0.012) * v; break; }
    }
    L[start + i] += x * gl; R[start + i] += x * gr;
  }
}

export async function renderTrack(tr) {
  const SR = 24000;
  const { ev, length, bar } = compose(tr);
  const total = length + bar;
  const N = Math.floor(length * SR), T = Math.ceil(total * SR);
  const L = new Float32Array(T), R = new Float32Array(T);
  const rnd = mulberry32(tr.seed * 13 + 7);
  let k = 0;
  for (const e of ev) { voice(L, R, SR, e, rnd); if (++k % 150 === 0) await new Promise((r) => setTimeout(r, 0)); }
  if (tr.style === 'lofi') for (let i = 0; i < T; i++) { const c = rnd() < 0.0004 ? (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 0.006; L[i] += c; R[i] += c; }
  // ステレオディレイ（残響っぽく）
  const dl = Math.floor(60 / tr.bpm * 0.75 * SR), fb = 0.28, wet = 0.2;
  const dL = new Float32Array(T), dR = new Float32Array(T);
  let lpL = 0, lpR = 0;
  for (let i = 0; i < T; i++) {
    const inL = i >= dl ? L[i - dl] * 0.5 + dR[i - dl] * fb : 0, inR = i >= dl ? R[i - dl] * 0.5 + dL[i - dl] * fb : 0;
    lpL += (inL - lpL) * 0.35; lpR += (inR - lpR) * 0.35; dL[i] = lpL; dR[i] = lpR;
  }
  for (let i = 0; i < T; i++) { L[i] += dL[i] * wet; R[i] += dR[i] * wet; }
  // 末尾の余韻を先頭へ（ループ継ぎ目を自然に）
  for (let i = N; i < T; i++) { L[i - N] += L[i]; R[i - N] += R[i]; }
  // 音量をそろえてソフトクリップ
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = pk > 0 ? 0.85 / pk : 1;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * g * 1.2) * 0.9; R[i] = Math.tanh(R[i] * g * 1.2) * 0.9; }
  return encodeWav([L, R], N, SR);
}
function encodeWav(chans, n, sr) {
  const nc = chans.length, bytes = 44 + n * nc * 2, ab = new ArrayBuffer(bytes), v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}

// ---------- 再生管理 ----------
// 効果音と音楽で同じ AudioContext を使う（同時に鳴らせる）
let _ctx = null;
export function audioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { _ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { _ctx = new AC(); }
  }
  return _ctx;
}
// iPhone の音の扱い
//  mix（ふつう）：'ambient' … Spotify などほかのアプリの音楽を止めずに、いっしょに鳴る。マナーモード中はゲームの音は鳴らない
//  solo         ：'playback' … マナーモードでも鳴るが、ほかのアプリの音楽は止まる（iPhoneの仕組みで両方は選べない）
// どちらもゲームの中だけで鳴らすので、ダイナミックアイランドやロック画面には出ない
let _sessionType = null;
function setSession(settings) {
  try {
    if (!navigator.audioSession) return;
    const type = settings.soundMode === 'solo' ? 'playback' : 'ambient';
    if (navigator.audioSession.type === type && _sessionType === type) return;
    navigator.audioSession.type = type; _sessionType = type;
    // 鳴っている途中で切り替えたときは、いったん止めて再開すると新しい鳴らし方になる
    if (_ctx && _ctx.state === 'running') _ctx.suspend().then(() => (document.hidden ? null : _ctx.resume())).catch(() => {});
  } catch (e) { /* 未対応 */ }
}
export function applySoundMode(settings) { setSession(settings); }
export class Music {
  constructor(settings) {
    this.settings = settings;
    this.el = null;          // バックグラウンド再生をオンにしたときだけ使う <audio>
    this.blobs = new Map(); this.urls = new Map(); this.bufs = new Map();
    this.src = null; this.gain = null; this.current = null; this.mode = null; this.unlocked = false; this.loading = null;
    setSession(settings);
    this.settings.bgPlay = false; // バックグラウンドでは流さない
    // アプリを離れたら（別アプリ・ホーム画面・画面ロック）音を止め、戻ってきたら再開する
    const pause = () => { this.el?.pause(); try { _ctx?.suspend?.()?.catch?.(() => {}); } catch (e) { /* noop */ } };
    const resume = () => { if (!this.unlocked || document.hidden) return; try { _ctx?.resume?.()?.catch?.(() => {}); } catch (e) { /* noop */ } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', resume);
    document.addEventListener('freeze', pause);
    window.addEventListener('focus', resume);
  }
  step(d) {
    const ids = TRACKS.map((t) => t.id);
    let i = ids.indexOf(this.settings.bgm); i = (i + d + ids.length) % ids.length;
    this.settings.bgm = ids[i]; this.play(ids[i]); this.onChange && this.onChange(ids[i]);
  }
  async unlock() { this.unlocked = true; try { await audioCtx()?.resume(); } catch (e) { /* noop */ } await this.play(this.settings.bgm); }
  setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = v;
    if (this.el) this.el.volume = v;
  }
  _stopWA() { if (this.src) { try { this.src.stop(); } catch (e) { /* noop */ } try { this.src.disconnect(); } catch (e) { /* noop */ } this.src = null; } }
  _stopEl() { if (this.el) { this.el.pause(); } this._clearMeta(); }
  _clearMeta() {
    const ms = navigator.mediaSession; if (!ms) return;
    try { ms.metadata = null; ms.playbackState = 'none'; for (const k of ['play', 'pause', 'nexttrack', 'previoustrack']) ms.setActionHandler(k, null); } catch (e) { /* noop */ }
  }
  async _blob(id) {
    if (id === 'custom') return { blob: await loadCustom(), title: '自分の曲', mood: 'マイミュージック' };
    const tr = TRACKS.find((t) => t.id === id) || TRACKS[0];
    let blob = this.blobs.get(tr.id);
    if (!blob) {
      this.loading = tr.id; this.onLoading && this.onLoading(true);
      try {
        const key = 'bgm-' + tr.id + '-' + BGM_VER;
        blob = await idbGet(key);
        if (!blob) { blob = await renderTrack(tr); idbPut(key, blob).catch(() => {}); }
        this.blobs.set(tr.id, blob);
      } catch (e) { console.warn('BGM生成失敗', e); blob = null; }
      this.onLoading && this.onLoading(false);
    }
    return { blob, title: tr.name, mood: tr.mood };
  }
  async play(id) {
    setSession(this.settings);
    const vol = this.settings.bgmVol ?? 0.6;
    if (id === 'off') { this._stopWA(); this._stopEl(); this.current = null; return; }
    const { blob, title, mood } = await this._blob(id);
    if (!blob) { if (id === 'custom') { this.settings.bgm = 'pop'; return this.play('pop'); } return; }
    if (this.settings.bgm !== id) return; // 生成中に曲が変わった
    const mode = 'wa'; // いつもゲームの中だけで鳴らす（バックグラウンド再生・アイランド表示なし）
    if (mode === 'el') {
      // バックグラウンド再生：<audio> で流す（ロック画面・ダイナミックアイランドにも出る）
      this._stopWA();
      if (!this.el) { this.el = new Audio(); this.el.loop = true; this.el.preload = 'auto'; this.el.setAttribute('playsinline', ''); }
      let url = this.urls.get(id);
      if (!url || id === 'custom') { url = URL.createObjectURL(blob); this.urls.set(id, url); }
      if (this.current !== id || this.mode !== 'el') this.el.src = url;
      this.el.volume = vol;
      this.mode = 'el'; this.current = id;
      if (this.unlocked) this.el.play().catch((e) => console.warn('再生できません', e));
      const ms = navigator.mediaSession;
      if (ms && window.MediaMetadata) {
        try {
          ms.metadata = new MediaMetadata({ title, artist: 'Mart Mates', album: mood });
          ms.setActionHandler('play', () => this.el.play()); ms.setActionHandler('pause', () => this.el.pause());
          ms.setActionHandler('nexttrack', () => this.step(1)); ms.setActionHandler('previoustrack', () => this.step(-1));
        } catch (e) { /* noop */ }
      }
      return;
    }
    // ふだん：効果音と同じ AudioContext でループ再生（アイランドには出ない・効果音と同時に鳴る）
    this._stopEl();
    const ctx = audioCtx(); if (!ctx) return;
    let buf = this.bufs.get(id);
    if (!buf || id === 'custom') {
      try {
        const ab = await blob.arrayBuffer();
        buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
        if (id !== 'custom') this.bufs.set(id, buf);
      } catch (e) { console.warn('BGMを読み込めません', e); return; }
    }
    if (this.settings.bgm !== id || this.settings.bgPlay) return;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.connect(ctx.destination); }
    this.gain.gain.value = vol;
    if (!this.unlocked) return; // 最初のタップまでは準備だけ
    if (this.mode === 'wa' && this.current === id && this.src) return; // もう流れている
    this._stopWA();
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.gain);
    s.start(); this.src = s; this.mode = 'wa'; this.current = id;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
}

// 自分の曲をIndexedDBに保存
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('martmates', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
const BGM_VER = 'v1';
async function idbPut(key, val) {
  const db = await idb();
  await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbGet(key) {
  try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction('files'); const q = tx.objectStore('files').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; }
}
export const saveCustom = (file) => idbPut('bgm', file);
export const loadCustom = () => idbGet('bgm');

// ---------- 効果音 ----------
export class Sfx {
  constructor(settings) { this.settings = settings; this.ctx = null; this.last = {}; }
  unlock() {
    if (!this.ctx) { this.ctx = audioCtx(); if (!this.ctx) return; this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  play(name, vol = 1) {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    this.master.gain.value = (this.settings.sfxVol ?? 0.8) * vol;
    const tone = (f, t, d, type = 'sine', v = 0.3, f2) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, now + t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + t + d);
      g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(v, now + t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + t + d);
      o.connect(g); g.connect(this.master); o.start(now + t); o.stop(now + t + d + 0.05);
    };
    const noise = (t, d, v = 0.2, hp = 2000) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain();
      g.gain.setValueAtTime(v, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + d); s.connect(f); f.connect(g); g.connect(this.master); s.start(now + t);
    };
    switch (name) {
      case 'scan': tone(1850, 0, 0.09, 'square', 0.12); break;
      case 'cash': tone(1318, 0, 0.12, 'triangle', 0.25); tone(1760, 0.08, 0.25, 'triangle', 0.25); noise(0.0, 0.15, 0.08, 5000); break;
      case 'bell': tone(988, 0, 0.6, 'sine', 0.25); tone(784, 0.25, 0.8, 'sine', 0.25); break;
      case 'pick': tone(420, 0, 0.08, 'triangle', 0.25, 620); break;
      case 'place': tone(220, 0, 0.1, 'triangle', 0.3, 140); noise(0, 0.06, 0.08, 800); break;
      case 'stock': tone(700 + Math.random() * 200, 0, 0.05, 'triangle', 0.15); break;
      case 'trash': noise(0, 0.25, 0.2, 400); tone(160, 0, 0.2, 'sawtooth', 0.1, 80); break;
      case 'err': tone(220, 0, 0.12, 'square', 0.12); tone(180, 0.12, 0.15, 'square', 0.12); break;
      case 'click': tone(900, 0, 0.04, 'sine', 0.15); break;
      case 'coin': tone(1400 + Math.random() * 300, 0, 0.08, 'triangle', 0.2); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3, 'square', 0.1)); break;
      case 'build': noise(0, 0.12, 0.25, 300); tone(300, 0, 0.15, 'triangle', 0.25, 180); break;
      case 'truck': tone(90, 0, 0.5, 'sawtooth', 0.08, 70); tone(660, 0.3, 0.12, 'square', 0.06); tone(660, 0.5, 0.12, 'square', 0.06); break;
      case 'chat': tone(1200, 0, 0.06, 'sine', 0.15); tone(1600, 0.06, 0.08, 'sine', 0.15); break;
      case 'jump': tone(330, 0, 0.12, 'triangle', 0.15, 520); break;
      case 'boxopen': noise(0, 0.18, 0.12, 1800); tone(260, 0.02, 0.08, 'triangle', 0.12, 380); noise(0.12, 0.1, 0.08, 2500); break;
      case 'boxclose': noise(0, 0.1, 0.12, 1500); tone(200, 0, 0.1, 'triangle', 0.18, 140); break;
      case 'drop': tone(700, 0, 0.5, 'sine', 0.06, 300); tone(110, 0.7, 0.18, 'triangle', 0.3, 60); noise(0.7, 0.18, 0.18, 300); tone(95, 0.95, 0.14, 'triangle', 0.22, 55); noise(0.95, 0.14, 0.12, 300); break;
      default: break;
    }
  }
}
