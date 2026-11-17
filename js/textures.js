// ===== キャンバスで描くテクスチャ類（色・法線・粗さ） =====
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const FONT = '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",system-ui,sans-serif';
const SANS = '"Hiragino Sans","Noto Sans JP","Yu Gothic",system-ui,sans-serif';
const SERIF = '"Hiragino Mincho ProN","Noto Serif JP","Yu Mincho",serif';
let ANISO = 4, HQ = true, UQ = false;
export function setAniso(v) { ANISO = v; }
export function setTexQuality(hq, ultra = false) { HQ = hq; UQ = ultra; }
const S = (n) => (HQ ? n : Math.max(64, n >> 1));

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: false })];
}
export function toTex(canvas, { repeat, srgb = true, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}
export function canvasTex(w, h, draw, opts) { const [c, g] = makeCanvas(w, h); draw(g, w, h); return toTex(c, opts); }

// 色の明るさ調整（three.jsに頼らない純粋な計算）
export function hexToHsl(hex) {
  let s = String(hex).replace('#', ''); if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.padStart(6, '0').slice(0, 6), 16) || 0;
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, sat = 0;
  if (mx !== mn) {
    const d = mx - mn; sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return { h, s: sat, l };
}
function hslToHex(h, s, l) {
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  let r, g, b;
  if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}
export function shade(hex, amt) {
  const c = hexToHsl(hex);
  return hslToHex(c.h, c.s, Math.max(0, Math.min(1, c.l + amt)));
}
export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function fitText(g, text, maxW, size, weight = 800, family = FONT) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 6);
}
export function emoji(g, e, x, y, size) {
  g.save(); g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); g.restore();
}
function noise(g, w, h, amt, seed = 1) {
  const r = mulberry32(seed), img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
// なめらかなムラ（小さな乱数画像を拡大して重ねる）
function clouds(g, w, h, seed, { alpha = 0.25, octaves = [6, 16, 48], dark = '#000', light = '#fff' } = {}) {
  const r = mulberry32(seed);
  for (const o of octaves) {
    const [c, cg] = makeCanvas(o, o);
    const im = cg.createImageData(o, o);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    cg.putImageData(im, 0, 0);
    g.save(); g.globalAlpha = alpha / octaves.length * 1.6; g.globalCompositeOperation = 'overlay'; g.imageSmoothingEnabled = true;
    g.drawImage(c, 0, 0, w, h); g.restore();
  }
  void dark; void light;
}
// 高さ画像から法線マップを作る
function normalFromHeight(srcCanvas, strength = 2) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const sd = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = makeCanvas(w, h);
  const out = g.createImageData(w, h), od = out.data;
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const nx = -dx, ny = dy, nz = 1, l = Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4;
    od[i] = (nx / l * 0.5 + 0.5) * 255; od[i + 1] = (ny / l * 0.5 + 0.5) * 255; od[i + 2] = (nz / l * 0.5 + 0.5) * 255; od[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

// ---------- 質感セット（色＋法線＋粗さ） ----------
const surfCache = {};
// draw(g,w,h,mode) mode: 'color' | 'height' | 'rough'
function makeSurf(size, draw, { repeat = [1, 1], normal = 2, rough = true } = {}) {
  const n = S(size);
  const [cc, cg] = makeCanvas(n, n); draw(cg, n, n, 'color');
  const set = { map: toTex(cc, { repeat }) };
  if (HQ && normal) { const [hc, hg] = makeCanvas(n, n); draw(hg, n, n, 'height'); set.normalMap = toTex(normalFromHeight(hc, normal * n / 512), { repeat, srgb: false }); }
  if (rough) { const [rc, rg] = makeCanvas(n, n); draw(rg, n, n, 'rough'); set.roughnessMap = toTex(rc, { repeat, srgb: false }); }
  return set;
}
export function surf(name) { return (surfCache[name] ||= SURF[name]()); }
function drawPaint(g, w, h, m) {
  g.fillStyle = m === 'color' ? '#f3efe7' : m === 'height' ? '#808080' : '#e6e6e6'; g.fillRect(0, 0, w, h);
  clouds(g, w, h, 41, { alpha: m === 'color' ? 0.06 : 0.3, octaves: [32, 96] });
  if (m !== 'rough') noise(g, w, h, m === 'color' ? 4 : 30, 5);
}
function drawBrick(g, w, h, m) {
  g.fillStyle = m === 'color' ? '#cdc5b9' : m === 'height' ? '#202020' : '#f0f0f0'; g.fillRect(0, 0, w, h);
  const bh = h / 16, bw = w / 4, r = mulberry32(7), mort = Math.max(2, w / 200);
  for (let y = 0; y < 16; y++) for (let x = -1; x < 5; x++) {
    const ox = y % 2 ? bw / 2 : 0, l = 0.68 + r() * 0.16, hue = 12 + r() * 12;
    g.fillStyle = m === 'color' ? `hsl(${hue}, ${38 + r() * 12}%, ${l * 55}%)` : m === 'height' ? `rgb(${170 + r() * 40},${170},${170})` : `rgb(${190 + r() * 40},${200},${200})`;
    g.fillRect(x * bw + ox + mort, y * bh + mort, bw - mort * 2, bh - mort * 2);
  }
  if (m === 'color') { clouds(g, w, h, 33, { alpha: 0.25 }); noise(g, w, h, 16, 3); }
}
const SURF = {
  // 服の生地（細かい織り目。法線マップで布っぽく）
  fabric: () => makeSurf(256, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#f2f2f2' : m === 'height' ? '#808080' : '#d8d8d8'; g.fillRect(0, 0, w, h);
    const st = Math.max(2, w / 64);
    for (let y = 0; y < h; y += st) for (let x = 0; x < w; x += st) {
      const on = ((x / st) + (y / st)) % 2 === 0;
      if (m === 'color') g.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.05)';
      else if (m === 'height') g.fillStyle = on ? '#b0b0b0' : '#505050';
      else g.fillStyle = on ? '#e4e4e4' : '#cccccc';
      g.fillRect(x, y, st * (on ? 1 : 0.9), st * (on ? 0.9 : 1));
    }
    if (m === 'color') clouds(g, w, h, 21, { alpha: 0.12 });
  }, { repeat: [7, 7], normal: 1.2 }),
  // 60cmの磁器タイル（2×2枚で1.2m）
  floor: () => makeSurf(1024, (g, w, h, m) => {
    const n = 2, s = w / n, gr = Math.max(2, w / 256);
    const r = mulberry32(31);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = r();
      g.fillStyle = m === 'color' ? `hsl(40, ${8 + v * 6}%, ${88 - v * 4}%)` : m === 'height' ? '#c8c8c8' : `rgb(${70 + v * 25},${70 + v * 25},${70 + v * 25})`;
      g.fillRect(i * s, j * s, s, s);
    }
    if (m === 'color') {
      const rr2 = mulberry32(7);
      for (let k = 0; k < w * 3; k++) { g.fillStyle = rr2() < 0.5 ? 'rgba(90,80,70,0.18)' : 'rgba(255,255,255,0.25)'; const sz = 1 + rr2() * 2.5; g.fillRect(rr2() * w, rr2() * h, sz, sz); }
      clouds(g, w, h, 5, { alpha: 0.12 });
    }
    if (m === 'rough') clouds(g, w, h, 9, { alpha: 0.2 });
    g.fillStyle = m === 'color' ? '#b9b2a6' : m === 'height' ? '#202020' : '#e8e8e8';
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - gr / 2, 0, gr, h); g.fillRect(0, i * s - gr / 2, w, gr); }
  }, { repeat: [25, 25 / 3], normal: 3 }),
  concrete: () => makeSurf(1024, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#a9a7a2' : m === 'height' ? '#808080' : '#d0d0d0'; g.fillRect(0, 0, w, h);
    clouds(g, w, h, 12, { alpha: m === 'color' ? 0.5 : 0.6, octaves: [4, 12, 40, 120] });
    if (m === 'color') { noise(g, w, h, 18, 3); g.strokeStyle = 'rgba(60,55,50,0.25)'; }
    else g.strokeStyle = m === 'height' ? '#303030' : '#f0f0f0';
    g.lineWidth = Math.max(2, w / 300); g.strokeRect(0, 0, w, h);
    const r = mulberry32(4); g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  }, { repeat: [6, 3], normal: 2 }),
  sidewalk: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#cfcac0' : m === 'height' ? '#909090' : '#d8d8d8'; g.fillRect(0, 0, w, h);
    clouds(g, w, h, 21, { alpha: 0.35 });
    if (m === 'color') noise(g, w, h, 14, 2);
    g.fillStyle = m === 'color' ? 'rgba(70,60,50,0.45)' : m === 'height' ? '#202020' : '#f0f0f0';
    const gw = Math.max(2, w / 128);
    for (let i = 0; i <= 2; i++) { g.fillRect(i * w / 2 - gw / 2, 0, gw, h); g.fillRect(0, i * h / 2 - gw / 2, w, gw); }
  }, { repeat: [60, 2], normal: 2 }),
  asphalt: () => makeSurf(1024, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#46494e' : m === 'height' ? '#808080' : '#e0e0e0'; g.fillRect(0, 0, w, h);
    const r = mulberry32(8);
    for (let k = 0; k < w * 6; k++) { const v = r(); g.fillStyle = m === 'rough' ? `rgba(255,255,255,${v * 0.3})` : `rgba(${v < 0.5 ? '20,20,20' : '200,200,200'},${0.25 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    clouds(g, w, h, 17, { alpha: 0.3 });
  }, { repeat: [10, 4], normal: 1.5 }),
  brick: () => makeSurf(1024, drawBrick, { repeat: [8, 2], normal: 3 }),
  paint: () => makeSurf(512, drawPaint, { repeat: [10, 2], normal: 0.6 }),
  // ↓ 壁用（UVを実寸で振るので repeat は 1）
  wall: () => makeSurf(512, drawPaint, { repeat: [1, 1], normal: 0.7 }),
  brickW: () => makeSurf(1024, drawBrick, { repeat: [1, 1], normal: 3 }),
  // 腰壁（縦の溝のある羽目板）
  wainscot: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#e9eef0' : m === 'height' ? '#b0b0b0' : '#9a9a9a'; g.fillRect(0, 0, w, h);
    const n = 12, s = w / n, gw = Math.max(2, w / 160);
    for (let i = 0; i < n; i++) {
      if (m === 'color') { g.fillStyle = `rgba(0,0,0,${0.015 + (i % 3) * 0.01})`; g.fillRect(i * s, 0, s, h); }
      g.fillStyle = m === 'color' ? 'rgba(80,90,100,0.35)' : m === 'height' ? '#303030' : '#d0d0d0';
      g.fillRect(i * s, 0, gw, h);
      if (m === 'color') { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(i * s + gw, 0, gw * 0.6, h); }
    }
    if (m === 'color') clouds(g, w, h, 61, { alpha: 0.06 });
  }, { repeat: [1, 1], normal: 2 }),
  // 仮設の合板の壁（未購入区画）
  plywood: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#d8b98a' : m === 'height' ? '#909090' : '#c8c8c8'; g.fillRect(0, 0, w, h);
    const r = mulberry32(88);
    for (let k = 0; k < 140; k++) {
      const y = r() * h, len = w * (0.3 + r() * 0.7), x = r() * w;
      g.strokeStyle = m === 'color' ? `rgba(${120 + r() * 40},${80 + r() * 30},${40},${0.12 + r() * 0.15})` : m === 'height' ? `rgba(0,0,0,${0.2 * r()})` : `rgba(255,255,255,${0.2 * r()})`;
      g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x - len / 2, y); g.bezierCurveTo(x - len / 4, y + (r() - 0.5) * 12, x + len / 4, y + (r() - 0.5) * 12, x + len / 2, y); g.stroke();
    }
    if (m === 'color') { clouds(g, w, h, 91, { alpha: 0.2 }); noise(g, w, h, 10, 9); }
    g.fillStyle = m === 'color' ? '#8b6a40' : m === 'height' ? '#101010' : '#ffffff';
    const seam = Math.max(2, w / 128); g.fillRect(0, 0, seam, h); g.fillRect(0, 0, w, seam);
    if (m === 'color') { g.fillStyle = '#6d6d6d'; for (const [x, y] of [[0.06, 0.04], [0.94, 0.04], [0.06, 0.5], [0.94, 0.5], [0.06, 0.96], [0.94, 0.96], [0.5, 0.04], [0.5, 0.96]]) { g.beginPath(); g.arc(x * w, y * h, w / 110, 0, 7); g.fill(); } }
  }, { repeat: [1, 1], normal: 1.5 }),
  ceiling: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#eeede9' : m === 'height' ? '#a0a0a0' : '#f2f2f2'; g.fillRect(0, 0, w, h);
    const r = mulberry32(51);
    if (m !== 'rough') for (let k = 0; k < 900; k++) { g.fillStyle = m === 'color' ? 'rgba(120,115,105,0.18)' : 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 3, 0.6 + r(), r() * 3, 0, 7); g.fill(); }
    g.fillStyle = m === 'color' ? '#d5d6d8' : m === 'height' ? '#ffffff' : '#606060';
    const t = Math.max(3, w / 64); g.fillRect(0, 0, w, t); g.fillRect(0, 0, t, h);
  }, { repeat: [50, 30], normal: 1.5 }),
  wood: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#b98552' : m === 'height' ? '#909090' : '#b0b0b0'; g.fillRect(0, 0, w, h);
    const r = mulberry32(12), planks = 4, ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const base = r();
      if (m === 'color') { g.fillStyle = `hsla(${26 + base * 8}, ${45 + base * 10}%, ${45 + base * 12}%, 0.7)`; g.fillRect(0, p * ph, w, ph); }
      for (let i = 0; i < 28; i++) {
        g.strokeStyle = m === 'color' ? `rgba(${80 + r() * 40},${45 + r() * 20},20,${0.15 + r() * 0.2})` : `rgba(0,0,0,${0.2 + r() * 0.3})`;
        g.lineWidth = 0.6 + r() * 2.2; const y0 = p * ph + r() * ph;
        g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.02 + i + p) * 3); g.stroke();
      }
      g.fillStyle = m === 'color' ? 'rgba(40,20,5,0.5)' : m === 'height' ? '#000' : '#fff'; g.fillRect(0, p * ph, w, 2);
    }
  }, { repeat: [1, 1], normal: 1.2 }),
  metal: () => makeSurf(256, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#e4e6e9' : m === 'height' ? '#808080' : '#7a7a7a'; g.fillRect(0, 0, w, h);
    const r = mulberry32(19);
    for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${m === 'color' ? '120,125,130' : '255,255,255'},${r() * (m === 'rough' ? 0.25 : 0.12)})`; g.fillRect(0, y, w, 1); }
  }, { repeat: [2, 2], normal: 0.4 }),
  cardboard: () => makeSurf(256, (g, w, h, m) => {
    g.fillStyle = m === 'height' ? '#808080' : '#e0e0e0'; g.fillRect(0, 0, w, h);
    if (m === 'height') for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, 0, 3, h); }
  }, { repeat: [1, 1], normal: 0.8 }),
  grass: () => makeSurf(512, (g, w, h, m) => {
    g.fillStyle = m === 'color' ? '#6fae4f' : m === 'height' ? '#808080' : '#ececec'; g.fillRect(0, 0, w, h);
    clouds(g, w, h, 61, { alpha: 0.5 });
    const r = mulberry32(4);
    for (let i = 0; i < w * 5; i++) { g.fillStyle = m === 'color' ? (r() < 0.5 ? 'rgba(40,110,40,0.4)' : 'rgba(170,215,110,0.35)') : `rgba(255,255,255,${r() * 0.6})`; g.fillRect(r() * w, r() * h, 1.5, 3 + r() * 6); }
  }, { repeat: [60, 60], normal: 1 }),
};

