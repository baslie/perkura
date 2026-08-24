#!/usr/bin/env node
/**
 * Локальный дев-сервер для статической вёрстки Perkura.
 *
 * Без зависимостей: только встроенные модули Node. Отдаёт файлы репозитория,
 * следит за ними и обновляет открытую страницу: CSS подменяет на лету, не теряя
 * прокрутку, остальное перезагружает.
 *
 *   node tools/dev-server.js [--port 3000] [--open] [--local] [--quiet]
 *
 *   --port <n>   порт (по умолчанию 3000; если занят — берётся следующий свободный)
 *   --open       открыть браузер после старта
 *   --local      слушать только 127.0.0.1 (по умолчанию — все интерфейсы,
 *                чтобы открыть вёрстку с телефона по адресу из консоли)
 *   --quiet      не печатать каждый запрос
 *   --root <p>   корень раздачи (по умолчанию — корень репозитория)
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

// ─── аргументы ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const ROOT = path.resolve(value('--root', path.join(__dirname, '..')));
const PORT = Number(value('--port', process.env.PORT || 3000));
const HOST = flag('--local') ? '127.0.0.1' : '0.0.0.0';
const OPEN = flag('--open');
const QUIET = flag('--quiet');

// Идентификатор запуска: клиент по нему понимает, что сервер перезапустили,
// и перезагружает страницу сам.
const RUN_ID = String(process.pid) + '-' + Date.now();

// ─── типы файлов ──────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const IGNORED = ['.git', 'node_modules', '.playwright-mcp', '.idea', '.vscode'];

// ─── лог ──────────────────────────────────────────────────────────────────────

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const time = () => new Date().toTimeString().slice(0, 8);

function logRequest(status, method, url, ms) {
  if (QUIET) return;
  const paint = status >= 500 ? c.red : status >= 400 ? c.yellow : c.green;
  console.log(
    `${c.dim(time())}  ${paint(String(status))} ${method.padEnd(4)} ${url} ${c.dim(ms + ' ms')}`
  );
}

function logEvent(message) {
  console.log(`${c.dim(time())}  ${c.cyan('↻')}    ${message}`);
}

/**
 * Заголовки ответа. Cache-Control: no-store стоит на всём — иначе браузер
 * показывает вчерашний CSS, и правка «не применяется» без всякой причины.
 */
function head(res, code, type, length) {
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': length,
    'Cache-Control': 'no-store',
  });
}

// ─── клиенты живого обновления ────────────────────────────────────────────────

/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();

function broadcast(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(frame);
}

// ─── наблюдение за файлами ────────────────────────────────────────────────────

function isIgnored(relative) {
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => IGNORED.includes(part))) return true;
  const name = parts[parts.length - 1] || '';
  // временные файлы редакторов
  return name.endsWith('~') || name.startsWith('.#') || /^\d{4}$/.test(name);
}

let pending = new Set();
let timer = null;

function watch() {
  let watcher;
  try {
    watcher = fs.watch(ROOT, { recursive: true });
  } catch (error) {
    console.log(c.yellow(`  Следить за файлами не вышло (${error.code}): автообновление выключено.`));
    return;
  }

  watcher.on('error', (error) => {
    console.log(c.yellow(`  Наблюдатель за файлами упал: ${error.message}`));
  });

  watcher.on('change', (_event, filename) => {
    // filename === null случается на некоторых системах: обновляем всё
    const relative = filename ? String(filename) : '';
    if (relative && isIgnored(relative)) return;
    pending.add(relative.split(path.sep).join('/'));

    clearTimeout(timer);
    timer = setTimeout(flush, 60); // окно склейки: одно сохранение — одно событие
  });
}

function flush() {
  const files = [...pending];
  pending = new Set();
  if (files.length === 0) return;

  const onlyCss = files.every((file) => file.endsWith('.css'));
  if (onlyCss) {
    logEvent(`${files.join(', ')} ${c.dim('— стили подменены без перезагрузки')}`);
    broadcast({ type: 'css', files, runId: RUN_ID });
  } else {
    logEvent(`${files.join(', ')} ${c.dim('— страница перезагружена')}`);
    broadcast({ type: 'reload', files, runId: RUN_ID });
  }
}

// ─── скрипт, который подмешивается в HTML ─────────────────────────────────────

