// Автотест механик новой карты в Edge: карта, вода под током, рубильник линии 2, мастерская,
// детали ружья и сборка, стрельба по Оно, карантин и гермоворота («Охотник»), вентиляция, люк,
// газ/противогаз, лодка, бутылка, шкафчики, кассета, скример, побег. node tools/features-test.mjs
import { launchEdge } from './edge.mjs';

const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${n}${extra !== '' ? ' — ' + extra : ''}`);
process.on('exit', () => console.log(results.join('\n')));

const edge = await launchEdge({ width: 960, height: 540 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!NS.scene', 30000);
await page.send('Page.bringToFront');
await page.eval(`(async () => {
  localStorage.clear(); await NS.newGame('1'); await new Promise(r => setTimeout(r, 300));
  document.getElementById('cine').classList.add('hidden'); NS.paused = false;
  window.step = (n) => { for (let i = 0; i < n; i++) { NS.update(1/60); if (NS.state === 'cinematic') NS.lore.update(1/60); } };
  window.walk = (x, z, max = 3000) => { for (let i = 0; i < max; i++) { if (NS.state !== 'playing') return false; const p = NS.player.pos, dx = x - p.x, dz = z - p.z; if (Math.hypot(dx, dz) < 0.25) { NS.player.keys.clear(); step(5); return true; } NS.player.yaw = Math.atan2(-dx, -dz); NS.player.keys.add('KeyW'); NS.update(1/60); } NS.player.keys.clear(); return false; };
  window.tp = (x, y, z, yaw = 0) => { NS.player.setPose({ x, y, z, yaw, pitch: 0 }); NS.updateZone(false); step(3); };
  window.zone = () => NS.currentZone && NS.currentZone.id;
  window.obj = (id) => NS.level.objects.find(o => o.id === id);
  window.waitPlaying = async (ms = 20000) => { const t0 = performance.now(); while (NS.state !== 'playing' && performance.now() - t0 < ms) { if (NS.state === 'caught') NS.updateCaught(1 / 20); await new Promise(r => setTimeout(r, 50)); } step(3); return NS.state; };
  NS.monster.pos.set(60, 0, 60);
  return true; })()`);

// 1. Изолятор: карта и фонарь, клавиша M
let r = await page.eval(`(() => { NS.level.pickups.flashlight.interact(); NS.level.pickups.map.interact(); NS.ui.showMap(); const open = NS.ui.modal === 'map' && !!document.getElementById('papermap'); const txt = document.querySelector('.mapright').textContent; NS.ui.closeModal(); NS.paused = false; return { open, exits: /ГЕРМОВОРОТА/.test(txt) && /ВОДОСТОК/.test(txt) && /ЯДРО/.test(txt), hasMap: NS.inv.has('map') }; })()`);
check('карта: взял со стола, открывается, на ней 3 выхода', r.open && r.exits && r.hasMap, JSON.stringify(r));

// 2. Вода под током — смерть, пробуждение в изоляторе
r = await page.eval(`(async () => { tp(-16.2, 0, -19, 0); const live = NS.level.cableLive(); walk(-16.2, -25); const st = NS.state; const deaths = NS.mem.get('shocked'); await waitPlaying(); return { live, st, deaths, z: zone() }; })()`, 40000);
check('вода под током: шаг в воду — удар током, пробуждение в изоляторе', r.live && r.st === 'caught' && r.deaths === 1 && r.z === 'start', JSON.stringify(r));

// 3. Рубильник линии 2 в подстанции
r = await page.eval(`(() => { tp(33.4, 0, -15.5, -Math.PI / 2); obj('cable_breaker').interact(); return { off: !NS.world.get('cableOff') ? false : true, live: NS.level.cableLive() }; })()`);
check('рубильник «Линия 2» обесточивает кабель', r.off && !r.live, JSON.stringify(r));

// 4. Затопленный угол без тока → мастерская
r = await page.eval(`(() => { tp(-16.2, 0, -19, 0); walk(-16.2, -28); const y = NS.player.pos.y.toFixed(2); const alive = NS.state === 'playing'; tp(-17.3, -0.32, -28, -Math.PI / 2); NS.world.setDoor('d_workshop', { open: true }); step(30); walk(-21, -28); return { y, alive, z: zone() }; })()`);
check('без тока по воде можно пройти в мастерскую', r.alive && Number(r.y) < -0.2 && r.z === 'workshop', JSON.stringify(r));

// 5. Детали ружья и сборка на верстаке
r = await page.eval(`(() => { NS.level.pickups.part_barrel.interact(); NS.level.pickups.part_stock.interact(); NS.level.pickups.part_bolt.interact(); const parts = ['part_barrel','part_stock','part_bolt'].every(p => NS.inv.has(p)); tp(-24.5, 0, -21.8, Math.PI); obj('workbench').interact(); const busy = NS.weapon.busy; step(60 * 4); return { parts, busy, gun: NS.inv.has('shotgun'), left: ['part_barrel','part_stock','part_bolt'].some(p => NS.inv.has(p)) }; })()`);
check('ружьё: 3 детали собраны на верстаке (анимация сборки)', r.parts && r.busy && r.gun && !r.left, JSON.stringify(r));
r = await page.eval(`(async () => { NS.level.supplies.filter(s => s.kind === 'shells').slice(0, 3).forEach(s => s.interact()); await new Promise(r => setTimeout(r, 500)); step(60 * 2.5); return { loaded: NS.world.get('gunLoaded'), shells: NS.inv.count('shells') }; })()`);
check('патроны: подобрал — ружьё само перезарядилось', r.loaded === 2 && r.shells === 4, JSON.stringify(r));

// 6. Карантин: пока Оно живо, ворота не открываются
r = await page.eval(`(() => { NS.world.set('power', true); tp(10.5, 0, -49.4, -Math.PI / 2); NS.level.gatePanel(); return { open: !!NS.world.get('blastOpen') }; })()`);
check('гермоворота: карантин, пока Оно живо', !r.open, JSON.stringify(r));

// 7. Стрельба: три попадания — Оно мертво
r = await page.eval(`(async () => {
  const m = NS.monster; m.wake(true); NS.monster.cool = 99;
  const shoot = () => { m.pos.set(0, 0, -48); m.state = 'patrol'; m.stagger = 0; m.cool = 99; tp(0, 0, -42, 0); NS.player.pitch = -0.05; NS.player.applyCamera(0.016); NS.weapon.cooldown = 0; NS.weapon.fire(); step(30); };
  const hp0 = m.hp; shoot(); const hp1 = m.hp; const stag = m.stagger > 0; shoot(); await new Promise(r => setTimeout(r, 700)); step(60 * 2); const reloaded = NS.world.get('gunLoaded'); shoot(); step(60 * 3);
  return { hp0, hp1, stag, reloaded, dead: m.dead, world: !!NS.world.get('monsterDead'), shots: NS.mem.get('shots') };
})()`);
check('ружьё: попадание ранит Оно (оно шатается)', r.hp0 === 3 && r.hp1 === 2 && r.stag, JSON.stringify(r));
check('три попадания — Оно мертво', r.dead && r.world, JSON.stringify(r));

// 8. Гермоворота открываются → поверхность → концовка «Охотник»
r = await page.eval(`(async () => { tp(10.5, 0, -49.4, -Math.PI / 2); NS.level.gatePanel(); const open = !!NS.world.get('blastOpen'); step(60 * 8); tp(11, 0, -53, -Math.PI / 2); walk(16, -53); const gw = zone(); walk(29.5, -53); walk(33, -53); const z = zone(); await new Promise(r => setTimeout(r, 4600)); return { open, gw, z, state: NS.state, endings: NS.profile.endings.join(',') }; })()`, 40000);
check('гермоворота открылись, шлюз → поверхность → «ОХОТНИК»', r.open && r.gw === 'gateway' && r.z === 'surface' && r.state === 'ending' && r.endings.includes('ending_hunter'), JSON.stringify(r));

// новая игра для остальных механик
await page.eval(`(async () => { localStorage.clear(); NS.ui.el.ending.classList.add('hidden'); await NS.newGame('1'); await new Promise(r => setTimeout(r, 300)); document.getElementById('cine').classList.add('hidden'); NS.paused = false; NS.level.pickups.flashlight.interact(); NS.monster.pos.set(60, 0, 60); step(5); return true; })()`);

// 9. Вентиляция 1: восточные мостки → подстанция
r = await page.eval(`(() => { NS.world.set('g_v1a', true); NS.world.set('g_v1b', true); NS.level.syncGrates(); tp(16.5, 0, -18, -Math.PI/2); const a = walk(19.5, -18); const inVent = zone(); const crouch = NS.player.crouching; walk(31.2, -18); walk(33.5, -18); return { a, inVent, crouch, end: zone() }; })()`);
check('вентиляция 1: мостки → подстанция пригнувшись', r.a && r.inVent === 'vent1' && r.crouch && r.end === 'generator', JSON.stringify(r));
// 10. Вентиляция 2: мастерская → наблюдательная (подъём)
r = await page.eval(`(() => { NS.world.set('g_v2a', true); NS.world.set('g_v2b', true); NS.level.syncGrates(); tp(-20, 0, -30.6, 0); walk(-20, -34); walk(-20, -42); walk(-20, -46.4); walk(-20, -48.6); return { z: zone(), y: NS.player.pos.y.toFixed(2) }; })()`);
check('вентиляция 2: подъём в наблюдательную (y=4.5)', r.z === 'observation' && Math.abs(Number(r.y) - 4.5) < 0.1, JSON.stringify(r));
// 11. Люк в канализацию
r = await page.eval(`(() => { tp(43, 0, -17.6, 0); obj('hatch_down').interact(); step(200); return { z: zone(), y: NS.player.pos.y.toFixed(2), busy: NS.survival.busy }; })()`);
check('люк в подстанции: спуск в канализацию', r.z === 'sewer' && Math.abs(Number(r.y) + 8) < 0.1 && !r.busy, JSON.stringify(r));
r = await page.eval(`(() => { tp(27, -8, -21, Math.PI); obj('ladder_up').interact(); step(200); return { z: zone(), y: NS.player.pos.y.toFixed(2) }; })()`);
check('лестница из коллектора ведёт обратно в подстанцию', r.z === 'generator' && Math.abs(Number(r.y)) < 0.1, JSON.stringify(r));
// 12. Газ без противогаза → обморок
r = await page.eval(`(async () => { tp(43, -8, -17.2, -Math.PI/2); walk(48, -17.2); const inGas = NS.survival.inGas; step(60 * 9); for (let t = 0; t < 200 && NS.player.pos.x > 30; t++) await new Promise(r => setTimeout(r, 100)); step(5); return { inGas, faints: NS.mem.get('fainted'), z: zone() }; })()`, 60000);
check('газ: без противогаза — обморок и пробуждение у лестницы', r.inGas && r.faints === 1 && r.z === 'sewer', JSON.stringify(r));
r = await page.eval(`(() => { NS.paused = false; NS.level.pickups.gasmask.interact(); tp(46, -8, -17.2, -Math.PI/2); step(60 * 5); return { mask: NS.survival.maskOn, filter: NS.world.get('filterTime').toFixed(1), tox: NS.survival.toxicity.toFixed(2) }; })()`);
check('противогаз надевается сам в газе', r.mask && r.filter < 90 && r.tox == 0, JSON.stringify(r));
// 13. Лодка
r = await page.eval(`(() => { tp(29.5, -8, -17.3, 0); NS.boat.board(); let i = 0; while (NS.boat.riding && i < 60 * 60) { step(1); i++; } return { z: zone(), at: NS.world.get('boatAt') }; })()`);
check('лодка доплыла до насосной', r.z === 'pump' && r.at === 'pump', JSON.stringify(r));
// 14. Бутылка → Оно идёт на звук
r = await page.eval(`(() => { tp(-6, 0, -1.8, -Math.PI / 2); NS.monster.wake(true); NS.monster.pos.set(10, 0, -1.8); NS.monster.state = 'patrol'; NS.monster.cool = 0; NS.monster.yaw = Math.PI / 2; NS.flashlightOn = false; NS.inv.addCount('bottle', 1); NS.player.pitch = 0.3; NS.player.applyCamera(0.016); NS.survival.throwBottle(); step(90); return { state: NS.monster.state }; })()`);
check('бутылка разбилась — Оно пошло проверять', r.state === 'investigate', JSON.stringify(r));
// 15. Шкафчики
r = await page.eval(`(() => { NS.monster.pos.set(60, 0, 60); NS.monster.state = 'patrol'; const L = NS.level.horror.lockers; const l = L.find(l => !l.corpse); tp(l.front.x, l.inside.y, l.front.z, l.yaw); NS.toggleHide(l); step(50); const inside = !!NS.player.hiddenIn && !NS.lockerAnim; NS.toggleHide(l); step(50); const out = !NS.player.hiddenIn; const c = L.find(l => l.corpse); tp(c.front.x, 0, c.front.z, c.yaw); NS.toggleHide(c); step(40); return { inside, out, corpse: NS.world.get('corpseFell'), hidden: !!NS.player.hiddenIn }; })()`);
check('шкафчик: залез и вылез с анимацией', r.inside && r.out, JSON.stringify(r));
check('шкафчик с трупом: скример', r.corpse && !r.hidden, JSON.stringify(r));
// 16. Кассета
r = await page.eval(`(async () => { tp(-33.2, 0, -12.8, Math.PI); NS.level.pickups.tape1.interact(); await new Promise(r => setTimeout(r, 800)); const st = NS.state; step(120); NS.lore.skip(); return { st, after: NS.state }; })()`);
check('кассета: ролик лора и возврат в игру', r.st === 'cinematic' && r.after === 'playing', JSON.stringify(r));
// 17. Скример на восточных мостках (свет гаснет)
r = await page.eval(`(async () => { NS.world.set('monsterAwake', true); NS.monster.pos.set(60, 0, 60); NS.monster.state = 'patrol'; tp(16.3, 0, -14, 0); step(20); const black = NS.level.blackout; await new Promise(r => setTimeout(r, 2700)); step(10); return { black, done: !!NS.scares.done.blackout }; })()`);
check('скример «затемнение» на мостках', r.black === 'corridor' && r.done, JSON.stringify(r));
// 18. Побег
r = await page.eval(`(async () => { NS.level.pickups.cutters.interact(); tp(118.5, -8, -14, -Math.PI/2); obj('out_grate').interact(); const cut = NS.world.get('grateCut'); walk(124, -14); const z = zone(); await new Promise(r => setTimeout(r, 4200)); return { cut, z, state: NS.state }; })()`, 30000);
check('побег через водосток → концовка «ПОБЕГ»', r.cut && r.z === 'outside' && r.state === 'ending', JSON.stringify(r));

// 19. Утопленник: стоишь у края — всплывает и утаскивает; отошёл — уходит; выстрел прогоняет
await page.eval(`(async () => { localStorage.clear(); NS.ui.el.ending.classList.add('hidden'); await NS.newGame('1'); await new Promise(r => setTimeout(r, 300)); document.getElementById('cine').classList.add('hidden'); NS.paused = false; NS.monster.pos.set(60, 0, 60); NS.mem.data.playTime = 60; return true; })()`);
r = await page.eval(`(async () => {
  const b = NS.beast; b.pos.set(6, -3.2, -12); b.y = -3.2; b.state = 'roam'; b.cool = 0;
  let rose = false;
  for (let i = 0; i < 60 * 12 && NS.state === 'playing'; i++) { NS.player.setPose({ x: 6, y: 0, z: -3.25, yaw: 0, pitch: 0 }); NS.updateZone(false); NS.update(1/60); if (b.state === 'rise') rose = true; }
  const st = NS.state; const drowned = NS.mem.get('drowned');
  await waitPlaying();
  return { rose, st, drowned, z: zone() };
})()`, 60000);
check('утопленник: у края всплывает и утаскивает под воду', r.rose && r.st === 'caught' && r.drowned === 1 && r.z === 'start', JSON.stringify(r));
r = await page.eval(`(() => {
  const b = NS.beast; b.pos.set(6, -3.2, -12); b.y = -3.2; b.state = 'roam'; b.cool = 0;
  let rose = false;
  for (let i = 0; i < 60 * 12 && NS.state === 'playing'; i++) { NS.player.setPose({ x: 6, y: 0, z: b.state === 'rise' ? -1 : -3.25, yaw: 0, pitch: 0 }); NS.updateZone(false); NS.update(1/60); if (b.state === 'rise') rose = true; }
  return { rose, st: NS.state, state: b.state };
})()`, 60000);
check('утопленник: если отойти от края — не достанет', r.rose && r.st === 'playing', JSON.stringify(r));
r = await page.eval(`(() => {
  NS.inv.add('shotgun'); NS.world.data.vars.gunLoaded = 2;
  const b = NS.beast; b.pos.set(6, -0.9, -4.6); b.y = -0.9; b.state = 'rise'; b.timer = -5;
  NS.player.setPose({ x: 6, y: 0, z: -1.5, yaw: 0, pitch: -0.15 }); NS.player.applyCamera(0.016); NS.weapon.cooldown = 0; NS.weapon.fire(); NS.update(1/60);
  return { state: b.state, cool: Math.round(b.cool) };
})()`);
check('утопленник: выстрел прогоняет его на глубину', r.state === 'dive' && r.cool > 10, JSON.stringify(r));
// 20. Осколки мнемита: подсвечены, подбираются, показывают воспоминание, свечение гаснет
r = await page.eval(`(async () => {
  const shards = NS.level.supplies.filter(s => s.kind === 'shard');
  const light = NS.builder.lights.find(l => l.mode === 'item' && l.itemId === shards[0].id);
  const litBefore = light._on;
  shards[0].interact(); NS.level.refreshLights();
  await new Promise(r => setTimeout(r, 900));
  const note = NS.ui.modal === 'note' && /Осколок мнемита/.test(document.querySelector('.paper h2').textContent);
  NS.ui.closeModal();
  shards.slice(1).forEach(s => s.interact());
  await new Promise(r => setTimeout(r, 900)); NS.ui.closeModal();
  return { total: shards.length, litBefore, litAfter: light._on, note, count: NS.inv.count('shard'), code: NS.mem.data.codes.some(c => c.id === 'all_shards') };
})()`);
check('осколки мнемита: 6 штук, светятся, воспоминание при подборе, все 6 — код', r.total === 6 && r.litBefore && !r.litAfter && r.note && r.count === 6 && r.code, JSON.stringify(r));

const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l));
check('консоль без ошибок', errs.length === 0, errs.slice(0, 4).join(' | '));
await edge.close();