// ---------- 単純なテクスチャ ----------
const cache = {};
export function tex(name) { return cache[name] ||= MAKERS[name](); }
const MAKERS = {
  floor: () => surf('floor').map, concrete: () => surf('concrete').map, sidewalk: () => surf('sidewalk').map, asphalt: () => surf('asphalt').map,
  grass: () => surf('grass').map, brick: () => surf('brick').map, wood: () => surf('wood').map, ceiling: () => surf('ceiling').map,
  wall: () => surf('paint').map,
  pegboard: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ecebe7'; g.fillRect(0, 0, w, h);
    for (let x = 8; x < w; x += 16) for (let y = 8; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, 1.2, 0, 7); g.fill(); }
  }, { repeat: [4, 3] }),
  belt: () => canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#1f2125'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = '#2a2d32'; g.fillRect(0, y, w, 3); }
  }, { repeat: [1, 4] }),
  // メロンの網目
  net: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b9b0'; g.fillRect(0, 0, w, h);
    const r = mulberry32(55); g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, a = r() * 6.28, l = 6 + r() * 18; g.lineWidth = 1 + r() * 2.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }, { repeat: [2, 2] }),
  wire: () => canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#9aa1a8'; g.lineWidth = 3;
    for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
    for (let i = 0; i <= h; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }, { repeat: [4, 1] }),
  hazard: () => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9d5cc'; g.fillRect(0, 0, w, h); noise(g, w, h, 14, 4);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let x = -h; x < w + h; x += 48) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x, h - 60); g.lineTo(x + 24, h - 60); g.lineTo(x - 6, h); g.lineTo(x - 30, h); g.fill(); }
    g.fillStyle = '#222'; g.fillRect(0, h - 64, w, 4);
    g.fillStyle = '#3a3f45'; g.font = `900 64px ${FONT}`; g.textAlign = 'center'; g.fillText('拡張予定地', w / 2, h * 0.42);
    g.fillStyle = '#6b6f75'; g.font = `800 28px ${FONT}`; g.fillText('パソコン室の拡張ボードで購入', w / 2, h * 0.55);
  }),
  cheese: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffd34d'; g.fillRect(0, 0, w, h);
    const r = mulberry32(21);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(200,140,20,0.55)'; g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 8, 0, 7); g.fill(); }
  }, { repeat: [6, 6] }),
  melon: () => canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#4c9a4f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b4d22';
    for (let x = 0; x < w; x += 28) { g.beginPath(); for (let y = 0; y <= h; y += 6) g.lineTo(x + 8 + Math.sin(y * 0.22 + x) * 4, y); for (let y = h; y >= 0; y -= 6) g.lineTo(x + 16 + Math.sin(y * 0.22 + x) * 4, y); g.fill(); }
    noise(g, w, h, 18, 6);
  }),
  marble: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b8323b'; g.fillRect(0, 0, w, h);
    const r = mulberry32(8); g.strokeStyle = 'rgba(255,230,230,0.8)';
    for (let i = 0; i < 30; i++) { g.lineWidth = 0.8 + r() * 2.5; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  }),
  leaf: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a6d784'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(240,255,220,0.8)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + (i - 2.5) * 20, h / 2, (i / 5) * w, 0); g.stroke(); }
  }),
  frost: () => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e6f6ff'); gr.addColorStop(1, '#b0d9f2');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); noise(g, w, h, 16, 6);
  }),
  screenPC: () => canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#1e88e5'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = `800 20px ${FONT}`; g.fillText('発注システム', 14, 30);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.85)'; rr(g, 14 + i * 60, 50, 50, 50, 8); g.fill(); emoji(g, ['🥫', '🥤', '🍎', '🧻'][i], 39 + i * 60, 75, 28); }
  }),
  screenReg: () => canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#0d2b3e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#62f0a6'; g.font = `800 18px ${FONT}`; g.fillText('合計', 8, 28);
    g.font = `900 28px ${FONT}`; g.fillText('¥ ----', 8, 70);
  }),
  screenSelf: () => canvasTex(128, 96, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4fc3f7'); gr.addColorStop(1, '#1565c0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = `900 16px ${FONT}`; g.textAlign = 'center'; g.fillText('セルフレジ', w / 2, 30);
    g.font = `700 12px ${FONT}`; g.fillText('商品をスキャンしてね', w / 2, 55); emoji(g, '🛒', w / 2, 78, 22);
  }),
  vending: () => canvasTex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4fbff'); gr.addColorStop(1, '#d9ecf7'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const cols = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8338ec', '#06d6a0'];
    for (let r = 0; r < 4; r++) {
      g.fillStyle = '#c9d6df'; g.fillRect(10, 18 + r * 86 + 66, w - 20, 6);
      for (let c = 0; c < 5; c++) {
        const x = 18 + c * 46, y = 18 + r * 86;
        const col = cols[(r * 5 + c) % cols.length];
        const bg = g.createLinearGradient(x, 0, x + 30, 0); bg.addColorStop(0, shade(col, -0.15)); bg.addColorStop(0.5, shade(col, 0.15)); bg.addColorStop(1, shade(col, -0.2));
        g.fillStyle = bg; rr(g, x, y + 8, 30, 56, 6); g.fill();
        g.fillStyle = '#fff'; g.fillRect(x + 4, y + 26, 22, 14);
        g.fillStyle = '#222'; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.fillText('¥130', x + 15, y + 82);
      }
    }
    g.fillStyle = '#20252b'; g.fillRect(14, 380, w - 28, 110); g.fillStyle = '#0d1014'; g.fillRect(24, 392, w - 48, 86);
  }),
  stripes: () => canvasTex(128, 32, (g, w, h) => {
    for (let x = 0; x < w; x += 32) { g.fillStyle = '#ffffff'; g.fillRect(x, 0, 16, h); g.fillStyle = '#e04f5f'; g.fillRect(x + 16, 0, 16, h); }
  }, { repeat: [12, 1] }),
  road: () => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#3a3d42'; g.fillRect(0, 0, w, h); noise(g, w, h, 30, 23); clouds(g, w, h, 4, { alpha: 0.2 });
    g.fillStyle = '#e8e2d0'; g.fillRect(0, h / 2 - 3, w * 0.5, 6);
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
  }, { repeat: [24, 1] }),
  troffer: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8dadd'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f6f8ff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#f6f8ff');
    g.fillStyle = gr; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(160,165,175,0.5)'; for (let x = 8; x < w - 8; x += 15) g.fillRect(x, 8, 2, h - 16); g.fillRect(8, h / 2 - 1, w - 16, 2);
  }),
  blob: () => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  blobRect: () => canvasTex(128, 128, (g, w, h) => {
    g.filter = 'blur(10px)'; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(22, 22, w - 44, h - 44); g.filter = 'none';
  }),
  tag: () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }),
  lines: () => tex('asphalt'),
};

