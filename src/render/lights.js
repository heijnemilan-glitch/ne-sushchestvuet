// Пул источников света. В комплексе десятки ламп, но в шейдере всегда фиксированное число PointLight
// (4/6/8 в зависимости от качества). Пул раз в 0.2 с назначает реальные источники ближайшим
// включённым лампам. Число источников не меняется — шейдеры не перекомпилируются, FPS стабилен.

import * as THREE from 'three';

// общий множитель яркости ламп (физические единицы three.js)
const LIGHT_GAIN = 1.9;

export class LightPool {
  constructor(scene, anchors, count) {
    this.scene = scene;
    this.anchors = anchors;
    this.timer = 0;
    this.lights = [];
    this.setCount(count);
  }

  setCount(count) {
    this.lights.forEach((l) => this.scene.remove(l.light));
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 9, 2);
      light.castShadow = false;
      this.scene.add(light);
      this.lights.push({ light, anchor: null, level: 0 });
    }
    this.timer = 0;
  }

  update(dt, pos, time) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      this.assign(pos);
    }
    for (const slot of this.lights) {
      const a = slot.anchor;
      let target = 0;
      if (a && a.isOn()) {
        target = a.intensity * LIGHT_GAIN;
        if (a.flicker > 0) {
          // мерцание: редкие провалы яркости, не стробоскоп
          const f = Math.sin(time * 13.1 + a.phase) * Math.sin(time * 4.7 + a.phase * 2.3);
          if (f > 1 - a.flicker * 0.9) target *= 0.15;
          else target *= 1 - a.flicker * 0.15 * Math.abs(Math.sin(time * 2 + a.phase));
        }
      }
      slot.level += (target - slot.level) * Math.min(1, dt * 12);
      slot.light.intensity = slot.level;
      if (a && a.fixtureMat) {
        // лампа-светильник светится вместе с источником
        const k = a.intensity > 0 ? slot.level / (a.intensity * LIGHT_GAIN) : 0;
        a.fixtureMat.color.setScalar(a.isOn() ? 0.3 + 0.7 * k : 0.05).multiply(a.baseColor);
      }
    }
  }

  assign(pos) {
    const cands = [];
    for (const a of this.anchors) {
      const dx = a.x - pos.x;
      const dy = a.y - pos.y;
      const dz = a.z - pos.z;
      if (Math.abs(dy) > 8) continue;
      // лампы своей комнаты важнее ламп за стеной; в больших залах дальние лампы тоже нужны
      const d2 = dx * dx + dz * dz + dy * dy * 1.5 + (this.zoneId && a.zone !== this.zoneId ? 220 : 0);
      if (d2 > 30 * 30) continue;
      if (!a.isOn() && !a.fixtureMat) continue;
      // bias — лампы, которые важно видеть издалека (например, комната за стеклом)
      cands.push({ a, d2: (a.isOn() ? d2 : d2 + 1e4) - (a.bias || 0) });
    }
    cands.sort((p, q) => p.d2 - q.d2);
    const chosen = new Set(cands.slice(0, this.lights.length).map((c) => c.a));
    // слоты, чьи лампы остались в выборке, не трогаем — меньше «перескоков»
    const free = [];
    for (const slot of this.lights) {
      if (slot.anchor && chosen.has(slot.anchor)) chosen.delete(slot.anchor);
      else free.push(slot);
    }
    for (const slot of free) {
      const a = chosen.values().next().value;
      if (a) chosen.delete(a);
      if (slot.anchor && slot.anchor.fixtureMat) slot.anchor.fixtureMat.color.copy(slot.anchor.baseColor).multiplyScalar(slot.anchor.isOn() ? 1 : 0.05);
      slot.anchor = a || null;
      slot.level = 0;
      if (a) {
        slot.light.position.set(a.x, a.y, a.z);
        slot.light.color.setHex(a.color);
        slot.light.distance = a.range;
      }
    }
  }
}

// Фонарь игрока: SpotLight, прикреплённый к камере. Тени — только на высоком качестве.
export function createFlashlight(camera, scene, quality) {
  const spot = new THREE.SpotLight(0xfff1dc, 0, 30, Math.PI / 7, 0.5, 1.5);
  spot.position.set(0.18, -0.12, 0.05);
  spot.target.position.set(0.05, -0.05, -3);
  camera.add(spot);
  camera.add(spot.target);
  spot.castShadow = quality === 'high';
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.2;
  spot.shadow.camera.far = 22;
  spot.shadow.bias = -0.0006;
  scene.add(camera);
  return spot;
}

// Пыль в воздухе — частицы вокруг камеры, видны в луче фонаря и у ламп.
export class Dust {
  constructor(scene, count) {
    this.size = 7;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * this.size;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.base = pos.slice();
    this.mat = new THREE.PointsMaterial({ color: 0xcfd6d2, size: 0.012, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.count = count;
  }

  update(dt, cam, time) {
    const p = this.points.geometry.attributes.position;
    const s = this.size;
    const h = s / 2;
    for (let i = 0; i < this.count; i++) {
      const bx = this.base[i * 3];
      const by = this.base[i * 3 + 1];
      const bz = this.base[i * 3 + 2];
      // медленный дрейф; координаты «заворачиваются» вокруг камеры
      const x = ((((bx + Math.sin(time * 0.1 + i) * 0.3 - cam.x) % s) + s * 1.5) % s) - h + cam.x;
      const y = ((((by - time * 0.02 - cam.y) % s) + s * 1.5) % s) - h + cam.y;
      const z = ((((bz + Math.cos(time * 0.13 + i) * 0.3 - cam.z) % s) + s * 1.5) % s) - h + cam.z;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  setVisible(v) {
    this.points.visible = v;
  }
}
