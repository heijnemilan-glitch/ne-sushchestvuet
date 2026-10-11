// Коллаж кадров новой карты (через Edge): node tools/map-shots.mjs <out.png>
import { launchEdge } from './edge.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const out = process.argv[2] || 'map.png';
const edge = await launchEdge({ width: 1280, height: 720 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!(window.NS && NS.ui)');
await page.wait('!!NS.scene', 30000);
await page.eval(`(async () => {
  localStorage.clear(); NS.newGame('1');
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('cine').classList.add('hidden'); NS.ui.el.fade.style.opacity = '0';
  NS.level.pickups.flashlight.interact();
  window.tp = (x,y,z,yaw,pitch) => { NS.player.setPose({x,y,z,yaw,pitch}); NS.player.applyCamera(0.016); NS.updateZone(false); NS.level.cull(NS.player.pos); NS.lightPool.assign(NS.player.pos); for (let i=0;i<40;i++) NS.update(1/60); };
  return true; })()`);
const arg = process.argv[3];
const views = (arg ? JSON.parse(arg.endsWith('.json') ? readFileSync(arg, 'utf8') : arg) : null) || [
  ['spawn', [0.9, 0, 4.4, 0.35, -0.05], ''],
  ['corridor', [0, 0, -3, 0, 0], 'NS.flashlightOn=true;'],
  ['atrium', [0, 0, -25.5, 0, 0.12], ''],
  ['balcony', [10.5, 4.5, -44, 0.9, -0.25], ''],
  ['boiler', [17.5, 0, -10, -1.57, 0.15], ''],
  ['vent', [-20, 0.6, -18, 0, 0.1], 'NS.world.set("g_v2a", true); NS.level.syncGrates();'],
  ['sewer', [23, -8, -20.5, -1.9, -0.05], ''],
  ['canal', [33, -8, -17.2, -1.57, -0.02], 'NS.flashlightOn=true;'],
  ['pump', [94.5, -8, -15, -1.57, 0.05], ''],
];
const data = await page.eval(`(() => {
  const views = ${JSON.stringify(views)};
  const W = 426, H = 240, cols = 3;
  const c = document.createElement('canvas'); c.width = W * cols; c.height = H * Math.ceil(views.length / cols);
  const ctx = c.getContext('2d');
  views.forEach(([n, p, setup], i) => {
    NS.flashlightOn = false; if (NS.monster) NS.monster.pos.set(60,0,60);
    eval(setup); tp(...p); NS.post.draw(NS.time);
    ctx.drawImage(NS.renderer.domElement, (i % cols) * W, Math.floor(i / cols) * H, W, H);
    ctx.fillStyle = '#ff0'; ctx.font = '14px monospace'; ctx.fillText(n + ' [' + (NS.currentZone && NS.currentZone.id) + '] ' + NS.state + (NS.renderer.getContext().isContextLost() ? ' LOST' : ''), (i % cols) * W + 6, Math.floor(i / cols) * H + 16);
  });
  return c.toDataURL('image/png');
})()`);
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l));
console.log(errs.length ? errs.slice(0, 5).join('\n') : 'консоль чистая');
await edge.close();
