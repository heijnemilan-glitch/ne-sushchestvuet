// Интеграционный тест сайта в Edge против эмулятора Firebase (auth + firestore).
// Запуск: firebase emulators:start --only auth,firestore --project demo-ne-sushchestvuet
//         node tools/serve.mjs 5050
//         node tools/site-test.mjs [папка для скриншотов]
import { launchEdge } from './edge.mjs';
import { join } from 'node:path';

const shots = process.argv[2] || '.';
const BASE = 'http://localhost:5050/?emu';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
let printed = false;
process.on('exit', () => {
  if (!printed) console.log(results.join('\n'));
});

// очистка эмулятора перед тестом
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-ne-sushchestvuet/databases/(default)/documents', { method: 'DELETE' });
await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ne-sushchestvuet/accounts', { method: 'DELETE' });

const edge = await launchEdge({ width: 1440, height: 900 });
const page = await edge.open(`${BASE}#/moments`);
await page.wait('document.body.classList.contains("ready")');
check('сайт в режиме эмулятора', (await page.eval('window.__site.backend.mode')) === 'emulator');
await page.eval('import("/site/backend.js").then(m => { window.B = m; return true; })');

// картинка-«скриншот» для публикации
const MAKE_FILE = `(async () => {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0,0,1920,1080); gr.addColorStop(0,'#1a2a24'); gr.addColorStop(1,'#050606');
  g.fillStyle = gr; g.fillRect(0,0,1920,1080); g.fillStyle = '#9fe8c0'; g.font = '120px monospace'; g.fillText('СЕКТОР 0', 600, 560);
  for (let i=0;i<4000;i++){ g.fillStyle='rgba(255,255,255,'+Math.random()*0.2+')'; g.fillRect(Math.random()*1920, Math.random()*1080, 2, 2); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return new File([blob], 'shot.png', { type: 'image/png' });
})()`;

// ── пользователь A публикует момент через интерфейс ──
await page.eval('window.__testLogin("Алиса", "alice")');
await page.wait('!!window.__site.backend.user');
check('вход пользователя A', (await page.eval('window.__site.backend.user.name')) === 'Алиса');
const aliceUid = await page.eval('window.__site.backend.user.uid');
await page.eval('location.hash = "#/new", true');
await page.wait('!!document.querySelector("#compose")');
await page.eval(`(async () => { const f = await ${MAKE_FILE}; const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#file'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; })()`);
await page.wait('!document.querySelector("#publish").disabled', 15000);
await page.eval(`(() => { const t = document.querySelector('#text'); t.value = 'Дверь 0-7 открылась сама. Я её не трогал.'; t.dispatchEvent(new Event('input')); return true; })()`);
const code = await page.eval(`import('/src/systems/codes.js').then(m => m.makeCode('three_passes', 123456))`);
await page.eval(`(() => { const c = document.querySelector('#code'); c.value = ${JSON.stringify(code)}; c.dispatchEvent(new Event('input')); return true; })()`);
check('код открытия распознан в форме', (await page.eval('document.querySelector("#code-msg").textContent')).startsWith('✓'));
await page.shot(join(shots, 'site-compose.png'));
await page.eval('document.querySelector("#publish").click(), true');
await page.wait('location.hash.startsWith("#/post/")', 40000);
const postId = await page.eval('location.hash.split("/")[2]');
check('момент опубликован через форму', !!postId, postId);
await page.wait('!!document.querySelector(".post-side .post-actions")', 10000);
await sleep(800);
await page.shot(join(shots, 'site-post.png'));

// комментарий через интерфейс
await page.eval(`(() => { const ta = document.querySelector('#pv-form textarea'); ta.value = 'Проверка комментария'; document.querySelector('#pv-form').requestSubmit(); return true; })()`);
await page.wait('document.querySelectorAll("#pv-comments .comment").length === 1', 10000).catch(() => {});
check('комментарий добавлен', (await page.eval('document.querySelectorAll("#pv-comments .comment").length')) === 1);
const post1 = await page.eval(`B.getPost(${JSON.stringify(postId)}).then(p => ({ comments: p.comments, code: p.code, thumbKB: Math.round(p.thumb.length/1024) }))`);
check('счётчик комментариев = 1', post1.comments === 1);
check('код сохранён в посте', post1.code === code);
check('миниатюра сжата', post1.thumbKB < 245, `${post1.thumbKB} КБ`);
const fullKB = await page.eval(`B.getFullImage(${JSON.stringify(postId)}).then(d => Math.round(d.length/1024))`);
check('полная картинка < 1 МБ', fullKB < 980, `${fullKB} КБ`);

// лайк A
const like1 = await page.eval(`B.toggleLike(${JSON.stringify(postId)})`);
check('лайк ставится', like1.liked && like1.likes === 1);
const like2 = await page.eval(`B.toggleLike(${JSON.stringify(postId)})`);
check('лайк снимается', !like2.liked && like2.likes === 0);

