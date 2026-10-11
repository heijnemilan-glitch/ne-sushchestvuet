// Уровень «Сектор 0» — затопленный резервуарный комплекс, его объекты, порталы и реакция на состояние мира.
//
// Основной ярус (y=0):
//   Изолятор (точка пробуждения) открывается прямо на мостки огромного РЕЗЕРВУАРА с водой.
//   Мостки идут по периметру; в центре — островок с насосной башней (туда ведёт мост).
//   Северо-западный угол мостков затоплен, в воде лежит оборванный кабель под током (линия 2):
//   пока линию не обесточат в подстанции, туда нельзя — смерть. За затопленным углом — мастерская.
//   Запад: жилой блок → казарма, архив. Восток: техблок → подстанция (предохранители, линия 2, люк вниз).
//   Север: тоннель со шторкой → центральный пост (балконы 4.5 м, наблюдательная, лифт, лестница,
//   гермоворота на поверхность — откроются, только когда «Оно» мертво).
// Ярус C (y=-8): канализация, газ, лодка, насосная, водосток наружу.
// Удалённые зоны (remote.js): комната 0-7, «Отражение», уровень −1, ядро, этаж Ø.

import * as THREE from 'three';
import { Door, Pickup, Readable, Inspect, Button, Supply, setItemModelFactory } from './objects.js';
import { Props, itemModel } from './props.js';
import { updateTextTexture } from '../render/materials.js';
import { ITEMS } from '../systems/inventory.js';
import { worldSecrets } from '../systems/story.js';
import { Horror } from './horror.js';
import { BAL, SEW, WATER, POOL, PIT, SUNK, HALL_DZ } from './consts.js';
import { installHub } from './hub.js';
import { installRemote } from './remote.js';

export { SEW, WATER, BAL, POOL, PIT, SUNK };
setItemModelFactory(itemModel);

