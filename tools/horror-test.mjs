// Проверка хоррор-систем в Edge: меню, монстр (путь, погоня, двери), шкафчик, поимка, возрождение.
// node tools/horror-test.mjs [папка для скриншотов]
import { launchEdge } from './edge.mjs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
process.on('exit', () => console.log(results.join('\n')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = await launchEdge({ width: 1280, height: 720 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!(window.NS && NS.ui)');
await page.eval('localStorage.clear(), true');
await page.wait('!!(NS.scene && NS.menuCam)', 30000).catch(() => {});
check('меню: живой 3D-фон', await page.eval('!!(NS.scene && NS.menuCam)'));
await sleep(2500);
await page.shot(join(dir, 'h-menu.png'));

await page.eval('NS.newGame("1"), true');
await page.wait('NS.state === "playing" && !NS.paused', 30000).catch(() => {});
check('новая игра после вступления', await page.eval('NS.state === "playing"'));
await page.eval(`(() => {
  document.getElementById('lockhint').style.display = 'none';
  window.step = (n) => { for (let i = 0; i < n; i++) NS.update(1/60); };
  window.tp = (x,z,yaw,pitch=0) => { NS.player.setPose({x,y:0,z,yaw,pitch}); NS.player.applyCamera(0.016); NS.updateZone(false); NS.level.cull(NS.player.pos); NS.lightPool.assign(NS.player.pos); };
  NS.level.pickups.flashlight.interact();
  return true; })()`);
const grid = await page.eval('(() => { const g = NS.monster.grid; let p = 0; for (const v of g.cells) if (v) p++; return { w: g.w, h: g.h, passable: p }; })()');
check('сетка проходимости построена', grid.passable > 1500, JSON.stringify(grid));
const pathInfo = await page.eval(`(() => { const t0 = performance.now(); const p = NS.monster.grid.path({x:22.5,z:-11}, {x:-17,z:-6}); return { ok: !!p && p.length > 0, n: p ? p.length : 0, ms: Math.round(performance.now() - t0) }; })()`);
check('путь монстра: щитовая → архив через двери', pathInfo.ok, JSON.stringify(pathInfo));
check('путь в безопасную комнату невозможен', await page.eval('!NS.monster.grid.path({x:0,z:-5}, {x:0,z:4})'));

// будим монстра и ставим его в коридор, игрок с фонарём в 9 м
await page.eval(`(() => { NS.monster.wake(true); NS.monster.pos.set(0, 0, -16); NS.monster.yaw = 0; NS.monster.state = 'patrol'; NS.monster.target = null;
  tp(0, -7, Math.PI, -0.02); NS.flashlightOn = true; step(30); return NS.monster.state; })()`);
const st = await page.eval('NS.monster.state');
check('монстр видит игрока с фонарём и начинает погоню', st === 'chase', st);
await page.eval('step(40), true');
const d1 = await page.eval('Math.hypot(NS.monster.pos.x - NS.player.pos.x, NS.monster.pos.z - NS.player.pos.z)');
check('монстр приближается', d1 < 8.5, d1.toFixed(2));
await page.eval('NS.renderer.render(NS.scene, NS.camera), true');
await sleep(300);
await page.shot(join(dir, 'h-chase.png'));
check('страх растёт (пост-эффект)', (await page.eval('NS.fear')) > 0.3, String(await page.eval('NS.fear.toFixed(2)')));

// шкафчик: прячемся вне поля зрения — монстр теряет след
await page.eval(`(() => { NS.monster.pos.set(12.5, 0, -8); NS.monster.state = 'patrol'; NS.monster.target = null; NS.monster.cool = 0;
  NS.flashlightOn = false; tp(-0.5, -4, -Math.PI/2); const l = NS.level.horror.lockers[0]; NS.toggleHide(l); step(5); return true; })()`);
check('игрок в шкафчике', await page.eval('!!NS.player.hiddenIn'));
await sleep(200);
await page.shot(join(dir, 'h-locker.png'));
await page.eval('NS.monster.pos.set(0, 0, -6); NS.monster.yaw = Math.PI; step(60); true');
check('в шкафчике монстр не видит', await page.eval('NS.monster.state !== "chase"'), await page.eval('NS.monster.state'));
await page.eval('NS.toggleHide(NS.player.hiddenIn), true');
check('выход из шкафчика', await page.eval('!NS.player.hiddenIn'));

// поимка → возрождение в комнате пробуждения
await page.eval(`(() => { NS.monster.cool = 0; NS.monster.pos.set(0, 0, -9); NS.monster.state = 'chase'; NS.monster.lastSeen = NS.player.pos.clone(); NS.monster.seenAt = NS.monster.time; tp(0, -8.2, Math.PI); NS.flashlightOn = true; step(20); return NS.state; })()`);
check('поимка срабатывает', (await page.eval('NS.state')) === 'caught', await page.eval('NS.state'));
await sleep(500);
await page.shot(join(dir, 'h-caught.png'));
await page.wait('NS.state === "playing"', 20000).catch(() => {});
check('возрождение в комнате пробуждения', await page.eval('NS.state === "playing" && NS.currentZone.id === "start"'));
check('смерть записана в память', (await page.eval('NS.mem.get("deaths")')) === 1);

// виды для сайта/проверки
const views = [
  ['h-monster', 'tp(0,-6,0,0.06); NS.flashlightOn = true; NS.monster.pos.set(0,0,-11); NS.monster.yaw = 0; NS.monster.state = "search"; NS.monster.timer = 0; NS.monster.target = NS.monster.pos.clone(); NS.monster.cool = 99;'],
  ['h-monster-dark', 'tp(-2,-8,-1.2,0.05); NS.flashlightOn = false; NS.monster.pos.set(-9,0,-8); NS.monster.yaw = -1.57; NS.monster.cool = 99;'],
  ['h-corridor', 'tp(0,-3,0,-0.03); NS.flashlightOn = true; NS.monster.pos.set(0,0,-15); NS.monster.yaw = 0; NS.monster.state = "search"; NS.monster.timer = 0; NS.monster.target = null;'],
  ['h-east', 'tp(3,-8,-Math.PI/2,-0.05); NS.flashlightOn = true; NS.monster.pos.set(30,0,30);'],
  ['h-hall', 'tp(0,-23,0,0.05); NS.flashlightOn = false;'],
  ['h-west', 'tp(-3,-8,Math.PI/2,-0.08); NS.flashlightOn = true;'],
];
for (const [name, code] of views) {
  await page.eval(`(() => { ${code} step(30); NS.renderer.render(NS.scene, NS.camera); return true; })()`);
  await sleep(250);
  await page.shot(join(dir, `${name}.png`));
}
const fps = await page.eval(`(() => { const t0 = performance.now(); for (let i = 0; i < 60; i++) { NS.update(1/60); NS.post.draw(NS.time); } NS.renderer.getContext().finish(); return Math.round((performance.now() - t0) / 60 * 10) / 10; })()`);
check('время кадра с постобработкой (программный рендер, без видеокарты)', true, `${fps} мс`);
const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l));
check('консоль без ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
await edge.close();