// ---------- 文字看板 ----------
export function signTexture(text, { w = 1024, h = 256, bg = '#ff6b35', fg = '#ffffff', font = 900, stroke = null, glow = null, emojiL = null, chalk = false, radius = 0, family = FONT, shine = false } = {}) {
  return canvasTex(w, h, (g) => {
    if (chalk) {
      g.fillStyle = '#2b3a31'; g.fillRect(0, 0, w, h);
      clouds(g, w, h, 3, { alpha: 0.35 });
    } else if (bg) {
      if (radius) { rr(g, 0, 0, w, h, radius); g.fillStyle = bg; g.fill(); } else { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      if (shine) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gr; if (radius) { rr(g, 0, 0, w, h, radius); g.fill(); } else g.fillRect(0, 0, w, h); }
    } else g.clearRect(0, 0, w, h);
    const lines = String(text).split('\n').slice(0, 3);
    const lh = h / (lines.length + 0.4);
    lines.forEach((ln, i) => {
      fitText(g, ln, w * (emojiL ? 0.74 : 0.9), lh * 0.78, font, family);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const x = emojiL ? w * 0.57 : w / 2, y = lh * (i + 0.7);
      if (glow) { g.shadowColor = glow; g.shadowBlur = 24; }
      if (stroke) { g.lineWidth = lh * 0.09; g.strokeStyle = stroke; g.strokeText(ln, x, y); }
      g.fillStyle = chalk ? '#f2efe4' : fg; g.fillText(ln, x, y);
      if (glow) { g.fillText(ln, x, y); g.shadowBlur = 0; }
    });
    if (emojiL) emoji(g, emojiL, h * 0.5, h / 2, h * 0.62);
  });
}

