// Скримеры и атмосферные события. Каждое срабатывает один раз (запоминается в мире) и только
// при своих условиях — это не случайные «бу», а события, привязанные к местам и состоянию мира.
// Скримеры можно выключить в настройках (settings.scares = false), фоновые звуки останутся.

import * as THREE from 'three';
import { makeCreature } from '../world/models.js';
import { SEW, BAL, POOL } from '../world/consts.js';

const AMBIENT = ['bang', 'groan', 'steps_above', 'chain', 'scream_far', 'pipe_knock'];

export class Scares {
  constructor(game) {
    this.game = game;
    game.world.data.vars.scaresDone ||= {};
    this.done = game.world.data.vars.scaresDone;
    this.check = 0;
    this.ambientTimer = 25;
    this.app = null;
    this.events = [];
    this.mirrorGaze = 0;
  }

  get on() {
    return this.game.settings.scares !== false;
  }

  mark(id) {
    this.done[id] = true;
  }

  // Существо-видение (одна модель на все скримеры).
  creature() {
    if (!this.app) {
      this.app = makeCreature('monster');
      this.app.mat.emissive.setHex(0x200303);
      this.app.holder.visible = false;
      this.game.scene.add(this.app.holder);
      const run = this.app.actions.run || Object.values(this.app.actions)[0];
      if (run) run.play();
    }
    return this.app;
  }

  showApparition(x, y, z, yaw, dur, { lunge = false } = {}) {
    const a = this.creature();
    a.holder.position.set(x, y, z);
    a.holder.rotation.y = yaw;
    a.holder.visible = true;
    this.events.push({ t: 0, dur, kind: 'app', lunge });
  }

  // Скример «в лицо»: существо вплотную, визг, вспышка, тряска.
  jumpscare(strength = 1) {
    const g = this.game;
    if (!this.on) return;
    const a = this.creature();
    const cam = g.camera;
    const dir = g.player.forward();
    a.holder.position.copy(cam.position).addScaledVector(dir, 0.75);
    a.holder.position.y -= 1.95;
    a.holder.rotation.y = Math.atan2(-dir.x, -dir.z);
    a.holder.visible = true;
    a.mat.emissiveIntensity = 2.2;
    g.audio.play('screech');
    g.fx.distort(1);
    if (g.post) g.post.hit = 0.8 * strength;
    this.events.push({ t: 0, dur: 0.5, kind: 'jump' });
    g.mem.count('jumpscares');
  }

  endApparition() {
    if (!this.app) return;
    this.app.holder.visible = false;
    this.app.mat.emissiveIntensity = 0.4;
  }

