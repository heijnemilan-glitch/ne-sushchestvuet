// Интерактивные объекты мира. Каждый тип реализует:
//   prompt()   — текст подсказки взаимодействия (или null)
//   interact() — действие по [E]
//   sync()     — привести вид объекта в соответствие с WorldState (после загрузки и изменений)
//   update(dt) — анимации
// InteractionSystem находит объект лучом из центра экрана по mesh.userData.interactable.

import * as THREE from 'three';
import { ITEMS } from '../systems/inventory.js';

export class Interactable {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.meshes = [];
    this.range = 2.3;
  }

  register(mesh) {
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.userData.interactable = this;
        this.meshes.push(o);
      }
    });
    return mesh;
  }

  prompt() {
    return null;
  }

  interact() {}
  sync() {}
  update() {}
}

// ── ДВЕРЬ ────────────────────────────────────────────────────────────────────
// axis 'x': дверь в стене, идущей вдоль X (проём по X, проход по Z). axis 'z' — наоборот.
export class Door extends Interactable {
  constructor(game, o) {
    super(game, o.id);
    this.o = o;
    const { builder, mats } = game;
    const w = o.w || 1.0;
    const h = o.h || 2.1;
    this.w = w;
    const y = o.y || 0;
    this.pivot = new THREE.Group();
    const hingeA = o.axis === 'x' ? o.x - w / 2 : o.z - w / 2;
    if (o.axis === 'x') this.pivot.position.set(hingeA, y, o.z);
    else this.pivot.position.set(o.x, y, hingeA);
    builder.groupOf(o.zone).add(this.pivot);
    const leafMat = typeof o.mat === 'string' ? mats[o.mat] : o.mat || mats.door;
    const leafGeo = o.axis === 'x' ? new THREE.BoxGeometry(w - 0.04, h - 0.02, 0.05) : new THREE.BoxGeometry(0.05, h - 0.02, w - 0.04);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    if (o.axis === 'x') leaf.position.set(w / 2, h / 2, 0);
    else leaf.position.set(0, h / 2, w / 2);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    this.pivot.add(leaf);
    // ручка с обеих сторон
    const knobGeo = new THREE.BoxGeometry(0.04, 0.04, 0.16);
    for (const s of [-1, 1]) {
      const knob = new THREE.Mesh(o.axis === 'x' ? knobGeo : new THREE.BoxGeometry(0.16, 0.04, 0.04), mats.metal);
      if (o.axis === 'x') knob.position.set(w - 0.14, 1.0, s * 0.06);
      else knob.position.set(s * 0.06, 1.0, w - 0.14);
      this.pivot.add(knob);
    }
    // окошко-табличка
    if (o.sign) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: o.sign }));
      for (const s of [-1, 1]) {
        const p = plate.clone();
        if (o.axis === 'x') {
          p.position.set(w / 2, 1.62, s * 0.03);
          if (s < 0) p.rotation.y = Math.PI;
        } else {
          p.position.set(s * 0.03, 1.62, w / 2);
          p.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        this.pivot.add(p);
      }
    }
    // наличник (статичный, без коллизии)
    const t = 0.08;
    const fm = mats.metalDark;
    // у скрытых дверей наличник отдельный — он появляется вместе с дверью
    this.frame = [];
    const fopt = { zone: o.zone, collide: false, merge: !o.hidden };
    const fb = (...a) => {
      const r = builder.box(...a, fm, fopt);
      if (o.hidden && r) this.frame.push(r);
    };
    if (o.axis === 'x') {
      fb(o.x - w / 2 - t, y, o.z - 0.13, o.x - w / 2, y + h + t, o.z + 0.13);
      fb(o.x + w / 2, y, o.z - 0.13, o.x + w / 2 + t, y + h + t, o.z + 0.13);
      fb(o.x - w / 2, y + h, o.z - 0.13, o.x + w / 2, y + h + t, o.z + 0.13);
      this.collider = builder.addCollider({ x0: o.x - w / 2, x1: o.x + w / 2, y0: y, y1: y + h, z0: o.z - 0.08, z1: o.z + 0.08 }, 'door');
    } else {
      fb(o.x - 0.13, y, o.z - w / 2 - t, o.x + 0.13, y + h + t, o.z - w / 2);
      fb(o.x - 0.13, y, o.z + w / 2, o.x + 0.13, y + h + t, o.z + w / 2 + t);
      fb(o.x - 0.13, y + h, o.z - w / 2, o.x + 0.13, y + h + t, o.z + w / 2);
      this.collider = builder.addCollider({ x0: o.x - 0.08, x1: o.x + 0.08, y0: y, y1: y + h, z0: o.z - w / 2, z1: o.z + w / 2 }, 'door');
    }
    // лампа над дверью (для «Трёх проходов»)
    if (o.lamp) {
      this.lampMat = mats.lampRed.clone();
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(o.axis === 'x' ? 0.18 : 0.08, 0.08, o.axis === 'x' ? 0.08 : 0.18), this.lampMat);
      if (o.axis === 'x') lamp.position.set(o.x, y + h + 0.25, o.z + (o.lampSide || 1) * 0.14);
      else lamp.position.set(o.x + (o.lampSide || 1) * 0.14, y + h + 0.25, o.z);
      builder.groupOf(o.zone).add(lamp);
      this.lamp = lamp;
    }
    this.collider.doorRef = this; // монстр открывает двери сам
    this.register(this.pivot);
    game.world.initDoor(o.id, { open: !!o.open, locked: !!o.locked });
    this.angle = 0;
    this.swing = 1;
    this.sync(true);
  }

  get state() {
    return this.game.world.door(this.id);
  }

  prompt() {
    const st = this.state;
    if (this.o.hidden && this.o.hidden()) return null;
    if (st.open) return 'Закрыть дверь';
    if (st.locked) {
      if (this.o.requires && this.game.inv.hasTag(this.o.requires)) return 'Открыть дверь (пропуск)';
      return 'Открыть дверь';
    }
    return 'Открыть дверь';
  }

  interact() {
    const { world, mem, bus, audio, ui } = this.game;
    if (this.o.hidden && this.o.hidden()) return;
    const st = this.state;
    const pos = this.center();
    if (st.locked) {
      if (this.o.requires && this.game.inv.hasTag(this.o.requires)) {
        world.setDoor(this.id, { locked: false });
        audio.play('beep_ok', pos);
      } else {
        mem.door(this.id).tried += 1;
        audio.play('door_locked', pos);
        const text = typeof this.o.lockText === 'function' ? this.o.lockText() : this.o.lockText;
        ui.hint(text || 'Заперто.');
        bus.emit('door:try', { id: this.id });
        return;
      }
    }
    const open = !this.state.open;
    if (open) {
      // дверь открывается от игрока
      const p = this.game.player.pos;
      this.swing = this.o.axis === 'x' ? (p.z < this.o.z ? 1 : -1) : p.x < this.o.x ? -1 : 1;
      mem.door(this.id).opened += 1;
      audio.play('door_open', pos);
      bus.emit('door:opened', { id: this.id });
    } else {
      setTimeout(() => audio.play('door_close', pos), 450);
    }
    world.setDoor(this.id, { open });
    if (this.o.onToggle) this.o.onToggle(open);
  }

  center() {
    return new THREE.Vector3(this.o.x, (this.o.y || 0) + 1.1, this.o.z);
  }

  sync(instant = false) {
    const st = this.state;
    this.target = st.open ? (Math.PI / 2) * 0.95 * this.swing : 0;
    if (instant) this.angle = this.target;
    this.collider.enabled = !st.open;
    const hidden = this.o.hidden && this.o.hidden();
    this.pivot.visible = !hidden;
    this.frame.forEach((f) => (f.visible = !hidden));
    if (this.lamp) this.lamp.visible = !hidden;
    if (hidden) this.collider.enabled = true;
  }

  update(dt) {
    if (Math.abs(this.angle - this.target) > 0.001) {
      this.angle += (this.target - this.angle) * Math.min(1, dt * 5);
      this.pivot.rotation.y = this.o.axis === 'x' ? -this.angle : this.angle;
    }
  }

  setLamp(color) {
    if (this.lampMat) this.lampMat.color.setHex(color);
  }
}

