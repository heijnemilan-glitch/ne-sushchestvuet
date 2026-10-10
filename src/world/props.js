// Мебель и детали интерьера. Статичные детали сливаются builder'ом, подвижные (для сдвигов Наблюдателя)
// создаются отдельными группами.

import * as THREE from 'three';
import { textTexture } from '../render/materials.js';
import { mulberry32 } from '../core/rng.js';

export class Props {
  constructor(builder, mats) {
    this.b = builder;
    this.m = mats;
    const rnd = mulberry32(99);
    this.bookMats = [0x5a3a32, 0x2f4a5a, 0x4a4a3a, 0x6a5a42, 0x30383a, 0x5a2a2a, 0x3a4a3a].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
    );
    this.rnd = rnd;
    this.yb = 0; // базовая высота пола (для комнат на балконе, в канализации и т.п.)
  }

  table(x, z, w, d, zone, { h = 0.76, mat = 'wood', legs = 'metalDark' } = {}) {
    const b = this.b;
    const y = this.yb;
    b.box(x - w / 2, y + h - 0.04, z - d / 2, x + w / 2, y + h, z + d / 2, mat, { zone, collide: false });
    b.addCollider({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 }, 'prop');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = x + sx * (w / 2 - 0.06);
      const lz = z + sz * (d / 2 - 0.06);
      b.box(lx - 0.025, y, lz - 0.025, lx + 0.025, y + h - 0.04, lz + 0.025, legs, { zone, collide: false });
    }
  }

  // Стул — отдельная группа (его может сдвинуть Наблюдатель).
  chair(x, z, ry, zone, parent) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), this.m.wood);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.04), this.m.wood);
    back.position.set(0, 0.7, 0.19);
    g.add(seat, back);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.46, 0.03), this.m.metalDark);
      leg.position.set(sx * 0.19, 0.23, sz * 0.18);
      g.add(leg);
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.position.set(x, this.yb, z);
    g.rotation.y = ry;
    (parent || this.b.groupOf(zone)).add(g);
    return g;
  }

  bed(x, z, ry, zone) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.95), this.m.metalDark);
    frame.position.y = 0.42;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 1.88), this.m.fabric);
    mattress.position.y = 0.53;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.35), this.m.paper);
    pillow.position.set(0, 0.64, -0.72);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a4436, roughness: 1 }));
    blanket.position.set(0, 0.62, 0.3);
    blanket.rotation.y = 0.04;
    g.add(frame, mattress, pillow, blanket);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), this.m.metalDark);
      leg.position.set(sx * 0.42, 0.21, sz * 0.94);
      g.add(leg);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, this.yb, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    return g;
  }

  // Стеллаж с книгами/папками. Вдоль оси Z (длина по z).
  shelf(x, z0, z1, zone, { h = 2.2, d = 0.45, books = true, axis = 'z' } = {}) {
    const b = this.b;
    const levels = 5;
    const mat = 'metalDark';
    const Y = this.yb;
    const box = (a0, y0, c0, a1, y1, c1, m) => {
      if (axis === 'z') b.box(x - d / 2 + a0, Y + y0, c0, x - d / 2 + a1, Y + y1, c1, m, { zone, collide: false });
      else b.box(c0, Y + y0, x - d / 2 + a0, c1, Y + y1, x - d / 2 + a1, m, { zone, collide: false });
    };
    // стойки
    for (const c of [z0, (z0 + z1) / 2, z1 - 0.04]) {
      box(0, 0, c, 0.04, h, c + 0.04, mat);
      box(d - 0.04, 0, c, d, h, c + 0.04, mat);
    }
    for (let i = 0; i < levels; i++) {
      const y = 0.08 + (i * (h - 0.1)) / (levels - 1);
      box(0, y, z0, d, y + 0.025, z1, mat);
      if (!books || i === levels - 1) continue;
      let c = z0 + 0.05;
      while (c < z1 - 0.1) {
        const bw = 0.03 + this.rnd() * 0.06;
        const bh = 0.2 + this.rnd() * 0.15;
        if (this.rnd() < 0.12) {
          c += 0.12;
          continue;
        }
        const bm = this.bookMats[Math.floor(this.rnd() * this.bookMats.length)];
        box(0.05, y + 0.025, c, d - 0.06, y + 0.025 + bh, c + bw, bm);
        c += bw + 0.005;
      }
    }
    if (axis === 'z') b.addCollider({ x0: x - d / 2, x1: x + d / 2, y0: Y, y1: Y + h, z0, z1 }, 'prop');
    else b.addCollider({ x0: z0, x1: z1, y0: Y, y1: Y + h, z0: x - d / 2, z1: x + d / 2 }, 'prop');
  }

  // Потолочный светильник: излучающая панель + точка для пула света.
  fixture(x, y, z, zone, opts = {}) {
    const { w = 1.2, d = 0.3, color = 0xe6eef2, mode = 'mixed', lo = 2, hi = 6, range = 9, flicker = 0, warm = false } = opts;
    const mat = (warm ? this.m.lampWarm : this.m.lampWhite).clone();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.08), this.m.metalDark);
    housing.position.set(x, y - 0.03, z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat);
    panel.position.set(x, y - 0.065, z);
    const g = this.b.groupOf(zone);
    g.add(housing, panel);
    const a = this.b.light({ ...opts, x, y: y - 0.3, z, color, mode, lo, hi, range, flicker, zone, fixtureMat: mat, baseColor: mat.color.clone(), phase: x * 1.3 + z * 0.7 });
    return a;
  }

  // Настенная лампа-бра
  wallLamp(x, y, z, zone, opts = {}) {
    const { color = 0xffe2b8, mode = 'always', lo = 3, hi = 3, range = 7, flicker = 0 } = opts;
    const mat = this.m.lampWarm.clone();
    const g = this.b.groupOf(zone);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), this.m.metalDark);
    cage.position.set(x, y + 0.1, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat);
    bulb.position.set(x, y, z);
    g.add(cage, bulb);
    return this.b.light({ x, y: y - 0.1, z, color, mode, lo, hi, range, flicker, zone, fixtureMat: mat, baseColor: mat.color.clone(), phase: x + z });
  }

  // Табличка с текстом. ry — поворот (0 = смотрит на +Z).
  sign(lines, x, y, z, ry, zone, { w = 0.6, h = 0.3, bg = '#1e2322', fg = '#cfd6cf', font, tw = 256, th = 128 } = {}) {
    const tex = textTexture(lines, { w: tw, h: th, bg, fg, font: font || `bold ${Math.floor(th / (Array.isArray(lines) ? lines.length + 1 : 2))}px Consolas, monospace` });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.b.groupOf(zone).add(mesh);
    mesh.userData.tex = tex;
    return mesh;
  }

  // Экран (светится сам по себе)
  screen(lines, x, y, z, ry, zone, { w = 0.5, h = 0.36, fg = '#9fe8c0', bg = '#06110c', tw = 256, th = 184, font } = {}) {
    const tex = textTexture(lines, { w: tw, h: th, bg, fg, font: font || 'bold 20px Consolas, monospace', align: 'left', noise: 1 });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.b.groupOf(zone).add(mesh);
    mesh.userData.tex = tex;
    return mesh;
  }

  // Терминал: корпус + экран
  terminal(x, z, ry, zone, y = 0.76) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.42), this.m.plasticLight);
    body.position.y = 0.19;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), this.m.screen.clone());
    scr.position.set(0, 0.2, 0.212);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.16), this.m.plastic);
    kb.position.set(0, 0.015, 0.34);
    g.add(body, scr, kb);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, y + this.yb, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    g.userData.screen = scr;
    return g;
  }

  pipe(x0, y, z0, x1, z1, r, zone, mat = 'metal') {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.CylinderGeometry(r, r, len, 10);
    const m = new THREE.Mesh(geo, this.m[mat]);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    m.castShadow = true;
    this.b.groupOf(zone).add(m);
    return m;
  }

  // Стальной шкаф
  cabinet(x, z, ry, zone, { w = 0.9, h = 1.9, d = 0.5 } = {}) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.m.metal);
    body.position.y = h / 2;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.01, 0.01), this.m.dark);
      line.position.set(0, 0.5 + i * 0.55, d / 2 + 0.005);
      g.add(line);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, this.yb, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    return g;
  }
}

