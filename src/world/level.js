// Уровень «Сектор 0» — весь комплекс, его объекты, порталы и реакция на состояние мира.
//
// Ярусы:
//   A (y=0)    медблок, коридоры, архив, котельная, атриум (потолок 10 м) с балконами на 4.5 м
//   балкон     наблюдательная и «комната за стеклом» (y=4.5)
//   C (y=-8)   канализация: канал с водой, газ, лодка, затопленный тоннель, насосная, водосток наружу
//   −1         лаборатория, эхо-камера, шлюз, ядро (удалённая зона; лифт, лестница, люк из насосной)
//   вентиляция две шахты: коридор → котельная, архив → наблюдательная (подъём по наклону)
//
// Невозможная архитектура: «порталы» за пластиковыми шторками, бесконечная лестница,
// три одинаковые кабины лифта. На карте журнала комнаты рисуются там, где они «должны» быть.

import * as THREE from 'three';
import { Door, Pickup, Readable, Inspect, Button, Plate, Crate, Supply, setItemModelFactory } from './objects.js';
import { Props, itemModel } from './props.js';
import { textTexture, updateTextTexture } from '../render/materials.js';
import { ITEMS } from '../systems/inventory.js';
import { worldSecrets } from '../systems/story.js';
import { Horror } from './horror.js';

const L0 = { level: '0' };
const LC = { level: 'C' };
const BAL = 4.5; // высота балкона атриума
const SEW = -8; // уровень пола канализации
const WATER = -9.1; // уровень воды в канале
export { SEW, WATER, BAL };
setItemModelFactory(itemModel);

export class Level {
  constructor(game) {
    this.game = game;
    this.b = game.builder;
    this.m = game.mats;
    this.p = new Props(this.b, this.m);
    this.doors = {};
    this.pickups = {};
    this.supplies = [];
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
    this.gasZones = [];
    this.waters = [];
    this.drips = [];
    this.ventMouths = [];
    this.grates = {};
    this.time = 0;
    this.secrets = worldSecrets(game.mem.seed);
    this.passBand = null;

    this.buildZones();
    this.buildStart();
    this.buildCorridors();
    this.buildArchive();
    this.buildGenerator();
    this.buildHall();
    this.buildObservation();
    this.buildStairs();
    this.buildVents();
    this.buildSewer();
    this.buildRoom07();
    this.buildReflection();
    this.buildLab();
    this.buildCore();
    this.buildVoid();
    this.buildElevator();
    this.buildSupplies();
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
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.04;
    mesh.add(hit);
    const p = new Pickup(this.game, { item, mesh, x, y, z, zone, ...extra });
    this.pickups[item] = p;
    return this.add(p);
  }

