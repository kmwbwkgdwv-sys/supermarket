// ===== プロフィール保存・引き継ぎコード・同期 =====
import { randomCode, normalizeCode } from './util.js';
import { newStore, normalizeStore } from './sim.js';
import { defaultAvatar, sanitizeAvatar } from './models/character.js';

const KEY = 'martmates.profile.v1';
const SKEY = 'martmates.settings.v1';

export const DEFAULT_SETTINGS = {
  lite: false, ultra: false, shadows: true, res: 1, fov: 70,
  sens: 1, invertY: false, btnScale: 1, layout: {}, touchUI: 'auto', cam: 'first',
  bgm: 'pop', bgmVol: 0.6, sfxVol: 0.8, bgPlay: true, names: true,
};

function ls() { try { return window.localStorage; } catch (e) { return null; } }
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(ls()?.getItem(SKEY) || '{}') || {}; } catch (e) { s = {}; }
  const out = { ...DEFAULT_SETTINGS, ...s };
  // 初回はスマホなら軽量寄りに
  if (!s.__init) {
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    if (weak) { out.lite = true; out.shadows = false; }
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    if (!weak && !mobile && (navigator.hardwareConcurrency || 4) >= 8) out.ultra = true; // PCは最初から最高画質
    out.__init = true;
  }
  // v3：一人称視点がデフォルトに（一度だけ切り替え）
  if (!s.__fp) { out.cam = 'first'; out.__fp = true; }
  return out;
}
export function saveSettings(s) { try { ls()?.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* noop */ } }

export function createProfile(name) {
  const now = Date.now();
  return {
    v: 1, code: randomCode(12), pid: randomCode(10), name: String(name).slice(0, 12),
    av: defaultAvatar(), playTime: 0, created: now, updated: now, store: newStore(String(name).slice(0, 8) + 'マート'),
    synced: 0,
  };
}
export function loadProfile() {
  try {
    const raw = ls()?.getItem(KEY);
    if (!raw) return null;
    return fixProfile(JSON.parse(raw));
  } catch (e) { console.warn('save broken', e); return null; }
}
export function fixProfile(p) {
  if (!p || !p.code) return null;
  p.av = sanitizeAvatar(p.av);
  p.store = normalizeStore(p.store || newStore(p.name + 'マート'));
  p.playTime ||= 0; p.pid ||= randomCode(10);
  return p;
}
export function saveProfileLocal(p) {
  p.updated = Date.now();
  try { ls()?.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { console.warn(e); return false; }
}
export function clearProfile() { try { ls()?.removeItem(KEY); } catch (e) { /* noop */ } }
export { normalizeCode };

// クラウドへ保存（失敗しても続行）
export async function syncUp(cloud, p) {
  if (!cloud.configured) return { ok: false, reason: 'Firebase未設定' };
  try {
    const data = { ...p }; delete data.synced;
    await cloud.saveProfile(p.code, data);
    p.synced = Date.now();
    saveProfileLocal(p);
    return { ok: true };
  } catch (e) { console.warn('sync failed', e); return { ok: false, reason: e.message || '通信エラー' }; }
}
// 起動時：クラウドの方が新しければ取り込む
export async function syncDown(cloud, p) {
  if (!cloud.configured) return p;
  try {
    const r = await cloud.loadProfile(p.code);
    if (r && r.data && (r.data.updated || 0) > (p.updated || 0) + 1000) {
      const np = fixProfile({ ...r.data, code: p.code });
      np.synced = Date.now();
      saveProfileLocal(np);
      return np;
    }
  } catch (e) { console.warn('syncDown', e); }
  return p;
}
export async function restoreByCode(cloud, code) {
  const c = normalizeCode(code);
  if (c.length !== 12) throw new Error('引き継ぎコードは12文字です');
  if (!cloud.configured) throw new Error('オンライン機能(Firebase)が未設定のため復元できません');
  const r = await cloud.loadProfile(c);
  if (!r) throw new Error('そのコードのデータが見つかりません');
  const p = fixProfile({ ...r.data, code: c });
  p.synced = Date.now();
  saveProfileLocal(p);
  return p;
}
export function rankEntry(p) {
  return { n: p.name, lv: p.store.level, s: Math.round(p.store.totalSales), p: Math.round(p.playTime), d: p.store.day, h: p.av.hat, st: (p.store.name || '').slice(0, 16), t: Date.now() };
}
