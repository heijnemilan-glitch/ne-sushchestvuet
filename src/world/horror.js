// Хоррор-слой уровня: шкафчики-укрытия, кровь, надписи-подсказки, мусор, провода, искрящие лампы.
// Надписи на стенах — диегетическое обучение: из них игрок узнаёт, как выжить рядом с «Оно».

import * as THREE from 'three';
import { Button } from './objects.js';
import { mulberry32 } from '../core/rng.js';

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

const BLOOD = 'rgba(70, 6, 4, ALPHA)';
const blood = (a) => BLOOD.replace('ALPHA', a);

// надпись «кровью» с подтёками
function writingTexture(lines, { size = 92, w = 1024, color } = {}) {
  const h = Math.round(size * 1.35 * lines.length + 120);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  lines.forEach((line, li) => {
    const y = 20 + li * size * 1.35;
    // несколько неровных проходов «кистью»
    for (let k = 0; k < 4; k++) {
      g.fillStyle = color || blood(0.55 + rnd() * 0.25);
      g.save();
      g.translate(w / 2 + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6);
      g.rotate((rnd() - 0.5) * 0.04);
      g.fillText(line, 0, 0);
      g.restore();
    }
    // подтёки
    const width = g.measureText(line).width;
    for (let d = 0; d < line.length * 0.7; d++) {
      const x = w / 2 - width / 2 + rnd() * width;
      const len = 20 + rnd() * 90;
      const grd = g.createLinearGradient(0, y + size * 0.8, 0, y + size * 0.8 + len);
      grd.addColorStop(0, blood(0.7));
      grd.addColorStop(1, blood(0));
      g.fillStyle = grd;
      g.fillRect(x, y + size * 0.75, 2 + rnd() * 4, len);
    }
  });
  return { t: tex(c), aspect: w / h };
}

