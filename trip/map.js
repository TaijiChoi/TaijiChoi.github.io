/* 트립로그 — 하루 동선 지도 (Leaflet + 구글지도/OpenStreetMap 타일)
   일정에 좌표가 있으면 번호 핀과 순서선을 그리고, 구간 거리·길찾기는 화면 HTML이 담당한다.
   지도 라이브러리나 타일이 없어도(오프라인) 구간 목록과 길찾기 버튼은 그대로 쓸 수 있다.
   v17: 지도 종류(구글지도 ↔ OSM)를 골라 그린다. 구글 타일이 하나도 안 뜨면 OSM으로 자동 전환한다. */
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

  /** 구글 타일이 안 떠서 OSM으로 넘길 때 앱에 알린다 (앱이 다시 그린다) */
  function fallbackToOsm(reason) {
    if (!(TL.App && TL.App.setMapSource)) return;
    try {
      TL.App.setMapSource('osm', { fallback: true, message: reason });
    } catch (e) {}
  }

  /** 렌더 뒤에 호출: #route-map이 있으면 그 날의 좌표 일정을 그린다 (source = 'google' | 'osm') */
  M.paint = function (trip, day, source) {
    var el = document.getElementById('route-map');
    if (!trip || !el) { M.hide(); return; }
    var items = Core.sortedSchedules(trip.data, day).filter(Core.hasGeo);
    if (!items.length) { M.hide(); return; }
    var src = Core.mapSource(source);
    if (map && mapEl === el && el.getAttribute('data-src') === src.key) {
      try { map.invalidateSize(); } catch (e) {}
      return;
    }
    M.hide();
    var myPaint = ++paintedAt;
    el.setAttribute('data-src', src.key);
    M.ensure().then(function (L) {
      if (myPaint !== paintedAt) return;
      if (document.getElementById('route-map') !== el) return;
      if (navigator.onLine === false) throw new Error('오프라인이라 지도 타일을 불러올 수 없어요');
      var m = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      var layer = L.tileLayer(src.url, {
        maxZoom: src.maxZoom,
        subdomains: src.subdomains,
        attribution: src.attribution,
        crossOrigin: true
      }).addTo(m);

      // 구글 타일이 하나도 안 뜨면(차단·오류) OSM으로 넘어간다
      // 단, 이미 다른 지도로 다시 그려졌거나 사라진 지도의 늦은 오류는 무시한다
      var tiles = 0, stopped = false;
      function alive() {
        return !stopped && myPaint === paintedAt && map === m && document.getElementById('route-map') === el;
      }
      function toOsm() {
        if (stopped) return;
        stopped = true;
        try { m.remove(); } catch (e) {}
        if (map === m) { map = null; mapEl = null; }
        fallbackToOsm('구글지도 타일을 불러오지 못해 OSM으로 바꿨어요');
      }
      layer.on('tileload', function () { if (alive()) tiles++; });
      layer.on('tileerror', function () {
        if (!alive()) { stopped = true; return; }
        if (src.key === 'google' && !tiles) toOsm();
      });
      if (src.key === 'google') {
        setTimeout(function () {
          if (stopped || !alive() || tiles > 0) return;
          toOsm();
        }, 6000);
      }

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

  /* --------------------------------- v22: 일정 시트의 위치 찍기 미니 지도 */
  var picker = null;

  M.closePicker = function () {
    if (picker && picker.map) { try { picker.map.remove(); } catch (e) {} }
    picker = null;
  };
  /** 지금 찍힌 위치·지도 종류 (QA 확인용) */
  M.pickerInfo = function () {
    if (!picker || !picker.map) return { open: false };
    return { open: true, source: picker.source, lat: picker.lat, lng: picker.lng };
  };
  /** 고른 좌표로 지도를 옮기고 핀을 놓는다 (붙여넣기 좌표 반영) */
  M.recenterPick = function (lat, lng) {
    if (!picker || !picker.map) return;
    try {
      picker.map.setView([Number(lat), Number(lng)], 15);
      if (picker.drop) picker.drop(Number(lat), Number(lng), true);
    } catch (e) {}
  };

  /**
   * 작은 지도를 el에 띄우고, 누르거나 핀을 끌면 onPick(lat,lng)을 부른다.
   * 타일·라이브러리가 없으면 reject — 화면은 좌표 붙여넣기로 계속 쓸 수 있다.
   */
  M.pickMap = function (el, opts) {
    opts = opts || {};
    if (!el) return Promise.reject(new Error('지도를 넣을 자리가 없어요'));
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
      return Promise.reject(new Error('오프라인이라 지도를 불러올 수 없어요'));
    }
    M.closePicker();
    var src = Core.mapSource(opts.source);
    var my = { el: el, source: src.key, lat: null, lng: null };
    picker = my;
    var hasCenter = Core.validLatLng(opts.lat, opts.lng);
    return M.ensure().then(function (L) {
      if (picker !== my) throw new Error('지도를 닫았어요');
      var m = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      my.map = m;
      var tiles = 0;
      var layer = L.tileLayer(src.url, {
        maxZoom: src.maxZoom, subdomains: src.subdomains, attribution: src.attribution, crossOrigin: true
      }).addTo(m);
      layer.on('tileload', function () { tiles++; });
      layer.on('tileerror', function () {
        // 구글 타일이 막혔을 때: OSM으로 한 번만 바꿔 본다
        if (picker !== my || src.key !== 'google' || tiles > 0 || my.swapped) return;
        my.swapped = true;
        try { m.removeLayer(layer); } catch (e) {}
        var osm = Core.mapSource('osm');
        my.source = 'osm';
        L.tileLayer(osm.url, { maxZoom: osm.maxZoom, attribution: osm.attribution, crossOrigin: true }).addTo(m);
        var note = el.parentNode && el.parentNode.querySelector('.pin-note');
        if (note) note.textContent = '구글지도 타일을 불러오지 못해 OSM으로 바꿨어요';
      });
      m.setView(hasCenter ? [Number(opts.lat), Number(opts.lng)] : [8, 108], hasCenter ? 14 : 3);
      my.lat = hasCenter ? Number(opts.lat) : null;
      my.lng = hasCenter ? Number(opts.lng) : null;

      function drop(lat, lng, silent) {
        var a = Number(lat), b = Number(lng);
        if (!Core.validLatLng(a, b)) return;
        if (!my.marker) {
          var icon = L.divIcon({ className: 'pin-icon', html: '<span>📍</span>', iconSize: [30, 30], iconAnchor: [15, 28] });
          my.marker = L.marker([a, b], { icon: icon, draggable: true }).addTo(m);
          my.marker.on('dragend', function () {
            var p = my.marker.getLatLng();
            drop(p.lat, p.lng);
          });
        } else {
          my.marker.setLatLng([a, b]);
        }
        my.lat = a; my.lng = b;
        if (!silent && opts.onPick) opts.onPick(a, b);
      }
      my.drop = drop;
      if (hasCenter) drop(my.lat, my.lng, true);
      m.on('click', function (e) { drop(e.latlng.lat, e.latlng.lng); });
      el.classList.add('ready');
      setTimeout(function () { try { if (picker === my) m.invalidateSize(); } catch (e) {} }, 60);
      return my;
    }).catch(function (e) {
      if (picker === my) picker = null;
      throw e;
    });
  };

  // 어떤 시트든 닫힐 때 미니 지도를 정리한다 (Leaflet 핸들·타일이 남지 않게)
  if (TL.UI && TL.UI.close && !TL.UI.__pinCloseWrapped) {
    var closeModal = TL.UI.close;
    TL.UI.close = function () {
      M.closePicker();
      return closeModal.apply(this, arguments);
    };
    TL.UI.__pinCloseWrapped = true;
  }
})(typeof window !== 'undefined' ? window : globalThis);