// ── пользователь B пытается нарушить правила ──
await page.eval('window.__site.backend.user = null; import("/site/vendor/firebase/firebase-auth.js").then(a => a.signOut(a.getAuth()))');
await sleep(500);
await page.eval('window.__testLogin("Боб", "bob")');
await page.wait('window.__site.backend.user && window.__site.backend.user.name === "Боб"');
const bobUid = await page.eval('window.__site.backend.user.uid');
const deny = async (name, expr) => {
  const r = await page.eval(`(${expr}).then(() => 'allowed').catch(e => e.code || e.message)`);
  check(`ЗАПРЕЩЕНО: ${name}`, r === 'permission-denied', r);
};
const allow = async (name, expr) => {
  const r = await page.eval(`(${expr}).then(() => 'allowed').catch(e => e.code || e.message)`);
  check(`разрешено: ${name}`, r === 'allowed', r);
};
await page.eval('window.R = () => window.__rawFb || import("/site/backend.js").then(m => m.__raw())');
const P = JSON.stringify(postId);
await allow('B ставит лайк', `B.toggleLike(${P})`);
await deny('B удаляет чужой пост', `B.deletePost(${P})`);
await deny('B меняет чужую подпись', `B.updatePost(${P}, { text: 'взлом', spoiler: false })`);
await deny('B накручивает лайки', `R().then(({fb, db}) => fb.updateDoc(fb.doc(db,'posts',${P}), { likes: 99 }))`);
await deny('B ставит лайк от чужого имени', `R().then(({fb, db}) => fb.updateDoc(fb.doc(db,'posts',${P}), { likedBy: [${JSON.stringify(aliceUid)}, ${JSON.stringify(bobUid)}, 'x'], likes: 3 }))`);
await deny('B создаёт пост от имени A', `R().then(({fb, db}) => fb.setDoc(fb.doc(db,'posts','fake1'), { uid:${JSON.stringify(aliceUid)}, author:{name:'Алиса',photo:null}, text:'', code:null, codeId:null, spoiler:false, thumb:'data:image/jpeg;base64,AAAA', w:1, h:1, likes:0, likedBy:[], comments:0, createdAt: fb.serverTimestamp() }))`);
await deny('пост с накрученными лайками', `R().then(({fb, db}) => fb.setDoc(fb.doc(db,'posts','fake2'), { uid:'bob', author:{name:'Боб',photo:null}, text:'', code:null, codeId:null, spoiler:false, thumb:'data:image/jpeg;base64,AAAA', w:1, h:1, likes:50, likedBy:[], comments:0, createdAt: fb.serverTimestamp() }))`);
await deny('пост с не-картинкой', `R().then(({fb, db}) => fb.setDoc(fb.doc(db,'posts','fake3'), { uid:'bob', author:{name:'Боб',photo:null}, text:'', code:null, codeId:null, spoiler:false, thumb:'javascript:alert(1)', w:1, h:1, likes:0, likedBy:[], comments:0, createdAt: fb.serverTimestamp() }))`);
await deny('счётчик комментариев +5', `R().then(({fb, db}) => fb.updateDoc(fb.doc(db,'posts',${P}), { comments: 6 }))`);
await deny('B читает жалобы', `R().then(({fb, db}) => fb.getDocs(fb.collection(db,'reports')))`);
await deny('B делает себя админом', `R().then(({fb, db}) => fb.setDoc(fb.doc(db,'meta','admins'), { uids: ['bob'] }))`);
await allow('B комментирует', `B.addComment(${P}, 'привет от Боба')`);
await allow('B жалуется на пост', `B.reportPost(${P}, 'тест жалобы')`);
const bobComment = await page.eval(`B.listComments(${P}).then(l => (l.find(c => c.uid === ${JSON.stringify(bobUid)}) || {}).id || null)`);
check('комментарий B виден в списке', !!bobComment);
// ── A удаляет чужой комментарий под своим постом и сам пост ──
await page.eval('import("/site/vendor/firebase/firebase-auth.js").then(a => a.signOut(a.getAuth()))');
await sleep(400);
await page.eval('window.__testLogin("Алиса", "alice")');
await page.wait('window.__site.backend.user && window.__site.backend.user.name === "Алиса"');
await allow('A удаляет чужой комментарий под своим постом', `B.deleteComment(${P}, ${JSON.stringify(bobComment)})`);
const p2 = await page.eval(`B.getPost(${P}).then(p => ({ likes: p.likes, comments: p.comments }))`);
check('после всего: лайков 1 (от B), комментариев 1', p2.likes === 1 && p2.comments === 1, JSON.stringify(p2));

// лента и профиль в интерфейсе
const CARDS = 'document.querySelectorAll("#feed .card:not(.skel)").length';
await page.eval('location.hash = "#/moments", true');
await page.wait(`${CARDS} >= 1`, 10000).catch(() => {});
check('лента показывает момент', (await page.eval(CARDS)) >= 1);
await page.eval('location.hash = "#/moments/top", true');
await page.wait(`${CARDS} >= 1`, 10000).catch(() => {});
check('сортировка «Популярные» работает', (await page.eval(CARDS)) >= 1);
await page.eval(`location.hash = "#/user/${aliceUid}", true`);
await page.wait(`${CARDS} >= 1`, 10000).catch(() => {});
check('профиль показывает посты автора', (await page.eval(CARDS)) >= 1);
check('профиль: имя автора', (await page.eval('document.querySelector("#profile h1") && document.querySelector("#profile h1").textContent')) === 'Алиса');
await sleep(600);
await page.shot(join(shots, 'site-profile.png'));
await page.eval('location.hash = "#/moments", true');
await sleep(1200);
await page.shot(join(shots, 'site-feed.png'));
await allow('A удаляет свой пост', `B.deletePost(${P})`);
check('пост удалён', (await page.eval(`B.getPost(${P})`)) === null);

const errs = page.logs.filter((l) => /\[error\]|exception/i.test(l) && !/permission|PERMISSION_DENIED|Missing or insufficient/i.test(l));
check('консоль без неожиданных ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(results.join('\n'));
printed = true;
await edge.close();
