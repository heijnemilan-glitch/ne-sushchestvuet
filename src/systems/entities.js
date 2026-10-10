// EntityAI — сущности с собственной логикой состояний.
//
// НАБЛЮДАТЕЛЬ: dormant → (условие) → manifest → (взгляд/приближение/свет/время) → vanishing → cooldown
//   • Появляется ТОЛЬКО по условиям: игрок стоит неподвижно в темноте (фонарь выключен) ≥ 8 с;
//     игрок открыл новое правило; игрок много раз возвращается в знакомые комнаты; включено питание.
//   • Всегда стоит вдалеке, в боковом поле зрения, и всегда лицом к ближайшему нераскрытому секрету.
//   • Никогда не нападает. Если на него посмотреть — исчезает, и в одной из уже посещённых комнат что-то меняется.
//
// КОПИЯ (эхо): absent → echo (после кнопки «ЗАПИСЬ») → dissolve
//   • Повторяет путь игрока с задержкой 10 с, нажимает те же выключатели, давит на плиты.
//   • residue: после загрузки сохранения Копия может однажды пройти маршрутом, которым игрок
//     шёл в прошлый раз (берётся из сохранённой истории).

import * as THREE from 'three';
import { rayBox } from './interaction.js';
import { makeCreature } from '../world/models.js';

// Настоящая 3D-модель со скелетом (см. world/models.js). userData.head — кость головы.
function creature(kind) {
  const c = makeCreature(kind);
  c.holder.userData.head = c.head || new THREE.Object3D();
  c.holder.userData.legs = [new THREE.Object3D(), new THREE.Object3D()];
  c.holder.userData.c = c;
  return c;
}

export class Observer {
  constructor(game) {
    this.game = game;
    this.c = creature('observer');
    this.mat = this.c.mat;
    this.mesh = this.c.holder;
    // стоит почти неподвижно: замедленная поза ожидания
    const idle = this.c.actions.idle || Object.values(this.c.actions)[0];
    if (idle) {
      idle.play();
      idle.timeScale = 0.12;
    }
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.state = 'dormant';
    this.t = 0;
    this.cooldown = 40;
    this.gaze = 0;
    this.pending = [];
    this.tension = 0;
    this.cause = null;
    const bus = game.bus;
    bus.on('rule:discovered', () => this.pending.push('rule'));
    bus.on('power:on', () => this.pending.push('power'));
    bus.on('room:enter', (e) => {
      if (e.visits >= 3) this.tension += 1;
      if (this.tension >= 6) {
        this.tension = 0;
        this.pending.push('revisit');
      }
    });
  }

  update(dt) {
    const g = this.game;
    const zone = g.currentZone;
    if (this.mesh.visible) this.c.mixer.update(dt);
    if (zone && zone.id === 'void') return this.updateVoid(dt);
    if (this.state === 'void') this.hide();
    this.cooldown -= dt;
    if (this.state === 'dormant') {
      if (this.cooldown > 0 || !zone || zone.id.startsWith('lift')) return;
      const still = g.player.stillTime > 8 && !g.flashlightOn;
      const cause = still ? 'still' : this.pending[0];
      if (!cause) return;
      if (this.manifest(cause)) {
        if (!still) this.pending.shift();
        else g.player.stillTime = 0;
      } else if (still) g.player.stillTime = 4; // подождём и попробуем снова
      return;
    }
    if (this.state === 'manifest') {
      this.t += dt;
      const eye = g.player.eye();
      const target = this.mesh.position.clone();
      target.y += 1.7;
      const to = target.clone().sub(eye);
      const dist = to.length();
      to.normalize();
      const fwd = g.player.forward();
      const angle = Math.acos(Math.min(1, Math.max(-1, fwd.dot(to))));
      const visible = this.lineOfSight(eye, target, dist);
      if (visible && angle < 0.12) this.gaze += dt;
      const lit = g.flashlightOn && visible && angle < 0.2 && dist < 16;
      // голова медленно поворачивается к игроку, но тело — к секрету
      const head = this.mesh.userData.head;
      head.rotation.y = this.t > 3 ? Math.min(0.7, (this.t - 3) * 0.25) : 0;
      head.rotation.z = Math.sin(this.t * 0.7) * 0.12;
      if (this.gaze > 0.9 || lit || dist < 6.5) this.vanish(true);
      else if (this.t > 24) this.vanish(false);
      return;
    }
    if (this.state === 'vanishing') {
      this.t += dt;
      this.mat.opacity = Math.max(0, 1 - this.t / 1.1);
      this.mesh.scale.y = 1 + this.t * 0.06;
      if (this.t > 1.1) this.hide();
    }
  }

  lineOfSight(from, to, dist) {
    const dir = to.clone().sub(from).normalize();
    for (const c of this.game.builder.near(Math.min(from.x, to.x), Math.min(from.z, to.z), Math.max(from.x, to.x), Math.max(from.z, to.z))) {
      if (!c.enabled || c.tag === 'glass' || c.tag === 'prop' || c.tag === 'crate') continue;
      const t = rayBox(from, dir, c);
      if (t !== null && t < dist - 0.3) return false;
    }
    return true;
  }

