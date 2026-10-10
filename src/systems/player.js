// PlayerController — движение от первого лица, столкновения (круг против AABB),
// высота пола (лестницы — пандусы), толкание ящиков, шаги с учётом поверхности.

import * as THREE from 'three';
import { clamp } from '../core/util.js';

const RADIUS = 0.3;
const EYE = 1.62;
const HEIGHT = 1.8;

export class Player {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 4);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.bob = 0;
    this.stepDist = 0;
    this.stillTime = 0;
    this.surface = 'concrete';
    this.keys = new Set();
    this.moving = false;
    this.sprinting = false;
    this.roll = 0;
    this.extraFov = 0;
  }

  setPose(p) {
    this.pos.set(p.x, p.y, p.z);
    this.yaw = p.yaw ?? this.yaw;
    this.pitch = p.pitch ?? 0;
    this.vel.set(0, 0, 0);
  }

  pose() {
    return { x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3), yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4) };
  }

  look(dx, dy) {
    const s = this.game.settings;
    const k = 0.0022 * s.sens;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (s.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  // Ввод по назначенным клавишам (переназначаются в настройках).
  input() {
    const k = this.game.settings.keys;
    const has = (code) => this.keys.has(code);
    let f = 0;
    let r = 0;
    if (has(k.forward) || has('ArrowUp')) f += 1;
    if (has(k.back) || has('ArrowDown')) f -= 1;
    if (has(k.right) || has('ArrowRight')) r += 1;
    if (has(k.left) || has('ArrowLeft')) r -= 1;
    const sprint = has(k.sprint) || has('ShiftRight');
    return { f, r, sprint };
  }

  update(dt, active) {
    const { f, r, sprint } = active ? this.input() : { f: 0, r: 0, sprint: false };
    const speed = sprint ? 4.0 : 2.3;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // вперёд = -Z в локальных координатах камеры
    let wx = -sin * f + cos * r;
    let wz = -cos * f - sin * r;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const accel = len > 0 ? 10 : 12;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);

    const dx = this.vel.x * dt;
    const dz = this.vel.z * dt;
    const before = this.pos.clone();
    this.moveAxis(dx, 0);
    this.moveAxis(0, dz);

    // пол: лестницы и уровни
    const g = this.game.builder.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (g) {
      const diff = g.h - this.pos.y;
      // плавный подъём на ступень, мгновенный «прилип» при спуске по пандусу
      this.pos.y = diff > 0 ? this.pos.y + diff * Math.min(1, dt * 14) : diff > -0.6 ? g.h : this.pos.y + Math.max(diff, -9 * dt);
      this.surface = g.surface;
    }

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.moving = moved > 0.002;
    this.sprinting = sprint && this.moving;
    if (this.moving) {
      this.stillTime = 0;
      this.stepDist += moved;
      this.bob += moved * (sprint ? 2.6 : 3.2);
      const stride = sprint ? 0.85 : 0.68;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const fp = this.pos.clone();
        fp.y += 0.05;
        this.game.audio.footstep(this.surface, fp, sprint);
      }
    } else {
      this.stillTime += dt;
    }
    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const bobAmt = this.game.settings.headBob === false ? 0 : 1;
    const by = this.moving ? Math.sin(this.bob * 2) * 0.035 * bobAmt : 0;
    const bx = this.moving ? Math.cos(this.bob) * 0.02 * bobAmt : 0;
    this.camera.position.set(this.pos.x + Math.cos(this.yaw) * bx, this.pos.y + EYE + by, this.pos.z - Math.sin(this.yaw) * bx);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const fov = this.game.settings.fov + this.extraFov + (this.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }

  // Движение по одной оси с разрешением столкновений. Ящики толкаются.
  moveAxis(dx, dz) {
    const b = this.game.builder;
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    const y0 = this.pos.y + 0.35;
    const y1 = this.pos.y + HEIGHT;
    let blocked = false;
    for (const c of b.near(nx - RADIUS - 0.1, nz - RADIUS - 0.1, nx + RADIUS + 0.1, nz + RADIUS + 0.1)) {
      if (!c.enabled || c.y1 <= y0 || c.y0 >= y1) continue;
      const px = clamp(nx, c.x0, c.x1);
      const pz = clamp(nz, c.z0, c.z1);
      const ddx = nx - px;
      const ddz = nz - pz;
      if (ddx * ddx + ddz * ddz < RADIUS * RADIUS) {
        if (c.tag === 'crate' && c.crate.push(dx, dz)) continue;
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      // попытка соскользнуть: небольшой шаг вдоль стены уже обеспечен раздельными осями
      if (dx) this.vel.x *= 0.2;
      if (dz) this.vel.z *= 0.2;
    }
  }

  // Направление взгляда (для Наблюдателя и взаимодействий).
  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  eye() {
    return this.camera.position;
  }
}
