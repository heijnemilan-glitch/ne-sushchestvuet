// Автотесты логики (без графики): память мира, скрытые правила, коды, сохранения.
// Запуск: node tests/logic.test.mjs
import assert from 'node:assert/strict';

// localStorage для Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { EventBus } = await import('../src/core/events.js');
const { WorldMemory } = await import('../src/systems/memory.js');
const { WorldState } = await import('../src/systems/worldstate.js');
const { SecretRuleEngine, RULES, routeFor } = await import('../src/systems/rules.js');
const { makeCode, parseCode } = await import('../src/systems/codes.js');
const { SaveManager } = await import('../src/systems/save.js');
const { seededInt } = await import('../src/core/rng.js');

function setup(seed = 12345) {
  const bus = new EventBus();
  const mem = new WorldMemory(bus, WorldMemory.fresh(seed));
  const world = new WorldState(bus, WorldState.fresh());
  const log = { observe: [], sound: [], cue: [], discovered: [] };
  const engine = new SecretRuleEngine({
    mem,
    world,
    bus,
    seed,
    observe: (id, text) => (mem.observe(id, text), log.observe.push(id)),
    sound: (n) => log.sound.push(n),
    cue: (n, d) => log.cue.push([n, d]),
  });
  engine.registerAll(RULES);
  bus.on('rule:discovered', (e) => log.discovered.push(e.id));
  return { bus, mem, world, engine, log };
}

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, '\n   ', err.message);
    process.exitCode = 1;
  }
};

console.log('Память мира');
test('посещения, время, история, различные комнаты после seq', () => {
  const { mem } = setup();
  mem.enterRoom('start');
  mem.tick(5);
  mem.enterRoom('corridor');
  mem.enterRoom('start');
  assert.equal(mem.room('start').visits, 2);
  assert.equal(mem.room('start').time, 5);
  assert.deepEqual(mem.lastRooms(3), ['start', 'corridor', 'start']);
  assert.equal(mem.distinctRoomsSince(1, 'start'), 1);
});

console.log('Правило 1 — Три прохода');
test('три прохода без касания открывают дверь после выхода из коридора', () => {
  const { bus, mem, world, log } = setup();
  mem.enterRoom('corridor');
  bus.emit('door:pass', { id: 'd_07' });
  bus.emit('door:pass', { id: 'd_07' });
  bus.emit('door:pass', { id: 'd_07' });
  assert.equal(mem.rule('three_passes').done, false, 'не раньше выхода');
  mem.enterRoom('hall');
  assert.equal(mem.rule('three_passes').done, true);
  assert.deepEqual(world.door('d_07'), { open: true, locked: false });
  assert.ok(log.discovered.includes('three_passes'));
});
test('попытка открыть сбрасывает счётчик', () => {
  const { bus, mem } = setup();
  mem.enterRoom('corridor');
  bus.emit('door:pass', { id: 'd_07' });
  bus.emit('door:pass', { id: 'd_07' });
  mem.door('d_07').tried++;
  bus.emit('door:try', { id: 'd_07' });
  bus.emit('door:pass', { id: 'd_07' });
  mem.enterRoom('hall');
  assert.equal(mem.rule('three_passes').done, false);
  assert.equal(mem.rule('three_passes').progress, 1);
});