  // Найти точку появления: вдалеке, в зоне видимости, но не в центре взгляда.
  manifest(cause) {
    const g = this.game;
    const eye = g.player.eye();
    const fwd = g.player.forward();
    fwd.y = 0;
    fwd.normalize();
    let best = null;
    for (const a of g.level.observerAnchors) {
      const p = new THREE.Vector3(a.x, a.y + 1.7, a.z);
      if (Math.abs(a.y - g.player.pos.y) > 2) continue;
      const to = p.clone().sub(eye);
      const d = Math.hypot(to.x, to.z);
      if (d < 9 || d > 28) continue;
      to.y = 0;
      to.normalize();
      const ang = Math.acos(Math.min(1, fwd.dot(to)));
      if (ang > 0.95) continue; // за спиной — не появляется
      if (!this.lineOfSight(eye, p, d)) continue;
      const score = Math.abs(ang - 0.45) + d * 0.01;
      if (!best || score < best.score) best = { a, score };
    }
    if (!best) return false;
    const a = best.a;
    this.mesh.position.set(a.x, a.y, a.z);
    // лицом к ближайшему нераскрытому секрету (подсказка, которую можно заметить)
    const targets = g.level.secretTargets();
    let face = null;
    let fd = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      if (d < fd) {
        fd = d;
        face = t;
      }
    }
    if (face) this.mesh.rotation.y = Math.atan2(face.x - a.x, face.z - a.z);
    else this.mesh.rotation.y = Math.atan2(eye.x - a.x, eye.z - a.z);
    this.mesh.userData.head.rotation.y = 0;
    this.mesh.scale.y = 1;
    this.mat.opacity = 1;
    this.mesh.visible = true;
    this.state = 'manifest';
    this.t = 0;
    this.gaze = 0;
    this.cause = cause;
    g.audio.play('observer', this.mesh.position);
    g.audio.duck(0.35, 5);
    g.mem.seeEvent('observer_manifest');
    g.bus.emit('observer:manifest', { cause, at: a });
    return true;
  }

  vanish(seen) {
    const g = this.game;
    this.state = 'vanishing';
    this.t = 0;
    g.audio.play('observer_vanish', this.mesh.position);
    let shift = null;
    if (seen) {
      const n = g.mem.count('observer_seen');
      shift = g.level.applyShift();
      if (n === 1) g.mem.observe('observer_1', 'В конце коридора стоял человек. Высокий. Когда я посмотрел прямо — его не стало.');
      if (shift) g.mem.observe(`shift_${n}`, 'Мне кажется, в одной из комнат, где я уже был, что-то сдвинулось.');
      g.fx.distort(0.8);
    }
    this.cooldown = seen ? 70 : 45;
    g.bus.emit('observer:vanish', { seen, shift });
  }

  hide() {
    this.mesh.visible = false;
    this.state = 'dormant';
  }

  // На этаже Ø он просто стоит. Подойти к нему нельзя — он отступает.
  updateVoid(dt) {
    const g = this.game;
    const a = g.level.voidAnchor;
    if (this.state !== 'void') {
      this.state = 'void';
      this.mesh.position.set(a.x, 0, a.z);
      this.mesh.visible = true;
      this.mat.opacity = 1;
      this.mesh.scale.y = 1;
      if (!g.mem.has('void_observer')) {
        g.mem.flag('void_observer');
        g.mem.count('observer_seen');
      }
    }
    const p = g.player.pos;
    const d = Math.hypot(p.x - this.mesh.position.x, p.z - this.mesh.position.z);
    if (d < 4.5) {
      const dx = (this.mesh.position.x - p.x) / d;
      const dz = (this.mesh.position.z - p.z) / d;
      this.mesh.position.x = Math.max(-9, Math.min(9, this.mesh.position.x + dx * dt * 2));
      this.mesh.position.z = Math.max(101, Math.min(119, this.mesh.position.z + dz * dt * 2));
    }
    this.mesh.rotation.y = Math.atan2(p.x - this.mesh.position.x, p.z - this.mesh.position.z);
  }
}

export class Copy {
  constructor(game) {
    this.game = game;
    this.c = creature('copy');
    this.mat = this.c.mat;
    this.mesh = this.c.holder;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.state = 'absent';
    this.delay = 10;
    this.duration = 120;
    this.samples = [];
    this.actions = [];
    this.clock = 0;
    this.sampleTimer = 0;
    this.walk = 0;
    game.bus.on('interact:copyable', (e) => {
      if (this.state === 'echo') this.actions.push({ t: this.clock, id: e.id, done: false });
    });
  }

  startEcho() {
    const g = this.game;
    if (this.state === 'echo') return;
    this.state = 'echo';
    this.clock = 0;
    this.samples = [];
    this.actions = [];
    this.appeared = false;
    g.level.recLampMat.color.setHex(0x40ff80);
    g.audio.play('beep_ok');
    g.ui.hint('Запись пошла. Где-то рядом щёлкнуло реле.');
    g.bus.emit('echo:start');
    g.mem.seeEvent('echo');
  }

