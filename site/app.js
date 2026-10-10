// Сайт «НЕ СУЩЕСТВУЕТ»: главная, моменты игроков, профили, публикация.
import { backend, initBackend, signIn, signOut, listPosts, getPost, getFullImage, createPost, deletePost, updatePost, toggleLike, listComments, addComment, deleteComment, reportPost, getUser } from './backend.js';
import { parseCode } from '../src/systems/codes.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const GAME_SIZE = '0,8 МБ';
const ICON = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V8m0 0-4.5 4.5M12 8l4.5 4.5M5 5h14"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 0h11l-2 4 2 4H6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  google:
    '<svg viewBox="0 0 48 48" aria-hidden="true" class="g"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

const GALLERY = [
  ['void', 'Этаж Ø. Его нет на схеме. Кто-то всё равно ждёт.'],
  ['room07', 'Комната 0-7. Внутри она больше, чем всё крыло снаружи.'],
  ['core', 'Ядро. МНЕМА помнит каждого, кто сюда дошёл.'],
  ['stairs', 'Лестница. Таблички этажей меняются. Лестница — нет.'],
  ['observation', 'Наблюдательная. За стеклом — комната, в которую не ведёт ни один коридор.'],
  ['archive', 'Архив. Код от шкафа — там, где всё остановилось.'],
];

// ── мелкие утилиты ──────────────────────────────────────────────────────────
function ago(date) {
  const s = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} дн назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d > 300 ? 'numeric' : undefined });
}

function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

function avatar(author, size = 28) {
  const name = (author && author.name) || '?';
  if (author && author.photo) return `<img class="ava" src="${esc(author.photo)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" loading="lazy">`;
  return `<span class="ava ava-letter" style="width:${size}px;height:${size}px">${esc(name.trim()[0] || '?')}</span>`;
}

export function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4400);
}

function errText(err) {
  const code = err && err.code;
  if (code === 'permission-denied') return 'Нет прав на это действие.';
  if (code === 'unavailable') return 'Нет связи с сервером. Проверьте интернет.';
  return (err && err.message) || 'Что-то пошло не так.';
}

// Сжатие картинки в браузере: картинки хранятся прямо в базе, поэтому их размер ограничен.
async function compress(file, maxSide, limit, startQ) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  let q = startQ;
  for (let i = 0; i < 12; i++) {
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length < limit) return { url, w: c.width, h: c.height };
    if (q > 0.55) q -= 0.08;
    else scale *= 0.85;
  }
  throw new Error('Картинка слишком большая, даже после сжатия.');
}

// ── модальные окна ──────────────────────────────────────────────────────────
let modalClose = null;

function openModal(html, { wide = false, onClose } = {}) {
  closeModal(true);
  const m = $('#modal');
  m.innerHTML = `<div class="modal-back" data-close></div><div class="modal-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="icon-btn modal-x" data-close aria-label="Закрыть">${ICON.close}</button>${html}</div>`;
  m.hidden = false;
  document.body.classList.add('noscroll');
  modalClose = onClose || null;
  $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => closeModal()));
  return $('.modal-box', m);
}

