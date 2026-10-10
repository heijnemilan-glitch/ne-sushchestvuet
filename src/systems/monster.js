// МОНСТР («Оно») — охотник Сектора 0.
//
// Состояния: dormant → patrol ⇄ investigate → chase → search → patrol;  caught → retreat
//  • слух: бег слышен за 13 м, шаги — за 4 м, хлопок двери — за 11 м
//  • зрение: 11 м в темноте, 22 м если у игрока горит фонарь; угол обзора ~140°
//  • ходит по сетке проходимости (A*), сам открывает незапертые двери
//  • не заходит в комнату пробуждения и комнату ожидания — там безопасно
//  • если игрок спрятался в шкафчик у него на глазах — вытащит; иначе потеряет след

import * as THREE from 'three';
import { makeCreature } from '../world/models.js';
import { rayBox } from './interaction.js';

const CELL = 0.5;
const BOUNDS = { x0: -34, x1: 32, z0: -50, z1: 8 };
const SAFE = new Set(['start', 'waiting', 'vestibule', 'elevator', 'stairs', 'room07', 'reflection', 'glass', 'vent', 'observation']);
const PATROL = [
  [0, -4], [0, -12], [0, -20], [-7, -8], [-14, -8], [-19, -5], [-22.5, -9], [-20, -13], [7, -8], [14, -8],
  [18, -5], [21, -11], [19, -17], [0, -27], [-6, -33], [6, -40], [0, -43], [-7, -46], [6, -46], [-4, -30],
];

class Grid {
  constructor(game) {
    this.game = game;
    this.w = Math.round((BOUNDS.x1 - BOUNDS.x0) / CELL);
    this.h = Math.round((BOUNDS.z1 - BOUNDS.z0) / CELL);
    this.cells = new Uint8Array(this.w * this.h); // 0 стена, 1 проход, 2 дверь
    this.doorAt = new Map();
    this.build();
  }

  idx(i, j) {
    return j * this.w + i;
  }

  toCell(x, z) {
    return [Math.floor((x - BOUNDS.x0) / CELL), Math.floor((z - BOUNDS.z0) / CELL)];
  }

  center(i, j) {
    return [BOUNDS.x0 + (i + 0.5) * CELL, BOUNDS.z0 + (j + 0.5) * CELL];
  }