  // Расходники (батарейки, стимуляторы, фильтры, бутылки) — много экземпляров одного вида.
  supply(kind, x, y, z, zone) {
    const id = `${kind}_${this.supplies.length}`;
    const s = new Supply(this.game, { id, kind, x, y, z, zone });
    this.supplies.push(s);
    return this.add(s);
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

  // Плоскость воды с бегущей рябью.
  water(x0, z0, x1, z1, y, zone) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), this.m.water);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    this.b.groupOf(zone).add(m);
    this.waters.push(m);
    return m;
  }

  // Металлическая лестница-стремянка на стене (визуал).
  ladderMesh(x, z, y0, y1, zone, facingX = false) {
    const g = new THREE.Group();
    const h = y1 - y0;
    for (const s of [-0.22, 0.22]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), this.m.rust);
      rail.position.set(facingX ? 0 : s, h / 2, facingX ? s : 0);
      g.add(rail);
    }
    for (let y = 0.3; y < h; y += 0.32) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6), this.m.rust);
      rung.rotation.z = facingX ? 0 : Math.PI / 2;
      rung.rotation.x = facingX ? Math.PI / 2 : 0;
      rung.position.set(0, y, 0);
      g.add(rung);
    }
    g.position.set(x, y0, z);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.b.groupOf(zone).add(g);
    return g;
  }

  // ── зоны ──────────────────────────────────────────────────────────────────
  buildZones() {
    const z = (id, name, b, o) => this.b.zone(id, name, b, o);
    // ярус A
    z('start', 'Палата пробуждения', { x0: -3, x1: 3, z0: 0, z1: 7.5 }, { surface: 'lino', map: L0 });
    z('waiting', 'Комната ожидания', { x0: -7, x1: -3, z0: 1, z1: 5 }, { surface: 'lino', map: L0 });
    z('corridor', 'Коридор медблока', { x0: -2, x1: 2, z0: -24, z1: 0, y1: 4 }, { surface: 'tile', map: L0 });
    z('vest07', 'Тамбур', { x0: -5, x1: -2, z0: -16.6, z1: -15.4 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('west', 'Западное крыло', { x0: -16, x1: -2, z0: -10, z1: -6 }, { surface: 'tile', map: L0, ambience: 'corridor' });
    z('vestW', 'Тамбур', { x0: -9.6, x1: -8.4, z0: -6, z1: -3 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('east', 'Восточное крыло', { x0: 2, x1: 16, z0: -10, z1: -6 }, { surface: 'tile', map: L0, ambience: 'corridor' });
    z('vestE', 'Тамбур', { x0: 8.4, x1: 9.6, z0: -13, z1: -10 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('archive', 'Архив', { x0: -28, x1: -16, z0: -16, z1: -2, y1: 5 }, { map: L0 });
    z('generator', 'Котельная', { x0: 16, x1: 30, z0: -20, z1: -2, y1: 7.5 }, { surface: 'metal', map: L0, fog: { color: 0x060403, density: 0.042 } });
    z('hall', 'Атриум', { x0: -12, x1: 12, z0: -48, z1: -24, y0: -1, y1: 11 }, { surface: 'tile', map: L0, fog: { color: 0x040505, density: 0.032 } });
    z('lift0', 'Лифт', { x0: -1.2, x1: 1.2, z0: -50.6, z1: -48 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: L0 });
    z('observation', 'Наблюдательная', { x0: -22, x1: -12, z0: -44, z1: -34, y0: 3.8, y1: 8 }, { surface: 'carpet', map: L0, priority: 2 });
    z('glass', 'За стеклом', { x0: -32, x1: -22, z0: -44, z1: -34, y0: 3.8, y1: 8 }, { map: L0, priority: 2 });
    z('stairs', 'Лестница', { x0: -48, x1: -12, z0: -32, z1: -28, y0: -14, y1: 3.4 }, { map: L0 });
    z('stairsVest', 'Лестница', { x0: -23.1, x1: -21.9, z0: -34.6, z1: -32, y0: -4.5, y1: 0 }, { memoryId: 'stairs', ambience: 'stairs' });
    // вентиляция
    z('vent1', 'Вентиляция', { x0: 2, x1: 16, z0: -18.6, z1: -17.4, y0: -0.5, y1: 1.3 }, { memoryId: 'vent', ambience: 'vent', surface: 'metal', crouch: true, priority: 3 });
    z('vent2', 'Вентиляция', { x0: -20.6, x1: -19.4, z0: -34, z1: -16, y0: -0.5, y1: 6 }, { memoryId: 'vent', ambience: 'vent', surface: 'metal', crouch: true, priority: 3 });
    // ярус C — канализация
    const sew = { y0: SEW - 3, y1: SEW + 5 };
    z('sewer', 'Коллектор', { x0: 22, x1: 32, z0: -22, z1: -8, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x050807, density: 0.045 } });
    z('canal', 'Канал', { x0: 32, x1: 58, z0: -18, z1: -12, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x050807, density: 0.045 } });
    z('gas', 'Газ', { x0: 44, x1: 56, z0: -18, z1: -12, ...sew }, { memoryId: 'canal', ambience: 'canal', surface: 'wet', fog: { color: 0x101c08, density: 0.16 }, priority: 2 });
    z('flooded', 'Затопленный тоннель', { x0: 58, x1: 90, z0: -18, z1: -12, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x0a1206, density: 0.1 } });
    z('pump', 'Насосная станция', { x0: 90, x1: 104, z0: -24, z1: -6, ...sew }, { surface: 'metal', map: LC, fog: { color: 0x050807, density: 0.042 } });
    z('outflow', 'Водосток', { x0: 104, x1: 122, z0: -16.5, z1: -11.5, ...sew }, { surface: 'wet', map: LC });
    z('outside', 'Снаружи', { x0: 122, x1: 170, z0: -40, z1: 20, y0: SEW - 4, y1: SEW + 30 }, { surface: 'mud', fog: { color: 0x0b1018, density: 0.035 } });
    // удалённые зоны
    z('room07', 'Комната 0-7', { x0: -77, x1: -62, z0: -22, z1: -10, y1: 5 }, { map: { level: '0', x0: -17, x1: -5, z0: -22, z1: -10 } });
    z('reflection', 'Отражение', { x0: -63, x1: -57, z0: 32, z1: 41.5 }, { surface: 'lino', map: { level: '0', x0: -3, x1: 3, z0: -30, z1: -24 } });
    z('lab', 'Лаборатория', { x0: 94, x1: 106, z0: -6, z1: 8.6 }, { surface: 'tile', map: { level: '-1' } });
    z('lift1', 'Лифт', { x0: 98.8, x1: 101.2, z0: -8.6, z1: -6 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: '-1' } });
    z('echo', 'Эхо-камера', { x0: 106, x1: 114, z0: -6, z1: 2 }, { surface: 'carpet', map: { level: '-1' } });
    z('gate', 'Шлюз', { x0: 80, x1: 94, z0: -6, z1: 6, y1: 5 }, { map: { level: '-1' } });
    z('core', 'Ядро', { x0: 64, x1: 80, z0: -6, z1: 6, y1: 7 }, { map: { level: '-1' } });
    z('void', 'Этаж Ø', { x0: -10, x1: 10, z0: 100, z1: 120, y1: 6 }, { surface: 'void', fog: { color: 0xd4d7d3, density: 0.045 }, map: { level: 'Ø' } });
    z('liftV', 'Лифт', { x0: -1.2, x1: 1.2, z0: 97.4, z1: 100 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: 'Ø' } });
    // газ: где без противогаза нельзя дышать
    this.gasZones.push({ x0: 44, x1: 56, z0: -18, z1: -12, y0: SEW - 3, y1: SEW + 5 }, { x0: 66, x1: 82, z0: -18, z1: -12, y0: SEW - 3, y1: SEW + 5 });
  }

  // ── ПАЛАТА ПРОБУЖДЕНИЯ ────────────────────────────────────────────────────
  buildStart() {
    const { b, p, m } = this;
    const Z = 'start';
    b.box(-3, -0.2, 0, 3, 0, 7.5, 'lino', { zone: Z, collide: false });
    b.box(-3, 3, 0, 3, 3.2, 7.5, 'ceiling', { zone: Z, collide: false, cast: false });
    b.floor(-3, 0, 3, 7.5, 0, 'lino');
    b.wallX(0, -3, 3, 0, 3, 'paint', Z, [{ a: -0.5, b: 0.5 }]);
    b.wallZ(-3, 0, 7.5, 0, 3, 'paint', Z, [{ a: 2.5, b: 3.5 }]);
    b.wallZ(3, 0, 7.5, 0, 3, 'paint', Z);
    // подвижная южная стена (Правило 4: комната «удлиняется») — с UV в мировых метрах
    this.startWall = new THREE.Group();
    const wg = new THREE.BoxGeometry(5.8, 3, 0.2);
    const wallMesh = new THREE.Mesh(wg, m.paint);
    wallMesh.position.set(0, 1.5, 0);
    wallMesh.receiveShadow = true;
    const pos = wg.attributes.position;
    const nor = wg.attributes.normal;
    const uv = wg.attributes.uv;
    const ts = m.paint.userData.texScale || 3;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i));
      const u = nx > 0.5 ? pos.getZ(i) : pos.getX(i);
      uv.setXY(i, u / ts, (pos.getY(i) + 1.5) / ts);
    }
    this.startWall.add(wallMesh);
    b.groupOf(Z).add(this.startWall);
    this.startWallCol = b.addCollider({ x0: -2.9, x1: 2.9, y0: 0, y1: 3, z0: 5.9, z1: 6.1 });
    // часы на подвижной стене: остановились на секретном времени (код шкафа)
    const clockTex = textTexture(this.secrets.clock, { w: 256, h: 112, bg: '#0b0b0b', fg: '#ff4a2a', font: 'bold 76px Consolas, monospace' });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: clockTex }));
    clock.position.set(-1.2, 2.2, -0.11);
    clock.rotation.y = Math.PI;
    this.startWall.add(clock);
    this.inspect({ id: 'clock', mesh: clock, zone: Z, text: () => `Электронные часы. Стоят: ${this.secrets.clock}. Батарейка на месте. Они просто не идут.` });
    this.clock2Tex = textTexture('00:00', { w: 256, h: 112, bg: '#0b0b0b', fg: '#7aff9a', font: 'bold 76px Consolas, monospace' });
    this.clock2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: this.clock2Tex }));
    this.clock2.position.set(1.2, 2.2, -0.11);
    this.clock2.rotation.y = Math.PI;
    this.startWall.add(this.clock2);
    this.inspect({ id: 'clock2', mesh: this.clock2, zone: Z, when: () => this.clock2.visible, text: 'Вторые часы. Идут. Показывают, сколько я уже здесь.' });

    // больничная койка с ремнями
    this.bedGroup = p.bed(2.3, 4.2, 0, Z);
    for (const zz of [-0.4, 0.5]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.07), m.rubber);
      strap.position.set(0, 0.61, zz);
      this.bedGroup.add(strap);
    }
    b.addCollider({ x0: 1.85, x1: 2.75, y0: 0, y1: 0.6, z0: 3.2, z1: 5.2 }, 'prop');
    this.bedCol = b.colliders[b.colliders.length - 1];
    const pillowNote = itemModel('note', m);
    pillowNote.position.set(0.1, 0.7, -0.55);
    pillowNote.scale.setScalar(0.7);
    this.bedGroup.add(pillowNote);
    this.add(new Readable(this.game, { note: 'n_start', mesh: pillowNote, zone: Z }));
    // капельница
    const iv = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 6), m.metal);
    pole.position.y = 0.95;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x9a3a2a, roughness: 0.2, transparent: true, opacity: 0.75 }));
    bag.position.set(0.08, 1.75, 0);
    iv.add(pole, bag);
    iv.position.set(1.5, 0, 3.4);
    b.groupOf(Z).add(iv);

    p.table(2.6, 1.2, 0.7, 1.6, Z);
    const t0 = p.terminal(2.65, 0.75, -Math.PI / 2, Z);
    this.button({ id: 't0', mesh: t0, zone: Z, prompt: 'Терминал', action: () => this.game.story.openTerminal('t0') });
    this.emitter('term0', 'buzz', 2.6, 1, 0.75, () => true, 0.5, 6);
    this.pickup('flashlight', 2.55, 0.77, 1.65, Z, { ry: 0.6 });
    p.chair(1.9, 1.2, -Math.PI / 2, Z);
    const photo = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.015), m.wood);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 }));
    pic.position.z = 0.009;
    photo.add(frame, pic);
    photo.position.set(2.8, 0.86, 0.6);
    photo.rotation.set(-0.15, -Math.PI / 2, 0);
    b.groupOf(Z).add(photo);
    this.shiftables.start_photo = { room: 'start', apply: () => photo.rotation.set(Math.PI / 2, -Math.PI / 2, 0), obj: photo };
    this.inspect({ id: 'photo', mesh: photo, zone: Z, text: () => (this.game.world.get('shift_start_photo') ? 'Фотография лежит лицом вниз. Я её не трогал.' : 'Фотография. Пустая палата. Эта палата. Снято с того места, где стоит койка.') });
    // раковина и зеркало (зеркало настоящее — в нём отражается комната)
    b.box(2.55, 0.75, 2.3, 2.95, 0.9, 2.9, 'plasticLight', { zone: Z, collide: false });
    b.addCollider({ x0: 2.5, x1: 3, y0: 0, y1: 0.9, z0: 2.3, z1: 2.9 }, 'prop');
    b.box(2.85, 0.2, 2.5, 2.95, 0.75, 2.7, 'metalDark', { zone: Z, collide: false });
    this.mirrorSpot = { x: 2.88, y: 1.55, z: 2.6 };

    this.paper('n_rules', -2.88, 1.6, 1.3, Z, { ry: Math.PI / 2, wall: true });
    p.fixture(0, 3, 3.2, Z, { mode: 'always', lo: 4, hi: 4, warm: true, color: 0xffe2c0, range: 8, flicker: 0.05 });
    this.door({ id: 'd_start', axis: 'x', x: 0, z: 0, zone: Z, sign: textTexture('0-0', { w: 128, h: 64, font: 'bold 34px Consolas' }) });

    // ── комната ожидания (появляется на 4-м этапе) ──
    const W = 'waiting';
    b.room({ x0: -7, x1: -3, z0: 1, z1: 5, zone: W, floor: 'lino', wall: 'paint', walls: { e: false }, surface: 'lino' });
    for (let i = 0; i < 4; i++) p.chair(-6.4 + i * 0.75, 1.55, Math.PI, W);
    p.table(-5, 4.2, 1.2, 0.6, W);
    this.pickup('fuse_d', -5.2, 0.77, 4.2, W, { ry: 0.3 });
    this.paper('n_waiting', -4.6, 0.77, 4.15, W, { ry: -0.2 });
    p.fixture(-5, 3, 3, W, { mode: 'always', lo: 2.5, hi: 2.5, flicker: 0.35 });
    this.door({ id: 'd_waiting', axis: 'z', x: -3, z: 3, zone: Z, hidden: () => this.game.world.get('startStage', 0) < 4 });
    // заглушка утоплена на 2 см, чтобы не мерцала с соседними участками стены
    this.plug({ x0: -3.08, x1: -2.92, y0: 0, y1: 2.2, z0: 2.5, z1: 3.5 }, 'paint', Z, () => this.game.world.get('startStage', 0) < 4);
    this.emitter('secret_waiting', 'secret', -3, 1.2, 3, () => this.game.world.get('startStage', 0) < 4, 1, 10);
    this.observerAnchors.push({ x: 0, y: 0, z: -0.8, zone: 'corridor' });
  }

  // ── КОРИДОРЫ МЕДБЛОКА ─────────────────────────────────────────────────────
  buildCorridors() {
    const { b, p } = this;
    const C = 'corridor';
    const H = 3.6;
    b.room({
      x0: -2, x1: 2, z0: -24, z1: 0, h: H, zone: C, floor: 'tiles', wall: 'hospital', surface: 'tile',
      walls: { n: false, s: false, w: [{ a: -10, b: -6, top: H }, { a: -16.5, b: -15.5 }], e: [{ a: -10, b: -6, top: H }, { a: -18.6, b: -17.4, top: 1.15 }] },
    });
    // пилястры и трубы — объём
    for (const z of [-3, -12, -20]) for (const x of [-2, 2]) b.box(x - 0.25, 0, z - 0.3, x + 0.25, H, z + 0.3, 'concrete', { zone: C });
    for (let i = 0; i < 3; i++) p.pipe(-2, H - 0.25 - i * 0.14, -1.7 + 0, -2, -23, 0.06, C, i % 2 ? 'rust' : 'metal');
    p.pipe(1.75, H - 0.3, -0.5, 1.75, -23.5, 0.09, C, 'metalDark');
    // поручни вдоль стен
    for (const x of [-1.93, 1.93]) b.box(x - 0.03, 0.9, -23.5, x + 0.03, 0.95, -0.5, 'metal', { zone: C, collide: false });
    [-4, -9, -14, -19.5].forEach((z, i) => p.fixture(0, H, z, C, { lo: 1.4, hi: 5, flicker: i === 2 ? 0.3 : 0.05 }));
    this.emitter('lamp_c', 'lamp', 0, H - 0.2, -14, () => true, 0.6, 8);

    p.sign(['← КОТЕЛЬНАЯ    АРХИВ →'], 0, 3.0, -5.6, Math.PI, C, { w: 1.8, h: 0.24, tw: 512, th: 64 });
    this.junctionSign = p.sign(['← АРХИВ    КОТЕЛЬНАЯ →'], 0, 3.0, -5.62, 0, C, { w: 1.8, h: 0.24, tw: 512, th: 64 });
    this.shiftables.corridor_sign = { room: 'corridor', apply: () => updateTextTexture(this.junctionSign.userData.tex, ['← КОТЕЛЬНАЯ    АРХИВ →']) };
    p.sign(['АТРИУМ ↑  ЛИФТ'], 1.88, 2.4, -21, -Math.PI / 2, C, { w: 1.0, h: 0.2, tw: 384, th: 64 });
    this.tallyL = p.sign([''], -1.88, 1.3, -10.6, Math.PI / 2, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
    this.tallyR = p.sign([''], 1.88, 1.3, -10.6, -Math.PI / 2, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
    this.inspect({ id: 'tally', mesh: this.tallyL, zone: C, text: 'Царапины на кафеле, сгруппированные по пять. Свежие.' });
    this.inspect({ id: 'tally_r', mesh: this.tallyR, zone: C, text: 'Царапины. Их число как будто меняется.' });

    // ДВЕРЬ 0-7 (Правило 1)
    this.door({ id: 'd_07', axis: 'z', x: -2, z: -16, zone: C, locked: true, lamp: true, lampSide: 1, mat: 'doorRed', sign: textTexture('0-7', { w: 128, h: 64, font: 'bold 34px Consolas' }), lockText: 'Заперто. За дверью — тишина. Слишком ровная тишина.' });
    this.emitter('secret_07', 'secret', -2.2, 1.2, -16, () => !this.game.mem.rule('three_passes').done, 1, 10);
    this.passBand = { z0: -18.2, z1: -13.8, side: null };
    const V = 'vest07';
    b.room({ x0: -5, x1: -2, z0: -16.6, z1: -15.4, h: 2.6, zone: V, floor: 'concreteDark', wall: 'concreteDark', walls: { e: false } });
    this.curtain('z', -3.5, -16.6, -15.4, 2.6, V);
    this.portal('room07', { x0: -5, x1: -3.52, z0: -16.6, z1: -15.4 }, [-60, 0, 0]);

    // шторка-шлюз в конце коридора (Правило 9)
    this.wornCurtain = this.curtain('x', -22, -2, 2, H, C, { id: 'worn' });
    this.portal('reflection', { x0: -2, x1: 2, z0: -23.4, z1: -22.05 }, [-60, 0, 62], () => !!this.game.world.get('reflectionPortal'));
    this.emitter('secret_worn', 'secret', 0, 2.5, -22, () => !this.game.mem.rule('worn_path').done && this.game.mem.rule('worn_path').progress > 0.6, 0.6, 9);

    // западное крыло
    const WW = 'west';
    b.room({ x0: -16, x1: -2, z0: -10, z1: -6, h: H, zone: WW, floor: 'tiles', wall: 'hospital', surface: 'tile', walls: { e: false, w: [{ a: -8.5, b: -7.5 }], s: [{ a: -9.5, b: -8.5 }] } });
    [-5.5, -12].forEach((x) => p.fixture(x, H, -8, WW, { lo: 1.3, hi: 4.5 }));
    this.westPoster = p.sign(['СЕКТОР 0', '', 'ВЫ ЗДЕСЬ  ●'], -5, 1.6, -9.88, 0, WW, { w: 0.7, h: 0.9, bg: '#c8c4b4', fg: '#2a2a2a', tw: 256, th: 320 });
    this.inspect({ id: 'poster', mesh: this.westPoster, zone: WW, text: () => (this.game.world.get('shift_west_poster') ? 'План эвакуации. Точка «Вы здесь» теперь стоит за дверью 0-7.' : 'План эвакуации. Точка «Вы здесь». Коридоров на плане меньше, чем я прошёл.') });
    this.shiftables.west_poster = { room: 'west', apply: () => updateTextTexture(this.westPoster.userData.tex, ['СЕКТОР 0', '', 'ВЫ ЗДЕСЬ  ● 0-7']) };
    this.observerAnchors.push({ x: -15.2, y: 0, z: -8, zone: WW });

    // восточное крыло
    const EE = 'east';
    b.room({ x0: 2, x1: 16, z0: -10, z1: -6, h: H, zone: EE, floor: 'tiles', wall: 'hospital', surface: 'tile', walls: { w: false, e: [{ a: -8.5, b: -7.5 }], n: [{ a: 8.5, b: 9.5 }] } });
    [5.5, 12.5].forEach((x) => p.fixture(x, H, -8, EE, { lo: 1.3, hi: 4.5, flicker: x > 10 ? 0.35 : 0 }));
    p.pipe(2, H - 0.3, -9.7, 16, -9.7, 0.07, EE, 'rust');
    p.pipe(2, H - 0.15, -9.75, 16, -9.75, 0.05, EE, 'metalDark');
    this.observerAnchors.push({ x: 15.2, y: 0, z: -8, zone: EE });

    // ДВЕРЬ-ПЕТЛЯ (Правило 6): из западного крыла — в восточное
    const hiddenLoop = () => !this.game.world.get('loopDoor');
    this.door({ id: 'd_loop', axis: 'x', x: -9, z: -6, zone: WW, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop_e', { open }), sign: textTexture('В-В', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
    this.door({ id: 'd_loop_e', axis: 'x', x: 9, z: -10, zone: EE, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop', { open }), sign: textTexture('З-З', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
    this.plug({ x0: -9.5, x1: -8.5, y0: 0, y1: 2.2, z0: -6.08, z1: -5.92 }, 'hospital', WW, hiddenLoop);
    this.plug({ x0: 8.5, x1: 9.5, y0: 0, y1: 2.2, z0: -10.08, z1: -9.92 }, 'hospital', EE, hiddenLoop);
    this.emitter('secret_loop', 'secret', -9, 1.2, -6.1, hiddenLoop, 0.7, 9);
    b.room({ x0: -9.6, x1: -8.4, z0: -6, z1: -3, h: 2.4, zone: 'vestW', floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
    this.curtain('x', -4.5, -9.6, -8.4, 2.4, 'vestW');
    b.room({ x0: 8.4, x1: 9.6, z0: -13, z1: -10, h: 2.4, zone: 'vestE', floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
    this.curtain('x', -11.5, 8.4, 9.6, 2.4, 'vestE');
    this.portal('loop', { x0: -9.6, x1: -8.4, z0: -4.48, z1: -3 }, [18, 0, -7]);
    this.portal('loop', { x0: 8.4, x1: 9.6, z0: -13, z1: -11.52 }, [-18, 0, 7]);
  }

  // ── АРХИВ ─────────────────────────────────────────────────────────────────
  buildArchive() {
    const { b, p, m } = this;
    const A = 'archive';
    b.room({ x0: -28, x1: -16, z0: -16, z1: -2, h: 4.5, zone: A, floor: 'concreteDark', wall: 'paint', walls: { e: [{ a: -8.5, b: -7.5 }], n: [{ a: -20.6, b: -19.4, top: 1.15 }] } });
    this.door({ id: 'd_archive', axis: 'z', x: -16, z: -8, zone: A, sign: textTexture('АРХИВ', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
    p.shelf(-27.6, -15.5, -2.6, A, { h: 3.6 });
    p.shelf(-24.2, -14.6, -10.2, A, { h: 3, d: 0.9 });
    p.shelf(-24.2, -7, -2.8, A, { h: 3, d: 0.9 });
    p.shelf(-21.5, -14.6, -11.4, A, { h: 2.2, d: 0.6 });
    p.fixture(-21, 4.5, -5, A, { lo: 1.1, hi: 4.5 });
    p.fixture(-21, 4.5, -12, A, { lo: 1.1, hi: 4.5, flicker: 0.2 });

    // читальный стол
    p.table(-18.6, -4.4, 1.6, 0.9, A);
    const chair = p.chair(-18.6, -3.6, 0, A);
    this.shiftables.archive_chair = { room: 'archive', apply: () => { chair.position.set(-20.6, 0, -8.2); chair.rotation.y = -Math.PI / 2; } };
    const lampG = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.y = 0.38;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), m.metal);
    stem.position.y = 0.17;
    lampG.add(shade, stem);
    lampG.position.set(-19.2, 0.76, -4.7);
    b.groupOf(A).add(lampG);
    b.light({ x: -19.2, y: 1.05, z: -4.6, color: 0xffd8a0, mode: 'always', lo: 2.2, hi: 2.2, range: 4.5, zone: A, phase: 1 });
    this.pickup('fork', -18.2, 0.77, -4.3, A, { ry: 0.4 });
    this.paper('n_route', -18.9, 0.77, -4.5, A, { ry: -0.3 });
    p.table(-26.4, -8.6, 0.7, 0.7, A);
    this.paper('n_lanskaya1', -26.4, 0.77, -8.6, A, { ry: 0.5 });

    // проектор с кассетой (лор)
    p.table(-17.2, -13.5, 1.0, 0.7, A);
    const proj = new THREE.Group();
    const pbody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), m.plastic);
    pbody.position.y = 0.11;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), m.metal);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.12, -0.2);
    proj.add(pbody, lens);
    proj.position.set(-17.2, 0.76, -13.4);
    proj.rotation.y = Math.PI;
    b.groupOf(A).add(proj);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.9 }));
    screen.position.set(-17.2, 2.0, -2.15);
    screen.rotation.y = Math.PI;
    b.groupOf(A).add(screen);
    this.pickup('tape1', -17.0, 0.77, -13.65, A, { ry: 0.2 });

    // терминал архива
    p.table(-22, -2.5, 1.2, 0.7, A);
    const t2 = p.terminal(-22, -2.6, Math.PI, A);
    this.button({ id: 't2', mesh: t2, zone: A, prompt: 'Терминал', action: () => this.game.story.openTerminal('t2') });
    this.terminalArchive = t2;
    this.emitter('term2', 'buzz', -22, 1, -2.6, () => true, 0.5, 6);

    const cat = p.cabinet(-16.9, -10.6, -Math.PI / 2, A, { w: 1, h: 1.3, d: 0.6 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const dr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), m.wood);
      dr.position.set(-0.36 + c * 0.24, 0.2 + r * 0.28, 0.31);
      cat.add(dr);
    }
    b.addCollider({ x0: -17.2, x1: -16.6, y0: 0, y1: 1.3, z0: -11.1, z1: -10.1 }, 'prop');
    this.inspect({ id: 'catalog', mesh: cat, zone: A, text: 'Каталожный шкаф. Ящики подписаны датами. Все даты — один и тот же день.' });

    // шкаф с делами — кодовый замок (Головоломка 1)
    const cx = -23;
    const cz0 = -16;
    const cz1 = -15.35;
    b.box(cx - 0.6, 0, cz0, cx + 0.6, 1.9, cz0 + 0.05, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 0, cz0, cx - 0.55, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx + 0.55, 0, cz0, cx + 0.6, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 1.85, cz0, cx + 0.6, 1.9, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.6, 0, cz0, cx + 0.6, 0.05, cz1, 'metal', { zone: A, collide: false });
    b.box(cx - 0.55, 0.92, cz0, cx + 0.55, 0.95, cz1, 'metal', { zone: A, collide: false });
    b.addCollider({ x0: cx - 0.6, x1: cx + 0.6, y0: 0, y1: 1.9, z0: cz0, z1: cz1 - 0.05 }, 'prop');
    this.door({ id: 'd_cabinet', axis: 'x', x: cx, z: cz1, w: 1.1, h: 1.85, zone: A, locked: true, mat: 'metal', lockText: 'Шкаф заперт. Рядом — кодовая панель.' });
    this.pickup('fuse_b', cx - 0.25, 0.96, -15.7, A);
    this.pickup('keycard', cx + 0.2, 0.96, -15.7, A, { ry: 0.3 });
    this.paper('n_file0', cx, 0.06, -15.7, A, { ry: 0.1 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), m.plastic);
    pad.position.set(cx + 0.85, 1.3, -15.87);
    const padScr = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), m.lampGreen);
    padScr.position.set(0, 0.07, 0.021);
    pad.add(padScr);
    b.groupOf(A).add(pad);
    p.sign(['ВРЕМЯ ОСТАНОВКИ'], cx + 0.85, 1.6, -15.89, 0, A, { w: 0.3, h: 0.06, tw: 256, th: 48 });
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
    this.observerAnchors.push({ x: -26.5, y: 0, z: -12, zone: A });
  }

  // ── КОТЕЛЬНАЯ ─────────────────────────────────────────────────────────────
  buildGenerator() {
    const { b, p, m } = this;
    const G = 'generator';
    const H = 7;
    b.room({ x0: 16, x1: 30, z0: -20, z1: -2, h: H, zone: G, floor: 'concreteDark', wall: 'brick', surface: 'metal', walls: { w: [{ a: -8.5, b: -7.5 }, { a: -18.6, b: -17.4, top: 1.15 }] } });
    this.door({ id: 'd_generator', axis: 'z', x: 16, z: -8, zone: G, sign: textTexture('КОТЕЛЬНАЯ', { w: 128, h: 64, font: 'bold 22px Consolas' }) });
    // два больших котла
    for (const [cx, cz] of [[26, -6], [26, -12]]) {
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5, 24), m.rust);
      boiler.position.set(cx, 2.5, cz);
      boiler.castShadow = boiler.receiveShadow = true;
      b.groupOf(G).add(boiler);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.rust);
      cap.position.set(cx, 5, cz);
      b.groupOf(G).add(cap);
      b.addCollider({ x0: cx - 1.6, x1: cx + 1.6, y0: 0, y1: 6.6, z0: cz - 1.6, z1: cz + 1.6 });
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 16), m.doorRed);
      valve.position.set(cx - 1.7, 1.3, cz);
      valve.rotation.y = Math.PI / 2;
      b.groupOf(G).add(valve);
      p.pipe(cx, 5.8, cz, cx, -20, 0.18, G, 'rust');
    }
    this.emitter('gen_machine', 'machine', 26, 1.5, -9, () => true, 1, 26);
    // свечение топок котлов
    for (const cz of [-6, -12]) {
      const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
      fire.position.set(24.38, 0.6, cz);
      fire.rotation.y = -Math.PI / 2;
      b.groupOf(G).add(fire);
      b.light({ x: 23.6, y: 0.8, z: cz, color: 0xff7030, mode: 'always', lo: 3.2, hi: 3.2, range: 9, zone: G, phase: cz, flicker: 0.25 });
    }
    // мостки под потолком (объём)
    b.box(28, 3.5, -20, 30, 3.6, -2, 'grate', { zone: G, collide: false });
    for (let z = -19; z <= -3; z += 2) b.box(27.95, 3.6, z, 28.0, 4.6, z + 0.05, 'metal', { zone: G, collide: false });
    b.box(27.95, 4.55, -20, 28.0, 4.6, -2, 'metal', { zone: G, collide: false });
    for (let i = 0; i < 5; i++) p.pipe(16, H - 0.3 - i * 0.22, -19.6 + i * 0.3, 30, -19.6 + i * 0.3, 0.08, G, i % 2 ? 'metal' : 'rust');
    p.fixture(20, H, -6, G, { lo: 3.5, hi: 8, flicker: 0.4, range: 15 });
    p.fixture(21, H, -15, G, { lo: 3.5, hi: 8, range: 15 });
    p.wallLamp(16.25, 2.6, -13, G, { color: 0xff2a1a, lo: 1.8, hi: 0.4, mode: 'mixedInv', range: 7 });

    // щит на три предохранителя (Головоломка 2)
    b.box(18.3, 0.9, -20, 21.7, 2.1, -19.82, 'metalDark', { zone: G, collide: false });
    p.sign(['ЩИТ ПИТАНИЯ СЕКТОРА 0', 'Щ-1    Щ-2    Щ-3'], 20, 2.3, -19.89, 0, G, { w: 1.4, h: 0.26, tw: 512, th: 96 });
    this.fuseVisuals = [];
    this.fuseLamps = [];
    [19, 20, 21].forEach((x, i) => {
      const sock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.08), m.dark);
      sock.position.set(x, 1.45, -19.78);
      b.groupOf(G).add(sock);
      const fuse = itemModel('fuse', m);
      fuse.rotation.z = Math.PI / 2;
      fuse.position.set(x, 1.45, -19.72);
      fuse.visible = false;
      b.groupOf(G).add(fuse);
      this.fuseVisuals.push(fuse);
      const lampMat = m.lampRed.clone();
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), lampMat);
      lamp.position.set(x, 1.75, -19.78);
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
    const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.12), m.metalDark);
    leverBase.position.set(22.8, 1.4, -19.85);
    b.groupOf(G).add(leverBase);
    this.leverArm = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), m.metal);
    arm.position.y = 0.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m.doorRed);
    knob.position.y = 0.42;
    this.leverArm.add(arm, knob);
    this.leverArm.position.set(22.8, 1.4, -19.72);
    this.leverArm.rotation.x = 0.9;
    b.groupOf(G).add(this.leverArm);
    const leverPrompt = () => (this.game.world.get('power') ? 'Рубильник включён' : 'Включить рубильник');
    this.button({ id: 'lever', mesh: leverBase, zone: G, prompt: leverPrompt, action: () => this.game.puzzles.pullLever() });
    this.add(new Button(this.game, { id: 'lever_arm', mesh: this.leverArm, zone: G, prompt: leverPrompt, action: () => this.game.puzzles.pullLever() }));

    p.shelf(16.5, -6.5, -3.0, G, { h: 2.1, books: false });
    this.pickup('fuse_a', 16.5, 1.16, -4.4, G, { ry: 1.2 });
    p.table(19.5, -2.6, 1.4, 0.6, G);
    p.chair(19.5, -3.3, Math.PI, G);
    this.paper('n_generator', 19.2, 0.77, -2.65, G, { ry: 0.2 });
    this.pickup('tape2', 19.9, 0.77, -2.55, G, { ry: -0.4 });
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.6, side: THREE.DoubleSide }));
    bucket.position.set(23.5, 0.15, -16);
    b.groupOf(G).add(bucket);
    this.shiftables.gen_bucket = { room: 'generator', apply: () => bucket.position.set(20, 0.15, -19.3) };

    // люк в канализацию + лестница вниз
    const hatch = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), m.rust);
    ring.position.y = 0.03;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), m.black);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.065;
    hatch.add(ring, hole);
    hatch.position.set(27, 0, -18.4);
    b.groupOf(G).add(hatch);
    p.sign(['КОЛЛЕКТОР ↓'], 27, 1.6, -19.88, 0, G, { w: 0.7, h: 0.18, tw: 384, th: 64 });
    this.button({ id: 'hatch_down', mesh: hatch, zone: G, range: 2.6, prompt: 'Спуститься в канализацию', action: () => this.game.survival.climb({ x: 27, y: SEW, z: -21.0, yaw: Math.PI }, 'down') });
    this.observerAnchors.push({ x: 29, y: 0, z: -3, zone: G });
  }

  // ── АТРИУМ (10 м в высоту, балконы на 4.5 м) ──────────────────────────────
  buildHall() {
    const { b, p, m } = this;
    const H = 'hall';
    const HH = 10;
    b.box(-12, -0.2, -48, 12, 0, -24, 'tiles', { zone: H, collide: false });
    b.box(-12, HH, -48, 12, HH + 0.2, -24, 'concreteDark', { zone: H, collide: false, cast: false });
    b.floor(-12, -48, 12, -24, 0, 'tile');
    b.wallX(-24, -12, 12, 0, HH, 'concrete', H, [{ a: -2, b: 2, top: 3.6 }]);
    b.wallX(-48, -12, 12, 0, HH, 'concrete', H, [{ a: -1, b: 1, top: 2.4 }]);
    b.wallZ(-12, -48, -24, 0, HH, 'concrete', H, [{ a: -30.5, b: -29.5 }, { a: -39.5, b: -38.5, bottom: BAL, top: BAL + 2.2 }]);
    b.wallZ(12, -48, -24, 0, HH, 'concrete', H);
    // балконы: север, запад, восток
    const slab = (x0, z0, x1, z1) => {
      b.box(x0, BAL - 0.3, z0, x1, BAL, z1, 'concreteDark', { zone: H, collide: false });
      b.floor(x0, z0, x1, z1, BAL, 'concrete');
      b.addCollider({ x0, x1, y0: BAL - 0.3, y1: BAL - 0.02, z0, z1 }, 'slab');
    };
    slab(-12, -48, 12, -45);
    slab(-12, -45, -9, -30);
    slab(9, -45, 12, -30);
    // перила балконов
    const rail = (x0, z0, x1, z1) => {
      b.box(x0, BAL, z0, x1, BAL + 1.05, z1, 'metal', { zone: H, collide: false });
      b.addCollider({ x0, x1, y0: BAL, y1: BAL + 1.1, z0, z1 }, 'rail');
    };
    rail(-9, -45.05, 9, -44.95);
    rail(-9.05, -45, -8.95, -30);
    rail(-12, -30.05, -9, -29.95);
    rail(8.95, -45, 9.05, -30);
    // опоры под балконами
    for (const z of [-30, -37.5, -45]) {
      b.box(-9.3, 0, z - 0.3, -8.7, BAL, z + 0.3, 'concrete', { zone: H });
      b.box(8.7, 0, z - 0.3, 9.3, BAL, z + 0.3, 'concrete', { zone: H });
    }
    for (const x of [-4.5, 4.5]) b.box(x - 0.3, 0, -45.3, x + 0.3, BAL, -44.7, 'concrete', { zone: H });
    // главная лестница на восточный балкон (подъём на север)
    b.ramp(9, -30, 12, -24.6, 'z', BAL, 0, 'concrete');
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const z1 = -24.6 - (i * 5.4) / steps;
      const z0 = z1 - 5.4 / steps;
      const top = ((i + 1) * BAL) / steps;
      b.box(9, 0, z0, 12, top, z1, 'concrete', { zone: H, collide: false });
    }
    for (let i = 0; i < 6; i++) {
      const z1 = -24.6 - i * 0.9;
      const top = (i * 0.9 * BAL) / 5.4 - 0.45;
      if (top > 0.3) b.addCollider({ x0: 9, x1: 12, y0: 0, y1: top, z0: z1 - 0.9, z1 }, 'stairs');
    }
    b.box(8.95, 0, -30, 9.05, 1, -24.6, 'metal', { zone: H, collide: false });
    // подвесные лампы и центр зала
    [[-5, -31], [5, -31], [-5, -40], [5, -40]].forEach(([x, z], i) => {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.2, 4), m.rubber);
      cable.position.set(x, HH - 1.6, z);
      b.groupOf(H).add(cable);
      p.fixture(x, HH - 3.2, z, H, { lo: 4.5, hi: 10, range: 18, w: 1.0, d: 1.0, flicker: i === 2 ? 0.4 : 0.05 });
    });
    [[-10.5, -38], [10.5, -38], [0, -46.5]].forEach(([x, z]) => p.wallLamp(x, BAL + 2.2, z, H, { lo: 2.6, hi: 3.5, mode: 'mixed', range: 10, flicker: 0.1 }));
    // аварийные лампы на первом этаже: красный и янтарный свет по углам
    [[-11.7, -25.5, 0xff3a20], [11.7, -26.5, 0xffa040], [-8.5, -46.5, 0xffa040], [8.5, -46.5, 0xff3a20], [11.7, -36, 0xffa040]].forEach(([x, z, c]) =>
      p.wallLamp(x, 2.4, z, H, { color: c, lo: 3.2, hi: 1.2, mode: 'mixedInv', range: 11, flicker: 0.15 })
    );
    // стойка регистрации
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.1, 32, 1, true, 0, Math.PI * 1.4), m.wood);
    desk.position.set(0, 0.55, -36);
    desk.material = m.wood;
    b.groupOf(H).add(desk);
    b.addCollider({ x0: -2.2, x1: 2.2, y0: 0, y1: 1.1, z0: -38.2, z1: -35.4 }, 'prop');
    // рухнувшая люстра
    const chand = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.2 - i * 0.3, 0.04, 6, 32), m.metal);
      r.rotation.set(Math.PI / 2 + 0.3, 0, i * 0.4);
      r.position.y = 0.3 + i * 0.12;
      chand.add(r);
    }
    chand.position.set(-4, 0, -31);
    b.groupOf(H).add(chand);
    p.sign(['ИНСТИТУТ ПРИКЛАДНОЙ МНЕМОНИКИ', 'СЕКТОР 0'], 0, BAL + 3.2, -47.88, 0, H, { w: 6, h: 0.9, tw: 1024, th: 160, bg: '#1c1f1e', fg: '#9aa59c' });
    this.door({ id: 'd_obs', axis: 'z', x: -12, z: -39, y: BAL, zone: H, locked: true, requires: 'keycard', lockText: 'Считыватель пропусков мигает красным. Нужен пропуск.', sign: textTexture('НАБЛ.', { w: 128, h: 64, font: 'bold 30px Consolas' }) });
    this.door({ id: 'd_stairs', axis: 'z', x: -12, z: -30, zone: H, sign: textTexture('ЛЕСТН.', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
    p.sign(['НАБЛЮДАТЕЛЬНЫЙ ПОСТ'], -11.88, BAL + 2.5, -39, Math.PI / 2, H, { w: 1.2, h: 0.18, tw: 512, th: 64 });
    p.sign(['ЛЕСТНИЦА ↓'], -11.88, 2.5, -30, Math.PI / 2, H, { w: 0.9, h: 0.18, tw: 384, th: 64 });
    const dir = p.sign(['СЕКТОР 0', 'ЭТАЖИ:  0  ·  −1'], -2.6, 1.7, -47.88, 0, H, { w: 0.9, h: 0.4, tw: 384, th: 160 });
    this.inspect({ id: 'directory', mesh: dir, zone: H, text: () => (this.game.world.get('floorVoid') ? 'Схема этажей: 0, −1. Внизу кто-то процарапал третий: «Ø».' : 'Схема этажей: 0, −1. Больше этажей нет.') });
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), m.wood);
    seat.position.y = 0.45;
    bench.add(seat);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), m.metalDark);
      leg.position.set(sx, 0.22, 0);
      bench.add(leg);
    }
    bench.position.set(-5, 0, -26);
    b.groupOf(H).add(bench);
    this.shiftables.hall_bench = { room: 'hall', apply: () => { bench.position.set(3, 0, -33); bench.rotation.y = Math.PI / 2; } };
    this.observerAnchors.push({ x: -7.5, y: 0, z: -44, zone: H }, { x: 7, y: 0, z: -26, zone: H }, { x: 0, y: BAL, z: -46.5, zone: H });
  }

  // ── НАБЛЮДАТЕЛЬНАЯ И КОМНАТА ЗА СТЕКЛОМ (на балконе) ──────────────────────
  buildObservation() {
    const { b, p, m } = this;
    const O = 'observation';
    const Y = BAL;
    p.yb = Y;
    b.room({ x0: -22, x1: -12, z0: -44, z1: -34, y: Y, zone: O, floor: 'carpet', wall: 'paint', surface: 'carpet', walls: { e: false, s: [{ a: -20.6, b: -19.4, top: 1.15 }], w: [{ a: -42, b: -36, bottom: 0.9, top: 2.4 }, { a: -43.5, b: -42.5 }] } });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), m.glass);
    glass.position.set(-22, Y + 1.65, -39);
    glass.rotation.y = Math.PI / 2;
    b.groupOf(O).add(glass);
    b.addCollider({ x0: -22.05, x1: -21.95, y0: Y + 0.9, y1: Y + 2.4, z0: -42, z1: -36 }, 'glass');
    this.inspect({ id: 'window', mesh: glass, zone: O, range: 3, text: () => (this.game.world.get('falseWallOpen') ? 'Стекло. С этой стороны оно кажется тоньше.' : 'Смотровое окно. За ним — светлая комната со стулом. Входа в неё нет ни из одного коридора.') });
    p.table(-20.6, -39, 0.8, 5.6, O);
    p.chair(-19.6, -39, Math.PI / 2, O);
    this.obsChair = p.chair(-19.4, -36.6, Math.PI / 2, O);
    this.shiftables.obs_chair = { room: 'observation', apply: () => { this.obsChair.position.set(-16, Y, -39); this.obsChair.rotation.y = 0; } };
    const camTexts = [['КАМ 1', 'КОРИДОР МЕДБЛОКА'], ['КАМ 2', 'АРХИВ'], ['КАМ 3', '— НЕТ СИГНАЛА —'], ['КАМ 4', 'ПАЛАТА']];
    [-41.1, -39.8, -38.5, -37.2].forEach((z, i) => {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.42), m.plastic);
      mon.position.set(-20.85, Y + 0.96, z);
      b.groupOf(O).add(mon);
      const scr = p.screen(camTexts[i], -20.69, Y + 0.98, z, Math.PI / 2, O, { w: 0.36, h: 0.27 });
      this.screens.push({ mesh: scr, base: camTexts[i], i });
    });
    const phone = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.22), m.dark);
    pb.position.y = 0.04;
    const hs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.24), m.dark);
    hs.position.set(0, 0.1, 0);
    phone.add(pb, hs);
    phone.position.set(-20.5, Y + 0.76, -36.6);
    b.groupOf(O).add(phone);
    this.button({ id: 'phone', mesh: phone, zone: O, prompt: () => (this.game.world.get('phoneRinging') ? 'Снять трубку' : 'Телефон'), action: () => this.game.puzzles.phone() });
    p.table(-15, -43.4, 1.2, 0.7, O);
    const t3 = p.terminal(-15, -43.3, 0, O);
    this.terminalObs = t3;
    this.button({ id: 't3', mesh: t3, zone: O, prompt: () => (this.game.world.get('power') ? 'Терминал' : 'Терминал (нет питания)'), action: () => (this.game.world.get('power') ? this.game.story.openTerminal('t3') : this.game.ui.hint('Экран тёмный. Нет питания.')) });
    p.fixture(-17, Y + 3, -39, O, { mode: 'main', hi: 3.5, lo: 0 });
    p.fixture(-14, Y + 3, -36, O, { mode: 'main', hi: 3, lo: 0 });
    // ложная стена (Правило 2)
    this.plug({ x0: -22.08, x1: -21.92, y0: Y, y1: Y + 2.2, z0: -43.5, z1: -42.5 }, 'paint', O, () => !this.game.world.get('falseWallOpen'));
    this.rubble = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.2, 0.06 + Math.random() * 0.1, 0.1 + Math.random() * 0.2), m.paint);
      r.position.set(-21.6 + Math.random() * 0.9, Y + 0.04, -43.4 + Math.random() * 0.8);
      r.rotation.y = Math.random() * 3;
      this.rubble.add(r);
    }
    b.groupOf(O).add(this.rubble);
    this.emitter('secret_wall', 'secret', -22, Y + 1.2, -43, () => !this.game.world.get('falseWallOpen'), 1, 10);

    const GL = 'glass';
    b.room({ x0: -32, x1: -22, z0: -44, z1: -34, y: Y, zone: GL, floor: 'concrete', wall: 'concrete', walls: { e: false } });
    p.fixture(-27, Y + 3, -39, GL, { mode: 'always', lo: 7, hi: 7, range: 12, color: 0xdfeef5, bias: 300 });
    p.fixture(-27, Y + 3, -35.5, GL, { mode: 'always', lo: 2, hi: 2, range: 7, color: 0xdfeef5, flicker: 0.2 });
    p.chair(-25.2, -39, -Math.PI / 2, GL);
    p.table(-29.5, -41.5, 1.2, 0.7, GL);
    this.pickup('frag2', -29.7, Y + 0.77, -41.5, GL, { ry: 0.4 });
    this.paper('n_glass', -29.2, Y + 0.77, -41.6, GL, { ry: -0.3 });
    this.pickup('tape4', -29.9, Y + 0.77, -41.2, GL, { ry: 1 });
    for (let i = 0; i < 30; i++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), m.paper);
      sheet.position.set(-31.89, Y + 0.8 + (i % 4) * 0.42 + Math.random() * 0.06, -43 + Math.floor(i / 4) * 1.2 + Math.random() * 0.3);
      sheet.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 0.2);
      b.groupOf(GL).add(sheet);
    }
    this.observerAnchors.push({ x: -27.5, y: Y, z: -37, zone: GL, glass: true });
    p.yb = 0;
  }

  // ── БЕСКОНЕЧНАЯ ЛЕСТНИЦА (уходит на запад) ────────────────────────────────
  buildStairs() {
    const { b, p } = this;
    const S = 'stairs';
    const zN = -32;
    const zS = -28;
    const landings = [[-15, -12, 0], [-24, -21, -3], [-33, -30, -6], [-42, -39, -9]];
    const flights = [[-21, -15, -3, 0], [-30, -24, -6, -3], [-39, -33, -9, -6], [-48, -42, -12, -9]];
    for (const [x0, x1, y] of landings) {
      b.box(x0, y - 0.3, zN, x1, y, zS, 'concreteDark', { zone: S, collide: false });
      b.floor(x0, zN, x1, zS, y, 'concrete');
      b.box(x0, y + 3, zN, x1, y + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false });
    }
    // flights: [xWest, xEast, yWest(низ), yEast(верх)]
    for (const [x0, x1, yb, ya] of flights) {
      b.ramp(x0, zN, x1, zS, 'x', yb, ya, 'concrete');
      const steps = 20;
      const run = (x1 - x0) / steps;
      const rise = (ya - yb) / steps;
      for (let i = 0; i < steps; i++) {
        const top = yb + (i + 1) * rise;
        b.box(x0 + i * run, top - rise - 0.3, zN, x0 + (i + 1) * run, top - rise * 0.5, zS, 'concrete', { zone: S, collide: false });
      }
      b.box(x0, ya + 3, zN, x1, ya + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false });
      const len = Math.hypot(x1 - x0, ya - yb);
      const railMesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), this.m.metal);
      railMesh.position.set((x0 + x1) / 2, (ya + yb) / 2 + 0.95, zS - 0.25);
      railMesh.rotation.z = Math.atan2(ya - yb, x1 - x0);
      b.groupOf(S).add(railMesh);
    }
    [[-21, 0], [-30, -3], [-39, -6]].forEach(([x, y]) => b.box(x - 0.1, y, zN, x + 0.1, y + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false }));
    b.box(-48, -13, zS - 0.2, -12, 3.2, zS, 'concrete', { zone: S });
    const wn = (x0, x1, y0, y1) => b.box(x0, y0, zN, x1, y1, zN + 0.2, 'concrete', { zone: S });
    wn(-48, -32, -13, 3.2);
    wn(-32, -31, -3.9, 3.2);
    wn(-32, -31, -13, -6);
    wn(-31, -23, -13, 3.2);
    wn(-23, -22, -0.9, 3.2);
    wn(-23, -22, -13, -3);
    wn(-22, -12, -13, 3.2);
    b.box(-48.2, -13, zN, -48, 3.2, zS, 'concrete', { zone: S });
    p.sign(['0'], -13.4, 1.8, zN + 0.21, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 90px Consolas' });
    this.landingSigns = [
      p.sign(['−1'], -21.4, -1.2, zN + 0.21, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
      p.sign(['−2'], -30.4, -4.2, zN + 0.21, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
      p.sign(['−3'], -39.4, -7.2, zN + 0.21, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
    ];
    this.inspect({ id: 'landing_sign', mesh: this.landingSigns[0], zone: S, text: () => `Табличка: −${this.game.world.get('landing', 0) + 1}. Я спускался всего на один пролёт?` });
    [[-13.5, 2.2], [-22.5, -0.8], [-31.5, -3.8], [-40.5, -6.8]].forEach(([x, y]) => p.wallLamp(x, y, zS - 0.15, S, { lo: 2.6, hi: 2.6, flicker: 0.12, range: 8 }));
    this.door({ id: 'd_landing', axis: 'x', x: -22.5, z: zN + 0.1, y: -3, zone: S, locked: true, lockText: () => `Заперто. Табличка рядом: −${this.game.world.get('landing', 0) + 1}. За дверью — бетон?` });
    this.fakeDoor('x', -31.5, zN + 0.1, S, -6);
    this.fakeDoor('x', -40.5, zN + 0.22, S, -9);
    const SV = 'stairsVest';
    b.room({ x0: -23.1, x1: -21.9, z0: -34.6, z1: zN, y: -3, h: 2.4, zone: SV, floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
    this.curtain('x', -33.3, -23.1, -21.9, -0.6, SV, { y0: -3 });
    this.portal('lab_in', { x0: -23.1, x1: -21.9, z0: -34.6, z1: -33.32, y0: -4, y1: -1.5 }, [119.5, 3, 40.6]);
    this.observerAnchors.push({ x: -31.5, y: -6, z: -30, zone: S }, { x: -13.6, y: 0, z: -30, zone: S });
  }

  // ── ВЕНТИЛЯЦИЯ ────────────────────────────────────────────────────────────
  buildVents() {
    const { b, p, m } = this;
    const IN = 1.15;
    // шахта 1: коридор (x=2) → котельная (x=16) на уровне пола
    const V1 = 'vent1';
    b.box(2, -0.1, -18.6, 16, 0, -17.4, 'grate', { zone: V1, collide: false });
    b.floor(2, -18.6, 16, -17.4, 0, 'metal');
    b.box(2, IN, -18.7, 16, IN + 0.1, -17.3, 'metalDark', { zone: V1, collide: false, cast: false });
    b.box(2, 0, -18.7, 16, IN, -18.6, 'metalDark', { zone: V1 });
    b.box(2, 0, -17.4, 16, IN, -17.3, 'metalDark', { zone: V1 });
    for (let x = 3; x < 16; x += 1.5) b.box(x, 0, -18.62, x + 0.06, IN, -17.38, 'metal', { zone: V1, collide: false });
    b.light({ x: 9, y: 0.9, z: -18, color: 0xff7040, mode: 'always', lo: 1.4, hi: 1.4, range: 5, zone: V1, phase: 3, flicker: 0.6 });
    this.grate('g_v1a', 2, -18, 'z', V1, 'corridor');
    this.grate('g_v1b', 16, -18, 'z', V1, 'generator');
    this.ventMouths.push({ x: 2, y: 0, z: -18 }, { x: 16, y: 0, z: -18 });
    // шахта 2: архив (z=-16) → наблюдательная (z=-34, y=4.5), подъём в два участка
    const V2 = 'vent2';
    const x0 = -20.6;
    const x1 = -19.4;
    b.ramp(x0, -27, x1, -16, 'z', 3.5, 0, 'metal');
    b.ramp(x0, -34, x1, -27, 'z', BAL, 3.5, 'metal');
    const hAt = (z) => (z > -27 ? ((-16 - z) / 11) * 3.5 : 3.5 + ((-27 - z) / 7) * (BAL - 3.5));
    for (let z = -16; z > -34; z -= 0.5) {
      const y = hAt(z - 0.25);
      b.box(x0, y - 0.12, z - 0.5, x1, y, z, 'grate', { zone: V2, collide: false });
      b.box(x0 - 0.1, y - 0.12, z - 0.5, x0, y + IN, z, 'metalDark', { zone: V2 });
      b.box(x1, y - 0.12, z - 0.5, x1 + 0.1, y + IN, z, 'metalDark', { zone: V2 });
      b.box(x0, y + IN, z - 0.5, x1, y + IN + 0.08, z, 'metalDark', { zone: V2, collide: false, cast: false });
    }
    b.light({ x: -20, y: 2.7, z: -24, color: 0x9ab8ff, mode: 'always', lo: 1.3, hi: 1.3, range: 5, zone: V2, phase: 4, flicker: 0.4 });
    // вентилятор в боковом ответвлении (крутится, виден сквозь решётку)
    this.fan = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.02), m.metal);
      blade.position.y = 0.21;
      const piv = new THREE.Group();
      piv.rotation.z = (i * Math.PI) / 2;
      piv.add(blade);
      this.fan.add(piv);
    }
    this.fan.position.set(-20.55, hAt(-22) + 0.55, -22);
    this.fan.rotation.y = Math.PI / 2;
    b.groupOf(V2).add(this.fan);
    this.grate('g_v2a', -20, -16, 'x', V2, 'archive');
    this.grate('g_v2b', -20, -34, 'x', V2, 'observation', BAL);
    this.ventMouths.push({ x: -20, y: 0, z: -16 }, { x: -20, y: BAL, z: -34 });
    p.sign(['ВЕНТ-2'], -20, 1.4, -15.86, 0, 'archive', { w: 0.3, h: 0.1, tw: 128, th: 48 });
  }

  // Вентиляционная решётка: снимается, после этого в шахту можно пролезть.
  // axis 'z' — решётка в стене, идущей вдоль Z (x = const); 'x' — в стене вдоль X (z = const).
  grate(id, x, z, axis, zone, outerZone, y = 0) {
    const { b, m } = this;
    const g = new THREE.Group();
    const w = 1.2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? 0.04 : w, 1.15, axis === 'z' ? w : 0.04), m.grate);
    frame.position.y = 0.575;
    g.add(frame);
    for (let i = 0; i < 8; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? 0.06 : w - 0.1, 0.03, axis === 'z' ? w - 0.1 : 0.06), m.metal);
      bar.position.y = 0.1 + i * 0.135;
      g.add(bar);
    }
    frame.material = new THREE.MeshStandardMaterial({ color: 0x222628, roughness: 0.6, metalness: 0.6, transparent: true, opacity: 0.35 });
    g.position.set(x, y, z);
    b.groupOf(outerZone).add(g);
    const col = b.addCollider(axis === 'z' ? { x0: x - 0.06, x1: x + 0.06, y0: y, y1: y + 1.15, z0: z - 0.6, z1: z + 0.6 } : { x0: x - 0.6, x1: x + 0.6, y0: y, y1: y + 1.15, z0: z - 0.06, z1: z + 0.06 }, 'grate');
    const grate = { id, g, col };
    this.grates[id] = grate;
    this.button({
      id,
      mesh: g,
      zone: outerZone,
      prompt: () => (this.game.world.get(id) ? null : 'Снять решётку вентиляции'),
      action: () => {
        if (this.game.world.get(id)) return;
        this.game.audio.play('grate');
        this.game.world.set(id, true);
        this.syncGrates();
        this.game.mem.count('grates');
        if (this.game.mem.get('grates') === 1) this.game.ui.hint('Решётка снята. В шахту можно пролезть пригнувшись (C). Оно туда не пролезет.', 5);
      },
    });
  }

  syncGrates() {
    for (const [id, gr] of Object.entries(this.grates)) {
      const open = !!this.game.world.get(id);
      gr.g.visible = !open;
      gr.col.enabled = !open;
    }
  }

  // ── КАНАЛИЗАЦИЯ: коллектор, канал, газ, затопленный тоннель, насосная, водосток ─
  buildSewer() {
    const { b, p, m } = this;
    const Y = SEW;
    p.yb = Y;
    const wall = 'brick';
    const S = 'sewer';
    // коллектор (вход): x[22,32] z[-22,-8]; канал проходит через середину по z[-16.5,-13.5]
    b.room({ x0: 22, x1: 32, z0: -22, z1: -8, y: Y, h: 5, zone: S, floor: false, wall, ceil: 'wetConcrete', walls: { e: [{ a: -18, b: -12, top: 4.5 }] }, addFloor: false });
    b.box(22, Y - 0.3, -22, 32, Y, -16.5, 'wetConcrete', { zone: S, collide: false });
    b.box(22, Y - 0.3, -13.5, 32, Y, -8, 'wetConcrete', { zone: S, collide: false });
    b.floor(22, -22, 32, -16.5, Y, 'wet');
    b.floor(22, -13.5, 32, -8, Y, 'wet');
    // русло канала: стенки и дно
    b.box(22, Y - 2.2, -16.5, 32, Y - 2.0, -13.5, 'wetConcrete', { zone: S, collide: false });
    // мост через канал
    b.box(23.5, Y - 0.12, -16.5, 25, Y, -13.5, 'grate', { zone: S, collide: false });
    b.floor(23.5, -16.5, 25, -13.5, Y, 'metal');
    // невидимые бортики канала (кроме моста)
    for (const [z0, z1] of [[-16.55, -16.45], [-13.55, -13.45]]) {
      b.addCollider({ x0: 22, x1: 23.5, y0: Y, y1: Y + 1.8, z0, z1 }, 'curb');
      b.addCollider({ x0: 25, x1: 58, y0: Y, y1: Y + 1.8, z0, z1 }, 'curb');
    }
    this.water(22, -16.5, 32, -13.5, WATER, S);
    this.button({ id: 'ladder_up', mesh: this.ladderMesh(27, -21.8, Y, Y + 5, S), zone: S, range: 2.4, prompt: 'Подняться в котельную', action: () => this.game.survival.climb({ x: 27, y: 0, z: -17.4, yaw: Math.PI }, 'up') });
    p.wallLamp(22.3, Y + 3, -11, S, { color: 0xffb070, lo: 3.6, hi: 3.6, range: 12, flicker: 0.25 });
    p.wallLamp(31.7, Y + 3, -20, S, { color: 0xffb070, lo: 3, hi: 3, range: 11, flicker: 0.4 });
    // тело в противогазе — рядом противогаз и фильтр
    this.pickup('gasmask', 29.6, Y + 0.05, -20.6, S, { ry: 0.7 });
    this.paper('n_sewer', 30.3, Y + 0.02, -21, S, { ry: 1.2 });
    p.sign(['ВНИМАНИЕ', 'СЕРОВОДОРОД', 'БЕЗ ПРОТИВОГАЗА НЕ ВХОДИТЬ'], 31.88, Y + 1.8, -19.5, -Math.PI / 2, S, { w: 1.2, h: 0.6, tw: 512, th: 256, bg: '#b8a020', fg: '#1a1a10' });
    // лодка у причала
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.2), m.rust);
    hull.position.y = 0.2;
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 3, 1), m.rust);
    bow.rotation.set(0, Math.PI / 2, 0);
    bow.scale.set(1, 1, 0.9);
    bow.position.set(1.5, 0.2, 0);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.1), m.wood);
    bench.position.set(-0.4, 0.42, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.lampWarm);
    lamp.position.set(1.1, 0.75, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5), m.metalDark);
    pole.position.set(1.1, 0.52, 0);
    boat.add(hull, bow, bench, lamp, pole);
    boat.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    boat.position.set(29.5, WATER - 0.15, -15);
    b.groupOf(S).add(boat);
    this.boat = boat;
    this.boatLight = b.light({ x: 30.6, y: WATER + 0.7, z: -15, color: 0xffc080, mode: 'switch', switchVar: 'boatLamp', lo: 0, hi: 2.5, range: 7, zone: S, phase: 5 });
    this.button({ id: 'boat', mesh: boat, zone: S, range: 3, prompt: () => this.game.boat.prompt(), action: () => this.game.boat.board() });

    // канал: x[32,58]
    const CN = 'canal';
    b.box(32, Y - 0.3, -18, 58, Y, -16.5, 'wetConcrete', { zone: CN, collide: false });
    b.box(32, Y - 0.3, -13.5, 58, Y, -12, 'wetConcrete', { zone: CN, collide: false });
    b.floor(32, -18, 58, -16.5, Y, 'wet');
    b.floor(32, -13.5, 58, -12, Y, 'wet');
    b.box(32, Y - 2.2, -16.5, 90, Y - 2.0, -13.5, 'wetConcrete', { zone: CN, collide: false });
    this.water(32, -16.5, 58, -13.5, WATER, CN);
    b.wallX(-18, 32, 58, Y, 4.5, wall, CN);
    b.wallX(-12, 32, 58, Y, 4.5, wall, CN);
    b.box(32, Y + 4.5, -18.2, 58, Y + 4.7, -11.8, 'wetConcrete', { zone: CN, collide: false, cast: false });
    for (let x = 34; x < 58; x += 4) {
      b.box(x, Y + 3.8, -18, x + 0.4, Y + 4.5, -12, 'wetConcrete', { zone: CN, collide: false });
      p.pipe(x, Y + 3.2, -17.8, x + 3.5, -17.8, 0.12, CN, 'rust');
    }
    [[36, -17.8], [48, -12.2], [54, -17.8]].forEach(([x, z], i) => p.wallLamp(x, Y + 2.8, z + (z > -15 ? -0.1 : 0.1), CN, { color: i === 1 ? 0x80ff60 : 0xffb070, lo: 3, hi: 3, range: 12, flicker: 0.3 }));
    // обвал в конце — дальше только на лодке
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(0.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.7, 0.4 + Math.random() * 0.8), m.wetConcrete);
      rock.position.set(56.5 + Math.random() * 1.5, Y + 0.2 + Math.random() * 0.6, i < 7 ? -17.2 + Math.random() * 0.6 : -12.8 + Math.random() * 0.6);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      b.groupOf(CN).add(rock);
    }
    b.addCollider({ x0: 56.5, x1: 58, y0: Y, y1: Y + 2, z0: -18, z1: -16.5 }, 'rubble');
    b.addCollider({ x0: 56.5, x1: 58, y0: Y, y1: Y + 2, z0: -13.5, z1: -12 }, 'rubble');
    this.supply('filter', 50, Y + 0.02, -17.4, CN);
    this.observerAnchors.push({ x: 55.5, y: Y, z: -17.2, zone: CN });

    // затопленный тоннель x[58,90] — только вода
    const FL = 'flooded';
    this.water(58, -18, 90, -12, WATER, FL);
    b.box(58, Y - 2.2, -18, 90, Y - 2.0, -12, 'wetConcrete', { zone: FL, collide: false });
    b.wallX(-18, 58, 90, Y - 2, 6, wall, FL);
    b.wallX(-12, 58, 90, Y - 2, 6, wall, FL);
    b.box(58, Y + 3, -18.2, 90, Y + 3.2, -11.8, 'wetConcrete', { zone: FL, collide: false, cast: false });
    for (let x = 60; x < 90; x += 5) b.box(x, Y + 2.2, -18, x + 0.5, Y + 3, -12, 'wetConcrete', { zone: FL, collide: false });
    [[64, -17.8], [76, -12.2], [86, -17.8]].forEach(([x, z]) => p.wallLamp(x, Y + 1.8, z + (z > -15 ? -0.1 : 0.1), FL, { color: 0x70ff50, lo: 2.2, hi: 2.2, range: 11, flicker: 0.6 }));

    // насосная станция x[90,104] z[-24,-6]
    const PM = 'pump';
    b.room({ x0: 90, x1: 104, z0: -24, z1: -6, y: Y, h: 6, zone: PM, floor: false, wall, ceil: 'wetConcrete', walls: { w: [{ a: -18, b: -12, top: 4 }], e: [{ a: -16, b: -12, top: 3.5 }] }, addFloor: false });
    b.box(90, Y - 0.3, -24, 104, Y, -18, 'concreteDark', { zone: PM, collide: false });
    b.box(90, Y - 0.3, -12, 104, Y, -6, 'concreteDark', { zone: PM, collide: false });
    b.box(93, Y - 0.3, -18, 104, Y, -12, 'concreteDark', { zone: PM, collide: false });
    b.floor(90, -24, 104, -18, Y, 'metal');
    b.floor(90, -12, 104, -6, Y, 'metal');
    b.floor(93, -18, 104, -12, Y, 'metal');
    this.water(90, -18, 93, -12, WATER, PM);
    b.addCollider({ x0: 90, x1: 93, y0: Y, y1: Y + 1.8, z0: -18.05, z1: -17.95 }, 'curb');
    b.addCollider({ x0: 90, x1: 93, y0: Y, y1: Y + 1.8, z0: -12.05, z1: -11.95 }, 'curb');
    b.addCollider({ x0: 92.95, x1: 93.05, y0: Y, y1: Y + 1.8, z0: -18, z1: -12 }, 'curb');
    for (const [cx, cz] of [[97, -21], [101, -21], [97, -9], [101, -9]]) {
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 18), m.rust);
      pump.position.set(cx, Y + 1.2, cz);
      pump.castShadow = true;
      b.groupOf(PM).add(pump);
      b.addCollider({ x0: cx - 1, x1: cx + 1, y0: Y, y1: Y + 2.4, z0: cz - 1, z1: cz + 1 });
      p.pipe(cx, Y + 3.6, cz, cx, -15, 0.15, PM, 'rust');
    }
    p.fixture(97, Y + 6, -15, PM, { mode: 'always', lo: 4, hi: 4, range: 14, flicker: 0.2 });
    p.wallLamp(90.3, Y + 2.6, -21, PM, { color: 0xffb070, lo: 2.6, hi: 2.6, range: 10, flicker: 0.3 });
    p.wallLamp(103.7, Y + 2.6, -20, PM, { color: 0xff3020, lo: 1.4, hi: 1.4, range: 7, flicker: 0.5 });
    p.table(100, -14, 1.4, 0.7, PM);
    this.paper('n_pump', 99.6, Y + 0.77, -14, PM, { ry: 0.3 });
    this.pickup('tape3', 100.5, Y + 0.77, -13.9, PM, { ry: -0.6 });
    // лестница в лабораторию
    this.button({ id: 'ladder_lab', mesh: this.ladderMesh(95.5, -6.2, Y, Y + 6, PM), zone: PM, range: 2.4, prompt: 'Подняться (люк в потолке)', action: () => this.game.survival.climb({ x: 95.5, y: 0, z: -4.4, yaw: Math.PI }, 'up') });
    p.sign(['ЛАБОРАТОРИЯ ↑'], 96.6, Y + 2, -6.15, Math.PI, PM, { w: 0.8, h: 0.18, tw: 384, th: 64 });
    this.observerAnchors.push({ x: 103, y: Y, z: -23, zone: PM });

    // водосток наружу x[104,122]
    const OF = 'outflow';
    b.room({ x0: 104, x1: 122, z0: -16, z1: -12, y: Y, h: 3.5, zone: OF, floor: 'wetConcrete', wall, ceil: 'wetConcrete', surface: 'wet', walls: { w: false, e: false } });
    this.water(104.05, -15.8, 121.95, -12.2, Y + 0.04, OF);
    this.outGrate = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6), m.rust);
      bar.position.set(0, 1.7, -1.8 + i * 0.45);
      this.outGrate.add(bar);
    }
    for (const y of [0.4, 1.7, 3.0]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4), m.rust);
      cross.position.set(0, y, 0);
      this.outGrate.add(cross);
    }
    this.outGrate.position.set(120, Y, -14);
    b.groupOf(OF).add(this.outGrate);
    this.outGrateCol = b.addCollider({ x0: 119.9, x1: 120.1, y0: Y, y1: Y + 3.5, z0: -16, z1: -12 });
    this.button({
      id: 'out_grate',
      mesh: this.outGrate,
      zone: OF,
      range: 2.6,
      prompt: () => (this.game.world.get('grateCut') ? null : this.game.inv.has('cutters') ? 'Перекусить замок болторезом' : 'Решётка водостока'),
      action: () => {
        if (this.game.world.get('grateCut')) return;
        if (!this.game.inv.has('cutters')) return this.game.ui.hint('Решётка на цепи с замком. Снаружи пахнет дождём. Нужен болторез.', 4);
        this.game.audio.play('chain');
        this.game.world.set('grateCut', true);
        this.syncOutflow();
        this.game.mem.observe('grate_cut', 'Цепь лопнула. Решётка подалась. За ней — ночь и дождь. Настоящие?');
      },
    });
    this.light2 = b.light({ x: 121, y: Y + 2.5, z: -14, color: 0x7a90c0, mode: 'always', lo: 2.2, hi: 2.2, range: 12, zone: OF, phase: 6 });
    // снаружи (концовка «Побег»): берег, река, дождь
    const OUT = 'outside';
    b.box(122, Y - 0.3, -40, 130, Y, 20, 'concreteDark', { zone: OUT, collide: false });
    b.floor(122, -40, 130, 20, Y, 'mud');
    b.addCollider({ x0: 129.9, x1: 130.1, y0: Y, y1: Y + 2, z0: -40, z1: 20 }, 'curb');
    this.water(130, -40, 170, 20, Y - 0.3, OUT);
    const skyGeo = new THREE.SphereGeometry(60, 16, 10);
    const sky = new THREE.Mesh(skyGeo, m.sky);
    sky.position.set(146, Y, -10);
    b.groupOf(OUT).add(sky);
    b.light({ x: 135, y: Y + 12, z: -14, color: 0x8aa0d0, mode: 'always', lo: 5, hi: 5, range: 40, zone: OUT, phase: 7 });
    p.yb = 0;
  }

  syncOutflow() {
    const cut = !!this.game.world.get('grateCut');
    this.outGrate.rotation.y = cut ? -1.2 : 0;
    this.outGrate.position.z = cut ? -15.6 : -14;
    this.outGrateCol.enabled = !cut;
  }

  // ── КОМНАТА 0-7 (больше, чем здание) ──────────────────────────────────────
  buildRoom07() {
    const { b, p } = this;
    const R = 'room07';
    b.room({ x0: -65, x1: -62, z0: -16.6, z1: -15.4, h: 2.6, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { w: false, e: false } });
    b.wallZ(-62, -16.6, -15.4, 0, 2.6, 'concreteDark', R);
    this.fakeDoor('z', -62.1, -16, R);
    this.curtain('z', -63.5, -16.6, -15.4, 2.6, R);
    this.portal('room07_out', { x0: -63.48, x1: -62, z0: -16.6, z1: -15.4 }, [60, 0, 0]);
    b.room({ x0: -77, x1: -65, z0: -22, z1: -10, h: 4.5, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { e: [{ a: -16.6, b: -15.4, top: 2.6 }] } });
    p.table(-71, -16, 6, 1.4, R, { mat: 'wood' });
    const names = ['Ланская', 'Громов', 'Шум', 'Оператор', 'Испытуемый', 'Копия', '—'];
    const seats = [[-73, -17.1, 0], [-71, -17.1, 0], [-69, -17.1, 0], [-73, -14.9, Math.PI], [-71, -14.9, Math.PI], [-69, -14.9, Math.PI], [-74.6, -16, Math.PI / 2]];
    seats.forEach(([x, z, ry], i) => {
      p.chair(x, z + (ry === 0 ? -0.3 : ry === Math.PI ? 0.3 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry, R);
      const card = p.sign([names[i]], x + (i === 6 ? 0.55 : 0), 0.82, z + (ry === 0 ? 0.25 : ry === Math.PI ? -0.25 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry === 0 ? Math.PI : 0, R, { w: 0.24, h: 0.08, bg: '#e8e4d8', fg: '#1a1a1a', tw: 256, th: 80, font: 'bold 34px Consolas' });
      card.rotation.x = -0.35;
    });
    this.pickup('fuse_c', -71.8, 0.77, -16.1, R, { ry: 0.8 });
    this.pickup('frag1', -70.1, 0.77, -16.2, R, { ry: -0.3 });
    this.paper('n_07', -70.9, 0.77, -15.8, R, { ry: 0.1 });
    p.fixture(-71, 4.5, -16, R, { mode: 'always', lo: 4.5, hi: 4.5, warm: true, color: 0xffd8b0, range: 12 });
    p.fixture(-71, 4.5, -11.5, R, { mode: 'always', lo: 1.2, hi: 1.2, range: 8, flicker: 0.5 });
    this.observerAnchors.push({ x: -76, y: 0, z: -21, zone: R });
  }

  // ── ОТРАЖЕНИЕ (зеркальная палата) ─────────────────────────────────────────
  buildReflection() {
    const { b, p } = this;
    const R = 'reflection';
    b.room({ x0: -62, x1: -58, z0: 38, z1: 41.5, h: 3.6, zone: R, floor: 'tiles', wall: 'hospital', walls: { n: false } });
    this.curtain('x', 40, -62, -58, 3.6, R);
    this.portal('reflection_out', { x0: -62, x1: -58, z0: 40.05, z1: 41.5 }, [60, 0, -62]);
    b.room({ x0: -63, x1: -57, z0: 32, z1: 38, zone: R, floor: 'lino', wall: 'paint', surface: 'lino', walls: { s: [{ a: -62, b: -58, top: 3 }] } });
    p.bed(-62.3, 33.8, Math.PI, R);
    p.table(-62.6, 36.8, 0.7, 1.6, R);
    const t = p.terminal(-62.65, 37.25, Math.PI / 2, R);
    t.userData.screen.material = this.m.dark;
    p.chair(-61.9, 36.8, Math.PI / 2, R);
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
    b.room({ x0: 96.4, x1: 97.6, z0: 6, z1: 8.6, h: 2.4, zone: LB, floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
    this.fakeDoor('x', 97, 8.55, LB);
    this.curtain('x', 7.3, 96.4, 97.6, 2.4, LB);
    this.portal('lab_out', { x0: 96.4, x1: 97.6, z0: 7.32, z1: 8.6, y0: -1, y1: 2 }, [-119.5, -3, -40.6]);
    p.table(98.5, -3.5, 2, 0.8, LB);
    for (let i = 0; i < 5; i++) b.box(97.7 + i * 0.35, 0.76, -3.7, 97.95 + i * 0.35, 0.9 + (i % 3) * 0.1, -3.4, i % 2 ? 'plasticLight' : 'metal', { zone: LB, collide: false });
    p.table(100, 5.4, 1.2, 0.7, LB);
    const t4 = p.terminal(100, 5.3, Math.PI, LB);
    this.button({ id: 't4', mesh: t4, zone: LB, prompt: 'Терминал', action: () => this.game.story.openTerminal('t4') });
    this.paper('n_lab', 100.7, 0.77, 5.3, LB, { ry: 0.3 });
    // люк в насосную
    const hatch = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 18), m.metalDark);
    ring.position.y = 0.025;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), m.black);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.055;
    hatch.add(ring, hole);
    hatch.position.set(95.3, 0, -4.9);
    b.groupOf(LB).add(hatch);
    this.button({ id: 'hatch_lab', mesh: hatch, zone: LB, range: 2.4, prompt: 'Спуститься в насосную', action: () => this.game.survival.climb({ x: 95.5, y: SEW, z: -7.2, yaw: 0 }, 'down') });
    this.plates.push(new Plate(this.game, { id: 'plateA', x: 104.6, z: 4.4, size: 1.2, zone: LB, lamp: { x: 105.88, y: 1.8, z: 4.4 } }));
    p.sign(['ПЛИТА А'], 105.89, 2.1, 4.4, -Math.PI / 2, LB, { w: 0.4, h: 0.12, tw: 256, th: 64 });
    this.observerAnchors.push({ x: 95, y: 0, z: 5.2, zone: LB });

    const E = 'echo';
    b.room({ x0: 106, x1: 114, z0: -6, z1: 2, zone: E, floor: 'carpet', wall: 'concreteDark', surface: 'carpet', walls: { w: false } });
    this.door({ id: 'd_echo', axis: 'z', x: 106, z: -2.5, zone: LB, sign: textTexture('ЭХО', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
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
    this.button({ id: 'echo_rec', mesh: recBtn, zone: E, prompt: () => (this.game.entities && this.game.entities.copy.state === 'echo' ? 'Идёт запись…' : 'ЗАПИСЬ'), action: () => this.game.entities.copy.startEcho() });
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

    const GT = 'gate';
    b.room({ x0: 80, x1: 94, z0: -6, z1: 6, h: 4, zone: GT, floor: 'concreteDark', wall: 'concrete', walls: { e: false, w: [{ a: -1.5, b: 1.5, top: 3 }] } });
    p.fixture(84, 4, 0, GT, { mode: 'always', lo: 3.5, hi: 3.5, range: 10 });
    p.fixture(90, 4, 0, GT, { mode: 'always', lo: 3, hi: 3, range: 10, flicker: 0.2 });
    this.plates.push(new Plate(this.game, { id: 'plateB', x: 82.2, z: 4.6, size: 1.2, zone: GT, lamp: { x: 80.12, y: 1.8, z: 4.6 } }));
    p.sign(['ПЛИТА Б'], 80.11, 2.1, 4.6, Math.PI / 2, GT, { w: 0.4, h: 0.12, tw: 256, th: 64 });
    b.box(85.2, 0, 2.2, 85.8, 4, 2.8, 'concrete', { zone: GT });
    b.box(85.2, 0, 4.8, 85.8, 4, 6, 'concrete', { zone: GT });
    b.box(88, 0, -1, 88.6, 4, -0.4, 'concrete', { zone: GT });
    b.box(83, 0, -4, 85, 1.1, -3.4, 'metalDark', { zone: GT });
    // болторез на ящике у стены (нужен для водостока)
    this.pickup('cutters', 84, 1.12, -3.7, GT, { ry: 0.5 });
    const crate = new Crate(this.game, { id: 'c1', x: 90.5, z: -3.5, zone: GT });
    this.crates.push(crate);
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
      0: { ox: 0, oz: -48, zone: 'lift0', outer: 'hall' },
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
      const call = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), m.metalDark);
      call.position.set(ox + 1.4, 1.25, oz + 0.12);
      b.groupOf(cab.outer).add(call);
      cab.callMat = m.lampOff.clone();
      const callLamp = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), cab.callMat);
      callLamp.position.set(0, 0, 0.021);
      call.add(callLamp);
      this.button({ id: `lift_call_${floor}`, mesh: call, zone: cab.outer, prompt: 'Вызвать лифт', action: () => this.game.puzzles.callElevator(floor) });
      cab.indTex = textTexture('0', { w: 128, h: 64, bg: '#0a0a0a', fg: '#ff9030', font: 'bold 44px Consolas' });
      const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: cab.indTex }));
      ind.position.set(ox, 2.6, oz + 0.11);
      b.groupOf(cab.outer).add(ind);
    }
  }

  // ── расходники по карте ───────────────────────────────────────────────────
  buildSupplies() {
    const s = (k, x, y, z, zone) => this.supply(k, x, y, z, zone);
    // батарейки
    s('battery', 1.6, 0.02, -2.4, 'corridor');
    s('battery', -13.5, 0.02, -9.4, 'west');
    s('battery', -27.6, 1.65, -9, 'archive');
    s('battery', 17.2, 1.16, -5.6, 'generator');
    s('battery', 1.4, 1.12, -36.6, 'hall');
    s('battery', -15.3, BAL + 0.77, -43.1, 'observation');
    s('battery', 25.5, SEW + 0.02, -9.2, 'sewer');
    s('battery', 102.5, SEW + 0.02, -7.4, 'pump');
    s('battery', 99.2, 0.77, -3.4, 'lab');
    // стимуляторы
    s('stim', -26.2, 0.77, -8.4, 'archive');
    s('stim', -1.2, 1.12, -36.2, 'hall');
    s('stim', 31, SEW + 0.02, -9, 'sewer');
    s('stim', 112.8, 0.77, -1.0, 'echo');
    // бутылки (можно бросить, чтобы отвлечь Оно)
    s('bottle', -1.5, 0.02, -7, 'corridor');
    s('bottle', 6, 0.02, -6.4, 'east');
    s('bottle', -6, 0.02, -27, 'hall');
    s('bottle', 7, 0.02, -46, 'hall');
    s('bottle', 18, 0.02, -15, 'generator');
    s('bottle', -19, 0.02, -15.4, 'archive');
    // фильтры противогаза
    s('filter', 17.6, 1.16, -4.0, 'generator');
    s('filter', 30.6, SEW + 0.02, -20.4, 'sewer');
    s('filter', 102.8, SEW + 0.77, -14.2, 'pump');
  }

  // ── подписки на изменения мира ────────────────────────────────────────────
  subscribe() {
    const bus = this.game.bus;
    bus.on('door:state', (e) => this.doors[e.id] && this.doors[e.id].sync());
    bus.on('item:state', (e) => {
      if (this.pickups[e.id]) this.pickups[e.id].sync();
      const s = this.supplies.find((x) => x.id === e.id);
      if (s) s.sync();
    });
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
    if (key === 'boatLamp' || key === 'echoLamp') this.refreshLights();
    if (key === 'grateCut') this.syncOutflow();
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
    this.syncGrates();
    this.syncOutflow();
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
      else if (a.mode === 'mixed') k = power ? a.hi * 0.9 : a.lo * 0.85; // без питания — только тусклый свет
      else if (a.mode === 'mixedInv') k = power ? a.hi : a.lo;
      else if (a.mode === 'switch') on = !!this.game.world.get(a.switchVar);
      else k = a.hi ?? a.lo;
      if (off && a.zone === 'core') k *= 0.1;
      if (this.blackout) on = on && a.zone !== this.blackout;
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
    this.b.moveCollider(this.startWallCol, { x0: -2.9, x1: 2.9, y0: 0, y1: 3, z0: z - 0.1, z1: z + 0.1 });
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
    if (!mem.rule('three_passes').done) t.push({ x: -2, z: -16 });
    if (!w.get('falseWallOpen')) t.push({ x: -22, z: -43 });
    if (w.get('startStage', 0) < 4) t.push({ x: -3, z: 3 });
    if (!w.get('loopDoor')) t.push({ x: -9, z: -6 });
    if (!mem.rule('worn_path').done) t.push({ x: 0, z: -22 });
    if (!mem.solved('landing')) t.push({ x: -22.5, z: -32 });
    if (!w.get('floorVoid')) t.push({ x: 0, z: -49 });
    if (!w.get('g_v2a')) t.push({ x: -20, z: -16 });
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
    for (const c of this.curtains) {
      c.group.children.forEach((pv) => {
        pv.rotation[c.axis === 'x' ? 'x' : 'z'] = Math.sin(time * 1.3 + pv.userData.phase) * c.amp;
      });
    }
    // вода: бегущая рябь
    if (this.m.water.normalMap) {
      this.m.water.normalMap.offset.x = time * 0.02;
      this.m.water.normalMap.offset.y = time * 0.013;
    }
    if (this.fan) this.fan.rotation.x += dt * (g.world.get('power') ? 14 : 1.2);
    if (this.lamp07Flicker && this.doors.d_07) this.doors.d_07.setLamp(Math.sin(time * 9) > 0.3 ? 0xffb030 : 0x302010);
    const bodies = [g.player.pos, g.entities.copy.body(), ...this.crates.map((c) => ({ x: c.x, y: c.y, z: c.z }))];
    for (const pl of this.plates) pl.update(bodies);
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
    const pp = g.player.pos;
    const inGate = pp.x > 79.4 && pp.x < 80.6 && Math.abs(pp.z) < 1.6;
    this.gateCol.enabled = this.gateOpen < 0.7 && !inGate;
    this.plates.forEach((pl, i) => this.gateLamps[i] && this.gateLamps[i].color.setHex(pl.pressed ? 0x40ff80 : 0xff3020));
    if (!g.world.get('mnemaOff')) this.mnemaRings.forEach((r, i) => (r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1)));
    if (this.clock2.visible && Math.floor(time) !== this._clockSec) {
      this._clockSec = Math.floor(time);
      const t = Math.floor(g.mem.data.playTime);
      updateTextTexture(this.clock2Tex, [`${String(Math.floor(t / 60) % 100).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`]);
    }
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
    const inCorr = p.x > -2 && p.x < 2 && p.y > -0.5 && p.y < 1;
    const inside = inCorr && p.z > band.z0 && p.z < band.z1;
    if (inside && !band.side) band.side = p.z > (band.z0 + band.z1) / 2 ? 'south' : 'north';
    if (!inside && band.side) {
      const exit = p.z >= band.z1 ? 'south' : p.z <= band.z0 ? 'north' : null;
      if (inCorr && exit && exit !== band.side) this.game.bus.emit('door:pass', { id: 'd_07' });
      band.side = null;
    }
  }

  // Петля лестницы (уходит на запад: x уменьшается при спуске).
  checkStairs() {
    const g = this.game;
    const p = g.player.pos;
    if (p.z < -32.05 || p.z > -27.9 || p.x > -12) return;
    let n = g.world.get('landing', 0);
    if (p.x < -30.2 && p.y < -4.5 && p.y > -7) {
      p.x += 9;
      p.y += 3;
      n += 1;
    } else if (p.x > -21 && p.x < -18.5 && n > 0 && p.y < -1.8 && p.y > -3.3) {
      p.x -= 9;
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
      z.group.visible = dx * dx + dz * dz < 38 * 38 && dy < 6;
    }
  }
}
