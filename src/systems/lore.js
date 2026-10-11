// Лор: четыре VHS-кассеты. При находке — ролик прямо на движке игры:
// камера пролетает по комплексу, внизу — субтитры, кадр в рамке старой видеозаписи.
// Найденные кассеты можно пересмотреть из главного меню («Кассеты»).

import * as THREE from 'three';

export const TAPES = {
  1: {
    title: 'КАССЕТА 1 · ИНСТИТУТ',
    date: '12.10.1987',
    shots: [
      { from: [-14, 9, -31], to: [-6, 8.2, -29], look: [0, -0.5, -16], lookTo: [3, 0, -12], lines: ['1987 год. Институт прикладной мнемоники получает резервуар,', 'которого нет ни на одной карте.'] },
      { from: [-33.5, 2.2, -3], to: [-37, 2.0, -13], look: [-41, 1.4, -9], lines: ['Проект МНЕМА: машина, которая помнит людей лучше, чем они сами.'] },
      { from: [0, 1.7, -1], to: [0, 1.9, 2.5], look: [2, 0.8, 5], lines: ['Первый испытуемый вошёл в Сектор 0 добровольно.', 'Номер ему так и не присвоили.'] },
      { from: [-12, 1.7, -1.8], to: [8, 1.7, -1.8], look: [14, 1.2, -6], lines: ['На сорок второй день здание начало меняться.'] },
    ],
  },
  2: {
    title: 'КАССЕТА 2 · ЗАТОПЛЕНИЕ',
    date: '03.11.1987',
    shots: [
      { from: [24, -6.4, -15], to: [42, -6.8, -15], look: [60, -8, -15], lines: ['Когда МНЕМА впервые «вспомнила» человека целиком, отказали насосы.'] },
      { from: [60, -7.4, -15], to: [82, -7.6, -14.8], look: [95, -8.5, -15], lines: ['Нижний ярус затопило за одну ночь. Шестеро остались внизу.'] },
      { from: [92, -5.5, -23], to: [101, -5.8, -19], look: [97, -7.5, -9], lines: ['Их не нашли. Иногда в воде видно лица.', 'Громов говорит — отражения. Громов не говорит, чьи.'] },
    ],
  },
  3: {
    title: 'КАССЕТА 3 · ОПЕРАТОР',
    date: '27.12.1987',
    shots: [
      { from: [78, 2.4, 4.5], to: [75, 3.4, -4], look: [71, 2.6, 0], lines: ['Оператор — не человек. Это голос МНЕМЫ,', 'собранный из голосов персонала.'] },
      { from: [95, 1.7, 4.5], to: [104, 1.8, -4], look: [100, 1, 0], lines: ['Он говорит «доброе утро» каждому, кто просыпается в палате.'] },
      { from: [107, 1.6, 1.2], to: [112, 1.7, -5], look: [113, 1, -2], lines: ['Он не знает, сколько раз уже говорил это.', 'Мы тоже.'] },
    ],
  },
  4: {
    title: 'КАССЕТА 4 · ИСПЫТУЕМЫЙ 0',
    date: '??.??.????',
    monster: [0, 0, -46],
    shots: [
      { from: [-2.5, 2.3, 6.9], to: [2.2, 2.4, 6.6], look: [0, 0.6, 2], lines: ['Существо появилось после третьего пробуждения испытуемого.'] },
      { from: [0, 1.7, -1.5], to: [0, 1.6, -10.5], look: [0, 0.5, -16], lines: ['Оно выше человека. Оно повторяет его привычки.', 'Оно ходит там, где он ходил чаще всего.'] },
      { from: [10.5, 6, -60], to: [10.5, 5.6, -52], look: [0, 1.2, -46], lines: ['Ланская считает: это не чудовище.', 'Это то, что здание помнит о нас, когда нас нет.'] },
      { from: [0, 1.8, -40], to: [0, 1.75, -42.6], look: [0, 2.0, -46], lines: ['Испытуемый 0 — это ты.'] },
    ],
  },
};

const LINE_TIME = 3.4;

export class LoreSystem {
  constructor(game) {
    this.game = game;
    this.play = this.play.bind(this);
    this.cur = null;
    game.bus.on('item:pickup', (e) => {
      const m = /^tape(\d)$/.exec(e.id);
      if (m) setTimeout(() => this.play(+m[1]), 500);
    });
  }

