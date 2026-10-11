// UIManager — меню, HUD, инвентарь, журнал, терминалы, записки, настройки, сохранения, финалы.
// Всё — обычный DOM поверх canvas. Журнал хранит наблюдения и догадки, а не готовые решения.

import { ITEMS } from '../systems/inventory.js';
import { roomName } from '../systems/story.js';
import { SLOTS } from '../systems/save.js';
import { parseCode, DISCOVERIES } from '../systems/codes.js';
import { formatTime } from '../core/util.js';
import { installOldPaper } from './paper.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { ShiftLeft: 'Shift', ShiftRight: 'Shift (пр.)', ControlLeft: 'Ctrl', Space: 'Пробел', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', AltLeft: 'Alt', CapsLock: 'Caps', Enter: 'Enter', Backquote: '`' };
  return map[code] || code;
}

const KEY_NAMES = {
  forward: 'Вперёд',
  back: 'Назад',
  left: 'Влево',
  right: 'Вправо',
  sprint: 'Бег',
  interact: 'Действие',
  flashlight: 'Фонарь',
  inventory: 'Инвентарь',
  journal: 'Журнал',
  drop: 'Положить предмет',
  screenshot: 'Снимок экрана',
  crouch: 'Присесть',
  reload: 'Заменить батарейку',
  stim: 'Стимулятор',
  throw: 'Бросить бутылку',
  mask: 'Противогаз',
  map: 'Карта',
};

const QUALITY_NAMES = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', ultra: 'Ультра' };
const QUALITY_HINT = {
  low: 'для слабых ПК: без эффектов, 4 источника света',
  medium: 'отражения, лучи света, туман над водой, 6 источников света',
  high: 'тени от фонаря, мягкие тени в углах, сглаживание, 8 источников',
  ultra: 'для мощных ПК: всё на максимум, 10 источников света, чёткие текстуры',
};

// Сайт игры — туда ведёт «Поделиться моментом».
export const SITE_URL = 'https://heijnemilan-glitch.github.io/ne-sushchestvuet/';