  // Следы прошлой сессии: Копия однажды пройдёт ими после загрузки.
  prepareResidue(trail) {
    if (!trail || trail.length < 20) return;
    const last = trail.slice(-60);
    const t0 = last[0].t;
    this.residue = last.map((s) => ({ t: s.t - t0, x: s.x, y: s.y, z: s.z }));
    this.residueWait = 25;
  }

  body() {
    if (!this.mesh.visible) return null;
    return this.mesh.position;
  }

  inZone(id) {
    if (!this.mesh.visible) return false;
    const z = this.game.builder.zoneAt(this.mesh.position.x, this.mesh.position.y + 0.5, this.mesh.position.z);
    return !!z && z.id === id;
  }

  sampleAt(time) {
    const s = this.samples;
    if (!s.length) return null;
    // бинарный поиск
    let lo = 0;
    let hi = s.length - 1;
    if (time <= s[0].t) return s[0];
    if (time >= s[hi].t) return s[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t <= time) lo = mid;
      else hi = mid;
    }
    const a = s[lo];
    const b = s[hi];
    // большой скачок — портал: без интерполяции
    if (Math.hypot(b.x - a.x, b.z - a.z) > 3) return a;
    const k = (time - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw };
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'echo') {
      this.clock += dt;
      this.sampleTimer -= dt;
      if (this.sampleTimer <= 0) {
        this.sampleTimer = 0.1;
        const p = g.player.pos;
        this.samples.push({ t: this.clock, x: p.x, y: p.y, z: p.z, yaw: g.player.yaw });
      }
      const rt = this.clock - this.delay;
      if (rt >= 0) {
        if (!this.appeared) {
          this.appeared = true;
          this.mesh.visible = true;
          this.mat.opacity = 0;
          g.audio.play('copy', this.mesh.position);
          g.bus.emit('copy:appear', { source: 'echo' });
          g.mem.observe('copy_first', 'Из эхо-камеры вышел кто-то. Он идёт моим путём. Он опаздывает ровно настолько, насколько написано на пульте.');
        }
        const s = this.sampleAt(rt);
        this.place(s, dt);
        for (const a of this.actions) {
          if (!a.done && a.t <= rt) {
            a.done = true;
            const obj = g.interaction.objects.find((o) => o.id === a.id);
            if (obj && obj.copyable) obj.interact(true);
          }
        }
        this.mat.opacity = Math.min(0.38, this.mat.opacity + dt * 0.4);
      }
      if (this.clock > this.duration + this.delay) this.dissolve();
      return;
    }
    if (this.state === 'dissolve') {
      this.mat.opacity -= dt * 0.25;
      if (this.mat.opacity <= 0) {
        this.mesh.visible = false;
        this.state = 'absent';
      }
      return;
    }
    if (this.state === 'absent' && this.residue) {
      this.residueWait -= dt;
      const first = this.residue[0];
      const p = g.player.pos;
      if (this.residueWait <= 0 && Math.hypot(p.x - first.x, p.z - first.z) < 18 && Math.abs(p.y - first.y) < 2) {
        this.state = 'residue';
        this.clock = 0;
        this.samples = this.residue.map((s) => ({ ...s, yaw: 0 }));
        this.residue = null;
        this.mesh.visible = true;
        this.mat.opacity = 0;
        g.audio.play('copy', new THREE.Vector3(first.x, first.y + 1, first.z));
        g.bus.emit('copy:appear', { source: 'residue' });
        g.mem.observe('copy_residue', 'Кто-то прошёл моим маршрутом. Тем самым, которым я шёл в прошлый раз, перед тем как уйти.');
      }
      return;
    }
    if (this.state === 'residue') {
      this.clock += dt;
      this.place(this.sampleAt(this.clock), dt);
      this.mat.opacity = Math.min(0.3, this.mat.opacity + dt * 0.3);
      if (this.clock > this.samples[this.samples.length - 1].t) this.dissolve();
    }
  }

  place(s, dt) {
    if (!s) return;
    const prev = this.mesh.position.clone();
    this.mesh.position.set(s.x, s.y, s.z);
    const moved = Math.hypot(s.x - prev.x, s.z - prev.z);
    if (moved > 0.001 && moved < 1) this.mesh.rotation.y = Math.atan2(s.x - prev.x, s.z - prev.z);
    this.walk += moved * 5;
    // анимация шага по скорости движения
    const speed = dt > 0 ? moved / dt : 0;
    const want = speed > 0.3 ? (speed > 3 ? 'run' : 'walk') : 'idle';
    const a = this.c.actions[want];
    if (a && this.curAnim !== a) {
      a.reset().fadeIn(0.2).play();
      if (this.curAnim) this.curAnim.fadeOut(0.2);
      this.curAnim = a;
    }
    this.c.mixer.update(dt);
  }

  dissolve() {
    this.state = 'dissolve';
    if (this.game.level.recLampMat) this.game.level.recLampMat.color.setHex(0xff3020);
  }
}

export class Entities {
  constructor(game) {
    this.observer = new Observer(game);
    this.copy = new Copy(game);
  }

  update(dt) {
    this.observer.update(dt);
    this.copy.update(dt);
  }
}
