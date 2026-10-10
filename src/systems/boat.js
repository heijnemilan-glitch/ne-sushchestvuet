// Лодка: единственный путь через затопленный тоннель от коллектора к насосной станции (и обратно).
// По пути: газ (нужен противогаз), удар снизу, и лицо под водой.
// Если смотреть на лицо достаточно долго — секретная концовка «ВОДА».

import * as THREE from 'three';
import { SEW, WATER } from '../world/level.js';

const ROUTE = [
  [29.5, -15],
  [36, -15],
  [50, -15.2],
  [58, -15],
  [66, -15.6],
  [74, -14.4],
  [82, -15.2],
  [91.5, -15],
];

export class BoatSystem {
  constructor(game) {
    this.game = game;
    this.riding = null;
    this.face = null;
    this.gaze = 0;
    this.placeIdle();
  }

  get at() {
    return this.game.world.get('boatAt', 'sewer');
  }

  placeIdle() {
    const boat = this.game.level.boat;
    if (!boat) return;
    const end = this.at === 'sewer' ? ROUTE[0] : ROUTE[ROUTE.length - 1];
    boat.position.set(end[0], WATER - 0.15, end[1]);
    boat.rotation.y = this.at === 'sewer' ? 0 : Math.PI;
    // кнопку посадки «носит» вместе с лодкой — меш тот же
  }

  prompt() {
    if (this.riding) return null;
    return this.at === 'sewer' ? 'Сесть в лодку — плыть по затопленному тоннелю' : 'Сесть в лодку — плыть обратно к коллектору';
  }

  board() {
    const g = this.game;
    if (this.riding) return;
    const path = this.at === 'sewer' ? ROUTE.slice() : ROUTE.slice().reverse();
    // длины отрезков для равномерного движения
    const segs = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      segs.push(d);
      total += d;
    }
    this.riding = { path, segs, total, s: 0, speed: 2.4, bumped: false, faceShown: false, dir: this.at === 'sewer' ? 1 : -1 };
    this.gaze = 0;
    g.world.set('boatLamp', true);
    g.audio.play('boat_start');
    g.ui.hint('Лодка сама плывёт по течению. Смотреть можно — грести не нужно.', 4);
    g.mem.seeEvent('boat');
  }

  abort() {
    if (!this.riding) return;
    this.riding = null;
    this.game.world.set('boatLamp', false);
    this.removeFace();
    this.placeIdle();
  }

  pointAt(s) {
    const r = this.riding;
    let d = s;
    for (let i = 0; i < r.segs.length; i++) {
      if (d <= r.segs[i]) {
        const a = r.path[i];
        const b = r.path[i + 1];
        const k = d / r.segs[i];
        return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
      }
      d -= r.segs[i];
    }
    const e = r.path[r.path.length - 1];
    return { x: e[0], z: e[1], yaw: 0 };
  }

  update(dt) {
    const r = this.riding;
    if (!r) return;
    const g = this.game;
    r.s = Math.min(r.total, r.s + r.speed * dt);
    const pt = this.pointAt(r.s);
    const boat = g.level.boat;
    const sway = Math.sin(g.time * 1.3) * 0.04;
    boat.position.set(pt.x, WATER - 0.15 + Math.sin(g.time * 2.1) * 0.03, pt.z);
    boat.rotation.y = pt.yaw - Math.PI / 2;
    boat.rotation.z = sway;
    // игрок сидит в лодке (глаза ≈ 1 м над водой)
    const p = g.player;
    p.pos.set(pt.x - Math.sin(pt.yaw) * 0.5, WATER - 0.62, pt.z - Math.cos(pt.yaw) * 0.5);
    p.roll = sway * 0.6 + (r.shake || 0) * Math.sin(g.time * 40);
    if (r.shake) r.shake = Math.max(0, r.shake - dt);
    p.applyCamera(dt);
    g.level.boatLight.x = pt.x;
    g.level.boatLight.z = pt.z;
    // удар снизу
    if (!r.bumped && pt.x > 61 && pt.x < 64) {
      r.bumped = true;
      r.shake = 0.08;
      g.audio.play('boat_bump');
      g.audio.play('stinger');
      g.fx.distort(0.8);
      setTimeout(() => g.audio.play('roar', new THREE.Vector3(pt.x, WATER - 1, pt.z)), 400);
      g.mem.observe('boat_bump', 'Что-то большое ударило лодку снизу. Вода в канале слишком тёмная, чтобы разглядеть.');
    }
    // лицо под водой
    if (!r.faceShown && pt.x > 68 && pt.x < 76) {
      r.faceShown = true;
      this.showFace(pt.x + r.dir * 3.5, pt.z + 0.4);
    }
    if (this.face) this.watchFace(dt);
    if (r.s >= r.total) this.arrive();
  }

  showFace(x, z) {
    const g = this.game;
    const face = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xa8b8b0, transparent: true, opacity: 0.55, fog: true });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat);
    head.scale.set(1, 1.25, 0.6);
    face.add(head);
    const dark = new THREE.MeshBasicMaterial({ color: 0x050605 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark);
      eye.position.set(s * 0.1, 0.06, 0.15);
      face.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
    mouth.scale.set(1, 1.6, 0.6);
    mouth.position.set(0, -0.14, 0.15);
    face.add(mouth);
    face.position.set(x, WATER - 0.35, z);
    face.rotation.x = -Math.PI / 2;
    g.scene.add(face);
    this.face = face;
    g.audio.play('whisper', face.position);
  }

  removeFace() {
    if (!this.face) return;
    this.game.scene.remove(this.face);
    this.face = null;
  }

  watchFace(dt) {
    const g = this.game;
    const eye = g.player.eye();
    const to = this.face.position.clone().sub(eye);
    const d = to.length();
    const angle = Math.acos(Math.min(1, g.player.forward().dot(to.normalize())));
    this.face.children[0].material.opacity = 0.35 + Math.min(0.45, this.gaze * 0.12);
    if (angle < 0.32 && d < 9) {
      this.gaze += dt;
      g.fx.distort(Math.min(0.6, this.gaze * 0.15));
      if (this.gaze > 1.5 && !this._whisper2) {
        this._whisper2 = true;
        g.audio.play('whisper', this.face.position);
        g.ui.hint('Оно смотрит в ответ. Лицо… знакомое.', 3);
      }
      if (this.gaze > 4.5) {
        this.removeFace();
        this.riding.s = this.riding.total;
        g.ending('ending_water');
      }
    } else if (d > 12) this.removeFace();
  }

  arrive() {
    const g = this.game;
    const atPump = this.riding.dir === 1;
    this.riding = null;
    this.removeFace();
    this._whisper2 = false;
    g.world.set('boatAt', atPump ? 'pump' : 'sewer');
    g.world.set('boatLamp', false);
    g.player.roll = 0;
    if (atPump) g.player.setPose({ x: 94.4, y: SEW, z: -15, yaw: -Math.PI / 2, pitch: 0 });
    else g.player.setPose({ x: 29.5, y: SEW, z: -17.4, yaw: Math.PI, pitch: 0 });
    this.placeIdle();
    g.audio.play('boat_bump');
    g.updateZone(false);
    if (atPump) g.mem.observe('pump_arrive', 'Насосная станция. Насосы молчат, но где-то внутри всё ещё капает.');
  }
}