function closeModal(silent = false) {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  m.innerHTML = '';
  document.body.classList.remove('noscroll');
  const f = modalClose;
  modalClose = null;
  if (f && !silent) f();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function requireLogin(reason) {
  if (!backend.ready) {
    openModal(`<div class="pad"><h3>Почти готово</h3><p class="muted">Вход через Google и публикация моментов заработают, как только к сайту подключат базу данных. Игра уже доступна — играйте и делайте снимки клавишей <kbd>P</kbd>.</p><div class="row-end"><button class="btn" data-close>Понятно</button></div></div>`);
    return false;
  }
  if (backend.user) return true;
  const box = openModal(`<div class="pad center"><h3>Нужно войти</h3><p class="muted">${esc(reason || 'Чтобы публиковать моменты, ставить лайки и писать комментарии.')}</p><button class="btn btn-google" id="m-login">${ICON.google}Войти через Google</button></div>`);
  $('#m-login', box).addEventListener('click', async () => {
    try {
      await signIn();
      closeModal();
    } catch (err) {
      toast(errText(err), 'bad');
    }
  });
  return false;
}

// ── шапка ───────────────────────────────────────────────────────────────────
function renderAuth() {
  const el = $('#auth');
  const u = backend.user;
  if (!backend.ready) {
    el.innerHTML = `<button class="btn btn-ghost btn-sm" id="login">${ICON.google}<span>Войти</span></button>`;
  } else if (!u) {
    el.innerHTML = `<button class="btn btn-ghost btn-sm" id="login">${ICON.google}<span>Войти через Google</span></button>`;
  } else {
    el.innerHTML = `<div class="user-menu"><button class="user-btn" id="user-btn" aria-haspopup="true">${avatar(u, 30)}<span class="user-name">${esc(u.name)}</span></button>
      <div class="dropdown" id="dropdown" hidden><a href="#/user/${esc(u.uid)}">Мой профиль</a><a href="#/new">Поделиться моментом</a><button id="logout">Выйти</button></div></div>`;
    $('#user-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#dropdown').hidden = !$('#dropdown').hidden;
    });
    $('#logout').addEventListener('click', async () => {
      await signOut();
      toast('Вы вышли.');
    });
  }
  const login = $('#login');
  if (login)
    login.addEventListener('click', async () => {
      if (!backend.ready) return requireLogin();
      try {
        await signIn();
      } catch (err) {
        toast(errText(err), 'bad');
      }
    });
}
document.addEventListener('click', () => {
  const d = $('#dropdown');
  if (d) d.hidden = true;
});