  build() {
    const b = this.game.builder;
    const r = 0.2; // клетка 0.5 м; дверной проём 1 м должен оставаться проходимым
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const [x, z] = this.center(i, j);
        const zone = b.zoneAt(x, 1, z);
        if (!zone || zone.y0 > 0.5 || zone.y1 < 1 || SAFE.has(zone.memoryId) || zone.map == null) continue;
        let val = 1;
        for (const c of b.near(x - r, z - r, x + r, z + r)) {
          if (c.y1 <= 0.2 || c.y0 >= 1.8 || c.tag === 'crate') continue;
          const px = Math.max(c.x0, Math.min(x, c.x1));
          const pz = Math.max(c.z0, Math.min(z, c.z1));
          if ((x - px) ** 2 + (z - pz) ** 2 >= r * r) continue;
          if (c.tag === 'door' && c.doorRef) {
            val = 2;
            this.doorAt.set(this.idx(i, j), c.doorRef);
            continue;
          }
          if (!c.enabled) continue;
          val = 0;
          break;
        }
        this.cells[this.idx(i, j)] = val;
      }
    }
  }

  passable(i, j) {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return false;
    const k = this.idx(i, j);
    const v = this.cells[k];
    if (v === 2) {
      const d = this.doorAt.get(k);
      return !(d && this.game.world.door(d.id).locked);
    }
    return v === 1;
  }

  nearestPassable(i, j) {
    if (this.passable(i, j)) return [i, j];
    for (let r = 1; r < 6; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (this.passable(i + di, j + dj)) return [i + di, j + dj];
    }
    return null;
  }

  // A* по 8 направлениям; без срезания углов
  path(from, to) {
    const s = this.nearestPassable(...this.toCell(from.x, from.z));
    const t = this.nearestPassable(...this.toCell(to.x, to.z));
    if (!s || !t) return null;
    const W = this.w;
    const start = this.idx(...s);
    const goal = this.idx(...t);
    const g = new Float32Array(this.w * this.h).fill(Infinity);
    const came = new Int32Array(this.w * this.h).fill(-1);
    const closed = new Uint8Array(this.w * this.h);
    const heap = [[0, start]];
    g[start] = 0;
    const hfun = (k) => {
      const dx = Math.abs((k % W) - t[0]);
      const dz = Math.abs(Math.floor(k / W) - t[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const push = (f, k) => {
      heap.push([f, k]);
      let n = heap.length - 1;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (heap[p][0] <= heap[n][0]) break;
        [heap[p], heap[n]] = [heap[n], heap[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let n = 0;
        for (;;) {
          const l = n * 2 + 1;
          const r = l + 1;
          let m = n;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === n) break;
          [heap[m], heap[n]] = [heap[n], heap[m]];
          n = m;
        }
      }
      return top;
    };
    let steps = 0;
    while (heap.length && steps++ < 12000) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) break;
      const ci = k % W;
      const cj = Math.floor(k / W);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.passable(ni, nj)) continue;
          if (di && dj && (!this.passable(ci + di, cj) || !this.passable(ci, cj + dj))) continue;
          const nk = this.idx(ni, nj);
          const ng = g[k] + (di && dj ? 1.414 : 1);
          if (ng < g[nk]) {
            g[nk] = ng;
            came[nk] = k;
            push(ng + hfun(nk), nk);
          }
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return null;
    const cells = [];
    for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(k);
    cells.reverse();
    // сглаживание: пропускаем точки, если до следующей есть прямой проход
    const pts = cells.map((k) => this.center(k % W, Math.floor(k / W)));
    const out = [];
    let cur = [from.x, from.z];
    let i = 0;
    while (i < pts.length) {
      let far = i;
      for (let j = Math.min(pts.length - 1, i + 14); j > i; j--) {
        if (this.clearLine(cur, pts[j])) {
          far = j;
          break;
        }
      }
      out.push(pts[far]);
      cur = pts[far];
      i = far + 1;
    }
    return out;
  }

  clearLine(a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n;
      const z = a[1] + ((b[1] - a[1]) * s) / n;
      const [i, j] = this.toCell(x, z);
      if (!this.passable(i, j)) return false;
    }
    return true;
  }
}

export class Monster {
  constructor(game) {
    this.game = game;
    this.grid = new Grid(game);
    const c = makeCreature('monster');
    this.c = c;
    this.mesh = c.holder;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.state = game.world.get('monsterAwake') ? 'patrol' : 'dormant';
    this.pos = new THREE.Vector3(...this.spawnPoint());
    this.yaw = 0;
    this.path = [];
    this.repath = 0;
    this.target = null;
    this.lastSeen = null;
    this.seenAt = -99;
    this.timer = 0;
    this.stepTimer = 0;
    this.patrolIdx = Math.floor(Math.random() * PATROL.length);
    this.cool = 0;
    this.anim = null;
    this.fear = 0;
    this.time = 0;
    this.play('idle');
    game.bus.on('door:opened', (e) => this.hearDoor(e.id));
    game.bus.on('door:state', (e) => !e.open && this.hearDoor(e.id));
    // бутылка, крик и прочий шум
    game.bus.on('noise', (e) => {
      if (this.state === 'dormant' || this.state === 'chase' || Math.abs(e.y - this.pos.y) > 2) return;
      if (Math.hypot(e.x - this.pos.x, e.z - this.pos.z) < e.r) this.investigate(e.x, e.z);
    });
    if (this.state !== 'dormant') this.wake(true);
  }

  spawnPoint() {
    return [22.5, 0, -11];
  }

  play(name, speed = 1) {
    const a = this.c.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (this.anim === a) return;
    a.reset().fadeIn(0.25).play();
    if (this.anim) this.anim.fadeOut(0.25);
    this.anim = a;
  }

  // «Комплекс просыпается»: монстр появляется после первых шагов игрока.
  wake(silent = false) {
    const g = this.game;
    if (this.state === 'dormant') this.state = 'patrol';
    g.world.set('monsterAwake', true);
    this.mesh.visible = true;
    g.audio.addEmitter('monster', 'monster', this.pos.clone().setY(1.6), 1, 22);
    if (!silent) {
      g.audio.play('scream_far');
      g.fx.distort(0.9);
      g.mem.observe('monster_wake', 'Где-то за стенами что-то закричало. Голос не был человеческим. Теперь в коридорах слышны шаги — не мои.');
      g.ui.hint('Где-то далеко раздался крик.', 4);
      setTimeout(() => g.ui.hint('Надписи на стенах. Кто-то оставил их для меня?', 4), 6000);
    }
  }

