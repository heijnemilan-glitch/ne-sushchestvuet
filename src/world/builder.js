// WorldBuilder — построение геометрии комплекса.
// • box() — универсальный блок; статические блоки сливаются в один меш на (зону × материал),
//   что резко уменьшает число вызовов отрисовки
// • стены с проёмами, полы, пандусы (лестницы), коллайдеры в пространственной сетке
// • зоны (комнаты) — для памяти мира, звука, отсечения невидимых областей

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CELL = 4;
export const WALL_T = 0.2;

// UV в метрах по мировой позиции — текстуры не растягиваются и совпадают на стыках.
export function worldUV(geo, texScale = 2) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv.setXY(i, u / texScale, v / texScale);
  }
  uv.needsUpdate = true;
  return geo;
}

export class Builder {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.colliders = [];
    this.grid = new Map();
    this.floors = [];
    this.zones = [];
    this.zoneMap = new Map();
    this.pending = new Map();
    this.lights = [];
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  // ── зоны ──────────────────────────────────────────────────────────────────
  zone(id, name, b, opts = {}) {
    const group = new THREE.Group();
    group.name = id;
    this.root.add(group);
    const z = {
      id,
      name,
      x0: b.x0,
      x1: b.x1,
      z0: b.z0,
      z1: b.z1,
      y0: b.y0 ?? -1,
      y1: b.y1 ?? 4,
      group,
      ambience: opts.ambience || id,
      surface: opts.surface || 'concrete',
      memoryId: opts.memoryId || id,
      fog: opts.fog || null,
      map: opts.map || null, // { level, x0, z0, x1, z1 } — как комната выглядит на карте
      priority: opts.priority || 0,
      crouch: !!opts.crouch,
      cullGroup: opts.cullGroup || id,
    };
    this.zones.push(z);
    this.zoneMap.set(id, z);
    return z;
  }