// ── главная ─────────────────────────────────────────────────────────────────
function viewHome() {
  const app = $('#app');
  app.innerHTML = `
  <section class="hero">
    <div class="hero-bg" style="background-image:url('site/img/hero.jpg')"></div>
    <div class="hero-in wrap">
      <p class="eyebrow">Сектор 0 · психологическая головоломка</p>
      <h1 class="title">НЕ<br>СУЩЕСТВУЕТ</h1>
      <p class="lead">Заброшенный комплекс запоминает всё, что вы делаете, — и тихо перестраивается в ответ. Никто не объяснит правила. Их придётся найти самому.</p>
      <div class="cta">
        <a class="btn btn-primary btn-lg" href="play/">${ICON.play}Играть в браузере</a>
        <a class="btn btn-lg" href="download/ne-sushchestvuet.html" download="НЕ СУЩЕСТВУЕТ.html">${ICON.download}Скачать игру <span class="dim">${GAME_SIZE}</span></a>
      </div>
      <p class="meta mono">бесплатно · без установки · работает без интернета · для компьютера</p>
    </div>
    <a class="scroll-hint" href="#about" data-scroll="about" aria-label="Листать вниз">↓</a>
  </section>

  <section class="wrap section" id="about">
    <div class="split">
      <div>
        <p class="eyebrow">Что это</p>
        <h2>Здание, которое помнит</h2>
      </div>
      <p class="big">Вы просыпаетесь в комнате без окон. Терминал желает доброго утра. Дальше — коридоры, архив, щитовая, лестница без конца. Чем дольше вы здесь, тем лучше комплекс вас знает: какие двери вы обходите, куда сворачиваете, что оставляете за спиной.</p>
    </div>
    <div class="features">
      <article class="feature"><span class="num mono">01</span><h3>Мир запоминает</h3><p>Игра ведёт память ваших действий — маршруты, возвращения, брошенные предметы — и меняет по ним комнаты, двери и события.</p></article>
      <article class="feature"><span class="num mono">02</span><h3>Скрытые правила</h3><p>Одиннадцать законов, по которым живёт комплекс. Ни один не объяснён. Журнал записывает только то, что вы заметили.</p></article>
      <article class="feature"><span class="num mono">03</span><h3>Невозможная архитектура</h3><p>Комната больше здания. Лифт приезжает на несуществующий этаж. Коридор однажды приводит туда, откуда вы вышли, — но наоборот.</p></article>
      <article class="feature"><span class="num mono">04</span><h3>Четыре исхода</h3><p>Финал зависит от того, что вы нашли и кому поверили. Один из них видели очень немногие.</p></article>
    </div>
  </section>

  <section class="section gallery-sec">
    <div class="wrap"><p class="eyebrow">Кадры из игры</p><h2>Сектор 0</h2></div>
    <div class="gallery wrap">
      ${GALLERY.map(([f, cap], i) => `<button class="shot" data-shot="${i}"><img src="site/img/${f}.jpg" alt="${esc(cap)}" loading="lazy"><span class="cap">${esc(cap)}</span></button>`).join('')}
    </div>
  </section>

  <section class="wrap section">
    <p class="eyebrow">Кто ещё здесь</p>
    <h2>Вы не один. Наверное.</h2>
    <div class="cast">
      <article class="who"><span class="mono tag">наблюдатель</span><h3>Стоит в конце коридора</h3><p>Не нападает. Исчезает, если посмотреть прямо. После каждой встречи в комнатах, где вы уже были, что-то сдвигается. И он всегда смотрит в одну сторону.</p></article>
      <article class="who"><span class="mono tag term">оператор</span><h3>Говорит через терминалы</h3><p>Помогает. Иногда врёт. Его советы стоит проверять — и он запоминает, слушаетесь ли вы.</p></article>
      <article class="who"><span class="mono tag">копия</span><h3>Повторяет вас</h3><p>Идёт вашим путём с опозданием на десять секунд и нажимает то, что нажимали вы. Иногда это единственный способ пройти дальше.</p></article>
    </div>
  </section>

  <section class="section moments-preview">
    <div class="wrap">
      <div class="sec-head"><div><p class="eyebrow">Сообщество</p><h2>Моменты игроков</h2></div><a class="btn" href="#/moments">Все моменты →</a></div>
      <div id="home-moments" class="grid"></div>
    </div>
  </section>

  <section class="wrap section" id="download">
    <div class="split">
      <div><p class="eyebrow">Как играть</p><h2>Две минуты до первой двери</h2></div>
      <div>
        <ol class="steps">
          <li><b>В браузере.</b> Нажмите «Играть в браузере» — игра откроется прямо на сайте.</li>
          <li><b>Или скачайте.</b> Файл весит ${GAME_SIZE}. Дважды щёлкните по нему — игра откроется в браузере и будет работать без интернета.</li>
          <li><b>Начните.</b> «Новая игра» → выберите слот → щёлкните по экрану, чтобы мышь управляла взглядом.</li>
        </ol>
        <div class="keys">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ходить</span>
          <span><kbd>E</kbd> действие</span>
          <span><kbd>F</kbd> фонарь</span>
          <span><kbd>Tab</kbd> инвентарь</span>
          <span><kbd>J</kbd> журнал</span>
          <span><kbd>P</kbd> снимок</span>
          <span><kbd>Esc</kbd> пауза</span>
        </div>
        <div class="cta"><a class="btn btn-primary" href="play/">${ICON.play}Играть</a><a class="btn" href="download/ne-sushchestvuet.html" download="НЕ СУЩЕСТВУЕТ.html">${ICON.download}Скачать</a></div>
      </div>
    </div>
    <div class="faq">
      <details><summary>Нужен ли мощный компьютер?</summary><p>Нет. Подойдёт обычный ноутбук. В настройках игры можно снизить качество графики и разрешение.</p></details>
      <details><summary>Где хранятся сохранения?</summary><p>В вашем браузере. Их можно выгрузить в файл и загрузить на другом компьютере: «Пауза → Сохранить → В файл».</p></details>
      <details><summary>Можно на телефоне?</summary><p>Пока нет — нужны клавиатура и мышь. А вот смотреть и комментировать моменты с телефона можно.</p></details>
      <details><summary>Что такое коды открытий?</summary><p>За каждое найденное правило игра выдаёт код вида NS-XXXX-XXXX. Прикрепите его к моменту — другие увидят, что вы нашли, но не узнают как.</p></details>
    </div>
  </section>`;

  $$('[data-shot]', app).forEach((b) => b.addEventListener('click', () => lightbox(+b.dataset.shot)));
  $$('[data-scroll]', app).forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.scroll).scrollIntoView({ behavior: 'smooth' });
    })
  );
  loadHomeMoments();
}

