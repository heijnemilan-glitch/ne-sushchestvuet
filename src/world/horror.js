// Хоррор-слой уровня: шкафчики-укрытия (с открывающейся дверцей), реалистичная кровь, надписи-подсказки,
// капающая кровь и вода, мусор, провода, искрящие лампы, настоящее зеркало в палате, повешенное тело.
// Надписи на стенах — диегетическое обучение: из них игрок узнаёт, как выжить рядом с «Оно».

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Button } from './objects.js';
import { mulberry32 } from '../core/rng.js';
import { SEW, BAL } from './level.js';

const rnd = mulberry32(777);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// оттенки крови: свежая (ярче, влажная) и запёкшаяся (тёмная, матовая)
const FRESH = [96, 8, 6];
const DRIED = [48, 6, 4];
const rgba = (c, a, k = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

// капля неправильной формы: много наложенных кругов + тёмная кромка
function blob(g, x, y, r, col, irregular = 0.45) {
  const n = 7 + Math.floor(r / 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * irregular;
    const rr = r * (0.45 + rnd() * 0.55);
    const gx = x + Math.cos(a) * d;
    const gy = y + Math.sin(a) * d;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
    gr.addColorStop(0, rgba(col, 0.95, 1.08));
    gr.addColorStop(0.75, rgba(col, 0.92, 0.9));
    gr.addColorStop(0.92, rgba(col, 0.95, 0.55)); // кромка темнее — кровь подсыхает с краёв
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(gx, gy, rr, 0, Math.PI * 2);
    g.fill();
  }
}

// брызги-спутники с «хвостами» в направлении удара
function spatter(g, cx, cy, count, maxR, col, dirA) {
  for (let i = 0; i < count; i++) {
    const a = dirA + (rnd() - 0.5) * 1.6;
    const d = maxR * (0.4 + rnd() * 0.8);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const r = 1.5 + rnd() * 5;
    g.fillStyle = rgba(col, 0.9);
    g.beginPath();
    g.ellipse(x, y, r * 1.8, r, a, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(x - Math.cos(a) * r * 2.4, y - Math.sin(a) * r * 2.4, r * 0.9, r * 0.4, a, 0, Math.PI * 2);
    g.fill();
  }
}

function bloodTexture(kind) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const col = kind === 'dried' ? DRIED : FRESH;
  if (kind === 'splat' || kind === 'dried') {
    blob(g, S / 2, S / 2, 95, col);
    for (let i = 0; i < 6; i++) blob(g, S / 2 + (rnd() - 0.5) * 220, S / 2 + (rnd() - 0.5) * 220, 12 + rnd() * 28, col, 0.3);
    spatter(g, S / 2, S / 2, 60, 210, col, rnd() * 6.28);
  } else if (kind === 'pool') {
    blob(g, S / 2, S / 2, 170, col, 0.35);
    for (let i = 0; i < 5; i++) blob(g, S / 2 + (rnd() - 0.5) * 300, S / 2 + (rnd() - 0.5) * 300, 30 + rnd() * 40, col, 0.3);
  } else if (kind === 'hand') {
    g.fillStyle = rgba(col, 0.88);
    g.beginPath();
    g.ellipse(256, 320, 92, 110, 0, 0, Math.PI * 2);
    g.fill();
    [[-78, -90, 0.35, 76], [-28, -150, 0.1, 86], [24, -158, -0.05, 88], [74, -128, -0.2, 76], [124, -10, -0.9, 62]].forEach(([dx, dy, rot, len]) => {
      g.save();
      g.translate(256 + dx, 300 + dy);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, 0, 22, len, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
    // смазанные полосы пальцев вниз
    for (let i = 0; i < 4; i++) {
      const x = 186 + i * 42;
      const gr = g.createLinearGradient(0, 380, 0, 512);
      gr.addColorStop(0, rgba(col, 0.8));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x, 360, 26, 152);
    }
    // пятна «кожи» без крови — делают отпечаток живым
    for (let i = 0; i < 40; i++) {
      g.clearRect(150 + rnd() * 210, 220 + rnd() * 200, 3 + rnd() * 6, 2 + rnd() * 4);
    }
  } else if (kind === 'drag') {
    for (let i = 0; i < 7; i++) {
      const x = 130 + i * 38 + rnd() * 20;
      const w = 14 + rnd() * 22;
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, rgba(col, 0));
      gr.addColorStop(0.15, rgba(col, 0.7));
      gr.addColorStop(0.7, rgba(col, 0.55, 0.8));
      gr.addColorStop(1, rgba(col, 0.15));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 20, S * 0.3, x - 20, S * 0.6, x + 8, S);
      g.lineTo(x + w + 8, S);
      g.bezierCurveTo(x + w - 20, S * 0.6, x + w + 20, S * 0.3, x + w, 0);
      g.fill();
    }
    for (let i = 0; i < 10; i++) blob(g, 140 + rnd() * 240, rnd() * S, 8 + rnd() * 16, col, 0.3);
  } else if (kind === 'drips') {
    // подтёки по стене
    blob(g, S / 2, 70, 60, col, 0.6);
    for (let i = 0; i < 9; i++) {
      const x = S / 2 - 90 + rnd() * 180;
      const len = 120 + rnd() * 330;
      const w = 4 + rnd() * 9;
      const gr = g.createLinearGradient(0, 70, 0, 70 + len);
      gr.addColorStop(0, rgba(col, 0.9));
      gr.addColorStop(0.85, rgba(col, 0.85, 0.8));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - w / 2, 70, w, len);
      g.fillStyle = rgba(col, 0.9, 0.8);
      g.beginPath();
      g.arc(x, 70 + len - 6, w * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'footprints') {
    // кровавые следы ботинок, левый-правый
    g.fillStyle = rgba(col, 0.75);
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 120;
      const x = i % 2 ? 300 : 210;
      const k = 1 - i * 0.18; // следы бледнеют — кровь на подошве кончается
      g.globalAlpha = k;
      g.beginPath();
      g.ellipse(x, y, 30, 46, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(x, y + 66, 24, 24, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (kind === 'grime') {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(10, 12, 8, ${0.04 + rnd() * 0.08})`;
      g.beginPath();
      g.arc(S / 2 + (rnd() - 0.5) * 400, S / 2 + (rnd() - 0.5) * 400, 20 + rnd() * 80, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'puddle') {
    g.fillStyle = 'rgba(6, 8, 8, 0.85)';
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      const r = 180 + rnd() * 60;
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r * 0.7);
    }
    g.fill();
  }
  return tex(c);
}

// надпись «кровью» с подтёками
function writingTexture(lines, { size = 92, w = 1024 } = {}) {
  const h = Math.round(size * 1.35 * lines.length + 160);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  lines.forEach((line, li) => {
    const y = 20 + li * size * 1.35;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = rgba(k < 2 ? DRIED : FRESH, 0.6 + rnd() * 0.25);
      g.save();
      g.translate(w / 2 + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6);
      g.rotate((rnd() - 0.5) * 0.04);
      g.fillText(line, 0, 0);
      g.restore();
    }
    const width = g.measureText(line).width;
    for (let d = 0; d < line.length * 0.8; d++) {
      const x = w / 2 - width / 2 + rnd() * width;
      const len = 20 + rnd() * 120;
      const gr = g.createLinearGradient(0, y + size * 0.8, 0, y + size * 0.8 + len);
      gr.addColorStop(0, rgba(FRESH, 0.75));
      gr.addColorStop(1, rgba(FRESH, 0));
      g.fillStyle = gr;
      g.fillRect(x, y + size * 0.75, 2 + rnd() * 4, len);
    }
  });
  return { t: tex(c), aspect: w / h };
}

export class Horror {
  constructor(level) {
    this.level = level;
    this.game = level.game;
    this.b = level.b;
    this.m = level.m;
    this.lockers = [];
    this.sparks = [];
    this.drips = [];
    this.tex = {};
    for (const k of ['splat', 'dried', 'pool', 'hand', 'drag', 'drips', 'footprints', 'grime', 'puddle']) this.tex[k] = bloodTexture(k);
    this.build();
  }

  // плоская наклейка на стену/пол. wet — влажный блеск (свежая кровь, лужи)
  decal(t, x, y, z, { ry = 0, w = 1, h = 1, floor = false, zone, opacity = 1, rz = 0, wet = false } = {}) {
    const mat = wet
      ? new THREE.MeshPhysicalMaterial({ map: t, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 })
      : new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.75 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (floor) {
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rz;
    } else {
      m.rotation.y = ry;
      m.rotation.z = rz;
    }
    m.receiveShadow = true;
    this.b.groupOf(zone).add(m);
    return m;
  }

  write(lines, x, y, z, ry, zone, { width = 2.2, size } = {}) {
    const { t, aspect } = writingTexture(lines, { size });
    return this.decal(t, x, y, z, { ry, w: width, h: width / aspect, zone, opacity: 0.94 });
  }

  // Шкафчик: в нём можно спрятаться. (nx, nz) — куда смотрит дверца. Дверца — на петле, открывается анимацией.
  locker(x, z, nx, nz, zone, { y = 0, corpse = false } = {}) {
    const { b, m } = this;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.95, 0.55), m.metalDark);
    body.position.y = 0.975;
    body.material = m.metalDark;
    g.add(body);
    const hinge = new THREE.Group();
    hinge.position.set(-0.28, 0, 0.29);
    const door = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.85, 0.03), m.metal);
    plate.position.set(0.28, 0.97, 0);
    door.add(plate);
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.01), m.black);
      slit.position.set(0.28, 1.45 + i * 0.05, 0.016);
      door.add(slit);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.03), m.metal);
    handle.position.set(0.5, 1.0, 0.03);
    door.add(handle);
    hinge.add(door);
    g.add(hinge);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(nx, nz);
    b.groupOf(zone).add(g);
    const hw = Math.abs(nx) > 0.5 ? 0.28 : 0.31;
    const hd = Math.abs(nx) > 0.5 ? 0.31 : 0.28;
    b.addCollider({ x0: x - hw, x1: x + hw, y0: y, y1: y + 1.95, z0: z - hd, z1: z + hd }, 'locker');
    const locker = {
      inside: new THREE.Vector3(x, y, z),
      front: new THREE.Vector3(x + nx * 0.75, y, z + nz * 0.75),
      yaw: Math.atan2(-nx, -nz),
      hinge,
      door: plate,
      corpse,
      group: g,
    };
    this.level.add(
      new Button(this.game, {
        id: `locker_${this.lockers.length}`,
        mesh: g,
        zone,
        prompt: () => (this.game.player.hiddenIn === locker ? 'Выйти' : 'Спрятаться в шкафчик'),
        action: () => this.game.toggleHide(locker),
      })
    );
    this.lockers.push(locker);
    return locker;
  }

  cable(x0, z0, x1, z1, top, sag, zone) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, top - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t));
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 5, false), this.m.rubber);
    mesh.castShadow = true;
    this.b.groupOf(zone).add(mesh);
  }

  papers(cx, cz, r, n, zone, y = 0) {
    const geo = new THREE.PlaneGeometry(0.21, 0.29);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, this.m.paper);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rnd() * Math.PI * 2;
      p.position.set(cx + (rnd() - 0.5) * r * 2, y + 0.004 + i * 0.0004, cz + (rnd() - 0.5) * r * 2);
      p.receiveShadow = true;
      this.b.groupOf(zone).add(p);
    }
  }

  ceilingHole(x, z, y, zone) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), this.m.black);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, y - 0.005, z);
    this.b.groupOf(zone).add(hole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), this.m.ceiling);
    panel.position.set(x + 0.2, y - 0.55, z + 0.1);
    panel.rotation.set(0.9, 0.3, 0.2);
    panel.castShadow = true;
    this.b.groupOf(zone).add(panel);
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), this.m.ceiling);
    fallen.position.set(x - 0.3, 0.02, z + 0.4);
    fallen.rotation.set(0.05, 0.7, 0.1);
    this.b.groupOf(zone).add(fallen);
  }

  gurney(x, z, ry, zone, withBag = true) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 2), this.m.metal);
    top.position.y = 0.8;
    g.add(top);
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), this.m.metalDark);
      leg.position.set(sx, 0.4, sz);
      g.add(leg);
    }
    if (withBag) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.3, 6, 12), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.1 }));
      bag.rotation.x = Math.PI / 2;
      bag.scale.set(1, 1, 0.65);
      bag.position.y = 0.98;
      g.add(bag);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    const across = Math.abs(Math.sin(ry)) > 0.5;
    const hx = across ? 1.05 : 0.4;
    const hz = across ? 0.4 : 1.05;
    this.b.addCollider({ x0: x - hx, x1: x + hx, y0: 0, y1: 1.1, z0: z - hz, z1: z + hz }, 'prop');
  }

  wheelchair(x, z, ry, zone) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), this.m.rubber);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.04), this.m.rubber);
    back.position.set(0, 0.75, 0.22);
    g.add(seat, back);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 20), this.m.metal);
      wheel.position.set(s * 0.26, 0.3, 0.05);
      wheel.rotation.y = Math.PI / 2;
      g.add(wheel);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    this.b.addCollider({ x0: x - 0.35, x1: x + 0.35, y0: 0, y1: 0.9, z0: z - 0.35, z1: z + 0.35 }, 'prop');
    return g;
  }

  toppledChair(x, z, zone) {
    const c = this.level.p.chair(x, z, rnd() * 6, zone);
    c.rotation.x = Math.PI / 2;
    c.position.y = 0.22;
  }

  sparker(x, y, z, zone) {
    this.sparks.push({ x, y, z, zone, t: 1 + rnd() * 3, parts: [] });
  }

  // капель: blood — кровь с потолка, иначе вода
  drip(x, y0, z, y1, zone, blood = false) {
    this.drips.push({ x, y0, z, y1, zone, blood, t: rnd() * 2, drops: [] });
  }

  // Настоящее зеркало в палате (отражение рендерится отдельно, только пока игрок в палате).
  mirror() {
    const s = this.level.mirrorSpot;
    const geo = new THREE.PlaneGeometry(0.46, 0.62);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.mirrorMesh = new Reflector(geo, { clipBias: 0.003, textureWidth: 384 * ratio, textureHeight: 512 * ratio, color: 0x8a9696 });
    this.mirrorMesh.position.set(s.x, s.y, s.z);
    this.mirrorMesh.rotation.y = -Math.PI / 2;
    this.b.groupOf('start').add(this.mirrorMesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.68, 0.52), this.m.metalDark);
    frame.position.set(s.x + 0.015, s.y, s.z);
    this.b.groupOf('start').add(frame);
    // пятна и трещина на зеркале
    const crack = canvas(256, 340);
    const cg = crack.getContext('2d');
    cg.strokeStyle = 'rgba(220,230,230,0.5)';
    cg.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      cg.beginPath();
      cg.moveTo(170, 90);
      let px = 170;
      let py = 90;
      for (let k = 0; k < 5; k++) {
        px += (rnd() - 0.5) * 80;
        py += (rnd() - 0.3) * 70;
        cg.lineTo(px, py);
      }
      cg.stroke();
    }
    cg.fillStyle = rgba(DRIED, 0.7);
    cg.fillRect(20, 280, 60, 40);
    const overlay = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex(crack), transparent: true, depthWrite: false }));
    overlay.position.set(s.x - 0.004, s.y, s.z);
    overlay.rotation.y = -Math.PI / 2;
    this.b.groupOf('start').add(overlay);
  }

  build() {
    const T = this.tex;
    const L = this.level;
    // ── шкафчики-укрытия
    this.locker(-1.62, -4.2, 1, 0, 'corridor');
    this.locker(1.62, -14.5, -1, 0, 'corridor');
    this.locker(-12, -6.38, 0, -1, 'west', { corpse: true });
    this.locker(-7.2, -9.62, 0, 1, 'west');
    this.locker(5, -9.62, 0, 1, 'east');
    this.locker(-16.38, -4, -1, 0, 'archive');
    this.locker(29.62, -16.5, -1, 0, 'generator');
    this.locker(-11.62, -26, 1, 0, 'hall');
    this.locker(11.62, -40, -1, 0, 'hall');
    this.locker(-12.38, -43, -1, 0, 'observation', { y: BAL });
    this.locker(103.62, -10, -1, 0, 'pump', { y: SEW });
    this.locker(105.62, -5, -1, 0, 'lab');

    // ── надписи-подсказки
    this.write(['ЗДЕСЬ ОНО', 'ТЕБЯ НЕ ТРОНЕТ'], 1.88, 1.7, -1.6, -Math.PI / 2, 'corridor', { width: 1.6 });
    this.write(['ОНО СЛЫШИТ', 'КАК ТЫ БЕЖИШЬ'], -1.88, 1.6, -13.8, Math.PI / 2, 'corridor', { width: 2 });
    this.write(['0-7  0-7  0-7'], -1.88, 2.95, -16, Math.PI / 2, 'corridor', { width: 1.5 });
    this.write(['ФОНАРЬ ВИДНО', 'ИЗДАЛЕКА'], -11, 1.7, -9.88, 0, 'west', { width: 2.2 });
    this.write(['НЕ ОБОРАЧИВАЙСЯ'], 11, 1.8, -6.12, Math.PI, 'east', { width: 2.6 });
    this.write(['ПРЯЧЬСЯ В ШКАФ', 'НО НЕ У НЕГО НА ГЛАЗАХ'], 6, 2.3, -24.12, Math.PI, 'hall', { width: 3 });
    this.write(['ПРИСЯДЬ — И ОНО', 'ТЕБЯ НЕ УСЛЫШИТ'], -11.88, 2.0, -35, Math.PI / 2, 'hall', { width: 2.6 });
    this.write(['МЫ ВСЕ', 'ЗДЕСЬ БЫЛИ'], -24.5, 3.5, -2.12, Math.PI, 'archive', { width: 2 });
    this.write(['ВЕРНИ СВЕТ', 'И ОНО УСНЁТ?'], 16.12, 2.6, -13, Math.PI / 2, 'generator', { width: 1.9 });
    this.write(['ОН СМОТРИТ ТУДА', 'ГДЕ СПРЯТАНО'], -17, BAL + 2.5, -43.88, 0, 'observation', { width: 2.2, size: 80 });
    this.write(['ВНИЗУ ДЫШАТ'], 22.12, SEW + 2.8, -11, Math.PI / 2, 'sewer', { width: 2.2 });
    this.write(['НЕ СМОТРИ', 'В ВОДУ'], 40, SEW + 2.4, -17.88, 0, 'canal', { width: 1.8 });
    this.write(['ВЫХОД ЕСТЬ', 'НО ОН ТОЖЕ ПОМНИТ'], 97, SEW + 3.4, -23.88, 0, 'pump', { width: 2.6 });

    // ── кровь
    this.decal(T.hand, -1.86, 1.15, -15.7, { ry: Math.PI / 2, w: 0.32, h: 0.32, zone: 'corridor', wet: true });
    this.decal(T.hand, -1.86, 0.92, -16.35, { ry: Math.PI / 2, w: 0.28, h: 0.28, zone: 'corridor', rz: 0.6 });
    for (let i = 0; i < 5; i++) this.decal(T.footprints, (i % 2 ? 0.35 : -0.35), 0.006, -1.2 - i * 1.6, { floor: true, w: 0.55, h: 1.1, zone: 'corridor', rz: Math.PI, opacity: 1 - i * 0.15 });
    for (let i = 0; i < 6; i++) this.decal(T.drag, -3 - i * 2.1, 0.006, -8 + (rnd() - 0.5) * 0.3, { floor: true, w: 0.8, h: 2.2, zone: 'west', rz: Math.PI / 2 + (rnd() - 0.5) * 0.2, opacity: 0.9, wet: i < 2 });
    this.decal(T.drag, -0.6, 0.006, -7.6, { floor: true, w: 0.8, h: 2.2, zone: 'corridor', rz: 0.9, wet: true });
    this.decal(T.pool, 11.4, 0.006, -7.2, { floor: true, w: 2.2, h: 2.2, zone: 'east', wet: true });
    this.decal(T.drips, 13, 1.7, -9.88, { w: 1.2, h: 1.6, zone: 'east' });
    this.decal(T.splat, 20, 2.3, -19.86, { w: 1.4, h: 1.4, zone: 'generator', opacity: 0.85 });
    this.decal(T.dried, 22, 0.006, -10, { floor: true, w: 1.6, h: 1.6, zone: 'generator' });
    this.decal(T.splat, -20.6, 0.006, -7.6, { floor: true, w: 1.4, h: 1.4, zone: 'archive', opacity: 0.8 });
    this.decal(T.hand, -11.88, 1.3, -29.5, { ry: Math.PI / 2, w: 0.3, h: 0.3, zone: 'hall', rz: -0.4, wet: true });
    for (let i = 0; i < 7; i++) this.decal(T.drag, -3 + i * 0.45, 0.006, -29.5 - i * 2.4, { floor: true, w: 0.9, h: 2.5, zone: 'hall', rz: 0.18, opacity: 0.85, wet: i > 4 });
    this.decal(T.pool, 0.4, 0.006, -46.6, { floor: true, w: 2.4, h: 1.8, zone: 'hall', wet: true });
    this.decal(T.drips, 0, 3.2, -47.88, { w: 1.6, h: 2.2, zone: 'hall' });
    this.decal(T.hand, -21.96, BAL + 1.7, -38.5, { ry: Math.PI / 2, w: 0.3, h: 0.3, zone: 'observation', wet: true });
    this.decal(T.pool, 29.2, SEW + 0.006, -20.4, { floor: true, w: 1.8, h: 1.8, zone: 'sewer', wet: true });
    this.decal(T.drips, 31.88, SEW + 2.5, -14.5, { ry: -Math.PI / 2, w: 1, h: 1.6, zone: 'sewer' });
    this.decal(T.pool, -71, 0.006, -12.6, { floor: true, w: 2.4, h: 2.4, zone: 'room07', wet: true });
    this.decal(T.splat, 97, SEW + 0.006, -16, { floor: true, w: 1.8, h: 1.8, zone: 'pump', wet: true });
    // старое пятно на матрасе палаты — двигается вместе с койкой
    const stain = this.decal(T.dried, 0, 0, 0, { floor: true, w: 0.7, h: 0.9, zone: 'start', opacity: 0.85 });
    stain.position.set(0.05, 0.605, 0.25);
    L.bedGroup.add(stain);

    // ── грязь и лужи
    [[0, -9, 'corridor'], [0, -18, 'corridor'], [-6, -8, 'west'], [12, -8, 'east'], [2, -30, 'hall'], [-6, -40, 'hall'], [-21, -10, 'archive'], [20, -6, 'generator']].forEach(([x, z, zone]) =>
      this.decal(T.grime, x, 0.004, z, { floor: true, w: 3.2, h: 3.2, zone, rz: rnd() * 6 })
    );
    this.decal(T.puddle, -0.8, 0.005, -19.2, { floor: true, w: 1.6, h: 1.2, zone: 'corridor', wet: true });
    this.decal(T.puddle, 21, 0.005, -8.5, { floor: true, w: 2.2, h: 1.6, zone: 'generator', wet: true });
    this.decal(T.puddle, -4, 0.005, -33, { floor: true, w: 2, h: 1.6, zone: 'hall', wet: true });

    // ── мусор и разруха
    this.papers(0, -6, 1.4, 18, 'corridor');
    this.papers(-8, -8, 1.4, 16, 'west');
    this.papers(-20, -8, 2, 30, 'archive');
    this.papers(-16, -38, 1.6, 18, 'observation', BAL);
    this.papers(1, -32, 2.5, 24, 'hall');
    this.toppledChair(-13.4, -7.4, 'west');
    this.toppledChair(-20.4, -10.8, 'archive');
    this.toppledChair(-15, -40, 'observation');
    this.toppledChair(4, -34, 'hall');
    this.gurney(11.5, -7.2, Math.PI / 2, 'east');
    this.gurney(-1.2, -20.5, 0.15, 'corridor', false);
    this.wheelchair(1.3, -9.4, 2.4, 'corridor');
    this.ceilingHole(0, -10.8, 3.6, 'corridor');
    this.ceilingHole(6.5, -8.2, 3.6, 'east');
    this.ceilingHole(-19.5, -9, 4.5, 'archive');
    this.cable(-0.6, -10.5, 0.4, -11.4, 3.58, 1.0, 'corridor');
    this.cable(6.2, -8, 7, -8.5, 3.58, 1.2, 'east');
    this.cable(-19.2, -8.6, -19.8, -9.4, 4.48, 1.4, 'archive');
    this.cable(-3, -28, 3, -33, 9.9, 3.5, 'hall');
    this.cable(4, -41, -2, -45, 9.9, 4.2, 'hall');
    this.sparker(0, 3.55, -14, 'corridor');
    this.sparker(12.5, 3.55, -8, 'east');
    this.sparker(97, SEW + 5.9, -15, 'pump');

    // ── капель: кровь из дыры в потолке, вода в канализации и протечках
    this.drip(0.15, 3.58, -10.7, 0, 'corridor', true);
    this.decal(T.pool, 0.15, 0.007, -10.7, { floor: true, w: 0.8, h: 0.8, zone: 'corridor', wet: true });
    this.drip(-0.8, 3.58, -19.2, 0, 'corridor');
    this.drip(25, SEW + 5, -11, SEW, 'sewer');
    this.drip(28, SEW + 5, -19, SEW, 'sewer');
    this.drip(38, SEW + 4.5, -17.2, SEW, 'canal');
    this.drip(52, SEW + 4.5, -12.8, SEW, 'canal');
    this.drip(99, SEW + 6, -20, SEW, 'pump');
    this.drip(21, 7, -8.5, 0, 'generator');

    // ── повешенное тело (появится в скримере над дырой в потолке)
    const hang = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), this.m.rubber);
    rope.position.y = -0.65;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 6, 10), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 }));
    body.position.y = -2.0;
    hang.add(rope, body);
    hang.position.set(6.5, 3.6, -8.2);
    hang.visible = false;
    this.b.groupOf('east').add(hang);
    this.hangingBody = hang;

    this.mirror();
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    // зеркало рендерим, только когда игрок в палате
    if (this.mirrorMesh) this.mirrorMesh.visible = !!(g.currentZone && g.currentZone.id === 'start');
    for (const s of this.sparks) {
      s.t -= dt;
      if (s.t <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 18 && Math.abs(p.y - s.y) < 8) {
        s.t = 2 + rnd() * 6;
        g.audio.play('spark', new THREE.Vector3(s.x, s.y, s.z));
        for (let i = 0; i < 10; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), this.m.lampWarm);
          m.position.set(s.x + (rnd() - 0.5) * 0.3, s.y - 0.08, s.z + (rnd() - 0.5) * 0.3);
          m.userData.v = new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.8, (rnd() - 0.5) * 1.6);
          m.userData.life = 0.6 + rnd() * 0.6;
          m.userData.floor = s.y - 3.6;
          this.b.groupOf(s.zone).add(m);
          s.parts.push(m);
        }
      }
      s.parts = s.parts.filter((m) => {
        m.userData.life -= dt;
        m.userData.v.y -= 9.8 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        if (m.position.y < m.userData.floor + 0.01) {
          m.position.y = m.userData.floor + 0.01;
          m.userData.v.multiplyScalar(0.3);
        }
        if (m.userData.life <= 0) {
          m.parent && m.parent.remove(m);
          m.geometry.dispose();
          return false;
        }
        return true;
      });
    }
    // капель
    for (const d of this.drips) {
      const near = Math.hypot(p.x - d.x, p.z - d.z) < 16 && Math.abs(p.y - d.y1) < 6;
      d.t -= dt;
      if (d.t <= 0 && near) {
        d.t = (d.blood ? 1.4 : 0.9) + rnd() * 2.2;
        const drop = new THREE.Mesh(new THREE.SphereGeometry(d.blood ? 0.018 : 0.014, 5, 4), d.blood ? this.dropBlood || (this.dropBlood = new THREE.MeshPhysicalMaterial({ color: 0x5a0604, roughness: 0.1, clearcoat: 1 })) : this.dropWater || (this.dropWater = new THREE.MeshPhysicalMaterial({ color: 0x9ab0b0, roughness: 0.05, transparent: true, opacity: 0.7, clearcoat: 1 })));
        drop.scale.y = 1.8;
        drop.position.set(d.x, d.y0 - 0.02, d.z);
        drop.userData.v = 0;
        this.b.groupOf(d.zone).add(drop);
        d.drops.push(drop);
      }
      d.drops = d.drops.filter((drop) => {
        drop.userData.v += 9.8 * dt;
        drop.position.y -= drop.userData.v * dt;
        if (drop.position.y <= d.y1 + 0.01) {
          drop.parent && drop.parent.remove(drop);
          drop.geometry.dispose();
          g.audio.play(d.blood ? 'drip_blood' : 'drip', new THREE.Vector3(d.x, d.y1, d.z));
          return false;
        }
        return true;
      });
    }
    // раскачивание тела
    if (this.hangingBody && this.hangingBody.visible) {
      this.hangT = (this.hangT || 0) + dt;
      this.hangingBody.rotation.z = Math.sin(this.hangT * 1.6) * 0.18 * Math.exp(-this.hangT * 0.05);
      this.hangingBody.rotation.x = Math.sin(this.hangT * 1.1) * 0.08;
    }
  }
}
