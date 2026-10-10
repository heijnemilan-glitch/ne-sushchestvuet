// Сборка: все модули + three.js → один автономный файл PLAY.html (работает офлайн, двойным щелчком).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const esbuild = join(root, 'node_modules', 'esbuild-win', 'esbuild.exe');
const dev = process.argv.includes('--dev');
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'bundle.js');

execFileSync(
  esbuild,
  [join(root, 'src', 'main.js'), '--bundle', '--format=iife', '--target=es2020', `--outfile=${out}`, ...(dev ? ['--sourcemap=inline'] : ['--minify']), '--log-level=warning', '--legal-comments=none'],
  { stdio: 'inherit', cwd: root }
);

const js = readFileSync(out, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src', 'ui', 'style.css'), 'utf8').replace(/^﻿/, '');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>НЕ СУЩЕСТВУЕТ</title>
<style>${css}</style>
</head>
<body>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(join(root, 'PLAY.html'), html);
// для сайта: игра в браузере (/play/) и файл для скачивания (/download/)
mkdirSync(join(root, 'play'), { recursive: true });
mkdirSync(join(root, 'download'), { recursive: true });
writeFileSync(join(root, 'play', 'index.html'), html);
writeFileSync(join(root, 'download', 'ne-sushchestvuet.html'), html);
// копия на рабочий стол — чтобы запускать двойным щелчком
try {
  writeFileSync(join(root, '..', 'НЕ СУЩЕСТВУЕТ.html'), html);
} catch {
  /* рабочего стола может не быть — не страшно */
}
console.log(`PLAY.html: ${(html.length / 1024).toFixed(0)} КБ`);