export class UI {
  constructor(game) {
    this.game = game;
    this.modal = null;
    this.back = null;
    this.hintTimer = 0;
    installOldPaper();
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="vignette" class="layer"></div>
      <div id="grain" class="layer"></div>
      <div id="distort" class="layer"></div>
      <div id="hud" class="layer hidden">
        <div id="crosshair"></div>
        <div id="prompt"></div>
        <div id="hint"></div>
        <div id="area"></div>
        <div id="toasts"></div>
        <div id="active-item"></div>
        <div id="helpline"></div>
        <div id="examine-ui" class="hidden"><div class="t"></div><div class="d"></div><div class="h">Мышь — вращать · [E] или [Esc] — убрать</div></div>
      </div>
      <div id="locker-ov" class="layer hidden"><div class="locker-hint">Вы в шкафчике · [E] — выйти · не шумите</div></div>
      <div id="toxic-ov" class="layer"></div>
      <div id="mask-ov" class="layer hidden"></div>
      <div id="shock-ov" class="layer"></div>
      <div id="drown-ov" class="layer"></div>
      <div id="surv" class="hidden">
        <div class="sv-row"><span class="sv-ico">◐</span><div class="sv-bar"><i id="sv-bat"></i></div><span id="sv-batn" class="sv-n"></span></div>
        <div class="sv-row" id="sv-stam-row"><span class="sv-ico">»</span><div class="sv-bar stam"><i id="sv-stam"></i></div></div>
        <div class="sv-row" id="sv-mask-row"><span class="sv-ico">◎</span><span id="sv-mask" class="sv-n"></span></div>
        <div class="sv-items" id="sv-items"></div>
      </div>
      <div id="tape" class="layer hidden"><div class="lb top"></div><div class="lb bottom"></div><div class="tape-rec mono">▶ PLAY</div><div class="tape-date mono"></div><div class="tape-title mono"></div><div class="tape-sub"></div><div class="tape-skip">Esc — пропустить</div></div>
      <div id="cine" class="layer hidden"><div class="cine-text"></div></div>
      <div id="lockhint" class="hidden">Щёлкните, чтобы продолжить</div>
      <div id="modal" class="screen hidden"></div>
      <div id="menu" class="screen solid hidden"></div>
      <div id="ending" class="screen solid hidden"></div>
      <div id="fade" class="layer"></div>`;
    document.body.appendChild(root);
    this.el = {
      hud: $('#hud'),
      crosshair: $('#crosshair'),
      prompt: $('#prompt'),
      hint: $('#hint'),
      area: $('#area'),
      toasts: $('#toasts'),
      modal: $('#modal'),
      menu: $('#menu'),
      ending: $('#ending'),
      fade: $('#fade'),
      distort: $('#distort'),
      lockhint: $('#lockhint'),
      helpline: $('#helpline'),
      active: $('#active-item'),
      examine: $('#examine-ui'),
    };
    this.el.lockhint.addEventListener('click', () => this.game.lockPointer());
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  showHUD(on) {
    this.el.hud.classList.toggle('hidden', !on);
    if (!on) {
      $('#surv').classList.add('hidden');
      $('#mask-ov').classList.add('hidden');
      $('#toxic-ov').style.opacity = '0';
    }
  }

  setPrompt(text, code) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.classList.toggle('on', !!text);
    this.el.crosshair.classList.toggle('active', !!text);
    if (text) this.el.prompt.innerHTML = `<kbd>${esc(keyLabel(code))}</kbd>${esc(text)}`;
  }

  hint(text, seconds = 4) {
    if (!text) return;
    this.el.hint.textContent = text;
    this.el.hint.classList.add('on');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.el.hint.classList.remove('on'), seconds * 1000);
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4600);
  }

  area(name) {
    this.el.area.textContent = name;
    this.el.area.classList.add('on');
    clearTimeout(this.areaTimer);
    this.areaTimer = setTimeout(() => this.el.area.classList.remove('on'), 2600);
  }

  fade(on) {
    this.el.fade.style.opacity = on ? '1' : '0';
  }

  showLocker(on) {
    $('#locker-ov').classList.toggle('hidden', !on);
  }

  // затемнение на время подъёма/спуска по лестнице
  fadeSoft(on) {
    this.el.fade.style.opacity = on ? '0.88' : '0';
  }

  // HUD выживания: заряд фонаря, выносливость, фильтр, расходники
  setSurvival(s) {
    const g = this.game;
    const box = $('#surv');
    box.classList.toggle('hidden', !g.inv.has('flashlight') || g.state !== 'playing');
    const bat = Math.round(s.battery);
    const bi = $('#sv-bat');
    bi.style.width = `${bat}%`;
    bi.classList.toggle('low', bat < 20);
    $('#sv-batn').textContent = `${bat}%`;
    $('#sv-stam').style.width = `${Math.round(s.stamina)}%`;
    $('#sv-stam').classList.toggle('stim', s.stimTime > 0);
    $('#sv-stam-row').style.opacity = s.stamina < 99 || s.stimTime > 0 ? '1' : '0';
    const mask = g.inv.has('gasmask');
    $('#sv-mask-row').style.display = mask ? '' : 'none';
    if (mask) $('#sv-mask').textContent = `${s.maskOn ? 'надет' : 'снят'} · фильтр ${Math.ceil(g.world.get('filterTime', 0))} с · запас ${g.inv.count('filter')}`;
    const k = g.settings.keys;
    const items = [
      ['battery', 'Батарейки', k.reload],
      ['stim', 'Стимуляторы', k.stim],
      ['bottle', 'Бутылки', k.throw],
    ]
      .filter(([id]) => g.inv.count(id) > 0)
      .map(([id, n, key]) => `<span>${n} ×${g.inv.count(id)} <kbd>${keyLabel(key)}</kbd></span>`)
      .join('');
    const gun = g.inv.has('shotgun') ? `<span class="gun">Ружьё ${'●'.repeat(g.world.get('gunLoaded', 0))}${'○'.repeat(2 - g.world.get('gunLoaded', 0))} · патронов ${g.inv.count('shells')}</span>` : g.inv.count('shells') ? `<span>Патроны ×${g.inv.count('shells')}</span>` : '';
    const shards = g.inv.count('shard') ? `<span class="shard">Мнемит ${g.inv.count('shard')}/6</span>` : '';
    const all = gun + shards + items;
    if (all !== this._items) {
      this._items = all;
      $('#sv-items').innerHTML = all;
    }
    $('#mask-ov').classList.toggle('hidden', !s.maskOn || g.state !== 'playing');
    $('#toxic-ov').style.opacity = String(s.toxicLevel * 0.85);
  }

  // ── кассеты (ролики лора) ──
  showTape(title, date) {
    const t = $('#tape');
    $('.tape-title', t).textContent = title;
    $('.tape-date', t).textContent = date;
    $('.tape-sub', t).innerHTML = '';
    t.classList.remove('hidden');
    this.el.menu.classList.add('hidden');
    this.showHUD(false);
    this.showLockHint(false);
  }

  tapeLines(lines) {
    const s = $('#tape .tape-sub');
    s.innerHTML = lines.map((l, i) => `<p style="animation-delay:${i * 1.2}s">${esc(l)}</p>`).join('');
  }

  hideTape() {
    $('#tape').classList.add('hidden');
    if (this.game.state === 'playing' || this.game.inGame) this.showHUD(true);
  }

  // Кинематографичные строки на чёрном фоне (вступление, поимка).
  cinematic(lines, { hold = 1.6, red = false } = {}) {
    const box = $('#cine');
    const t = $('.cine-text', box);
    box.classList.remove('hidden');
    box.classList.toggle('red', red);
    t.innerHTML = '';
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (i >= lines.length) {
          setTimeout(() => {
            box.classList.add('out');
            setTimeout(() => {
              box.classList.add('hidden');
              box.classList.remove('out');
              resolve();
            }, 900);
          }, hold * 1000);
          return;
        }
        const p = document.createElement('p');
        p.textContent = lines[i++];
        t.appendChild(p);
        setTimeout(next, 1500);
      };
      next();
    });
  }

  distort(strength) {
    this.el.distort.style.opacity = String(strength);
  }

  setHelp(show) {
    const k = this.game.settings.keys;
    this.el.helpline.innerHTML = show
      ? `<span class="kbd">${keyLabel(k.forward)}${keyLabel(k.left)}${keyLabel(k.back)}${keyLabel(k.right)}</span>движение · <span class="kbd">${keyLabel(k.interact)}</span>действие · <span class="kbd">${keyLabel(k.flashlight)}</span>фонарь<br><span class="kbd">${keyLabel(k.inventory)}</span>инвентарь · <span class="kbd">${keyLabel(k.journal)}</span>журнал · <span class="kbd">${keyLabel(k.screenshot)}</span>снимок · <span class="kbd">Esc</span>пауза<br><span class="kbd">Shift</span>бег · <span class="kbd">${keyLabel(k.crouch)}</span>присесть · <span class="kbd">${keyLabel(k.reload)}</span>батарейка · <span class="kbd">${keyLabel(k.stim)}</span>стимулятор · <span class="kbd">${keyLabel(k.throw)}</span>бросить · <span class="kbd">${keyLabel(k.mask)}</span>противогаз · <span class="kbd">${keyLabel(k.map)}</span>карта · <span class="kbd">ЛКМ</span>выстрел`
      : '';
  }

  setActiveItem(text) {
    this.el.active.textContent = text || '';
  }

  showLockHint(on) {
    this.el.lockhint.classList.toggle('hidden', !on);
  }

  // ── модальные окна ────────────────────────────────────────────────────────
  openModal(name, html, back = null) {
    this.modal = name;
    this.back = back;
    this.el.modal.innerHTML = html;
    this.el.modal.classList.remove('hidden');
    this.game.onModal(true);
    const close = this.el.modal.querySelector('[data-close]');
    if (close) close.addEventListener('click', () => this.closeModal());
    return this.el.modal;
  }

  // Esc / крестик: назад по цепочке или в игру.
  closeModal() {
    if (!this.modal) return;
    if (this.modal === 'terminal' && this.termTyping) {
      this.termSkip = true;
      return;
    }
    const back = this.back;
    this.modal = null;
    this.back = null;
    this.el.modal.classList.add('hidden');
    this.el.modal.innerHTML = '';
    if (this.onModalClose) {
      const f = this.onModalClose;
      this.onModalClose = null;
      f();
    }
    if (back) back();
    else this.game.onModal(false);
  }

  // ── главное меню ──────────────────────────────────────────────────────────
  showMenu() {
    const g = this.game;
    const last = g.saves.lastSlot();
    const m = this.el.menu;
    m.innerHTML = `
      <div class="wrap">
        <h1>НЕ СУЩЕСТВУЕТ</h1>
        <div class="sub">IT DOESN'T EXIST · Сектор 0</div>
        <button class="menu-item" data-a="continue" ${last ? '' : 'disabled'}>Продолжить</button>
        <button class="menu-item" data-a="new">Новая игра</button>
        <button class="menu-item" data-a="load">Выбрать сохранение</button>
        <button class="menu-item" data-a="gfx">Графика: <b>${QUALITY_NAMES[g.settings.quality] || 'Средняя'}</b> <span class="gfx-hint">— ${QUALITY_HINT[g.settings.quality] || ''}</span></button>
        <button class="menu-item" data-a="settings">Настройки</button>
        <button class="menu-item" data-a="tapes">Кассеты <span class="gfx-hint">(${g.profile.tapes.length}/4)</span></button>
        <button class="menu-item" data-a="codes">Коды открытий</button>
        <button class="menu-item" data-a="exit">Выход</button>
        <div class="foot">Игра работает без интернета. Прогресс хранится в этом браузере; сохранения можно выгрузить в файл.<br>Лучше играть в наушниках. ${g.profile.endings.length ? `<br>Найдено исходов: ${g.profile.endings.length}/7.` : ''}</div>
      </div>`;
    m.classList.remove('hidden');
    this.el.ending.classList.add('hidden');
    this.showHUD(false);
    m.querySelectorAll('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        g.audio.init();
        g.audio.play('ui');
        const a = b.dataset.a;
        if (a === 'continue') g.continueGame();
        if (a === 'new') this.confirmNew();
        if (a === 'load') this.showSaves('load', () => this.showMenu());
        if (a === 'settings') this.showSettings(() => this.showMenu());
        if (a === 'codes') this.showCodesScreen(() => this.showMenu());
        if (a === 'gfx') {
          const order = ['low', 'medium', 'high', 'ultra'];
          g.settings.quality = order[(order.indexOf(g.settings.quality) + 1) % order.length];
          g.applySettings();
          this.showMenu();
        }
        if (a === 'tapes') this.showTapes();
        if (a === 'exit') this.showExit();
      })
    );
  }

  hideMenu() {
    this.el.menu.classList.add('hidden');
  }

  showTapes() {
    const g = this.game;
    const names = { 1: 'Институт', 2: 'Затопление', 3: 'Оператор', 4: 'Испытуемый 0' };
    const rows = [1, 2, 3, 4]
      .map((n) =>
        g.profile.tapes.includes(n)
          ? `<button class="menu-item" data-tape="${n}">▶ Кассета ${n} · «${names[n]}»</button>`
          : `<div class="menu-item" style="opacity:.3;cursor:default">■ Кассета ${n} · не найдена</div>`
      )
      .join('');
    const html = `<div class="panel" style="width:min(480px,92vw)"><header>Кассеты<button class="x" data-close>×</button></header>
      <div class="body" style="display:flex;flex-direction:column;gap:2px">${rows}<p class="empty" style="margin-top:12px">Кассеты спрятаны в комплексе. Найденные можно пересмотреть здесь.</p></div></div>`;
    const el = this.openModal('tapes', html, () => this.showMenu());
    el.querySelectorAll('[data-tape]').forEach((b) =>
      b.addEventListener('click', () => {
        this.modal = null;
        this.back = null;
        this.el.modal.classList.add('hidden');
        g.audio.init();
        g.lore.play(+b.dataset.tape);
      })
    );
  }

  confirmNew() {
    const g = this.game;
    const html = `<div class="panel" style="width:min(520px,92vw)"><header>Новая игра<button class="x" data-close>×</button></header>
      <div class="body" style="font-size:15px;line-height:1.6">Новый мир получит собственный номер — детали и порядок событий в нём будут отличаться от других миров.<br><br>Выберите слот для автосохранений новой игры. Существующие сохранения в других слотах не пострадают.</div>
      <div class="footer">${['1', '2', '3']
        .map((s) => {
          const i = g.saves.info(s);
          return `<button class="btn" data-slot="${s}">Слот ${s}${i ? ' (перезаписать)' : ''}</button>`;
        })
        .join('')}</div></div>`;
    const el = this.openModal('new', html, () => this.showMenu());
    el.querySelectorAll('[data-slot]').forEach((b) =>
      b.addEventListener('click', () => {
        this.modal = null;
        this.el.modal.classList.add('hidden');
        g.newGame(b.dataset.slot);
      })
    );
  }

  showExit() {
    this.el.menu.innerHTML = `<div class="wrap"><h1>…</h1><div class="sub">Комплекс помнит вас</div><div class="foot">Вкладку можно закрыть. Прогресс сохранён.</div><button class="menu-item" id="back-menu">Вернуться</button></div>`;
    $('#back-menu').addEventListener('click', () => this.showMenu());
    try {
      window.close();
    } catch {
      /* браузер не даёт закрыть вкладку скриптом — это нормально */
    }
  }

  // ── пауза ─────────────────────────────────────────────────────────────────
  showPause() {
    const g = this.game;
    const html = `<div class="panel" style="width:min(420px,92vw)"><header>Пауза<button class="x" data-close>×</button></header>
      <div class="body" style="display:flex;flex-direction:column;gap:2px">
        <button class="menu-item" data-a="resume">Продолжить</button>
        <button class="menu-item" data-a="save">Сохранить</button>
        <button class="menu-item" data-a="load">Загрузить</button>
        <button class="menu-item" data-a="journal">Журнал</button>
        <button class="menu-item" data-a="settings">Настройки</button>
        <button class="menu-item" data-a="share">Поделиться моментом ↗</button>
        <button class="menu-item" data-a="menu">В главное меню</button>
      </div><div class="footer" style="justify-content:flex-start;color:var(--dim);font-size:12px">Мир № ${esc(g.worldTag())} · ${formatTime(g.mem.data.playTime)} в секторе</div></div>`;
    const el = this.openModal('pause', html);
    el.querySelectorAll('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'resume') this.closeModal();
        if (a === 'save') this.showSaves('save', () => this.showPause());
        if (a === 'load') this.showSaves('load', () => this.showPause());
        if (a === 'journal') this.showJournal('notes', () => this.showPause());
        if (a === 'settings') this.showSettings(() => this.showPause());
        if (a === 'share') {
          window.open(`${SITE_URL}#/new`, '_blank', 'noopener');
          this.toast(`Снимок кадра — клавиша [${keyLabel(g.settings.keys.screenshot)}]. Файл попадёт в «Загрузки».`);
        }
        if (a === 'menu') {
          g.save('auto');
          this.modal = null;
          this.el.modal.classList.add('hidden');
          g.toMenu();
        }
      })
    );
  }

  // ── сохранения ────────────────────────────────────────────────────────────
  showSaves(mode, back) {
    const g = this.game;
    const rows = SLOTS.map((s) => {
      const i = g.saves.info(s);
      const name = s === 'auto' ? 'Автосохранение' : `Слот ${s}`;
      let meta = '<span class="meta">пусто</span>';
      if (i && i.damaged && !i.recoverable) meta = '<span class="meta bad">повреждено, восстановить нельзя</span>';
      else if (i) meta = `<span class="meta">${esc(roomName(i.room || '?'))} · ${formatTime(i.playTime || 0)} · мир № ${esc(i.world || '?')} · ${i.savedAt ? new Date(i.savedAt).toLocaleString('ru-RU') : ''}${i.damaged ? ' · <span class="bad">повреждено — будет загружена резервная копия</span>' : ''}</span>`;
      const canSave = mode === 'save' && g.inGame && s !== 'auto';
      return `<div class="slot"><div><div class="name">${name}</div>${meta}</div><div class="acts">
        ${canSave ? `<button class="btn" data-save="${s}">Сохранить</button>` : ''}
        ${i && !(i.damaged && !i.recoverable) ? `<button class="btn" data-load="${s}">Загрузить</button>` : ''}
        ${i ? `<button class="btn" data-export="${s}">В файл</button>` : ''}
        ${s !== 'auto' ? `<button class="btn" data-import="${s}">Из файла</button>` : ''}
        ${i ? `<button class="btn danger" data-del="${s}">Удалить</button>` : ''}
      </div></div>`;
    }).join('');
    const html = `<div class="panel"><header>${mode === 'save' ? 'Сохранить игру' : 'Сохранения'}<button class="x" data-close>×</button></header><div class="body">${rows}</div>
      <div class="footer" style="justify-content:space-between;color:var(--dim);font-size:12px"><span>Перед каждой записью создаётся резервная копия слота.</span><input type="file" id="import-file" accept=".json,.txt" class="hidden"></div></div>`;
    const el = this.openModal('saves', html, back);
    el.querySelectorAll('[data-save]').forEach((b) =>
      b.addEventListener('click', () => {
        const ok = g.save(b.dataset.save);
        this.toast(ok ? 'Сохранено.' : 'Не удалось сохранить (хранилище браузера недоступно).');
        this.showSaves(mode, back);
      })
    );
    el.querySelectorAll('[data-load]').forEach((b) =>
      b.addEventListener('click', () => {
        this.modal = null;
        this.el.modal.classList.add('hidden');
        g.loadSlot(b.dataset.load);
      })
    );
    el.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.confirm) {
          g.saves.remove(b.dataset.del);
          this.showSaves(mode, back);
        } else {
          b.dataset.confirm = '1';
          b.textContent = 'Точно удалить?';
        }
      })
    );
    el.querySelectorAll('[data-export]').forEach((b) =>
      b.addEventListener('click', () => {
        const text = g.saves.exportText(b.dataset.export);
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ne-sushchestvuet-${b.dataset.export}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      })
    );
    const file = $('#import-file', el);
    el.querySelectorAll('[data-import]').forEach((b) =>
      b.addEventListener('click', () => {
        file.dataset.slot = b.dataset.import;
        file.click();
      })
    );
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const r = g.saves.importText(file.dataset.slot, await f.text());
      this.toast(r.ok ? 'Сохранение загружено в слот.' : r.error);
      this.showSaves(mode, back);
    });
  }

  // ── настройки ─────────────────────────────────────────────────────────────
  showSettings(back) {
    const g = this.game;
    const s = g.settings;
    const range = (key, label, min, max, step, fmt = (v) => Math.round(v * 100) + '%') =>
      `<div class="row"><label for="s-${key}">${label}</label><input type="range" id="s-${key}" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><span class="val">${fmt(s[key])}</span></div>`;
    const keys = Object.keys(KEY_NAMES)
      .map((k) => `<div class="keyrow"><span>${KEY_NAMES[k]}</span><button class="keybtn" data-key="${k}">${esc(keyLabel(s.keys[k]))}</button></div>`)
      .join('');
    const html = `<div class="panel"><header>Настройки<button class="x" data-close>×</button></header><div class="body">
      <h3>Звук</h3>
      ${range('master', 'Общая громкость', 0, 1, 0.05)}
      ${range('ambient', 'Окружение', 0, 1, 0.05)}
      ${range('sfx', 'Эффекты', 0, 1, 0.05)}
      <h3>Управление</h3>
      ${range('sens', 'Чувствительность мыши', 0.2, 3, 0.05, (v) => (+v).toFixed(2))}
      <div class="row"><label>Инверсия оси Y</label><select data-k="invertY"><option value="false">Нет</option><option value="true" ${s.invertY ? 'selected' : ''}>Да</option></select><span></span></div>
      <div class="row"><label>Покачивание камеры</label><select data-k="headBob"><option value="true">Да</option><option value="false" ${s.headBob === false ? 'selected' : ''}>Нет</option></select><span></span></div>
      ${keys}
      <h3>Графика</h3>
      <div class="row"><label>Качество</label><select data-k="quality">
        <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Низкое (без теней, 4 источника)</option>
        <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Среднее (6 источников)</option>
        <option value="high" ${s.quality === 'high' ? 'selected' : ''}>Высокое (тени фонаря, 8 источников)</option>
        <option value="ultra" ${s.quality === 'ultra' ? 'selected' : ''}>Ультра (для мощных ПК)</option></select><span></span></div>
      <div class="row"><label>Скримеры</label><select data-k="scares"><option value="true">Включены</option><option value="false" ${s.scares === false ? 'selected' : ''}>Выключены</option></select><span></span></div>
      ${range('resScale', 'Разрешение рендера', 0.5, 1, 0.05)}
      ${range('fov', 'Поле зрения', 60, 95, 1, (v) => Math.round(v) + '°')}
      <div class="row"><label>Полноэкранный режим</label><button class="btn" id="fs">Переключить</button><span></span></div>
      <div style="color:var(--dim);font-size:12px;margin-top:10px">Изменение качества применяется сразу; текстуры перестраиваются при следующем запуске игры.</div>
      </div><div class="footer"><button class="btn" id="s-reset">Сбросить</button><button class="btn" data-close>Готово</button></div></div>`;
    const el = this.openModal('settings', html, back);
    el.querySelectorAll('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        s[k] = parseFloat(inp.value);
        inp.nextElementSibling.textContent = k === 'sens' ? s[k].toFixed(2) : k === 'fov' ? Math.round(s[k]) + '°' : Math.round(s[k] * 100) + '%';
        g.applySettings();
      })
    );
    el.querySelectorAll('select').forEach((sel) =>
      sel.addEventListener('change', () => {
        const k = sel.dataset.k;
        s[k] = sel.value === 'true' ? true : sel.value === 'false' ? false : sel.value;
        g.applySettings();
      })
    );
    el.querySelectorAll('[data-key]').forEach((btn) =>
      btn.addEventListener('click', () => {
        btn.classList.add('wait');
        btn.textContent = 'нажмите клавишу…';
        this.capturing = (code) => {
          if (code !== 'Escape') {
            // клавиша уже занята? меняем местами
            const k = btn.dataset.key;
            const other = Object.keys(s.keys).find((o) => s.keys[o] === code && o !== k);
            if (other) s.keys[other] = s.keys[k];
            s.keys[k] = code;
            g.applySettings();
          }
          this.capturing = null;
          this.showSettings(back);
        };
      })
    );
    $('#fs', el).addEventListener('click', () => g.toggleFullscreen());
    $('#s-reset', el).addEventListener('click', () => {
      g.resetSettings();
      this.showSettings(back);
    });
  }

  // ── инвентарь ─────────────────────────────────────────────────────────────
  showInventory(selected) {
    const g = this.game;
    const items = g.inv.list;
    const sel = selected && items.includes(selected) ? selected : items[0];
    const k = g.settings.keys;
    const list = items.length
      ? items.map((id) => `<button class="inv-item ${id === sel ? 'sel' : ''}" data-id="${id}">${esc(ITEMS[id].name)}</button>`).join('')
      : '<div class="empty">Пусто.</div>';
    const desc = sel
      ? `<div class="t">${esc(ITEMS[sel].name)}</div><div>${esc(ITEMS[sel].desc)}</div>`
      : '<div class="empty">Важные предметы появятся здесь.</div>';
    const html = `<div class="panel"><header>Инвентарь<button class="x" data-close>×</button></header>
      <div class="body"><div class="inv"><div class="inv-list">${list}</div><div class="inv-desc">${desc}</div></div></div>
      <div class="footer">${sel ? `<button class="btn" id="examine">Осмотреть</button>${sel !== 'flashlight' ? `<button class="btn" id="drop">Положить [${keyLabel(k.drop)}]</button>` : ''}` : ''}<button class="btn" data-close>Закрыть [${keyLabel(k.inventory)}]</button></div></div>`;
    const el = this.openModal('inventory', html);
    this.invSelected = sel;
    el.querySelectorAll('.inv-item').forEach((b) => b.addEventListener('click', () => this.showInventory(b.dataset.id)));
    const ex = $('#examine', el);
    if (ex) ex.addEventListener('click', () => g.examine(sel));
    const dr = $('#drop', el);
    if (dr) dr.addEventListener('click', () => g.dropItem(sel));
  }

  // ── записка ───────────────────────────────────────────────────────────────
  showNote(title, text) {
    const html = `<div class="paper"><span class="close" data-close>закрыть [Esc]</span><h2>${esc(title)}</h2>${esc(text)}</div>`;
    const back = this.modal === 'journal' ? this.journalBack : null;
    this.openModal('note', html, back);
  }

  // ── журнал ────────────────────────────────────────────────────────────────
  showJournal(tab = 'notes', back = null) {
    const g = this.game;
    const mem = g.mem;
    this.journalBack = () => this.showJournal(tab, back);
    const tabs = [
      ['notes', 'Записи'],
      ['obs', 'Наблюдения'],
      ['rules', 'Закономерности'],
      ['mine', 'Мои заметки'],
      ['map', 'Карта'],
      ['codes', 'Обмен'],
    ];
    let body = '';
    if (tab === 'notes') {
      body = mem.data.notes.length
        ? mem.data.notes.map((id) => `<div class="entry"><button class="link" data-note="${id}">${esc(g.story.note(id).title)}</button></div>`).join('')
        : '<div class="empty">Найденные записки, документы и файлы появятся здесь.</div>';
    } else if (tab === 'obs') {
      body = mem.data.observations.length
        ? [...mem.data.observations].reverse().map((o) => `<div class="entry"><span class="when">${formatTime(o.t)}</span>${esc(o.text)}</div>`).join('')
        : '<div class="empty">Здесь будет то, что я заметил. Без выводов — только факты.</div>';
    } else if (tab === 'rules') {
      const found = g.rules.rules.filter((r) => mem.rule(r.id).done);
      body = found.length
        ? found.map((r) => `<div class="entry"><div class="title">${esc(r.title)}</div>${esc(r.hypothesis)}</div>`).join('') + `<div class="empty" style="margin-top:14px">Догадок: ${found.length}. Сколько их всего — неизвестно.</div>`
        : '<div class="empty">Пока я не понимаю, по каким правилам живёт это место. Но правила есть.</div>';
    } else if (tab === 'mine') {
      body = `<textarea class="notes" id="pnotes" placeholder="Записывайте догадки, коды, номера, маршруты…">${esc(mem.data.playerNotes)}</textarea>`;
    } else if (tab === 'map') {
      body = `<div class="mapwrap"><div class="lv"><button class="btn" data-lv="0">Этаж 0</button><button class="btn" data-lv="-1">Этаж −1</button>${mem.visited('void') ? '<button class="btn" data-lv="Ø">Этаж Ø</button>' : ''}</div><canvas id="mapc" width="900" height="560"></canvas><div class="empty">На карте — только то, где я был. Некоторые комнаты не помещаются туда, где я их нашёл.</div></div>`;
    } else if (tab === 'codes') {
      body = this.codesHTML();
    }
    const html = `<div class="panel" style="width:min(900px,95vw)"><header>Журнал<button class="x" data-close>×</button></header>
      <div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>
      <div class="body" style="min-height:360px">${body}</div></div>`;
    const el = this.openModal('journal', html, back);
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showJournal(b.dataset.tab, back)));
    el.querySelectorAll('[data-note]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = g.story.note(b.dataset.note);
        this.showNote(n.title, n.text);
      })
    );
    const ta = $('#pnotes', el);
    if (ta) {
      ta.addEventListener('input', () => (mem.data.playerNotes = ta.value));
      ta.addEventListener('keydown', (e) => e.stopPropagation());
    }
    if (tab === 'map') {
      const draw = (lv) => this.drawMap($('#mapc', el), lv);
      el.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => draw(b.dataset.lv)));
      const cz = g.currentZone;
      draw(cz && cz.map ? cz.map.level : '0');
    }
    if (tab === 'codes') this.bindCodes(el, () => this.showJournal('codes', back));
  }

  // ── бумажная карта комплекса (предмет из изолятора, клавиша M) ────────────
  showMap() {
    const g = this.game;
    const w = g.world;
    const mem = g.mem;
    const inv = g.inv;
    g.audio.play('map_open');
    const parts = ['part_barrel', 'part_stock', 'part_bolt'].filter((p) => inv.has(p)).length;
    const gun = inv.has('shotgun');
    const ck = (done, text) => `<li class="${done ? 'done' : ''}"><span class="box">${done ? '✓' : ''}</span>${text}</li>`;
    const found = (id) => g.profile.endings.includes(id);
    const exits = `
      <h3>КАК ОТСЮДА ВЫБРАТЬСЯ</h3>
      <div class="exit"><b>1. ГЕРМОВОРОТА</b> <i>центральный пост, на север через тоннель</i>${found('ending_hunter') ? ' <em>✓ пройдено</em>' : ''}
        <ul>${ck(w.get('power'), 'вернуть питание: 3 предохранителя в подстанции')}${ck(gun, gun ? 'ружьё собрано' : `собрать ружьё в мастерской: ствол, приклад, затвор (${parts}/3)`)}${ck(w.get('monsterDead'), 'убить ОНО — тогда карантин снимется')}</ul></div>
      <div class="exit"><b>2. ВОДОСТОК</b> <i>люк в подстанции → канализация → лодка</i>${found('ending_escape') ? ' <em>✓ пройдено</em>' : ''}
        <ul>${ck(inv.has('gasmask'), 'противогаз — в канале газ')}${ck(mem.visited('pump'), 'доплыть на лодке до насосной')}${ck(inv.has('cutters'), 'болторез для решётки (уровень −1, шлюз)')}</ul></div>
      <div class="exit"><b>3. ЯДРО</b> <i>уровень −1: лифт или лестница</i>${found('ending_shutdown') ? ' <em>✓ пройдено</em>' : ''}
        <ul>${ck(mem.visited('lab'), 'спуститься в лабораторию')}${ck(mem.solved('gate'), 'открыть шлюз ядра — нужны две плиты')}${ck(w.get('mnemaOff'), 'отключить МНЕМУ')}</ul></div>
      <p class="rumor">Говорят, выходов больше. Их нет ни на одном плане.<br>Найдено исходов: ${g.profile.endings.length} из 7.</p>
      <p class="rumor">Осколки мнемита (светятся в темноте): ${g.inv.count('shard')} из 6. Говорят, за них дадут целое состояние.</p>
      <div class="danger">
        <p class="${w.get('cableOff') ? 'struck' : ''}">⚡ Северо-западный угол резервуара — вода под током! Рубильник «Линия 2» в подстанции.</p>
        <p>☠ Газ в канале — без противогаза не входить.</p>
        <p>✋ ОНО не заходит в воду. Прячься в шкафах.</p>
      </div>`;
    const html = `<div class="mapsheet"><span class="close" data-close>закрыть [Esc]</span>
      <div class="mapgrid"><div class="mapleft"><div class="maptitle">СЕКТОР 0 · ПЛАН ЭВАКУАЦИИ · ЯРУС 0</div><canvas id="papermap" width="900" height="700"></canvas></div><div class="mapright">${exits}</div></div></div>`;
    const el = this.openModal('map', html);
    this.drawPaperMap($('#papermap', el));
  }

  drawPaperMap(canvas) {
    const g = this.game;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const X0 = -46;
    const X1 = 48;
    const Z0 = -63;
    const Z1 = 9;
    const sc = Math.min((W - 40) / (X1 - X0), (H - 40) / (Z1 - Z0));
    const ox = (W - (X1 - X0) * sc) / 2;
    const oz = (H - (Z1 - Z0) * sc) / 2;
    const X = (x) => ox + (x - X0) * sc;
    const Z = (z) => oz + (z - Z0) * sc;
    const rect = (x0, z0, x1, z1) => [X(x0), Z(z0), (x1 - x0) * sc, (z1 - z0) * sc];
    const ink = 'rgba(40,36,30,0.85)';
    // вода резервуара
    ctx.fillStyle = 'rgba(60,96,110,0.28)';
    ctx.fillRect(...rect(-14.5, -30.5, 14.5, -3.5));
    ctx.save();
    ctx.beginPath();
    ctx.rect(...rect(-14.5, -30.5, 14.5, -3.5));
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,80,100,0.25)';
    ctx.lineWidth = 1;
    for (let i = -40; i < 40; i++) {
      ctx.beginPath();
      ctx.moveTo(X(-14.5 + i), Z(-3.5));
      ctx.lineTo(X(-14.5 + i + 27), Z(-30.5));
      ctx.stroke();
    }
    ctx.restore();
    // зоны плана (без «невозможных» комнат и без вентиляции)
    const skip = new Set(['vent', 'surface', 'outside', 'reflection', 'room07', 'elevator']);
    ctx.font = 'bold 13px "Segoe Print", "Comic Sans MS", cursive';
    for (const z of g.builder.zones) {
      if (!z.map || z.map.level !== '0' || z.map.x0 !== undefined || skip.has(z.memoryId)) continue;
      if (z.id === 'flood' || z.id === 'vest07' || z.id === 'vestW' || z.id === 'vestE' || z.id === 'stairsVest') continue;
      ctx.fillStyle = z.id === 'corridor' ? 'rgba(120,110,90,0.18)' : 'rgba(230,222,200,0.55)';
      ctx.strokeStyle = ink;
      ctx.lineWidth = z.id === 'corridor' ? 1 : 2;
      ctx.fillRect(...rect(z.x0, z.z0, z.x1, z.z1));
      ctx.strokeRect(...rect(z.x0, z.z0, z.x1, z.z1));
    }
    // затопленный угол под током
    ctx.fillStyle = g.world.get('cableOff') ? 'rgba(60,96,110,0.35)' : 'rgba(190,40,20,0.35)';
    ctx.fillRect(...rect(-18, -34, -14.5, -22.4));
    ctx.fillRect(...rect(-14.5, -34, -8, -30.5));
    // подписи
    const label = (t, x, z, size = 13, color = ink) => {
      ctx.fillStyle = color;
      ctx.font = `bold ${size}px "Segoe Print", "Comic Sans MS", cursive`;
      ctx.textAlign = 'center';
      ctx.fillText(t, X(x), Z(z));
    };
    label('ИЗОЛЯТОР', 0, 4.4, 11);
    label('РЕЗЕРВУАР', 0, -24, 15, 'rgba(30,60,80,0.8)');
    label('башня', 0, -15.6, 11);
    label('ЖИЛОЙ БЛОК', -25, -7.5, 11);
    label('КАЗАРМА', -26, -14, 11);
    label('АРХИВ', -38, -9, 13);
    label('ТЕХБЛОК', 25, -7.5, 11);
    label('ПОДСТАНЦИЯ', 39, -11, 12);
    label('МАСТЕРСКАЯ', -24, -26, 12);
    label('ЦЕНТР. ПОСТ', 0, -49, 14);
    label('лифт', -4, -59.6, 10);
    label('лестница', 30, -42.6, 11);
    label('шлюз', 21, -52.6, 11);
    if (!g.world.get('cableOff')) label('⚡ ТОК!', -12.5, -32.6, 14, 'rgba(170,30,10,0.95)');
    // карандашные пометки: выходы
    const mark = (x, z, text, dx = 0, dz = -2.2) => {
      ctx.strokeStyle = 'rgba(160,30,20,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(X(x), Z(z), 14, 11, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,30,20,0.95)';
      ctx.font = 'bold 14px "Segoe Print", "Comic Sans MS", cursive';
      ctx.textAlign = 'center';
      ctx.fillText(text, X(x + dx), Z(z + dz));
    };
    mark(12.5, -53, '1 → НАВЕРХ', 3, -4);
    mark(43, -18.4, '2 ↓ водосток', 0, 3.2);
    mark(0, -61.6, '3 ↓ ядро', 6, 1.6);
    // игрок
    const cz = g.currentZone;
    if (cz && cz.map && cz.map.level === '0' && cz.map.x0 === undefined && g.player.pos.y > -2) {
      const p = g.player.pos;
      const t = performance.now() / 300;
      ctx.fillStyle = 'rgba(20,90,40,0.95)';
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), 5 + Math.sin(t) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,90,40,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(p.x), Z(p.z));
      ctx.lineTo(X(p.x) - Math.sin(g.player.yaw) * 16, Z(p.z) - Math.cos(g.player.yaw) * 16);
      ctx.stroke();
      ctx.font = 'bold 12px "Segoe Print", "Comic Sans MS", cursive';
      ctx.fillText('ВЫ ЗДЕСЬ', X(p.x) + 30, Z(p.z) + 4);
    } else {
      ctx.fillStyle = 'rgba(120,40,30,0.8)';
      ctx.font = 'bold 13px "Segoe Print", "Comic Sans MS", cursive';
      ctx.textAlign = 'left';
      ctx.fillText('Тебя нет на этом плане.', 16, H - 16);
    }
  }

  drawMap(canvas, level) {
    const g = this.game;
    const mem = g.mem;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0c0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rects = [];
    for (const z of g.builder.zones) {
      if (!z.map || z.map.level !== level) continue;
      if (!mem.visited(z.memoryId) && z.memoryId !== 'elevator') continue;
      if (z.memoryId === 'elevator' && !mem.visited('elevator')) continue;
      const r = z.map.x0 !== undefined ? z.map : z;
      rects.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, z, impossible: z.map.x0 !== undefined });
    }
    if (!rects.length) {
      ctx.fillStyle = '#5a625a';
      ctx.font = '18px Consolas';
      ctx.fillText('Я здесь ещё не был.', 30, 50);
      return;
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const r of rects) {
      x0 = Math.min(x0, r.x0);
      x1 = Math.max(x1, r.x1);
      z0 = Math.min(z0, r.z0);
      z1 = Math.max(z1, r.z1);
    }
    const pad = 30;
    const sc = Math.min((canvas.width - pad * 2) / (x1 - x0 || 1), (canvas.height - pad * 2) / (z1 - z0 || 1));
    const ox = pad + (canvas.width - pad * 2 - (x1 - x0) * sc) / 2;
    const oz = pad + (canvas.height - pad * 2 - (z1 - z0) * sc) / 2;
    const X = (x) => ox + (x - x0) * sc;
    const Z = (z) => oz + (z - z0) * sc;
    const cur = g.currentZone;
    for (const r of rects) {
      const isCur = cur && cur.memoryId === r.z.memoryId && cur === r.z;
      ctx.fillStyle = r.impossible ? 'rgba(180,120,90,0.16)' : isCur ? 'rgba(200,220,200,0.18)' : 'rgba(200,210,200,0.07)';
      ctx.strokeStyle = r.impossible ? 'rgba(220,150,110,0.7)' : 'rgba(200,210,200,0.45)';
      ctx.lineWidth = 1.5;
      if (r.impossible) ctx.setLineDash([6, 4]);
      ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * sc, (r.z1 - r.z0) * sc);
      ctx.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * sc, (r.z1 - r.z0) * sc);
      ctx.setLineDash([]);
      if ((r.x1 - r.x0) * sc > 50 && (r.z1 - r.z0) * sc > 18) {
        ctx.fillStyle = r.impossible ? '#d8a080' : '#9aa49a';
        ctx.font = '13px Consolas';
        ctx.fillText(r.z.name, X(r.x0) + 5, Z(r.z0) + 16);
      }
    }
    // игрок
    if (cur && cur.map && cur.map.level === level) {
      const p = g.player.pos;
      let px = p.x;
      let pz = p.z;
      if (cur.map.x0 !== undefined) {
        px = cur.map.x0 + ((p.x - cur.x0) / (cur.x1 - cur.x0)) * (cur.map.x1 - cur.map.x0);
        pz = cur.map.z0 + ((p.z - cur.z0) / (cur.z1 - cur.z0)) * (cur.map.z1 - cur.map.z0);
      }
      ctx.fillStyle = '#e8f0e4';
      ctx.beginPath();
      ctx.arc(X(px), Z(pz), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8f0e4';
      ctx.beginPath();
      ctx.moveTo(X(px), Z(pz));
      ctx.lineTo(X(px) - Math.sin(g.player.yaw) * 14, Z(pz) - Math.cos(g.player.yaw) * 14);
      ctx.stroke();
    }
  }

  // ── коды открытий ─────────────────────────────────────────────────────────
  codesHTML() {
    const g = this.game;
    const mine = g.inGame ? g.mem.data.codes : [];
    const foreign = g.profile.foreignCodes;
    const mineIds = new Set(mine.map((c) => c.id));
    return `<div class="codes">
      <div style="font-size:14px;color:var(--dim);line-height:1.6;margin-bottom:10px">Каждое открытие даёт код. Сравнивайте их с другими игроками: у каждого свой мир, и одни и те же правила проявляются по-разному. Код подсказывает, ЧТО нашли, но не КАК.</div>
      ${g.inGame ? `<h3>Мои открытия · мир № ${esc(g.worldTag())}</h3>${mine.length ? mine.map((c) => `<div class="entry"><span class="mine">${c.code}</span> — ${esc(DISCOVERIES.find((d) => d.id === c.id)?.hint || '')}</div>`).join('') : '<div class="empty">Пока ни одного.</div>'}` : ''}
      <h3>Ввести чужой код</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="code" id="code-in" placeholder="NS-XXXX-XXXX" maxlength="14"><button class="btn" id="code-add">Проверить</button><span id="code-msg" style="font-size:13px;color:var(--dim)"></span></div>
      <h3>Чужие открытия</h3>
      ${foreign.length ? foreign.map((c) => `<div class="entry"><span class="mine">${c.code}</span> · мир № ${esc(c.world)} — ${esc(c.hint)} ${g.inGame ? (mineIds.has(c.id) ? '<span style="color:var(--dim)">(у меня тоже)</span>' : '<span style="color:var(--warn)">(у меня — ещё нет)</span>') : ''}</div>`).join('') : '<div class="empty">Пока нет.</div>'}
    </div>`;
  }

  bindCodes(el, rerender) {
    const g = this.game;
    const inp = $('#code-in', el);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    $('#code-add', el).addEventListener('click', () => {
      const r = parseCode(inp.value);
      const msg = $('#code-msg', el);
      if (!r.ok) {
        msg.textContent = r.error;
        msg.style.color = 'var(--warn)';
        return;
      }
      if (!g.profile.foreignCodes.some((c) => c.code === r.code)) {
        g.profile.foreignCodes.push({ code: r.code, id: r.id, hint: r.hint, world: r.world });
        g.saveProfile();
      }
      rerender();
    });
  }

  showCodesScreen(back) {
    const html = `<div class="panel"><header>Коды открытий<button class="x" data-close>×</button></header><div class="body">${this.codesHTML()}</div></div>`;
    const el = this.openModal('codes', html, back);
    this.bindCodes(el, () => this.showCodesScreen(back));
  }

  // ── терминал ──────────────────────────────────────────────────────────────
  openTerminal(title, screen) {
    const html = `<div class="term"><div class="title">${esc(title)}</div><div class="out" id="tout"></div><div class="opts" id="topts"></div></div>`;
    this.openModal('terminal', html);
    this.renderTerm(screen);
  }

  renderTerm(screen) {
    if (!screen) {
      this.termTyping = false;
      this.closeModal();
      return;
    }
    const out = $('#tout', this.el.modal);
    const opts = $('#topts', this.el.modal);
    if (!out) return;
    opts.innerHTML = '';
    out.textContent = '';
    const text = screen.body;
    let i = 0;
    this.termTyping = true;
    this.termSkip = false;
    const showOptions = () => {
      this.termTyping = false;
      out.innerHTML = esc(text) + '<span class="cursor"></span>';
      opts.innerHTML = screen.options.map((o, k) => `<button class="opt" data-i="${k}">${k + 1}. ${esc(o.label)}</button>`).join('');
      opts.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => this.termChoose(screen, +b.dataset.i)));
      this.termScreen = screen;
    };
    const step = () => {
      if (this.modal !== 'terminal') return;
      if (this.termSkip || i >= text.length) return showOptions();
      i = Math.min(text.length, i + 3);
      out.textContent = text.slice(0, i);
      if (i % 9 === 0) this.game.audio.play('type');
      setTimeout(step, 16);
    };
    step();
  }

  termChoose(screen, i) {
    const o = screen.options[i];
    if (!o) return;
    this.game.audio.play('beep');
    this.termScreen = null;
    let next = null;
    try {
      next = o.run();
    } catch (err) {
      console.error('[terminal]', err);
    }
    if (this.modal !== 'terminal') return; // финал мог закрыть окно
    this.renderTerm(next);
  }

  // ── кодовый замок ─────────────────────────────────────────────────────────
  openKeypad(label, len, onSubmit) {
    const html = `<div class="keypad"><div class="lbl">${esc(label)}</div><div class="disp" id="kd">${'_'.repeat(len)}</div><div class="grid">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
      <button data-n="C">C</button><button data-n="0">0</button><button data-n="OK">⏎</button></div>
      <div style="text-align:center;margin-top:12px"><button class="btn" data-close>Отойти [Esc]</button></div></div>`;
    const el = this.openModal('keypad', html);
    let val = '';
    const disp = $('#kd', el);
    const render = () => (disp.textContent = val.padEnd(len, '_'));
    this.keypadInput = (n) => {
      disp.classList.remove('err');
      if (n === 'C') val = '';
      else if (n === 'OK') {
        if (val.length < len) return;
        if (onSubmit(val)) {
          disp.textContent = 'ОТКРЫТО';
          this.keypadInput = null;
          setTimeout(() => this.modal === 'keypad' && this.closeModal(), 700);
          return;
        }
        disp.classList.add('err');
        disp.textContent = 'ОШИБКА';
        val = '';
        return;
      } else if (val.length < len) {
        val += n;
        this.game.audio.play('beep');
        if (val.length === len) {
          render();
          setTimeout(() => this.keypadInput && this.keypadInput('OK'), 250);
          return;
        }
      }
      render();
    };
    el.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => this.keypadInput && this.keypadInput(b.dataset.n)));
    this.onModalClose = () => (this.keypadInput = null);
  }

  // ── выбор (лифт) ──────────────────────────────────────────────────────────
  openChoice(title, options) {
    const html = `<div class="term" style="width:min(380px,92vw)"><div class="title">${esc(title)}</div><div class="opts" style="padding-top:16px">${options
      .map((o, i) => `<button class="opt" data-i="${i}">${i + 1}. ${esc(o.label)}</button>`)
      .join('')}<button class="opt" data-close>${options.length + 1}. Отмена</button></div></div>`;
    const el = this.openModal('choice', html);
    this.choiceOptions = options;
    el.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        const o = options[+b.dataset.i];
        this.closeModal();
        o.run();
      })
    );
  }

  // ── осмотр ────────────────────────────────────────────────────────────────
  showExamine(item) {
    const ex = this.el.examine;
    if (!item) return ex.classList.add('hidden');
    $('.t', ex).textContent = ITEMS[item].name;
    $('.d', ex).textContent = ITEMS[item].desc;
    ex.classList.remove('hidden');
  }

  // ── финал ─────────────────────────────────────────────────────────────────
  showEnding(data, stats, code) {
    const el = this.el.ending;
    el.innerHTML = `<div class="wrap"><h2>${esc(data.title)}</h2>${data.p.map((t, i) => `<p style="animation-delay:${0.8 + i * 1.6}s">${esc(t)}</p>`).join('')}
      <div class="stats" style="animation-delay:${1.5 + data.p.length * 1.6}s">${stats.map(esc).join('<br>')}<br><br>Код исхода: <span style="color:var(--accent);user-select:text">${esc(code || '')}</span><br><br><button class="btn" id="end-menu">В главное меню</button></div></div>`;
    el.classList.remove('hidden');
    this.showHUD(false);
    $('#end-menu', el).addEventListener('click', () => this.game.toMenu());
  }
}