function splatTexture(kind) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  if (kind === 'splat') {
    for (let i = 0; i < 30; i++) {
      const r = 6 + rnd() * 40 * (i === 0 ? 2 : 1);
      const a = rnd() * Math.PI * 2;
      const d = i === 0 ? 0 : rnd() * 90;
      g.fillStyle = blood(0.5 + rnd() * 0.4);
      g.beginPath();
      g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, r * (0.6 + rnd() * 0.5), a, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'hand') {
    g.fillStyle = blood(0.75);
    g.beginPath();
    g.ellipse(128, 160, 46, 56, 0, 0, Math.PI * 2);
    g.fill();
    [[-38, -40, 0.35], [-14, -70, 0.1], [12, -74, -0.05], [36, -60, -0.2], [62, 0, -0.9]].forEach(([dx, dy, rot]) => {
      g.save();
      g.translate(128 + dx, 150 + dy);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, 0, 11, 38, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
    // смазанный след вниз
    const grd = g.createLinearGradient(0, 180, 0, 256);
    grd.addColorStop(0, blood(0.6));
    grd.addColorStop(1, blood(0));
    g.fillStyle = grd;
    g.fillRect(88, 180, 80, 76);
  } else if (kind === 'drag') {
    for (let i = 0; i < 6; i++) {
      const x = 70 + i * 22 + rnd() * 10;
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, blood(0.0));
      grd.addColorStop(0.2, blood(0.55));
      grd.addColorStop(1, blood(0.25 + rnd() * 0.3));
      g.fillStyle = grd;
      g.fillRect(x, 0, 8 + rnd() * 10, 256);
    }
  } else if (kind === 'grime') {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(10, 12, 8, ${0.04 + rnd() * 0.08})`;
      g.beginPath();
      g.arc(128 + (rnd() - 0.5) * 200, 128 + (rnd() - 0.5) * 200, 10 + rnd() * 40, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'puddle') {
    g.fillStyle = 'rgba(6, 8, 8, 0.85)';
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const r = 90 + rnd() * 30;
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.7);
    }
    g.fill();
  }
  return tex(c);
}

export class Horror {
  constructor(level) {
    this.level = level;
    this.game = level.game;
    this.b = level.b;
    this.m = level.m;
    this.lockers = [];
    this.sparks = [];
    this.tex = { splat: splatTexture('splat'), hand: splatTexture('hand'), drag: splatTexture('drag'), grime: splatTexture('grime'), puddle: splatTexture('puddle') };
    this.build();
  }

  // плоская наклейка на стену/пол
  decal(t, x, y, z, { ry = 0, w = 1, h = 1, floor = false, zone, opacity = 1, rz = 0 } = {}) {
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: floor ? 0.3 : 0.8 });
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
    return this.decal(t, x, y, z, { ry, w: width, h: width / aspect, zone, opacity: 0.92 });
  }

  // Шкафчик: в нём можно спрятаться. front — направление дверцы (нормаль).
  locker(x, z, nx, nz, zone) {
    const { b, m } = this;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.95, 0.55), m.metalDark);
    body.position.y = 0.975;
    g.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.85, 0.03), m.metal);
    door.position.set(0, 0.97, 0.29);
    g.add(door);
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.01), m.black);
      slit.position.set(0, 1.45 + i * 0.05, 0.306);
      g.add(slit);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(nx, nz);
    b.groupOf(zone).add(g);
    const hw = Math.abs(nx) > 0.5 ? 0.28 : 0.31;
    const hd = Math.abs(nx) > 0.5 ? 0.31 : 0.28;
    b.addCollider({ x0: x - hw, x1: x + hw, y0: 0, y1: 1.95, z0: z - hd, z1: z + hd }, 'locker');
    const locker = {
      inside: new THREE.Vector3(x, 0, z),
      front: new THREE.Vector3(x + nx * 0.75, 0, z + nz * 0.75),
      yaw: Math.atan2(-nx, -nz),
      door,
    };
    const btn = new Button(this.game, {
      id: `locker_${this.lockers.length}`,
      mesh: g,
      zone,
      prompt: () => (this.game.player.hiddenIn === locker ? 'Выйти' : 'Спрятаться в шкафчик'),
      action: () => this.game.toggleHide(locker),
    });
    this.level.add(btn);
    this.lockers.push(locker);
  }

  // провисающий кабель с потолка
  cable(x0, z0, x1, z1, top, sag, zone) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, top - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 5, false);
    const mesh = new THREE.Mesh(geo, this.m.rubber);
    mesh.castShadow = true;
    this.b.groupOf(zone).add(mesh);
  }

  papers(cx, cz, r, n, zone) {
    const geo = new THREE.PlaneGeometry(0.21, 0.29);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, this.m.paper);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rnd() * Math.PI * 2;
      p.position.set(cx + (rnd() - 0.5) * r * 2, 0.004 + i * 0.0004, cz + (rnd() - 0.5) * r * 2);
      p.receiveShadow = true;
      this.b.groupOf(zone).add(p);
    }
  }

  // упавшая потолочная панель + чёрная дыра в потолке
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

  bodyBag(x, z, ry, zone) {
    const g = new THREE.Group();
    // каталка
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 2), this.m.metal);
    top.position.y = 0.8;
    g.add(top);
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), this.m.metalDark);
      leg.position.set(sx, 0.4, sz);
      g.add(leg);
    }
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.3, 6, 12), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.1 }));
    bag.rotation.x = Math.PI / 2;
    bag.scale.set(1, 1, 0.65);
    bag.position.y = 0.98;
    g.add(bag);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.b.groupOf(zone).add(g);
    // граница столкновений поворачивается вместе с каталкой
    const across = Math.abs(Math.sin(ry)) > 0.5;
    const hx = across ? 1.05 : 0.4;
    const hz = across ? 0.4 : 1.05;
    this.b.addCollider({ x0: x - hx, x1: x + hx, y0: 0, y1: 1.1, z0: z - hz, z1: z + hz }, 'prop');
  }

  toppledChair(x, z, zone) {
    const c = this.level.p.chair(x, z, rnd() * 6, zone);
    c.rotation.x = Math.PI / 2;
    c.position.y = 0.22;
  }

  // лампа, которая искрит
  sparker(x, y, z, zone) {
    this.sparks.push({ x, y, z, zone, t: 1 + rnd() * 3, parts: [] });
  }

  build() {
    const T = this.tex;
    // ── шкафчики-укрытия
    this.locker(-1.2, -4, 1, 0, 'corridor');
    this.locker(1.2, -16.5, -1, 0, 'corridor');
    this.locker(4, -9.2, 0, 1, 'east');
    this.locker(-11, -6.8, 0, -1, 'west');
    this.locker(-14.3, -3.6, -1, 0, 'archive');
    this.locker(23.7, -2.5, -1, 0, 'generator');
    this.locker(-5.7, -23.6, 1, 0, 'hall');
    this.locker(-6.3, -31.2, -1, 0, 'observation');

    // ── надписи-подсказки
    this.write(['ЗДЕСЬ ОНО', 'ТЕБЯ НЕ ТРОНЕТ'], 1.39, 1.7, -1.6, -Math.PI / 2, 'corridor', { width: 1.6 });
    this.write(['ОНО СЛЫШИТ', 'КАК ТЫ БЕЖИШЬ'], -1.39, 1.6, -12, Math.PI / 2, 'corridor', { width: 2 });
    this.write(['ФОНАРЬ ВИДНО', 'ИЗДАЛЕКА'], -10.5, 1.5, -9.38, 0, 'west', { width: 2.2 });
    this.write(['ПРЯЧЬСЯ В ШКАФ', 'НО НЕ У НЕГО НА ГЛАЗАХ'], 2.8, 2.1, -31.88, 0, 'hall', { width: 3 });
    this.write(['НЕ ОБОРАЧИВАЙСЯ'], 9, 1.7, -6.62, Math.PI, 'east', { width: 2.6 });
    this.write(['МЫ ВСЕ', 'ЗДЕСЬ БЫЛИ'], -21.6, 2.1, -13.88, 0, 'archive', { width: 2 });
    this.write(['ВЕРНИ СВЕТ', 'И ОНО УСНЁТ?'], 14.12, 1.9, -11.5, Math.PI / 2, 'generator', { width: 1.9 });
    this.write(['ОН СМОТРИТ ТУДА', 'ГДЕ СПРЯТАНО'], -15.88, 2.55, -27, Math.PI / 2, 'observation', { width: 2.2, size: 80 });
    this.write(['0-7  0-7  0-7'], -1.39, 2.55, -15, Math.PI / 2, 'corridor', { width: 1.5 });

    // ── кровь
    this.decal(T.hand, -1.36, 1.15, -14.7, { ry: Math.PI / 2, w: 0.35, h: 0.35, zone: 'corridor' });
    this.decal(T.hand, -1.36, 0.9, -15.35, { ry: Math.PI / 2, w: 0.3, h: 0.3, zone: 'corridor', rz: 0.6 });
    for (let i = 0; i < 4; i++) this.decal(T.drag, -2.5 - i * 2.2, 0.006, -8 + (rnd() - 0.5) * 0.4, { floor: true, w: 0.7, h: 2.3, zone: 'west', rz: Math.PI / 2 + (rnd() - 0.5) * 0.2, opacity: 0.85 });
    this.decal(T.drag, 0, 0.006, -7.2, { floor: true, w: 0.7, h: 2, zone: 'corridor', rz: 0.6, opacity: 0.8 });
    this.decal(T.splat, 9.4, 0.006, -8.1, { floor: true, w: 1.6, h: 1.6, zone: 'east' });
    this.decal(T.splat, 22.5, 1.4, -13.86, { w: 1.2, h: 1.2, zone: 'generator', opacity: 0.8 });
    this.decal(T.splat, -20, 0.006, -7.5, { floor: true, w: 1.3, h: 1.3, zone: 'archive', opacity: 0.7 });
    this.decal(T.hand, 5.88, 1.3, -26.6, { ry: -Math.PI / 2, w: 0.32, h: 0.32, zone: 'hall', rz: -0.4 });
    this.decal(T.splat, -70.5, 0.006, -12.2, { floor: true, w: 2, h: 2, zone: 'room07', opacity: 0.7 });

    // ── грязь и лужи
    [[0, -9, 'corridor'], [0, -17, 'corridor'], [-6, -8, 'west'], [11, -8, 'east'], [2, -27, 'hall'], [-18, -10, 'archive'], [18, -5, 'generator']].forEach(([x, z, zone]) =>
      this.decal(T.grime, x, 0.004, z, { floor: true, w: 3, h: 3, zone, rz: rnd() * 6 })
    );
    this.decal(T.puddle, 0.4, 0.005, -19.3, { floor: true, w: 1.6, h: 1.2, zone: 'corridor' });
    this.decal(T.puddle, 19.5, 0.005, -8.5, { floor: true, w: 2.2, h: 1.6, zone: 'generator' });
    this.decal(T.puddle, -3.5, 0.005, -28.5, { floor: true, w: 1.8, h: 1.4, zone: 'hall' });

    // ── мусор и разруха
    this.papers(0, -6, 1.2, 16, 'corridor');
    this.papers(-8, -8, 1.3, 14, 'west');
    this.papers(-18, -7.5, 2, 30, 'archive');
    this.papers(-10, -27, 1.6, 18, 'observation');
    this.papers(1, -26, 2, 14, 'hall');
    this.toppledChair(-12.6, -7.4, 'west');
    this.toppledChair(-18.4, -9.8, 'archive');
    this.toppledChair(-8.5, -29, 'observation');
    this.toppledChair(3.6, -30.4, 'hall');
    this.bodyBag(10.6, -7.9, Math.PI / 2, 'east');
    this.ceilingHole(0, -10.8, 3, 'corridor');
    this.ceilingHole(6.5, -8.2, 3, 'east');
    this.ceilingHole(-19.5, -8, 3.4, 'archive');
    this.ceilingHole(2.5, -24.5, 4, 'hall');
    this.cable(-0.6, -10.5, 0.4, -11.4, 2.98, 0.9, 'corridor');
    this.cable(6.2, -8, 7, -8.5, 2.98, 1.1, 'east');
    this.cable(2.2, -24.2, 3.1, -25, 3.98, 1.5, 'hall');
    this.cable(-19.2, -7.6, -19.8, -8.4, 3.38, 1.3, 'archive');
    this.sparker(0, 2.95, -13.5, 'corridor');
    this.sparker(11, 2.95, -8, 'east');
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    for (const s of this.sparks) {
      s.t -= dt;
      if (s.t <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 18) {
        s.t = 2 + rnd() * 6;
        g.audio.play('spark', new THREE.Vector3(s.x, s.y, s.z));
        for (let i = 0; i < 10; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), this.m.lampWarm);
          m.position.set(s.x + (rnd() - 0.5) * 0.3, s.y - 0.08, s.z + (rnd() - 0.5) * 0.3);
          m.userData.v = new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.8, (rnd() - 0.5) * 1.6);
          m.userData.life = 0.6 + rnd() * 0.6;
          this.b.groupOf(s.zone).add(m);
          s.parts.push(m);
        }
      }
      s.parts = s.parts.filter((m) => {
        m.userData.life -= dt;
        m.userData.v.y -= 9.8 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        if (m.position.y < 0.01) {
          m.position.y = 0.01;
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
  }
}
