/* 트립로그 — 하루 동선 지도 (Leaflet + OpenStreetMap)
   일정에 좌표가 있으면 번호 핀과 순서선을 그리고, 구간 거리·길찾기는 화면 HTML이 담당한다.
   지도 라이브러리나 타일이 없어도(오프라인) 구간 목록과 길찾기 버튼은 그대로 쓸 수 있다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core;
  var M = (TL.RouteMap = {});

  var CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var loaded = null;
  var map = null;
  var mapEl = null;
  var paintedAt = 0;

  M.ensure = function () {
    if (loaded) return loaded;
    loaded = new Promise(function (resolve, reject) {
      if (root.L && root.L.map) { resolve(root.L); return; }
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = CSS_URL;
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = JS_URL;
      s.async = true;
      s.onload = function () {
        if (root.L && root.L.map) resolve(root.L);
        else { loaded = null; reject(new Error('지도 라이브러리를 시작하지 못했어요')); }
      };
      s.onerror = function () {
        loaded = null;
        reject(new Error('지도 라이브러리를 불러오지 못했어요 (오프라인일 수 있어요)'));
      };
      document.head.appendChild(s);
    });
    return loaded;
  };

  M.hide = function () {
    if (map) { try { map.remove(); } catch (e) {} }
    map = null;
    mapEl = null;
  };

  /** 렌더 뒤에 호출: #route-map이 있으면 그 날의 좌표 일정을 그린다 */
  M.paint = function (trip, day) {
    var el = document.getElementById('route-map');
    if (!trip || !el) { M.hide(); return; }
    var items = Core.sortedSchedules(trip.data, day).filter(Core.hasGeo);
    if (!items.length) { M.hide(); return; }
    if (map && mapEl === el) { try { map.invalidateSize(); } catch (e) {} return; }
    M.hide();
    var myPaint = ++paintedAt;
    M.ensure().then(function (L) {
      if (myPaint !== paintedAt) return;
      if (!document.getElementById('route-map')) return;
      if (navigator.onLine === false) throw new Error('오프라인이라 지도 타일을 불러올 수 없어요');
      var m = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(m);
      var pts = [];
      items.forEach(function (it, i) {
        var icon = L.divIcon({ className: 'rt-icon', html: '<span>' + (i + 1) + '</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
        L.marker([Number(it.lat), Number(it.lng)], { icon: icon, title: it.title }).addTo(m)
          .bindPopup('<b>' + (i + 1) + '. ' + Core.esc(it.title) + '</b>' +
            (it.placeName || it.place ? '<br>' + Core.esc(it.placeName || it.place) : ''));
        pts.push([Number(it.lat), Number(it.lng)]);
      });
      if (pts.length > 1) {
        L.polyline(pts, { color: '#368FFF', weight: 4, opacity: .85, dashArray: '7 7' }).addTo(m);
      }
      var fit = function () {
        try {
          if (pts.length === 1) m.setView(pts[0], 15);
          else m.fitBounds(L.latLngBounds(pts).pad(0.22), { maxZoom: 15 });
        } catch (e) {}
      };
      fit();
      setTimeout(function () { try { m.invalidateSize(); fit(); } catch (e) {} }, 80);
      map = m;
      mapEl = el;
      el.classList.add('ready');
      var note = el.parentNode && el.parentNode.querySelector('.map-offline');
      if (note) note.style.display = 'none';
    }).catch(function (e) {
      var box = document.getElementById('route-map');
      if (box) box.classList.add('failed');
      var note = box && box.parentNode && box.parentNode.querySelector('.map-offline');
      if (note) {
        note.style.display = '';
        note.textContent = (e && e.message) || '지도를 불러오지 못했어요';
      }
    });
  };

  M.online = function () {
    if (!map) return;
    var note = document.querySelector('.map-offline');
    if (note) { note.style.display = 'none'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