const L0 = { level: '0' };
const LC = { level: 'C' };

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
    this.hazards = [];
    this.waters = [];
    this.floaters = [];
    this.cones = [];
    this.mists = [];
    this.caustics = [];
    this.arcs = [];
    this.sparkParts = [];
    this.ventMouths = [];
    this.grates = {};
    this.time = 0;
    this.secrets = worldSecrets(game.mem.seed);
    this.passBand = null;

    this.buildZones();
    this.buildStart();
    this.buildReservoir();
    this.buildWest();
    this.buildArchive();
    this.buildEast();
    this.buildGenerator();
    this.buildWorkshop();
    this.buildHall();
    this.buildObservation();
    this.buildStairs();
    this.buildVents();
    this.buildGateway();
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

  // Расходники (батарейки, стимуляторы, фильтры, бутылки, патроны) — много экземпляров одного вида.
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
  water(x0, z0, x1, z1, y, zone, mat = 'water') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), this.m[mat]);
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

  // Перила: видимые (жёлтый поручень, стойки) + невидимый коллайдер, чтобы не упасть в воду.
  rail(x0, z0, x1, z1, zone, { y = 0, visible = true } = {}) {
    const { b } = this;
    const t = 0.06;
    const alongX = z0 === z1;
    const c = alongX ? { x0, x1, z0: z0 - t, z1: z0 + t } : { x0: x0 - t, x1: x0 + t, z0, z1 };
    b.addCollider({ ...c, y0: y, y1: y + 1.1 }, 'rail');
    if (!visible) return;
    const opt = { zone, collide: false };
    if (alongX) {
      b.box(x0, y + 1.0, z0 - 0.035, x1, y + 1.07, z0 + 0.035, 'hazard', opt);
      b.box(x0, y + 0.52, z0 - 0.02, x1, y + 0.56, z0 + 0.02, 'metalDark', opt);
      for (let x = x0; x <= x1 + 0.01; x += Math.max(1, (x1 - x0) / Math.ceil((x1 - x0) / 1.6))) b.box(x - 0.03, y, z0 - 0.03, x + 0.03, y + 1.0, z0 + 0.03, 'metalDark', opt);
    } else {
      b.box(x0 - 0.035, y + 1.0, z0, x0 + 0.035, y + 1.07, z1, 'hazard', opt);
      b.box(x0 - 0.02, y + 0.52, z0, x0 + 0.02, y + 0.56, z1, 'metalDark', opt);
      for (let z = z0; z <= z1 + 0.01; z += Math.max(1, (z1 - z0) / Math.ceil((z1 - z0) / 1.6))) b.box(x0 - 0.03, y, z - 0.03, x0 + 0.03, y + 1.0, z + 0.03, 'metalDark', opt);
    }
  }

  // ── зоны ──────────────────────────────────────────────────────────────────
  buildZones() {
    const z = (id, name, b, o) => this.b.zone(id, name, b, o);
    const D = HALL_DZ;
    // основной ярус
    z('start', 'Изолятор', { x0: -3, x1: 3, z0: 0, z1: 7.5 }, { surface: 'metal', map: L0 });
    z('waiting', 'Комната ожидания', { x0: -7, x1: -3, z0: 1, z1: 5 }, { surface: 'lino', map: L0 });
    z('vest07', 'Тамбур', { x0: -9.6, x1: -8.4, z0: 0.05, z1: 3 }, { memoryId: 'vestibule', ambience: 'corridor' });
    // мостки резервуара — одна зона из нескольких коробок (для правил это «главный коридор»)
    const fogR = { color: 0x040807, density: 0.028 };
    const cor = { surface: 'metal', map: L0, ambience: 'reservoir', fog: fogR, ambient: 1.05 };
    const yr = { y0: -1, y1: 7 };
    z('corridor', 'Мостки резервуара', { x0: -18, x1: 18, z0: -3.5, z1: 0, ...yr }, cor);
    z('corridor', 'Мостки резервуара', { x0: -18, x1: -14.5, z0: -34, z1: -3.5, ...yr }, cor);
    z('corridor', 'Мостки резервуара', { x0: 14.5, x1: 18, z0: -34, z1: -3.5, ...yr }, cor);
    z('corridor', 'Мостки резервуара', { x0: -18, x1: 18, z0: -34, z1: -30.5, ...yr }, cor);
    z('corridor', 'Мост к башне', { x0: -1.2, x1: 1.2, z0: -12, z1: -3.5, ...yr }, cor);
    z('corridor', 'Насосная башня', { x0: -5, x1: 5, z0: -20, z1: -12, ...yr }, cor);
    z('corridor', 'Тоннель', { x0: -1.5, x1: 1.5, z0: -37, z1: -34 }, { ...cor, fog: null, ambience: 'corridor' });
    // затопленный угол (вода под током, пока не обесточена линия 2)
    z('flood', 'Затопленный угол', { x0: -18, x1: -14.5, z0: -34, z1: -22.4, y0: -1.5, y1: 6 }, { memoryId: 'corridor', surface: 'wet', ambience: 'flood', map: L0, fog: { color: 0x05090c, density: 0.05 }, priority: 2 });
    z('flood', 'Затопленный угол', { x0: -14.5, x1: -8, z0: -34, z1: -30.5, y0: -1.5, y1: 6 }, {});
    z('west', 'Жилой блок', { x0: -32, x1: -18, z0: -10, z1: -6 }, { surface: 'concrete', map: L0, ambience: 'corridor' });
    z('dorm', 'Казарма', { x0: -31, x1: -21, z0: -18, z1: -10 }, { surface: 'concrete', map: L0, ambience: 'start' });
    z('vestW', 'Тамбур', { x0: -25.6, x1: -24.4, z0: -6, z1: -3 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('archive', 'Архив', { x0: -44, x1: -32, z0: -16, z1: -2, y1: 5 }, { map: L0 });
    z('east', 'Техблок', { x0: 18, x1: 32, z0: -10, z1: -6 }, { surface: 'concrete', map: L0, ambience: 'corridor' });
    z('vestE', 'Тамбур', { x0: 24.4, x1: 25.6, z0: -13, z1: -10 }, { memoryId: 'vestibule', ambience: 'corridor' });
    z('generator', 'Подстанция', { x0: 32, x1: 46, z0: -20, z1: -2, y1: 7.5 }, { surface: 'metal', map: L0, fog: { color: 0x060403, density: 0.042 } });
    z('workshop', 'Мастерская', { x0: -30, x1: -18, z0: -32, z1: -20 }, { surface: 'concrete', map: L0, ambience: 'archive' });
    z('hall', 'Центральный пост', { x0: -12, x1: 12, z0: -48 + D, z1: -24 + D, y0: -1, y1: 11 }, { surface: 'tile', map: L0, fog: { color: 0x040505, density: 0.03 } });
    z('lift0', 'Лифт', { x0: -1.2, x1: 1.2, z0: -50.6 + D, z1: -48 + D }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: L0 });
    z('observation', 'Наблюдательная', { x0: -22, x1: -12, z0: -44 + D, z1: -34 + D, y0: 3.8, y1: 8 }, { surface: 'carpet', map: L0, priority: 2 });
    z('glass', 'За стеклом', { x0: -32, x1: -22, z0: -44 + D, z1: -34 + D, y0: 3.8, y1: 8 }, { map: L0, priority: 2 });
    z('stairs', 'Лестница', { x0: 12, x1: 48, z0: -45, z1: -41, y0: -14, y1: 3.4 }, { map: L0 });
    z('stairsVest', 'Лестница', { x0: 21.9, x1: 23.1, z0: -47.6, z1: -45, y0: -4.5, y1: 0 }, { memoryId: 'stairs', ambience: 'stairs' });
    z('gateway', 'Грузовой шлюз', { x0: 12.2, x1: 30, z0: -56, z1: -50, y0: -1, y1: 8 }, { surface: 'concrete', map: L0, ambience: 'hall' });
    z('surface', 'Поверхность', { x0: 30, x1: 64, z0: -80, z1: -48, y0: 1.5, y1: 30 }, { surface: 'mud', ambience: 'outside', fog: { color: 0x101622, density: 0.035 } });
    // вентиляция
    z('vent1', 'Вентиляция', { x0: 18, x1: 32, z0: -18.6, z1: -17.4, y0: -0.5, y1: 1.3 }, { memoryId: 'vent', ambience: 'vent', surface: 'metal', crouch: true, priority: 3 });
    z('vent2', 'Вентиляция', { x0: -20.6, x1: -19.4, z0: -47, z1: -32, y0: -0.5, y1: 6 }, { memoryId: 'vent', ambience: 'vent', surface: 'metal', crouch: true, priority: 3 });
    // ярус C — канализация
    const sew = { y0: SEW - 3, y1: SEW + 5 };
    z('sewer', 'Коллектор', { x0: 22, x1: 32, z0: -22, z1: -8, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x050807, density: 0.045 } });
    z('canal', 'Канал', { x0: 32, x1: 58, z0: -18, z1: -12, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x050807, density: 0.045 } });
    z('gas', 'Газ', { x0: 44, x1: 56, z0: -18, z1: -12, ...sew }, { memoryId: 'canal', ambience: 'canal', surface: 'wet', fog: { color: 0x101c08, density: 0.16 }, priority: 2 });
    z('flooded', 'Затопленный тоннель', { x0: 58, x1: 90, z0: -18, z1: -12, ...sew }, { surface: 'wet', map: LC, fog: { color: 0x0a1206, density: 0.1 } });
    z('pump', 'Насосная станция', { x0: 90, x1: 104, z0: -24, z1: -6, ...sew }, { surface: 'metal', map: LC, fog: { color: 0x050807, density: 0.042 } });
    z('outflow', 'Водосток', { x0: 104, x1: 122, z0: -16.5, z1: -11.5, ...sew }, { surface: 'wet', map: LC });
    z('outside', 'Снаружи', { x0: 122, x1: 170, z0: -40, z1: 20, y0: SEW - 4, y1: SEW + 30 }, { surface: 'mud', fog: { color: 0x0b1018, density: 0.035 } });
    // удалённые зоны (на карте рисуются там, где они «должны» быть)
    z('room07', 'Комната 0-7', { x0: -80, x1: -68, z0: 12, z1: 24, y1: 5 }, { map: { level: '0', x0: -15, x1: -6, z0: 1.5, z1: 10.5 } });
    z('room07', 'Комната 0-7', { x0: -74.6, x1: -73.4, z0: 8, z1: 12 }, {});
    z('reflection', 'Отражение', { x0: -63, x1: -57, z0: 32, z1: 41.5 }, { surface: 'metal', map: { level: '0', x0: -3, x1: 3, z0: -40, z1: -34 } });
    z('lab', 'Лаборатория', { x0: 94, x1: 106, z0: -6, z1: 8.6 }, { surface: 'tile', map: { level: '-1' } });
    z('lift1', 'Лифт', { x0: 98.8, x1: 101.2, z0: -8.6, z1: -6 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: '-1' } });
    z('echo', 'Эхо-камера', { x0: 106, x1: 114, z0: -6, z1: 2 }, { surface: 'carpet', map: { level: '-1' } });
    z('gate', 'Шлюз', { x0: 80, x1: 94, z0: -6, z1: 6, y1: 5 }, { map: { level: '-1' } });
    z('core', 'Ядро', { x0: 64, x1: 80, z0: -6, z1: 6, y1: 7 }, { map: { level: '-1' } });
    z('void', 'Этаж Ø', { x0: -10, x1: 10, z0: 100, z1: 120, y1: 6 }, { surface: 'void', fog: { color: 0xd4d7d3, density: 0.045 }, map: { level: 'Ø' } });
    z('liftV', 'Лифт', { x0: -1.2, x1: 1.2, z0: 97.4, z1: 100 }, { surface: 'metal', memoryId: 'elevator', ambience: 'elevator', map: { level: 'Ø' } });
    // газ: где без противогаза нельзя дышать
    this.gasZones.push({ x0: 44, x1: 56, z0: -18, z1: -12, y0: SEW - 3, y1: SEW + 5 }, { x0: 66, x1: 82, z0: -18, z1: -12, y0: SEW - 3, y1: SEW + 5 });
    // вода под напряжением (северо-западный угол резервуара)
    this.hazards.push({ x0: -18, x1: -14.5, z0: -34, z1: -22.4, y0: -1, y1: 1 }, { x0: -14.5, x1: -8, z0: -34, z1: -30.5, y0: -1, y1: 1 });
  }

  // Под напряжением ли вода (кабель линии 2 лежит в ней, пока линию не обесточили).
  cableLive() {
    return !this.game.world.get('cableOff');
  }

  inHazard(x, z, y = 0, pad = 0) {
    return this.hazards.some((h) => x > h.x0 - pad && x < h.x1 + pad && z > h.z0 - pad && z < h.z1 + pad && y > h.y0 && y < h.y1);
  }

  // ── подписки на изменения мира ────────────────────────────────────────────
  subscribe() {
    const bus = this.game.bus;
    bus.on('door:state', (e) => this.doors[e.id] && this.doors[e.id].sync());
    bus.on('item:state', (e) => {
      if (this.pickups[e.id]) this.pickups[e.id].sync();
      const s = this.supplies.find((x) => x.id === e.id);
      if (s) s.sync();
      if (s && s.kind === 'shard') this.refreshLights();
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
      this.syncBlastGate();
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
    if (key === 'boatLamp' || key === 'echoLamp' || key === 'gateAlarm') this.refreshLights();
    if (key === 'cableOff') this.syncCable();
    if (key === 'grateCut') this.syncOutflow();
    if (key === 'monsterDead' || key === 'blastOpen') this.syncBlastGate();
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
    this.syncCable();
    this.syncBlastGate(true);
    if (this.game.world.get('forkCircle')) this.applyForkCircle(true);
    const st = this.game.mem.rule('worn_path');
    this.wornCurtain.amp = this.game.world.get('reflectionPortal') ? 0.14 : 0.03 + Math.min(1, st.progress) * 0.08;
    this.objects.forEach((o) => o.sync && o.sync(true));
  }

  refreshLights() {
    const w = this.game.world;
    const power = !!w.get('power');
    const off = !!w.get('mnemaOff');
    const cableOff = !!w.get('cableOff');
    for (const a of this.b.lights) {
      let on = true;
      let k = a.hi;
      if (a.mode === 'main') on = power;
      else if (a.mode === 'mixed') k = power ? a.hi * 0.9 : a.lo * 0.85; // без питания — только тусклый свет
      else if (a.mode === 'mixedInv') k = power ? a.hi : a.lo;
      else if (a.mode === 'switch') on = !!w.get(a.switchVar);
      else if (a.mode === 'cable') on = !cableOff; // прожекторы резервуара висят на линии 2
      else if (a.mode === 'cableInv') k = cableOff ? a.hi : a.lo; // аварийный красный свет
      else if (a.mode === 'arc') on = !cableOff;
      else if (a.mode === 'item') on = (w.item(a.itemId) || {}).where === 'world';
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
      this.b.moveCollider(this.bedCol, { x0: -2.75, x1: -1.85, y0: 0, y1: 1.9, z0: 4.0, z1: 6.0 });
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

  // Линия 2: рубильник в подстанции, кабель в воде, прожекторы резервуара.
  syncCable() {
    const off = !!this.game.world.get('cableOff');
    if (this.cableLever) this.cableLever.rotation.z = off ? -0.9 : 0.9;
    if (this.cableLamp) this.cableLamp.color.setHex(off ? 0x40ff80 : 0xff3020);
    this.arcs.forEach((a) => (a.mesh.visible = false));
    this.refreshLights();
    this.syncEmitters();
  }

  syncBlastGate(instant = false) {
    const w = this.game.world;
    if (!this.blastGate) return;
    const open = !!w.get('blastOpen');
    if (instant) this.blastT = open ? 1 : 0;
    const lines = !w.get('power') ? [''] : open ? ['ГЕРМОВОРОТА', 'ОТКРЫТО', 'КАРАНТИН СНЯТ'] : w.get('monsterDead') ? ['ГЕРМОВОРОТА', 'КАРАНТИН СНЯТ', '[E] ОТКРЫТЬ'] : ['ГЕРМОВОРОТА', '! КАРАНТИН !', 'ВЫХОД ЗАКРЫТ'];
    updateTextTexture(this.gateScreen.userData.tex, lines, w.get('power') ? { fg: open || w.get('monsterDead') ? '#9fe8c0' : '#ff5a40' } : { bg: '#020303' });
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
    if (!mem.rule('three_passes').done) t.push({ x: -9, z: 0 });
    if (!w.get('falseWallOpen')) t.push({ x: -22, z: -43 + HALL_DZ });
    if (w.get('startStage', 0) < 4) t.push({ x: -3, z: 3 });
    if (!w.get('loopDoor')) t.push({ x: -25, z: -6 });
    if (!mem.rule('worn_path').done) t.push({ x: 0, z: -35.5 });
    if (!mem.solved('landing')) t.push({ x: 22.5, z: -45 });
    if (!w.get('floorVoid')) t.push({ x: 0, z: -62 });
    if (!w.get('g_v2a')) t.push({ x: -20, z: -32 });
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
    // вода: бегущая рябь (у всех материалов воды общая карта нормалей)
    if (this.m.water.normalMap) {
      this.m.water.normalMap.offset.x = time * 0.02;
      this.m.water.normalMap.offset.y = time * 0.013;
    }
    // лучи света видны, пока горит их лампа; туман плывёт; блики от воды дрожат
    for (const c of this.cones) {
      c.mesh.visible = !!(c.anchor && c.anchor._on);
      c.mesh.material.uniforms.time.value = time;
    }
    for (const m of this.mists) {
      m.mesh.material.map.offset.x = time * m.sx;
      m.mesh.material.map.offset.y = time * m.sz;
    }
    for (const c of this.caustics) {
      c.material.map.offset.x = Math.sin(time * 0.21) * 0.3 + time * 0.012;
      c.material.map.offset.y = Math.cos(time * 0.17) * 0.2;
    }
    // плавающий мусор покачивается на воде
    for (const f of this.floaters) {
      f.mesh.position.y = f.y + Math.sin(time * 0.9 + f.phase) * 0.04;
      f.mesh.rotation.z = f.rz + Math.sin(time * 0.7 + f.phase) * 0.06;
      f.mesh.rotation.x = f.rx + Math.cos(time * 0.6 + f.phase) * 0.05;
    }
    this.updateArcs(dt);
    this.updateBlastGate(dt);
    this.updateSnow(dt);
    if (this.fan) this.fan.rotation.x += dt * (g.world.get('power') ? 14 : 1.2);
    if (this.craneHook) this.craneHook.rotation.z = Math.sin(time * 0.4) * 0.05;
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

  // Кабель под током: голубые дуги над водой, искры, треск.
  updateArcs(dt) {
    const live = this.cableLive();
    const p = this.game.player.pos;
    for (const a of this.arcs) {
      if (!live) {
        a.mesh.visible = false;
        continue;
      }
      const near = Math.hypot(p.x - a.x, p.z - a.z) < 30;
      a.t -= dt;
      if (a.t <= 0 && near) {
        a.t = 0.15 + Math.random() * (Math.random() < 0.3 ? 0.2 : 1.6);
        a.flash = 0.06 + Math.random() * 0.1;
        a.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        a.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
        this.game.audio.play('zap', new THREE.Vector3(a.x, a.y, a.z));
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(this.sparkGeo || (this.sparkGeo = new THREE.SphereGeometry(0.014, 4, 3)), this.m.arc);
          s.position.set(a.x, a.y + 0.05, a.z);
          s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2.4, 1 + Math.random() * 1.8, (Math.random() - 0.5) * 2.4);
          s.userData.life = 0.4 + Math.random() * 0.4;
          s.userData.floor = a.y - 0.04;
          this.b.groupOf('corridor').add(s);
          this.sparkParts.push(s);
        }
      }
      a.flash -= dt;
      a.mesh.visible = a.flash > 0;
    }
    this.sparkParts = this.sparkParts.filter((s) => {
      s.userData.life -= dt;
      s.userData.v.y -= 9.8 * dt;
      s.position.addScaledVector(s.userData.v, dt);
      if (s.position.y < s.userData.floor) {
        s.position.y = s.userData.floor;
        s.userData.v.multiplyScalar(0.2);
      }
      if (s.userData.life <= 0) {
        s.parent && s.parent.remove(s);
        return false;
      }
      return true;
    });
  }

  updateBlastGate(dt) {
    if (!this.blastGate) return;
    const w = this.game.world;
    const target = w.get('blastOpen') ? 1 : 0;
    const prev = this.blastT;
    this.blastT += Math.sign(target - this.blastT) * Math.min(Math.abs(target - this.blastT), dt / 7);
    this.blastGate.position.y = 2.1 + this.blastT * 4.15;
    // ворота трясутся, пока ползут
    this.blastGate.position.z = -53 + (this.blastT > 0 && this.blastT < 1 ? (Math.random() - 0.5) * 0.02 : 0);
    this.blastGateCol.enabled = this.blastT < 0.55;
    if (prev < 1 && this.blastT >= 1) this.game.audio.play('door_close', new THREE.Vector3(12, 4, -53));
    const alarm = !!w.get('gateAlarm');
    for (const b of this.beacons) {
      b.visible = alarm;
      b.rotation.y += dt * 6;
    }
  }

  updateSnow(dt) {
    if (!this.snow) return;
    const p = this.game.player.pos;
    if (p.x < 24) return;
    const pos = this.snow.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * (0.7 + (i % 5) * 0.12);
      let x = pos.getX(i) + Math.sin(this.time * 0.6 + i) * dt * 0.3;
      if (y < 3) y += 14;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }

  // Проход мимо двери 0-7 по южным мосткам: вошёл в полосу с одной стороны, вышел с другой.
  checkPassBand() {
    const p = this.game.player.pos;
    const band = this.passBand;
    const onWalk = p.z > -3.5 && p.z < 0 && p.y > -0.5 && p.y < 1;
    const inside = onWalk && p.x > band.a0 && p.x < band.a1;
    if (inside && !band.side) band.side = p.x > (band.a0 + band.a1) / 2 ? 'east' : 'west';
    if (!inside && band.side) {
      const exit = p.x >= band.a1 ? 'east' : p.x <= band.a0 ? 'west' : null;
      if (onWalk && exit && exit !== band.side) this.game.bus.emit('door:pass', { id: 'd_07' });
      band.side = null;
    }
  }

  // Петля лестницы (уходит на восток: x растёт при спуске).
  checkStairs() {
    const g = this.game;
    const p = g.player.pos;
    if (p.z < -45.05 || p.z > -40.9 || p.x < 12) return;
    let n = g.world.get('landing', 0);
    if (p.x > 30.2 && p.y < -4.5 && p.y > -7) {
      p.x -= 9;
      p.y += 3;
      n += 1;
    } else if (p.x < 21 && p.x > 18.5 && n > 0 && p.y < -1.8 && p.y > -3.3) {
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

  // Отсечение невидимых зон. Зона из нескольких коробок видна, если близко хотя бы одна.
  cull(pos) {
    const vis = new Map();
    for (const z of this.b.zones) {
      const dx = Math.max(z.x0 - pos.x, 0, pos.x - z.x1);
      const dz = Math.max(z.z0 - pos.z, 0, pos.z - z.z1);
      const dy = Math.max(z.y0 - pos.y, 0, pos.y - z.y1);
      const near = dx * dx + dz * dz < 40 * 40 && dy < 6;
      vis.set(z.group, (vis.get(z.group) || false) || near);
    }
    for (const [group, v] of vis) group.visible = v;
  }
}

installHub(Level);
installRemote(Level);