const CLIENT = `/* Perkura dev server: живое обновление. Файлы в репозитории не меняются. */
(function () {
  var RUN_ID = ${JSON.stringify(RUN_ID)};
  var KEY = '__perkura_dev_scroll:' + location.pathname;
  var source = null;
  var lost = false;

  // ── бейдж состояния ─────────────────────────────────────────────────────────
  var badge = null;
  var badgeTimer = null;

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement('div');
    badge.setAttribute('data-perkura-dev', '');
    badge.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:12px', 'bottom:12px',
      'padding:6px 10px', 'border-radius:6px',
      'font:500 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace',
      'color:#fff', 'background:rgba(20,20,20,.86)', 'pointer-events:none',
      'opacity:0', 'transition:opacity .18s ease', 'white-space:nowrap'
    ].join(';');
    document.body.appendChild(badge);
    return badge;
  }

  function showBadge(text, sticky, danger) {
    if (!document.body) return;
    var el = ensureBadge();
    el.textContent = text;
    el.style.background = danger ? 'rgba(176,32,32,.92)' : 'rgba(20,20,20,.86)';
    el.style.opacity = '1';
    clearTimeout(badgeTimer);
    if (!sticky) badgeTimer = setTimeout(function () { el.style.opacity = '0'; }, 1400);
  }

  // ── режим вёрстки при изменении ширины ──────────────────────────────────────
  function mode(width) {
    if (width >= 1200) return 'десктоп';
    if (width >= 768) return 'планшет';
    return 'телефон';
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var w = window.innerWidth, h = window.innerHeight;
      showBadge(w + ' x ' + h + '  ' + mode(w));
    }, 90);
  });

  // ── прокрутка переживает перезагрузку ───────────────────────────────────────
  try {
    var saved = sessionStorage.getItem(KEY);
    if (saved !== null) {
      sessionStorage.removeItem(KEY);
      window.addEventListener('load', function () {
        window.scrollTo(0, parseInt(saved, 10) || 0);
      });
    }
  } catch (e) {}

  function reload() {
    try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
    location.reload();
  }

  // ── подмена стилей без перезагрузки ─────────────────────────────────────────
  function swapStyles() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var stamp = Date.now();

    // Пока новый файл грузится, рендер заблокирован и браузер роняет прокрутку
    // в ноль. Держим её сами — ради этого вся затея и нужна.
    var x = window.scrollX, y = window.scrollY;
    function keepScroll() {
      if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
    }
    var ticks = [0, 40, 120, 300, 600];
    for (var t = 0; t < ticks.length; t++) setTimeout(keepScroll, ticks[t]);

    for (var i = 0; i < links.length; i++) {
      (function (link) {
        var href = link.getAttribute('href');
        if (!href || /^(https?:)?\\/\\//.test(href)) return; // шрифты и прочая внешка
        var clean = href.split('?')[0];
        // новый узел рядом со старым: страница не мигает без стилей
        var fresh = link.cloneNode();
        fresh.setAttribute('href', clean + '?dev=' + stamp);
        fresh.addEventListener('load', function () {
          if (link.parentNode) link.parentNode.removeChild(link);
          keepScroll();
        });
        link.parentNode.insertBefore(fresh, link.nextSibling);
      })(links[i]);
    }
    showBadge('стили обновлены');
  }

  // ── канал событий ───────────────────────────────────────────────────────────
  function connect() {
    source = new EventSource('/__dev/events');

    source.onmessage = function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.runId && data.runId !== RUN_ID) { reload(); return; }
      if (data.type === 'css') { swapStyles(); return; }
      if (data.type === 'reload') { reload(); }
    };

    source.onopen = function () {
      /* Связь была потеряна — значит сервер перезапустился, пока нас не было,
         и на диске могло измениться что угодно: перечитываем страницу. */
      if (lost) reload();
    };

    source.onerror = function () {
      lost = true;
      showBadge('дев-сервер недоступен', true, true);
      source.close();
      setTimeout(connect, 1000);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
`;

const INJECT = '<script src="/__dev/client.js" data-perkura-dev></script>';

function inject(html) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `  ${INJECT}\n</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${INJECT}\n</html>`);
  return html + '\n' + INJECT;
}

// ─── статика ──────────────────────────────────────────────────────────────────

async function stat(file) {
  try {
    return await fsp.stat(file);
  } catch {
    return null;
  }
}