// ── ПРЕДМЕТ, КОТОРЫЙ МОЖНО ПОДНЯТЬ ───────────────────────────────────────────
export class Pickup extends Interactable {
  constructor(game, o) {
    super(game, o.item);
    this.o = o;
    this.item = o.item;
    this.mesh = o.mesh;
    this.zone = o.zone;
    game.builder.groupOf(o.zone).add(this.mesh);
    this.register(this.mesh);
    game.world.initItem(o.item, { where: o.available === false ? 'hidden' : 'world', x: o.x, y: o.y, z: o.z, room: o.zone });
    this.sync();
  }

  prompt() {
    const it = this.game.world.item(this.item);
    if (!it || it.where !== 'world') return null;
    return `Взять: ${ITEMS[this.item].name}`;
  }

  interact() {
    const { world, inv, bus, audio, ui, mem } = this.game;
    if (world.item(this.item).where !== 'world') return;
    inv.add(this.item);
    world.setItem(this.item, { where: 'inv' });
    mem.data.items.picked[this.item] = (mem.data.items.picked[this.item] || 0) + 1;
    audio.play('pickup');
    ui.toast(`Получено: ${ITEMS[this.item].name}`);
    bus.emit('item:pickup', { id: this.item, room: mem.data.currentRoom });
    if (this.o.onPick) this.o.onPick();
    this.sync();
  }

