// Настоящие скриншоты из игры для сайта (через Edge): node tools/shots.mjs
import { launchEdge } from './edge.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site', 'img');
mkdirSync(out, { recursive: true });

const VIEWS = [
  { name: 'hero', p: [0, 0, -5, 0, -0.02], setup: 'NS.flashlightOn = true;' },
  { name: 'observation', p: [-9.5, 0, -27, 1.57, 0.08] },
  { name: 'room07', p: [-65.5, 0, -15, 1.45, -0.05] },
  { name: 'stairs', p: [10, -0.5, -27, -1.57, -0.32] },
  { name: 'core', p: [78, 0, 0, 1.57, 0.12] },
  { name: 'void', p: [0, 0, 101.5, 3.14, 0.02] },
  { name: 'archive', p: [-15.2, 0, -8.6, 1.25, -0.05], setup: "NS.world.set('power', true);" },
  { name: 'lab', p: [100, 0, -4.5, 3.14, 0.02] },
  { name: 'start', p: [-1.6, 0, 6.3, -2.6, -0.12] },
];

const edge = await launchEdge({ width: 1600, height: 900 });
const page = await edge.open('http://localhost:5050/PLAY.html');
await page.wait('!!(window.NS && NS.ui)');
await page.eval(`(() => {
  localStorage.clear();
  NS.settings.quality = 'high';
  NS.newGame('1');
  NS.level.pickups.flashlight.interact();
  document.getElementById('hud').style.display = 'none';
  document.getElementById('lockhint').style.display = 'none';
  window.tp = (x,y,z,yaw,pitch) => { NS.player.setPose({x,y,z,yaw,pitch}); NS.player.applyCamera(0.016); NS.updateZone(false); NS.level.cull(NS.player.pos); NS.lightPool.assign(NS.player.pos); for (let i=0;i<60;i++) NS.update(1/60); };
  return true;
})()`);
for (const v of VIEWS) {
  const data = await page.eval(`(() => { ${v.setup || 'NS.flashlightOn = false;'} tp(${v.p.join(',')}); NS.ui.distort(0); NS.renderer.render(NS.scene, NS.camera); return NS.renderer.domElement.toDataURL('image/jpeg', 0.86); })()`);
  writeFileSync(join(out, `${v.name}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  console.log('✓', v.name);
}
console.log(page.logs.filter((l) => l.includes('error') || l.includes('exception')).join('\n') || 'консоль чистая');
await edge.close();