async function loadHomeMoments() {
  const box = $('#home-moments');
  if (!box) return;
  if (!backend.ready) {
    box.innerHTML = emptyMoments(true);
    return;
  }
  box.innerHTML = skeletons(4);
  try {
    const { posts } = await listPosts({ sort: 'new' });
    box.innerHTML = posts.length ? posts.slice(0, 8).map(card).join('') : emptyMoments(false);
    bindCards(box);
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(errText(err))}</p>`;
  }
}

function lightbox(i) {
  const show = (k) => {
    i = (k + GALLERY.length) % GALLERY.length;
    const [f, cap] = GALLERY[i];
    box.querySelector('img').src = `site/img/${f}.jpg`;
    box.querySelector('.lb-cap').textContent = cap;
  };
  const box = openModal(`<div class="lightbox"><img alt=""><div class="lb-bar"><button class="icon-btn" data-d="-1" aria-label="Назад">←</button><p class="lb-cap"></p><button class="icon-btn" data-d="1" aria-label="Вперёд">→</button></div></div>`, { wide: true });
  box.classList.add('dark');
  $$('[data-d]', box).forEach((b) => b.addEventListener('click', () => show(i + +b.dataset.d)));
  show(i);
}

// ── карточки моментов ───────────────────────────────────────────────────────
function emptyMoments(off) {
  return `<div class="empty"><div class="empty-mark mono">Ø</div><h3>${off ? 'Скоро здесь будут моменты игроков' : 'Пока пусто'}</h3><p class="muted">${
    off ? 'Мы подключаем базу данных. А пока — играйте и сохраняйте кадры клавишей <kbd>P</kbd>: они пригодятся.' : 'Станьте первым, кто поделится кадром из комплекса.'
  }</p>${off ? '' : '<a class="btn btn-primary" href="#/new">' + ICON.upload + 'Поделиться моментом</a>'}</div>`;
}

function skeletons(n) {
  return Array.from({ length: n }, () => '<div class="card skel"><div class="skel-img"></div><div class="skel-line"></div><div class="skel-line short"></div></div>').join('');
}

function codeChip(code) {
  if (!code) return '';
  const r = parseCode(code);
  return `<span class="chip mono" title="${esc(r.ok ? r.hint : '')}">◆ ${esc(code)}</span>`;
}

function card(p) {
  const ratio = p.w && p.h ? Math.max(0.5, Math.min(1.8, p.h / p.w)) : 0.5625;
  return `<article class="card" data-id="${esc(p.id)}">
    <a class="card-img ${p.spoiler ? 'spoiler' : ''}" href="#/post/${esc(p.id)}" style="aspect-ratio:${1 / ratio}">
      <img src="${p.thumb}" alt="" loading="lazy">
      ${p.spoiler ? '<span class="spoiler-tag">Спойлер — нажмите, чтобы открыть</span>' : ''}
    </a>
    <div class="card-body">
      ${p.text ? `<p class="card-text">${esc(p.text)}</p>` : ''}
      ${codeChip(p.code)}
      <div class="card-meta">
        <a class="author" href="#/user/${esc(p.uid)}">${avatar(p.author, 24)}<span>${esc(p.author.name)}</span></a>
        <span class="muted small">${ago(p.createdAt)}</span>
      </div>
      <div class="card-actions">
        <button class="act like ${p.liked ? 'on' : ''}" data-like="${esc(p.id)}" aria-label="Нравится">${ICON.heart}<span>${p.likes}</span></button>
        <a class="act" href="#/post/${esc(p.id)}" aria-label="Комментарии">${ICON.comment}<span>${p.comments}</span></a>
      </div>
    </div>
  </article>`;
}

function bindCards(root) {
  $$('[data-like]', root).forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!requireLogin('Чтобы ставить лайки.')) return;
      b.disabled = true;
      try {
        const r = await toggleLike(b.dataset.like);
        b.classList.toggle('on', r.liked);
        b.querySelector('span').textContent = r.likes;
      } catch (err) {
        toast(errText(err), 'bad');
      }
      b.disabled = false;
    })
  );
}

// ── лента ───────────────────────────────────────────────────────────────────
async function viewMoments(sort = 'new') {
  const app = $('#app');
  app.innerHTML = `<section class="wrap page">
    <div class="sec-head">
      <div><p class="eyebrow">Сообщество</p><h1 class="h1">Моменты</h1><p class="muted">Кадры, находки и странности из Сектора 0. Спойлеры скрыты, пока вы их не откроете.</p></div>
      <a class="btn btn-primary" href="#/new">${ICON.upload}Поделиться моментом</a>
    </div>
    ${backend.ready ? `<div class="tabs"><a class="tab ${sort === 'new' ? 'on' : ''}" href="#/moments">Новые</a><a class="tab ${sort === 'top' ? 'on' : ''}" href="#/moments/top">Популярные</a></div>` : ''}
    <div class="grid" id="feed"></div>
    <div class="center"><button class="btn" id="more" hidden>Показать ещё</button></div>
  </section>`;
  const feed = $('#feed');
  if (!backend.ready) {
    feed.innerHTML = emptyMoments(true);
    return;
  }
  let cursor = null;
  const load = async () => {
    const more = $('#more');
    more.disabled = true;
    try {
      const r = await listPosts({ sort, cursor });
      if (!cursor) feed.innerHTML = '';
      cursor = r.cursor;
      const tmp = document.createElement('div');
      tmp.innerHTML = r.posts.map(card).join('');
      bindCards(tmp);
      feed.append(...tmp.children);
      if (!feed.children.length) feed.innerHTML = emptyMoments(false);
      more.hidden = r.done;
    } catch (err) {
      feed.innerHTML = `<p class="muted">${esc(errText(err))}</p>`;
    }
    more.disabled = false;
  };
  feed.innerHTML = skeletons(6);
  $('#more').addEventListener('click', load);
  await load();
}

// ── профиль ─────────────────────────────────────────────────────────────────
async function viewUser(uid) {
  const app = $('#app');
  app.innerHTML = `<section class="wrap page"><div id="profile" class="profile"></div><div class="grid" id="feed">${backend.ready ? skeletons(3) : ''}</div></section>`;
  if (!backend.ready) {
    $('#feed').innerHTML = emptyMoments(true);
    return;
  }
  try {
    const [user, list] = await Promise.all([getUser(uid), listPosts({ uid })]);
    const posts = list.posts;
    const likes = posts.reduce((a, p) => a + p.likes, 0);
    const me = backend.user && backend.user.uid === uid;
    const name = (user && user.name) || (posts[0] && posts[0].author.name) || 'Игрок';
    $('#profile').innerHTML = `${avatar({ name, photo: user && user.photo }, 84)}<div><h1 class="h1">${esc(name)}</h1>
      <p class="muted">${posts.length} ${plural(posts.length, 'момент', 'момента', 'моментов')}${list.done ? '' : '+'} · ${likes} ${plural(likes, 'лайк', 'лайка', 'лайков')}${user && user.joinedAt ? ' · с ' + user.joinedAt.toDate().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''}</p>
      ${me ? `<a class="btn btn-primary btn-sm" href="#/new">${ICON.upload}Новый момент</a>` : ''}</div>`;
    const feed = $('#feed');
    feed.innerHTML = posts.length ? posts.map(card).join('') : `<div class="empty"><h3>${me ? 'У вас пока нет моментов' : 'Здесь пока пусто'}</h3></div>`;
    bindCards(feed);
  } catch (err) {
    $('#feed').innerHTML = `<p class="muted">${esc(errText(err))}</p>`;
  }
}

// ── просмотр момента ────────────────────────────────────────────────────────
async function openPost(id, back) {
  if (!backend.ready) return;
  const box = openModal('<div class="post-view"><div class="post-img"><div class="spin"></div></div><aside class="post-side"><div class="spin"></div></aside></div>', { wide: true, onClose: () => (location.hash = back || '#/moments') });
  let p;
  try {
    p = await getPost(id);
  } catch (err) {
    box.innerHTML = `<div class="pad"><p>${esc(errText(err))}</p></div>`;
    return;
  }
  if (!p) {
    box.querySelector('.post-view').innerHTML = '<div class="pad"><h3>Момент не найден</h3><p class="muted">Возможно, автор его удалил. Или его никогда не существовало.</p></div>';
    return;
  }
  const me = backend.user;
  const canEdit = me && me.uid === p.uid;
  const canDelete = me && (me.uid === p.uid || backend.isAdmin);
  const code = p.code ? parseCode(p.code) : null;
  box.querySelector('.post-img').innerHTML = `<img src="${p.thumb}" alt="" class="${p.spoiler ? 'blur' : ''}">${p.spoiler ? '<button class="btn spoiler-open">Показать спойлер</button>' : ''}`;
  const img = box.querySelector('.post-img img');
  getFullImage(id).then((full) => full && (img.src = full)).catch(() => {});
  const sb = box.querySelector('.spoiler-open');
  if (sb)
    sb.addEventListener('click', () => {
      img.classList.remove('blur');
      sb.remove();
    });
  box.querySelector('.post-side').innerHTML = `
    <div class="post-head"><a class="author" href="#/user/${esc(p.uid)}">${avatar(p.author, 36)}<span><b>${esc(p.author.name)}</b><br><span class="muted small">${ago(p.createdAt)}</span></span></a></div>
    <div class="post-text">${p.text ? esc(p.text) : '<span class="muted">Без подписи.</span>'}</div>
    ${code && code.ok ? `<div class="code-box"><span class="mono">◆ ${esc(code.code)}</span><span>${esc(code.hint)}</span><span class="muted small">мир № ${esc(code.world)}</span></div>` : ''}
    <div class="post-actions">
      <button class="act like ${p.liked ? 'on' : ''}" id="pv-like">${ICON.heart}<span>${p.likes}</span></button>
      <button class="act" id="pv-link" title="Скопировать ссылку">${ICON.link}<span>Ссылка</span></button>
      ${canEdit ? '<button class="act" id="pv-edit">Изменить</button>' : ''}
      ${canDelete ? `<button class="act danger" id="pv-del">${ICON.trash}<span>Удалить</span></button>` : me ? `<button class="act" id="pv-report">${ICON.flag}<span>Пожаловаться</span></button>` : ''}
    </div>
    <h4 class="comments-title">Комментарии <span class="muted" id="pv-ccount">${p.comments}</span></h4>
    <div class="comments" id="pv-comments"><div class="spin"></div></div>
    <form class="comment-form" id="pv-form">${
      me ? `<textarea maxlength="300" rows="2" placeholder="Написать комментарий…" required></textarea><button class="btn btn-primary btn-sm">Отправить</button>` : `<button type="button" class="btn btn-google btn-sm" id="pv-login">${ICON.google}Войдите, чтобы комментировать</button>`
    }</form>`;

  const loadComments = async () => {
    const list = await listComments(id);
    const el = $('#pv-comments', box);
    if (!el) return;
    el.innerHTML = list.length
      ? list
          .map(
            (c) => `<div class="comment">${avatar(c.author, 26)}<div><a class="c-name" href="#/user/${esc(c.uid)}">${esc(c.author.name)}</a> <span class="muted small">${ago(c.createdAt)}</span>
            ${me && (me.uid === c.uid || me.uid === p.uid || backend.isAdmin) ? `<button class="c-del" data-cid="${esc(c.id)}" aria-label="Удалить комментарий">×</button>` : ''}<p>${esc(c.text)}</p></div></div>`
          )
          .join('')
      : '<p class="muted small">Пока тихо.</p>';
    $('#pv-ccount', box).textContent = list.length;
    $$('.c-del', el).forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await deleteComment(id, b.dataset.cid);
          loadComments();
        } catch (err) {
          toast(errText(err), 'bad');
        }
      })
    );
  };
  loadComments().catch((err) => ($('#pv-comments', box).innerHTML = `<p class="muted small">${esc(errText(err))}</p>`));

  $('#pv-like', box).addEventListener('click', async (e) => {
    if (!requireLogin('Чтобы ставить лайки.')) return;
    const b = e.currentTarget;
    try {
      const r = await toggleLike(id);
      b.classList.toggle('on', r.liked);
      b.querySelector('span').textContent = r.likes;
    } catch (err) {
      toast(errText(err), 'bad');
    }
  });
  $('#pv-link', box).addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/post/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована.');
    } catch {
      prompt('Ссылка на момент:', url);
    }
  });
  const del = $('#pv-del', box);
  if (del)
    del.addEventListener('click', async () => {
      if (!del.dataset.sure) {
        del.dataset.sure = '1';
        del.querySelector('span').textContent = 'Точно удалить?';
        return;
      }
      try {
        await deletePost(id);
        toast('Момент удалён.');
        closeModal();
      } catch (err) {
        toast(errText(err), 'bad');
      }
    });
  const rep = $('#pv-report', box);
  if (rep)
    rep.addEventListener('click', async () => {
      const reason = prompt('Что не так с этим моментом?');
      if (reason === null) return;
      try {
        await reportPost(id, reason);
        toast('Спасибо, жалоба отправлена.');
      } catch (err) {
        toast(errText(err), 'bad');
      }
    });
  const ed = $('#pv-edit', box);
  if (ed)
    ed.addEventListener('click', () => {
      const t = $('.post-text', box);
      t.innerHTML = `<textarea maxlength="500" rows="4">${esc(p.text)}</textarea><label class="check"><input type="checkbox" ${p.spoiler ? 'checked' : ''}> Спойлер</label><button class="btn btn-sm btn-primary">Сохранить</button>`;
      t.querySelector('button').addEventListener('click', async () => {
        try {
          await updatePost(id, { text: t.querySelector('textarea').value.trim(), spoiler: t.querySelector('input').checked });
          toast('Сохранено.');
          openPost(id, back);
        } catch (err) {
          toast(errText(err), 'bad');
        }
      });
    });
  const form = $('#pv-form', box);
  const lg = $('#pv-login', box);
  if (lg) lg.addEventListener('click', () => requireLogin('Чтобы писать комментарии.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = form.querySelector('textarea');
    const text = ta.value.trim();
    if (!text) return;
    form.querySelector('button').disabled = true;
    try {
      await addComment(id, text);
      ta.value = '';
      await loadComments();
    } catch (err) {
      toast(errText(err), 'bad');
    }
    form.querySelector('button').disabled = false;
  });
}

// ── публикация ──────────────────────────────────────────────────────────────
function openCompose(back) {
  if (!requireLogin('Чтобы делиться моментами.')) return;
  let image = null;
  const box = openModal(
    `<form class="compose" id="compose">
      <h3>Новый момент</h3>
      <label class="drop" id="drop" tabindex="0">
        <input type="file" accept="image/*" hidden id="file">
        <span class="drop-in">${ICON.upload}<b>Выберите снимок</b><span class="muted small">или перетащите сюда, или вставьте Ctrl+V. В игре снимок делается клавишей P.</span></span>
        <img id="preview" alt="" hidden>
      </label>
      <label class="field"><span>Подпись</span><textarea id="text" maxlength="500" rows="3" placeholder="Что здесь произошло?"></textarea><span class="counter muted small" id="count">0 / 500</span></label>
      <label class="field"><span>Код открытия <span class="muted small">(необязательно)</span></span><input id="code" class="mono" maxlength="14" placeholder="NS-XXXX-XXXX" autocomplete="off"><span class="small" id="code-msg"></span></label>
      <label class="check"><input type="checkbox" id="spoiler"> Это спойлер — скрыть картинку за размытием</label>
      <div class="row-end"><button type="button" class="btn" data-close>Отмена</button><button class="btn btn-primary" id="publish" disabled>Опубликовать</button></div>
    </form>`,
    { onClose: () => (location.hash = back || '#/moments') }
  );
  const fileIn = $('#file', box);
  const drop = $('#drop', box);
  const setFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return toast('Нужна картинка.', 'bad');
    drop.classList.add('busy');
    try {
      const [full, thumb] = await Promise.all([compress(file, 1600, 950000, 0.86), compress(file, 640, 240000, 0.74)]);
      image = { full: full.url, thumb: thumb.url, w: full.w, h: full.h };
      const pv = $('#preview', box);
      pv.src = full.url;
      pv.hidden = false;
      $('.drop-in', box).hidden = true;
      $('#publish', box).disabled = false;
    } catch (err) {
      toast(errText(err), 'bad');
    }
    drop.classList.remove('busy');
  };
  fileIn.addEventListener('change', () => setFile(fileIn.files[0]));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    setFile(e.dataTransfer.files[0]);
  });
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) setFile(item.getAsFile());
  };
  document.addEventListener('paste', onPaste);
  const prev = modalClose;
  modalClose = () => {
    document.removeEventListener('paste', onPaste);
    if (prev) prev();
  };
  $('#text', box).addEventListener('input', (e) => ($('#count', box).textContent = `${e.target.value.length} / 500`));
  const codeIn = $('#code', box);
  codeIn.addEventListener('input', () => {
    const v = codeIn.value.trim();
    const msg = $('#code-msg', box);
    if (!v) {
      msg.textContent = '';
      return;
    }
    const r = parseCode(v);
    msg.textContent = r.ok ? `✓ ${r.hint}` : r.error;
    msg.className = `small ${r.ok ? 'ok' : 'bad'}`;
  });
  $('#compose', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!image) return;
    const codeRaw = codeIn.value.trim();
    let code = null;
    let codeId = null;
    if (codeRaw) {
      const r = parseCode(codeRaw);
      if (!r.ok) return toast('Код открытия не распознан.', 'bad');
      code = r.code;
      codeId = r.id;
    }
    const btn = $('#publish', box);
    btn.disabled = true;
    btn.textContent = 'Публикуем…';
    try {
      const id = await createPost({ text: $('#text', box).value.trim(), code, codeId, spoiler: $('#spoiler', box).checked, ...image });
      modalClose = null;
      document.removeEventListener('paste', onPaste);
      closeModal(true);
      toast('Момент опубликован.');
      location.hash = `#/post/${id}`;
    } catch (err) {
      toast(errText(err), 'bad');
      btn.disabled = false;
      btn.textContent = 'Опубликовать';
    }
  });
}

