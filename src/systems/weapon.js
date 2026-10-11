// WeaponSystem — руки игрока и самодельное ружьё.
//  • в руках виден фонарь (пока нет ружья) или ружьё с примотанным фонарём
//  • покачивание при ходьбе, инерция при повороте головы, наклон при беге, подъём «в кадр»
//  • сборка на верстаке в мастерской: ствол + приклад + затвор (анимация сборки)
//  • выстрел: левая кнопка мыши — отдача, вспышка, громкий звук (Оно слышит!), попадание по Оно
//  • перезарядка сама: стволы переламываются, два патрона, стволы закрываются

import * as THREE from 'three';
import { gunModel, itemModel } from '../world/props.js';
import { rayBox } from './interaction.js';

export const PARTS = ['part_barrel', 'part_stock', 'part_bolt'];
const PART_NAMES = { part_barrel: 'ствол', part_stock: 'приклад', part_bolt: 'затвор' };
const RANGE = 20;

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    const cam = game.camera;
    if (cam.userData.hands) cam.remove(cam.userData.hands);
    this.root = new THREE.Group();
    cam.add(this.root);
    cam.userData.hands = this.root;
    // тёмные рабочие перчатки и рукава куртки
    const skin = new THREE.MeshStandardMaterial({ color: 0x2c2723, roughness: 0.8, emissive: 0x060504 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x1f2420, roughness: 0.95, emissive: 0x030403 });
    const hand = (len = 0.32) => {
      const g = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skin);
      palm.scale.set(0.85, 0.55, 1.05);
      const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 4, 8), skin);
      fingers.rotation.set(0, 0, Math.PI / 2);
      fingers.position.set(0, 0.025, -0.045);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, len, 8), sleeve);
      arm.rotation.x = Math.PI / 2 - 0.25;
      arm.position.set(0, -0.04, len / 2 + 0.03);
      g.add(palm, fingers, arm);
      return g;
    };
    // ружьё в руках
    this.gunHolder = new THREE.Group();
    this.gun = gunModel(game.mats);
    this.gun.rotation.y = Math.PI / 2; // стволы смотрят вперёд (−Z камеры)
    this.gunHolder.add(this.gun);
    const rh = hand(0.36);
    rh.position.set(0.0, -0.06, 0.02);
    rh.rotation.set(-0.2, 0, 0.1);
    this.gunHolder.add(rh);
    const lh = hand(0.4);
    lh.position.set(-0.03, -0.05, -0.2);
    lh.rotation.set(-0.1, 0.35, -0.3);
    this.gunHolder.add(lh);
    this.root.add(this.gunHolder);
    // фонарь в руке
    this.torchHolder = new THREE.Group();
    this.torch = itemModel('flashlight', game.mats);
    this.torch.scale.setScalar(1.1);
    this.torch.rotation.y = Math.PI / 2;
    this.torchLens = this.torch.children[2];
    this.torchLensMat = game.mats.lampWarm.clone();
    if (this.torchLens) this.torchLens.material = this.torchLensMat;
    this.torchHolder.add(this.torch);
    const th = hand(0.34);
    th.position.set(0, -0.025, 0.05);
    this.torchHolder.add(th);
    this.root.add(this.torchHolder);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    // вспышка выстрела
    this.flashLight = new THREE.PointLight(0xffc070, 0, 9, 2);
    this.flashLight.position.set(0.15, -0.1, -0.8);
    this.root.add(this.flashLight);
    this.flashMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.9, depthWrite: false }));
    this.flashMesh.visible = false;
    this.root.add(this.flashMesh);
    this.raise = 0;
    this.kick = 0;
    this.flash = 0;
    this.cooldown = 0;
    this.reloading = null;
    this.assembling = null;
    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.particles = [];
    this.wasOwned = this.owned;
    if (game.world.get('gunLoaded') === undefined) game.world.data.vars.gunLoaded = 0;
    game.bus.on('supply:pickup', (e) => {
      if (e.kind === 'shells' && this.owned && this.loaded < 2 && !this.reloading) setTimeout(() => this.reload(), 300);
      if (e.kind === 'shells' && !this.owned && game.mem.count('tip_shells_noguns') === 1) game.ui.hint('Патроны. Ружья пока нет — детали нужно собрать на верстаке в мастерской.', 5);
    });
    game.bus.on('item:pickup', (e) => {
      if (!PARTS.includes(e.id)) return;
      const have = PARTS.filter((p) => game.inv.has(p)).length;
      game.ui.hint(have < 3 ? `Деталь ружья: ${PART_NAMES[e.id]}. Собрано ${have} из 3. Сборка — на верстаке в мастерской.` : 'Все три детали. Теперь — к верстаку в мастерской.', 5);
    });
  }

  get owned() {
    return this.game.inv.has('shotgun');
  }

  get loaded() {
    return this.game.world.get('gunLoaded', 0);
  }

  set loaded(v) {
    this.game.world.data.vars.gunLoaded = v;
  }

  get busy() {
    return !!this.assembling;
  }

  // ── верстак ────────────────────────────────────────────────────────────────
  benchPrompt() {
    const g = this.game;
    if (this.owned) return 'Верстак';
    const have = PARTS.filter((p) => g.inv.has(p)).length;
    return have === 3 ? 'Собрать ружьё' : `Верстак (деталей: ${have}/3)`;
  }

  assemble() {
    const g = this.game;
    if (this.assembling) return;
    if (this.owned) return g.ui.hint('Ружьё уже собрано. Схема на стене больше не нужна.');
    const missing = PARTS.filter((p) => !g.inv.has(p));
    if (missing.length) {
      g.audio.play('click');
      g.ui.hint(`Схема сборки на стене: ствол, приклад, затвор. Не хватает: ${missing.map((m) => PART_NAMES[m]).join(', ')}.`, 5);
      g.mem.observe('bench', 'На верстаке в мастерской — схема самодельного ружья. Нужны ствол, приклад и затвор. Кто-то уже начинал собирать.');
      return;
    }
    const s = g.level.benchSpot;
    const meshes = PARTS.map((id, i) => {
      const m = itemModel({ part_barrel: 'barrel', part_stock: 'stock', part_bolt: 'bolt' }[id], g.mats);
      m.position.set(s.x - 0.55 + i * 0.55, s.y + 0.01, s.z + 0.05);
      m.rotation.y = (i - 1) * 0.5;
      g.scene.add(m);
      return m;
    });
    PARTS.forEach((p) => g.inv.remove(p));
    this.assembling = { t: 0, dur: 3.6, meshes, steps: 0 };
    g.player.keys.clear();
    g.flashlightOn = true;
    g.audio.play('clank', new THREE.Vector3(s.x, s.y, s.z));
  }

  updateAssemble(dt) {
    const a = this.assembling;
    const g = this.game;
    const s = g.level.benchSpot;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    // камера смотрит на верстак
    const eye = g.camera.position;
    const wantYaw = Math.atan2(-(s.x - eye.x), -(s.z - eye.z));
    let d = wantYaw - g.player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.player.yaw += d * Math.min(1, dt * 4);
    const wantPitch = Math.atan2(s.y - eye.y, Math.hypot(s.x - eye.x, s.z - eye.z));
    g.player.pitch += (wantPitch - g.player.pitch) * Math.min(1, dt * 4);
    g.player.applyCamera(dt);
    // детали съезжаются в центр по очереди и защёлкиваются
    a.meshes.forEach((m, i) => {
      const start = 0.15 + i * 0.22;
      const kk = Math.min(1, Math.max(0, (k - start) / 0.25));
      const e = kk * kk * (3 - 2 * kk);
      const x0 = s.x - 0.55 + i * 0.55;
      m.position.x = x0 + (s.x - x0) * e;
      m.position.y = s.y + 0.01 + Math.sin(e * Math.PI) * 0.12;
      m.rotation.y = (i - 1) * 0.5 * (1 - e);
      m.rotation.z = Math.sin(e * Math.PI) * 0.4;
      if (kk >= 1 && a.steps <= i) {
        a.steps = i + 1;
        g.audio.play('clank', m.position);
      }
    });
    if (k > 0.85 && !a.combined) {
      a.combined = true;
      a.meshes.forEach((m) => g.scene.remove(m));
      a.gun = gunModel(g.mats, { withLight: true });
      a.gun.position.set(s.x, s.y + 0.03, s.z + 0.05);
      g.scene.add(a.gun);
      g.audio.play('rack');
    }
    if (k >= 1) {
      if (a.gun) g.scene.remove(a.gun);
      this.assembling = null;
      g.inv.add('shotgun');
      g.world.setItem('shotgun', { where: 'inv' });
      this.raise = 0;
      g.audio.play('pickup');
      g.ui.toast('Получено: Ружьё');
      g.ui.hint('Ружьё собрано. Стрелять — левая кнопка мыши. Выстрел громкий: Оно услышит. Три попадания — и оно не встанет.', 7);
      g.mem.observe('gun', 'Я собрал ружьё. Фонарь примотал изолентой под стволы. Руки трясутся, но держат.');
      g.bus.emit('weapon:assembled');
      g.addCode && g.addCode('weapon');
      if (g.inv.count('shells') > 0) setTimeout(() => this.reload(), 700);
      else g.ui.hint('Патронов нет. Коробки с патронами разбросаны по комплексу.', 4);
    }
  }

  // ── стрельба ───────────────────────────────────────────────────────────────
  fire() {
    const g = this.game;
    if (!this.owned || this.reloading || this.assembling || this.cooldown > 0) return;
    if (g.state !== 'playing' || g.paused || g.player.hiddenIn || g.survival.busy) return;
    if (this.loaded <= 0) {
      if (g.inv.count('shells') > 0) this.reload();
      else {
        g.audio.play('dryfire');
        this.cooldown = 0.3;
        g.ui.hint('Щёлк. Патронов нет.', 2);
      }
      return;
    }
    this.loaded -= 1;
    this.cooldown = 0.4;
    this.kick = 1;
    this.flash = 1;
    g.audio.play('shotgun');
    g.fx.distort(0.18);
    g.player.pitch = Math.min(1.45, g.player.pitch + 0.045);
    g.mem.count('shots');
    const cam = g.camera.position.clone();
    const dir = g.player.forward();
    g.bus.emit('noise', { x: cam.x, y: g.player.pos.y, z: cam.z, r: 38 });
    const hit = this.hitMonster(cam, dir);
    const bh = g.beast && g.beast.rayHit(cam, dir);
    if (bh && (!hit || bh.dist < hit.dist)) {
      this.burst(bh.point, 0x4a5a40, 20, 2.2);
      g.beast.hit();
    } else if (hit) {
      this.burst(hit.point, 0x6a0806, 26, 2.6);
      g.monster.hit(hit.point, hit.dist);
    } else {
      const wall = this.hitWorld(cam, dir);
      if (wall) this.burst(wall, 0xb8b0a0, 12, 1.4);
    }
    if (this.loaded <= 0 && g.inv.count('shells') > 0) setTimeout(() => this.reload(), 450);
  }

  // Попадание: ближайшее сближение луча с вертикальной «капсулой» Оно.
  hitMonster(origin, dir) {
    const m = this.game.monster;
    if (!m || m.dead || !m.mesh.visible || m.state === 'dormant') return null;
    const mx = m.pos.x;
    const mz = m.pos.z;
    const dx = dir.x;
    const dz = dir.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return null;
    const t = ((mx - origin.x) * dx + (mz - origin.z) * dz) / len2;
    if (t <= 0 || t > RANGE) return null;
    const px = origin.x + dx * t;
    const pz = origin.z + dz * t;
    const py = origin.y + dir.y * t;
    const miss = Math.hypot(px - mx, pz - mz);
    const radius = t < 8 ? 0.75 : t < 14 ? 0.55 : 0.4; // дробь разлетается — вблизи попасть легче
    if (miss > radius || py < m.pos.y - 0.1 || py > m.pos.y + 2.5) return null;
    if (!m.los(origin.x, origin.y, origin.z, px, py, pz)) return null;
    return { point: new THREE.Vector3(px, py, pz), dist: t };
  }

  hitWorld(origin, dir) {
    let best = null;
    const end = origin.clone().addScaledVector(dir, 25);
    for (const c of this.game.builder.near(Math.min(origin.x, end.x), Math.min(origin.z, end.z), Math.max(origin.x, end.x), Math.max(origin.z, end.z))) {
      if (!c.enabled) continue;
      const t = rayBox(origin, dir, c);
      if (t !== null && t > 0.2 && (best === null || t < best)) best = t;
    }
    return best === null ? null : origin.clone().addScaledVector(dir, best - 0.05);
  }

  // Брызги (кровь или бетонная крошка).
  burst(p, color, n, speed) {
    const g = this.game;
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.SphereGeometry(0.018, 4, 3);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
      m.userData.life = 0.5 + Math.random() * 0.5;
      g.scene.add(m);
      this.particles.push(m);
    }
  }

  reload() {
    const g = this.game;
    if (!this.owned || this.reloading || this.loaded >= 2 || g.inv.count('shells') <= 0) return;
    this.reloading = { t: 0, dur: 1.5, stage: 0 };
    g.audio.play('break_open');
  }

  // ── кадр ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    if (this.assembling) this.updateAssemble(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = g.player;
    const owned = this.owned;
    const show = (g.state === 'playing' || g.state === 'caught') && !p.hiddenIn && !g.examining && !g.lockerAnim && !(g.survival && g.survival.busy) && !this.assembling && (owned || g.inv.has('flashlight'));
    if (owned !== this.wasOwned) {
      this.wasOwned = owned;
      this.raise = 0;
    }
    this.root.visible = show;
    this.gunHolder.visible = owned;
    this.torchHolder.visible = !owned;
    this.raise = show ? Math.min(1, this.raise + dt * 2.2) : 0;
    const on = g.flashlightOn && g.inv.has('flashlight');
    if (this.torchLensMat) this.torchLensMat.color.setHex(on ? 0xfff2d8 : 0x3a3830);
    if (this.gun.userData.lens) this.gun.userData.lens.material.color.setHex(on ? 0xfff2d8 : 0x3a3830);
    // инерция поворота головы
    let dy = p.yaw - this.lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = p.pitch - this.lastPitch;
    this.lastYaw = p.yaw;
    this.lastPitch = p.pitch;
    this.swayX += (Math.max(-0.06, Math.min(0.06, dy * 0.6)) - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (Math.max(-0.05, Math.min(0.05, -dp * 0.6)) - this.swayY) * Math.min(1, dt * 8);
    const bobOn = g.settings.headBob !== false && p.moving;
    const bx = bobOn ? Math.cos(p.bob) * 0.012 : 0;
    const by = bobOn ? -Math.abs(Math.sin(p.bob)) * 0.014 : Math.sin(g.time * 1.6) * 0.003;
    const sprint = p.sprinting ? 1 : 0;
    this.sprintK = (this.sprintK || 0) + (sprint - (this.sprintK || 0)) * Math.min(1, dt * 6);
    const rise = 1 - this.raise * this.raise * (3 - 2 * this.raise);
    // отдача
    this.kick = Math.max(0, this.kick - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 14);
    this.flashLight.intensity = this.flash * 26;
    this.flashMesh.visible = this.flash > 0.4;
    // упёрлись в стену — убрать ружьё к себе
    const wall = this.wallDist();
    this.wallD = wall;
    const pull = wall < 0.85 ? (0.85 - wall) / 0.85 : 0;
    this.pullK = (this.pullK || 0) + (pull - (this.pullK || 0)) * Math.min(1, dt * 10);
    if (owned) {
      const h = this.gunHolder;
      h.position.set(0.17 + bx + this.swayX + this.sprintK * 0.05, -0.2 + by + this.swayY - rise * 0.35 - this.sprintK * 0.06 - this.pullK * 0.12, -0.34 + this.kick * 0.09 + this.pullK * 0.12);
      h.rotation.set(this.kick * 0.28 + this.swayY * 2 - this.sprintK * 0.5 + this.pullK * 0.6, this.swayX * 2 + this.sprintK * 0.6, -this.sprintK * 0.25);
      this.flashMesh.position.set(h.position.x - 0.0, h.position.y + 0.04, h.position.z - 0.62);
      this.flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.updateReload(dt, h);
    } else {
      const h = this.torchHolder;
      h.position.set(0.24 + bx + this.swayX, -0.27 + by + this.swayY - rise * 0.35 - this.pullK * 0.08, -0.42 + this.pullK * 0.1);
      h.rotation.set(this.swayY * 2 + this.sprintK * 0.4 + this.pullK * 0.5, this.swayX * 2 + 0.06, -this.sprintK * 0.3);
    }
    this.aimFlashlight(show, owned);
    // частицы
    this.particles = this.particles.filter((m) => {
      m.userData.life -= dt;
      m.userData.v.y -= 9.8 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      if (m.userData.life <= 0) {
        g.scene.remove(m);
        return false;
      }
      return true;
    });
  }

  // Луч фонаря выходит из линзы того, что в руках (фонарь или фонарь под стволами), и бьёт в прицел.
  aimFlashlight(show, owned) {
    const spot = this.game.flashlight;
    if (!spot) return;
    const lens = owned ? this.gun.userData.lens : this.torchLens;
    if (!show || !lens) {
      spot.position.set(0.18, -0.12, 0.05);
      spot.target.position.set(0.05, -0.05, -3);
      return;
    }
    const v = this._lensV || (this._lensV = new THREE.Vector3());
    this.root.updateMatrixWorld(true);
    lens.getWorldPosition(v);
    this.game.camera.worldToLocal(v);
    spot.position.set(v.x, v.y, v.z - 0.06);
    spot.target.position.set(v.x * 0.3, v.y * 0.3 + 0.05, -8);
  }

  updateReload(dt, h) {
    const r = this.reloading;
    const barrels = this.gun.userData.barrels;
    if (!r) {
      barrels.rotation.z = 0;
      return;
    }
    const g = this.game;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    // наклон ружья, переломить стволы, вставить патроны, закрыть
    const tilt = Math.sin(k * Math.PI);
    h.rotation.x -= tilt * 0.35;
    h.rotation.z += tilt * 0.35;
    h.position.y -= tilt * 0.05;
    const open = k < 0.2 ? k / 0.2 : k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.12);
    barrels.rotation.z = -open * 0.55;
    if (r.stage === 0 && k > 0.35) {
      r.stage = 1;
      g.audio.play('shell_in');
    }
    if (r.stage === 1 && k > 0.55) {
      r.stage = 2;
      g.audio.play('shell_in');
    }
    if (r.stage === 2 && k > 0.8) {
      r.stage = 3;
      g.audio.play('rack');
    }
    if (k >= 1) {
      const take = Math.min(2 - this.loaded, g.inv.count('shells'));
      g.inv.addCount('shells', -take);
      this.loaded += take;
      this.reloading = null;
      barrels.rotation.z = 0;
    }
  }

  // Расстояние до ближайшей стены прямо перед глазами (чтобы ружьё не проходило сквозь стены).
  wallDist() {
    const g = this.game;
    const o = g.camera.position;
    const dir = g.player.forward(this._dir || (this._dir = new THREE.Vector3()));
    let best = 9;
    for (const c of g.builder.near(o.x - 1, o.z - 1, o.x + 1, o.z + 1)) {
      if (!c.enabled || c.tag === 'rail') continue;
      const t = rayBox(o, dir, c);
      if (t !== null && t >= 0 && t < best) best = t;
    }
    return best;
  }
}