  zoneAt(x, y, z) {
    let best = null;
    for (const zn of this.zones) {
      if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1 && y >= zn.y0 && y <= zn.y1) {
        if (!best || zn.priority > best.priority) best = zn;
      }
    }
    return best;
  }

  groupOf(zoneId) {
    const z = this.zoneMap.get(zoneId);
    return z ? z.group : this.root;
  }

  // ── коллайдеры ────────────────────────────────────────────────────────────
  addCollider(b, tag = null) {
    const c = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1, enabled: true, tag };
    this.colliders.push(c);
    this.indexCollider(c);
    return c;
  }

  indexCollider(c) {
    const cx0 = Math.floor(c.x0 / CELL);
    const cx1 = Math.floor(c.x1 / CELL);
    const cz0 = Math.floor(c.z0 / CELL);
    const cz1 = Math.floor(c.z1 / CELL);
    c.cells = [];
    for (let i = cx0; i <= cx1; i++) {
      for (let j = cz0; j <= cz1; j++) {
        const k = `${i},${j}`;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
        c.cells.push(k);
      }
    }
  }

  // Переместить подвижный коллайдер (ящик, стена комнаты-перевёртыша).
  moveCollider(c, b) {
    for (const k of c.cells) {
      const arr = this.grid.get(k);
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    Object.assign(c, b);
    this.indexCollider(c);
  }

  near(x0, z0, x1, z1) {
    const out = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const arr = this.grid.get(`${i},${j}`);
        if (arr) arr.forEach((c) => out.add(c));
      }
    }
    return out;
  }

  // ── полы ──────────────────────────────────────────────────────────────────
  floor(x0, z0, x1, z1, y, surface = 'concrete') {
    const f = { x0, z0, x1, z1, y, surface, enabled: true };
    this.floors.push(f);
    return f;
  }

  // Пандус: высота линейно меняется вдоль оси axis от a (ya) до b (yb).
  ramp(x0, z0, x1, z1, axis, ya, yb, surface = 'concrete') {
    const f = { x0, z0, x1, z1, y: Math.max(ya, yb), ramp: { axis, ya, yb }, surface, enabled: true };
    this.floors.push(f);
    return f;
  }

  heightOf(f, x, z) {
    if (!f.ramp) return f.y;
    const r = f.ramp;
    const t = r.axis === 'x' ? (x - f.x0) / (f.x1 - f.x0) : (z - f.z0) / (f.z1 - f.z0);
    return r.ya + (r.yb - r.ya) * Math.min(1, Math.max(0, t));
  }

  // Самая высокая поверхность под точкой, на которую можно встать (подъём не выше stepUp).
  groundAt(x, z, curY, stepUp = 0.55) {
    let best = null;
    for (const f of this.floors) {
      if (!f.enabled || x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      const h = this.heightOf(f, x, z);
      if (h <= curY + stepUp && (!best || h > best.h)) best = { h, surface: f.surface };
    }
    return best;
  }

  // ── геометрия ─────────────────────────────────────────────────────────────
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const { zone = null, collide = true, merge = true, cast = true, uvScale } = opts;
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const material = typeof mat === 'string' ? this.mats[mat] : mat;
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    worldUV(geo, uvScale || material.userData.texScale || 2);
    let col = null;
    if (collide) col = this.addCollider({ x0, x1, y0, y1, z0, z1 }, opts.tag);
    if (merge) {
      const key = `${zone || '_'}|${material.uuid}`;
      if (!this.pending.has(key)) this.pending.set(key, { zone, material, geos: [], cast });
      this.pending.get(key).geos.push(geo);
      return col;
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    (opts.parent || this.groupOf(zone)).add(mesh);
    mesh.userData.collider = col;
    return mesh;
  }

  // Отдельный (не сливаемый) меш с произвольной геометрией.
  mesh(geo, mat, x, y, z, opts = {}) {
    const material = typeof mat === 'string' ? this.mats[mat] : mat;
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = true;
    (opts.parent || this.groupOf(opts.zone)).add(m);
    return m;
  }

  // Стена вдоль X (северная/южная) на линии z, с проёмами gaps: [{ a, b, top }]
  wallX(z, x0, x1, y0, h, mat, zone, gaps = []) {
    this.wallLine('x', z, x0 - WALL_T / 2, x1 + WALL_T / 2, y0, h, mat, zone, gaps);
  }

  // Стена вдоль Z (западная/восточная) на линии x
  wallZ(x, z0, z1, y0, h, mat, zone, gaps = []) {
    this.wallLine('z', x, z0 - WALL_T / 2, z1 + WALL_T / 2, y0, h, mat, zone, gaps);
  }

  wallLine(axis, line, a0, a1, y0, h, mat, zone, gaps) {
    const sorted = [...gaps].sort((p, q) => p.a - q.a);
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (axis === 'x') this.box(a, ya, line - WALL_T / 2, b, yb, line + WALL_T / 2, mat, { zone });
      else this.box(line - WALL_T / 2, ya, a, line + WALL_T / 2, yb, b, mat, { zone });
    };
    let cur = a0;
    for (const g of sorted) {
      seg(cur, g.a, y0, y0 + h);
      const top = g.top ?? 2.2;
      const bottom = g.bottom ?? 0;
      if (top < h) seg(g.a, g.b, y0 + top, y0 + h); // перемычка над проёмом
      if (bottom > 0) seg(g.a, g.b, y0, y0 + bottom); // подоконник
      cur = g.b;
    }
    seg(cur, a1, y0, y0 + h);
  }

  // Комната: пол, потолок, стены. walls: { n, s, e, w } — false (нет стены) или массив проёмов.
  room(def) {
    const { x0, x1, z0, z1, y = 0, h = 3, zone, floor = 'concrete', ceil = 'ceiling', wall = 'concrete', surface } = def;
    const walls = { n: [], s: [], e: [], w: [], ...(def.walls || {}) };
    if (floor) this.box(x0, y - 0.2, z0, x1, y, z1, floor, { zone, collide: false });
    if (ceil) this.box(x0, y + h, z0, x1, y + h + 0.2, z1, ceil, { zone, collide: false, cast: false });
    if (walls.n !== false) this.wallX(z0, x0, x1, y, h, wall, zone, walls.n);
    if (walls.s !== false) this.wallX(z1, x0, x1, y, h, wall, zone, walls.s);
    if (walls.w !== false) this.wallZ(x0, z0, z1, y, h, wall, zone, walls.w);
    if (walls.e !== false) this.wallZ(x1, z0, z1, y, h, wall, zone, walls.e);
    if (def.addFloor !== false) this.floor(x0, z0, x1, z1, y, surface || def.surface || 'concrete');
  }

  // Точка света для пула источников (см. lights.js).
  light(def) {
    const l = { color: 0xe6eef2, intensity: 6, range: 9, power: 'main', flicker: 0, on: true, ...def };
    this.lights.push(l);
    return l;
  }

  finalize() {
    for (const { zone, material, geos, cast } of this.pending.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.groupOf(zone).add(mesh);
    }
    this.pending.clear();
  }
}
