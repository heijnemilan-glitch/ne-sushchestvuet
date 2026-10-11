// SurvivalSystem — всё, что держит игрока в напряжении:
//  • фонарь садится (≈5 мин), под конец мигает; [R] — новая батарейка
//  • выносливость: бег её тратит, без неё не побежишь; [Q] — стимулятор (25 с быстрого бега без усталости)
//  • [T] — бросить бутылку: звон стекла отвлекает Оно
//  • ядовитый газ в канализации: без противогаза с фильтром — кашель, потом обморок; [M] — противогаз
//  • лестницы: анимация подъёма/спуска

import * as THREE from 'three';
import { clamp } from '../core/util.js';

const BATTERY_DRAIN = 0.34; // %/с
const FILTER_TIME = 90; // секунд на фильтр
const TOX_MAX = 8; // секунд в газе без защиты до обморока

export class SurvivalSystem {
  constructor(game) {
    this.game = game;
    this.stamina = 100;
    this.exhausted = false;
    this.restTimer = 0;
    this.stimTime = 0;
    this.toxicity = 0;
    this.coughTimer = 0;
    this.breathTimer = 0;
    this.climbing = null;
    this.bottles = [];
    this.shards = [];
    this.inGas = false;
    const w = game.world;
    if (w.get('battery') === undefined) w.data.vars.battery = 100;
    if (w.get('filterTime') === undefined) w.data.vars.filterTime = 0;
    game.bus.on('item:pickup', (e) => {
      if (e.id === 'gasmask') {
        w.data.vars.filterTime = FILTER_TIME;
        game.ui.hint('Противогаз. Фильтр внутри почти новый. В газе он наденется сам; [M] — надеть или снять.', 6);
      }
      if (e.id === 'flashlight') game.ui.hint('Фонарь: [F]. Батарейки садятся — запасные ищи по комплексу, [R] — заменить.', 6);
    });
    game.bus.on('supply:pickup', (e) => {
      const tips = {
        stim: 'Стимулятор: [Q] — быстрый бег без усталости.',
        bottle: 'Бутылка: [T] — бросить. Оно пойдёт на звук.',
        battery: 'Батарейка: [R] — заменить севшую.',
        filter: 'Фильтр для противогаза. Меняется сам, когда старый забьётся.',
      };
      if (game.mem.count(`tip_${e.kind}`) === 1) game.ui.hint(tips[e.kind], 4);
    });
  }

  get busy() {
    return !!this.climbing;
  }

  get battery() {
    return this.game.world.get('battery', 100);
  }

  get maskOn() {
    return !!this.game.world.get('maskOn') && this.game.inv.has('gasmask');
  }

  // ── бег ────────────────────────────────────────────────────────────────────
  canSprint() {
    return this.stimTime > 0 || (!this.exhausted && this.stamina > 0);
  }

  get speedMul() {
    return this.stimTime > 0 ? 1.35 : 1;
  }

  // ── действия ───────────────────────────────────────────────────────────────
  swapBattery() {
    const g = this.game;
    if (!g.inv.has('flashlight')) return;
    if (g.inv.count('battery') <= 0) return g.ui.hint('Запасных батареек нет.');
    if (this.battery > 90) return g.ui.hint('Батарейка ещё почти полная.');
    g.inv.addCount('battery', -1);
    g.world.data.vars.battery = 100;
    g.audio.play('battery');
    g.ui.toast(`Батарейка заменена. Осталось запасных: ${g.inv.count('battery')}`);
  }

  useStim() {
    const g = this.game;
    if (g.inv.count('stim') <= 0) return g.ui.hint('Стимуляторов нет.');
    g.inv.addCount('stim', -1);
    this.stimTime = 25;
    this.stamina = 100;
    this.exhausted = false;
    g.audio.play('stim');
    g.fx.distort(0.6);
    g.ui.toast('Сердце колотится. 25 секунд — беги.');
    g.mem.count('stims_used');
  }

