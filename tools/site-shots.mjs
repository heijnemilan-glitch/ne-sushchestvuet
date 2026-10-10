// Скриншоты сайта в Edge: node tools/site-shots.mjs <папка> [query]
import { launchEdge } from './edge.mjs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const query = process.argv[3] || '';
const edge = await launchEdge({ width: 1440, height: 900 });
const page = await edge.open(`http://localhost:5050/${query}#/`);
await page.wait('document.body.classList.contains("ready")');
await new Promise((r) => setTimeout(r, 1500));
await page.shot(join(dir, 'site-home.png'));
await page.eval('window.scrollTo(0, document.getElementById("about").offsetTop - 64), true');
await new Promise((r) => setTimeout(r, 600));
await page.shot(join(dir, 'site-about.png'));
await page.eval('window.scrollTo(0, document.querySelector(".gallery-sec").offsetTop - 64), true');
await new Promise((r) => setTimeout(r, 900));
await page.shot(join(dir, 'site-gallery.png'));
await page.eval('window.scrollTo(0, document.getElementById("download").offsetTop - 80), true');
await new Promise((r) => setTimeout(r, 600));
await page.shot(join(dir, 'site-download.png'));
await page.goto(`http://localhost:5050/${query}#/moments`);
await new Promise((r) => setTimeout(r, 1500));
await page.shot(join(dir, 'site-moments.png'));
await page.resize(390, 844, true);
await page.goto(`http://localhost:5050/${query}#/`);
await new Promise((r) => setTimeout(r, 1500));
await page.shot(join(dir, 'site-mobile.png'));
console.log(page.logs.filter((l) => /error|exception|warn/i.test(l)).join('\n') || 'консоль чистая');
await edge.close();
