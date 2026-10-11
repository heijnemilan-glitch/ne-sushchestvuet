// Утопленник — второе существо Сектора 0. Живёт в воде резервуара и не выходит из неё.
//  • плавает под поверхностью; над ним расходятся круги и пузыри
//  • если стоять у края мостков, подплывает к ближайшей точке воды и всплывает — тянет руки через перила
//  • схватит, если не отойти от края за секунду с небольшим; выстрел прогоняет его на глубину
//  • в воду под током (затопленный угол) не заплывает

import * as THREE from 'three';
import { makeCreature } from '../world/models.js';
import { POOL } from '../world/consts.js';

const WATER = { x0: -14.1, x1: 14.1, z0: -30.1, z1: -3.9 };
const ISLAND = { x0: -5.4, x1: 5.4, z0: -20.4, z1: -11.6 };
const BRIDGE = { x0: -1.6, x1: 1.6, z0: -12, z1: -3.5 };
const DEEP = POOL - 2.1;
const SURFACE = POOL + 0.25;

const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export class WaterBeast {
  constructor(game) {
    this.game = game;
    const c = makeCreature('drowned');
    this.c = c;
    this.mesh = c.holder;
    this.mesh.scale.setScalar(1.25);
    game.scene.add(this.mesh);
    this.pos = new THREE.Vector3(6, DEEP, -25);
    this.y = DEEP;
    this.yaw = 0;
    this.state = 'roam';
    this.timer = 0;
    this.cool = 0;
    this.target = this.randomPoint();
    this.time = 0;
    this.rings = [];
    this.ringTimer = 0;
    const run = c.actions.run || Object.values(c.actions)[0];
    if (run) {
      run.play();
      run.timeScale = 0.45;
    }
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  randomPoint() {
    for (let i = 0; i < 20; i++) {
      const x = WATER.x0 + Math.random() * (WATER.x1 - WATER.x0);
      const z = WATER.z0 + Math.random() * (WATER.z1 - WATER.z0);
      if (this.swimmable(x, z)) return new THREE.Vector2(x, z);
    }
    return new THREE.Vector2(8, -25);
  }

  swimmable(x, z) {
    if (!inRect(WATER, x, z) || inRect(ISLAND, x, z) || inRect(BRIDGE, x, z)) return false;
    return true;
  }

  // ближайшая к игроку точка воды и расстояние до неё
  nearestWater(p) {
    let best = null;
    let bd = 1e9;
    const consider = (x, z) => {
      if (!this.swimmable(x, z)) return;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = new THREE.Vector2(x, z);
      }
    };
    const cx = Math.max(WATER.x0 + 0.05, Math.min(WATER.x1 - 0.05, p.x));
    const cz = Math.max(WATER.z0 + 0.05, Math.min(WATER.z1 - 0.05, p.z));
    consider(cx, cz);
    // вокруг островка и моста — края
    for (const r of [ISLAND, BRIDGE]) {
      const ix = Math.max(r.x0, Math.min(r.x1, p.x));
      const iz = Math.max(r.z0, Math.min(r.z1, p.z));
      consider(r.x0 - 0.05, iz);
      consider(r.x1 + 0.05, iz);
      consider(ix, r.z0 - 0.05);
      consider(ix, r.z1 + 0.05);
    }
    return best ? { pt: best, d: bd } : null;
  }

  hit() {
    const g = this.game;
    if (this.state === 'gone') return false;
    this.state = 'dive';
    this.cool = 25;
    g.audio.play('monster_hurt', this.pos.clone().setY(POOL));
    g.audio.play('splash', this.pos.clone().setY(POOL));
    this.burstRings(4);
    g.mem.observe('beast_shot', 'Я выстрелил в то, что поднималось из воды. Оно ушло на глубину. Не умерло — ушло.');
    return true;
  }

  // попадание из ружья: луч против «торса» над водой
  rayHit(origin, dir, range = 20) {
    if (this.y < POOL - 1.2) return null;
    const dx = dir.x;
    const dz = dir.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return null;
    const t = ((this.pos.x - origin.x) * dx + (this.pos.z - origin.z) * dz) / len2;
    if (t <= 0 || t > range) return null;
    const px = origin.x + dx * t;
    const pz = origin.z + dz * t;
    const py = origin.y + dir.y * t;
    if (Math.hypot(px - this.pos.x, pz - this.pos.z) > 0.7) return null;
    if (py < POOL - 0.2 || py > this.y + 2.4) return null;
    return { point: new THREE.Vector3(px, py, pz), dist: t };
  }

  burstRings(n = 1) {
    for (let i = 0; i < n; i++) this.ring(0.3 + i * 0.25, 1.6 + i * 0.3);
  }

  ring(start = 0.2, life = 1.6) {
    const g = this.game;
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fc8bc, transparent: true, opacity: 0.4, depthWrite: false }));
    m.position.set(this.pos.x + (Math.random() - 0.5) * 0.4, POOL + 0.02, this.pos.z + (Math.random() - 0.5) * 0.4);
    m.scale.setScalar(start);
    g.scene.add(m);
    this.rings.push({ m, t: 0, life, start });
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    this.cool = Math.max(0, this.cool - dt);
    const p = g.player.pos;
    const near = g.currentZone && g.currentZone.id === 'corridor' && Math.abs(p.y) < 1.2;
    const awakeTime = g.mem.data.playTime > 45;
    let speed = 1.1;
    let wantY = DEEP;
    if (this.state === 'roam') {
      if (this.pos.distanceTo(new THREE.Vector3(this.target.x, this.pos.y, this.target.y)) < 0.6) this.target = this.randomPoint();
      if (near && awakeTime && this.cool <= 0 && g.state === 'playing') {
        const nw = this.nearestWater(p);
        if (nw && nw.d < 2.4) this.state = 'stalk';
      }
    }
    if (this.state === 'stalk') {
      speed = 2.6;
      const nw = near ? this.nearestWater(p) : null;
      if (!nw || nw.d > 3.2 || g.player.hiddenIn) {
        this.state = 'roam';
        this.target = this.randomPoint();
      } else {
        this.target = nw.pt;
        wantY = DEEP + 0.7;
        if (Math.hypot(this.pos.x - nw.pt.x, this.pos.z - nw.pt.y) < 0.7 && nw.d < 1.9) {
          this.state = 'rise';
          this.timer = 0;
          g.audio.play('splash', this.pos.clone().setY(POOL));
          g.audio.play('screech');
          g.fx.distort(0.6);
          this.burstRings(3);
          if (g.mem.count('beast_seen') === 1) g.mem.observe('beast', 'Из воды поднялось что-то белое и раздутое и потянуло руки через перила. Я отскочил. Вода сомкнулась. Не стоять у края.');
        }
      }
    }
    if (this.state === 'rise') {
      speed = 0;
      this.timer += dt;
      wantY = SURFACE;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      if (this.timer > 1.25 && this.timer < 1.6 && d < 1.75 && g.state === 'playing' && !g.player.hiddenIn) {
        g.drown(this);
        this.state = 'dive';
        this.cool = 30;
      } else if (this.timer > 2.4) {
        this.state = 'dive';
        this.cool = 8;
      }
    }
    if (this.state === 'dive') {
      speed = 1.6;
      wantY = DEEP;
      if (this.y < DEEP + 0.2) {
        this.state = 'roam';
        this.target = this.randomPoint();
      }
    }
    // движение в плоскости воды
    if (speed > 0 && this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.y - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, speed * dt);
        const nx = this.pos.x + (dx / d) * step;
        const nz = this.pos.z + (dz / d) * step;
        if (this.swimmable(nx, nz)) {
          this.pos.x = nx;
          this.pos.z = nz;
        } else this.target = this.randomPoint();
        const want = Math.atan2(dx, dz);
        let df = want - this.yaw;
        df = Math.atan2(Math.sin(df), Math.cos(df));
        this.yaw += df * Math.min(1, dt * 3);
      }
    }
    // всплытие/погружение
    const rate = this.state === 'rise' ? 3.2 : 1.4;
    this.y += (wantY - this.y) * Math.min(1, dt * rate);
    this.pos.y = this.y;
    // плывущий — лежит в воде горизонтально, всплывший — стоит
    const upright = Math.max(0, Math.min(1, (this.y - (DEEP + 0.5)) / (SURFACE - DEEP - 0.5)));
    this.c.root.rotation.x = (1 - upright) * (Math.PI / 2 - 0.15);
    this.c.root.position.y = (1 - upright) * 0.4;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.visible = this.y > DEEP - 0.5;
    this.c.mixer.update(dt * (this.state === 'rise' ? 0.4 : 1));
    if (this.c.head) this.c.head.rotation.z += Math.sin(this.time * 19) > 0.95 ? 0.5 : 0;
    // круги на воде над ним
    this.ringTimer -= dt;
    const shallow = this.y > DEEP + 0.4;
    if (this.ringTimer <= 0 && (shallow || this.state === 'stalk') && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 26) {
      this.ringTimer = this.state === 'rise' ? 0.25 : this.state === 'stalk' ? 0.55 : 1.4;
      this.ring();
      if (this.state === 'stalk' && Math.random() < 0.3) g.audio.play('gurgle', this.pos.clone().setY(POOL));
    }
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / r.life;
      r.m.scale.setScalar(r.start + k * 2.4);
      r.m.material.opacity = 0.4 * (1 - k);
      if (k >= 1) {
        g.scene.remove(r.m);
        r.m.material.dispose();
        return false;
      }
      return true;
    });
  }
}
