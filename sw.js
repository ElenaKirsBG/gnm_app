// Справочник ГНМ — офлайн-работа (service worker).
// Стратегия: сначала кэш (мгновенный запуск и работа без интернета),
// в фоне — тихое обновление из сети. При выпуске новой версии увеличьте VERSION.
const VERSION = 'gnm-v5';
const CORE = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

// Установка: кладём в кэш все файлы по одному, чтобы отсутствие одного (например, иконки) не сорвало установку
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(CORE.map(async url => {
      try {
        const r = await fetch(new Request(url, { cache: 'reload' }));
        if (r && r.ok) await cache.put(url, r);
      } catch (err) { /* нет сети или файла — пропускаем */ }
    }));
    await self.skipWaiting();
  })());
});

// Активация: удаляем старые версии кэша
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function putSafe(key, resp) {
  try {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      const cache = await caches.open(VERSION);
      await cache.put(key, resp);
    }
  } catch (err) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Открытие приложения (страница): всегда отдаём сохранённую копию, обновляем в фоне
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html', { ignoreSearch: true }) || await caches.match('./', { ignoreSearch: true });
      const update = fetch(req).then(r => { if (r && r.ok) { putSafe('./index.html', r.clone()); putSafe('./', r.clone()); } return r; }).catch(() => null);
      if (cached) { e.waitUntil(update); return cached; }
      const fresh = await update;
      return fresh || new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:20px">Нет соединения. Откройте приложение один раз при подключённом интернете — после этого оно будет работать офлайн.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // 2) Остальные файлы (иконки, манифест, шрифты Google): кэш, затем сеть с сохранением
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: url.origin === self.location.origin });
    const update = fetch(req).then(r => { putSafe(req, r.clone()); return r; }).catch(() => null);
    if (cached) { e.waitUntil(update); return cached; }
    const fresh = await update;
    return fresh || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
