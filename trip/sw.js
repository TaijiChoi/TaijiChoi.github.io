/* 트립로그 서비스 워커
   · 앱 셸(HTML·JS·CSS·아이콘)을 캐시해 오프라인에서도 앱이 열린다
   · index.html의 ?v= 값과 아래 VERSION을 함께 올린다 (deploy 전 확인: tests/run.py)
   · 같은 버전 안에서 앱 파일만 고쳐 다시 배포할 때는 아래 BUILD 주석을 바꿔 새 서비스워커를 받게 한다
     (스크립트가 바이트까지 같으면 브라우저가 갱신을 건너뛰고 예전 캐시를 계속 쓴다)
   · BUILD: 25c — 피커 안 자동 시간 안내 */
var VERSION = '26';
var CACHE = 'triplog-v' + VERSION;
var ASSETS = [
  './',
  './index.html',
  './styles.css?v=' + VERSION,
  './core.js?v=' + VERSION,
  './sample.js?v=' + VERSION,
  './store.js?v=' + VERSION,
  './auth.js?v=' + VERSION,
  './account.js?v=' + VERSION,
  './ui.js?v=' + VERSION,
  './places.js?v=' + VERSION,
  './map.js?v=' + VERSION,
  './screen-schedule.js?v=' + VERSION,
  './screen-money.js?v=' + VERSION,
  './screen-check.js?v=' + VERSION,
  './reserve.js?v=' + VERSION,
  './dialogs.js?v=' + VERSION,
  './app.js?v=' + VERSION,
  './manifest.json',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 한 파일이 없어도 나머지는 캐시한다 (파일 하나 때문에 오프라인이 통째로 꺼지지 않게)
      return Promise.all(ASSETS.map(function (u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function () {
          console.warn('[triplog sw] 캐시 실패', u);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k.indexOf('triplog-') === 0) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 카카오·OSM 타일·Firebase는 그대로 둔다

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
