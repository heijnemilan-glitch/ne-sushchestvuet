// Скрытые правила и порталы на новой карте (Edge): маршруты налево/направо, дверь 0-7 и комната 0-7,
// «Отражение» за шторкой тоннеля, дверь-петля, бесконечная лестница → лаборатория, лифт.
// node tools/rules-test.mjs
import { launchEdge } from './edge.mjs';

const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${n}${extra !== '' ? ' — ' + extra : ''}`);
process.on('exit', () => console.log(results.join('\n')));

const edge = await launchEdge({ width: 960, height: 540 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!NS.scene', 30000);
await page.eval(`(async () => {
  localStorage.clear(); await NS.newGame('1'); await new Promise(r => setTimeout(r, 300));
  document.getElementById('cine').classList.add('hidden'); NS.paused = false;
  window.step = (n) => { for (let i = 0; i < n; i++) NS.update(1/60); };
  window.walk = (x, z, max = 3000) => { let px = NS.player.pos.x, pz = NS.player.pos.z; for (let i = 0; i < max; i++) { if (NS.state !== 'playing') return false; const p = NS.player.pos; if (Math.hypot(p.x - px, p.z - pz) > 2) { NS.player.keys.clear(); step(5); return 'portal'; } px = p.x; pz = p.z; const dx = x - p.x, dz = z - p.z; if (Math.hypot(dx, dz) < 0.25) { NS.player.keys.clear(); step(5); return true; } NS.player.yaw = Math.atan2(-dx, -dz); NS.player.keys.add('KeyW'); NS.update(1/60); } NS.player.keys.clear(); return false; };
  window.tp = (x, y, z, yaw = 0) => { NS.player.setPose({ x, y, z, yaw, pitch: 0 }); NS.updateZone(false); step(3); };
  window.zone = () => NS.currentZone && NS.currentZone.id;
  NS.level.pickups.flashlight.interact();
  NS.monster.pos.set(60, 0, 60);
  return true; })()`);

// маршруты: мостки → жилой блок (налево), мостки → техблок (направо)
let r = await page.eval(`(() => { tp(-12, 0, -1.8, 0); walk(-16.3, -4); walk(-16.3, -8); NS.world.setDoor('d_west', { open: true }); step(30); walk(-20, -8); const left = NS.mem.data.routes.left; walk(-16.3, -8); walk(-16.3, -2); walk(16.3, -2); walk(16.3, -8); NS.world.setDoor('d_east', { open: true }); step(30); walk(20, -8); return { left, right: NS.mem.data.routes.right, z: zone() }; })()`);
check('маршрут: налево (жилой блок) и направо (техблок) засчитываются', r.left === 1 && r.right === 1 && r.z === 'east', JSON.stringify(r));

// Правило 1: три прохода мимо 0-7 по южным мосткам → дверь открывается сама
r = await page.eval(`(() => { for (let i = 0; i < 3; i++) { tp(-13, 0, -1.8, 0); walk(-4, -1.8); } const passes = NS.mem.door('d_07').passes; NS.world.setDoor('d_start', { open: true }); step(30); walk(0, -1.8); walk(0, 0.8); const z = zone(); const st = NS.world.door('d_07'); return { passes, z, open: st.open, locked: st.locked, done: NS.mem.rule('three_passes').done }; })()`);
check('правило «Три прохода»: дверь 0-7 открылась сама', r.passes >= 3 && r.done && r.open && !r.locked, JSON.stringify(r));
r = await page.eval(`(() => { tp(-9, 0, -1.2, Math.PI); walk(-9, 2.6); const z = zone(); const pz = NS.player.pos.z; walk(-74, 14); const inside = zone(); for (let i = 0; i < 400 && NS.player.pos.x < -50; i++) { NS.player.yaw = 0; NS.player.keys.add('KeyW'); NS.update(1/60); } NS.player.keys.clear(); step(5); return { z, pz: +pz.toFixed(2), inside, back: zone() }; })()`);
check('комната 0-7: портал внутрь и обратно', r.z === 'room07' && r.inside === 'room07' && r.back !== 'room07', JSON.stringify(r));

// Правило 9: «Отражение» за шторкой тоннеля
r = await page.eval(`(() => { NS.world.set('reflectionPortal', true); tp(0, 0, -33, 0); walk(0, -36.5); const z = zone(); walk(-60, 34); const inside = zone(); walk(-60, 39); walk(-60, 41.2); step(5); return { z, inside, back: zone(), pz: +NS.player.pos.z.toFixed(2) }; })()`);
check('«Отражение»: шторка тоннеля ведёт в зеркальный изолятор и обратно', r.z === 'reflection' && r.inside === 'reflection' && r.back === 'corridor', JSON.stringify(r));

// Правило 6: дверь-петля из жилого блока в техблок
r = await page.eval(`(() => { NS.world.set('loopDoor', true); NS.world.setDoor('d_loop', { locked: false, open: true }); NS.world.setDoor('d_loop_e', { locked: false, open: true }); NS.level.syncPlugs(); tp(-25, 0, -7.5, Math.PI); walk(-25, -4.8); walk(-25, -3.4); const after = { x: +NS.player.pos.x.toFixed(1), z: +NS.player.pos.z.toFixed(1) }; walk(25, -8); return { after, z: zone() }; })()`);
check('дверь-петля: из жилого блока сразу в техблок', r.z === 'east' && r.after.x > 20, JSON.stringify(r));

// бесконечная лестница → нужный пролёт → лаборатория
r = await page.eval(`(() => {
  const need = NS.level.secrets.landing;
  NS.world.setDoor('d_stairs', { open: true });
  tp(10.5, 0, -43, -Math.PI / 2); walk(14, -43);
  let guard = 0;
  while (NS.world.get('landing', 0) + 1 < need && guard++ < 20) { walk(25, -43); walk(29, -43); walk(31.5, -43); }
  walk(22.5, -43);
  const n = NS.world.get('landing', 0) + 1;
  const locked = NS.world.door('d_landing').locked;
  NS.world.setDoor('d_landing', { open: true }); step(30);
  walk(22.5, -45.8); walk(22.5, -47.2);
  return { need, n, locked, z: zone() };
})()`);
check('лестница: на пролёте −' + r.need + ' дверь открыта, за шторкой — лаборатория', r.n === r.need && !r.locked && r.z === 'lab', JSON.stringify(r));
r = await page.eval(`(() => { walk(97, 6.6); walk(97, 8.2); return { z: zone(), y: +NS.player.pos.y.toFixed(2) }; })()`);
check('из лаборатории — обратно на лестницу', r.z === 'stairsVest' || r.z === 'stairs', JSON.stringify(r));

// лифт: центральный пост ↔ −1
r = await page.eval(`(async () => { NS.world.set('power', true); NS.level.refreshLights(); tp(0, 0, -59.5, 0); NS.puzzles.callElevator('0'); step(120); walk(0, -62.3); const inCab = zone(); NS.puzzles.elevatorPanel(); await new Promise(r => setTimeout(r, 300)); const btn = [...document.querySelectorAll('.opt, button')].find(b => /−1|-1/.test(b.textContent)); if (btn) btn.click(); for (let i = 0; i < 40; i++) { step(30); await new Promise(r => setTimeout(r, 30)); } return { inCab, z: zone(), x: +NS.player.pos.x.toFixed(1) }; })()`, 60000);
check('лифт из центрального поста приезжает на −1', r.inCab === 'lift0' && r.x > 90, JSON.stringify(r));

const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l));
check('консоль без ошибок', errs.length === 0, errs.slice(0, 4).join(' | '));
await edge.close();
