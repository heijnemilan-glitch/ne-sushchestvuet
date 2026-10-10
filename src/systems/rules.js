// SecretRuleEngine — движок скрытых правил мира.
//
// Каждое правило — отдельный объект:
//   id          — ключ в памяти мира (memory.rules[id])
//   on          — список событий, на которые оно реагирует (правила проверяются ТОЛЬКО по событиям,
//                 а не каждый кадр — это дёшево по производительности)
//   handle(ctx, ev, type, st) — логика: ведёт прогресс, даёт подсказки (cue), меняет мир, вызывает ctx.complete()
//   hypothesis  — что игрок «понял». Появляется в журнале только ПОСЛЕ срабатывания и сформулировано
//                 как догадка, а не как готовое решение.
//
// Чтобы добавить новую загадку — допишите объект в массив RULES. Остальной код менять не нужно.

import { seededInt } from '../core/rng.js';

// Коридоры и служебные зоны не считаются «комнатами» для маршрутных правил.
export const TRANSIT = new Set(['corridor', 'west', 'east', 'stairs', 'elevator', 'vestibule']);

// Варианты «невозможного маршрута» зависят от seed мира — у разных игроков они разные.
export const ROUTE_VARIANTS = [
  ['archive', 'generator', 'hall', 'archive'],
  ['generator', 'archive', 'hall', 'generator'],
  ['hall', 'archive', 'start', 'generator'],
];

export function routeFor(seed) {
  return ROUTE_VARIANTS[seededInt(seed, 'route', 0, ROUTE_VARIANTS.length - 1)];
}

