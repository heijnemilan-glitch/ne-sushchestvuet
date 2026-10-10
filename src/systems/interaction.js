// InteractionSystem — луч из центра экрана. Находит ближайший интерактивный объект,
// проверяет, что его не загораживает стена, и показывает ненавязчивую подсказку.

import * as THREE from 'three';

export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ray.far = 3;
    this.objects = [];
    this.meshes = [];
    this.current = null;
    this.center = new THREE.Vector2(0, 0);
  }

  add(obj) {
    this.objects.push(obj);
    this.dirty = true;
    return obj;
  }

  rebuild() {
    this.meshes = [];
    for (const o of this.objects) for (const m of o.meshes) this.meshes.push(m);
    this.dirty = false;
  }

  update() {
    if (this.dirty) this.rebuild();
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    this.ray.setFromCamera(this.center, cam);
    const visible = this.meshes.filter((m) => m.visible && isShown(m));
    const hits = this.ray.intersectObjects(visible, false);
    let found = null;
    for (const h of hits) {
      const obj = h.object.userData.interactable;
      if (!obj || h.distance > obj.range) continue;
      if (this.blocked(cam.position, h.point, h.distance)) break;
      const text = obj.prompt();
      if (text) found = { obj, text };
      break;
    }
    this.current = found;
    this.game.ui.setPrompt(found ? found.text : null, this.game.settings.keys.interact);
  }

  // Не даём взаимодействовать сквозь стены: проверяем AABB-коллайдеры на отрезке луча.
  blocked(from, to, dist) {
    const dir = to.clone().sub(from).normalize();
    for (const c of this.game.builder.near(Math.min(from.x, to.x), Math.min(from.z, to.z), Math.max(from.x, to.x), Math.max(from.z, to.z))) {
      if (!c.enabled || c.tag === 'door' || c.tag === 'crate' || c.tag === 'prop') continue;
      const t = rayBox(from, dir, c);
      if (t !== null && t < dist - 0.15) return true;
    }
    return false;
  }

  interact() {
    if (this.current) {
      this.current.obj.interact();
      this.game.bus.emit('interact', { id: this.current.obj.id });
    }
  }
}

function isShown(m) {
  let o = m;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

export function rayBox(o, d, b) {
  let tmin = 0;
  let tmax = Infinity;
  for (const [oa, da, a0, a1] of [
    [o.x, d.x, b.x0, b.x1],
    [o.y, d.y, b.y0, b.y1],
    [o.z, d.z, b.z0, b.z1],
  ]) {
    if (Math.abs(da) < 1e-9) {
      if (oa < a0 || oa > a1) return null;
    } else {
      let t1 = (a0 - oa) / da;
      let t2 = (a1 - oa) / da;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
