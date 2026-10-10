// SaveManager — надёжные сохранения в localStorage (работает офлайн, в том числе при открытии файла).
// • 3 ручных слота + автосохранение
// • контрольная сумма: повреждённое сохранение распознаётся
// • перед каждой записью предыдущая версия копируется в резервный ключ (_bak)
// • при повреждении основной записи загружается резервная
// • экспорт/импорт в файл .json — перенос между компьютерами и браузерами

import { hashString } from '../core/rng.js';
import { storage } from '../core/util.js';

export const SAVE_VERSION = 1;
const PREFIX = 'ns_save_';
export const SLOTS = ['auto', '1', '2', '3'];

function pack(payload) {
  const body = JSON.stringify(payload);
  return JSON.stringify({ v: SAVE_VERSION, sum: hashString(body), body });
}

function unpack(raw) {
  if (!raw) return { ok: false, error: 'empty' };
  try {
    const outer = JSON.parse(raw);
    if (typeof outer.body !== 'string' || hashString(outer.body) !== outer.sum) return { ok: false, error: 'checksum' };
    const payload = JSON.parse(outer.body);
    if (!payload || !payload.memory || !payload.world) return { ok: false, error: 'structure' };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'parse' };
  }
}

export class SaveManager {
  save(slot, payload) {
    const key = PREFIX + slot;
    const prev = storage.get(key);
    if (prev && unpack(prev).ok) storage.set(key + '_bak', prev);
    payload.meta = { ...(payload.meta || {}), savedAt: Date.now(), version: SAVE_VERSION };
    const ok = storage.set(key, pack(payload));
    if (ok) storage.set('ns_last_slot', slot);
    return ok;
  }

  // Возвращает { ok, payload, restored } — restored=true если пришлось взять резервную копию.
  load(slot) {
    const key = PREFIX + slot;
    const main = unpack(storage.get(key));
    if (main.ok) return { ok: true, payload: main.payload, restored: false };
    const bak = unpack(storage.get(key + '_bak'));
    if (bak.ok) {
      console.warn(`[save] слот ${slot} повреждён (${main.error}), загружена резервная копия`);
      storage.set(key, storage.get(key + '_bak'));
      return { ok: true, payload: bak.payload, restored: true };
    }
    return { ok: false, error: main.error === 'empty' ? 'Слот пуст.' : 'Сохранение повреждено, резервной копии нет.' };
  }

  info(slot) {
    const raw = storage.get(PREFIX + slot);
    if (!raw) return null;
    const r = unpack(raw);
    if (!r.ok) {
      const bak = unpack(storage.get(PREFIX + slot + '_bak'));
      return bak.ok ? { ...bak.payload.meta, damaged: true, recoverable: true } : { damaged: true };
    }
    return r.payload.meta || {};
  }

  remove(slot) {
    storage.remove(PREFIX + slot);
    storage.remove(PREFIX + slot + '_bak');
  }

  lastSlot() {
    const s = storage.get('ns_last_slot');
    if (s && this.info(s)) return s;
    // если последний слот пропал — берём самый свежий
    let best = null;
    let bestT = 0;
    for (const sl of SLOTS) {
      const i = this.info(sl);
      if (i && !i.damaged && i.savedAt > bestT) {
        best = sl;
        bestT = i.savedAt;
      }
    }
    return best;
  }

  exportText(slot) {
    return storage.get(PREFIX + slot);
  }

  importText(slot, text) {
    const r = unpack(text);
    if (!r.ok) return { ok: false, error: 'Файл не является сохранением игры или повреждён.' };
    this.save(slot, r.payload);
    return { ok: true };
  }
}

// Профиль — общий для всех сохранений: настройки, достигнутые финалы, чужие коды.
const PROFILE_KEY = 'ns_profile';

export const DEFAULT_SETTINGS = {
  master: 0.8,
  ambient: 0.7,
  sfx: 0.8,
  sens: 1.0,
  invertY: false,
  fov: 72,
  resScale: 1.0,
  quality: 'medium',
  keys: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    interact: 'KeyE',
    flashlight: 'KeyF',
    inventory: 'Tab',
    journal: 'KeyJ',
    drop: 'KeyG',
    screenshot: 'KeyP',
    crouch: 'KeyC',
    reload: 'KeyR',
    stim: 'KeyQ',
    throw: 'KeyT',
    mask: 'KeyM',
  },
  scares: true,
};

export function loadProfile() {
  let p = null;
  try {
    p = JSON.parse(storage.get(PROFILE_KEY) || 'null');
  } catch {
    p = null;
  }
  p = p && typeof p === 'object' ? p : {};
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
  p.settings.keys = { ...DEFAULT_SETTINGS.keys, ...((p.settings && p.settings.keys) || {}) };
  p.endings = Array.isArray(p.endings) ? p.endings : [];
  p.foreignCodes = Array.isArray(p.foreignCodes) ? p.foreignCodes : [];
  p.runs = p.runs || 0;
  p.tapes = Array.isArray(p.tapes) ? p.tapes : [];
  return p;
}

export function saveProfile(p) {
  storage.set(PROFILE_KEY, JSON.stringify(p));
}
