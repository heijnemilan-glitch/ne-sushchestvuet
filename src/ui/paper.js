// Старая бумага для записок и карты: пожелтевшая, с пятнами воды и кофе, ржавыми точками (фоксинг),
// сгибами, подпалёнными и рваными краями. Текстура рисуется на canvas один раз и подставляется в CSS.

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function draw(w, h, seed, { folds = 2 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const r = rng(seed);
  // основа: неровный жёлто-серый тон
  const base = g.createRadialGradient(w * 0.45, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  base.addColorStop(0, '#ddd0ac');
  base.addColorStop(0.55, '#cdbb8e');
  base.addColorStop(1, '#a88d5c');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // волокна и шум бумаги
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 18;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(90,70,40,${0.03 + r() * 0.05})`;
    g.lineWidth = 0.6;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 6);
    g.stroke();
  }
  // пятна воды: светлая середина, тёмная кайма
  for (let i = 0; i < 5; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 40 + r() * 120;
    const gr = g.createRadialGradient(x, y, rad * 0.6, x, y, rad);
    gr.addColorStop(0, 'rgba(120,90,40,0.0)');
    gr.addColorStop(0.85, 'rgba(110,80,35,0.16)');
    gr.addColorStop(1, 'rgba(110,80,35,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // кольцо от кружки
  {
    const x = w * (0.62 + r() * 0.25);
    const y = h * (0.15 + r() * 0.25);
    const rad = 34 + r() * 14;
    g.strokeStyle = 'rgba(100,62,28,0.32)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, rad, 0.3, Math.PI * 1.85);
    g.stroke();
    g.strokeStyle = 'rgba(100,62,28,0.12)';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(x + 2, y + 1, rad - 3, 0, Math.PI * 2);
    g.stroke();
  }
  // ржавые точки (фоксинг)
  for (let i = 0; i < 90; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 0.8 + r() * (r() < 0.1 ? 6 : 2.4);
    g.fillStyle = `rgba(130,80,30,${0.15 + r() * 0.35})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // бурое пятно (кровь?) у края
  {
    const x = r() < 0.5 ? w * 0.08 : w * 0.9;
    const y = h * (0.6 + r() * 0.3);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(80,22,12,${0.12 + r() * 0.12})`;
      g.beginPath();
      g.ellipse(x + (r() - 0.5) * 40, y + (r() - 0.5) * 30, 6 + r() * 22, 4 + r() * 14, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // сгибы: тёмная линия и светлый блик рядом
  const fold = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(70,52,26,0.32)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = 'rgba(255,248,225,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0 + 2, y0 + 2);
    g.lineTo(x1 + 2, y1 + 2);
    g.stroke();
  };
  if (folds >= 1) fold(w * 0.5 + (r() - 0.5) * 8, 0, w * 0.5 + (r() - 0.5) * 8, h);
  if (folds >= 2) fold(0, h * 0.5 + (r() - 0.5) * 8, w, h * 0.5 + (r() - 0.5) * 8);
  // подпалённые и потемневшие края
  const edge = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(50,30,12,0.75)');
    gr.addColorStop(0.35, 'rgba(90,60,25,0.25)');
    gr.addColorStop(1, 'rgba(90,60,25,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  const m = Math.min(w, h) * 0.09;
  edge(0, 0, m, 0);
  edge(w, 0, w - m, 0);
  edge(0, 0, 0, m);
  edge(0, h, 0, h - m);
  // обгоревший угол
  {
    const cx = r() < 0.5 ? w : 0;
    const cy = h;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.32);
    gr.addColorStop(0, 'rgba(20,10,4,0.95)');
    gr.addColorStop(0.45, 'rgba(60,30,10,0.55)');
    gr.addColorStop(1, 'rgba(60,30,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  return c.toDataURL('image/jpeg', 0.86);
}

// Рваный край: многоугольник с мелкими зубцами по периметру (для CSS clip-path).
function tornClip(seed, amp = 1.1, step = 2.5) {
  const r = rng(seed);
  const pts = [];
  const j = () => (r() * amp).toFixed(2);
  for (let x = 0; x <= 100; x += step) pts.push(`${x}% ${j()}%`);
  for (let y = 0; y <= 100; y += step) pts.push(`${100 - j()}% ${y}%`);
  for (let x = 100; x >= 0; x -= step) pts.push(`${x}% ${100 - j()}%`);
  for (let y = 100; y >= 0; y -= step) pts.push(`${j()}% ${y}%`);
  return `polygon(${pts.join(',')})`;
}

let installed = false;
export function installOldPaper() {
  if (installed) return;
  installed = true;
  try {
    const root = document.documentElement.style;
    root.setProperty('--paper-note', `url(${draw(700, 900, 11, { folds: 2 })})`);
    root.setProperty('--paper-map', `url(${draw(1400, 900, 29, { folds: 2 })})`);
    root.setProperty('--torn-note', tornClip(5, 1.0, 2));
    root.setProperty('--torn-map', tornClip(9, 0.7, 1.4));
  } catch (err) {
    console.warn('[paper]', err);
  }
}
