// Управление Microsoft Edge через Chrome DevTools Protocol — для автотестов сайта и игры.
// Использование (из другого скрипта):
//   import { launchEdge } from './edge.mjs';
//   const edge = await launchEdge({ width: 1366, height: 800 });
//   const page = await edge.open('http://localhost:5050/');
//   await page.eval('document.title'); await page.shot('out.png'); await edge.close();
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchEdge({ width = 1366, height = 800, headless = true, port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'edge-cdp-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    ...(headless ? ['--headless=new'] : []),
    'about:blank',
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('Edge не запустился');

  async function open(url) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let id = 0;
    const pending = new Map();
    const logs = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      }
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const i = ++id;
        pending.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const page = {
      logs,
      send,
      async eval(expr, timeout = 60000) {
        const r = await Promise.race([
          send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
          sleep(timeout).then(() => ({ result: { result: { value: 'TIMEOUT' } } })),
        ]);
        const res = r.result || {};
        if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
        return res.result?.value;
      },
      async wait(expr, timeout = 20000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
          try {
            if (await page.eval(expr)) return true;
          } catch {
            /* страница ещё грузится */
          }
          await sleep(200);
        }
        throw new Error('Не дождались: ' + expr);
      },
      async goto(u) {
        await send('Page.navigate', { url: u });
        await sleep(400);
        await page.wait('document.readyState !== "loading"');
      },
      async shot(file, opts = {}) {
        const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!opts.full, ...(opts.full ? {} : {}) });
        writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      },
      async resize(w, h, mobile = false) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      },
      close: () => ws.close(),
    };
    await page.wait('document.readyState !== "loading"');
    return page;
  }

  return {
    open,
    async close() {
      proc.kill();
      await sleep(500);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Edge ещё держит файлы — не важно */
      }
    },
  };
}
