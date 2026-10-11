// Удалённые зоны уровня: канализация (ярус C), комната 0-7, «Отражение», уровень −1 (лаборатория,
// эхо-камера, шлюз, ядро), этаж Ø и три кабины лифта. В мировых координатах они стоят далеко от
// основного комплекса; попадают в них через порталы, люки и лифт.

import * as THREE from 'three';
import { Button, Plate, Crate } from './objects.js';
import { textTexture } from '../render/materials.js';
import { SEW, WATER } from './consts.js';

export function installRemote(Level) {
  Object.assign(Level.prototype, {
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
      b.box(22, Y - 2.2, -16.5, 32, Y - 2.0, -13.5, 'wetConcrete', { zone: S, collide: false });
      // мост через канал
      b.box(23.5, Y - 0.12, -16.5, 25, Y, -13.5, 'grate', { zone: S, collide: false });
      b.floor(23.5, -16.5, 25, -13.5, Y, 'metal');
      for (const [z0, z1] of [[-16.55, -16.45], [-13.55, -13.45]]) {
        b.addCollider({ x0: 22, x1: 23.5, y0: Y, y1: Y + 1.8, z0, z1 }, 'curb');
        b.addCollider({ x0: 25, x1: 58, y0: Y, y1: Y + 1.8, z0, z1 }, 'curb');
      }
      this.water(22, -16.5, 32, -13.5, WATER, S);
      this.button({ id: 'ladder_up', mesh: this.ladderMesh(27, -21.8, Y, Y + 5, S), zone: S, range: 2.4, prompt: 'Подняться в подстанцию', action: () => this.game.survival.climb({ x: 43, y: 0, z: -17.4, yaw: Math.PI }, 'up') });
      p.wallLamp(22.3, Y + 3, -11, S, { color: 0xffb070, lo: 3.6, hi: 3.6, range: 12, flicker: 0.25 });
      p.wallLamp(31.7, Y + 3, -20, S, { color: 0xffb070, lo: 3, hi: 3, range: 11, flicker: 0.4 });
      // тело в противогазе — рядом противогаз и записка; в ящике у стены — затвор ружья
      this.pickup('gasmask', 29.6, Y + 0.05, -20.6, S, { ry: 0.7 });
      this.paper('n_sewer', 30.3, Y + 0.02, -21, S, { ry: 1.2 });
      b.box(22.3, Y, -10.4, 23.2, Y + 0.6, -9.2, 'wood', { zone: S });
      this.pickup('part_bolt', 22.75, Y + 0.6, -9.8, S, { ry: 0.5 });
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
      const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 10), m.sky);
      sky.position.set(146, Y, -10);
      b.groupOf(OUT).add(sky);
      b.light({ x: 135, y: Y + 12, z: -14, color: 0x8aa0d0, mode: 'always', lo: 5, hi: 5, range: 40, zone: OUT, phase: 7 });
      p.yb = 0;
    },

    syncOutflow() {
      const cut = !!this.game.world.get('grateCut');
      this.outGrate.rotation.y = cut ? -1.2 : 0;
      this.outGrate.position.z = cut ? -15.6 : -14;
      this.outGrateCol.enabled = !cut;
    },

    // ── КОМНАТА 0-7 (больше, чем здание) ────────────────────────────────────
    // Вход — с севера, через тамбур со шторкой; из комплекса сюда попадают через дверь 0-7 в
    // южной стене резервуара (портал сдвигает на (−65, 0, +8)).
    buildRoom07() {
      const { b, p } = this;
      const R = 'room07';
      b.room({ x0: -74.6, x1: -73.4, z0: 8, z1: 12, h: 2.6, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { n: false, s: false } });
      b.wallX(8, -74.6, -73.4, 0, 2.6, 'concreteDark', R);
      this.fakeDoor('x', -74, 8.1, R);
      this.curtain('x', 9.5, -74.6, -73.4, 2.6, R);
      this.portal('room07_out', { x0: -74.6, x1: -73.4, z0: 8, z1: 9.48 }, [65, 0, -8]);
      b.room({ x0: -80, x1: -68, z0: 12, z1: 24, h: 4.5, zone: R, floor: 'concreteDark', wall: 'concreteDark', walls: { n: [{ a: -74.6, b: -73.4, top: 2.6 }] } });
      const cx = -74;
      const cz = 18;
      p.table(cx, cz, 6, 1.4, R, { mat: 'wood' });
      const names = ['Ланская', 'Громов', 'Шум', 'Оператор', 'Испытуемый', 'Копия', '—'];
      const seats = [[cx - 2, cz - 1.1, 0], [cx, cz - 1.1, 0], [cx + 2, cz - 1.1, 0], [cx - 2, cz + 1.1, Math.PI], [cx, cz + 1.1, Math.PI], [cx + 2, cz + 1.1, Math.PI], [cx - 3.6, cz, Math.PI / 2]];
      seats.forEach(([x, z, ry], i) => {
        p.chair(x, z + (ry === 0 ? -0.3 : ry === Math.PI ? 0.3 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry, R);
        const card = p.sign([names[i]], x + (i === 6 ? 0.55 : 0), 0.82, z + (ry === 0 ? 0.25 : ry === Math.PI ? -0.25 : 0), ry === Math.PI / 2 ? -Math.PI / 2 : ry === 0 ? Math.PI : 0, R, { w: 0.24, h: 0.08, bg: '#e8e4d8', fg: '#1a1a1a', tw: 256, th: 80, font: 'bold 34px Consolas' });
        card.rotation.x = -0.35;
      });
      this.pickup('fuse_c', cx - 0.8, 0.77, cz - 0.1, R, { ry: 0.8 });
      this.pickup('frag1', cx + 0.9, 0.77, cz - 0.2, R, { ry: -0.3 });
      this.paper('n_07', cx + 0.1, 0.77, cz + 0.2, R, { ry: 0.1 });
      p.fixture(cx, 4.5, cz, R, { mode: 'always', lo: 4.5, hi: 4.5, warm: true, color: 0xffd8b0, range: 12 });
      p.fixture(cx, 4.5, cz + 4.5, R, { mode: 'always', lo: 1.2, hi: 1.2, range: 8, flicker: 0.5 });
      this.observerAnchors.push({ x: -79, y: 0, z: 23, zone: R });
    },

    // ── ОТРАЖЕНИЕ (комната пробуждения наоборот) ────────────────────────────
    buildReflection() {
      const { b, p } = this;
      const R = 'reflection';
      b.room({ x0: -61.2, x1: -58.8, z0: 38, z1: 41.5, h: 3.6, zone: R, floor: 'tiles', wall: 'bunker', walls: { n: false } });
      this.curtain('x', 40, -61.2, -58.8, 3.6, R);
      this.portal('reflection_out', { x0: -61.2, x1: -58.8, z0: 40.05, z1: 41.5 }, [60, 0, -75.5]);
      b.room({ x0: -63, x1: -57, z0: 32, z1: 38, zone: R, floor: 'concreteDark', wall: 'bunker', surface: 'metal', walls: { s: [{ a: -61.2, b: -58.8, top: 3 }] } });
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
    },

    // ── УРОВЕНЬ −1: ЛАБОРАТОРИЯ, ЭХО-КАМЕРА, ШЛЮЗ ───────────────────────────
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
      // обратно на лестницу (к пролёту −1 бесконечной лестницы у центрального поста)
      this.portal('lab_out', { x0: 96.4, x1: 97.6, z0: 7.32, z1: 8.6, y0: -1, y1: 2 }, [-74.5, -3, -53.6]);
      p.table(98.5, -3.5, 2, 0.8, LB);
      for (let i = 0; i < 5; i++) b.box(97.7 + i * 0.35, 0.76, -3.7, 97.95 + i * 0.35, 0.9 + (i % 3) * 0.1, -3.4, i % 2 ? 'plasticLight' : 'metal', { zone: LB, collide: false });
      p.table(100, 5.4, 1.2, 0.7, LB);
      const t4 = p.terminal(100, 5.3, Math.PI, LB);
      this.button({ id: 't4', mesh: t4, zone: LB, prompt: 'Терминал', action: () => this.game.story.openTerminal('t4') });
      this.paper('n_lab', 100.7, 0.77, 5.3, LB, { ry: 0.3 });
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
      this.supply('shells', 112.9, 0.77, -0.9, E);

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
    },

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
    },

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
    },

    // ── ЛИФТ: три одинаковые кабины ─────────────────────────────────────────
    buildElevator() {
      const { b, p, m } = this;
      this.cabs = {
        0: { ox: 0, oz: -61, zone: 'lift0', outer: 'hall' },
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
    },
  });
}