  hearDoor(id) {
    if (this.state === 'dormant' || this.state === 'chase' || this.cool > 0) return;
    const d = this.game.level.doors[id];
    if (!d) return;
    const c = d.center();
    if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 11) this.investigate(c.x, c.z);
  }

  investigate(x, z) {
    if (this.state === 'chase') return;
    this.state = 'investigate';
    this.target = new THREE.Vector3(x, 0, z);
    this.repath = 0;
    this.timer = 0;
  }

  canSee() {
    const g = this.game;
    const p = g.player;
    if (p.hiddenIn) return false;
    const pp = p.pos;
    if (Math.abs(pp.y - this.pos.y) > 1.2) return false;
    const dx = pp.x - this.pos.x;
    const dz = pp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const range = g.flashlightOn ? 22 : 11;
    if (dist > range) return false;
    if (dist > 2.2) {
      const ang = Math.atan2(dx, dz) - this.yaw;
      const a = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(a) > 1.2 && !(g.flashlightOn && dist < 8)) return false;
    }
    return this.los(this.pos.x, 1.6, this.pos.z, pp.x, 1.5, pp.z);
  }

  los(x0, y0, z0, x1, y1, z1) {
    const from = new THREE.Vector3(x0, y0, z0);
    const to = new THREE.Vector3(x1, y1, z1);
    const dist = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    for (const c of this.game.builder.near(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1))) {
      if (!c.enabled || c.tag === 'prop' || c.tag === 'crate') continue;
      const t = rayBox(from, dir, c);
      if (t !== null && t < dist - 0.2) return false;
    }
    return true;
  }

  canHear() {
    const p = this.game.player;
    if (p.hiddenIn || !p.moving) return false;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (Math.abs(p.pos.y - this.pos.y) > 1.2) return false;
    return p.sprinting ? d < 13 : p.crouching ? d < 1.8 : d < 4;
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    if (this.state === 'dormant') {
      // просыпается, когда игрок выходит за пределы первых комнат и немного осваивается
      const t = g.mem.data.playTime;
      const explored = g.mem.visited('archive') || g.mem.visited('generator') || g.mem.visited('hall');
      if (explored && t > 150) this.wake();
      return;
    }
    if (this.cool > 0) this.cool -= dt;
    const p = g.player;
    const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const sees = this.cool <= 0 && this.canSee();
    if (sees) {
      if (this.state !== 'chase') {
        g.audio.play('stinger');
        g.audio.play('roar', this.pos.clone().setY(1.6));
        g.mem.count('monster_spotted');
        g.bus.emit('monster:spotted');
        if (g.mem.get('monster_spotted') === 1) g.mem.observe('monster_seen', 'Я его увидел. Высокий, слишком высокий. Он бежал ко мне так, будто знал, где я.');
      }
      this.state = 'chase';
      this.lastSeen = p.pos.clone();
      this.seenAt = this.time;
    } else if (this.cool <= 0 && this.state !== 'chase' && this.canHear()) {
      this.investigate(p.pos.x, p.pos.z);
    }

    // цель движения по состоянию
    let speed = 1.25;
    if (this.state === 'chase') {
      speed = 3.7;
      // видел, как игрок залез в шкаф — идёт прямо к шкафу
      if (p.hiddenIn && this.time - this.seenAt < 1.2) {
        this.target = p.hiddenIn.front.clone();
        this.knowsHiding = true;
      } else if (!sees) {
        if (this.time - this.seenAt > 1.5) {
          this.state = 'search';
          this.timer = 0;
          this.target = this.lastSeen ? this.lastSeen.clone() : null;
        } else this.target = this.lastSeen.clone();
      } else this.target = p.pos.clone();
      if (this.knowsHiding && p.hiddenIn && dist < 1.6) return g.onCaught(this, true);
      if (!p.hiddenIn && dist < 1.05 && Math.abs(p.pos.y - this.pos.y) < 1) return g.onCaught(this, false);
    } else if (this.state === 'investigate') {
      speed = 2.0;
    } else if (this.state === 'search') {
      speed = 1.6;
      this.timer += dt;
      if (this.timer > 9) {
        this.state = 'patrol';
        this.knowsHiding = false;
        this.target = null;
      }
    }
    if (this.state === 'patrol' && (!this.target || this.arrived())) {
      this.patrolIdx = (this.patrolIdx + 1 + Math.floor(Math.random() * 3)) % PATROL.length;
      const [x, z] = PATROL[this.patrolIdx];
      this.target = new THREE.Vector3(x, 0, z);
      this.repath = 0;
    }
    if ((this.state === 'investigate' || this.state === 'search') && this.target && this.arrived()) {
      // постоять, «прислушаться»
      this.timer += dt;
      this.play('idle', 0.6);
      this.c.root.rotation.y = Math.sin(this.time * 1.7) * 0.6;
      if (this.timer > 3.5) {
        this.state = 'patrol';
        this.target = null;
        this.c.root.rotation.y = 0;
      }
      this.after(dt);
      return;
    }

    // путь
    this.repath -= dt;
    if (this.target && (this.repath <= 0 || !this.path.length)) {
      this.repath = this.state === 'chase' ? 0.35 : 1.5;
      this.path = this.grid.path(this.pos, this.target) || [];
      if (!this.path.length && this.state === 'chase') {
        // цель недостижима (безопасная комната) — бросает погоню
        this.state = 'search';
        this.timer = 4;
      }
    }
    this.moveAlong(dt, speed);
    this.after(dt);
  }

  arrived() {
    return !this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.7;
  }

  moveAlong(dt, speed) {
    this.c.root.rotation.y = 0;
    if (!this.path.length) {
      this.play('idle', 0.7);
      return;
    }
    const [tx, tz] = this.path[0];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      this.path.shift();
      return;
    }
    // дверь на пути — открыть
    const door = this.doorAhead(dx / d, dz / d);
    if (door) {
      this.play('idle', 0.5);
      this.doorWait = (this.doorWait || 0) + dt;
      if (this.doorWait > (this.state === 'chase' ? 0.25 : 0.8)) {
        this.doorWait = 0;
        this.game.world.setDoor(door.id, { open: true });
        this.game.audio.play('door_slam', door.center());
      }
      return;
    }
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 8);
    this.play(speed > 2.5 ? 'run' : 'walk', speed > 2.5 ? 1.15 : speed / 1.25 * 0.9);
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = speed > 2.5 ? 0.3 : 0.62;
      this.game.audio.play('monster_step', this.pos.clone().setY(0.1));
    }
  }

  doorAhead(nx, nz) {
    const x = this.pos.x + nx * 0.7;
    const z = this.pos.z + nz * 0.7;
    for (const c of this.game.builder.near(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) {
      if (c.tag !== 'door' || !c.enabled || !c.doorRef) continue;
      if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) {
        const st = this.game.world.door(c.doorRef.id);
        if (!st.locked && !st.open) return c.doorRef;
      }
    }
    return null;
  }

  // анимация, рывки головы, звук, «страх» игрока
  after(dt) {
    const g = this.game;
    this.c.mixer.update(dt);
    if (this.c.head) {
      const tw = Math.sin(this.time * 23) * Math.sin(this.time * 3.1);
      this.c.head.rotation.z += tw > 0.92 ? 0.5 : 0;
      this.c.head.rotation.x += Math.sin(this.time * 1.3) * 0.15;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    g.audio.setEmitterPos('monster', this.pos.x, 1.6, this.pos.z);
    g.audio.setEmitter('monster', true, this.state === 'chase' ? 1.4 : 0.8);
    const p = g.player.pos;
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const sameLevel = Math.abs(p.y - this.pos.y) < 1.5;
    let target = 0;
    if (sameLevel) {
      if (this.state === 'chase') target = Math.max(0.45, 1 - dist / 18);
      else if (dist < 12) target = (1 - dist / 12) * 0.6;
    }
    this.fear += (target - this.fear) * Math.min(1, dt * 2);
  }

  // после поимки — уходит в дальний угол и какое-то время не охотится
  retreat() {
    const p = this.game.player.pos;
    let best = PATROL[0];
    let bd = -1;
    for (const pt of PATROL) {
      const d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
      if (d > bd) {
        bd = d;
        best = pt;
      }
    }
    this.pos.set(best[0], 0, best[1]);
    this.state = 'patrol';
    this.target = null;
    this.path = [];
    this.cool = 25;
    this.knowsHiding = false;
  }

  save() {
    return { x: this.pos.x, z: this.pos.z };
  }
}