  sync() {
    const it = this.game.world.item(this.item);
    this.mesh.visible = !!it && it.where === 'world';
    if (it && it.where === 'world' && it.x !== undefined) {
      this.mesh.position.set(it.x, it.y, it.z);
      if (it.ry !== undefined) this.mesh.rotation.y = it.ry;
      // перенесённый предмет может оказаться в другой зоне — переносим в её группу (для отсечения)
      const zone = this.game.builder.zoneAt(it.x, it.y + 0.5, it.z);
      const group = zone ? zone.group : this.game.builder.root;
      if (this.mesh.parent !== group) group.add(this.mesh);
    }
  }
}

// ── ЗАПИСКА / ДОКУМЕНТ ───────────────────────────────────────────────────────
export class Readable extends Interactable {
  constructor(game, o) {
    super(game, o.note);
    this.o = o;
    if (o.mesh.parent == null) game.builder.groupOf(o.zone).add(o.mesh);
    this.register(o.mesh);
  }

  prompt() {
    if (this.o.when && !this.o.when()) return null;
    return this.game.mem.data.notes.includes(this.o.note) ? 'Перечитать' : 'Читать';
  }

  interact() {
    if (this.o.when && !this.o.when()) return;
    this.game.audio.play('paper');
    this.game.story.readNote(this.o.note);
  }

  sync() {
    if (this.o.when) this.o.mesh.visible = !!this.o.when();
  }
}

// ── ОСМОТР (часы, окна, надписи) ─────────────────────────────────────────────
export class Inspect extends Interactable {
  constructor(game, o) {
    super(game, o.id);
    this.o = o;
    if (o.mesh.parent == null) game.builder.groupOf(o.zone).add(o.mesh);
    this.register(o.mesh);
    this.range = o.range || 2.6;
  }

  prompt() {
    if (this.o.when && !this.o.when()) return null;
    return this.o.label || 'Осмотреть';
  }

  interact() {
    const text = typeof this.o.text === 'function' ? this.o.text() : this.o.text;
    this.game.mem.seeEvent(`inspect_${this.id}`);
    this.game.ui.hint(text, 6);
    if (this.o.onInspect) this.o.onInspect();
  }
}

// ── УНИВЕРСАЛЬНАЯ КНОПКА / МЕХАНИЗМ ──────────────────────────────────────────
export class Button extends Interactable {
  constructor(game, o) {
    super(game, o.id);
    this.o = o;
    if (o.mesh.parent == null) game.builder.groupOf(o.zone).add(o.mesh);
    this.register(o.mesh);
    this.copyable = !!o.copyable;
    this.range = o.range || 2.3;
  }

  prompt() {
    return typeof this.o.prompt === 'function' ? this.o.prompt() : this.o.prompt;
  }