console.log('Правило 2 — Забытый предмет');
test('камертон в наблюдательной + 3 другие комнаты → стена открывается', () => {
  const { bus, mem, world } = setup();
  mem.enterRoom('observation');
  bus.emit('item:drop', { id: 'fork', room: 'observation' });
  mem.enterRoom('hall');
  mem.enterRoom('corridor');
  mem.enterRoom('observation');
  assert.equal(world.get('falseWallOpen'), undefined, 'двух комнат мало');
  mem.enterRoom('hall');
  mem.enterRoom('corridor');
  mem.enterRoom('west');
  mem.enterRoom('archive');
  mem.enterRoom('west');
  mem.enterRoom('corridor');
  mem.enterRoom('hall');
  mem.enterRoom('observation');
  // после повторного входа seq сбросился? — нет, отсчёт от момента, когда положили
  assert.equal(world.get('falseWallOpen'), true);
  assert.equal(mem.rule('forgotten_item').done, true);
});
test('в другой комнате — меловой круг (частичная подсказка)', () => {
  const { bus, mem, world } = setup();
  mem.enterRoom('archive');
  bus.emit('item:drop', { id: 'fork', room: 'archive' });
  ['west', 'corridor', 'hall', 'corridor', 'west', 'archive'].forEach((r) => mem.enterRoom(r));
  assert.equal(world.get('forkCircle'), 'archive');
  assert.equal(mem.rule('forgotten_item').done, false);
});
test('подобранный камертон отменяет отсчёт', () => {
  const { bus, mem, world } = setup();
  mem.enterRoom('observation');
  bus.emit('item:drop', { id: 'fork', room: 'observation' });
  bus.emit('item:pickup', { id: 'fork' });
  ['hall', 'corridor', 'west', 'archive', 'west', 'corridor', 'hall', 'observation'].forEach((r) => mem.enterRoom(r));
  assert.equal(world.get('falseWallOpen'), undefined);
});

console.log('Правило 3 — Невозможный маршрут');
test('маршрут из обходного листа (по seed) открывает этаж Ø; коридоры не считаются', () => {
  for (const seed of [1, 2, 3, 99, 4242]) {
    const { mem, world } = setup(seed);
    const route = routeFor(seed);
    mem.enterRoom('start');
    for (const r of route) {
      mem.enterRoom('corridor');
      mem.enterRoom(r);
    }
    assert.equal(world.get('floorVoid'), true, `seed ${seed}: ${route}`);
  }
});
test('неверный порядок не срабатывает', () => {
  const { mem, world } = setup(1);
  const route = [...routeFor(1)].reverse();
  route.forEach((r) => (mem.enterRoom('corridor'), mem.enterRoom(r)));
  if (route.join() !== routeFor(1).join()) assert.equal(world.get('floorVoid'), undefined);
});

console.log('Правило 4 — Изменённая комната');
test('5 визитов в комнату пробуждения → этап 4 (дверь)', () => {
  const { mem, world } = setup();
  for (let i = 0; i < 5; i++) {
    mem.enterRoom('start');
    mem.enterRoom('corridor');
  }
  assert.equal(world.get('startStage'), 4);
  assert.equal(mem.rule('changed_room').done, true);
});

console.log('Правило 5 — Две версии события');
test('доверие ≥ 0 → голос Оператора, < 0 → голос Копии', () => {
  for (const [trust, expect] of [[0, 'operator'], [2, 'operator'], [-1, 'copy']]) {
    const { bus, mem } = setup();
    mem.set('trust', trust);
    let got = null;
    bus.on('phone:voice', (e) => (got = e.version));
    bus.emit('phone:answer', {});
    assert.equal(got, expect);
    assert.equal(mem.data.decisions.phone_version, expect);
  }
});

console.log('Правило 6 — Ведущая рука');
test('частые повороты налево создают дверь-петлю', () => {
  const { bus, mem, world } = setup();
  const th = seededInt(12345, 'hand', 3, 4);
  for (let i = 0; i < Math.max(4, th); i++) bus.emit('route', { dir: 'left' });
  assert.equal(world.get('loopDoor'), true);
  assert.equal(world.door('d_loop').locked, false);
  assert.equal(mem.data.routes.left, Math.max(4, th));
});
test('сбалансированные повороты — нет двери', () => {
  const { bus, world } = setup();
  for (let i = 0; i < 6; i++) bus.emit('route', { dir: i % 2 ? 'left' : 'right' });
  assert.equal(world.get('loopDoor'), undefined);
});