  get active() {
    return !!this.cur;
  }

  play(n) {
    const g = this.game;
    const tape = TAPES[n];
    if (!tape || this.cur) return;
    const shots = tape.shots.map((s) => ({ ...s, dur: Math.max(4, s.lines.length * LINE_TIME + 0.8) }));
    this.cur = { n, tape, shots, i: 0, t: 0, prevState: g.state, prevFlash: g.flashlightOn };
    if (g.state === 'playing') g.player.keys.clear();
    g.state = 'cinematic';
    g.flashlightOn = false;
    document.exitPointerLock && document.exitPointerLock();
    g.ui.showTape(tape.title, tape.date);
    g.audio.play('tape_in');
    g.audio.setChase(0);
    if (tape.monster && g.monster) {
      this.savedMonster = { pos: g.monster.pos.clone(), visible: g.monster.mesh.visible, yaw: g.monster.yaw };
      g.monster.mesh.visible = true;
      g.monster.mesh.position.set(...tape.monster);
      g.monster.mesh.rotation.y = 0;
    }
    this.showLines();
    if (!g.profile.tapes.includes(n)) {
      g.profile.tapes.push(n);
      g.saveProfile();
    }
    g.mem.seeEvent(`tape_${n}`);
  }

  showLines() {
    const c = this.cur;
    const s = c.shots[c.i];
    this.game.ui.tapeLines(s.lines);
  }

  update(dt) {
    const c = this.cur;
    if (!c) return;
    const g = this.game;
    c.t += dt;
    let s = c.shots[c.i];
    if (c.t >= s.dur) {
      c.i += 1;
      c.t = 0;
      if (c.i >= c.shots.length) return this.finish();
      s = c.shots[c.i];
      this.showLines();
      g.audio.play('tape_glitch');
      g.fx.distort(0.5);
    }
    const k = c.t / s.dur;
    const e = k * k * (3 - 2 * k);
    const cam = g.camera;
    cam.position.set(s.from[0] + (s.to[0] - s.from[0]) * e, s.from[1] + (s.to[1] - s.from[1]) * e, s.from[2] + (s.to[2] - s.from[2]) * e);
    const lt = s.lookTo || s.look;
    this._look = this._look || new THREE.Vector3();
    this._look.set(s.look[0] + (lt[0] - s.look[0]) * e, s.look[1] + (lt[1] - s.look[1]) * e, s.look[2] + (lt[2] - s.look[2]) * e);
    cam.lookAt(this._look);
    cam.rotation.z += Math.sin(g.time * 0.7) * 0.004;
    g.level.cull(cam.position);
    const cz = g.builder.zoneAt(cam.position.x, cam.position.y, cam.position.z);
    if (cz && g.lightPool.zoneId !== cz.id) {
      g.lightPool.zoneId = cz.id;
      g.lightPool.timer = 0;
    }
    g.lightPool.update(dt, cam.position, g.time);
    g.level.update(dt * 0.5, g.time);
    if (g.dust) g.dust.update(dt, cam.position, g.time);
    g.audio.updateListener(cam);
    g.fear = 0.12;
    if (g.monster && c.tape.monster) g.monster.c.mixer.update(dt);
  }

  skip() {
    if (this.cur) this.finish();
  }

  finish() {
    const g = this.game;
    const c = this.cur;
    this.cur = null;
    g.ui.hideTape();
    g.audio.play('tape_out');
    if (this.savedMonster && g.monster) {
      g.monster.mesh.visible = this.savedMonster.visible;
      g.monster.pos.copy(this.savedMonster.pos);
      this.savedMonster = null;
    }
    g.flashlightOn = c.prevFlash;
    g.state = c.prevState;
    if (g.state === 'menu') {
      g.ui.showMenu();
      return;
    }
    g.player.applyCamera(0.016);
    g.paused = !!g.ui.modal;
    g.lockPointer();
    g.mem.observe(`tape_${c.n}`, `Кассета ${c.n}: «${c.tape.title.split('· ')[1]}». Запись можно пересмотреть в главном меню.`);
  }
}
