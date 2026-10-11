// Основной ярус Сектора 0: изолятор, резервуар с мостками, жилой блок, казарма, архив, техблок,
// подстанция, мастерская, центральный пост с гермоворотами, бесконечная лестница, вентиляция,
// грузовой шлюз и поверхность.

import * as THREE from 'three';
import { Readable, Button } from './objects.js';
import { itemModel } from './props.js';
import { textTexture, updateTextTexture } from '../render/materials.js';
import { BAL, SEW, POOL, PIT, SUNK, HALL_DZ } from './consts.js';
import { makeCone, mistLayer, causticStrip } from '../render/atmos.js';

const D = HALL_DZ;
const zz = (v) => v + D; // старая разметка центрального поста → новая

export function installHub(Level) {
  Object.assign(Level.prototype, {
    // Двухъярусная койка (группа — её двигает правило «Изменённая комната»).
    bunk(x, z, ry, zone) {
      const g = this.p.bed(x, z, ry, zone);
      const m = this.m;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 1.95), m.metalDark);
      top.position.y = 1.5;
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 1.88), m.fabric);
      mat.position.y = 1.59;
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.9), new THREE.MeshStandardMaterial({ color: 0x2e3a2c, roughness: 1 }));
      blanket.position.set(0, 1.67, 0.4);
      g.add(top, mat, blanket);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.9, 0.045), m.metalDark);
        post.position.set(sx * 0.44, 0.95, sz * 0.96);
        g.add(post);
      }
      g.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      return g;
    },

    // ── ИЗОЛЯТОР (точка пробуждения) ───────────────────────────────────────
    buildStart() {
      const { b, p, m } = this;
      const Z = 'start';
      b.box(-3, -0.2, 0, 3, 0, 7.5, 'tread', { zone: Z, collide: false });
      b.box(-3, 3, 0, 3, 3.2, 7.5, 'metalDark', { zone: Z, collide: false, cast: false });
      b.floor(-3, 0, 3, 7.5, 0, 'metal');
      // северная стена смотрит прямо в резервуар: дверь и смотровое окно
      b.wallX(0, -3, 3, 0, 3, 'bunker', Z, [{ a: -0.5, b: 0.5 }, { a: -2.4, b: -1.2, bottom: 1.1, top: 2.0 }]);
      b.wallZ(-3, 0, 7.5, 0, 3, 'bunker', Z, [{ a: 2.5, b: 3.5 }]);
      b.wallZ(3, 0, 7.5, 0, 3, 'bunker', Z);
      // окно с армированным стеклом
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), m.glass);
      glass.position.set(-1.8, 1.55, 0);
      b.groupOf(Z).add(glass);
      b.addCollider({ x0: -2.4, x1: -1.2, y0: 1.1, y1: 2.0, z0: -0.05, z1: 0.05 }, 'glass');
      for (let i = 1; i < 4; i++) b.box(-2.4 + i * 0.3 - 0.008, 1.1, -0.01, -2.4 + i * 0.3 + 0.008, 2.0, 0.01, 'metalDark', { zone: Z, collide: false });
      b.box(-2.48, 1.02, -0.14, -1.12, 1.1, 0.14, 'metalDark', { zone: Z, collide: false });
      this.inspect({ id: 'window_start', mesh: glass, zone: Z, range: 2.4, text: 'За стеклом — огромный резервуар. Вода чёрная и неподвижная. На мостках никого. Пока.' });
      // трубы под потолком
      p.pipe(-3, 2.75, 0.4, 3, 0.4, 0.06, Z, 'rust');
      p.pipe(-3, 2.85, 0.6, 3, 0.6, 0.045, Z, 'metalDark');
      // подвижная южная стена (Правило 4: комната «удлиняется») — с UV в мировых метрах
      this.startWall = new THREE.Group();
      const wg = new THREE.BoxGeometry(5.8, 3, 0.2);
      const wallMesh = new THREE.Mesh(wg, m.bunker);
      wallMesh.position.set(0, 1.5, 0);
      wallMesh.receiveShadow = true;
      const pos = wg.attributes.position;
      const nor = wg.attributes.normal;
      const uv = wg.attributes.uv;
      const ts = m.bunker.userData.texScale || 3;
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

      // двухъярусная койка с ремнями
      this.bedGroup = this.bunk(2.3, 4.2, 0, Z);
      for (const zv of [-0.4, 0.5]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.07), m.rubber);
        strap.position.set(0, 0.61, zv);
        this.bedGroup.add(strap);
      }
      b.addCollider({ x0: 1.85, x1: 2.75, y0: 0, y1: 1.9, z0: 3.2, z1: 5.2 }, 'prop');
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
      this.pickup('flashlight', 2.55, 0.77, 1.7, Z, { ry: 0.6 });
      this.pickup('map', 2.45, 0.77, 1.25, Z, { ry: -0.25 });
      p.chair(1.9, 1.2, -Math.PI / 2, Z);
      const photo = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.015), m.wood);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 }));
      pic.position.z = 0.009;
      photo.add(frame, pic);
      photo.position.set(2.8, 0.86, 0.5);
      photo.rotation.set(-0.15, -Math.PI / 2, 0);
      b.groupOf(Z).add(photo);
      this.shiftables.start_photo = { room: 'start', apply: () => photo.rotation.set(Math.PI / 2, -Math.PI / 2, 0), obj: photo };
      this.inspect({ id: 'photo', mesh: photo, zone: Z, text: () => (this.game.world.get('shift_start_photo') ? 'Фотография лежит лицом вниз. Я её не трогал.' : 'Фотография. Пустой изолятор. Этот изолятор. Снято с того места, где стоит койка.') });
      // раковина и зеркало (зеркало настоящее — в нём отражается комната)
      b.box(2.55, 0.75, 2.3, 2.95, 0.9, 2.9, 'plasticLight', { zone: Z, collide: false });
      b.addCollider({ x0: 2.5, x1: 3, y0: 0, y1: 0.9, z0: 2.3, z1: 2.9 }, 'prop');
      b.box(2.85, 0.2, 2.5, 2.95, 0.75, 2.7, 'metalDark', { zone: Z, collide: false });
      this.mirrorSpot = { x: 2.88, y: 1.55, z: 2.6 };

      this.paper('n_rules', -2.88, 1.6, 1.3, Z, { ry: Math.PI / 2, wall: true });
      this.paper('n_history', 2.88, 1.75, 5.45, Z, { ry: -Math.PI / 2, wall: true });
      p.fixture(0, 3, 3.2, Z, { mode: 'always', lo: 6, hi: 6, warm: true, color: 0xffd8b0, range: 8, flicker: 0.06, w: 0.6, d: 0.3 });
      p.wallLamp(-2.85, 2.3, 5.2, Z, { color: 0xff6a3a, lo: 1.0, hi: 1.0, range: 4 });
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
      this.plug({ x0: -3.08, x1: -2.92, y0: 0, y1: 2.2, z0: 2.5, z1: 3.5 }, 'bunker', Z, () => this.game.world.get('startStage', 0) < 4);
      this.emitter('secret_waiting', 'secret', -3, 1.2, 3, () => this.game.world.get('startStage', 0) < 4, 1, 10);
    },

    // ── РЕЗЕРВУАР: мостки над водой, мост к насосной башне, кабель под током ──
    buildReservoir() {
      const { b, p, m } = this;
      const C = 'corridor';
      const H = 14;
      const X0 = -18;
      const X1 = 18;
      const Z0 = -34;
      const Z1 = 0;
      const up = (y) => y - PIT; // высота относительно основания стены
      const hW = H - PIT;
      // дно, потолок, вода
      b.box(X0, PIT - 0.3, Z0, X1, PIT, Z1, 'wetConcrete', { zone: C, collide: false });
      b.box(X0, H, Z0, X1, H + 0.3, Z1, 'concreteDark', { zone: C, collide: false, cast: false });
      this.water(X0, Z0, X1, Z1, POOL, C, 'pool');
      // тёмная толща воды (чтобы дно не просвечивало)
      const deep = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), m.deep);
      deep.rotation.x = -Math.PI / 2;
      deep.position.set(0, POOL - 0.6, (Z0 + Z1) / 2);
      b.groupOf(C).add(deep);
      // стены резервуара (клёпаные стальные листы)
      b.wallX(Z1, X0, -3.2, PIT, hW, 'tank', C, [{ a: -9.5, b: -8.5, bottom: up(0), top: up(2.2) }]);
      b.wallX(Z1, 3.2, X1, PIT, hW, 'tank', C);
      b.box(-3.2, 3.2, -0.1, 3.2, H, 0.1, 'tank', { zone: C });
      b.box(-3.2, PIT, -0.1, 3.2, -0.36, 0.1, 'tank', { zone: C, collide: false });
      b.wallX(Z0, X0, X1, PIT, hW, 'tank', C, [{ a: -1.5, b: 1.5, bottom: up(0), top: up(2.6) }]);
      b.wallZ(X0, Z0, Z1, PIT, hW, 'tank', C, [{ a: -8.5, b: -7.5, bottom: up(0), top: up(2.2) }, { a: -28.5, b: -27.5, bottom: up(SUNK), top: up(2.1) }]);
      b.wallZ(X1, Z0, Z1, PIT, hW, 'tank', C, [{ a: -8.5, b: -7.5, bottom: up(0), top: up(2.2) }, { a: -18.6, b: -17.4, bottom: up(0), top: up(1.15) }]);

      // мостки
      const slab = (x0, z0, x1, z1, y = 0, mat = 'tread', surface = 'metal') => {
        b.box(x0, y - 0.35, z0, x1, y, z1, mat, { zone: C, collide: false });
        b.floor(x0, z0, x1, z1, y, surface);
      };
      slab(X0, -3.5, X1, Z1);
      slab(X0, -22.4, -14.5, -3.5);
      slab(14.5, Z0, X1, -3.5);
      slab(-8, Z0, 14.5, -30.5);
      // затопленный северо-западный угол: плиты просели, вода по щиколотку
      slab(X0, Z0, -14.5, -22.4, SUNK, 'wetConcrete', 'wet');
      slab(-14.5, Z0, -8, -30.5, SUNK, 'wetConcrete', 'wet');
      this.water(X0, Z0, -14.5, -22.4, SUNK + 0.2, C, 'shallow');
      this.water(-14.5, Z0, -8, -30.5, SUNK + 0.2, C, 'shallow');
      // ступенька между сухими и просевшими плитами
      b.box(X0, SUNK, -22.5, -14.5, 0, -22.4, 'wetConcrete', { zone: C, collide: false });
      b.box(-8.1, SUNK, Z0, -8, 0, -30.5, 'wetConcrete', { zone: C, collide: false });
      // мост к насосной башне и островок
      b.box(-1.2, -0.15, -12, 1.2, 0, -3.5, 'grate', { zone: C, collide: false });
      b.box(-1.25, -0.4, -12, -1.15, -0.15, -3.5, 'metalDark', { zone: C, collide: false });
      b.box(1.15, -0.4, -12, 1.25, -0.15, -3.5, 'metalDark', { zone: C, collide: false });
      b.floor(-1.2, -12, 1.2, -3.5, 0, 'metal');
      slab(-5, -20, 5, -12, 0, 'concreteDark', 'concrete');
      // опоры
      for (const [x, z] of [[-4.5, -19.5], [4.5, -19.5], [-4.5, -12.5], [4.5, -12.5], [0, -8]]) b.box(x - 0.4, PIT, z - 0.4, x + 0.4, -0.35, z + 0.4, 'concrete', { zone: C, collide: false });
      for (let x = -12; x <= 12; x += 6) b.box(x - 0.3, PIT, -3.8, x + 0.3, -0.35, -3.2, 'concrete', { zone: C, collide: false });
      for (let z = -28; z <= -8; z += 6) {
        b.box(-14.8, PIT, z - 0.3, -14.2, -0.35, z + 0.3, 'concrete', { zone: C, collide: false });
        b.box(14.2, PIT, z - 0.3, 14.8, -0.35, z + 0.3, 'concrete', { zone: C, collide: false });
      }
      for (let x = -6; x <= 12; x += 6) b.box(x - 0.3, PIT, -30.8, x + 0.3, -0.35, -30.2, 'concrete', { zone: C, collide: false });
      // обломок северного моста — наполовину в воде, ни к чему не прикасается
      const broken = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 4.2), m.grate);
      broken.position.set(0.4, POOL + 0.05, -25);
      broken.rotation.set(0.12, 0.25, 0.08);
      b.groupOf(C).add(broken);
      for (const sx of [-1, 1]) {
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.0), m.hazard);
        rail2.position.set(0.4 + sx * 1.05, POOL + 0.5, -25);
        rail2.rotation.set(0.12, 0.25, 0.08 + sx * 0.2);
        b.groupOf(C).add(rail2);
      }
      // перила (и невидимые бортики там, где перила сорваны)
      this.rail(-14.5, -3.5, -1.2, -3.5, C);
      this.rail(1.2, -3.5, 14.5, -3.5, C);
      this.rail(-14.5, -22.4, -14.5, -3.5, C);
      this.rail(14.5, -30.5, 14.5, -3.5, C);
      this.rail(-8, -30.5, 14.5, -30.5, C);
      this.rail(-14.5, -30.5, -14.5, -22.4, C, { visible: false });
      this.rail(-14.5, -30.5, -8, -30.5, C, { visible: false });
      this.rail(-1.2, -12, -1.2, -3.5, C);
      this.rail(1.2, -12, 1.2, -3.5, C);
      this.rail(-5, -12, -1.2, -12, C);
      this.rail(1.2, -12, 5, -12, C);
      this.rail(-5, -20, 5, -20, C);
      this.rail(-5, -20, -5, -12, C);
      this.rail(5, -20, 5, -12, C);
      // сорванные куски перил лежат в мелкой воде затопленного угла
      for (const [x, z, ry] of [[-15.6, -25.5, 0.3], [-11.5, -31.4, 1.5], [-16.8, -30.6, 2.2]]) {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.0), m.hazard);
        piece.position.set(x, SUNK + 0.04, z);
        piece.rotation.set(0, ry, 0);
        b.groupOf(C).add(piece);
      }

      // насосная башня на островке
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 9, 24), m.rust);
      tower.position.set(0, 4.5, -16);
      tower.castShadow = tower.receiveShadow = true;
      b.groupOf(C).add(tower);
      for (const y of [1.2, 3.8, 6.4, 8.6]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 6, 30), m.metalDark);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, y, -16);
        b.groupOf(C).add(band);
      }
      b.addCollider({ x0: -1.7, x1: 1.7, y0: 0, y1: 9, z0: -17.7, z1: -14.3 });
      this.ladderMesh(0, -14.15, 0, 8.6, C);
      p.sign(['НАСОСНАЯ БАШНЯ  Н-1'], 0, 2.6, -14.14, 0, C, { w: 1.3, h: 0.22, tw: 512, th: 80 });
      // пульт башни и ящик со стволом
      b.box(2.6, 0, -13.3, 4.2, 1.05, -12.5, 'metalDark', { zone: C });
      const scr = p.screen(['НАСОСЫ: СТОП', 'УРОВЕНЬ: 71%', 'ЛИНИЯ 2: ~'], 3.4, 1.25, -12.48, 0, C, { w: 0.6, h: 0.32 });
      this.towerScreen = scr;
      b.box(-4.2, 0, -19.4, -2.8, 0.7, -18.4, 'wood', { zone: C });
      this.pickup('part_barrel', -3.5, 0.71, -18.9, C, { ry: 0.3 });
      this.pickup('tape2', 3.2, 1.06, -12.85, C, { ry: -0.4 });
      p.wallLamp(-1.5, 2.4, -14.4, C, { color: 0xffb070, lo: 2.4, hi: 2.4, range: 7, flicker: 0.2 });

      // кабель линии 2: сорванный прожектор на западной стене, кабель уходит в воду
      const fallen = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), m.metalDark);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), m.lampOff);
      lens.position.z = 0.26;
      fallen.add(housing, lens);
      fallen.position.set(-17.5, 5.6, -26.8);
      fallen.rotation.set(0.9, 0.7, 0.3);
      b.groupOf(C).add(fallen);
      const cablePts = [
        new THREE.Vector3(-17.6, 5.4, -26.8),
        new THREE.Vector3(-17.2, 3.6, -27.0),
        new THREE.Vector3(-16.6, 1.6, -27.3),
        new THREE.Vector3(-16.2, SUNK + 0.18, -27.6),
        new THREE.Vector3(-15.4, SUNK + 0.12, -28.9),
        new THREE.Vector3(-14.2, SUNK + 0.14, -31.2),
        new THREE.Vector3(-11.6, SUNK + 0.12, -32.3),
      ];
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts), 60, 0.035, 6, false), m.rubber);
      cable.castShadow = true;
      b.groupOf(C).add(cable);
      // голая жила на конце — искрит
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.25, 5), m.metal);
      core.position.set(-11.45, SUNK + 0.15, -32.35);
      core.rotation.z = Math.PI / 2;
      b.groupOf(C).add(core);
      for (const [x, y, z] of [[-16.2, SUNK + 0.22, -27.6], [-11.4, SUNK + 0.2, -32.35]]) {
        const arc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xb8e0ff, wireframe: true }));
        arc.position.set(x, y + 0.1, z);
        arc.visible = false;
        b.groupOf(C).add(arc);
        this.arcs.push({ mesh: arc, x, y, z, t: Math.random(), flash: 0 });
      }
      b.light({ x: -14.5, y: 0.6, z: -29.5, color: 0x9ad0ff, mode: 'arc', lo: 0, hi: 9, range: 12, zone: C, flicker: 0.95, phase: 3 });
      this.emitter('cable_buzz', 'electric', -14.5, 0.2, -29.5, () => this.cableLive(), 1, 16);
      const warn = { w: 1.3, h: 0.62, tw: 512, th: 256, bg: '#c8a420', fg: '#141008' };
      p.sign(['⚡ ОПАСНО ⚡', 'ВОДА ПОД', 'НАПРЯЖЕНИЕМ'], -16.25, 1.7, -21.9, 0, C, warn);
      b.box(-16.3, 0, -21.86, -16.2, 1.4, -21.76, 'metalDark', { zone: C, collide: false });
      p.sign(['⚡ ОПАСНО ⚡', 'ВОДА ПОД', 'НАПРЯЖЕНИЕМ'], -7.7, 1.7, -32.25, Math.PI / 2, C, warn);
      this.inspect({ id: 'cable', mesh: cable, zone: C, range: 6, text: () => (this.cableLive() ? 'Оборванный кабель лежит в воде и трещит. Голубые искры. Ступить туда — смерть. Линию нужно обесточить — рубильник наверняка в подстанции.' : 'Кабель молчит. Линия обесточена. Вода просто холодная.') });

      // свет: прожекторы на линии 2, аварийные красные лампы, подводная подсветка, лампы на мостках
      [[-17.6, 7.5, -8, Math.PI / 2], [17.6, 7.5, -6, -Math.PI / 2], [17.6, 7.5, -18, -Math.PI / 2], [17.6, 7.5, -28, -Math.PI / 2], [-9, 7.5, -0.3, Math.PI], [9, 7.5, -0.3, Math.PI], [-9, 7.5, -33.7, 0], [9, 7.5, -33.7, 0]].forEach(([x, y, z, ry], i) => {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), m.metalDark);
        const lensMat = m.lampWhite.clone();
        lensMat.color.multiplyScalar(0.5);
        const len = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), lensMat);
        len.position.z = 0.21;
        g.add(box, len);
        g.position.set(x, y, z);
        g.rotation.set(0.6, ry, 0);
        b.groupOf(C).add(g);
        const dir = new THREE.Vector3(Math.sin(ry) * Math.cos(0.6), -Math.sin(0.6), Math.cos(ry) * Math.cos(0.6));
        const anchor = b.light({ x: x + Math.sin(ry) * 1.2, y: y - 0.8, z: z + Math.cos(ry) * 1.2, color: 0xd6e2ff, mode: 'cable', lo: 0, hi: 230, range: 34, zone: C, bias: 160, flicker: i === 5 ? 0.3 : 0.03, fixtureMat: lensMat, baseColor: lensMat.color.clone(), phase: i * 1.7 });
        const cone = makeCone(new THREE.Vector3(x, y, z).addScaledVector(dir, 0.25), dir, 11, 0.22, 3.4, 0xc8d8ff, 0.16);
        b.groupOf(C).add(cone);
        this.cones.push({ mesh: cone, anchor });
      });
      // стелющийся над водой туман (три слоя, плывут с разной скоростью)
      [[POOL + 0.1, 0.22, 2.2], [POOL + 0.4, 0.13, 1.5], [POOL + 0.85, 0.07, 1.1]].forEach(([y, op, rep], i) => {
        const mist = mistLayer(-14.5, -30.5, 14.5, -3.5, y, op, rep, 0x56685f);
        b.groupOf(C).add(mist);
        this.mists.push({ mesh: mist, sx: 0.006 + i * 0.004, sz: 0.004 - i * 0.003 });
      });
      const fmist = mistLayer(-18, -34, -8, -22.4, SUNK + 0.35, 0.14, 1.2, 0x5a6a76);
      b.groupOf(C).add(fmist);
      this.mists.push({ mesh: fmist, sx: 0.01, sz: 0.006 });
      // блики от воды на стенах резервуара и опорах
      for (const [x, z, len, axis] of [[0, -0.12, 36, 'x'], [0, -33.88, 36, 'x'], [-17.88, -17, 34, 'z'], [17.88, -17, 34, 'z']]) {
        const st = causticStrip(x, z, len, axis, POOL - 0.3, 0.95, 0x3aa890, 0.3);
        if (z > -1) st.rotation.y = Math.PI;
        if (x > 17) st.rotation.y = -Math.PI / 2;
        b.groupOf(C).add(st);
        this.caustics.push(st);
      }
      for (const [x, z] of [[0, -14.15], [0, -17.85]]) {
        const st = causticStrip(x, z, 3.4, 'x', 0, 1.6, 0x3aa890, 0.12);
        if (z < -16) st.rotation.y = Math.PI;
        b.groupOf(C).add(st);
        this.caustics.push(st);
      }
      [[-17.7, -14, Math.PI / 2], [17.7, -12, -Math.PI / 2], [-6, -0.15, Math.PI], [6, -33.85, 0], [17.7, -26, -Math.PI / 2]].forEach(([x, z, ry]) => {
        const lampMat = m.lampRed.clone();
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat);
        l.position.set(x, 2.6, z);
        b.groupOf(C).add(l);
        const cage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), m.metalDark);
        cage.position.set(x - Math.sin(ry) * 0.05, 2.62, z - Math.cos(ry) * 0.05);
        b.groupOf(C).add(cage);
        b.light({ x: x + Math.sin(ry) * 0.4, y: 2.4, z: z + Math.cos(ry) * 0.4, color: 0xff2a18, mode: 'cableInv', lo: 1.2, hi: 9, range: 14, zone: C, flicker: 0.12, fixtureMat: lampMat, baseColor: lampMat.color.clone(), phase: x });
      });
      [[-8, -10], [8, -24], [-9, -22], [9, -9]].forEach(([x, z], i) => b.light({ x, y: POOL - 0.8, z, color: 0x1e8a72, mode: 'always', lo: 5, hi: 5, range: 11, zone: C, flicker: 0.1, phase: i * 2.1 }));
      [[-12, -0.25], [12, -0.25], [-17.75, -16], [17.75, -22]].forEach(([x, z]) => p.wallLamp(x, 2.5, z + (z > -1 ? 0 : 0), C, { color: 0xffc890, lo: 2.0, hi: 2.0, range: 8, flicker: 0.15 }));

      // кран-балка над водой: цепь и крюк качаются
      b.box(X0, 11, -16.4, X1, 11.8, -15.6, 'hazard', { zone: C, collide: false });
      b.box(X0, 10.6, -17, X0 + 0.5, 12, -15, 'metalDark', { zone: C, collide: false });
      b.box(X1 - 0.5, 10.6, -17, X1, 12, -15, 'metalDark', { zone: C, collide: false });
      b.box(-6.5, 10.4, -16.6, -5, 11, -15.4, 'metalDark', { zone: C, collide: false });
      // цепь из крупных звеньев с тяжёлым крюком; на крюке висит мешок
      this.craneHook = new THREE.Group();
      const linkGeo = new THREE.TorusGeometry(0.075, 0.022, 6, 14);
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x5a4434, roughness: 0.55, metalness: 0.75 });
      const links = 34;
      for (let i = 0; i < links; i++) {
        const link = new THREE.Mesh(linkGeo, chainMat);
        link.scale.set(1, 1.7, 1);
        link.position.y = -i * 0.2;
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        link.castShadow = true;
        this.craneHook.add(link);
      }
      const hookY = -links * 0.2 - 0.1;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.14), m.hazard);
      block.position.y = hookY;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 18, Math.PI * 1.5), chainMat);
      hook.position.y = hookY - 0.38;
      hook.rotation.z = Math.PI * 0.75;
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 6, 12), new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.35, metalness: 0.1 }));
      bag.position.y = hookY - 1.35;
      bag.scale.set(1, 1, 0.75);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), m.rubber);
      rope.position.y = hookY - 0.62;
      this.craneHook.add(block, hook, rope, bag);
      this.craneHook.position.set(-5.75, 10.4, -16);
      b.groupOf(C).add(this.craneHook);
      // трубы вдоль стен
      for (let i = 0; i < 3; i++) p.pipe(X0, 6 + i * 0.5, -33.6, X1, -33.6, 0.18 - i * 0.04, C, i % 2 ? 'metalDark' : 'rust');
      for (let i = 0; i < 2; i++) p.pipe(X0 + 0.5, 9 + i * 0.6, -0.6, X1 - 0.5, -0.6, 0.14, C, 'rust');
      // мусор на воде
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.6, metalness: 0.4 });
      [[-9, -12, 0.3], [9.5, -21, 1.2], [-6, -26.5, 0.8], [10, -8.5, 2], [6.5, -27, 0.2]].forEach(([x, z, r], i) => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12), barrelMat);
        barrel.rotation.set(Math.PI / 2, r, 0.2);
        barrel.position.set(x, POOL + 0.08, z);
        barrel.castShadow = true;
        b.groupOf(C).add(barrel);
        this.floaters.push({ mesh: barrel, y: POOL + 0.08, rx: Math.PI / 2, rz: 0.2, phase: i * 1.9 });
      });
      // тело лицом вниз у островка
      const body = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 6, 10), new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5 }));
      torso.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a7068, roughness: 0.6 }));
      head.position.z = -0.75;
      body.add(torso, head);
      body.position.set(7.2, POOL + 0.03, -15.5);
      body.rotation.y = 0.8;
      b.groupOf(C).add(body);
      this.floaters.push({ mesh: body, y: POOL + 0.03, rx: 0, rz: 0, phase: 4 });
      this.inspect({ id: 'floater', mesh: torso, zone: C, range: 9, text: 'В воде у башни лицом вниз плавает человек в спецовке. Он не двигается. Вода вокруг него рябит, хотя ветра здесь нет.' });

      // табличка-указатель над южными мостками (смотрит на выходящего из изолятора)
      for (const sx of [-1, 1]) b.box(sx * 1.0 - 0.015, 3.13, -3.25, sx * 1.0 + 0.015, 7.5, -3.22, 'metalDark', { zone: C, collide: false });
      this.junctionSign = p.sign(['← ЖИЛОЙ БЛОК    ТЕХБЛОК →'], 0, 3.0, -3.24, 0, C, { w: 2.2, h: 0.26, tw: 640, th: 72 });
      this.shiftables.corridor_sign = { room: 'corridor', apply: () => updateTextTexture(this.junctionSign.userData.tex, ['← ТЕХБЛОК    ЖИЛОЙ БЛОК →']) };
      p.sign(['ЖИЛОЙ БЛОК · АРХИВ'], -17.88, 2.6, -8, Math.PI / 2, C, { w: 1.2, h: 0.2, tw: 512, th: 72 });
      p.sign(['ТЕХБЛОК · ПОДСТАНЦИЯ'], 17.88, 2.6, -8, -Math.PI / 2, C, { w: 1.2, h: 0.2, tw: 512, th: 72 });
      p.sign(['ЦЕНТРАЛЬНЫЙ ПОСТ ↑'], 0, 3.0, -33.88, 0, C, { w: 1.4, h: 0.22, tw: 512, th: 72 });
      p.sign(['МАСТЕРСКАЯ'], -17.88, 2.5, -28, Math.PI / 2, C, { w: 0.9, h: 0.2, tw: 384, th: 72 });
      // засечки поворотов (Правило 6) — по обе стороны двери изолятора
      this.tallyL = p.sign([''], -4.4, 1.3, -0.12, Math.PI, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
      this.tallyR = p.sign([''], 4.4, 1.3, -0.12, Math.PI, C, { w: 0.5, h: 0.3, bg: '#8a8880', fg: '#2a2a28', tw: 200, th: 120 });
      this.inspect({ id: 'tally', mesh: this.tallyL, zone: C, text: 'Царапины на стене, сгруппированные по пять. Свежие.' });
      this.inspect({ id: 'tally_r', mesh: this.tallyR, zone: C, text: 'Царапины. Их число как будто меняется.' });
      this.emitter('reservoir_hum', 'lamp', 9, 7, -0.6, () => this.cableLive(), 0.5, 14);

      // ДВЕРЬ 0-7 (Правило 1) — в южной стене резервуара, мимо неё ходят по южным мосткам
      this.door({ id: 'd_07', axis: 'x', x: -9, z: 0, zone: C, locked: true, lamp: true, lampSide: -1, mat: 'doorRed', sign: textTexture('0-7', { w: 128, h: 64, font: 'bold 34px Consolas' }), lockText: 'Заперто. За дверью — тишина. Слишком ровная тишина.' });
      this.emitter('secret_07', 'secret', -9, 1.2, -0.2, () => !this.game.mem.rule('three_passes').done, 1, 10);
      this.passBand = { a0: -11.4, a1: -6.6, side: null };
      const V = 'vest07';
      b.room({ x0: -9.6, x1: -8.4, z0: 0, z1: 3, h: 2.6, zone: V, floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
      this.curtain('x', 1.5, -9.6, -8.4, 2.6, V);
      this.portal('room07', { x0: -9.6, x1: -8.4, z0: 1.52, z1: 3 }, [-65, 0, 8]);

      // тоннель на север со шторкой (Правило 9)
      b.room({ x0: -1.5, x1: 1.5, z0: -37, z1: -34, h: 2.6, zone: C, floor: 'tread', wall: 'concreteDark', ceil: 'metalDark', surface: 'metal', walls: { n: false, s: false } });
      p.fixture(0, 2.6, -35.5, C, { lo: 1.2, hi: 3.5, range: 6, w: 0.8, flicker: 0.1 });
      this.wornCurtain = this.curtain('x', -35.5, -1.5, 1.5, 2.6, C, { id: 'worn' });
      this.portal('reflection', { x0: -1.5, x1: 1.5, z0: -37, z1: -35.55 }, [-60, 0, 73], () => !!this.game.world.get('reflectionPortal'));
      this.emitter('secret_worn', 'secret', 0, 2, -35.5, () => !this.game.mem.rule('worn_path').done && this.game.mem.rule('worn_path').progress > 0.6, 0.6, 9);
      this.observerAnchors.push({ x: -16.3, y: 0, z: -4.6, zone: C }, { x: 16.3, y: 0, z: -29.5, zone: C }, { x: 3.6, y: 0, z: -19, zone: C }, { x: 12, y: 0, z: -32.3, zone: C });
    },

    // ── ЖИЛОЙ БЛОК И КАЗАРМА ────────────────────────────────────────────────
    buildWest() {
      const { b, p } = this;
      const W = 'west';
      const H = 3.2;
      b.room({ x0: -32, x1: -18, z0: -10, z1: -6, h: H, zone: W, floor: 'concreteDark', wall: 'bunker', ceil: 'metalDark', surface: 'concrete', walls: { e: false, w: [{ a: -8.5, b: -7.5 }], n: [{ a: -26.5, b: -25.5 }], s: [{ a: -25.5, b: -24.5 }] } });
      this.door({ id: 'd_west', axis: 'z', x: -18, z: -8, zone: W, sign: textTexture('ЖИЛ.', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      [-21.5, -29].forEach((x, i) => p.fixture(x, H, -8, W, { lo: 1.3, hi: 4.2, flicker: i ? 0.35 : 0.05 }));
      p.pipe(-32, H - 0.25, -9.75, -18, -9.75, 0.07, W, 'rust');
      p.pipe(-32, H - 0.12, -9.8, -18, -9.8, 0.045, W, 'metalDark');
      this.westPoster = p.sign(['СЕКТОР 0', 'ПЛАН ЭВАКУАЦИИ', 'ВЫ ЗДЕСЬ  ●'], -21.5, 1.6, -9.88, 0, W, { w: 0.7, h: 0.9, bg: '#c8c4b4', fg: '#2a2a2a', tw: 256, th: 320 });
      this.inspect({ id: 'poster', mesh: this.westPoster, zone: W, text: () => (this.game.world.get('shift_west_poster') ? 'План эвакуации. Точка «Вы здесь» теперь стоит за дверью 0-7.' : 'План эвакуации. Точка «Вы здесь». Резервуар нарисован меньше, чем он есть.') });
      this.shiftables.west_poster = { room: 'west', apply: () => updateTextTexture(this.westPoster.userData.tex, ['СЕКТОР 0', 'ПЛАН ЭВАКУАЦИИ', 'ВЫ ЗДЕСЬ  ● 0-7']) };
      this.observerAnchors.push({ x: -31.2, y: 0, z: -8, zone: W });
      // ДВЕРЬ-ПЕТЛЯ (Правило 6): из жилого блока — в техблок, через весь резервуар
      const hiddenLoop = () => !this.game.world.get('loopDoor');
      this.door({ id: 'd_loop', axis: 'x', x: -25, z: -6, zone: W, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop_e', { open }), sign: textTexture('В-В', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      this.plug({ x0: -25.5, x1: -24.5, y0: 0, y1: 2.2, z0: -6.08, z1: -5.92 }, 'bunker', W, hiddenLoop);
      this.emitter('secret_loop', 'secret', -25, 1.2, -6.1, hiddenLoop, 0.7, 9);
      b.room({ x0: -25.6, x1: -24.4, z0: -6, z1: -3, h: 2.4, zone: 'vestW', floor: 'concreteDark', wall: 'concreteDark', walls: { n: false } });
      this.curtain('x', -4.5, -25.6, -24.4, 2.4, 'vestW');
      this.portal('loop', { x0: -25.6, x1: -24.4, z0: -4.48, z1: -3 }, [50, 0, -7]);

      // казарма
      const K = 'dorm';
      b.room({ x0: -31, x1: -21, z0: -18, z1: -10, h: 3, zone: K, floor: 'concreteDark', wall: 'bunker', ceil: 'metalDark', surface: 'concrete', walls: { s: false } });
      this.door({ id: 'd_dorm', axis: 'x', x: -26, z: -10, zone: K, sign: textTexture('КАЗ.', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      for (const x of [-29.8, -27.4, -23.6, -22.2]) {
        const xx = x === -22.2 ? -21.8 : x;
        this.bunk(xx, -16.9, 0, K);
        b.addCollider({ x0: xx - 0.45, x1: xx + 0.45, y0: 0, y1: 1.9, z0: -17.9, z1: -15.9 }, 'prop');
      }
      p.table(-26, -13.2, 1.4, 0.8, K);
      p.chair(-26.6, -12.5, Math.PI, K);
      p.chair(-25.2, -14, 0.3, K);
      this.pickup('part_stock', -23.6, 0.62, -16.6, K, { ry: 1.4 });
      this.paper('n_dorm', -26.3, 0.77, -13.3, K, { ry: 0.4 });
      // радиоприёмник шипит
      const radio = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.16), this.m.wood);
      radio.position.set(-25.55, 0.86, -13.05);
      b.groupOf(K).add(radio);
      this.emitter('dorm_radio', 'buzz', -25.55, 0.9, -13.05, () => true, 0.4, 7);
      this.inspect({ id: 'radio', mesh: radio, zone: K, text: 'Радиоприёмник. Шипит на пустой частоте. Иногда в шипении слышно дыхание — в такт моему.' });
      p.fixture(-26, 3, -14, K, { mode: 'always', lo: 2.2, hi: 2.2, range: 8, flicker: 0.4, warm: true });
      this.observerAnchors.push({ x: -30.3, y: 0, z: -10.8, zone: K });
    },

    // ── АРХИВ (за жилым блоком) ─────────────────────────────────────────────
    buildArchive() {
      const { b, p, m } = this;
      const A = 'archive';
      const X = -16; // архив перенесён на 16 м западнее прежней разметки
      const x = (v) => v + X;
      b.room({ x0: x(-28), x1: x(-16), z0: -16, z1: -2, h: 4.5, zone: A, floor: 'concreteDark', wall: 'paint', walls: { e: false } });
      this.door({ id: 'd_archive', axis: 'z', x: x(-16), z: -8, zone: A, sign: textTexture('АРХИВ', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
      p.shelf(x(-27.6), -15.5, -2.6, A, { h: 3.6 });
      p.shelf(x(-24.2), -14.6, -10.2, A, { h: 3, d: 0.9 });
      p.shelf(x(-24.2), -7, -2.8, A, { h: 3, d: 0.9 });
      p.shelf(x(-21.5), -14.6, -11.4, A, { h: 2.2, d: 0.6 });
      p.fixture(x(-21), 4.5, -5, A, { lo: 1.1, hi: 4.5 });
      p.fixture(x(-21), 4.5, -12, A, { lo: 1.1, hi: 4.5, flicker: 0.2 });
      // читальный стол
      p.table(x(-18.6), -4.4, 1.6, 0.9, A);
      const chair = p.chair(x(-18.6), -3.6, 0, A);
      this.shiftables.archive_chair = { room: 'archive', apply: () => { chair.position.set(x(-20.6), 0, -8.2); chair.rotation.y = -Math.PI / 2; } };
      const lampG = new THREE.Group();
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.4, side: THREE.DoubleSide }));
      shade.position.y = 0.38;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), m.metal);
      stem.position.y = 0.17;
      lampG.add(shade, stem);
      lampG.position.set(x(-19.2), 0.76, -4.7);
      b.groupOf(A).add(lampG);
      b.light({ x: x(-19.2), y: 1.05, z: -4.6, color: 0xffd8a0, mode: 'always', lo: 2.2, hi: 2.2, range: 4.5, zone: A, phase: 1 });
      this.pickup('fork', x(-18.2), 0.77, -4.3, A, { ry: 0.4 });
      this.paper('n_route', x(-18.9), 0.77, -4.5, A, { ry: -0.3 });
      p.table(x(-26.4), -8.6, 0.7, 0.7, A);
      this.paper('n_lanskaya1', x(-26.4), 0.77, -8.6, A, { ry: 0.5 });
      // проектор с кассетой (лор)
      p.table(x(-17.2), -13.5, 1.0, 0.7, A);
      const proj = new THREE.Group();
      const pbody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), m.plastic);
      pbody.position.y = 0.11;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), m.metal);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.12, -0.2);
      proj.add(pbody, lens);
      proj.position.set(x(-17.2), 0.76, -13.4);
      proj.rotation.y = Math.PI;
      b.groupOf(A).add(proj);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.9 }));
      screen.position.set(x(-17.2), 2.0, -2.15);
      screen.rotation.y = Math.PI;
      b.groupOf(A).add(screen);
      this.pickup('tape1', x(-17.0), 0.77, -13.65, A, { ry: 0.2 });
      // терминал архива
      p.table(x(-22), -2.5, 1.2, 0.7, A);
      const t2 = p.terminal(x(-22), -2.6, Math.PI, A);
      this.button({ id: 't2', mesh: t2, zone: A, prompt: 'Терминал', action: () => this.game.story.openTerminal('t2') });
      this.terminalArchive = t2;
      this.emitter('term2', 'buzz', x(-22), 1, -2.6, () => true, 0.5, 6);
      const cat = p.cabinet(x(-16.9), -10.6, -Math.PI / 2, A, { w: 1, h: 1.3, d: 0.6 });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const dr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), m.wood);
        dr.position.set(-0.36 + c * 0.24, 0.2 + r * 0.28, 0.31);
        cat.add(dr);
      }
      b.addCollider({ x0: x(-17.2), x1: x(-16.6), y0: 0, y1: 1.3, z0: -11.1, z1: -10.1 }, 'prop');
      this.inspect({ id: 'catalog', mesh: cat, zone: A, text: 'Каталожный шкаф. Ящики подписаны датами. Все даты — один и тот же день.' });
      // шкаф с делами — кодовый замок (Головоломка 1)
      const cx = x(-23);
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
      this.observerAnchors.push({ x: x(-26.5), y: 0, z: -12, zone: A });
    },

    // ── ТЕХБЛОК ─────────────────────────────────────────────────────────────
    buildEast() {
      const { b, p } = this;
      const E = 'east';
      const H = 3.6;
      b.room({ x0: 18, x1: 32, z0: -10, z1: -6, h: H, zone: E, floor: 'concreteDark', wall: 'concrete', ceil: 'concreteDark', surface: 'concrete', walls: { w: false, e: false, n: [{ a: 24.5, b: 25.5 }] } });
      this.door({ id: 'd_east', axis: 'z', x: 18, z: -8, zone: E, sign: textTexture('ТЕХ.', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      [21.5, 28.5].forEach((x) => p.fixture(x, H, -8, E, { lo: 1.3, hi: 4.5, flicker: x > 25 ? 0.35 : 0 }));
      for (let i = 0; i < 4; i++) p.pipe(18, H - 0.25 - i * 0.18, -9.7 + (i % 2) * 0.1, 32, -9.7 + (i % 2) * 0.1, 0.06 + (i % 2) * 0.03, E, i % 2 ? 'metalDark' : 'rust');
      p.pipe(18, H - 0.3, -6.3, 32, -6.3, 0.11, E, 'rust');
      // кабельные лотки
      b.box(18, 2.6, -6.45, 32, 2.64, -6.15, 'metalDark', { zone: E, collide: false });
      for (let x = 19; x < 32; x += 1.2) b.box(x, 2.64, -6.42, x + 0.6, 2.7, -6.18, 'rubber', { zone: E, collide: false });
      p.sign(['ПОДСТАНЦИЯ →'], 31.88, 2.5, -8, -Math.PI / 2, E, { w: 0.9, h: 0.2, tw: 384, th: 72 });
      // ДВЕРЬ-ПЕТЛЯ (вторая сторона)
      const hiddenLoop = () => !this.game.world.get('loopDoor');
      this.door({ id: 'd_loop_e', axis: 'x', x: 25, z: -10, zone: E, locked: true, hidden: hiddenLoop, onToggle: (open) => this.game.world.setDoor('d_loop', { open }), sign: textTexture('З-З', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      this.plug({ x0: 24.5, x1: 25.5, y0: 0, y1: 2.2, z0: -10.08, z1: -9.92 }, 'concrete', E, hiddenLoop);
      b.room({ x0: 24.4, x1: 25.6, z0: -13, z1: -10, h: 2.4, zone: 'vestE', floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
      this.curtain('x', -11.5, 24.4, 25.6, 2.4, 'vestE');
      this.portal('loop', { x0: 24.4, x1: 25.6, z0: -13, z1: -11.52 }, [-50, 0, 7]);
      this.observerAnchors.push({ x: 31.2, y: 0, z: -8, zone: E });
    },

    // ── ПОДСТАНЦИЯ (бывшая котельная) ───────────────────────────────────────
    buildGenerator() {
      const { b, p, m } = this;
      const G = 'generator';
      const H = 7;
      const X = 16;
      const x = (v) => v + X;
      b.room({ x0: x(16), x1: x(30), z0: -20, z1: -2, h: H, zone: G, floor: 'concreteDark', wall: 'brick', surface: 'metal', walls: { w: [{ a: -8.5, b: -7.5 }, { a: -18.6, b: -17.4, top: 1.15 }] } });
      this.door({ id: 'd_generator', axis: 'z', x: x(16), z: -8, zone: G, sign: textTexture('ПОДСТ.', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
      for (const [cx, cz] of [[x(26), -6], [x(26), -12]]) {
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
      this.emitter('gen_machine', 'machine', x(26), 1.5, -9, () => true, 1, 26);
      for (const cz of [-6, -12]) {
        const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
        fire.position.set(x(24.38), 0.6, cz);
        fire.rotation.y = -Math.PI / 2;
        b.groupOf(G).add(fire);
        b.light({ x: x(23.6), y: 0.8, z: cz, color: 0xff7030, mode: 'always', lo: 3.2, hi: 3.2, range: 9, zone: G, phase: cz, flicker: 0.25 });
      }
      b.box(x(28), 3.5, -20, x(30), 3.6, -2, 'grate', { zone: G, collide: false });
      for (let z = -19; z <= -3; z += 2) b.box(x(27.95), 3.6, z, x(28.0), 4.6, z + 0.05, 'metal', { zone: G, collide: false });
      b.box(x(27.95), 4.55, -20, x(28.0), 4.6, -2, 'metal', { zone: G, collide: false });
      for (let i = 0; i < 5; i++) p.pipe(x(16), H - 0.3 - i * 0.22, -19.6 + i * 0.3, x(30), -19.6 + i * 0.3, 0.08, G, i % 2 ? 'metal' : 'rust');
      for (const [fx, fz, fl] of [[x(20), -6, 0.4], [x(21), -15, 0]]) {
        const fa = p.fixture(fx, H, fz, G, { lo: 3.5, hi: 8, flicker: fl, range: 15 });
        const cone = makeCone(new THREE.Vector3(fx, H - 0.1, fz), new THREE.Vector3(0, -1, 0), 6.8, 0.6, 2.6, 0xe8e4d8, 0.07);
        b.groupOf(G).add(cone);
        this.cones.push({ mesh: cone, anchor: fa });
      }
      p.wallLamp(x(16.25), 2.6, -13, G, { color: 0xff2a1a, lo: 1.8, hi: 0.4, mode: 'mixedInv', range: 7 });

      // щит на три предохранителя (Головоломка 2)
      b.box(x(18.3), 0.9, -20, x(21.7), 2.1, -19.82, 'metalDark', { zone: G, collide: false });
      p.sign(['ЩИТ ПИТАНИЯ СЕКТОРА 0', 'Щ-1    Щ-2    Щ-3'], x(20), 2.3, -19.89, 0, G, { w: 1.4, h: 0.26, tw: 512, th: 96 });
      this.fuseVisuals = [];
      this.fuseLamps = [];
      [x(19), x(20), x(21)].forEach((fx, i) => {
        const sock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.08), m.dark);
        sock.position.set(fx, 1.45, -19.78);
        b.groupOf(G).add(sock);
        const fuse = itemModel('fuse', m);
        fuse.rotation.z = Math.PI / 2;
        fuse.position.set(fx, 1.45, -19.72);
        fuse.visible = false;
        b.groupOf(G).add(fuse);
        this.fuseVisuals.push(fuse);
        const lampMat = m.lampRed.clone();
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), lampMat);
        lamp.position.set(fx, 1.75, -19.78);
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
      leverBase.position.set(x(22.8), 1.4, -19.85);
      b.groupOf(G).add(leverBase);
      this.leverArm = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), m.metal);
      arm.position.y = 0.2;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m.doorRed);
      knob.position.y = 0.42;
      this.leverArm.add(arm, knob);
      this.leverArm.position.set(x(22.8), 1.4, -19.72);
      this.leverArm.rotation.x = 0.9;
      b.groupOf(G).add(this.leverArm);
      const leverPrompt = () => (this.game.world.get('power') ? 'Рубильник включён' : 'Включить рубильник');
      this.button({ id: 'lever', mesh: leverBase, zone: G, prompt: leverPrompt, action: () => this.game.puzzles.pullLever() });
      this.add(new Button(this.game, { id: 'lever_arm', mesh: this.leverArm, zone: G, prompt: leverPrompt, action: () => this.game.puzzles.pullLever() }));

      // рубильник линии 2 (кабель в резервуаре и прожекторы)
      const cb = new THREE.Group();
      const cbBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.5), m.metalDark);
      cb.add(cbBox);
      this.cableLever = new THREE.Group();
      const carm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), m.metal);
      carm.position.y = 0.21;
      const cknob = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), m.hazard);
      cknob.position.y = 0.43;
      this.cableLever.add(carm, cknob);
      this.cableLever.position.set(0.1, 0, 0);
      cb.add(this.cableLever);
      this.cableLamp = m.lampRed.clone();
      const cl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.cableLamp);
      cl.position.set(0.08, 0.3, 0.17);
      cb.add(cl);
      cb.position.set(x(16.18), 1.35, -15.5);
      b.groupOf(G).add(cb);
      p.sign(['ЛИНИЯ 2', 'РЕЗЕРВУАР · ПРОЖЕКТОРЫ'], x(16.12), 2.05, -15.5, Math.PI / 2, G, { w: 0.62, h: 0.22, tw: 384, th: 136, bg: '#c8a420', fg: '#141008' });
      this.button({
        id: 'cable_breaker',
        mesh: cb,
        zone: G,
        prompt: () => (this.game.world.get('cableOff') ? 'Включить линию 2' : 'Обесточить линию 2 (резервуар)'),
        action: () => {
          const g = this.game;
          const off = !g.world.get('cableOff');
          g.world.set('cableOff', off);
          g.audio.play(off ? 'power_down' : 'lever', cb.position);
          if (off) {
            g.mem.observe('cable_off', 'Я обесточил линию 2. В резервуаре погасли прожекторы и включился красный аварийный свет. Кабель в воде больше не трещит.');
            g.ui.hint('Линия 2 обесточена. Вода в резервуаре больше не под током — но там теперь темно.', 5);
          } else g.ui.hint('Линия 2 снова под напряжением.', 3);
        },
      });

      p.shelf(x(16.5), -6.5, -3.0, G, { h: 2.1, books: false });
      this.pickup('fuse_a', x(16.5), 1.16, -4.4, G, { ry: 1.2 });
      p.table(x(19.5), -2.6, 1.4, 0.6, G);
      p.chair(x(19.5), -3.3, Math.PI, G);
      this.paper('n_generator', x(19.2), 0.77, -2.65, G, { ry: 0.2 });
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.6, side: THREE.DoubleSide }));
      bucket.position.set(x(23.5), 0.15, -16);
      b.groupOf(G).add(bucket);
      this.shiftables.gen_bucket = { room: 'generator', apply: () => bucket.position.set(x(20), 0.15, -19.3) };

      // люк в канализацию + лестница вниз
      const hatch = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), m.rust);
      ring.position.y = 0.03;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), m.black);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.065;
      hatch.add(ring, hole);
      hatch.position.set(x(27), 0, -18.4);
      b.groupOf(G).add(hatch);
      p.sign(['КОЛЛЕКТОР ↓'], x(27), 1.6, -19.88, 0, G, { w: 0.7, h: 0.18, tw: 384, th: 64 });
      this.button({ id: 'hatch_down', mesh: hatch, zone: G, range: 2.6, prompt: 'Спуститься в канализацию', action: () => this.game.survival.climb({ x: 27, y: SEW, z: -21.0, yaw: Math.PI }, 'down') });
      this.observerAnchors.push({ x: x(29), y: 0, z: -3, zone: G });
    },

    // ── МАСТЕРСКАЯ (за затопленным углом; здесь собирается ружьё) ───────────
    buildWorkshop() {
      const { b, p, m } = this;
      const WS = 'workshop';
      b.room({ x0: -30, x1: -18, z0: -32, z1: -20, h: 3.6, zone: WS, floor: 'concreteDark', wall: 'brick', ceil: 'concreteDark', surface: 'concrete', walls: { e: false, n: [{ a: -20.6, b: -19.4, top: 1.15 }] } });
      this.door({ id: 'd_workshop', axis: 'z', x: -18, z: -28, y: SUNK, h: 2.42, zone: WS, sign: textTexture('МАСТ.', { w: 128, h: 64, font: 'bold 34px Consolas' }) });
      // ступенька от воды к сухому полу
      b.box(-18.35, SUNK, -28.5, -18.1, 0, -27.5, 'concreteDark', { zone: WS, collide: false });
      // верстак вдоль южной стены
      const top = b.box(-27.2, 0.88, -21, -21.8, 0.95, -20.15, 'wood', { zone: WS, merge: false, collide: false });
      b.addCollider({ x0: -27.2, x1: -21.8, y0: 0, y1: 0.95, z0: -21, z1: -20.15 }, 'prop');
      for (const lx of [-27.1, -21.9]) b.box(lx - 0.04, 0, -20.95, lx + 0.04, 0.88, -20.2, 'metalDark', { zone: WS, collide: false });
      b.box(-27.2, 0.25, -20.95, -21.8, 0.3, -20.2, 'metalDark', { zone: WS, collide: false });
      // тиски
      b.box(-26.6, 0.95, -20.75, -26.2, 1.1, -20.4, 'metalDark', { zone: WS, collide: false });
      b.box(-26.65, 1.1, -20.75, -26.15, 1.22, -20.68, 'metal', { zone: WS, collide: false });
      // перфорированная доска с инструментами
      b.box(-27, 1.2, -20.14, -22, 2.4, -20.1, 'wood', { zone: WS, collide: false });
      for (let i = 0; i < 7; i++) {
        const tool = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3 + (i % 3) * 0.1, 0.02), i % 2 ? m.metal : m.doorRed);
        tool.position.set(-26.6 + i * 0.65, 1.8, -20.16);
        tool.rotation.z = (i % 3 - 1) * 0.2;
        b.groupOf(WS).add(tool);
      }
      this.benchSpot = { x: -24.5, y: 0.95, z: -20.6 };
      this.button({ id: 'workbench', mesh: top, zone: WS, range: 2.4, prompt: () => this.game.weapon.benchPrompt(), action: () => this.game.weapon.assemble() });
      p.sign(['СБОРКА', 'ствол · приклад · затвор'], -24.5, 2.6, -20.12, Math.PI, WS, { w: 1.2, h: 0.36, tw: 512, th: 156 });
      this.paper('n_workshop', -22.6, 0.951, -20.55, WS, { ry: 0.2 });
      // станки
      const lathe = new THREE.Group();
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.5), m.metalDark);
      bed.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 0.6, metalness: 0.3 }));
      head.position.set(-0.75, 1.3, 0);
      const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), m.metal);
      chuck.rotation.z = Math.PI / 2;
      chuck.position.set(-0.44, 1.3, 0);
      lathe.add(bed, head, chuck);
      for (const sx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.4), m.metalDark);
        leg.position.set(sx, 0.4, 0);
        lathe.add(leg);
      }
      lathe.position.set(-25, 0, -30.6);
      b.groupOf(WS).add(lathe);
      b.addCollider({ x0: -26.1, x1: -23.9, y0: 0, y1: 1.6, z0: -30.9, z1: -30.3 }, 'prop');
      const drill = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), m.metal);
      col.position.y = 0.85;
      const dh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.45), new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 0.6, metalness: 0.3 }));
      dh.position.set(0, 1.55, 0.12);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.5), m.metalDark);
      base.position.y = 0.03;
      drill.add(col, dh, base);
      drill.position.set(-21.4, 0, -30.8);
      b.groupOf(WS).add(drill);
      b.addCollider({ x0: -21.7, x1: -21.1, y0: 0, y1: 1.8, z0: -31.1, z1: -30.4 }, 'prop');
      p.shelf(-29.6, -31.6, -26.8, WS, { h: 2.2, books: false });
      p.fixture(-24, 3.6, -26, WS, { mode: 'always', lo: 5.5, hi: 5.5, warm: true, range: 9, flicker: 0.08 });
      p.fixture(-24, 3.6, -22, WS, { mode: 'always', lo: 4.5, hi: 4.5, warm: true, range: 8 });
      p.sign(['ВЕНТ-2'], -20, 1.4, -31.86, 0, WS, { w: 0.3, h: 0.1, tw: 128, th: 48 });
      this.observerAnchors.push({ x: -29.3, y: 0, z: -21, zone: WS });
    },

    // ── ЦЕНТРАЛЬНЫЙ ПОСТ (10 м в высоту, балконы на 4.5 м, гермоворота) ─────
    buildHall() {
      const { b, p, m } = this;
      const H = 'hall';
      const HH = 10;
      b.box(-12, -0.2, zz(-48), 12, 0, zz(-24), 'tiles', { zone: H, collide: false });
      b.box(-12, HH, zz(-48), 12, HH + 0.2, zz(-24), 'concreteDark', { zone: H, collide: false, cast: false });
      b.floor(-12, zz(-48), 12, zz(-24), 0, 'tile');
      b.wallX(zz(-24), -12, 12, 0, HH, 'concrete', H, [{ a: -1.5, b: 1.5, top: 2.6 }]);
      b.wallX(zz(-48), -12, 12, 0, HH, 'concrete', H, [{ a: -1, b: 1, top: 2.4 }]);
      b.wallZ(-12, zz(-48), zz(-24), 0, HH, 'concrete', H, [{ a: zz(-39.5), b: zz(-38.5), bottom: BAL, top: BAL + 2.2 }]);
      b.wallZ(12, zz(-48), zz(-24), 0, HH, 'concrete', H, [{ a: -43.5, b: -42.5 }, { a: -55, b: -51, top: 4.2 }]);
      const slab = (x0, z0, x1, z1) => {
        b.box(x0, BAL - 0.3, z0, x1, BAL, z1, 'concreteDark', { zone: H, collide: false });
        b.floor(x0, z0, x1, z1, BAL, 'concrete');
        b.addCollider({ x0, x1, y0: BAL - 0.3, y1: BAL - 0.02, z0, z1 }, 'slab');
      };
      slab(-12, zz(-48), 12, zz(-45));
      slab(-12, zz(-45), -9, zz(-30));
      slab(9, zz(-45), 12, zz(-30));
      const rail = (x0, z0, x1, z1) => {
        b.box(x0, BAL, z0, x1, BAL + 1.05, z1, 'metal', { zone: H, collide: false });
        b.addCollider({ x0, x1, y0: BAL, y1: BAL + 1.1, z0, z1 }, 'rail');
      };
      rail(-9, zz(-45.05), 9, zz(-44.95));
      rail(-9.05, zz(-45), -8.95, zz(-30));
      rail(9, zz(-30.05), 12, zz(-29.95));
      rail(8.95, zz(-45), 9.05, zz(-30));
      for (const z of [-30, -37.5, -45]) {
        b.box(-9.3, 0, zz(z) - 0.3, -8.7, BAL, zz(z) + 0.3, 'concrete', { zone: H });
        b.box(8.7, 0, zz(z) - 0.3, 9.3, BAL, zz(z) + 0.3, 'concrete', { zone: H });
      }
      for (const x of [-4.5, 4.5]) b.box(x - 0.3, 0, zz(-45.3), x + 0.3, BAL, zz(-44.7), 'concrete', { zone: H });
      // лестница на западный балкон (подъём на север)
      b.ramp(-12, zz(-30), -9, zz(-24.6), 'z', BAL, 0, 'concrete');
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const z1 = zz(-24.6) - (i * 5.4) / steps;
        const z0 = z1 - 5.4 / steps;
        const topY = ((i + 1) * BAL) / steps;
        b.box(-12, 0, z0, -9, topY, z1, 'concrete', { zone: H, collide: false });
      }
      for (let i = 0; i < 6; i++) {
        const z1 = zz(-24.6) - i * 0.9;
        const topY = (i * 0.9 * BAL) / 5.4 - 0.45;
        if (topY > 0.3) b.addCollider({ x0: -12, x1: -9, y0: 0, y1: topY, z0: z1 - 0.9, z1 }, 'stairs');
      }
      b.box(-9.05, 0, zz(-30), -8.95, 1, zz(-24.6), 'metal', { zone: H, collide: false });
      [[-5, -31], [5, -31], [-5, -40], [5, -40]].forEach(([x, z], i) => {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.2, 4), m.rubber);
        cable.position.set(x, HH - 1.6, zz(z));
        b.groupOf(H).add(cable);
        const fa = p.fixture(x, HH - 3.2, zz(z), H, { lo: 4.5, hi: 10, range: 18, w: 1.0, d: 1.0, flicker: i === 2 ? 0.4 : 0.05 });
        const cone = makeCone(new THREE.Vector3(x, HH - 3.3, zz(z)), new THREE.Vector3(0, -1, 0), 6.6, 0.55, 2.8, 0xdde6ee, 0.06);
        b.groupOf(H).add(cone);
        this.cones.push({ mesh: cone, anchor: fa });
      });
      [[-10.5, -38], [10.5, -38], [0, -46.5]].forEach(([x, z]) => p.wallLamp(x, BAL + 2.2, zz(z), H, { lo: 2.6, hi: 3.5, mode: 'mixed', range: 10, flicker: 0.1 }));
      [[-11.7, -25.5, 0xff3a20], [11.7, -26.5, 0xffa040], [-8.5, -46.5, 0xffa040], [8.5, -46.5, 0xff3a20], [11.7, -35, 0xff3a20]].forEach(([x, z, c]) =>
        p.wallLamp(x, 2.4, zz(z), H, { color: c, lo: 3.2, hi: 1.2, mode: 'mixedInv', range: 11, flicker: 0.15 })
      );
      // стойка дежурного
      const desk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.1, 32, 1, true, 0, Math.PI * 1.4), m.wood);
      desk.position.set(0, 0.55, zz(-36));
      b.groupOf(H).add(desk);
      b.addCollider({ x0: -2.2, x1: 2.2, y0: 0, y1: 1.1, z0: zz(-38.2), z1: zz(-35.4) }, 'prop');
      const chand = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1.2 - i * 0.3, 0.04, 6, 32), m.metal);
        r.rotation.set(Math.PI / 2 + 0.3, 0, i * 0.4);
        r.position.y = 0.3 + i * 0.12;
        chand.add(r);
      }
      chand.position.set(-4, 0, zz(-31));
      b.groupOf(H).add(chand);
      p.sign(['ИНСТИТУТ ПРИКЛАДНОЙ МНЕМОНИКИ', 'СЕКТОР 0 · ЦЕНТРАЛЬНЫЙ ПОСТ'], 0, BAL + 3.2, zz(-47.88), 0, H, { w: 6, h: 0.9, tw: 1024, th: 160, bg: '#1c1f1e', fg: '#9aa59c' });
      this.door({ id: 'd_obs', axis: 'z', x: -12, z: zz(-39), y: BAL, zone: H, locked: true, requires: 'keycard', lockText: 'Считыватель пропусков мигает красным. Нужен пропуск.', sign: textTexture('НАБЛ.', { w: 128, h: 64, font: 'bold 30px Consolas' }) });
      this.door({ id: 'd_stairs', axis: 'z', x: 12, z: -43, zone: H, sign: textTexture('ЛЕСТН.', { w: 128, h: 64, font: 'bold 28px Consolas' }) });
      p.sign(['НАБЛЮДАТЕЛЬНЫЙ ПОСТ'], -11.88, BAL + 2.5, zz(-39), Math.PI / 2, H, { w: 1.2, h: 0.18, tw: 512, th: 64 });
      p.sign(['ЛЕСТНИЦА ↓'], 11.88, 2.5, -43, -Math.PI / 2, H, { w: 0.9, h: 0.18, tw: 384, th: 64 });
      const dir = p.sign(['СЕКТОР 0', 'ЭТАЖИ:  0  ·  −1'], -2.6, 1.7, zz(-47.88), 0, H, { w: 0.9, h: 0.4, tw: 384, th: 160 });
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
      bench.position.set(5, 0, zz(-26));
      b.groupOf(H).add(bench);
      this.shiftables.hall_bench = { room: 'hall', apply: () => { bench.position.set(3, 0, zz(-33)); bench.rotation.y = Math.PI / 2; } };

      // ГЕРМОВОРОТА: тяжёлая плита в восточной стене, поднимается вверх
      this.blastGate = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 4.0), m.metalDark);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.5, 4.0), m.hazard);
      stripe.position.y = -1.85;
      this.blastGate.add(plate, stripe);
      for (let i = -1; i <= 1; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 0.12), m.metal);
        rib.position.z = i * 1.3;
        this.blastGate.add(rib);
      }
      this.blastGate.position.set(12.15, 2.1, -53);
      this.blastGate.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      b.groupOf(H).add(this.blastGate);
      this.blastGateCol = b.addCollider({ x0: 11.9, x1: 12.4, y0: 0, y1: 4.2, z0: -55, z1: -51 });
      this.blastT = 0;
      b.box(11.8, 0, -55.3, 11.95, 4.4, -55, 'hazard', { zone: H, collide: false });
      b.box(11.8, 0, -51, 11.95, 4.4, -50.7, 'hazard', { zone: H, collide: false });
      // мигалки
      this.beacons = [];
      for (const bz of [-55.6, -50.4]) {
        const bg = new THREE.Group();
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), m.lampRed);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.2), m.metal);
        blade.position.x = 0.05;
        bg.add(glow, blade);
        bg.position.set(11.75, 3.9, bz);
        bg.visible = false;
        b.groupOf(H).add(bg);
        this.beacons.push(bg);
        b.light({ x: 11, y: 3.6, z: bz, color: 0xff2010, mode: 'switch', switchVar: 'gateAlarm', lo: 0, hi: 4, range: 12, zone: H, flicker: 0.6, phase: bz });
      }
      // панель ворот
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.5), m.metalDark);
      panel.position.set(11.9, 1.4, -49.4);
      b.groupOf(H).add(panel);
      this.gateScreen = p.screen(['ГЕРМОВОРОТА', '! КАРАНТИН !'], 11.83, 1.48, -49.4, -Math.PI / 2, H, { w: 0.42, h: 0.3, tw: 256, th: 184, font: 'bold 26px Consolas, monospace' });
      p.sign(['ГЕРМОВОРОТА № 1', 'ВЫХОД НА ПОВЕРХНОСТЬ'], 11.88, 2.35, -49.4, -Math.PI / 2, H, { w: 1.0, h: 0.3, tw: 512, th: 150, bg: '#c8a420', fg: '#141008' });
      this.button({ id: 'gate_panel', mesh: panel, zone: H, prompt: () => (this.game.world.get('blastOpen') ? null : 'Панель гермоворот'), action: () => this.gatePanel() });
      this.add(new Button(this.game, { id: 'gate_screen', mesh: this.gateScreen, zone: H, prompt: () => (this.game.world.get('blastOpen') ? null : 'Панель гермоворот'), action: () => this.gatePanel() }));
      this.observerAnchors.push({ x: -7.5, y: 0, z: zz(-44), zone: H }, { x: 7, y: 0, z: zz(-26), zone: H }, { x: 0, y: BAL, z: zz(-46.5), zone: H });
    },

    gatePanel() {
      const g = this.game;
      const w = g.world;
      if (w.get('blastOpen')) return;
      if (!w.get('power')) {
        g.audio.play('door_locked', new THREE.Vector3(11.9, 1.4, -49.4));
        g.ui.hint('Панель мертва. Нет питания — в подстанции не хватает предохранителей.', 5);
        return;
      }
      if (!w.get('monsterDead')) {
        g.audio.play('alarm', new THREE.Vector3(11.9, 3, -53));
        w.set('gateAlarm', true);
        setTimeout(() => !w.get('blastOpen') && w.set('gateAlarm', false), 4000);
        g.ui.hint('«КАРАНТИН. ВНУТРИ ОБНАРУЖЕН БИОЛОГИЧЕСКИЙ ОБЪЕКТ. ВЫХОД ЗАБЛОКИРОВАН». Пока Оно живо, ворота не откроются. И сирена его позвала.', 7);
        g.mem.observe('quarantine', 'Гермоворота на поверхность заблокированы карантином: «внутри биологический объект». Это про Оно. Чтобы выйти — его нужно убить.');
        g.bus.emit('noise', { x: 10, y: 0, z: -52, r: 60 });
        return;
      }
      w.set('blastOpen', true);
      w.set('gateAlarm', true);
      g.audio.play('siren', new THREE.Vector3(11, 3.5, -53));
      g.audio.play('rumble', new THREE.Vector3(12, 2, -53));
      g.fx.distort(0.4);
      g.mem.observe('blast_open', 'Карантин снят. Гермоворота ползут вверх. За ними — пандус и холодный воздух сверху.');
    },

    // ── НАБЛЮДАТЕЛЬНАЯ И КОМНАТА ЗА СТЕКЛОМ (на балконе центрального поста) ─
    buildObservation() {
      const { b, p, m } = this;
      const O = 'observation';
      const Y = BAL;
      p.yb = Y;
      b.room({ x0: -22, x1: -12, z0: zz(-44), z1: zz(-34), y: Y, zone: O, floor: 'carpet', wall: 'paint', surface: 'carpet', walls: { e: false, s: [{ a: -20.6, b: -19.4, top: 1.15 }], w: [{ a: zz(-42), b: zz(-36), bottom: 0.9, top: 2.4 }, { a: zz(-43.5), b: zz(-42.5) }] } });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), m.glass);
      glass.position.set(-22, Y + 1.65, zz(-39));
      glass.rotation.y = Math.PI / 2;
      b.groupOf(O).add(glass);
      b.addCollider({ x0: -22.05, x1: -21.95, y0: Y + 0.9, y1: Y + 2.4, z0: zz(-42), z1: zz(-36) }, 'glass');
      this.inspect({ id: 'window', mesh: glass, zone: O, range: 3, text: () => (this.game.world.get('falseWallOpen') ? 'Стекло. С этой стороны оно кажется тоньше.' : 'Смотровое окно. За ним — светлая комната со стулом. Входа в неё нет ни из одного коридора.') });
      p.table(-20.6, zz(-39), 0.8, 5.6, O);
      p.chair(-19.6, zz(-39), Math.PI / 2, O);
      this.obsChair = p.chair(-19.4, zz(-36.6), Math.PI / 2, O);
      this.shiftables.obs_chair = { room: 'observation', apply: () => { this.obsChair.position.set(-16, Y, zz(-39)); this.obsChair.rotation.y = 0; } };
      const camTexts = [['КАМ 1', 'МОСТКИ РЕЗЕРВУАРА'], ['КАМ 2', 'АРХИВ'], ['КАМ 3', '— НЕТ СИГНАЛА —'], ['КАМ 4', 'ИЗОЛЯТОР']];
      [-41.1, -39.8, -38.5, -37.2].forEach((z, i) => {
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.42), m.plastic);
        mon.position.set(-20.85, Y + 0.96, zz(z));
        b.groupOf(O).add(mon);
        const scr = p.screen(camTexts[i], -20.69, Y + 0.98, zz(z), Math.PI / 2, O, { w: 0.36, h: 0.27 });
        this.screens.push({ mesh: scr, base: camTexts[i], i });
      });
      const phone = new THREE.Group();
      const pb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.22), m.dark);
      pb.position.y = 0.04;
      const hs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.24), m.dark);
      hs.position.set(0, 0.1, 0);
      phone.add(pb, hs);
      phone.position.set(-20.5, Y + 0.76, zz(-36.6));
      b.groupOf(O).add(phone);
      this.button({ id: 'phone', mesh: phone, zone: O, prompt: () => (this.game.world.get('phoneRinging') ? 'Снять трубку' : 'Телефон'), action: () => this.game.puzzles.phone() });
      p.table(-15, zz(-43.4), 1.2, 0.7, O);
      const t3 = p.terminal(-15, zz(-43.3), 0, O);
      this.terminalObs = t3;
      this.button({ id: 't3', mesh: t3, zone: O, prompt: () => (this.game.world.get('power') ? 'Терминал' : 'Терминал (нет питания)'), action: () => (this.game.world.get('power') ? this.game.story.openTerminal('t3') : this.game.ui.hint('Экран тёмный. Нет питания.')) });
      p.fixture(-17, Y + 3, zz(-39), O, { mode: 'main', hi: 3.5, lo: 0 });
      p.fixture(-14, Y + 3, zz(-36), O, { mode: 'main', hi: 3, lo: 0 });
      // ложная стена (Правило 2)
      this.plug({ x0: -22.08, x1: -21.92, y0: Y, y1: Y + 2.2, z0: zz(-43.5), z1: zz(-42.5) }, 'paint', O, () => !this.game.world.get('falseWallOpen'));
      this.rubble = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.2, 0.06 + Math.random() * 0.1, 0.1 + Math.random() * 0.2), m.paint);
        r.position.set(-21.6 + Math.random() * 0.9, Y + 0.04, zz(-43.4) + Math.random() * 0.8);
        r.rotation.y = Math.random() * 3;
        this.rubble.add(r);
      }
      b.groupOf(O).add(this.rubble);
      this.emitter('secret_wall', 'secret', -22, Y + 1.2, zz(-43), () => !this.game.world.get('falseWallOpen'), 1, 10);

      const GL = 'glass';
      b.room({ x0: -32, x1: -22, z0: zz(-44), z1: zz(-34), y: Y, zone: GL, floor: 'concrete', wall: 'concrete', walls: { e: false } });
      p.fixture(-27, Y + 3, zz(-39), GL, { mode: 'always', lo: 7, hi: 7, range: 12, color: 0xdfeef5, bias: 300 });
      p.fixture(-27, Y + 3, zz(-35.5), GL, { mode: 'always', lo: 2, hi: 2, range: 7, color: 0xdfeef5, flicker: 0.2 });
      p.chair(-25.2, zz(-39), -Math.PI / 2, GL);
      p.table(-29.5, zz(-41.5), 1.2, 0.7, GL);
      this.pickup('frag2', -29.7, Y + 0.77, zz(-41.5), GL, { ry: 0.4 });
      this.paper('n_glass', -29.2, Y + 0.77, zz(-41.6), GL, { ry: -0.3 });
      this.pickup('tape4', -29.9, Y + 0.77, zz(-41.2), GL, { ry: 1 });
      for (let i = 0; i < 30; i++) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), m.paper);
        sheet.position.set(-31.89, Y + 0.8 + (i % 4) * 0.42 + Math.random() * 0.06, zz(-43) + Math.floor(i / 4) * 1.2 + Math.random() * 0.3);
        sheet.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 0.2);
        b.groupOf(GL).add(sheet);
      }
      this.observerAnchors.push({ x: -27.5, y: Y, z: zz(-37), zone: GL, glass: true });
      p.yb = 0;
    },

    // ── БЕСКОНЕЧНАЯ ЛЕСТНИЦА (из центрального поста на восток) ──────────────
    buildStairs() {
      const { b, p } = this;
      const S = 'stairs';
      const zN = -45;
      const zS = -41;
      const landings = [[12, 15, 0], [21, 24, -3], [30, 33, -6], [39, 42, -9]];
      // пролёты: [xЗапад(верх), xВосток(низ), yВерх, yНиз]
      const flights = [[15, 21, 0, -3], [24, 30, -3, -6], [33, 39, -6, -9], [42, 48, -9, -12]];
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
          const topY = ya - i * rise;
          b.box(x0 + i * run, topY - rise - 0.3, zN, x0 + (i + 1) * run, topY - rise * 0.5, zS, 'concrete', { zone: S, collide: false });
        }
        b.box(x0, ya + 3, zN, x1, ya + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false });
        const len = Math.hypot(x1 - x0, ya - yb);
        const railMesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), this.m.metal);
        railMesh.position.set((x0 + x1) / 2, (ya + yb) / 2 + 0.95, zS - 0.25);
        railMesh.rotation.z = -Math.atan2(ya - yb, x1 - x0);
        b.groupOf(S).add(railMesh);
      }
      [[21, 0], [30, -3], [39, -6]].forEach(([x, y]) => b.box(x - 0.1, y, zN, x + 0.1, y + 3.2, zS, 'concreteDark', { zone: S, collide: false, cast: false }));
      b.box(12, -13, zS, 48, 3.2, zS + 0.2, 'concrete', { zone: S });
      const wn = (x0, x1, y0, y1) => b.box(x0, y0, zN - 0.2, x1, y1, zN, 'concrete', { zone: S });
      wn(12, 22, -13, 3.2);
      wn(22, 23, -0.9, 3.2);
      wn(22, 23, -13, -3);
      wn(23, 31, -13, 3.2);
      wn(31, 32, -3.9, 3.2);
      wn(31, 32, -13, -6);
      wn(32, 48, -13, 3.2);
      b.box(48, -13, zN, 48.2, 3.2, zS, 'concrete', { zone: S });
      p.sign(['0'], 13.4, 1.8, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 90px Consolas' });
      this.landingSigns = [
        p.sign(['−1'], 21.4, -1.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
        p.sign(['−2'], 30.4, -4.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
        p.sign(['−3'], 39.4, -7.2, zN + 0.01, 0, S, { w: 0.3, h: 0.3, tw: 128, th: 128, font: 'bold 76px Consolas' }),
      ];
      this.inspect({ id: 'landing_sign', mesh: this.landingSigns[0], zone: S, text: () => `Табличка: −${this.game.world.get('landing', 0) + 1}. Я спускался всего на один пролёт?` });
      [[13.5, 2.2], [22.5, -0.8], [31.5, -3.8], [40.5, -6.8]].forEach(([x, y]) => p.wallLamp(x, y, zS - 0.15, S, { lo: 2.6, hi: 2.6, flicker: 0.12, range: 8 }));
      this.door({ id: 'd_landing', axis: 'x', x: 22.5, z: zN - 0.1, y: -3, zone: S, locked: true, lockText: () => `Заперто. Табличка рядом: −${this.game.world.get('landing', 0) + 1}. За дверью — бетон?` });
      this.fakeDoor('x', 31.5, zN - 0.1, S, -6);
      this.fakeDoor('x', 40.5, zN + 0.04, S, -9);
      const SV = 'stairsVest';
      b.room({ x0: 21.9, x1: 23.1, z0: -47.6, z1: zN, y: -3, h: 2.4, zone: SV, floor: 'concreteDark', wall: 'concreteDark', walls: { s: false } });
      this.curtain('x', -46.3, 21.9, 23.1, -0.6, SV, { y0: -3 });
      this.portal('lab_in', { x0: 21.9, x1: 23.1, z0: -47.6, z1: -46.32, y0: -4, y1: -1.5 }, [74.5, 3, 53.6]);
      this.observerAnchors.push({ x: 31.5, y: -6, z: -43, zone: S }, { x: 13.6, y: 0, z: -43, zone: S });
    },

    // ── ВЕНТИЛЯЦИЯ ──────────────────────────────────────────────────────────
    buildVents() {
      const { b, m } = this;
      const IN = 1.15;
      // шахта 1: восточные мостки резервуара (x=18) → подстанция (x=32) на уровне пола
      const V1 = 'vent1';
      b.box(18, -0.1, -18.6, 32, 0, -17.4, 'grate', { zone: V1, collide: false });
      b.floor(18, -18.6, 32, -17.4, 0, 'metal');
      b.box(18, IN, -18.7, 32, IN + 0.1, -17.3, 'metalDark', { zone: V1, collide: false, cast: false });
      b.box(18, 0, -18.7, 32, IN, -18.6, 'metalDark', { zone: V1 });
      b.box(18, 0, -17.4, 32, IN, -17.3, 'metalDark', { zone: V1 });
      for (let x = 19; x < 32; x += 1.5) b.box(x, 0, -18.62, x + 0.06, IN, -17.38, 'metal', { zone: V1, collide: false });
      b.light({ x: 25, y: 0.9, z: -18, color: 0xff7040, mode: 'always', lo: 1.4, hi: 1.4, range: 5, zone: V1, phase: 3, flicker: 0.6 });
      this.grate('g_v1a', 18, -18, 'z', V1, 'corridor');
      this.grate('g_v1b', 32, -18, 'z', V1, 'generator');
      this.ventMouths.push({ x: 18, y: 0, z: -18 }, { x: 32, y: 0, z: -18 });
      // шахта 2: мастерская (z=-32) → наблюдательная (z=-47, y=4.5), подъём в два участка
      const V2 = 'vent2';
      const x0 = -20.6;
      const x1 = -19.4;
      b.ramp(x0, -43, x1, -32, 'z', 3.5, 0, 'metal');
      b.ramp(x0, -47, x1, -43, 'z', BAL, 3.5, 'metal');
      const hAt = (z) => (z > -43 ? ((-32 - z) / 11) * 3.5 : 3.5 + ((-43 - z) / 4) * (BAL - 3.5));
      for (let z = -32; z > -47; z -= 0.5) {
        const y = hAt(z - 0.25);
        b.box(x0, y - 0.12, z - 0.5, x1, y, z, 'grate', { zone: V2, collide: false });
        b.box(x0 - 0.1, y - 0.12, z - 0.5, x0, y + IN, z, 'metalDark', { zone: V2 });
        b.box(x1, y - 0.12, z - 0.5, x1 + 0.1, y + IN, z, 'metalDark', { zone: V2 });
        b.box(x0, y + IN, z - 0.5, x1, y + IN + 0.08, z, 'metalDark', { zone: V2, collide: false, cast: false });
      }
      b.light({ x: -20, y: 2.4, z: -38, color: 0x9ab8ff, mode: 'always', lo: 1.3, hi: 1.3, range: 5, zone: V2, phase: 4, flicker: 0.4 });
      this.fan = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.02), m.metal);
        blade.position.y = 0.21;
        const piv = new THREE.Group();
        piv.rotation.z = (i * Math.PI) / 2;
        piv.add(blade);
        this.fan.add(piv);
      }
      this.fan.position.set(-20.55, hAt(-38) + 0.55, -38);
      this.fan.rotation.y = Math.PI / 2;
      b.groupOf(V2).add(this.fan);
      this.grate('g_v2a', -20, -32, 'x', V2, 'workshop');
      this.grate('g_v2b', -20, -47, 'x', V2, 'observation', BAL);
      this.ventMouths.push({ x: -20, y: 0, z: -32 }, { x: -20, y: BAL, z: -47 });
    },

    // Вентиляционная решётка: снимается, после этого в шахту можно пролезть.
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
      this.grates[id] = { id, g, col };
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
    },

    syncGrates() {
      for (const [id, gr] of Object.entries(this.grates)) {
        const open = !!this.game.world.get(id);
        gr.g.visible = !open;
        gr.col.enabled = !open;
      }
    },

    // ── ГРУЗОВОЙ ШЛЮЗ И ПОВЕРХНОСТЬ (концовка «Охотник») ─────────────────────
    buildGateway() {
      const { b, p, m } = this;
      const G = 'gateway';
      const len = 30 - 12.4;
      b.ramp(12.4, -56, 30, -50, 'x', 0, 3, 'concrete');
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(len, 3), 0.3, 6), m.concreteDark);
      rampMesh.position.set((12.4 + 30) / 2, 1.5 - 0.15, -53);
      rampMesh.rotation.z = Math.atan2(3, len);
      rampMesh.receiveShadow = true;
      b.groupOf(G).add(rampMesh);
      b.box(12.3, -0.2, -56, 12.6, 0, -50, 'hazard', { zone: G, collide: false });
      b.box(12.2, 0, -56.3, 30, 8, -56, 'concrete', { zone: G });
      b.box(12.2, 0, -50, 30, 8, -49.7, 'concrete', { zone: G });
      b.box(12.2, 8, -56.3, 30, 8.3, -49.7, 'concreteDark', { zone: G, collide: false, cast: false });
      for (let x = 15; x < 30; x += 4) p.wallLamp(x, 4.5, -50.15, G, { color: 0xffb070, lo: 1.8, hi: 1.8, range: 8, flicker: 0.2 });
      p.sign(['ПОВЕРХНОСТЬ ↑', 'КПП-1'], 29.8, 6.4, -53, -Math.PI / 2, G, { w: 1.6, h: 0.5, tw: 512, th: 160 });

      // поверхность: снег, ночь, ограда, фонарь
      const S = 'surface';
      b.box(30, 2.6, -80, 64, 3, -48, 'snow', { zone: S, collide: false });
      b.floor(30, -80, 64, -48, 3, 'mud');
      b.addCollider({ x0: 30, x1: 64, y0: 3, y1: 6, z0: -48.2, z1: -48 }, 'curb');
      b.addCollider({ x0: 30, x1: 64, y0: 3, y1: 6, z0: -80, z1: -79.8 }, 'curb');
      b.addCollider({ x0: 63.8, x1: 64, y0: 3, y1: 6, z0: -80, z1: -48 }, 'curb');
      b.addCollider({ x0: 30, x1: 30.2, y0: 3, y1: 6, z0: -80, z1: -56 }, 'curb');
      b.addCollider({ x0: 30, x1: 30.2, y0: 3, y1: 6, z0: -50, z1: -48 }, 'curb');
      const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 16, 10), m.sky);
      sky.position.set(47, 3, -64);
      b.groupOf(S).add(sky);
      for (let z = -78; z <= -50; z += 2.5) b.box(62.9, 3, z, 63.05, 5, z + 0.1, 'metalDark', { zone: S, collide: false });
      b.box(62.95, 4.6, -78, 63, 4.65, -50, 'metal', { zone: S, collide: false });
      b.box(62.95, 3.8, -78, 63, 3.85, -50, 'metal', { zone: S, collide: false });
      b.box(44.9, 3, -64.1, 45.1, 9, -63.9, 'metalDark', { zone: S, collide: false });
      p.wallLamp(45, 8.6, -63.5, S, { color: 0xffd2a0, lo: 5, hi: 5, range: 22, flicker: 0.1 });
      b.light({ x: 47, y: 16, z: -64, color: 0x8aa0d0, mode: 'always', lo: 4, hi: 4, range: 40, zone: S, phase: 7 });
      // снегопад
      const n = 900;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = 30 + Math.random() * 34;
        pos[i * 3 + 1] = 3 + Math.random() * 14;
        pos[i * 3 + 2] = -80 + Math.random() * 32;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8ecf4, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false;
      b.groupOf(S).add(this.snow);
    },

    // ── расходники по карте ─────────────────────────────────────────────────
    buildSupplies() {
      const s = (k, x, y, z, zone) => this.supply(k, x, y, z, zone);
      // батарейки
      s('battery', 1.6, 0.02, -1.6, 'corridor');
      s('battery', 3.6, 0.02, -13.2, 'corridor');
      s('battery', -21, 0.02, -9.4, 'west');
      s('battery', -29.6, 0.02, -11, 'dorm');
      s('battery', -43.6, 1.65, -9, 'archive');
      s('battery', 33.2, 1.16, -5.6, 'generator');
      s('battery', 1.4, 0.02, zz(-36.6) + 2.6, 'hall');
      s('battery', -15.3, BAL + 0.77, zz(-43.1), 'observation');
      s('battery', 25.5, SEW + 0.02, -9.2, 'sewer');
      s('battery', 102.5, SEW + 0.02, -7.4, 'pump');
      s('battery', 99.2, 0.77, -3.4, 'lab');
      // стимуляторы
      s('stim', -42.2, 0.77, -8.4, 'archive');
      s('stim', -1.2, 0.02, zz(-36.2) + 2.8, 'hall');
      s('stim', 31, SEW + 0.02, -9, 'sewer');
      s('stim', 112.8, 0.77, -1.0, 'echo');
      s('stim', -28.2, 0.95, -20.6, 'workshop');
      // бутылки (можно бросить, чтобы отвлечь Оно)
      s('bottle', -1.5, 0.02, -2.2, 'corridor');
      s('bottle', 22, 0.02, -6.4, 'east');
      s('bottle', -6, 0.02, -40, 'hall');
      s('bottle', 7, 0.02, -59, 'hall');
      s('bottle', 34, 0.02, -15, 'generator');
      s('bottle', -35, 0.02, -15.4, 'archive');
      s('bottle', -23, 0.02, -9.5, 'west');
      s('bottle', 16.2, 0.02, -25, 'corridor');
      // фильтры противогаза
      s('filter', 33.6, 1.16, -4.0, 'generator');
      s('filter', 30.6, SEW + 0.02, -20.4, 'sewer');
      s('filter', 102.8, SEW + 0.77, -14.2, 'pump');
      // осколки мнемита (6 штук) — светятся в темноте
      for (const [x, y, z, zone] of [[2.4, 0.02, -14.6, 'corridor'], [-28.6, 0.02, -16.6, 'dorm'], [-43.6, 1.86, -12.2, 'archive'], [40.1, 0.02, -9, 'generator'], [-16.9, SUNK + 0.02, -31.2, 'corridor'], [6, BAL + 0.02, zz(-47.4), 'hall']]) {
        const sh = s('shard', x, y, z, zone);
        this.b.light({ x, y: y + 0.25, z, color: 0x3ae0c8, mode: 'item', itemId: sh.id, lo: 1.1, hi: 1.1, range: 3.4, zone, flicker: 0.25, phase: x + z });
      }
      // патроны (по 2 в коробке)
      s('shells', -29.6, 0.64, -30.2, 'workshop');
      s('shells', -29.6, 1.16, -28.4, 'workshop');
      s('shells', -25.4, 0.77, -13.0, 'dorm');
      s('shells', 1.8, 0.02, zz(-33), 'hall');
      s('shells', 25, SEW + 0.02, -20.6, 'sewer');
    },
  });
}
