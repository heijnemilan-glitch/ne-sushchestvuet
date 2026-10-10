// Уровень «Сектор 0» — весь комплекс, его объекты, порталы и реакция на состояние мира.
//
// Невозможная архитектура реализована честными средствами:
//  • «Порталы» — бесшовный перенос игрока между двумя одинаковыми тамбурами (за пластиковой шторкой).
//    Комната 0-7 физически стоит в 60 м от двери, но за дверью оказывается сразу.
//  • Бесконечная лестница — два одинаковых пролёта; при спуске игрока незаметно поднимают на пролёт выше,
//    а табличка этажа меняется.
//  • Лифт — три одинаковые кабины в разных частях карты.
//  • На карте журнала комнаты рисуются там, где они «должны» быть, — и накладываются друг на друга.

import * as THREE from 'three';
import { Door, Pickup, Readable, Inspect, Button, Plate, Crate } from './objects.js';
import { Props, itemModel } from './props.js';
import { textTexture, updateTextTexture } from '../render/materials.js';
import { ITEMS } from '../systems/inventory.js';
import { worldSecrets } from '../systems/story.js';
import { Horror } from './horror.js';

const L0 = { level: '0' };

export class Level {
  constructor(game) {
    this.game = game;
    this.b = game.builder;
    this.m = game.mats;
    this.p = new Props(this.b, this.m);
    this.doors = {};
    this.pickups = {};
    this.objects = [];
    this.plates = [];
    this.crates = [];
    this.portals = [];
    this.curtains = [];
    this.plugs = [];
    this.emitterDefs = [];
    this.observerAnchors = [];
    this.shiftables = {};
    this.screens = [];
    this.time = 0;
    this.secrets = worldSecrets(game.mem.seed);
    this.passBand = null;
    this.fixtures = [];

    this.buildZones();
    this.buildStart();
    this.buildCorridors();
    this.buildArchive();
    this.buildGenerator();
    this.buildHall();
    this.buildObservation();
    this.buildStairs();
    this.buildRoom07();
    this.buildReflection();
    this.buildLab();
    this.buildCore();
    this.buildVoid();
    this.buildElevator();
    this.horror = new Horror(this);
    this.b.finalize();

    this.subscribe();
    this.syncAll();
  }

  // ── вспомогательные ───────────────────────────────────────────────────────
  add(obj) {
    this.objects.push(obj);
    this.game.interaction.add(obj);
    return obj;
  }

  door(o) {
    const d = new Door(this.game, o);
    this.doors[o.id] = d;
    return this.add(d);
  }

  pickup(item, x, y, z, zone, extra = {}) {
    const mesh = itemModel(ITEMS[item].model, this.m);
    mesh.position.set(x, y, z);
    if (extra.ry) mesh.rotation.y = extra.ry;
    // невидимая «область захвата», чтобы мелкие предметы было легко навести
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.04;
    mesh.add(hit);
    const p = new Pickup(this.game, { item, mesh, x, y, z, zone, ...extra });
    this.pickups[item] = p;
    return this.add(p);
  }

