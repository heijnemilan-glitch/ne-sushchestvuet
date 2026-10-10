// WorldStateManager — текущее физическое состояние мира:
// двери, предметы, механизмы, питание, изменённая геометрия, порталы.
// WorldMemory помнит ЧТО ДЕЛАЛ игрок, WorldState описывает КАК СЕЙЧАС УСТРОЕН мир.
// Все изменения идут через set(), уровень подписан на события и перестраивает визуал.

export class WorldState {
  constructor(bus, data) {
    this.bus = bus;
    this.data = data || WorldState.fresh();
  }

  static fresh() {
    return {
      doors: {}, // id -> { open, locked }
      items: {}, // id -> { where: 'world' | 'inv' | 'gone', x, y, z }
      vars: {},
    };
  }

  get(key, fallback = undefined) {
    const v = this.data.vars[key];
    return v === undefined ? fallback : v;
  }

  set(key, value) {
    if (this.data.vars[key] === value) return;
    this.data.vars[key] = value;
    this.bus.emit('world:change', { key, value });
  }

  door(id) {
    return (this.data.doors[id] ||= { open: false, locked: false });
  }

  initDoor(id, defaults) {
    if (!this.data.doors[id]) this.data.doors[id] = { open: false, locked: false, ...defaults };
    return this.data.doors[id];
  }

  setDoor(id, patch) {
    const d = this.door(id);
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (d[k] !== v) {
        d[k] = v;
        changed = true;
      }
    }
    if (changed) this.bus.emit('door:state', { id, ...d });
  }

  item(id) {
    return this.data.items[id];
  }

  initItem(id, defaults) {
    if (!this.data.items[id]) this.data.items[id] = { where: 'world', ...defaults };
    return this.data.items[id];
  }

  setItem(id, patch) {
    const it = (this.data.items[id] ||= { where: 'world' });
    Object.assign(it, patch);
    this.bus.emit('item:state', { id, ...it });
  }
}