  interact(byCopy = false) {
    this.o.action(byCopy);
    if (!byCopy && this.copyable) this.game.bus.emit('interact:copyable', { id: this.id });
  }

  sync() {
    if (this.o.sync) this.o.sync();
  }

  update(dt) {
    if (this.o.update) this.o.update(dt);
  }
}

// ── НАЖИМНАЯ ПЛИТА ───────────────────────────────────────────────────────────
// Нажимается игроком, Копией или ящиком. Не требует [E].
export class Plate {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.o = o;
    this.pressed = false;
    const { mats, builder } = game;
    this.mat = mats.metalDark.clone();
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(o.size, 0.06, o.size), this.mat);
    this.mesh.position.set(o.x, (o.y || 0) + 0.03, o.z);
    this.mesh.receiveShadow = true;
    builder.groupOf(o.zone).add(this.mesh);
    // индикатор на стене
    this.lampMat = mats.lampRed.clone();
    if (o.lamp) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), this.lampMat);
      lamp.position.set(o.lamp.x, o.lamp.y, o.lamp.z);
      builder.groupOf(o.zone).add(lamp);
    }
  }

  contains(x, z) {
    const h = this.o.size / 2 + 0.1;
    return Math.abs(x - this.o.x) < h && Math.abs(z - this.o.z) < h;
  }

  update(bodies) {
    const was = this.pressed;
    this.pressed = bodies.some((b) => b && Math.abs(b.y - (this.o.y || 0)) < 1 && this.contains(b.x, b.z));
    if (this.pressed !== was) {
      this.mesh.position.y = (this.o.y || 0) + (this.pressed ? 0.005 : 0.03);
      this.lampMat.color.setHex(this.pressed ? 0x40ff80 : 0xff3020);
      this.game.audio.play('plate', this.mesh.position);
      this.game.bus.emit('plate', { id: this.id, pressed: this.pressed });
    }
  }
}

// ── ТЯЖЁЛЫЙ ЯЩИК (толкается, когда игрок идёт в него) ────────────────────────
export class Crate {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.o = o;
    this.size = o.size || 0.9;
    const { mats, builder } = game;
    const s = this.size;
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mats.wood);
    body.castShadow = body.receiveShadow = true;
    body.position.y = s / 2;
    this.mesh.add(body);
    // металлические уголки
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, s + 0.01, 0.06), mats.metalDark);
        e.position.set((dx * s) / 2, s / 2, (dz * s) / 2);
        this.mesh.add(e);
      }
    }
    builder.groupOf(o.zone).add(this.mesh);
    const saved = game.world.get(`crate_${o.id}`);
    this.x = saved ? saved.x : o.x;
    this.z = saved ? saved.z : o.z;
    this.y = o.y || 0;
    this.collider = builder.addCollider(this.box(this.x, this.z), 'crate');
    this.collider.crate = this;
    this.place();
  }

  box(x, z) {
    const h = this.size / 2;
    return { x0: x - h, x1: x + h, y0: this.y, y1: this.y + this.size, z0: z - h, z1: z + h };
  }

  place() {
    this.mesh.position.set(this.x, this.y, this.z);
  }

  // Попытка сдвинуть ящик; true — если сдвинулся.
  push(dx, dz) {
    const nx = this.x + dx;
    const nz = this.z + dz;
    const b = this.box(nx, nz);
    for (const c of this.game.builder.near(b.x0, b.z0, b.x1, b.z1)) {
      if (c === this.collider || !c.enabled) continue;
      if (c.y1 <= b.y0 + 0.05 || c.y0 >= b.y1) continue;
      if (b.x1 > c.x0 && b.x0 < c.x1 && b.z1 > c.z0 && b.z0 < c.z1) return false;
    }
    this.x = nx;
    this.z = nz;
    this.game.builder.moveCollider(this.collider, b);
    this.place();
    this.game.world.data.vars[`crate_${this.id}`] = { x: this.x, z: this.z };
    this.scrapeTimer = (this.scrapeTimer || 0) - Math.hypot(dx, dz);
    if (this.scrapeTimer <= 0) {
      this.scrapeTimer = 0.35;
      this.game.audio.play('scrape', this.mesh.position);
    }
    return true;
  }
}