  paper(note, x, y, z, zone, { ry = 0, wall = false, when } = {}) {
    let mesh;
    if (wall) {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), this.m.paper);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
    } else {
      mesh = itemModel('note', this.m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
    }
    return this.add(new Readable(this.game, { note, mesh, zone, when }));
  }

  button(o) {
    return this.add(new Button(this.game, o));
  }

  inspect(o) {
    return this.add(new Inspect(this.game, o));
  }

  // Пластиковая шторка из полос. axis — вдоль какой оси тянется шторка.
  curtain(axis, line, a0, a1, y1, zone, opts = {}) {
    const g = new THREE.Group();
    const n = Math.round((a1 - a0) / 0.22);
    const w = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.12, y1 - (opts.y0 || 0) - 0.05), this.m.curtain);
      const pivot = new THREE.Group();
      const a = a0 + w * (i + 0.5);
      if (axis === 'x') pivot.position.set(a, y1, line);
      else {
        pivot.position.set(line, y1, a);
        strip.rotation.y = Math.PI / 2;
      }
      strip.position.y = -(y1 - (opts.y0 || 0)) / 2;
      pivot.add(strip);
      pivot.userData.phase = i * 0.7 + line;
      g.add(pivot);
    }
    this.b.groupOf(zone).add(g);
    const c = { group: g, axis, amp: opts.amp ?? 0.03, id: opts.id };
    this.curtains.push(c);
    return c;
  }

  // Ложная дверь в конце тамбура (никуда не ведёт).
  fakeDoor(axis, x, z, zone, y = 0) {
    const w = 1;
    if (axis === 'x') {
      this.b.box(x - w / 2, y, z - 0.03, x + w / 2, y + 2.08, z + 0.03, 'door', { zone, collide: false });
      this.b.box(x - w / 2 - 0.08, y, z - 0.12, x - w / 2, y + 2.18, z + 0.12, 'metalDark', { zone, collide: false });
      this.b.box(x + w / 2, y, z - 0.12, x + w / 2 + 0.08, y + 2.18, z + 0.12, 'metalDark', { zone, collide: false });
      this.b.box(x - w / 2, y + 2.1, z - 0.12, x + w / 2, y + 2.18, z + 0.12, 'metalDark', { zone, collide: false });
    } else {
      this.b.box(x - 0.03, y, z - w / 2, x + 0.03, y + 2.08, z + w / 2, 'door', { zone, collide: false });
      this.b.box(x - 0.12, y, z - w / 2 - 0.08, x + 0.12, y + 2.18, z - w / 2, 'metalDark', { zone, collide: false });
      this.b.box(x - 0.12, y, z + w / 2, x + 0.12, y + 2.18, z + w / 2 + 0.08, 'metalDark', { zone, collide: false });
      this.b.box(x - 0.12, y + 2.1, z - w / 2, x + 0.12, y + 2.18, z + w / 2, 'metalDark', { zone, collide: false });
    }
  }

  // Заглушка проёма (стена), видимая, пока условие истинно.
  plug(b, mat, zone, when) {
    const mesh = this.b.box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, mat, { zone, merge: false });
    const pl = { mesh, collider: mesh.userData.collider, when };
    this.plugs.push(pl);
    return pl;
  }

  portal(id, b, d, active = () => true) {
    this.portals.push({ id, ...b, y0: b.y0 ?? -1, y1: b.y1 ?? 3, dx: d[0], dy: d[1], dz: d[2], active });
  }

  emitter(id, type, x, y, z, when = () => true, level = 1, range = 24) {
    this.emitterDefs.push({ id, type, pos: new THREE.Vector3(x, y, z), when, level, range });
  }

  // ── зоны ──────────────────────────────────────────────────────────────────
  buildZones() {
    const z = (id, name, b, o) => this.b.zone(id, name, b, o);
    z('start', 'Комната пробуждения', { x0: -3, x1: 3, z0: 0, z1: 7.5 }, { surface: 'lino', map: L0 });
    z('waiting', 'Комната ожидания', { x0: -7, x1: -3, z0: 1, z1: 5 }, { surface: 'lino', map: L0 });
    z('corridor', 'Главный коридор', { x0: -1.5, x1: 1.5, z0: -22, z1: 0 }, { surface: 'tile', map: L0 });
    z('vest07', 'Тамбур', { x0: -4.5, x1: -1.5, z0: -15.6, z1: -14.4 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('west', 'Западное крыло', { x0: -14, x1: -1.5, z0: -9.5, z1: -6.5 }, { surface: 'tile', map: L0, ambience: 'corridor' });
    z('vestW', 'Тамбур', { x0: -8.6, x1: -7.4, z0: -6.5, z1: -3.5 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('east', 'Восточное крыло', { x0: 1.5, x1: 14, z0: -9.5, z1: -6.5 }, { surface: 'tile', map: L0, ambience: 'corridor' });
    z('vestE', 'Тамбур', { x0: 7.4, x1: 8.6, z0: -12.5, z1: -9.5 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('archive', 'Архив', { x0: -24, x1: -14, z0: -14, z1: -2 }, { map: L0 });
    z('generator', 'Щитовая', { x0: 14, x1: 24, z0: -14, z1: -2 }, { surface: 'metal', map: L0 });
    z('hall', 'Вестибюль', { x0: -6, x1: 6, z0: -32, z1: -22 }, { surface: 'tile', map: L0 });
    z('lift0', 'Лифт', { x0: -1.2, x1: 1.2, z0: -34.6, z1: -32 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: L0 });
    z('observation', 'Наблюдательная', { x0: -16, x1: -6, z0: -32, z1: -22 }, { surface: 'carpet', map: L0 });
    z('glass', 'За стеклом', { x0: -26, x1: -16, z0: -32, z1: -22 }, { map: L0 });
    z('stairs', 'Лестница', { x0: 6, x1: 42, z0: -29, z1: -25, y0: -14, y1: 4 }, { map: L0 });
    z('stairsVest', 'Лестница', { x0: 15.9, x1: 17.1, z0: -31.6, z1: -29, y0: -4.5, y1: 0 }, { memoryId: 'stairs', ambience: 'stairs' });
    z('room07', 'Комната 0-7', { x0: -76.5, x1: -61.5, z0: -21, z1: -9, y1: 5 }, { map: { level: '0', x0: -16.5, x1: -4.5, z0: -21, z1: -9 } });
    z('reflection', 'Отражение', { x0: -63, x1: -57, z0: 32, z1: 41.5 }, { surface: 'lino', map: { level: '0', x0: -3, x1: 3, z0: -28, z1: -22 } });
    z('lab', 'Лаборатория', { x0: 94, x1: 106, z0: -6, z1: 8.6 }, { surface: 'tile', map: { level: '-1' } });
    z('lift1', 'Лифт', { x0: 98.8, x1: 101.2, z0: -8.6, z1: -6 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: '-1' } });
    z('echo', 'Эхо-камера', { x0: 106, x1: 114, z0: -6, z1: 2 }, { surface: 'carpet', map: { level: '-1' } });
    z('gate', 'Шлюз', { x0: 80, x1: 94, z0: -6, z1: 6, y1: 5 }, { map: { level: '-1' } });
    z('core', 'Ядро', { x0: 64, x1: 80, z0: -6, z1: 6, y1: 7 }, { map: { level: '-1' } });
    z('void', 'Этаж Ø', { x0: -10, x1: 10, z0: 100, z1: 120, y1: 6 }, { surface: 'void', fog: { color: 0xd4d7d3, density: 0.045 }, map: { level: 'Ø' } });
    z('liftV', 'Лифт', { x0: -1.2, x1: 1.2, z0: 97.4, z1: 100 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: 'Ø' } });
  }

  // ── КОМНАТА ПРОБУЖДЕНИЯ ───────────────────────────────────────────────────
  buildStart() {
    const { b, p, m } = this;
    const Z = 'start';
    b.box(-3, -0.2, 0, 3, 0, 7.5, 'lino', { zone: Z, collide: false });
    b.box(-3, 3, 0, 3, 3.2, 7.5, 'ceiling', { zone: Z, collide: false, cast: false });
    b.floor(-3, 0, 3, 7.5, 0, 'lino');
    b.wallX(0, -3, 3, 0, 3, 'paint', Z, [{ a: -0.5, b: 0.5 }]);
    b.wallZ(-3, 0, 7.5, 0, 3, 'paint', Z, [{ a: 2.5, b: 3.5 }]);
    b.wallZ(3, 0, 7.5, 0, 3, 'paint', Z);
    // подвижная южная стена (Правило 4: комната «удлиняется»)
    this.startWall = new THREE.Group();
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3, 0.2), m.paint);
    wallMesh.position.set(0, 1.5, 0);
    wallMesh.receiveShadow = true;
    // UV в метрах для этой отдельной стены
    const uv = wallMesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (6.2 / 3), uv.getY(i));
    this.startWall.add(wallMesh);
    b.groupOf(Z).add(this.startWall);
    this.startWallCol = b.addCollider({ x0: -3.1, x1: 3.1, y0: 0, y1: 3, z0: 5.9, z1: 6.1 });
    // часы на подвижной стене: остановились на секретном времени (код шкафа)
    const clockTex = textTexture(this.secrets.clock, { w: 256, h: 112, bg: '#0b0b0b', fg: '#ff4a2a', font: 'bold 76px Consolas, monospace' });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: clockTex }));
    clock.position.set(-1.2, 2.2, -0.11);
    clock.rotation.y = Math.PI;
    this.startWall.add(clock);
    this.inspect({ id: 'clock', mesh: clock, zone: Z, text: () => `Электронные часы. Стоят: ${this.secrets.clock}. Батарейка на месте. Они просто не идут.` });
    // вторые часы (появляются на 3-м этапе) — идут
    this.clock2Tex = textTexture('00:00', { w: 256, h: 112, bg: '#0b0b0b', fg: '#7aff9a', font: 'bold 76px Consolas, monospace' });
    this.clock2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: this.clock2Tex }));
    this.clock2.position.set(1.2, 2.2, -0.11);
    this.clock2.rotation.y = Math.PI;
    this.startWall.add(this.clock2);
    this.inspect({ id: 'clock2', mesh: this.clock2, zone: Z, when: () => this.clock2.visible, text: 'Вторые часы. Идут. Показывают, сколько я уже здесь.' });

    this.bedGroup = p.bed(2.3, 4.2, 0, Z);
    b.addCollider({ x0: 1.85, x1: 2.75, y0: 0, y1: 0.6, z0: 3.2, z1: 5.2 }, 'prop');
    this.bedCol = b.colliders[b.colliders.length - 1];
    const pillowNote = itemModel('note', m);
    pillowNote.position.set(0.1, 0.7, -0.55);
    pillowNote.scale.setScalar(0.7);
    this.bedGroup.add(pillowNote);
    this.add(new Readable(this.game, { note: 'n_start', mesh: pillowNote, zone: Z }));

    p.table(2.6, 1.2, 0.7, 1.6, Z);
    const t0 = p.terminal(2.65, 0.75, -Math.PI / 2, Z);
    this.button({ id: 't0', mesh: t0, zone: Z, prompt: 'Терминал', action: () => this.game.story.openTerminal('t0') });
    this.emitter('term0', 'buzz', 2.6, 1, 0.75, () => true, 0.5, 6);
    this.pickup('flashlight', 2.55, 0.77, 1.65, Z, { ry: 0.6 });
    p.chair(1.9, 1.2, -Math.PI / 2, Z);
    // фотография в рамке (её может перевернуть Наблюдатель)
    const photo = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.015), m.wood);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 }));
    pic.position.z = 0.009;
    photo.add(frame, pic);
    photo.position.set(2.8, 0.86, 0.6);
    photo.rotation.set(-0.15, -Math.PI / 2, 0);
    b.groupOf(Z).add(photo);
    this.shiftables.start_photo = { room: 'start', apply: () => photo.rotation.set(Math.PI / 2, -Math.PI / 2, 0), obj: photo };
    this.inspect({ id: 'photo', mesh: photo, zone: Z, text: () => (this.game.world.get('shift_start_photo') ? 'Фотография лежит лицом вниз. Я её не трогал.' : 'Фотография. Пустая комната. Эта комната. Снято с того места, где стоит кровать.') });

    this.paper('n_rules', -2.88, 1.6, 1.3, Z, { ry: Math.PI / 2, wall: true });
    p.fixture(0, 3, 3.2, Z, { mode: 'always', lo: 5, hi: 5, warm: true, color: 0xffe2c0, range: 8, flicker: 0.05 });

    // дверь в коридор
    this.door({ id: 'd_start', axis: 'x', x: 0, z: 0, zone: Z, sign: textTexture('0-0', { w: 128, h: 64, font: 'bold 34px Consolas' }) });

    // ── комната ожидания (появляется на 4-м этапе) ──
    const W = 'waiting';
    b.room({ x0: -7, x1: -3, z0: 1, z1: 5, zone: W, floor: 'lino', wall: 'paint', walls: { e: false }, surface: 'lino' });
    for (let i = 0; i < 4; i++) p.chair(-6.4 + i * 0.75, 1.55, Math.PI, W);
    p.table(-5, 4.2, 1.2, 0.6, W);
    this.pickup('fuse_d', -5.2, 0.77, 4.2, W, { ry: 0.3 });
    this.paper('n_waiting', -4.6, 0.77, 4.15, W, { ry: -0.2 });
    p.fixture(-5, 3, 3, W, { mode: 'always', lo: 2.5, hi: 2.5, flicker: 0.35 });
    this.door({
      id: 'd_waiting',
      axis: 'z',
      x: -3,
      z: 3,
      zone: Z,
      hidden: () => this.game.world.get('startStage', 0) < 4,
    });
    this.plug({ x0: -3.1, x1: -2.9, y0: 0, y1: 2.2, z0: 2.5, z1: 3.5 }, 'paint', Z, () => this.game.world.get('startStage', 0) < 4);
    this.emitter('secret_waiting', 'secret', -3, 1.2, 3, () => this.game.world.get('startStage', 0) < 4, 1, 10);

    this.observerAnchors.push({ x: 0, y: 0, z: -0.8, zone: 'corridor' });
  }

  // ── КОРИДОРЫ ──────────────────────────────────────────────────────────────
  buildCorridors() {
    const { b, p } = this;
    const C = 'corridor';
    b.room({
      x0: -1.5, x1: 1.5, z0: -22, z1: 0, zone: C, floor: 'tiles', wall: 'concrete', surface: 'tile',
      walls: { n: false, s: false, w: [{ a: -9.5, b: -6.5, top: 3 }, { a: -15.5, b: -14.5 }], e: [{ a: -9.5, b: -6.5, top: 3 }] },
    });
    [-3, -8, -13.5, -18].forEach((z, i) => p.fixture(0, 3, z, C, { lo: 1.6, hi: 5, flicker: i === 2 ? 0.25 : 0.04 }));
    this.emitter('lamp_c', 'lamp', 0, 2.8, -13.5, () => true, 0.6, 8);

    // указатели на развилке
    p.sign(['← ЩИТОВАЯ    АРХИВ →'], 0, 2.6, -5.6, Math.PI, C, { w: 1.6, h: 0.22, tw: 512, th: 64 });
    this.junctionSign = p.sign(['← АРХИВ    ЩИТОВАЯ →'], 0, 2.6, -5.62, 0, C, { w: 1.6, h: 0.22, tw: 512, th: 64 });
    this.shiftables.corridor_sign = {
      room: 'corridor',
      apply: () => updateTextTexture(this.junctionSign.userData.tex, ['← ЩИТОВАЯ    АРХИВ →']),
    };
    p.sign(['ВЕСТИБЮЛЬ ↑  ЛИФТ'], 1.39, 2.2, -17, -Math.PI / 2, C, { w: 1.0, h: 0.2, tw: 384, th: 64 });
    // счётчики-царапины на стенах развилки (подсказка Правила 6)
    this.tallyL = p.sign([''], -1.39, 1.3, -10.3, Math.PI / 2, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
    this.tallyR = p.sign([''], 1.39, 1.3, -10.3, -Math.PI / 2, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
    this.inspect({ id: 'tally', mesh: this.tallyL, zone: C, text: 'Царапины на штукатурке, сгруппированные по пять. Свежие.' });
    this.inspect({ id: 'tally_r', mesh: this.tallyR, zone: C, text: 'Царапины. Их число как будто меняется.' });

    // ДВЕРЬ 0-7 (Правило 1)
    this.door({
      id: 'd_07',
      axis: 'z',
      x: -1.5,
      z: -15,
      zone: C,
      locked: true,
      lamp: true,
      lampSide: 1,
      mat: 'doorRed',
      sign: textTexture('0-7', { w: 128, h: 64, font: 'bold 34px Consolas' }),
      lockText: 'Заперто. За дверью — тишина. Слишком ровная тишина.',
    });
    this.emitter('secret_07', 'secret', -1.7, 1.2, -15, () => !this.game.mem.rule('three_passes').done, 1, 10);
    this.passBand = { z0: -17.2, z1: -12.8, side: null };

    // тамбур за 0-7
    const V = 'vest07';
    b.room({ x0: -4.5, x1: -1.5, z0: -15.6, z1: -14.4, h: 2.6, zone: V, floor: 'concreteDark', wall: 'concreteDark', walls: { e: false } });
    this.curtain('z', -3, -15.6, -14.4, 2.6, V);
    this.portal('room07', { x0: -4.5, x1: -3.02, z0: -15.6, z1: -14.4 }, [-60, 0, 0]);

    // шторка-шлюз в конце главного коридора (Правило 9)
    this.wornCurtain = this.curtain('x', -20, -1.5, 1.5, 3, C, { id: 'worn' });
    this.portal('reflection', { x0: -1.5, x1: 1.5, z0: -21.4, z1: -20.05 }, [-60, 0, 60], () => !!this.game.world.get('reflectionPortal'));
    this.emitter('secret_worn', 'secret', 0, 2.5, -20, () => !this.game.mem.rule('worn_path').done && this.game.mem.rule('worn_path').progress > 0.6, 0.6, 9);

    // западное крыло
    const WW = 'west';
    b.room({ x0: -14, x1: -1.5, z0: -9.5, z1: -6.5, zone: WW, floor: 'tiles', surface: 'tile', walls: { e: false, w: [{ a: -8.5, b: -7.5 }], s: [{ a: -8.5, b: -7.5 }] } });
    [-5, -11].forEach((x) => p.fixture(x, 3, -8, WW, { lo: 1.4, hi: 4.5 }));
    this.westPoster = p.sign(['СЕКТОР 0', '', 'ВЫ ЗДЕСЬ  ●'], -5, 1.6, -9.38, 0, WW, { w: 0.7, h: 0.9, bg: '#c8c4b4', fg: '#2a2a2a', tw: 256, th: 320 });
    this.inspect({ id: 'poster', mesh: this.westPoster, zone: WW, text: () => (this.game.world.get('shift_west_poster') ? 'План эвакуации. Точка «Вы здесь» теперь стоит за дверью 0-7.' : 'План эвакуации. Точка «Вы здесь». Коридоров на плане меньше, чем я прошёл.') });
    this.shiftables.west_poster = { room: 'west', apply: () => updateTextTexture(this.westPoster.userData.tex, ['СЕКТОР 0', '', 'ВЫ ЗДЕСЬ  ● 0-7']) };
    this.observerAnchors.push({ x: -13.2, y: 0, z: -8, zone: WW });

    // восточное крыло
    const EE = 'east';
    b.room({ x0: 1.5, x1: 14, z0: -9.5, z1: -6.5, zone: EE, floor: 'tiles', surface: 'tile', walls: { w: false, e: [{ a: -8.5, b: -7.5 }], n: [{ a: 7.5, b: 8.5 }] } });
    [5, 11].forEach((x) => p.fixture(x, 3, -8, EE, { lo: 1.4, hi: 4.5, flicker: x === 11 ? 0.3 : 0 }));
    p.pipe(1.5, 2.7, -9.2, 14, -9.2, 0.07, EE);
    p.pipe(1.5, 2.85, -9.25, 14, -9.25, 0.05, EE, 'metalDark');
    this.observerAnchors.push({ x: 13.2, y: 0, z: -8, zone: EE });

    // ДВЕРЬ-ПЕТЛЯ (Правило 6): из западного крыла — в восточное
    const hiddenLoop = () => !this.game.world.get('loopDoor');
    this.door({ id: 'd_loop', axis: 'x', x: -8, z: -6.5, zone: WW, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop_e', { open }), sign: textTexture('В-В', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
    this.door({ id: 'd_loop_e', axis: 'x', x: 8, z: -9.5, zone: EE, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop', { open }), sign: textTexture('З-З', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
    this.plug({ x0: -8.5, x1: -7.5, y0: 0, y1: 2.2, z0: -6.6, z1: -6.4 }, 'concrete', WW, hiddenLoop);
    this.plug({ x0: 7.5, x1: 8.5, y0: 0, y1: 2.2, z0: -9.6, z1: -9.4 }, 'concrete', EE, hiddenLoop);
    this.emitter('secret_loop', 'secret', -8, 1.2, -6.6, hiddenLoop, 0.7, 9);
    b.room({ x0: -8.6, x1: -7.4, z0: -6.5, z1: -3.5, h: 2.4, zone: 'vestW', floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
    this.curtain('x', -5, -8.6, -7.4, 2.4, 'vestW');
    b.room({ x0: 7.4, x1: 8.6, z0: -12.5, z1: -9.5, h: 2.4, zone: 'vestE', floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
    this.curtain('x', -11, 7.4, 8.6, 2.4, 'vestE');
    this.portal('loop', { x0: -8.6, x1: -7.4, z0: -4.98, z1: -3.5 }, [16, 0, -6]);
    this.portal('loop', { x0: 7.4, x1: 8.6, z0: -12.5, z1: -11.02 }, [-16, 0, 6]);
  }

  // ── АРХИВ ─────────────────────────────────────────────────────────────────
  buildArchive() {
    const { b, p, m } = this;
    const A = 'archive';
    b.room({ x0: -24, x1: -14, z0: -14, z1: -2, h: 3.4, zone: A, floor: 'concreteDark', wall: 'paint', walls: { e: [{ a: -8.5, b: -7.5 }] } });
    this.door({ id: 'd_archive', axis: 'z', x: -14, z: -8, zone: A, sign: textTexture('АРХИВ', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
    p.shelf(-23.6, -13.5, -2.6, A, { h: 2.6 });
    p.shelf(-20.6, -12.6, -9.2, A, { h: 2.2, d: 0.9 });
    p.shelf(-20.6, -6, -2.8, A, { h: 2.2, d: 0.9 });
    p.fixture(-19, 3.4, -5, A, { lo: 1.1, hi: 4.5 });
    p.fixture(-19, 3.4, -11, A, { lo: 1.1, hi: 4.5, flicker: 0.15 });

    // читальный стол
    p.table(-16.6, -4.4, 1.6, 0.9, A);
    const chair = p.chair(-16.6, -3.6, 0, A);
    this.shiftables.archive_chair = {
      room: 'archive',
      apply: () => {
        chair.position.set(-18.8, 0, -7.8);
        chair.rotation.y = -Math.PI / 2;
      },
    };
    const lampG = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.y = 0.38;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), m.metal);
    stem.position.y = 0.17;
    lampG.add(shade, stem);
    lampG.position.set(-17.2, 0.76, -4.7);
    b.groupOf(A).add(lampG);
    b.light({ x: -17.2, y: 1.05, z: -4.6, color: 0xffd8a0, mode: 'always', lo: 2.2, hi: 2.2, range: 4.5, zone: A, phase: 1 });
    this.pickup('fork', -16.2, 0.77, -4.3, A, { ry: 0.4 });
    this.paper('n_route', -16.9, 0.77, -4.5, A, { ry: -0.3 });
    p.table(-22.6, -7.7, 0.7, 0.7, A);
    this.paper('n_lanskaya1', -22.6, 0.77, -7.7, A, { ry: 0.5 });

    // терминал архива
    p.table(-18, -2.5, 1.2, 0.7, A);
    const t2 = p.terminal(-18, -2.6, Math.PI, A);
    this.button({ id: 't2', mesh: t2, zone: A, prompt: 'Терминал', action: () => this.game.story.openTerminal('t2') });
    this.terminalArchive = t2;
    this.emitter('term2', 'buzz', -18, 1, -2.6, () => true, 0.5, 6);

    // каталожный шкаф (осмотр)
    const cat = p.cabinet(-15, -13.5, 0, A, { w: 1, h: 1.3, d: 0.6 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const dr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), m.wood);
      dr.position.set(-0.36 + c * 0.24, 0.2 + r * 0.28, 0.31);
      cat.add(dr);
    }
    b.addCollider({ x0: -15.5, x1: -14.5, y0: 0, y1: 1.3, z0: -13.8, z1: -13.2 }, 'prop');
    this.inspect({ id: 'catalog', mesh: cat, zone: A, text: 'Каталожный шкаф. Ящики подписаны датами. Все даты — один и тот же день.' });

    // шкаф с делами — кодовый замок (Головоломка 1)
    const cx = -18;
    const cz0 = -14;
    const cz1 = -13.35;
    b.box(cx - 0.6, 0, cz0, cx + 0.6, 1.9, cz0 + 0.05, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 0, cz0, cx - 0.55, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx + 0.55, 0, cz0, cx + 0.6, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 1.85, cz0, cx + 0.6, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 0, cz0, cx + 0.6, 0.05, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.55, 0.92, cz0, cx + 0.55, 0.95, cz1, 'metal', { zone: A, collide: false });
    b.addCollider({ x0: cx - 0.6, x1: cx + 0.6, y0: 0, y1: 1.9, z0: cz0, z1: cz1 - 0.05 }, 'prop');
    this.door({ id: 'd_cabinet', axis: 'x', x: cx, z: cz1, w: 1.1, h: 1.85, zone: A, locked: true, mat: 'metal', lockText: 'Шкаф заперт. Рядом — кодовая панель.' });
    this.pickup('fuse_b', cx - 0.25, 0.96, -13.7, A);
    this.pickup('keycard', cx + 0.2, 0.96, -13.7, A, { ry: 0.3 });
    this.paper('n_file0', cx, 0.06, -13.7, A, { ry: 0.1 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), m.plastic);
    pad.position.set(cx + 0.85, 1.3, -13.87);
    const padScr = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), m.lampGreen);
    padScr.position.set(0, 0.07, 0.021);
    pad.add(padScr);
    b.groupOf(A).add(pad);
    p.sign(['ВРЕМЯ ОСТАНОВКИ'], cx + 0.85, 1.6, -13.89, 0, A, { w: 0.3, h: 0.06, tw: 256, th: 48 });
    this.button({
      id: 'keypad',
      mesh: pad,
      zone: A,
      prompt: () => (this.game.mem.solved('cabinet') ? 'Кодовая панель (открыто)' : 'Ввести код'),
      action: () => {
        if (this.game.mem.solved('cabinet')) return;
        this.game.ui.openKeypad('ШКАФ В-0 · ВРЕМЯ ОСТАНОВКИ', 4, (code) => this.game.puzzles.cabinetCode(code));
      },
    });
    this.observerAnchors.push({ x: -23, y: 0, z: -9, zone: A });
  }

  // ── ЩИТОВАЯ ───────────────────────────────────────────────────────────────
  buildGenerator() {
    const { b, p, m } = this;
    const G = 'generator';
    b.room({ x0: 14, x1: 24, z0: -14, z1: -2, h: 3.6, zone: G, floor: 'concreteDark', wall: 'concrete', surface: 'metal', walls: { w: [{ a: -8.5, b: -7.5 }] } });
    this.door({ id: 'd_generator', axis: 'z', x: 14, z: -8, zone: G, sign: textTexture('ЩИТОВАЯ', { w: 128, h: 64, font: 'bold 24px Consolas' }) });
    // генератор
    b.box(20.6, 0, -7.2, 23.6, 1.8, -3.2, 'metalDark', { zone: G });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.6, 20), m.metal);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(22.1, 2.3, -5.2);
    b.groupOf(G).add(cyl);
    for (let i = 0; i < 6; i++) b.box(20.5, 0.3 + i * 0.25, -7.25, 20.6, 0.4 + i * 0.25, -3.15, 'dark', { zone: G, collide: false });
    this.emitter('gen_machine', 'machine', 22, 1, -5.2, () => true, 1, 22);
    for (let i = 0; i < 4; i++) p.pipe(14, 3.2 - i * 0.12, -13.6 + i * 0.25, 24, -13.6 + i * 0.25, 0.06, G, i % 2 ? 'metal' : 'metalDark');
    p.fixture(17, 3.6, -6, G, { lo: 1.2, hi: 5, flicker: 0.4 });
    p.fixture(21, 3.6, -10.5, G, { lo: 1.2, hi: 5 });
    p.wallLamp(14.25, 2.6, -11, G, { color: 0xff2a1a, lo: 1.6, hi: 0.4, mode: 'mixedInv', range: 6 });

    // щит на три предохранителя (Головоломка 2)
    b.box(16.8, 0.9, -14, 20.2, 2.1, -13.82, 'metalDark', { zone: G, collide: false });
    p.sign(['ЩИТ ПИТАНИЯ СЕКТОРА 0', 'Щ-1    Щ-2    Щ-3'], 18.5, 2.3, -13.89, 0, G, { w: 1.4, h: 0.26, tw: 512, th: 96 });
    this.fuseVisuals = [];
    this.fuseLamps = [];
    [17.5, 18.5, 19.5].forEach((x, i) => {
      const sock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.08), m.dark);
      sock.position.set(x, 1.45, -13.78);
      b.groupOf(G).add(sock);
      const fuse = itemModel('fuse', m);
      fuse.rotation.z = Math.PI / 2;
      fuse.position.set(x, 1.45, -13.72);
      fuse.visible = false;
      b.groupOf(G).add(fuse);
      this.fuseVisuals.push(fuse);
      const lampMat = m.lampRed.clone();
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), lampMat);
      lamp.position.set(x, 1.75, -13.78);
      b.groupOf(G).add(lamp);
      this.fuseLamps.push(lampMat);
      this.button({
        id: `fuse_slot_${i}`,
        mesh: sock,
        zone: G,
        prompt: () => (this.game.world.get(`fuse_${i}`) ? 'Предохранитель на месте' : this.game.inv.hasTag('fuse') ? 'Вставить предохранитель' : 'Пустое гнездо'),
        action: () => this.game.puzzles.insertFuse(i),
      });
    });
    // рубильник
    const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.12), m.metalDark);
    leverBase.position.set(21.3, 1.4, -13.85);
    b.groupOf(G).add(leverBase);
    this.leverArm = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), m.metal);
    arm.position.y = 0.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m.doorRed);
    knob.position.y = 0.42;
    this.leverArm.add(arm, knob);
    this.leverArm.position.set(21.3, 1.4, -13.72);
    this.leverArm.rotation.x = 0.9;
    b.groupOf(G).add(this.leverArm);
    this.button({
      id: 'lever',
      mesh: leverBase,
      zone: G,
      prompt: () => (this.game.world.get('power') ? 'Рубильник включён' : 'Включить рубильник'),
      action: () => this.game.puzzles.pullLever(),
    });
    this.add(new Button(this.game, { id: 'lever_arm', mesh: this.leverArm, zone: G, prompt: () => (this.game.world.get('power') ? 'Рубильник включён' : 'Включить рубильник'), action: () => this.game.puzzles.pullLever() }));

    p.shelf(14.5, -13.4, -11.2, G, { h: 2.1, books: false });
    this.pickup('fuse_a', 14.5, 1.16, -12.4, G, { ry: 1.2 });
    b.box(14.35, 0.62, -11.9, 14.7, 0.9, -11.5, 'plastic', { zone: G, collide: false });
    p.table(16.2, -3, 1.2, 0.6, G);
    p.chair(16.2, -3.7, Math.PI, G);
    this.paper('n_generator', 16.0, 0.77, -3.05, G, { ry: 0.2 });
    // ведро (сдвигается Наблюдателем)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.6, side: THREE.DoubleSide }));
    bucket.position.set(23, 0.15, -12.8);
    b.groupOf(G).add(bucket);
    this.shiftables.gen_bucket = { room: 'generator', apply: () => bucket.position.set(18.5, 0.15, -13.3) };
    this.observerAnchors.push({ x: 23, y: 0, z: -12.5, zone: G });
  }

  // ── ВЕСТИБЮЛЬ ─────────────────────────────────────────────────────────────
  buildHall() {
    const { b, p, m } = this;
    const H = 'hall';
    b.room({
      x0: -6, x1: 6, z0: -32, z1: -22, h: 4, zone: H, floor: 'tiles', wall: 'concrete', surface: 'tile',
      walls: { s: [{ a: -1.5, b: 1.5, top: 3 }], n: [{ a: -1, b: 1, top: 2.4 }], w: [{ a: -27.5, b: -26.5 }], e: [{ a: -27.5, b: -26.5 }] },
    });
    for (const x of [-3.5, 3.5]) for (const z of [-25, -29.5]) b.box(x - 0.25, 0, z - 0.25, x + 0.25, 4, z + 0.25, 'concrete', { zone: H });
    [-3, 3].forEach((x) => [-24.5, -29.5].forEach((z) => p.fixture(x, 4, z, H, { lo: 1.3, hi: 6, range: 10 })));
    this.door({ id: 'd_obs', axis: 'z', x: -6, z: -27, zone: H, locked: true, requires: 'keycard', lockText: 'Считыватель пропусков мигает красным. Нужен пропуск.', sign: textTexture('НАБЛ.', { w: 128, h: 64, font: 'bold 30px Consolas' }) });
    this.door({ id: 'd_stairs', axis: 'z', x: 6, z: -27, zone: H, sign: textTexture('ЛЕСТН.', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
    p.sign(['НАБЛЮДАТЕЛЬНЫЙ ПОСТ'], -5.88, 2.5, -27, Math.PI / 2, H, { w: 1.2, h: 0.18, tw: 512, th: 64 });
    p.sign(['ЛЕСТНИЦА ↓'], 5.88, 2.5, -27, -Math.PI / 2, H, { w: 0.9, h: 0.18, tw: 384, th: 64 });
    const dir = p.sign(['СЕКТОР 0', 'ЭТАЖИ:  0  ·  −1'], -2.6, 1.7, -31.88, 0, H, { w: 0.9, h: 0.4, tw: 384, th: 160 });
    this.inspect({ id: 'directory', mesh: dir, zone: H, text: () => (this.game.world.get('floorVoid') ? 'Схема этажей: 0, −1. Внизу кто-то процарапал третий: «Ø».' : 'Схема этажей: 0, −1. Больше этажей нет.') });
    // скамья
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), m.wood);
    seat.position.y = 0.45;
    bench.add(seat);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), m.metalDark);
      leg.position.set(sx, 0.22, 0);
      bench.add(leg);
    }
    bench.position.set(-3.5, 0, -23);
    b.groupOf(H).add(bench);
    this.shiftables.hall_bench = {
      room: 'hall',
      apply: () => {
        bench.position.set(0, 0, -27.5);
        bench.rotation.y = Math.PI / 2;
      },
    };
    this.observerAnchors.push({ x: -5.2, y: 0, z: -31.2, zone: H }, { x: 5.2, y: 0, z: -22.8, zone: H });
  }

  // ── НАБЛЮДАТЕЛЬНАЯ И КОМНАТА ЗА СТЕКЛОМ ───────────────────────────────────
  buildObservation() {
    const { b, p, m } = this;
    const O = 'observation';
    b.room({ x0: -16, x1: -6, z0: -32, z1: -22, zone: O, floor: 'carpet', wall: 'paint', surface: 'carpet', walls: { e: false, w: [{ a: -30, b: -24, bottom: 0.9, top: 2.4 }, { a: -31.5, b: -30.5 }] } });
    // стекло
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), m.glass);
    glass.position.set(-16, 1.65, -27);
    glass.rotation.y = Math.PI / 2;
    b.groupOf(O).add(glass);
    b.addCollider({ x0: -16.05, x1: -15.95, y0: 0.9, y1: 2.4, z0: -30, z1: -24 }, 'glass');
    this.inspect({ id: 'window', mesh: glass, zone: O, range: 3, text: () => (this.game.world.get('falseWallOpen') ? 'Стекло. С этой стороны оно кажется тоньше.' : 'Смотровое окно. За ним — светлая комната со стулом. Входа в неё нет ни из одного коридора.') });
    // стол с мониторами
    p.table(-14.6, -27, 0.8, 5.6, O);
    p.chair(-13.6, -27, Math.PI / 2, O);
    this.obsChair = p.chair(-13.4, -24.6, Math.PI / 2, O);
    this.shiftables.obs_chair = {
      room: 'observation',
      apply: () => {
        this.obsChair.position.set(-10, 0, -27);
        this.obsChair.rotation.y = 0;
      },
    };
    const camTexts = [['КАМ 1', 'ГЛАВНЫЙ КОРИДОР'], ['КАМ 2', 'АРХИВ'], ['КАМ 3', '— НЕТ СИГНАЛА —'], ['КАМ 4', 'КОМН. ПРОБУЖДЕНИЯ']];
    [-29.1, -27.8, -26.5, -25.2].forEach((z, i) => {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.42), m.plastic);
      mon.position.set(-14.85, 0.96, z);
      b.groupOf(O).add(mon);
      const scr = p.screen(camTexts[i], -14.69, 0.98, z, Math.PI / 2, O, { w: 0.36, h: 0.27 });
      this.screens.push({ mesh: scr, base: camTexts[i], i });
    });
    const phone = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.22), m.dark);
    pb.position.y = 0.04;
    const hs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.24), m.dark);
    hs.position.set(0, 0.1, 0);
    phone.add(pb, hs);
    phone.position.set(-14.5, 0.76, -24.6);
    b.groupOf(O).add(phone);
    this.button({
      id: 'phone',
      mesh: phone,
      zone: O,
      prompt: () => (this.game.world.get('phoneRinging') ? 'Снять трубку' : 'Телефон'),
      action: () => this.game.puzzles.phone(),
    });
    p.table(-9, -22.6, 1.2, 0.7, O);
    const t3 = p.terminal(-9, -22.75, Math.PI, O);
    this.terminalObs = t3;
    this.button({ id: 't3', mesh: t3, zone: O, prompt: () => (this.game.world.get('power') ? 'Терминал' : 'Терминал (нет питания)'), action: () => (this.game.world.get('power') ? this.game.story.openTerminal('t3') : this.game.ui.hint('Экран тёмный. Нет питания.')) });
    p.fixture(-11, 3, -27, O, { mode: 'main', hi: 3.5, lo: 0 });
    p.fixture(-8, 3, -24, O, { mode: 'main', hi: 3, lo: 0 });
    // ложная стена (Правило 2)
    this.plug({ x0: -16.1, x1: -15.9, y0: 0, y1: 2.2, z0: -31.5, z1: -30.5 }, 'paint', O, () => !this.game.world.get('falseWallOpen'));
    this.rubble = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.2, 0.06 + Math.random() * 0.1, 0.1 + Math.random() * 0.2), m.paint);
      r.position.set(-15.6 + Math.random() * 0.9, 0.04, -31.4 + Math.random() * 0.8);
      r.rotation.y = Math.random() * 3;
      this.rubble.add(r);
    }
    b.groupOf(O).add(this.rubble);
    this.emitter('secret_wall', 'secret', -16, 1.2, -31, () => !this.game.world.get('falseWallOpen'), 1, 10);
    const crack = p.sign([''], -15.89, 1.2, -31, Math.PI / 2, O, { w: 0.9, h: 1.6, bg: '#b4b8a8', fg: '#000', tw: 64, th: 128 });
    crack.visible = false;

    // комната за стеклом
    const GL = 'glass';
    b.room({ x0: -26, x1: -16, z0: -32, z1: -22, zone: GL, floor: 'concrete', wall: 'concrete', walls: { e: false } });
    p.fixture(-21, 3, -27, GL, { mode: 'always', lo: 7, hi: 7, range: 12, color: 0xdfeef5, bias: 300 });
    p.fixture(-21, 3, -23.5, GL, { mode: 'always', lo: 2, hi: 2, range: 7, color: 0xdfeef5, flicker: 0.2 });
    p.chair(-19.2, -27, -Math.PI / 2, GL);
    p.table(-23.5, -29.5, 1.2, 0.7, GL);
    this.pickup('frag2', -23.7, 0.77, -29.5, GL, { ry: 0.4 });
    this.paper('n_glass', -23.2, 0.77, -29.6, GL, { ry: -0.3 });
    // стены, обклеенные листами
    for (let i = 0; i < 26; i++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), m.paper);
      sheet.position.set(-25.89, 0.8 + (i % 4) * 0.42 + Math.random() * 0.06, -31 + Math.floor(i / 4) * 1.4 + Math.random() * 0.3);
      sheet.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 0.2);
      b.groupOf(GL).add(sheet);
    }
    this.observerAnchors.push({ x: -21.5, y: 0, z: -25, zone: GL, glass: true });
  }

  // ── БЕСКОНЕЧНАЯ ЛЕСТНИЦА ──────────────────────────────────────────────────
  buildStairs() {
    const { b, p } = this;
    const S = 'stairs';
    const zN = -29;
    const zS = -25;
    // секции: [x0, x1, yTop, yBottom]
    const landings = [
      [6, 9, 0],
      [15, 18, -3],
      [24, 27, -6],
      [33, 36, -9],
    ];
    const flights = [
      [9, 15, 0, -3],
      [18, 24, -3, -6],
      [27, 33, -6, -9],
      [36, 42, -9, -12],
    ];
    for (const [x0, x1, y] of landings) {
      b.box(x0, y - 0.3, zN, x1, y, zS, 'concreteDark', { zone: S, collide: false });
      b.floor(x0, zN, x1, zS, y, 'concrete');
      b.box(x0, y + 3, zN, x1, y + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false });
    }
    for (const [x0, x1, ya, yb] of flights) {
      b.ramp(x0, zN, x1, zS, 'x', ya, yb, 'concrete');
      const steps = 20;
      const run = (x1 - x0) / steps;
      const rise = (ya - yb) / steps;
      for (let i = 0; i < steps; i++) {
        const top = ya - i * rise;
        b.box(x0 + i * run, top - rise - 0.3, zN, x0 + (i + 1) * run, top - rise * 0.5, zS, 'concrete', { zone: S, collide: false });
      }
      b.box(x0, ya + 3, zN, x1, ya + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false });
      // перила
      const len = Math.hypot(x1 - x0, ya - yb);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), this.m.metal);
      rail.position.set((x0 + x1) / 2, (ya + yb) / 2 + 0.95, zS + 0.25);
      rail.rotation.z = -Math.atan2(ya - yb, x1 - x0);
      b.groupOf(S).add(rail);
      for (let k = 0; k <= 4; k++) {
        const x = x0 + ((x1 - x0) * k) / 4;
        const y = ya + ((yb - ya) * k) / 4;
        b.box(x - 0.02, y, zS + 0.23, x + 0.02, y + 0.95, zS + 0.27, 'metal', { zone: S, collide: false });
      }
    }
    // «ступеньки» потолка
    [[15, 0], [24, -3], [33, -6]].forEach(([x, y]) => b.box(x - 0.1, y, zN, x + 0.1, y + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false }));
    // стены
    b.box(6, -13, zS, 42, 3.2, zS + 0.2, 'concrete', { zone: S });
    const wn = (x0, x1, y0, y1) => b.box(x0, y0, zN - 0.2, x1, y1, zN, 'concrete', { zone: S });
    wn(6, 16, -13, 3.2);
    wn(16, 17, -0.9, 3.2);
    wn(16, 17, -13, -3);
    wn(17, 25, -13, 3.2);
    wn(25, 26, -3.9, 3.2);
    wn(25, 26, -13, -6);
    wn(26, 42, -13, 3.2);
    b.box(42, -13, zN, 42.2, 3.2, zS, 'concrete', { zone: S });
    // таблички этажей
    p.sign(['0'], 8.4, 1.8, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 90px Consolas' });
    this.landingSigns = [
      p.sign(['−1'], 17.6, -1.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
      p.sign(['−2'], 26.6, -4.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
      p.sign(['−3'], 35.6, -7.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
    ];
    this.inspect({ id: 'landing_sign', mesh: this.landingSigns[0], zone: S, text: () => `Табличка: −${this.game.world.get('landing', 0) + 1}. Я спускался всего на один пролёт?` });
    // лампы на площадках (одинаковые — чтобы петля была незаметной)
    [[7.5, 2.2], [16.5, -0.8], [25.5, -3.8], [34.5, -6.8]].forEach(([x, y]) => p.wallLamp(x, y, zS - 0.15, S, { lo: 3, hi: 3, flicker: 0.12, range: 8 }));
    // дверь на площадке (Головоломка: нужный пролёт)
    this.door({
      id: 'd_landing',
      axis: 'x',
      x: 16.5,
      z: zN,
      y: -3,
      zone: S,
      locked: true,
      lockText: () => `Заперто. Табличка рядом: −${this.game.world.get('landing', 0) + 1}. За дверью — бетон?`,
    });
    this.fakeDoor('x', 25.5, zN, S, -6);
    this.fakeDoor('x', 34.5, zN, S, -9);
    // тамбур за дверью площадки
    const SV = 'stairsVest';
    b.room({ x0: 15.9, x1: 17.1, z0: -31.6, z1: zN, y: -3, h: 2.4, zone: SV, floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
    this.curtain('x', -30.3, 15.9, 17.1, -0.6, SV, { y0: -3 });
    this.portal('lab_in', { x0: 15.9, x1: 17.1, z0: -31.6, z1: -30.32, y0: -4, y1: -1.5 }, [80.5, 3, 37.6]);
    this.observerAnchors.push({ x: 25.5, y: -6, z: -27, zone: S }, { x: 7.6, y: 0, z: -27, zone: S });
  }

  // ── КОМНАТА 0-7 (больше, чем здание) ──────────────────────────────────────
  buildRoom07() {
    const { b, p } = this;
    const R = 'room07';
    b.room({ x0: -64.5, x1: -61.5, z0: -15.6, z1: -14.4, h: 2.6, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { w: false, e: false } });
    b.wallZ(-61.5, -15.6, -14.4, 0, 2.6, 'concreteDark', R);
    this.fakeDoor('z', -61.6, -15, R);
    this.curtain('z', -63, -15.6, -14.4, 2.6, R);
    this.portal('room07_out', { x0: -62.98, x1: -61.5, z0: -15.6, z1: -14.4 }, [60, 0, 0]);
    b.room({ x0: -76.5, x1: -64.5, z0: -21, z1: -9, h: 4.5, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { e: [{ a: -15.6, b: -14.4, top: 2.6 }] } });
    p.table(-70.5, -15, 6, 1.4, R, { mat: 'wood' });
    const names = ['Ланская', 'Громов', 'Шум', 'Оператор', 'Испытуемый', 'Копия', '—'];
    const seats = [[-72.5, -16.1, 0], [-70.5, -16.1, 0], [-68.5, -16.1, 0], [-72.5, -13.9, Math.PI], [-70.5, -13.9, Math.PI], [-68.5, -13.9, Math.PI], [-74.1, -15, Math.PI / 2]];
    seats.forEach(([x, z, ry], i) => {
      p.chair(x, z + (ry === 0 ? -0.3 : ry === Math.PI ? 0.3 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry, R);
      const card = p.sign([names[i]], x + (i === 6 ? 0.55 : 0), 0.82, z + (ry === 0 ? 0.25 : ry === Math.PI ? -0.25 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry === 0 ? Math.PI : 0, R, { w: 0.24, h: 0.08, bg: '#e8e4d8', fg: '#1a1a1a', tw: 256, th: 80, font: 'bold 34px Consolas' });
      card.rotation.x = -0.35;
    });
    this.pickup('fuse_c', -71.3, 0.77, -15.1, R, { ry: 0.8 });
    this.pickup('frag1', -69.6, 0.77, -15.2, R, { ry: -0.3 });
    this.paper('n_07', -70.4, 0.77, -14.8, R, { ry: 0.1 });
    p.fixture(-70.5, 4.5, -15, R, { mode: 'always', lo: 4.5, hi: 4.5, warm: true, color: 0xffd8b0, range: 12 });
    p.fixture(-70.5, 4.5, -10.5, R, { mode: 'always', lo: 1.2, hi: 1.2, range: 8, flicker: 0.5 });
    this.observerAnchors.push({ x: -75.5, y: 0, z: -20, zone: R });
  }

  // ── ОТРАЖЕНИЕ (зеркальная комната пробуждения) ────────────────────────────
  buildReflection() {
    const { b, p } = this;
    const R = 'reflection';
    // отрезок коридора за шторкой
    b.room({ x0: -61.5, x1: -58.5, z0: 38, z1: 41.5, zone: R, floor: 'tiles', wall: 'concrete', walls: { n: false } });
    this.curtain('x', 40, -61.5, -58.5, 3, R);
    this.portal('reflection_out', { x0: -61.5, x1: -58.5, z0: 40.05, z1: 41.5 }, [60, 0, -60]);
    // сама комната
    b.room({ x0: -63, x1: -57, z0: 32, z1: 38, zone: R, floor: 'lino', wall: 'paint', surface: 'lino', walls: { s: [{ a: -61.5, b: -58.5, top: 3 }] } });
    p.bed(-62.3, 33.8, Math.PI, R);
    p.table(-62.6, 36.8, 0.7, 1.6, R);
    const t = p.terminal(-62.65, 37.25, Math.PI / 2, R);
    t.userData.screen.material = this.m.dark;
    p.chair(-61.9, 36.8, Math.PI / 2, R);
    // часы — показывают то же время, но зеркально
    const tex = textTexture(this.secrets.clock, { w: 256, h: 112, bg: '#0b0b0b', fg: '#ff4a2a', font: 'bold 76px Consolas, monospace' });
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: tex }));
    clock.position.set(-58.8, 2.2, 32.11);
    b.groupOf(R).add(clock);
    this.inspect({ id: 'clock_mirror', mesh: clock, zone: R, text: 'Часы. Цифры отражены, как в зеркале. Стоят.' });
    this.pickup('frag3', -62.2, 0.66, 33.6, R, { ry: 0.5 });
    this.paper('n_reflection', -62.5, 0.77, 36.4, R, { ry: 2.8 });
    p.fixture(-60, 3, 35, R, { mode: 'always', lo: 4, hi: 4, warm: true, color: 0xffe2c0, range: 8, flicker: 0.2 });
  }

  // ── УРОВЕНЬ −1: ЛАБОРАТОРИЯ, ЭХО-КАМЕРА, ШЛЮЗ ─────────────────────────────
  buildLab() {
    const { b, p, m } = this;
    const LB = 'lab';
    b.room({
      x0: 94, x1: 106, z0: -6, z1: 6, h: 3.2, zone: LB, floor: 'tiles', wall: 'whiteTile', surface: 'tile',
      walls: { n: [{ a: 99, b: 101, top: 2.4 }], e: [{ a: -3, b: -2 }], w: [{ a: -1.5, b: 1.5, top: 2.6 }], s: [{ a: 96.4, b: 97.6, top: 2.2 }] },
    });
    p.fixture(97, 3.2, 0, LB, { mode: 'always', lo: 4, hi: 4, flicker: 0.12, range: 10 });
    p.fixture(103, 3.2, 0, LB, { mode: 'always', lo: 4, hi: 4, range: 10 });
    p.fixture(100, 3.2, 4, LB, { mode: 'always', lo: 2, hi: 2, range: 7, flicker: 0.5 });
    this.emitter('lab_lamp', 'lamp', 100, 3, 4, () => true, 0.7, 8);
    // тамбур к лестнице
    b.room({ x0: 96.4, x1: 97.6, z0: 6, z1: 8.6, h: 2.4, zone: LB, floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
    this.fakeDoor('x', 97, 8.55, LB);
    this.curtain('x', 7.3, 96.4, 97.6, 2.4, LB);
    this.portal('lab_out', { x0: 96.4, x1: 97.6, z0: 7.32, z1: 8.6, y0: -1, y1: 2 }, [-80.5, -3, -37.6]);
    // столы с оборудованием
    p.table(97.5, -3.5, 2, 0.8, LB);
    for (let i = 0; i < 5; i++) b.box(96.7 + i * 0.35, 0.76, -3.7, 96.95 + i * 0.35, 0.9 + (i % 3) * 0.1, -3.4, i % 2 ? 'plasticLight' : 'metal', { zone: LB, collide: false });
    p.table(100, 5.4, 1.2, 0.7, LB);
    const t4 = p.terminal(100, 5.3, Math.PI, LB);
    this.button({ id: 't4', mesh: t4, zone: LB, prompt: 'Терминал', action: () => this.game.story.openTerminal('t4') });
    this.paper('n_lab', 100.7, 0.77, 5.3, LB, { ry: 0.3 });
    // плита А
    this.plates.push(new Plate(this.game, { id: 'plateA', x: 104.6, z: 4.4, size: 1.2, zone: LB, lamp: { x: 105.88, y: 1.8, z: 4.4 } }));
    p.sign(['ПЛИТА А'], 105.89, 2.1, 4.4, -Math.PI / 2, LB, { w: 0.4, h: 0.12, tw: 256, th: 64 });
    this.observerAnchors.push({ x: 95, y: 0, z: 5.2, zone: LB });

    // ЭХО-КАМЕРА
    const E = 'echo';
    b.room({ x0: 106, x1: 114, z0: -6, z1: 2, zone: E, floor: 'carpet', wall: 'concreteDark', surface: 'carpet', walls: { w: false } });
    this.door({ id: 'd_echo', axis: 'z', x: 106, z: -2.5, zone: LB, sign: textTexture('ЭХО', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
    // звукопоглощающие клинья
    for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
      b.box(113.7, 0.4 + j * 0.65, -5.6 + i * 1.05, 113.9, 0.9 + j * 0.65, -5.1 + i * 1.05, 'foam', { zone: E, collide: false });
      b.box(106.6 + i * 1.0, 0.4 + j * 0.65, -5.9, 107.1 + i * 1.0, 0.9 + j * 0.65, -5.7, 'foam', { zone: E, collide: false });
      b.box(106.6 + i * 1.0, 0.4 + j * 0.65, 1.7, 107.1 + i * 1.0, 0.9 + j * 0.65, 1.9, 'foam', { zone: E, collide: false });
    }
    p.table(112.6, -2, 0.8, 2.2, E);
    const recBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), m.doorRed);
    recBtn.position.set(112.5, 0.79, -2.6);
    b.groupOf(E).add(recBtn);
    this.recLampMat = m.lampRed.clone();
    const recLamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), this.recLampMat);
    recLamp.position.set(112.8, 0.82, -2.6);
    b.groupOf(E).add(recLamp);
    this.button({
      id: 'echo_rec',
      mesh: recBtn,
      zone: E,
      prompt: () => (this.game.entities && this.game.entities.copy.state === 'echo' ? 'Идёт запись…' : 'ЗАПИСЬ'),
      action: () => this.game.entities.copy.startEcho(),
    });
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), m.plasticLight);
    sw.position.set(112.5, 0.79, -1.3);
    b.groupOf(E).add(sw);
    this.button({
      id: 'echo_light',
      mesh: sw,
      zone: E,
      copyable: true,
      prompt: 'Выключатель света',
      action: (byCopy) => {
        this.game.world.set('echoLamp', !this.game.world.get('echoLamp', false));
        this.game.audio.play('click', sw.position);
        if (byCopy) this.game.mem.seeEvent('copy_switch');
        this.refreshLights();
      },
    });
    p.sign(['ЗАДЕРЖКА ЭХА: 10 с', 'ДЛИТЕЛЬНОСТЬ: 120 с'], 113.88, 1.9, -2, -Math.PI / 2, E, { w: 0.8, h: 0.3, tw: 384, th: 144 });
    this.paper('n_echo', 112.7, 0.77, -1.6, E, { ry: 1.4 });
    p.fixture(110, 3, -2, E, { mode: 'always', lo: 1.6, hi: 1.6, range: 8 });
    p.fixture(108, 3, -4.5, E, { mode: 'switch', switchVar: 'echoLamp', lo: 0, hi: 4, range: 8 });

    // ШЛЮЗ
    const GT = 'gate';
    b.room({ x0: 80, x1: 94, z0: -6, z1: 6, h: 4, zone: GT, floor: 'concreteDark', wall: 'concrete', walls: { e: false, w: [{ a: -1.5, b: 1.5, top: 3 }] } });
    p.fixture(84, 4, 0, GT, { mode: 'always', lo: 3.5, hi: 3.5, range: 10 });
    p.fixture(90, 4, 0, GT, { mode: 'always', lo: 3, hi: 3, range: 10, flicker: 0.2 });
    this.plates.push(new Plate(this.game, { id: 'plateB', x: 82.2, z: 4.6, size: 1.2, zone: GT, lamp: { x: 80.12, y: 1.8, z: 4.6 } }));
    p.sign(['ПЛИТА Б'], 80.11, 2.1, 4.6, Math.PI / 2, GT, { w: 0.4, h: 0.12, tw: 256, th: 64 });
    // препятствия: колонны и стеллаж
    b.box(85.2, 0, 2.2, 85.8, 4, 2.8, 'concrete', { zone: GT });
    b.box(85.2, 0, 4.8, 85.8, 4, 6, 'concrete', { zone: GT });
    b.box(88, 0, -1, 88.6, 4, -0.4, 'concrete', { zone: GT });
    b.box(83, 0, -4, 85, 1.1, -3.4, 'metalDark', { zone: GT });
    const crate = new Crate(this.game, { id: 'c1', x: 90.5, z: -3.5, zone: GT });
    this.crates.push(crate);
    // кнопка возврата груза — чтобы ящик нельзя было безнадёжно застрять в углу
    const resetBtn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.2), m.lampAmber);
    resetBtn.position.set(93.87, 1.3, -4.6);
    b.groupOf(GT).add(resetBtn);
    p.sign(['ВОЗВРАТ ГРУЗА'], 93.88, 1.6, -4.6, -Math.PI / 2, GT, { w: 0.4, h: 0.08, tw: 256, th: 52 });
    this.button({
      id: 'crate_reset',
      mesh: resetBtn,
      zone: GT,
      prompt: 'Вернуть груз на место',
      action: () => {
        const pp = this.game.player.pos;
        if (Math.hypot(pp.x - 90.5, pp.z + 3.5) < 1.2) return this.game.ui.hint('Мешаю сам себе: нужно отойти от места погрузки.');
        crate.x = 90.5;
        crate.z = -3.5;
        b.moveCollider(crate.collider, crate.box(crate.x, crate.z));
        crate.place();
        this.game.world.data.vars.crate_c1 = { x: crate.x, z: crate.z };
        this.game.audio.play('gate', crate.mesh.position);
      },
    });
    // ворота
    this.gate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 3), m.metalDark);
    this.gate.position.set(80, 1.5, 0);
    b.groupOf(GT).add(this.gate);
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.2, 3), i % 2 ? m.dark : new THREE.MeshStandardMaterial({ color: 0x8a7020, roughness: 0.6 }));
      stripe.position.set(0, -1.2 + i * 0.2, 0);
      this.gate.add(stripe);
    }
    this.gateCol = b.addCollider({ x0: 79.85, x1: 80.15, y0: 0, y1: 3, z0: -1.5, z1: 1.5 });
    this.gateOpen = this.game.world.get('gateOpen') ? 1 : 0;
    this.gateLamps = [m.lampRed.clone(), m.lampRed.clone()];
    this.gateLamps.forEach((mat, i) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.12), mat);
      l.position.set(80.2, 3.25, -0.4 + i * 0.8);
      b.groupOf(GT).add(l);
    });
    p.sign(['ШЛЮЗ ЯДРА'], 80.12, 3.6, 0, Math.PI / 2, GT, { w: 1.2, h: 0.24, tw: 512, th: 96 });
    this.paper('n_gate', 80.12, 1.5, -2.6, GT, { ry: Math.PI / 2, wall: true });
    this.observerAnchors.push({ x: 93, y: 0, z: 5.2, zone: GT });
  }

  buildCore() {
    const { b, p, m } = this;
    const C = 'core';
    b.room({ x0: 64, x1: 80, z0: -6, z1: 6, h: 6, zone: C, floor: 'concreteDark', wall: 'concreteDark', walls: { e: false } });
    // МНЕМА
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.6, 32), m.metalDark);
    base.position.y = 0.3;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 5.4, 24), m.metal);
    col.position.y = 3;
    g.add(base, col);
    this.mnemaRings = [];
    this.mnemaGlow = m.lampWhite.clone();
    this.mnemaGlow.color.setHex(0xa8c8ff);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 + i * 0.15, 0.06, 8, 48), m.metal);
      ring.position.y = 1.5 + i * 1.4;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      this.mnemaRings.push(ring);
      const slit = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24), this.mnemaGlow);
      slit.position.y = 1.5 + i * 1.4;
      g.add(slit);
    }
    g.position.set(71, 0, 0);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    b.groupOf(C).add(g);
    this.mnema = g;
    b.addCollider({ x0: 69.3, x1: 72.7, y0: 0, y1: 6, z0: -1.7, z1: 1.7 });
    this.mnemaLight = b.light({ x: 71, y: 3, z: 0, color: 0xa8c8ff, mode: 'always', lo: 9, hi: 9, range: 15, zone: C, phase: 0 });
    b.light({ x: 66, y: 0.4, z: -5, color: 0xc8d8ff, mode: 'always', lo: 1.5, hi: 1.5, range: 6, zone: C, phase: 2 });
    this.emitter('core_machine', 'core', 71, 2, 0, () => !this.game.world.get('mnemaOff'), 1, 30);
    this.inspect({ id: 'mnema', mesh: col, zone: C, range: 4, text: 'МНЕМА. Кольца вращаются в разные стороны. Если долго смотреть, кажется, что они повторяют маршрут, которым я сюда пришёл.' });
    p.table(75.6, 0, 0.8, 1.6, C);
    const t5 = p.terminal(75.65, 0, -Math.PI / 2, C);
    this.button({ id: 't5', mesh: t5, zone: C, prompt: 'Пульт МНЕМЫ', action: () => this.game.story.openTerminal('t5') });
    this.paper('n_core', 75.5, 0.77, 0.55, C, { ry: -1.2 });
    this.observerAnchors.push({ x: 65, y: 0, z: 5, zone: C });
  }

  buildVoid() {
    const { b, p } = this;
    const V = 'void';
    b.room({ x0: -10, x1: 10, z0: 100, z1: 120, h: 5, zone: V, floor: 'voidFloor', wall: 'void', ceil: 'void', surface: 'void', walls: { n: [{ a: -1, b: 1, top: 2.4 }] } });
    p.table(0, 112, 1.2, 0.7, V, { mat: 'void', legs: 'void' });
    const tv = p.terminal(0, 111.9, Math.PI, V);
    this.button({ id: 'tv', mesh: tv, zone: V, prompt: 'Терминал Ø', action: () => this.game.story.openTerminal('tv') });
    this.paper('n_void', 0.45, 0.77, 112.1, V, { ry: 0.2 });
    p.chair(0, 112.8, Math.PI, V);
    b.light({ x: 0, y: 4.5, z: 106, color: 0xffffff, mode: 'always', lo: 6, hi: 6, range: 16, zone: V, phase: 0 });
    b.light({ x: 0, y: 4.5, z: 115, color: 0xffffff, mode: 'always', lo: 6, hi: 6, range: 16, zone: V, phase: 0 });
    this.voidAnchor = { x: 6, y: 0, z: 117 };
  }

  // ── ЛИФТ: три одинаковые кабины ───────────────────────────────────────────
  buildElevator() {
    const { b, p, m } = this;
    this.cabs = {
      0: { ox: 0, oz: -32, zone: 'lift0', outer: 'hall' },
      '-1': { ox: 100, oz: -6, zone: 'lift1', outer: 'lab' },
      V: { ox: 0, oz: 100, zone: 'liftV', outer: 'void' },
    };
    for (const [floor, cab] of Object.entries(this.cabs)) {
      const { ox, oz, zone } = cab;
      b.room({ x0: ox - 1.2, x1: ox + 1.2, z0: oz - 2.6, z1: oz, h: 2.6, zone, floor: 'metal', wall: 'metal', ceil: 'metalDark', surface: 'metal', walls: { s: false } });
      p.fixture(ox, 2.6, oz - 1.3, zone, { mode: 'always', lo: 2.5, hi: 2.5, range: 5, w: 0.8, d: 0.4 });
      cab.doorL = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.06), m.metal);
      cab.doorR = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.06), m.metal);
      cab.doorL.position.set(ox - 0.5, 1.2, oz - 0.16);
      cab.doorR.position.set(ox + 0.5, 1.2, oz - 0.16);
      b.groupOf(zone).add(cab.doorL, cab.doorR);
      cab.col = b.addCollider({ x0: ox - 1, x1: ox + 1, y0: 0, y1: 2.4, z0: oz - 0.2, z1: oz - 0.1 });
      cab.open = 0;
      // панель в кабине
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.25), m.metalDark);
      panel.position.set(ox + 1.17, 1.3, oz - 1.0);
      b.groupOf(zone).add(panel);
      cab.panelTex = textTexture(['0', '−1'], { w: 64, h: 128, bg: '#111', fg: '#ffc060', font: 'bold 30px Consolas' });
      const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.36), new THREE.MeshBasicMaterial({ map: cab.panelTex }));
      pf.position.set(ox + 1.145, 1.3, oz - 1.0);
      pf.rotation.y = -Math.PI / 2;
      b.groupOf(zone).add(pf);
      this.button({ id: `lift_panel_${floor}`, mesh: panel, zone, prompt: 'Панель лифта', action: () => this.game.puzzles.elevatorPanel() });
      this.add(new Button(this.game, { id: `lift_panel_face_${floor}`, mesh: pf, zone, prompt: 'Панель лифта', action: () => this.game.puzzles.elevatorPanel() }));
      // кнопка вызова снаружи
      const call = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), m.metalDark);
      call.position.set(ox + 1.4, 1.25, oz + 0.12);
      b.groupOf(cab.outer).add(call);
      cab.callMat = m.lampOff.clone();
      const callLamp = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), cab.callMat);
      callLamp.position.set(0, 0, 0.021);
      call.add(callLamp);
      this.button({ id: `lift_call_${floor}`, mesh: call, zone: cab.outer, prompt: 'Вызвать лифт', action: () => this.game.puzzles.callElevator(floor) });
      // индикатор этажа над дверью
      cab.indTex = textTexture('0', { w: 128, h: 64, bg: '#0a0a0a', fg: '#ff9030', font: 'bold 44px Consolas' });
      const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: cab.indTex }));
      ind.position.set(ox, 2.6, oz + 0.11);
      b.groupOf(cab.outer).add(ind);
    }
  }

  // ── подписки на изменения мира ────────────────────────────────────────────
  subscribe() {
    const bus = this.game.bus;
    bus.on('door:state', (e) => this.doors[e.id] && this.doors[e.id].sync());
    bus.on('item:state', (e) => this.pickups[e.id] && this.pickups[e.id].sync());
    bus.on('world:change', (e) => this.onWorld(e.key, e.value));
    bus.on('cue', (e) => this.onCue(e.name, e));
    bus.on('rule:discovered', () => this.syncEmitters());
  }

  onWorld(key) {
    if (key === 'power') {
      this.refreshLights();
      this.syncScreens();
      this.syncElevator();
    }
    if (key === 'startStage') this.syncStart();
    if (key === 'falseWallOpen' || key === 'loopDoor') {
      this.syncPlugs();
      Object.values(this.doors).forEach((d) => d.sync());
    }
    if (key === 'forkCircle') this.applyForkCircle();
    if (key === 'reflectionPortal') this.wornCurtain.amp = this.game.world.get('reflectionPortal') ? 0.14 : this.wornCurtain.amp;
    if (key === 'landing') this.syncLanding();
    if (key === 'floorVoid') this.syncElevator();
    if (key.startsWith('fuse_')) this.syncFuses();
    this.syncEmitters();
  }

  onCue(name, e) {
    if (name === 'lamp07') this.syncLamp07(e.passes);
    if (name === 'tally') this.syncTally();
    if (name === 'curtain') this.wornCurtain.amp = 0.03 + e.sway * 0.08;
  }

  syncAll() {
    this.refreshLights();
    this.syncStart();
    this.syncPlugs();
    this.syncLamp07(this.game.mem.door('d_07').passes);
    this.syncTally();
    this.syncLanding();
    this.syncFuses();
    this.syncScreens();
    this.syncElevator();
    this.syncShifts();
    if (this.game.world.get('forkCircle')) this.applyForkCircle(true);
    const st = this.game.mem.rule('worn_path');
    this.wornCurtain.amp = this.game.world.get('reflectionPortal') ? 0.14 : 0.03 + Math.min(1, st.progress) * 0.08;
    this.objects.forEach((o) => o.sync && o.sync(true));
  }

  refreshLights() {
    const power = !!this.game.world.get('power');
    const off = !!this.game.world.get('mnemaOff');
    for (const a of this.b.lights) {
      let on = true;
      let k = a.hi;
      if (a.mode === 'main') on = power;
      else if (a.mode === 'mixed') k = power ? a.hi * 0.85 : a.lo * 0.6; // без питания комплекс почти тёмный
      else if (a.mode === 'mixedInv') k = power ? a.hi : a.lo;
      else if (a.mode === 'switch') on = !!this.game.world.get(a.switchVar);
      else k = a.hi ?? a.lo;
      if (off && a.zone === 'core') k *= 0.1;
      a._on = on && k > 0;
      a.intensity = k;
      if (!a.isOn) a.isOn = () => a._on;
      if (a.fixtureMat) a.fixtureMat.color.copy(a.baseColor).multiplyScalar(a._on ? Math.min(1, 0.35 + k / 6) : 0.05);
    }
  }

  syncStart() {
    const stage = this.game.world.get('startStage', 0);
    const z = stage >= 2 ? 7.5 : 6;
    this.startWall.position.set(0, 0, z);
    this.b.moveCollider(this.startWallCol, { x0: -3.1, x1: 3.1, y0: 0, y1: 3, z0: z - 0.1, z1: z + 0.1 });
    if (stage >= 1) {
      this.bedGroup.position.set(-2.3, 0, 5.0);
      this.b.moveCollider(this.bedCol, { x0: -2.75, x1: -1.85, y0: 0, y1: 0.6, z0: 4.0, z1: 6.0 });
    }
    this.clock2.visible = stage >= 3;
    this.syncPlugs();
    if (this.doors.d_waiting) this.doors.d_waiting.sync();
  }

  syncPlugs() {
    for (const pl of this.plugs) {
      const on = !!pl.when();
      pl.mesh.visible = on;
      pl.collider.enabled = on;
    }
    if (this.rubble) this.rubble.visible = !!this.game.world.get('falseWallOpen');
  }

  syncLamp07(passes) {
    const d = this.doors.d_07;
    if (!d) return;
    if (this.game.mem.rule('three_passes').done) d.setLamp(0x40ff80);
    else d.setLamp([0xff3020, 0xffb030, 0xf0f0e0, 0xf0f0e0][Math.min(3, passes)]);
    this.lamp07Flicker = passes === 2;
  }

  syncTally() {
    const r = this.game.mem.data.routes;
    const draw = (sign, n) => {
      const c = sign.userData.tex.userData.canvas;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#8a8880';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#2a2a28';
      ctx.lineWidth = 3;
      for (let i = 0; i < n; i++) {
        const grp = Math.floor(i / 5);
        const k = i % 5;
        const gx = 14 + (grp % 4) * 46;
        const gy = 14 + Math.floor(grp / 4) * 52;
        ctx.beginPath();
        if (k < 4) {
          ctx.moveTo(gx + k * 8, gy);
          ctx.lineTo(gx + k * 8 + 2, gy + 40);
        } else {
          ctx.moveTo(gx - 4, gy + 30);
          ctx.lineTo(gx + 34, gy + 8);
        }
        ctx.stroke();
      }
      sign.userData.tex.needsUpdate = true;
    };
    draw(this.tallyL, r.left);
    draw(this.tallyR, r.right);
  }

  syncLanding() {
    const n = this.game.world.get('landing', 0);
    this.landingSigns.forEach((s, i) => updateTextTexture(s.userData.tex, [`−${n + 1 + i}`]));
    const correct = n + 1 === this.secrets.landing;
    const st = this.game.world.door('d_landing');
    if (correct && st.locked) this.game.world.setDoor('d_landing', { locked: false });
    if (!correct && (!st.locked || st.open)) this.game.world.setDoor('d_landing', { locked: true, open: false });
  }

  syncFuses() {
    for (let i = 0; i < 3; i++) {
      const has = !!this.game.world.get(`fuse_${i}`);
      this.fuseVisuals[i].visible = has;
      this.fuseLamps[i].color.setHex(has ? (this.game.world.get('power') ? 0x40ff80 : 0xffb030) : 0xff3020);
    }
    if (this.leverArm) this.leverArm.rotation.x = this.game.world.get('power') ? -0.9 : 0.9;
  }

  syncScreens() {
    const power = !!this.game.world.get('power');
    const mem = this.game.mem;
    for (const s of this.screens) {
      let lines = s.base;
      if (!power) lines = [''];
      else if (s.i === 0) lines = [s.base[0], s.base[1], `ДВИЖЕНИЕ: ×${mem.data.routes.north + mem.data.routes.south}`];
      else if (s.i === 2) lines = mem.visited('room07') ? ['КАМ 3', 'КОМН. 0-7', 'СТУЛЬЕВ: 7'] : s.base;
      else if (s.i === 3) lines = [s.base[0], s.base[1], `ВИЗИТОВ: ${mem.room('start').visits}`];
      updateTextTexture(s.mesh.userData.tex, lines, power ? {} : { bg: '#020303' });
    }
    if (this.terminalObs) this.terminalObs.userData.screen.material = power ? this.m.screen : this.m.dark;
  }

  syncElevator() {
    const power = !!this.game.world.get('power');
    const hasVoid = !!this.game.world.get('floorVoid');
    const floor = this.game.world.get('liftFloor', '0');
    for (const [f, cab] of Object.entries(this.cabs)) {
      updateTextTexture(cab.panelTex, power ? (hasVoid ? ['0', '−1', 'Ø'] : ['0', '−1']) : ['—']);
      updateTextTexture(cab.indTex, [power ? { 0: '0', '-1': '−1', V: 'Ø' }[floor] : '—']);
      cab.callMat.color.setHex(power ? (f === floor ? 0x40ff80 : 0xffb030) : 0x303436);
    }
  }

  applyForkCircle(instant = false) {
    const pos = this.game.world.get('forkCirclePos');
    let at = pos;
    if (!at) {
      const it = this.game.world.item('fork');
      if (!it || it.where !== 'world') return;
      at = { x: it.x, y: it.y, z: it.z };
      this.game.world.set('forkCirclePos', at);
      // предмет «сдвинулся» сам
      this.game.world.setItem('fork', { x: it.x + 0.35, z: it.z - 0.2, ry: (it.ry || 0) + 1.3 });
    }
    if (!this.chalk) {
      this.chalk = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.46, 40), this.m.chalk);
      this.chalk.rotation.x = -Math.PI / 2;
      this.b.root.add(this.chalk);
    }
    this.chalk.position.set(at.x + 0.15, at.y + 0.012, at.z - 0.1);
    if (!instant) this.game.audio.play('settle');
  }

  syncShifts() {
    for (const [id, s] of Object.entries(this.shiftables)) if (this.game.world.get(`shift_${id}`)) s.apply();
  }

  // Наблюдатель исчез — меняем что-то в уже посещённой комнате (не в текущей).
  applyShift() {
    const mem = this.game.mem;
    const cur = mem.data.currentRoom;
    for (const [id, s] of Object.entries(this.shiftables)) {
      if (this.game.world.get(`shift_${id}`)) continue;
      if (s.room === cur || !mem.visited(s.room)) continue;
      this.game.world.set(`shift_${id}`, true);
      s.apply();
      return s.room;
    }
    return null;
  }

  // Нераскрытые секреты — Наблюдатель смотрит в сторону ближайшего.
  secretTargets() {
    const mem = this.game.mem;
    const w = this.game.world;
    const t = [];
    if (!mem.rule('three_passes').done) t.push({ x: -1.5, z: -15 });
    if (!w.get('falseWallOpen')) t.push({ x: -16, z: -31 });
    if (w.get('startStage', 0) < 4) t.push({ x: -3, z: 3 });
    if (!w.get('loopDoor')) t.push({ x: -8, z: -6.5 });
    if (!mem.rule('worn_path').done) t.push({ x: 0, z: -20 });
    if (!mem.solved('landing')) t.push({ x: 16.5, z: -29 });
    if (!w.get('floorVoid')) t.push({ x: 0, z: -33 });
    return t;
  }

  syncEmitters() {
    const audio = this.game.audio;
    if (!audio.ctx) return;
    for (const e of this.emitterDefs) {
      if (!audio.emitters.has(e.id)) audio.addEmitter(e.id, e.type, e.pos, e.level, e.range);
      audio.setEmitter(e.id, !!e.when(), e.level);
    }
  }

  // ── кадр ──────────────────────────────────────────────────────────────────
  update(dt, time) {
    this.time = time;
    const g = this.game;
    for (const o of this.objects) o.update(dt);
    this.horror.update(dt);
    // шторки
    for (const c of this.curtains) {
      c.group.children.forEach((pv) => {
        pv.rotation[c.axis === 'x' ? 'x' : 'z'] = Math.sin(time * 1.3 + pv.userData.phase) * c.amp;
      });
    }
    // лампа над 0-7 мигает на втором проходе
    if (this.lamp07Flicker && this.doors.d_07) this.doors.d_07.setLamp(Math.sin(time * 9) > 0.3 ? 0xffb030 : 0x302010);
    // плиты
    const bodies = [g.player.pos, g.entities.copy.body(), ...this.crates.map((c) => ({ x: c.x, y: c.y, z: c.z }))];
    for (const pl of this.plates) pl.update(bodies);
    // ворота шлюза
    const want = this.plates.every((pl) => pl.pressed) ? 1 : 0;
    if (want && !g.world.get('gateOpen')) {
      g.world.set('gateOpen', true);
      g.audio.play('gate', this.gate.position);
      g.mem.solve('gate');
    } else if (!want && g.world.get('gateOpen')) {
      g.world.set('gateOpen', false);
      g.audio.play('gate', this.gate.position);
    }
    this.gateOpen += ((want ? 1 : 0) - this.gateOpen) * Math.min(1, dt * 1.2);
    this.gate.position.y = 1.5 + this.gateOpen * 2.85;
    // закрываться на игрока ворота не будут — ждут, пока он отойдёт
    const pp = g.player.pos;
    const inGate = pp.x > 79.4 && pp.x < 80.6 && Math.abs(pp.z) < 1.6;
    this.gateCol.enabled = this.gateOpen < 0.7 && !inGate;
    this.plates.forEach((pl, i) => this.gateLamps[i] && this.gateLamps[i].color.setHex(pl.pressed ? 0x40ff80 : 0xff3020));
    // МНЕМА
    if (!g.world.get('mnemaOff')) this.mnemaRings.forEach((r, i) => (r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1)));
    // вторые часы
    if (this.clock2.visible && Math.floor(time) !== this._clockSec) {
      this._clockSec = Math.floor(time);
      const t = Math.floor(g.mem.data.playTime);
      updateTextTexture(this.clock2Tex, [`${String(Math.floor(t / 60) % 100).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`]);
    }
    // лифт
    for (const cab of Object.values(this.cabs)) {
      const target = cab.isOpen ? 1 : 0;
      cab.open += (target - cab.open) * Math.min(1, dt * 3);
      cab.doorL.position.x = cab.ox - 0.5 - cab.open * 0.95;
      cab.doorR.position.x = cab.ox + 0.5 + cab.open * 0.95;
      cab.col.enabled = cab.open < 0.8;
    }
    this.checkPassBand();
    this.checkStairs();
    this.checkPortals();
  }

  // Проход мимо двери 0-7: вошёл в полосу с одной стороны, вышел с другой.
  checkPassBand() {
    const p = this.game.player.pos;
    const band = this.passBand;
    const inCorr = p.x > -1.5 && p.x < 1.5 && p.y > -0.5 && p.y < 1;
    const inside = inCorr && p.z > band.z0 && p.z < band.z1;
    if (inside && !band.side) band.side = p.z > (band.z0 + band.z1) / 2 ? 'south' : 'north';
    if (!inside && band.side) {
      const exit = p.z >= band.z1 ? 'south' : p.z <= band.z0 ? 'north' : null;
      if (inCorr && exit && exit !== band.side) this.game.bus.emit('door:pass', { id: 'd_07' });
      band.side = null;
    }
  }

  // Петля лестницы.
  checkStairs() {
    const g = this.game;
    const p = g.player.pos;
    if (p.z < -29.05 || p.z > -24.9 || p.x < 6) return;
    let n = g.world.get('landing', 0);
    if (p.x > 24.2 && p.y < -4.5 && p.y > -7) {
      p.x -= 9;
      p.y += 3;
      n += 1;
    } else if (p.x < 15 && p.x > 12.5 && n > 0 && p.y < -1.8 && p.y > -3.3) {
      p.x += 9;
      p.y -= 3;
      n -= 1;
    } else return;
    g.world.set('landing', n);
    g.bus.emit('stairs:loop', { n });
    if (n >= 3) g.mem.observe('stairs_endless', 'Я спускаюсь уже долго. Таблички меняются, лестница — нет.');
  }

  checkPortals() {
    const g = this.game;
    const p = g.player.pos;
    for (const pt of this.portals) {
      if (p.x > pt.x0 && p.x < pt.x1 && p.z > pt.z0 && p.z < pt.z1 && p.y > pt.y0 && p.y < pt.y1 && pt.active()) {
        p.x += pt.dx;
        p.y += pt.dy;
        p.z += pt.dz;
        g.player.applyCamera(0);
        g.bus.emit('portal:pass', { id: pt.id });
        break;
      }
    }
  }

  // Отсечение невидимых зон.
  cull(pos) {
    for (const z of this.b.zones) {
      const dx = Math.max(z.x0 - pos.x, 0, pos.x - z.x1);
      const dz = Math.max(z.z0 - pos.z, 0, pos.z - z.z1);
      const dy = Math.max(z.y0 - pos.y, 0, pos.y - z.y1);
      z.group.visible = dx * dx + dz * dz < 34 * 34 && dy < 12;
    }
  }
}
