// Простая шина событий. Все игровые системы общаются через неё,
// чтобы правила мира могли реагировать на действия игрока без жёстких связей.
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.handlers.get(type);
    if (set) set.delete(fn);
  }

  emit(type, data = {}) {
    const run = (fn) => {
      try {
        fn(data, type);
      } catch (err) {
        console.error(`[events] обработчик "${type}" упал:`, err);
      }
    };
    const set = this.handlers.get(type);
    if (set) [...set].forEach(run);
    const any = this.handlers.get('*');
    if (any) [...any].forEach(run);
  }
}