  throwBottle() {
    const g = this.game;
    if (g.inv.count('bottle') <= 0) return g.ui.hint('Бутылок нет.');
    g.inv.addCount('bottle', -1);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.1, transparent: true, opacity: 0.8 }));
    const dir = g.player.forward();
    mesh.position.copy(g.camera.position).addScaledVector(dir, 0.4);
    g.scene.add(mesh);
    this.bottles.push({ mesh, v: dir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3, 0)), spin: new THREE.Vector3(8, 3, 5) });
    g.audio.play('throw');
  }

  toggleMask() {
    const g = this.game;
    if (!g.inv.has('gasmask')) return g.ui.hint('Противогаза нет.');
    g.world.set('maskOn', !g.world.get('maskOn'));
    g.audio.play('mask');
  }

  // ── лестницы ───────────────────────────────────────────────────────────────
  climb(dest, dir) {
    const g = this.game;
    if (this.climbing) return;
    if (g.player.hiddenIn) return;
    const from = g.player.pos.clone();
    this.climbing = { t: 0, dur: 2.4, from, dest, dir, yaw: g.player.yaw };
    g.audio.play('ladder');
    g.ui.fadeSoft(true);
  }

  updateClimb(dt) {
    const c = this.climbing;
    const g = this.game;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const p = g.player;
    // первая половина — по лестнице в темноте, вторая — уже на месте
    if (k < 0.5) {
      p.pos.y = c.from.y + (c.dir === 'down' ? -1 : 1) * k * 2.4;
      p.pitch = c.dir === 'down' ? -0.9 : 0.9;
    } else if (!c.moved) {
      c.moved = true;
      p.setPose({ x: c.dest.x, y: c.dest.y + (c.dir === 'down' ? 1.2 : -1.2), z: c.dest.z, yaw: c.dest.yaw, pitch: c.dir === 'down' ? 0.9 : -0.9 });
      g.audio.play('ladder');
      g.level.cull(p.pos);
      g.lightPool.assign(p.pos);
    } else {
      const kk = (k - 0.5) * 2;
      p.pos.y = c.dest.y + (c.dir === 'down' ? 1.2 : -1.2) * (1 - kk);
      p.pitch *= 0.9;
    }
    p.roll = Math.sin(c.t * 9) * 0.02;
    p.bob += dt * 4;
    p.applyCamera(dt);
    if (k >= 1) {
      p.pos.y = c.dest.y;
      p.roll = 0;
      this.climbing = null;
      g.ui.fadeSoft(false);
      g.updateZone(false);
    }
  }

  // ── кадр ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    if (this.climbing) this.updateClimb(dt);
    // фонарь
    if (g.flashlightOn && g.inv.has('flashlight')) {
      w.data.vars.battery = Math.max(0, this.battery - BATTERY_DRAIN * dt);
      if (this.battery <= 0) {
        g.flashlightOn = false;
        g.audio.play('flashlight');
        g.ui.hint(g.inv.count('battery') ? 'Фонарь сел. [R] — заменить батарейку.' : 'Фонарь сел. Батареек нет.', 4);
      }
    }
    // выносливость
    if (this.stimTime > 0) {
      this.stimTime -= dt;
      if (this.stimTime <= 0) g.ui.hint('Действие стимулятора закончилось. Руки дрожат.', 3);
    }
    if (p.sprinting && this.stimTime <= 0) {
      this.stamina = Math.max(0, this.stamina - 19 * dt);
      this.restTimer = 0.9;
      if (this.stamina <= 0) {
        this.exhausted = true;
        g.audio.play('pant');
      }
    } else {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.stamina = Math.min(100, this.stamina + 15 * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    // газ
    const pos = p.pos;
    this.inGas = g.level.gasZones.some((z) => pos.x > z.x0 && pos.x < z.x1 && pos.z > z.z0 && pos.z < z.z1 && pos.y > z.y0 && pos.y < z.y1);
    const hasMask = g.inv.has('gasmask');
    if (this.inGas && hasMask && !w.get('maskOn') && (w.get('filterTime') > 0 || g.inv.count('filter') > 0)) {
      w.set('maskOn', true);
      g.audio.play('mask');
      g.ui.hint('Противогаз надет. Дыши медленно.', 3);
    }
    let protectedNow = false;
    if (this.maskOn) {
      if (w.get('filterTime') <= 0 && g.inv.count('filter') > 0) {
        g.inv.addCount('filter', -1);
        w.data.vars.filterTime = FILTER_TIME;
        g.audio.play('battery');
        g.ui.toast(`Новый фильтр. Осталось запасных: ${g.inv.count('filter')}`);
      }
      if (w.get('filterTime') > 0) {
        protectedNow = true;
        if (this.inGas) w.data.vars.filterTime = Math.max(0, w.get('filterTime') - dt);
      }
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = this.inGas ? 2.6 : 3.4;
        g.audio.play('mask_breath');
      }
    }
    if (this.inGas && !protectedNow) {
      this.toxicity += dt;
      this.coughTimer -= dt;
      if (this.coughTimer <= 0) {
        this.coughTimer = 1.4 + Math.random();
        g.audio.play('cough');
      }
      if (g.mem.count('gas_warn') === 1) g.ui.hint(hasMask ? 'Фильтр забит! Уходи из газа!' : 'Газ! Нечем дышать — назад, или найди противогаз.', 4);
      if (this.toxicity >= TOX_MAX) return this.faint();
    } else this.toxicity = Math.max(0, this.toxicity - dt * 1.5);
    // вода под током
    if (this.updateShock(dt)) return;
    // бутылки
    this.updateBottles(dt);
    g.ui.setSurvival(this);
  }

  // Оборванный кабель в затопленном углу резервуара: шаг в воду — смерть, рядом — предупреждение.
  updateShock(dt) {
    const g = this.game;
    const L = g.level;
    const pos = g.player.pos;
    if (!L.cableLive() || this.climbing || g.state !== 'playing') return false;
    if (L.inHazard(pos.x, pos.z, pos.y)) {
      g.shock();
      return true;
    }
    this.shockWarn = (this.shockWarn || 0) - dt;
    if (this.shockWarn <= 0 && L.inHazard(pos.x, pos.z, pos.y, 1.8)) {
      this.shockWarn = 9;
      g.audio.play('zap');
      g.ui.hint('Вода впереди трещит — в ней лежит оборванный кабель. Ступишь — убьёт током. Линию нужно обесточить в подстанции.', 5);
      g.mem.observe('cable_warn', 'В затопленном углу резервуара в воду упал кабель под напряжением. Вода трещит и светится голубым. Туда нельзя, пока линию не обесточат.');
    }
    return false;
  }

  // Обморок в газе — очнуться у входа в коллектор.
  faint() {
    const g = this.game;
    this.toxicity = 0;
    g.mem.count('fainted');
    g.ui.fade(true);
    g.paused = true;
    if (g.boat.riding) g.boat.abort();
    setTimeout(async () => {
      await g.ui.cinematic(['Темнота пахнет тухлыми яйцами.', 'Кто-то вытащил тебя к лестнице.', 'Кто?'], { hold: 1 });
      g.player.setPose({ x: 26, y: -8, z: -10, yaw: Math.PI / 2, pitch: 0 });
      g.ui.fade(false);
      g.paused = !!g.ui.modal;
      g.updateZone(true);
      g.mem.observe('fainted', 'Я потерял сознание в газе — и очнулся у лестницы. Кто-то меня вытащил. Следов нет.');
    }, 600);
  }

  updateBottles(dt) {
    const g = this.game;
    for (const b of this.bottles) {
      b.v.y -= 9.8 * dt;
      const next = b.mesh.position.clone().addScaledVector(b.v, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      let hit = false;
      const ground = g.builder.groundAt(next.x, next.z, b.mesh.position.y + 0.3);
      if (ground && next.y <= ground.h + 0.03) hit = true;
      if (!hit) {
        for (const c of g.builder.near(next.x - 0.1, next.z - 0.1, next.x + 0.1, next.z + 0.1)) {
          if (!c.enabled) continue;
          if (next.x > c.x0 && next.x < c.x1 && next.z > c.z0 && next.z < c.z1 && next.y > c.y0 && next.y < c.y1) {
            hit = true;
            break;
          }
        }
      }
      if (next.y < -20) hit = true;
      if (hit) {
        b.dead = true;
        g.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        g.audio.play('glass', b.mesh.position.clone());
        g.bus.emit('noise', { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z, r: 17 });
        for (let i = 0; i < 10; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.02), b.mesh.material);
          s.position.copy(b.mesh.position);
          s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
          s.userData.life = 1.2;
          s.userData.floor = ground ? ground.h + 0.01 : b.mesh.position.y;
          g.scene.add(s);
          this.shards.push(s);
        }
      } else b.mesh.position.copy(next);
    }
    this.bottles = this.bottles.filter((b) => !b.dead);
    this.shards = this.shards.filter((s) => {
      s.userData.life -= dt;
      s.userData.v.y -= 9.8 * dt;
      s.position.addScaledVector(s.userData.v, dt);
      if (s.position.y < s.userData.floor) {
        s.position.y = s.userData.floor;
        s.userData.v.set(0, 0, 0);
      }
      if (s.userData.life <= 0) {
        g.scene.remove(s);
        s.geometry.dispose();
        return false;
      }
      return true;
    });
  }

  // для HUD и постобработки
  get toxicLevel() {
    return clamp(this.toxicity / TOX_MAX, 0, 1);
  }
}