// 値札（棚のレール用）
const tagCache = new Map();
export function priceTagTexture(icon, price, warn, name = '') {
  const key = icon + price + (warn ? 'w' : '') + name;
  if (tagCache.has(key)) return tagCache.get(key);
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = warn ? '#ffe4e4' : '#fffef7'; g.fillRect(0, 0, w, h);
    g.fillStyle = warn ? '#e53935' : '#ffcf26'; g.fillRect(0, 0, w, 26);
    g.fillStyle = '#333'; g.font = `700 18px ${SANS}`; g.textBaseline = 'middle'; g.fillText((name || '').slice(0, 10), 10, 14);
    emoji(g, icon, 34, 78, 46);
    g.fillStyle = '#111'; fitText(g, '¥' + price.toLocaleString(), 170, 62, 900, SANS); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText('¥' + price.toLocaleString(), w - 10, 80);
    g.fillStyle = '#888'; g.font = `500 12px ${SANS}`; g.fillText('税込', w - 12, 116);
    for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? '#222' : '#fff'; g.fillRect(70 + i * 2.4, 104, i % 4 ? 1.2 : 2, 18); }
  });
  tagCache.set(key, t);
  return t;
}

// ---------- 商品パッケージ ----------
const BRANDS = { soup: 'まるやま', tuna: 'うみかぜ', pasta: 'Bellissimo', cereal: 'SUNNY', chips: 'POP!', cookies: 'BonBon', ketchup: 'Tomatoo', jam: 'いちご畑', noodle: 'ずるずる', rice: 'こめ蔵',
  water: 'ゆきの水', soda: 'POP SODA', ojuice: 'みかん園', tea: 'おーい緑', coffee: 'BLACK', milk: 'ミルキー牧場', yogurt: 'ふわり', cheese: 'Fromage', eggs: 'こっこ', sausage: 'パリッと',
  icecream: 'ゆきだるま', pizza: 'Napoli', gyoza: '餃子王', bread: '朝のパン', croissant: 'Boulangerie', donut: 'Ring', tissue: 'ふんわり', tp: 'やわらか', detergent: 'あわピカ', shampoo: 'Kirara', toothpaste: 'ハミガキ',
  wine: 'Château', choco: 'Cacao', wagyu: '特選', curry: 'スパイス亭', honey: 'みつばち', flour: '粉のさと', sugar: 'しろゆき', oil: 'ゴールデン', energy: 'VOLT', tofu: 'きぬ', natto: 'ねばり', fries: 'カリッと',
  icebar: 'しろくま', onion: '北の大地', potato: '男爵', grapes: '山梨', pineapple: '南国', pumpkin: 'ほくほく', melonpan: 'さくさく', baguette: 'Paris', sponge: 'キュッキュ',
  pudding: 'とろり', sushi: '江戸前', salad: 'シャキッと', butter: '北の牧場', kakigori: 'ふわ氷', udon: 'さぬき', karaage: 'ジューシー', shrimp: '海の幸',
  candy: 'ころころ', senbei: '手焼き', mayo: 'たまご', soy: '本醸造', popcorn: 'POP!', sports: 'アクア', greentea: 'お〜い緑', beer: 'GOLD', battery: 'POWER', mask: 'まもる', trashbag: '45L', anpan: 'こしあん', sandwich: 'ミックス', strawberry: 'あまおと', cucumber: '産地直送', lemon: '瀬戸内', ham: 'ロース', kimchi: '本場',
  ramen: '醤油味', furikake: 'のりたま風', gummy: 'ぷにぷに', peanut: '千葉産', retort: '中辛', cola: 'COLA', milktea: 'ロイヤル', sparkling: 'SODA', highball: 'HIGHBALL', sake: '純米吟醸', champagne: 'Brut', onigiri: '鮭', bento: '幕の内', cream: '純乳脂肪', frozenveg: 'ミックス', takoyaki: '大阪', mikan: '愛媛', broccoli: '国産', corn: '北海道', eggplant: '国産', peach: '山梨', avocado: '完熟', mushroom: '原木', currypan: '揚げたて', rollcake: 'ふわっと', bagel: 'もちもち', dishsoap: 'キュキュ', softener: 'フローラル', towel: '今治風', melon: '特選', toro: '本マグロ' };
