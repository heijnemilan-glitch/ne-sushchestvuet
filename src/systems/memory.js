// WorldMemory — память мира.
// Хранит ВСЁ, что игрок делал внутри игры: посещения комнат, время в них, маршруты,
// проходы мимо дверей, перемещённые предметы, решённые загадки, увиденные события и решения.
// Игра анализирует только действия внутри самой игры — никакого доступа к файлам, камере и т.п.

export const MEMORY_VERSION = 1;

export class WorldMemory {
  constructor(bus, data) {
    this.bus = bus;
    this.data = data || WorldMemory.fresh(0);
  }

  static fresh(seed) {
    return {
      version: MEMORY_VERSION,
      seed,
      playTime: 0,
      seq: 0, // номер входа в комнату (глобальный счётчик переходов)
      currentRoom: null,
      rooms: {}, // id -> { visits, time, firstSeq, lastSeq }
      history: [], // последние входы в комнаты (id), до 24 штук
      doors: {}, // id -> { opened, tried, passes }
      routes: { left: 0, right: 0, north: 0, south: 0 },
      items: { picked: {}, dropped: {} }, // dropped: itemId -> { room, seq, x, y, z }
      puzzles: {},
      events: {}, // id -> сколько раз видел
      decisions: {}, // id -> значение
      counters: {},
      flags: {},
      rules: {}, // id -> { progress, done, doneAt }
      observations: [], // { id, text, t }
      notes: [], // найденные записи (id)
      playerNotes: '',
      codes: [], // свои коды открытий
      trail: [], // последние позиции игрока (для Копии)
    };
  }

  get seed() {
    return this.data.seed;
  }

  // --- комнаты -------------------------------------------------------------
  enterRoom(id) {
    const d = this.data;
    if (d.currentRoom === id) return;
    const prev = d.currentRoom;
    d.seq += 1;
    const room = (d.rooms[id] ||= { visits: 0, time: 0, firstSeq: d.seq, lastSeq: 0 });
    room.visits += 1;
    const sinceLast = room.lastSeq ? d.seq - room.lastSeq : 0;
    room.lastSeq = d.seq;
    d.currentRoom = id;
    d.history.push(id);
    if (d.history.length > 24) d.history.shift();
    this.bus.emit('room:enter', { id, prev, visits: room.visits, seq: d.seq, sinceLast });
    if (prev) this.bus.emit('room:leave', { id: prev, next: id });
  }

  room(id) {
    return this.data.rooms[id] || { visits: 0, time: 0, firstSeq: 0, lastSeq: 0 };
  }

  visited(id) {
    return this.room(id).visits > 0;
  }

  visitedRooms() {
    return Object.keys(this.data.rooms).filter((k) => this.data.rooms[k].visits > 0);
  }

  // Сколько РАЗНЫХ комнат игрок посетил после указанного номера перехода.
  distinctRoomsSince(seq, exclude) {
    const d = this.data;
    const set = new Set();
    for (const [id, r] of Object.entries(d.rooms)) {
      if (id !== exclude && r.lastSeq > seq) set.add(id);
    }
    return set.size;
  }

  lastRooms(n) {
    return this.data.history.slice(-n);
  }

  tick(dt) {
    const d = this.data;
    d.playTime += dt;
    if (d.currentRoom) {
      const r = d.rooms[d.currentRoom];
      if (r) r.time += dt;
    }
  }

  // --- двери ---------------------------------------------------------------
  door(id) {
    return (this.data.doors[id] ||= { opened: 0, tried: 0, passes: 0 });
  }

  // --- общие счётчики, флаги, решения ---------------------------------------
  count(key, n = 1) {
    const c = this.data.counters;
    c[key] = (c[key] || 0) + n;
    return c[key];
  }

  get(key) {
    return this.data.counters[key] || 0;
  }

  set(key, value) {
    this.data.counters[key] = value;
  }

  flag(key, value = true) {
    const changed = this.data.flags[key] !== value;
    this.data.flags[key] = value;
    if (changed) this.bus.emit('flag', { key, value });
  }

  has(key) {
    return !!this.data.flags[key];
  }

  decide(id, value) {
    this.data.decisions[id] = value;
    this.bus.emit('decision', { id, value });
  }

  seeEvent(id) {
    const e = this.data.events;
    e[id] = (e[id] || 0) + 1;
    return e[id];
  }

  seen(id) {
    return this.data.events[id] || 0;
  }

  solve(puzzleId) {
    if (this.data.puzzles[puzzleId]) return false;
    this.data.puzzles[puzzleId] = { at: this.data.playTime };
    this.bus.emit('puzzle:solved', { id: puzzleId });
    return true;
  }

  solved(puzzleId) {
    return !!this.data.puzzles[puzzleId];
  }

  // --- журнал наблюдений ----------------------------------------------------
  // Наблюдения — то, что игрок заметил. Не раскрывают правило, только факт.
  observe(id, text) {
    if (this.data.observations.some((o) => o.id === id)) return false;
    this.data.observations.push({ id, text, t: Math.floor(this.data.playTime) });
    this.bus.emit('journal:observation', { id, text });
    return true;
  }

  addNote(id) {
    if (this.data.notes.includes(id)) return false;
    this.data.notes.push(id);
    this.bus.emit('journal:note', { id });
    return true;
  }

  // --- состояние скрытых правил --------------------------------------------
  rule(id) {
    return (this.data.rules[id] ||= { progress: 0, done: false, doneAt: 0 });
  }

  discoveredRules() {
    return Object.entries(this.data.rules)
      .filter(([, r]) => r.done)
      .map(([id]) => id);
  }

  // --- след игрока (для Копии) ----------------------------------------------
  pushTrail(sample) {
    const t = this.data.trail;
    t.push(sample);
    if (t.length > 240) t.shift();
  }
}