// ── маршрутизация ───────────────────────────────────────────────────────────
let lastPage = '#/';

async function route() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\/?/, '').split('/');
  $$('.nav a').forEach((a) => a.classList.toggle('on', (a.dataset.nav === 'moments' && ['moments', 'post', 'new', 'user'].includes(parts[0])) || (a.dataset.nav === 'home' && !parts[0])));
  if (parts[0] === 'post' && parts[1]) {
    if (!$('#feed') && !$('#home-moments')) await viewMoments('new');
    return openPost(parts[1], lastPage);
  }
  if (parts[0] === 'new') {
    if (!$('#feed') && !$('#home-moments')) await viewMoments('new');
    return openCompose(lastPage);
  }
  closeModal(true);
  lastPage = h;
  window.scrollTo(0, 0);
  if (parts[0] === 'moments') return viewMoments(parts[1] === 'top' ? 'top' : 'new');
  if (parts[0] === 'user' && parts[1]) return viewUser(parts[1]);
  return viewHome();
}

// ── запуск ──────────────────────────────────────────────────────────────────
async function start() {
  const mobile = window.matchMedia('(max-width: 720px)').matches;
  document.body.classList.toggle('is-mobile', mobile);
  await initBackend();
  let first = true;
  backend.onAuth(() => {
    renderAuth();
    if (!first) route();
    first = false;
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
  await route();
  document.body.classList.add('ready');
  if (backend.mode === 'emulator') document.body.insertAdjacentHTML('afterbegin', '<div class="test-banner mono">ТЕСТОВЫЙ РЕЖИМ · локальный эмулятор базы данных</div>');
  window.__site = { backend, route, toast };
}

start();