// Модели предметов (для поднятия и осмотра).
export function itemModel(kind, mats) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (kind) {
    case 'flashlight':
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), mats.plastic, 0, 0.025, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.038, 0.028, 0.06, 12), mats.metal, 0.13, 0.025, 0, 0, 0, Math.PI / 2);
      add(new THREE.CircleGeometry(0.032, 12), mats.lampWarm, 0.161, 0.025, 0, 0, Math.PI / 2, 0);
      break;
    case 'fuse':
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 12), mats.plasticLight, 0, 0.018, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 12), mats.metal, 0.05, 0.018, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 12), mats.metal, -0.05, 0.018, 0, 0, 0, Math.PI / 2);
      break;
    case 'card':
      add(new THREE.BoxGeometry(0.086, 0.003, 0.054), mats.plasticLight, 0, 0.002, 0);
      add(new THREE.BoxGeometry(0.03, 0.004, 0.035), mats.paper, -0.02, 0.003, 0);
      break;
    case 'fork': {
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8), mats.metal, -0.07, 0.008, 0, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.12, 0.008, 0.006), mats.metal, 0.03, 0.008, -0.018);
      add(new THREE.BoxGeometry(0.12, 0.008, 0.006), mats.metal, 0.03, 0.008, 0.018);
      add(new THREE.BoxGeometry(0.01, 0.008, 0.042), mats.metal, -0.03, 0.008, 0);
      break;
    }
    case 'paper':
      add(new THREE.BoxGeometry(0.16, 0.002, 0.11), mats.paper, 0, 0.001, 0, 0, 0.2, 0);
      break;
    case 'tape': {
      add(new THREE.BoxGeometry(0.19, 0.025, 0.1), mats.dark, 0, 0.013, 0);
      add(new THREE.BoxGeometry(0.12, 0.002, 0.05), mats.paper, 0, 0.027, 0.01);
      break;
    }
    case 'battery': {
      add(new THREE.CylinderGeometry(0.017, 0.017, 0.065, 12), new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.4, metalness: 0.3 }), 0, 0.017, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8), mats.metal, 0.036, 0.017, 0, 0, 0, Math.PI / 2);
      break;
    }
    case 'stim': {
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0xd8f0ff, roughness: 0.1, transparent: true, opacity: 0.6 }), 0, 0.012, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0xff4020, emissive: 0x501008 }), 0, 0.012, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.05, 4), mats.metal, 0.075, 0.012, 0, 0, 0, Math.PI / 2);
      break;
    }
    case 'bottle': {
      const glass = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.75 });
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), glass, 0, 0.1, 0);
      add(new THREE.CylinderGeometry(0.012, 0.03, 0.08, 10), glass, 0, 0.24, 0);
      break;
    }
    case 'filter': {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 14), mats.metalDark, 0, 0.03, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), mats.metal, 0, 0.07, 0);
      break;
    }
    case 'gasmask': {
      const rubber = new THREE.MeshStandardMaterial({ color: 0x2a2e26, roughness: 0.7 });
      add(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), rubber, 0, 0.05, 0, -Math.PI / 2, 0, 0);
      for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.03, 12), new THREE.MeshStandardMaterial({ color: 0x8aa8a0, roughness: 0.05, metalness: 0.4 }), s * 0.04, 0.09, 0.03, -1.2, 0, 0);
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 12), mats.metalDark, 0, 0.04, 0.11, Math.PI / 2, 0, 0);
      break;
    }
    case 'cutters': {
      add(new THREE.BoxGeometry(0.5, 0.025, 0.03), mats.doorRed, -0.05, 0.015, -0.03, 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.5, 0.025, 0.03), mats.doorRed, -0.05, 0.015, 0.03, 0, -0.08, 0);
      add(new THREE.BoxGeometry(0.12, 0.03, 0.05), mats.metal, 0.25, 0.015, 0);
      break;
    }
    case 'note':
      add(new THREE.BoxGeometry(0.21, 0.002, 0.29), mats.paper, 0, 0.001, 0, 0, 0.15, 0);
      break;
    default:
      add(new THREE.BoxGeometry(0.1, 0.1, 0.1), mats.metal);
  }
  return g;
}
