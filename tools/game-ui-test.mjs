// Проверка меню игры настоящими кликами в Edge: node tools/game-ui-test.mjs [url]
import { launchEdge } from './edge.mjs';

const url = process.argv[2] || 'http://localhost:5050/PLAY.html';
const edge = await launchEdge({ width: 1280, height: 720 });
const page = await edge.open(url);
const results = [];
const check = (name, ok) => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}`);

// клик по видимому элементу в его центре — как мышью
async function click(selectorOrText) {
  const pos = await page.eval(`(() => {
    const q = ${JSON.stringify(selectorOrText)};
    let el = document.querySelector(q.startsWith('text=') ? '#__none' : q);
    if (!el && q.startsWith('text=')) el = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim().startsWith(q.slice(5)));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, covered: !(top === el || el.contains(top)), topId: top && (top.id || top.className) };
  })()`);
  if (!pos) throw new Error('Не найден элемент ' + selectorOrText);
  if (pos.covered) results.push(`WARN ${selectorOrText} перекрыт элементом ${pos.topId}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 400));
}

await page.wait('!!(window.NS && NS.ui)');
await page.eval('localStorage.clear(), true');
await click('text=Новая игра');
check('после «Новая игра» видно окно выбора слота', await page.eval(`!!document.querySelector('#modal:not(.hidden) [data-slot="1"]')`));
await click('[data-slot="1"]');
await page.wait('NS.state === "playing"', 15000).catch(() => {});
check('игра запустилась (state=playing)', await page.eval('NS.state === "playing"'));
check('меню скрыто', await page.eval(`document.getElementById('menu').classList.contains('hidden')`));
check('зона = комната пробуждения', await page.eval(`NS.currentZone && NS.currentZone.id === 'start'`));
await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape' });
await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape' });
await new Promise((r) => setTimeout(r, 300));
check('Esc → пауза', await page.eval(`NS.ui.modal === 'pause'`));
await click('text=Продолжить');
check('Продолжить закрывает паузу', await page.eval('NS.ui.modal === null'));
await page.shot(process.env.SHOT || 'game-ui.png');
const errs = page.logs.filter((l) => /error|exception/i.test(l));
check('консоль без ошибок', errs.length === 0);
console.log(results.join('\n'));
if (errs.length) console.log(errs.join('\n'));
await edge.close();