export function significantHistory(history) {
  const out = [];
  for (const id of history) {
    if (TRANSIT.has(id)) continue;
    if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

export const RULES = [
  // ── ПРАВИЛО 1. ТРИ ПРОХОДА ─────────────────────────────────────────────────
  {
    id: 'three_passes',
    title: 'Три прохода',
    hypothesis:
      'Дверь 0-7 открылась сама, после того как я несколько раз прошёл мимо. Когда я дёргал ручку — лампа над ней снова краснела. Может, некоторые двери открываются только тем, кто их не трогает?',
    on: ['door:pass', 'door:try', 'room:leave'],
    handle(ctx, ev, type, st) {
      if (st.done) return;
      if (type === 'door:try' && ev.id === 'd_07') {
        st.progress = 0;
        ctx.mem.door('d_07').passes = 0;
        ctx.cue('lamp07', { passes: 0 });
        if (ctx.mem.door('d_07').tried === 1) ctx.observe('d07_locked', 'Дверь 0-7 заперта. Лампа над ней горит красным.');
      }
      if (type === 'door:pass' && ev.id === 'd_07') {
        st.progress = ctx.mem.door('d_07').passes += 1;
        ctx.cue('lamp07', { passes: st.progress });
        if (st.progress === 2) ctx.observe('d07_lamp', 'Лампа над дверью 0-7 мигает жёлтым. Раньше она была красной?');
      }
      if (type === 'room:leave' && ev.id === 'corridor' && st.progress >= 3) {
        ctx.world.setDoor('d_07', { locked: false, open: true });
        ctx.observe('d07_open', 'Дверь 0-7 приоткрыта. Я её не трогал.');
        ctx.complete(this);
      }
    },
  },

  // ── ПРАВИЛО 2. ЗАБЫТЫЙ ПРЕДМЕТ ────────────────────────────────────────────
  {
    id: 'forgotten_item',
    title: 'Забытый предмет',
    hypothesis:
      'Камертон, оставленный надолго, «отзывается» на комнату. Там, где он гудел сильнее всего, стена не выдержала. Важно не только где его оставить, но и сколько мест я обойду, прежде чем вернуться.',
    on: ['item:drop', 'item:pickup', 'room:enter'],
    handle(ctx, ev, type, st) {
      const dropped = ctx.mem.data.items.dropped;
      if (type === 'item:drop' && ev.id === 'fork') {
        dropped.fork = { room: ev.room, seq: ctx.mem.data.seq, marked: false };
      }
      if (type === 'item:pickup' && ev.id === 'fork') delete dropped.fork;
      if (type !== 'room:enter' || st.done) return;
      const d = dropped.fork;
      if (!d || d.room !== ev.id) return;
      if (ctx.mem.distinctRoomsSince(d.seq, ev.id) < 3) return;
      if (ev.id === 'observation') {
        ctx.world.set('falseWallOpen', true);
        ctx.sound('crack');
        ctx.observe('fork_wall', 'Стена рядом со смотровым окном треснула и осыпалась. Камертон всё ещё звенит.');
        ctx.complete(this);
      } else if (!d.marked) {
        d.marked = true;
        st.progress = 0.5;
        ctx.world.set('forkCircle', ev.id);
        ctx.observe('fork_moved', 'Камертон лежит не там, где я его оставил. Вокруг него — меловой круг. Кто это нарисовал?');
      }
    },
  },

  // ── ПРАВИЛО 3. НЕВОЗМОЖНЫЙ МАРШРУТ ────────────────────────────────────────
  {
    id: 'impossible_route',
    title: 'Невозможный маршрут',
    hypothesis:
      'Я прошёл комнаты в том порядке, что был указан в обходном листе, — и где-то прозвенел лифт. На панели теперь есть этаж, которого нет на схеме.',
    on: ['room:enter'],
    handle(ctx, ev, type, st) {
      if (st.done) return;
      const route = routeFor(ctx.seed);
      const hist = significantHistory(ctx.mem.data.history);
      const tail = hist.slice(-route.length);
      // прогресс = сколько первых шагов маршрута совпадает с концом истории
      let best = 0;
      for (let k = 1; k <= route.length; k++) {
        const a = hist.slice(-k).join('>');
        const b = route.slice(0, k).join('>');
        if (a === b) best = k;
      }
      st.progress = best;
      if (tail.join('>') === route.join('>')) {
        ctx.world.set('floorVoid', true);
        ctx.sound('chime_far');
        ctx.observe('void_chime', 'Где-то далеко прозвенел лифт. Я никого не вызывал.');
        ctx.complete(this);
      }
    },
  },

  // ── ПРАВИЛО 4. ИЗМЕНЁННАЯ КОМНАТА ─────────────────────────────────────────
  {
    id: 'changed_room',
    title: 'Изменённая комната',
    hypothesis:
      'Комната пробуждения меняется каждый раз, когда я возвращаюсь. Не случайно — по порядку: кровать, длина, часы, новая дверь. Она будто достраивает себя.',
    on: ['room:enter'],
    handle(ctx, ev, type, st) {
      if (ev.id !== 'start' || st.done) return;
      const stage = Math.min(4, ev.visits - 1);
      if (stage <= ctx.world.get('startStage', 0)) return;
      ctx.world.set('startStage', stage);
      st.progress = stage;
      ctx.sound('settle');
      const texts = [
        null,
        'Кровать в комнате пробуждения стоит иначе. Я уверен, что она была у другой стены.',
        'Комната пробуждения стала длиннее. На метр? На два?',
        'На стене комнаты пробуждения появились вторые часы. Они идут.',
        'В комнате пробуждения появилась дверь, которой не было.',
      ];
      ctx.observe(`start_stage_${stage}`, texts[stage]);
      if (stage >= 4) ctx.complete(this);
    },
  },

  // ── ПРАВИЛО 5. ДВЕ ВЕРСИИ СОБЫТИЯ ─────────────────────────────────────────
  {
    id: 'two_versions',
    title: 'Две версии',
    hypothesis:
      'Звонок в наблюдательной. Мне кажется, звонил не тот, кто должен был. Голос зависел от того, насколько я доверял Оператору до этого.',
    on: ['phone:answer'],
    handle(ctx, ev, type, st) {
      if (st.done) return;
      const trust = ctx.mem.get('trust');
      const version = trust >= 0 ? 'operator' : 'copy';
      ctx.mem.decide('phone_version', version);
      ctx.bus.emit('phone:voice', { version });
      ctx.complete(this);
    },
  },

  // ── ПРАВИЛО 6. ЛЕВАЯ РУКА (привычка маршрута) ─────────────────────────────
  {
    id: 'habit_hand',
    title: 'Ведущая рука',
    hypothesis:
      'Я слишком часто сворачивал в одну сторону, и комплекс это учёл: в крыле появилась дверь, которая ведёт в противоположное крыло. Царапины на стене развилки считали мои повороты.',
    on: ['route', 'portal:pass'],
    handle(ctx, ev, type, st) {
      const r = ctx.mem.data.routes;
      if (type === 'portal:pass' && ev.id === 'loop') {
        ctx.observe('loop_used', 'Дверь в одном крыле вывела меня в другое. Между ними — тридцать метров коридора.');
        return;
      }
      if (type !== 'route' || (ev.dir !== 'left' && ev.dir !== 'right')) return;
      r[ev.dir] += 1;
      ctx.cue('tally', { left: r.left, right: r.right });
      if (st.done) return;
      const threshold = seededInt(ctx.seed, 'hand', 3, 4);
      st.progress = Math.abs(r.left - r.right) / threshold;
      if (Math.abs(r.left - r.right) >= threshold && Math.max(r.left, r.right) >= 4) {
        ctx.world.setDoor('d_loop', { locked: false });
        ctx.world.setDoor('d_loop_e', { locked: false });
        ctx.world.set('loopDoor', true);
        ctx.sound('settle');
        ctx.observe('loop_door', 'В боковом крыле появилась дверь. Я уверен, её здесь не было.');
        ctx.complete(this);
      }
    },
  },

  // ── ПРАВИЛО 7. НЕПОДВИЖНОСТЬ ──────────────────────────────────────────────
  {
    id: 'stillness',
    title: 'Неподвижность',
    hypothesis: 'Он появляется, когда я стою неподвижно в темноте. Фонарь его прогоняет. Или он просто ждёт, пока я перестану смотреть?',
    on: ['observer:manifest'],
    handle(ctx, ev, type, st) {
      if (st.done || ev.cause !== 'still') return;
      st.progress += 1;
      if (st.progress >= 2) ctx.complete(this);
    },
  },

  // ── ПРАВИЛО 8. ЭХО ────────────────────────────────────────────────────────
  {
    id: 'echo',
    title: 'Эхо',
    hypothesis: 'Эхо-камера записывает меня. То, что выходит из неё, повторяет мои шаги ровно с тем опозданием, что указано на пульте. И нажимает то, что нажимал я.',
    on: ['copy:appear'],
    handle(ctx, ev, type, st) {
      if (!st.done && ev.source === 'echo') ctx.complete(this);
    },
  },

  // ── ПРАВИЛО 9. ПРИВЫЧНЫЙ ПУТЬ ─────────────────────────────────────────────
  {
    id: 'worn_path',
    title: 'Протоптанный путь',
    hypothesis:
      'Я ходил по главному коридору слишком часто — и однажды он привёл меня не в вестибюль. Шторка в конце коридора колыхалась всё сильнее, будто путь «изнашивался».',
    on: ['route', 'room:enter', 'room:leave'],
    handle(ctx, ev, type, st) {
      const threshold = seededInt(ctx.seed, 'worn', 6, 8);
      if (type === 'route' && ev.dir === 'north') {
        ctx.mem.data.routes.north += 1;
        if (st.done) return;
        st.progress = ctx.mem.data.routes.north / threshold;
        ctx.cue('curtain', { sway: Math.min(1, st.progress) });
        if (ctx.mem.data.routes.north >= threshold) ctx.world.set('reflectionPortal', true);
      }
      if (type === 'route' && ev.dir === 'south') ctx.mem.data.routes.south += 1;
      if (type === 'room:enter' && ev.id === 'reflection' && !st.done) {
        ctx.observe('reflection', 'Это комната пробуждения. Но всё наоборот.');
        ctx.complete(this);
      }
      if (type === 'room:leave' && ev.id === 'reflection') ctx.world.set('reflectionPortal', false);
    },
  },

  // ── ПРАВИЛО 10. ВНИМАНИЕ ──────────────────────────────────────────────────
  {
    id: 'attention',
    title: 'Внимание',
    hypothesis: 'Я долго пробыл в архиве — и терминал показал каталог, которого раньше не было. Место раскрывается тому, кто остаётся.',
    on: ['tick:slow'],
    handle(ctx, ev, type, st) {
      if (st.done || ctx.mem.data.currentRoom !== 'archive') return;
      const t = ctx.mem.room('archive').time;
      st.progress = t / 150;
      if (t >= 150) {
        ctx.world.set('archiveDeep', true);
        ctx.sound('terminal_wake');
        ctx.observe('archive_deep', 'Терминал в архиве сам включился. На экране — новый раздел.');
        ctx.complete(this);
      }
    },
  },

  // ── ПРАВИЛО 11. ПОСЛЕ ВЗГЛЯДА ─────────────────────────────────────────────
  {
    id: 'observer_shift',
    title: 'После взгляда',
    hypothesis:
      'Каждый раз, когда я встречаю Наблюдателя, в комнатах, где я уже был, что-то сдвигается. И ещё: он всегда стоит лицом в одну сторону. Туда, где что-то скрыто?',
    on: ['observer:vanish'],
    handle(ctx, ev, type, st) {
      if (st.done || !ev.shift) return;
      st.progress += 1;
      if (st.progress >= 2) ctx.complete(this);
    },
  },
];

export class SecretRuleEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.rules = [];
    this.byEvent = new Map();
    ctx.complete = (rule) => this.complete(rule);
  }

  register(rule) {
    this.rules.push(rule);
    for (const type of rule.on) {
      if (!this.byEvent.has(type)) {
        this.byEvent.set(type, []);
        this.ctx.bus.on(type, (ev) => this.dispatch(type, ev));
      }
      this.byEvent.get(type).push(rule);
    }
  }

  registerAll(list = RULES) {
    list.forEach((r) => this.register(r));
  }

  dispatch(type, ev) {
    for (const rule of this.byEvent.get(type) || []) {
      try {
        rule.handle(this.ctx, ev, type, this.ctx.mem.rule(rule.id));
      } catch (err) {
        console.error(`[rules] правило ${rule.id} упало на ${type}:`, err);
      }
    }
  }

  complete(rule) {
    const st = this.ctx.mem.rule(rule.id);
    if (st.done) return;
    st.done = true;
    st.doneAt = Math.floor(this.ctx.mem.data.playTime);
    this.ctx.bus.emit('rule:discovered', { id: rule.id, title: rule.title, hypothesis: rule.hypothesis });
  }

  get(id) {
    return this.rules.find((r) => r.id === id);
  }

  get total() {
    return this.rules.length;
  }
}