const NET = { soup: '300g', tuna: '70g×3', pasta: '500g', cereal: '400g', chips: '85g', cookies: '12枚', ketchup: '300g', jam: '250g', noodle: '77g', rice: '5kg', water: '2L', soda: '1.5L', ojuice: '1L', tea: '2L', coffee: '185g',
  milk: '1000ml', yogurt: '400g', cheese: '180g', eggs: '6個', sausage: '120g', icecream: '470ml', pizza: '2枚', gyoza: '12個', bread: '6枚切', croissant: '3個', donut: '1個', tissue: '200組', tp: '4ロール', detergent: '800g', shampoo: '480ml', toothpaste: '120g', wine: '750ml', choco: '9粒', wagyu: '200g',
  curry: '8皿分', honey: '300g', flour: '1kg', sugar: '1kg', oil: '600g', energy: '250ml', tofu: '300g', natto: '45g×3', fries: '1kg', icebar: '6本', onion: '1個', potato: '1個', grapes: '1房', pineapple: '1玉', pumpkin: '1玉', melonpan: '1個', baguette: '1本', sponge: '3個',
  pudding: '70g×3', sushi: '8貫', salad: '150g', butter: '200g', kakigori: '180ml', udon: '5玉', karaage: '500g', shrimp: '300g',
  candy: '80g', senbei: '12枚', mayo: '350g', soy: '1L', popcorn: '60g', sports: '500ml', greentea: '2L', beer: '350ml', battery: '単3×4', mask: '30枚', trashbag: '10枚', anpan: '1個', sandwich: '1パック', strawberry: '1パック', cucumber: '1本', lemon: '1個', ham: '4枚', kimchi: '300g',
  ramen: '5食', furikake: '30g', gummy: '50g', peanut: '100g', retort: '1人前', cola: '500ml', milktea: '500ml', sparkling: '500ml', highball: '350ml', sake: '720ml', champagne: '750ml', onigiri: '1個', bento: '1食', cream: '200ml', frozenveg: '300g', takoyaki: '20個', mikan: '1個', broccoli: '1株', corn: '1本', eggplant: '1本', peach: '1個', avocado: '1個', mushroom: '1パック', currypan: '1個', rollcake: '1本', bagel: '1個', dishsoap: '300ml', softener: '600ml', towel: '3枚', melon: '1玉', toro: '5切' };
