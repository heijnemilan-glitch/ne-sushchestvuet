// Автотест новых механик в Edge: вентиляция, лестницы, газ/противогаз, лодка, батарейки, бутылки,
// шкафчики с анимацией, кассеты, скримеры, побег. node tools/features-test.mjs
import { launchEdge } from './edge.mjs';

const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${n}${extra !== '' ? ' — ' + extra : ''}`);
process.on('exit', () => console.log(results.join('\n')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = await launchEdge({ width: 960, height: 540 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!NS.scene', 30000);
await page.eval(`(async () => {
  localStorage.clear(); NS.newGame('1'); await new Promise(r => setTimeout(r, 300));
  document.getElementById('cine').classList.add('hidden'); NS.paused = false;
  window.step = (n) => { for (let i = 0; i < n; i++) { NS.update(1/60); if (NS.state === 'cinematic') NS.lore.update(1/60); } };
  window.walk = (x, z, max = 3000) => { for (let i = 0; i < max; i++) { const p = NS.player.pos, dx = x - p.x, dz = z - p.z; if (Math.hypot(dx, dz) < 0.25) { NS.player.keys.clear(); step(5); return true; } NS.player.yaw = Math.atan2(-dx, -dz); NS.player.keys.add('KeyW'); NS.update(1/60); } NS.player.keys.clear(); return false; };
  window.tp = (x, y, z, yaw = 0) => { NS.player.setPose({ x, y, z, yaw, pitch: 0 }); NS.updateZone(false); step(3); };
  window.zone = () => NS.currentZone && NS.currentZone.id;
  NS.level.pickups.flashlight.interact();
  NS.monster.pos.set(60, 0, 60);
  return true; })()`);

// 1. Вентиляция 1: коридор → котельная
let r = await page.eval(`(() => { NS.world.set('g_v1a', true); NS.world.set('g_v1b', true); NS.level.syncGrates(); tp(1.0, 0, -18, -Math.PI/2); const a = walk(4, -18); const inVent = zone(); const crouch = NS.player.crouching; const b = walk(15.2, -18); walk(17.5, -18); return { a, inVent, crouch, b, end: zone(), x: NS.player.pos.x.toFixed(2) }; })()`);
check('вентиляция 1: вход пригнувшись', r.a && r.inVent === 'vent1' && r.crouch, JSON.stringify(r));
check('вентиляция 1: вылез в котельной', r.end === 'generator', r.end + ' x=' + r.x);
// 2. Вентиляция 2: архив → наблюдательная (подъём)
r = await page.eval(`(() => { NS.world.set('g_v2a', true); NS.world.set('g_v2b', true); NS.level.syncGrates(); tp(-20, 0, -15.2, 0); walk(-20, -20); walk(-20, -30); walk(-20, -33.5); walk(-20, -35.5); return { z: zone(), y: NS.player.pos.y.toFixed(2), pz: NS.player.pos.z.toFixed(2) }; })()`);
check('вентиляция 2: подъём в наблюдательную (y=4.5)', r.z === 'observation' && Math.abs(Number(r.y) - 4.5) < 0.1, JSON.stringify(r));
// 3. Лестница в канализацию
r = await page.eval(`(() => { tp(27, 0, -17.6, 0); NS.level.objects.find(o => o.id === 'hatch_down').interact(); step(200); return { z: zone(), y: NS.player.pos.y.toFixed(2), busy: NS.survival.busy }; })()`);
check('люк: спуск в канализацию', r.z === 'sewer' && Math.abs(Number(r.y) + 8) < 0.1 && !r.busy, JSON.stringify(r));
// 4. Газ без противогаза → кашель → обморок
r = await page.eval(`(async () => { tp(43, -8, -17.2, -Math.PI/2); walk(48, -17.2); const inGas = NS.survival.inGas; step(60 * 9); for (let t = 0; t < 200 && NS.player.pos.x > 30; t++) await new Promise(r => setTimeout(r, 100)); step(5); return { inGas, faints: NS.mem.get('fainted'), z: zone() }; })()`, 60000);
check('газ: без противогаза — обморок и пробуждение у лестницы', r.inGas && r.faints === 1 && r.z === 'sewer', JSON.stringify(r));
// 5. Противогаз
r = await page.eval(`(() => { NS.paused = false; NS.level.pickups.gasmask.interact(); tp(46, -8, -17.2, -Math.PI/2); step(60 * 5); return { mask: NS.survival.maskOn, filter: NS.world.get('filterTime').toFixed(1), tox: NS.survival.toxicity.toFixed(2) }; })()`);
check('противогаз надевается сам в газе, фильтр тратится, отравления нет', r.mask && r.filter < 90 && r.tox == 0, JSON.stringify(r));
// 6. Лодка: коллектор → насосная
r = await page.eval(`(() => { tp(29.5, -8, -17.3, 0); NS.boat.board(); let i = 0; while (NS.boat.riding && i < 60 * 60) { step(1); i++; } return { z: zone(), secs: (i / 60).toFixed(1), at: NS.world.get('boatAt'), state: NS.state }; })()`);
check('лодка доплыла до насосной', r.z === 'pump' && r.at === 'pump', JSON.stringify(r));
// 7. Батарейка, стимулятор
r = await page.eval(`(() => { NS.inv.addCount('battery', 1); NS.inv.addCount('stim', 1); NS.world.data.vars.battery = 10; NS.survival.swapBattery(); const bat = NS.survival.battery; NS.survival.useStim(); return { bat, stim: NS.survival.stimTime > 0, mul: NS.survival.speedMul }; })()`);
check('батарейка заменена (100%), стимулятор ускоряет', r.bat === 100 && r.stim && r.mul > 1, JSON.stringify(r));
// 8. Бутылка → Оно идёт на звук
r = await page.eval(`(() => { tp(0, 0, -6, 0); NS.monster.wake(true); NS.monster.pos.set(0, 0, -21); NS.monster.state = 'patrol'; NS.monster.cool = 0; NS.monster.yaw = 0; NS.flashlightOn = false; NS.inv.addCount('bottle', 1); NS.player.pitch = 0.3; NS.player.applyCamera(0.016); NS.survival.throwBottle(); step(90); return { state: NS.monster.state, tx: NS.monster.target && NS.monster.target.z.toFixed(1) }; })()`);
check('бутылка разбилась — Оно пошло проверять', r.state === 'investigate', JSON.stringify(r));
// 9. Шкафчик: анимация входа/выхода, труп
r = await page.eval(`(() => { NS.monster.pos.set(60, 0, 60); const L = NS.level.horror.lockers; tp(L[0].front.x, 0, L[0].front.z, L[0].yaw); NS.toggleHide(L[0]); step(50); const inside = !!NS.player.hiddenIn && !NS.lockerAnim; NS.toggleHide(L[0]); step(50); const out = !NS.player.hiddenIn; const c = L.find(l => l.corpse); tp(c.front.x, 0, c.front.z, c.yaw); NS.toggleHide(c); step(40); return { inside, out, corpse: NS.world.get('corpseFell'), hidden: !!NS.player.hiddenIn }; })()`);
check('шкафчик: залез и вылез с анимацией', r.inside && r.out, JSON.stringify(r));
check('шкафчик с трупом: скример, внутрь не залезть', r.corpse && !r.hidden);
// 10. Кассета → ролик → пропуск
r = await page.eval(`(async () => { tp(-17.2, 0, -12.8, Math.PI); NS.level.pickups.tape1.interact(); await new Promise(r => setTimeout(r, 800)); const st = NS.state; step(120); NS.lore.skip(); return { st, after: NS.state, tapes: NS.profile.tapes.join(',') }; })()`);
check('кассета: ролик лора и возврат в игру', r.st === 'cinematic' && r.after === 'playing' && r.tapes.includes('1'), JSON.stringify(r));
// 11. Скример в коридоре (затемнение)
r = await page.eval(`(async () => { NS.world.set('monsterAwake', true); NS.monster.pos.set(60,0,60); tp(0, 0, -12.5, 0); step(20); const black = NS.level.blackout; await new Promise(r => setTimeout(r, 2700)); step(10); return { black, done: !!NS.scares.done.blackout }; })()`);
check('скример «затемнение» в коридоре', r.black === 'corridor' && r.done, JSON.stringify(r));
// 12. Побег: болторез → решётка → наружу → концовка
r = await page.eval(`(async () => { NS.level.pickups.cutters.interact(); tp(118.5, -8, -14, -Math.PI/2); NS.level.objects.find(o => o.id === 'out_grate').interact(); const cut = NS.world.get('grateCut'); walk(124, -14); const z = zone(); await new Promise(r => setTimeout(r, 4200)); return { cut, z, state: NS.state, endings: NS.profile.endings.join(',') }; })()`, 30000);
check('побег через водосток → концовка «ПОБЕГ»', r.cut && r.z === 'outside' && r.state === 'ending' && r.endings.includes('ending_escape'), JSON.stringify(r));

const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l));
check('консоль без ошибок', errs.length === 0, errs.slice(0, 4).join(' | '));
await edge.close();
