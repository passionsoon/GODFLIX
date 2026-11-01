// 갓플릭스 서비스 워커 — 강의 썸네일(그림)만 기기에 저장해 두고 다음부터 바로 보여줌.
// 그 밖의 요청(사이트 화면, 서버, 영상)은 전혀 건드리지 않음 → 업데이트 안내·로그인·재생에는 영향 없음.
const CACHE = 'gf-thumbs-v1';      // 그림
const STAMP = 'gf-thumbs-ts-v1';   // 그림을 받아 둔 시각
const MAX = 60;                    // 최대 60장 (오래된 것부터 지움)
const FRESH = 12 * 3600 * 1000;    // 12시간 안에 받은 그림은 다시 받지 않음 (데이터 절약)

function isThumb(u) {
  if (u.protocol !== 'https:') return false;
  if (u.hostname === 'drive.google.com' && u.pathname === '/thumbnail') return true;
  if (/^lh\d\.googleusercontent\.com$/.test(u.hostname)) return true;
  if (u.hostname === 'i.vimeocdn.com') return true;
  return false;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('gf-thumbs-') && k !== CACHE && k !== STAMP) await caches.delete(k);
  await self.clients.claim();
})()));

async function trim(c, s) {
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX; i++) { await c.delete(keys[i]); await s.delete(keys[i].url); }
}

async function refresh(req, key, c, s) {
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      await c.put(key, res.clone());
      await s.put(key, new Response(String(Date.now())));
      trim(c, s).catch(() => {});
    }
    return res;
  } catch (e) { return null; }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u; try { u = new URL(req.url); } catch (_) { return; }
  if (!isThumb(u)) return;
  e.respondWith((async () => {
    const key = req.url;
    let c, s;
    try { c = await caches.open(CACHE); s = await caches.open(STAMP); } catch (_) { return fetch(req); }
    const hit = await c.match(key);
    if (hit) {
      // 저장해 둔 그림을 바로 보여주고, 오래됐으면 뒤에서 새로 받아 둠
      let at = 0; try { const st = await s.match(key); at = st ? Number(await st.text()) || 0 : 0; } catch (_) {}
      if (Date.now() - at > FRESH) e.waitUntil(refresh(req, key, c, s));
      return hit;
    }
    const res = await refresh(req, key, c, s);
    return res || fetch(req);
  })());
});
