export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function aabbContains(b, x, y, z) {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && (y === undefined || (y >= b.y0 && y <= b.y1));
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Безопасная работа с localStorage: в приватных окнах и песочницах доступ может бросать исключение.
export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn('[storage] запись не удалась', err);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* нет доступа — нечего удалять */
    }
  },
};

export function formatTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