console.log('Правило 9 — Протоптанный путь');
test('порог проходов на север активирует портал; после «Отражения» он гаснет', () => {
  const { bus, mem, world } = setup(777);
  const th = seededInt(777, 'worn', 6, 8);
  for (let i = 0; i < th - 1; i++) bus.emit('route', { dir: 'north' });
  assert.equal(world.get('reflectionPortal'), undefined);
  bus.emit('route', { dir: 'north' });
  assert.equal(world.get('reflectionPortal'), true);
  mem.enterRoom('reflection');
  assert.equal(mem.rule('worn_path').done, true);
  mem.enterRoom('corridor');
  assert.equal(world.get('reflectionPortal'), false);
});

console.log('Правило 10 — Внимание');
test('150 с в архиве открывают скрытый каталог', () => {
  const { bus, mem, world } = setup();
  mem.enterRoom('archive');
  for (let i = 0; i < 149; i++) {
    mem.tick(1);
    bus.emit('tick:slow', {});
  }
  assert.equal(world.get('archiveDeep'), undefined);
  mem.tick(1);
  bus.emit('tick:slow', {});
  assert.equal(world.get('archiveDeep'), true);
});

console.log('Правила 7, 8, 11');
test('неподвижность / эхо / после взгляда', () => {
  const { bus, mem } = setup();
  bus.emit('observer:manifest', { cause: 'still' });
  bus.emit('observer:manifest', { cause: 'rule' });
  assert.equal(mem.rule('stillness').done, false);
  bus.emit('observer:manifest', { cause: 'still' });
  assert.equal(mem.rule('stillness').done, true);
  bus.emit('copy:appear', { source: 'residue' });
  assert.equal(mem.rule('echo').done, false);
  bus.emit('copy:appear', { source: 'echo' });
  assert.equal(mem.rule('echo').done, true);
  bus.emit('observer:vanish', { shift: 'archive' });
  bus.emit('observer:vanish', { shift: null });
  bus.emit('observer:vanish', { shift: 'hall' });
  assert.equal(mem.rule('observer_shift').done, true);
});

console.log('Коды открытий');
test('код создаётся, читается, подделка отвергается', () => {
  const c = makeCode('three_passes', 0xabcdef);
  assert.match(c, /^NS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const r = parseCode(c.toLowerCase());
  assert.equal(r.ok, true);
  assert.equal(r.id, 'three_passes');
  const bad = c.slice(0, -1) + (c.endsWith('A') ? 'B' : 'A');
  assert.equal(parseCode(bad).ok, false);
  assert.equal(parseCode('hello').ok, false);
  assert.equal(parseCode(makeCode('ending_none', 5)).id, 'ending_none');
});

console.log('Сохранения');
test('сохранение, повреждение, восстановление из резервной копии', () => {
  store.clear();
  const sm = new SaveManager();
  const payload = (n) => ({ meta: { room: 'hall', playTime: n }, memory: { seed: n }, world: { vars: { n } }, inventory: { items: [] }, player: {} });
  assert.ok(sm.save('1', payload(1)));
  assert.ok(sm.save('1', payload(2)));
  assert.equal(sm.load('1').payload.world.vars.n, 2);
  // портим основную запись
  store.set('ns_save_1', store.get('ns_save_1').replace('"n\\":2', '"n\\":9'));
  const r = sm.load('1');
  assert.equal(r.ok, true);
  assert.equal(r.restored, true);
  assert.equal(r.payload.world.vars.n, 1, 'взята резервная копия');
  store.set('ns_save_2', 'мусор');
  assert.equal(sm.load('2').ok, false);
  assert.equal(sm.load('3').ok, false);
  assert.equal(sm.lastSlot(), '1');
  const exported = sm.exportText('1');
  assert.ok(sm.importText('3', exported).ok);
  assert.equal(sm.importText('3', '{"bad":1}').ok, false);
});

console.log(`\nПройдено: ${passed}${process.exitCode ? ' (есть ошибки)' : ''}`);
