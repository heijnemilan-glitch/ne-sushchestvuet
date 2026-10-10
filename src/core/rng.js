// Детерминированный генератор случайных чисел.
// Каждый мир имеет seed — разные игроки получают разные варианты событий,
// но один и тот же мир всегда ведёт себя одинаково (контролируемая случайность).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Строковый хеш (FNV-1a) — для контрольных сумм сохранений и кодов открытий.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Значение, зависящее только от seed мира и имени параметра.
export function seeded(seed, key) {
  return mulberry32(hashString(`${seed}:${key}`))();
}

export function seededInt(seed, key, min, max) {
  return min + Math.floor(seeded(seed, key) * (max - min + 1));
}

export function newSeed() {
  const buf = new Uint32Array(1);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
  else buf[0] = Math.floor(Math.random() * 0xffffffff);
  return buf[0] >>> 0;
}