const labelCache = new Map();
export function labelTexture(p, variant = 'wrap') {
  const key = p.id + variant + p.color;
  if (labelCache.has(key)) return labelCache.get(key);
  // 最高画質ではラベルを高解像度で描く（文字やバーコードがくっきり）
  const k = UQ ? 2 : HQ ? 1 : 0.75;
  const W = Math.round((variant === 'wrap' ? 512 : 256) * k), H = Math.round((variant === 'wrap' ? 256 : variant === 'tall' ? 384 : 256) * k);
  const t = canvasTex(W, H, (g, w, h) => drawLabel(g, w, h, p, variant));
  labelCache.set(key, t);
  return t;
}
function barcode(g, x, y, w, h) {
  g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  const r = mulberry32(Math.round(x * 13 + y));
  let cx = x; g.fillStyle = '#111';
  while (cx < x + w) { const bw = 0.8 + r() * 2.2; if (r() < 0.55) g.fillRect(cx, y, bw, h); cx += bw + 0.8; }
}
function drawLabel(g, w, h, p, variant) {
  const c = p.color, brand = BRANDS[p.id] || 'MART';
  const hsl = hexToHsl(c);
  const light = hsl.l > 0.6;
  const fg = light ? '#262626' : '#ffffff';
  const dark = shade(c, -0.22), lite = shade(c, 0.18);
  // 背景：グラデーション＋光沢
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, lite); gr.addColorStop(0.55, c); gr.addColorStop(1, dark);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (variant === 'wrap') {
    // 円柱用：中央が正面
    const cx = w * 0.5;
    g.fillStyle = 'rgba(255,255,255,0.14)'; for (let x = 0; x < w; x += 22) g.fillRect(x, 0, 8, h);
    g.fillStyle = dark; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, h * 0.46, w * 0.2, h * 0.34, 0, 0, 7); g.fill();
    g.strokeStyle = shade(c, -0.3); g.lineWidth = 4; g.stroke();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4; emoji(g, p.icon, cx, h * 0.46, h * 0.36); g.restore();
    g.fillStyle = '#fff'; fitText(g, p.name, w * 0.42, h * 0.13, 900, SANS); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.name, cx, h * 0.89);
    g.fillStyle = fg; fitText(g, brand, w * 0.22, h * 0.15, 900, SERIF); g.fillText(brand, w * 0.18, h * 0.38); g.fillText(brand, w * 0.82, h * 0.38);
    g.fillStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'; g.font = `700 ${h * 0.07}px ${SANS}`; g.fillText('内容量 ' + (NET[p.id] || ''), w * 0.18, h * 0.55); g.fillText('内容量 ' + (NET[p.id] || ''), w * 0.82, h * 0.55);
    barcode(g, w * 0.04, h * 0.6, w * 0.08, h * 0.12);
    const sh = g.createLinearGradient(0, 0, w, 0); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    return;
  }
  // 箱・袋の正面用
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(w * 0.9, h * 0.08, w * 0.55, 0, 7); g.fill();
  // ブランド帯
  g.fillStyle = dark; rr(g, w * 0.08, h * 0.04, w * 0.84, h * 0.13, h * 0.03); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, brand, w * 0.78, h * 0.1, 900, SERIF); g.fillText(brand, w / 2, h * 0.105);
  if (p.id === 'pizza') {
    g.fillStyle = '#e9c46a'; g.beginPath(); g.arc(w / 2, h * 0.55, w * 0.33, 0, 7); g.fill();
    g.fillStyle = '#c8331f'; g.beginPath(); g.arc(w / 2, h * 0.55, w * 0.28, 0, 7); g.fill();
    g.fillStyle = '#fff1bd'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(w / 2 + Math.cos(i * 2.4) * w * 0.18, h * 0.55 + Math.sin(i * 2.4) * w * 0.18, w * 0.03, 0, 7); g.fill(); }
    g.fillStyle = '#8f1d1f'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(w / 2 + Math.cos(i * 0.9 + 0.4) * w * 0.13, h * 0.55 + Math.sin(i * 0.9 + 0.4) * w * 0.13, w * 0.035, 0, 7); g.fill(); }
    g.fillStyle = '#3c8d2f'; for (let i = 0; i < 9; i++) { g.save(); g.translate(w / 2 + Math.cos(i * 1.7) * w * 0.2, h * 0.55 + Math.sin(i * 1.7) * w * 0.2); g.rotate(i); g.fillRect(-4, -2, 8, 4); g.restore(); }
  } else {
    // 商品写真風の窓
    const wx = w * 0.12, wy = h * 0.22, ww = w * 0.76, wh = h * 0.5;
    const bg = g.createRadialGradient(w / 2, wy + wh * 0.45, 4, w / 2, wy + wh / 2, ww * 0.7); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, shade(c, 0.35));
    g.fillStyle = bg; rr(g, wx, wy, ww, wh, w * 0.06); g.fill();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 14; g.shadowOffsetY = 6; emoji(g, p.icon, w / 2, wy + wh * 0.5, Math.min(ww, wh) * 0.62); g.restore();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(w * 0.82, wy + 4, w * 0.09, 0, 7); g.fill();
    g.fillStyle = '#c62828'; g.font = `900 ${w * 0.055}px ${SANS}`; g.fillText('NEW', w * 0.82, wy + 5);
  }
  g.fillStyle = fg; fitText(g, p.name, w * 0.86, h * 0.1, 900, SANS); g.fillText(p.name, w / 2, h * 0.82);
  g.fillStyle = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)'; g.font = `700 ${h * 0.045}px ${SANS}`; g.fillText('内容量 ' + (NET[p.id] || ''), w * 0.3, h * 0.93);
  barcode(g, w * 0.62, h * 0.885, w * 0.28, h * 0.07);
  const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0.2, 'rgba(255,255,255,0)'); sh.addColorStop(0.32, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.42, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
}