  update(dt) {
    const g = this.game;
    // активные события
    for (const e of this.events) {
      e.t += dt;
      if (this.app) this.app.mixer.update(dt);
      if (e.kind === 'jump') {
        g.player.roll = Math.sin(e.t * 60) * 0.04;
        if (g.post) g.post.hit = Math.max(0, g.post.hit - dt * 1.5);
      }
      if (e.kind === 'swim' && this.swimMesh) {
        const k = Math.min(1, e.t / e.dur);
        this.swimMesh.position.set(-11 + k * 22, POOL - 0.45 + Math.sin(k * Math.PI) * 0.25, e.z + Math.sin(k * 6) * 0.4);
        this.swimMesh.rotation.y = Math.sin(k * 6) * 0.15;
        if (k >= 1) this.swimMesh.visible = false;
      }
      if (e.kind === 'app' && e.lunge && this.app) {
        const cam = g.camera.position;
        const h = this.app.holder.position;
        const to = new THREE.Vector3(cam.x - h.x, 0, cam.z - h.z);
        if (to.length() > 0.9) h.addScaledVector(to.normalize(), dt * 7);
        else if (!e.jumped) {
          e.jumped = true;
          this.jumpscare(0.8);
          e.dur = e.t + 0.45;
        }
      }
      if (e.t >= e.dur) {
        e.dead = true;
        g.player.roll = 0;
        this.endApparition();
      }
    }
    this.events = this.events.filter((e) => !e.dead);

    this.ambient(dt);
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 0.2;
    if (!this.on) return;
    const z = g.currentZone ? g.currentZone.id : '';
    const p = g.player.pos;
    const awake = !!g.world.get('monsterAwake');
    const d = this.done;

    // 1. Коридор: свет гаснет, а когда загорается — Оно прямо перед тобой.
    if (!d.blackout && awake && z === 'corridor' && p.x > 14.5 && p.z < -12 && p.z > -26 && g.monster.state !== 'chase' && !g.monster.dead) {
      this.mark('blackout');
      g.level.blackout = 'corridor';
      g.level.refreshLights();
      g.audio.play('power_down');
      setTimeout(() => g.audio.play('whisper', new THREE.Vector3(p.x, 1.6, p.z - 2)), 600);
      setTimeout(() => {
        g.level.blackout = null;
        g.level.refreshLights();
        const f = g.player.forward();
        this.showApparition(g.player.pos.x + f.x * 3.2, 0, g.player.pos.z + f.z * 3.2, Math.atan2(-f.x, -f.z), 0.55);
        g.audio.play('screech');
        g.fx.distort(0.9);
        if (g.post) g.post.hit = 0.5;
        this.events.push({ t: 0, dur: 0.6, kind: 'jump' });
      }, 2400);
      return;
    }
    // 2. Зеркало в палате: за спиной стоит Оно.
    if (!d.mirror && z === 'start' && (awake || g.mem.get('deaths') > 0)) {
      const ms = g.level.mirrorSpot;
      const to = new THREE.Vector3(ms.x - g.camera.position.x, ms.y - g.camera.position.y, ms.z - g.camera.position.z);
      const dist = to.length();
      const look = g.player.forward().dot(to.normalize());
      if (dist < 2.2 && look > 0.8) this.mirrorGaze += 0.2;
      else this.mirrorGaze = 0;
      if (this.mirrorGaze > 0.8) {
        this.mark('mirror');
        const f = g.player.forward();
        this.showApparition(p.x - f.x * 1.1, 0, p.z - f.z * 1.1, Math.atan2(f.x, f.z), 0.9);
        g.audio.play('stinger');
        g.mem.observe('mirror', 'В зеркале за моей спиной кто-то стоял. Когда я обернулся — никого. Зеркало треснуло ещё до меня?');
      }
    }
    // 3. Вентиляция: навстречу по шахте бросается лицо.
    if (!d.vent && z === 'vent2' && p.z < -36 && p.z > -40) {
      this.mark('vent');
      this.showApparition(-20, 3.9, -46.6, 0, 3, { lunge: true });
      this.app.holder.scale.set(0.7, 0.55, 0.7);
      setTimeout(() => this.app && this.app.holder.scale.set(1, 1, 1), 3200);
      return;
    }
    // 4. Восточное крыло: с потолка падает тело.
    if (!d.body && awake && z === 'east' && Math.hypot(p.x - 23.5, p.z + 8.2) < 4.5) {
      this.mark('body');
      g.level.horror.hangingBody.visible = true;
      g.level.horror.hangT = 0;
      g.audio.play('body_drop', new THREE.Vector3(23.5, 2, -8.2));
      g.audio.play('stinger');
      g.fx.distort(0.6);
      g.mem.observe('hanged', 'Из дыры в потолке выпало тело на верёвке. Халат. Бейдж: «Громов».');
      return;
    }
    // 5. Атриум: с балкона кто-то смотрит вниз.
    if (!d.balcony && awake && z === 'hall' && p.y < 1 && p.z < -45) {
      this.mark('balcony');
      this.showApparition(-3, BAL, -58.9, Math.atan2(p.x + 3, p.z + 58.9), 2.6);
      g.audio.play('groan', new THREE.Vector3(-3, BAL + 1.5, -58.9));
      return;
    }
    // 7. Мост к башне: под водой проплывает что-то большое.
    if (!d.swimmer && z === 'corridor' && Math.abs(p.x) < 1.3 && p.z < -5 && p.z > -11) {
      this.mark('swimmer');
      if (!this.swimMesh) {
        this.swimMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3.2, 6, 12), new THREE.MeshStandardMaterial({ color: 0x050807, roughness: 0.4, transparent: true, opacity: 0.85 }));
        this.swimMesh.rotation.z = Math.PI / 2;
        g.scene.add(this.swimMesh);
      }
      this.swimMesh.visible = true;
      this.events.push({ t: 0, dur: 3.2, kind: 'swim', z: p.z - 1.5 });
      g.audio.play('splash', new THREE.Vector3(-4, POOL, p.z - 1.5));
      setTimeout(() => g.audio.play('splash', new THREE.Vector3(5, POOL, p.z - 1.5)), 1800);
      g.fx.distort(0.35);
      g.mem.observe('swimmer', 'Под мостом в воде проплыло что-то длинное и тёмное. Больше человека. Вода сомкнулась без кругов.');
      return;
    }
    // 8. Изолятор: в окне на тебя смотрит Оно.
    if (!d.window && awake && z === 'start' && !g.monster.dead) {
      const to = new THREE.Vector3(-1.8 - g.camera.position.x, 1.55 - g.camera.position.y, 0 - g.camera.position.z);
      const dist = to.length();
      const look = g.player.forward().dot(to.normalize());
      this.windowGaze = dist < 5 && look > 0.9 ? (this.windowGaze || 0) + 0.2 : 0;
      if (this.windowGaze > 0.6) {
        this.mark('window');
        this.showApparition(-1.8, 0, -1.0, Math.PI, 1.0);
        g.audio.play('stinger');
        g.fx.distort(0.5);
        g.mem.observe('window', 'В окне изолятора, на мостках, стояло Оно и смотрело на меня. Секунду. Потом его не стало.');
      }
    }
    // 6. Канал: в воде что-то плеснуло рядом.
    if (!d.splash && z === 'canal' && p.x > 42) {
      this.mark('splash');
      g.audio.play('splash', new THREE.Vector3(p.x + 3, SEW - 1, -15));
      g.fx.distort(0.4);
    }
  }

  // фоновые звуки: стуки труб, шаги над головой, далёкие крики
  ambient(dt) {
    const g = this.game;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 18 + Math.random() * 30;
    const z = g.currentZone ? g.currentZone.id : '';
    if (z === 'void' || z === 'outside') return;
    const kind = AMBIENT[Math.floor(Math.random() * AMBIENT.length)];
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 10;
    const p = g.player.pos;
    g.audio.play(kind, new THREE.Vector3(p.x + Math.cos(a) * r, p.y + (kind === 'steps_above' ? 4 : 1.5), p.z + Math.sin(a) * r));
  }
}