/** Путь из URL → файл на диске. null, если файла нет или путь уводит за корень. */
async function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const target = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null; // выход за корень

  const info = await stat(target);

  if (info && info.isDirectory()) {
    const index = path.join(target, 'index.html');
    return (await stat(index)) ? index : null;
  }
  if (info) return target;

  // /home → home.html: адрес без расширения читается приятнее
  if (!path.extname(target)) {
    const guess = target + '.html';
    if (await stat(guess)) return guess;
  }
  return null;
}

async function pages() {
  const entries = await fsp.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name)
    .sort();
}

async function notFound(res, pathname) {
  const list = await pages();
  const items = list.map((name) => `<li><a href="/${name}">${name}</a></li>`).join('\n      ');

  const body = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>404 — ${pathname.replace(/[<>&]/g, '')}</title>
  <style>
    body { margin: 0; padding: 48px; font: 15px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; color: #1a1a1a; background: #fafafa; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    code { background: #ececec; padding: 2px 6px; border-radius: 4px; }
    ul { padding-left: 20px; }
    a { color: #0a58ca; }
  </style>
</head>
<body>
  <h1>404 — файла нет</h1>
  <p>Запрошено: <code>${pathname.replace(/[<>&]/g, '')}</code></p>
  <p>Страницы в репозитории:</p>
  <ul>
      ${items}
  </ul>
</body>
</html>`;

  head(res, 404, MIME['.html'], Buffer.byteLength(body));
  res.end(body);
  return 404;
}

// ─── сервер ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  let status = 200;
  let logged = false;

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      status = 405;
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    // канал событий
    if (pathname === '/__dev/events') {
      logged = true; // соединение висит до закрытия вкладки, в логе ему не место
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 1000\n\n');
      res.write(`data: ${JSON.stringify({ type: 'hello', runId: RUN_ID })}\n\n`);
      clients.add(res);

      const beat = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(beat);
        clients.delete(res);
      });
      return;
    }

    // клиентский скрипт
    if (pathname === '/__dev/client.js') {
      head(res, 200, MIME['.js'], Buffer.byteLength(CLIENT));
      res.end(req.method === 'HEAD' ? undefined : CLIENT);
      return;
    }

    const file = await resolveFile(pathname);

    if (!file) {
      // иконки в проекте нет: молчим, чтобы не сорить красным в консоли браузера
      if (pathname === '/favicon.ico') {
        status = 204;
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      status = await notFound(res, pathname);
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = inject(await fsp.readFile(file, 'utf8'));
      head(res, 200, type, Buffer.byteLength(html));
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }

    const info = await stat(file);
    head(res, 200, type, info.size);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(file);
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
    });
  } catch (error) {
    status = 500;
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 ${error.message}`);
  } finally {
    if (!logged) logRequest(status, req.method, pathname, Date.now() - started);
  }
});

// ─── запуск ───────────────────────────────────────────────────────────────────

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function open(url) {
  const command =
    process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* не открылось — не беда, адрес напечатан */
  }
}

async function banner(port) {
  const local = `http://localhost:${port}`;
  const lan = HOST === '0.0.0.0' ? lanAddress() : null;
  const list = await pages();

  console.log('');
  console.log(`  ${c.bold('Perkura')} ${c.dim('— дев-сервер')}`);
  console.log('');
  console.log(`  ${'на этой машине'.padEnd(17)} ${c.cyan(local)}`);
  if (lan) console.log(`  ${'в локальной сети'.padEnd(17)} ${c.cyan(`http://${lan}:${port}`)}`);
  console.log(`  ${'корень'.padEnd(17)} ${c.dim(ROOT)}`);
  console.log('');
  for (const name of list) {
    console.log(`  ${c.dim('·')} ${local}/${name}`);
  }
  console.log('');
  console.log(c.dim('  Правки в .css подменяются без перезагрузки, остальное перезагружает страницу.'));
  console.log(c.dim('  Ctrl+C — остановить.'));
  console.log('');
}

function listen(port, attempt = 0) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 20) {
      console.log(c.dim(`  Порт ${port} занят, беру ${port + 1}.`));
      listen(port + 1, attempt + 1);
      return;
    }
    console.error(c.red(`  Не удалось запустить сервер: ${error.message}`));
    process.exit(1);
  });

  server.listen(port, HOST, async () => {
    await banner(port);
    watch();
    if (OPEN) open(`http://localhost:${port}/`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 300).unref();
  });
}

listen(PORT);