// ---------- 段ボール箱（1色刷りのリアルな外箱） ----------
function drawBoxSide(g, w, h, p) {
  g.fillStyle = '#c4945c'; g.fillRect(0, 0, w, h);
  clouds(g, w, h, p.id.length * 7, { alpha: 0.25 }); noise(g, w, h, 14, p.id.length);
  g.fillStyle = 'rgba(110,70,30,0.18)'; for (let x = 0; x < w; x += 7) g.fillRect(x, 0, 2, h);
  if (p.id === '_box') {
    // 無地の空き箱：お店のスタンプだけ
    g.globalAlpha = 0.55; g.strokeStyle = '#6b4320'; g.fillStyle = '#6b4320'; g.lineWidth = 5;
    g.beginPath(); g.arc(w / 2, h * 0.45, h * 0.24, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 40px ${SANS}`; g.fillText('MART', w / 2, h * 0.4); g.font = `900 30px ${SANS}`; g.fillText('MATES', w / 2, h * 0.51);
    g.font = `700 20px ${SANS}`; g.fillText('↑↑ 天地無用 ↑↑', w / 2, h * 0.9);
    g.globalAlpha = 1;
    return;
  }
  const ink = shade(p.color, -0.28);
  g.strokeStyle = ink; g.lineWidth = 6; rr(g, w * 0.08, h * 0.12, w * 0.84, h * 0.7, 18); g.stroke();
  g.globalAlpha = 0.9;
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, BRANDS[p.id] || 'MART', w * 0.7, 56, 900, SERIF); g.fillText(BRANDS[p.id] || 'MART', w / 2, h * 0.26);
  fitText(g, p.name, w * 0.7, 44, 900, SANS); g.fillText(p.name, w / 2, h * 0.43);
  g.font = `700 26px ${SANS}`; g.fillText(`${NET[p.id] || ''} × ${p.qty}`, w / 2, h * 0.56);
  g.globalAlpha = 0.75; emoji(g, p.icon, w * 0.2, h * 0.68, 46); g.globalAlpha = 0.9;
  barcode(g, w * 0.55, h * 0.64, w * 0.3, h * 0.1);
  g.font = `700 20px ${SANS}`; g.fillText('↑↑ 天地無用 ↑↑  ワレモノ注意', w / 2, h * 0.92);
  g.globalAlpha = 1;
}
function drawBoxTop(g, w, h) {
  g.fillStyle = '#c4945c'; g.fillRect(0, 0, w, h); clouds(g, w, h, 77, { alpha: 0.25 }); noise(g, w, h, 14, 77);
  g.fillStyle = 'rgba(80,50,20,0.35)'; g.fillRect(0, h / 2 - 1, w, 2);
  const tg = g.createLinearGradient(w * 0.4, 0, w * 0.6, 0); tg.addColorStop(0, 'rgba(210,180,120,0.85)'); tg.addColorStop(0.5, 'rgba(235,210,160,0.95)'); tg.addColorStop(1, 'rgba(210,180,120,0.85)');
  g.fillStyle = tg; g.fillRect(w * 0.4, 0, w * 0.2, h);
}
const boxCache = new Map();
export function boxTexture(p) {
  if (!boxCache.has(p.id)) boxCache.set(p.id, canvasTex(512, 384, (g, w, h) => drawBoxSide(g, w, h, p)));
  return boxCache.get(p.id);
}
export function boxTopTexture() { return cache.boxtop ||= canvasTex(256, 256, (g, w, h) => drawBoxTop(g, w, h)); }
// 段ボール箱アトラス（上半分=側面, 下半分=天面）
const atlasCache = new Map();
export function boxAtlas(p) {
  if (atlasCache.has(p.id)) return atlasCache.get(p.id);
  const t = canvasTex(512, 512, (g) => {
    g.save(); g.scale(1, 256 / 384); drawBoxSide(g, 512, 384, p); g.restore();
    g.save(); g.translate(0, 256); g.scale(2, 1); drawBoxTop(g, 256, 256); g.restore();
  });
  atlasCache.set(p.id, t);
  return t;
}

// ---------- キャラクターの顔（頭の球に巻く。u=0.25 が正面。目・眉・鼻は立体） ----------
const faceCache = new Map();
export function faceTexture(av, small = false) {
  const key = [av.skin, av.mouth, av.blush, av.acc, av.hairColor, small, 'v2'].join('|');
  if (faceCache.has(key)) return faceCache.get(key);
  const t = canvasTex(small ? 256 : 512, small ? 128 : 256, (g) => {
    if (small) g.scale(0.5, 0.5);
    const w = 512, h = 256;
    g.fillStyle = av.skin; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, cy = h * 0.56;
    // 立体感：横顔側と顎の下を暗く、額と頬を明るく
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.0)'); side.addColorStop(0.13, 'rgba(0,0,0,0.0)'); side.addColorStop(0.25, 'rgba(255,255,255,0.05)');
    side.addColorStop(0.37, 'rgba(0,0,0,0.0)'); side.addColorStop(0.75, 'rgba(0,0,0,0.12)'); side.addColorStop(1, 'rgba(0,0,0,0.0)');
    g.fillStyle = side; g.fillRect(0, 0, w, h);
    const jaw = g.createLinearGradient(0, h * 0.72, 0, h); jaw.addColorStop(0, 'rgba(0,0,0,0)'); jaw.addColorStop(1, 'rgba(70,30,20,0.28)'); g.fillStyle = jaw; g.fillRect(0, 0, w, h);
    const cheek = (x) => { const gr = g.createRadialGradient(x, cy + 14, 2, x, cy + 14, 34); gr.addColorStop(0, av.blush ? 'rgba(240,110,110,0.32)' : 'rgba(220,120,110,0.12)'); gr.addColorStop(1, 'rgba(240,110,110,0)'); g.fillStyle = gr; g.fillRect(x - 40, cy - 30, 80, 90); };
    cheek(cx - 46); cheek(cx + 46);
    // 目のくぼみの陰
    for (const s of [-1, 1]) { const gr = g.createRadialGradient(cx + s * 30, cy - 6, 4, cx + s * 30, cy - 6, 26); gr.addColorStop(0, 'rgba(90,40,30,0.16)'); gr.addColorStop(1, 'rgba(90,40,30,0)'); g.fillStyle = gr; g.fillRect(cx + s * 30 - 30, cy - 36, 60, 60); }
    // 口
    const my = cy + 34, lip = shade(av.skin, -0.18), lipD = '#8a3b36';
    g.lineCap = 'round'; g.lineJoin = 'round';
    switch (av.mouth) {
      case 'grin':
        g.fillStyle = lipD; g.beginPath(); g.moveTo(cx - 17, my - 3); g.quadraticCurveTo(cx, my + 17, cx + 17, my - 3); g.quadraticCurveTo(cx, my + 1, cx - 17, my - 3); g.fill();
        g.fillStyle = '#fbfbf6'; g.beginPath(); g.moveTo(cx - 14, my - 1.5); g.quadraticCurveTo(cx, my + 4, cx + 14, my - 1.5); g.quadraticCurveTo(cx, my + 1, cx - 14, my - 1.5); g.fill(); break;
      case 'open':
        g.fillStyle = lipD; g.beginPath(); g.ellipse(cx, my + 2, 8, 9, 0, 0, 7); g.fill(); g.fillStyle = '#d96a6a'; g.beginPath(); g.ellipse(cx, my + 7, 5, 3, 0, 0, 7); g.fill(); break;
      case 'cat':
        g.strokeStyle = lipD; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 12, my - 2); g.quadraticCurveTo(cx - 6, my + 6, cx, my - 1); g.quadraticCurveTo(cx + 6, my + 6, cx + 12, my - 2); g.stroke(); break;
      case 'flat':
        g.strokeStyle = lipD; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 10, my + 1); g.lineTo(cx + 10, my + 1); g.stroke(); g.fillStyle = lip; g.fillRect(cx - 8, my + 2.5, 16, 3); break;
      case 'tongue':
        g.strokeStyle = lipD; g.lineWidth = 3; g.beginPath(); g.arc(cx, my - 5, 11, 0.25, Math.PI - 0.25); g.stroke(); g.fillStyle = '#e06b7d'; g.beginPath(); g.ellipse(cx + 3, my + 6, 5, 6, 0, 0, 7); g.fill(); break;
      case 'o':
        g.fillStyle = lipD; g.beginPath(); g.ellipse(cx, my + 2, 5, 6, 0, 0, 7); g.fill(); break;
      default:
        g.strokeStyle = lipD; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 12, my - 2); g.quadraticCurveTo(cx, my + 8, cx + 12, my - 2); g.stroke();
        g.fillStyle = lip; g.beginPath(); g.moveTo(cx - 9, my + 2); g.quadraticCurveTo(cx, my + 9, cx + 9, my + 2); g.quadraticCurveTo(cx, my + 5, cx - 9, my + 2); g.fill();
    }
    if (av.acc === 'mustache') { g.fillStyle = av.hairColor || '#3b2a20'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 11, my - 9, 12, 4.5, s * 0.25, 0, 7); g.fill(); } }
    if (av.acc === 'beard') {
      g.fillStyle = av.hairColor || '#3b2a20'; g.globalAlpha = 0.92;
      g.beginPath(); g.moveTo(cx - 62, cy - 10); g.quadraticCurveTo(cx - 58, cy + 74, cx, cy + 80); g.quadraticCurveTo(cx + 58, cy + 74, cx + 62, cy - 10); g.lineTo(cx + 44, cy + 6); g.quadraticCurveTo(cx, cy + 56, cx - 44, cy + 6); g.fill();
      g.globalAlpha = 1; g.fillStyle = lipD; g.beginPath(); g.ellipse(cx, my + 1, 8, 3.5, 0, 0, 7); g.fill();
    }
    if (av.acc === 'bandaid') { g.save(); g.translate(cx + 40, cy + 6); g.rotate(-0.4); g.fillStyle = '#e8b98a'; rr(g, -14, -5, 28, 10, 4); g.fill(); g.restore(); }
    // 細かい肌のムラ
    const r = mulberry32(5); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,60,40' : '255,255,255'},0.04)`; g.fillRect(r() * w, r() * h, 2, 2); }
  });
  faceCache.set(key, t);
  return t;
}
// 目玉（u=0.25 が正面）
const eyeCache = new Map();
export function eyeTexture(iris = '#5b3a24', sparkle = false) {
  const key = iris + sparkle;
  if (eyeCache.has(key)) return eyeCache.get(key);
  const t = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#f7f4ef'; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, cy = h * 0.5, R = sparkle ? 15 : 12;
    const ir = g.createRadialGradient(cx, cy, 2, cx, cy, R); ir.addColorStop(0, shade(iris, 0.2)); ir.addColorStop(0.7, iris); ir.addColorStop(1, shade(iris, -0.3));
    g.fillStyle = ir; g.beginPath(); g.ellipse(cx, cy, R * 0.85, R, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; for (let a = 0; a < 6.28; a += 0.35) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4); g.lineTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.9); g.stroke(); }
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(cx, cy, R * 0.36, R * 0.42, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 3, cy - 4, sparkle ? 4 : 2.6, 0, 7); g.fill();
    if (sparkle) { g.beginPath(); g.arc(cx + 4, cy + 4, 2, 0, 7); g.fill(); }
  });
  eyeCache.set(key, t);
  return t;
}

