// PuzzleSystem — логика головоломок и механизмов:
//  1. Шкаф с делами (кодовый замок; код — время на остановившихся часах)
//  2. Щит питания (три предохранителя из разных мест + рубильник)
//  3. Нужный пролёт бесконечной лестницы (номер — из записей/звонка)
//  4. Шлюз ядра (две плиты: ящик + Копия из эхо-камеры)
//  + лифт, телефон

export class PuzzleSystem {
  constructor(game) {
    this.game = game;
    this.ride = null;
    game.bus.on('room:enter', (e) => {
      // телефон звонит, когда игрок входит в наблюдательную после включения питания
      if (e.id === 'observation' && game.world.get('power') && !game.mem.rule('two_versions').done) {
        game.world.set('phoneRinging', true);
      }
      if (e.id === 'lab' && game.mem.data.history.slice(-3).includes('stairs')) game.mem.solve('landing');
    });
    game.bus.on('portal:pass', (e) => {
      if (e.id === 'lab_in') game.mem.solve('landing');
    });
  }

  get w() {
    return this.game.world;
  }

  // 1 ─ кодовый замок
  cabinetCode(code) {
    const g = this.game;
    const s = g.story.secrets;
    if (code === s.code) {
      g.audio.play('beep_ok');
      g.world.setDoor('d_cabinet', { locked: false, open: true });
      g.mem.solve('cabinet');
      g.mem.observe('cabinet', 'Код от шкафа — время на часах в комнате пробуждения. Часы остановились, чтобы что-то запомнить?');
      return true;
    }
    g.audio.play('beep_err');
    g.mem.count('cabinet_fail');
    if (code === s.wrongCode) {
      g.mem.count('tried_wrong_code');
      g.story.trust(1, 'used_operator_code');
      g.mem.observe('wrong_code', 'Код Оператора не подошёл. Те же цифры, но в обратном порядке?');
    }
    return false;
  }

  // 2 ─ щит питания
  insertFuse(i) {
    const g = this.game;
    if (this.w.get(`fuse_${i}`)) return g.ui.hint('Предохранитель уже стоит.');
    const id = g.inv.firstWithTag('fuse');
    if (!id) return g.ui.hint('Пустое гнездо. Нужен предохранитель.');
    g.inv.remove(id);
    g.world.setItem(id, { where: 'gone' });
    this.w.set(`fuse_${i}`, id);
    g.audio.play('fuse');
    const n = [0, 1, 2].filter((k) => this.w.get(`fuse_${k}`)).length;
    if (n === 3) g.ui.hint('Все три гнезда заняты. Остался рубильник.');
  }

  pullLever() {
    const g = this.game;
    if (this.w.get('power')) return g.ui.hint('Рубильник включён. Гул стал ровнее.');
    g.audio.play('lever');
    const n = [0, 1, 2].filter((k) => this.w.get(`fuse_${k}`)).length;
    if (n < 3) {
      g.ui.hint(`Рубильник поднимается и падает обратно. Предохранителей: ${n}/3.`);
      return;
    }
    this.w.set('power', true);
    g.audio.play('power_on');
    g.mem.solve('power');
    g.mem.observe('power', 'Питание вернулось. Свет загорелся не везде — только там, где я уже был?');
    g.bus.emit('power:on');
    g.save('auto');
  }

  // Телефон — Правило 5
  phone() {
    const g = this.game;
    if (!this.w.get('phoneRinging')) return g.ui.hint('Трубка молчит. Даже гудков нет.');
    this.w.set('phoneRinging', false);
    g.audio.play('click');
    g.bus.emit('phone:answer', {});
  }

  // Лифт
  floors() {
    const list = [{ id: '0', label: '0 · Вестибюль' }, { id: '-1', label: '−1 · Лаборатория' }];
    if (this.w.get('floorVoid')) list.push({ id: 'V', label: 'Ø · ' });
    return list;
  }

  elevatorPanel() {
    const g = this.game;
    if (!this.w.get('power')) return g.ui.hint('Панель не горит. Нет питания.');
    if (this.ride) return;
    const cur = this.w.get('liftFloor', '0');
    g.ui.openChoice(
      'ЛИФТ',
      this.floors().map((f) => ({ label: f.label + (f.id === cur ? ' (здесь)' : ''), run: () => f.id !== cur && this.rideTo(f.id) }))
    );
  }

  callElevator(floor) {
    const g = this.game;
    if (!this.w.get('power')) return g.ui.hint('Кнопка вызова не горит.');
    if (this.ride) return g.ui.hint('Лифт в пути.');
    const cur = this.w.get('liftFloor', '0');
    if (cur === floor) {
      this.openAt(floor);
      return;
    }
    g.audio.play('beep');
    this.closeAll();
    this.ride = { t: 4, to: floor, carry: false };
  }

  rideTo(floor) {
    const g = this.game;
    this.closeAll();
    g.audio.play('beep');
    setTimeout(() => g.audio.play('elevator_move'), 700);
    this.ride = { t: 4.2, to: floor, carry: true, from: this.w.get('liftFloor', '0') };
    g.mem.seeEvent(`lift_${floor}`);
  }

  closeAll() {
    for (const cab of Object.values(this.game.level.cabs)) cab.isOpen = false;
  }

  openAt(floor) {
    const cab = this.game.level.cabs[floor];
    if (!cab) return;
    cab.isOpen = true;
    this.game.audio.play('ding', { x: cab.ox, y: 2.4, z: cab.oz });
  }

  update(dt) {
    const g = this.game;
    const level = g.level;
    if (!this.ride) {
      // двери открыты на текущем этаже, если есть питание
      const cur = this.w.get('liftFloor', '0');
      for (const [f, cab] of Object.entries(level.cabs)) if (f !== cur) cab.isOpen = false;
      if (this.w.get('power') && !level.cabs[cur].isOpen && !this._autoOpened) {
        this._autoOpened = true;
        level.cabs[cur].isOpen = true;
      }
      return;
    }
    this.ride.t -= dt;
    if (this.ride.t > 0) {
      if (this.ride.carry) {
        // лёгкая вибрация кабины
        g.player.roll = Math.sin(performance.now() / 40) * 0.002;
      }
      return;
    }
    const { to, carry, from } = this.ride;
    this.ride = null;
    g.player.roll = 0;
    if (carry) {
      const a = level.cabs[from];
      const b = level.cabs[to];
      const p = g.player.pos;
      const inCab = p.x > a.ox - 1.25 && p.x < a.ox + 1.25 && p.z > a.oz - 2.65 && p.z < a.oz;
      if (inCab) {
        p.x += b.ox - a.ox;
        p.z += b.oz - a.oz;
        g.player.applyCamera(0);
      }
    }
    this.w.set('liftFloor', to);
    level.syncElevator();
    this.openAt(to);
    if (to === 'V') g.mem.observe('void_floor', 'Лифт открылся на этаже, которого нет на схеме.');
  }
}