// 吹き出しアイコン
const bubbleCache = new Map();
export function bubbleTexture(kind, text) {
  const key = kind + (text || '');
  if (bubbleCache.has(key)) return bubbleCache.get(key);
  const ICON = { none: '❓', empty: '😞', pricey: '💸', cheap: '🤩', angry: '💢', wait: '⌛', happy: '😊', ok: '🙂', chat: '', notag: '🏷️', nobox: '📦', trash: '🗑️', rackfull: '🗄️' };
  const isChat = kind === 'chat';
  const W = isChat ? 512 : 128, H = 128;
  const t = canvasTex(W, H, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4;
    rr(g, 4, 4, w - 8, h - 30, 26); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 12, h - 28); g.lineTo(w / 2, h - 6); g.lineTo(w / 2 + 12, h - 28); g.fill();
    if (isChat) { g.fillStyle = '#222'; fitText(g, text, w - 40, 44, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, (h - 26) / 2 + 2); }
    else emoji(g, ICON[kind] || '❗', w / 2, (h - 26) / 2 + 4, 62);
  });
  if (!isChat) bubbleCache.set(key, t);
  return t;
}
export function nameTexture(name, color = '#ffffff') {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0.45)'; rr(g, 8, 8, w - 16, h - 16, 22); g.fill();
    g.fillStyle = color; fitText(g, name, w - 40, 32, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 1);
  });
}
