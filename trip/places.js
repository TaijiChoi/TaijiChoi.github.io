/* 트립로그 — 장소 검색
   국내: 카카오 로컬 API (JavaScript SDK, services)
   해외: OpenStreetMap Nominatim
   SDK·네트워크가 없어도 앱은 그대로 동작하고, 직접 입력으로 넘어갈 수 있다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Places = (TL.Places = {});

  var KAKAO_KEY = 'b40fae15940e6687fafa6056aae19ea1';
  var SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KAKAO_KEY + '&libraries=services&autoload=false';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var sdkPromise = null;
  var osmCache = {};
  var lastOsmAt = 0;

  Places.mode = 'auto';           // auto | kakao | osm
  Places.lastSource = '';

  /* --------------------------------------------------------- kakao sdk */
  Places.kakaoReady = function () {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (root.kakao && root.kakao.maps && root.kakao.maps.services) {
        try { root.kakao.maps.load(function () { resolve(true); }); } catch (e) { resolve(true); }
        return;
      }
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        try { root.kakao.maps.load(function () { resolve(true); }); }
        catch (e) { sdkPromise = null; reject(new Error('카카오맵을 시작하지 못했어요')); }
      };
      s.onerror = function () {
        sdkPromise = null;
        reject(new Error('카카오맵 SDK를 불러오지 못했어요 (오프라인이거나 차단됨)'));
      };
      document.head.appendChild(s);
    });
    return sdkPromise;
  };

  function kakaoSearch(query) {
    return Places.kakaoReady().then(function () {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(new Error('카카오 검색 응답이 없어요')); }, 8000);
        try {
          var ps = new root.kakao.maps.services.Places();
          ps.keywordSearch(query, function (data, status) {
            clearTimeout(timer);
            if (status === root.kakao.maps.services.Status.OK) {
              resolve((data || []).slice(0, 8).map(function (d) {
                return {
                  name: d.place_name || '',
                  address: d.road_address_name || d.address_name || '',
                  lat: Number(d.y), lng: Number(d.x),
                  url: d.place_url || '', source: 'kakao',
                  phone: d.phone || '', category: d.category_name || ''
                };
              }).filter(function (r) { return isFinite(r.lat) && isFinite(r.lng); }));
            } else if (status === root.kakao.maps.services.Status.ZERO_RESULT) {
              resolve([]);
            } else {
              reject(new Error('카카오 검색 오류 (' + status + ')'));
            }
          });
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
    });
  }

  /* ---------------------------------------------------------- nominatim */
  function osmSearch(query) {
    var key = String(query || '').trim().toLowerCase();
    if (osmCache[key]) return Promise.resolve(osmCache[key]);
    var wait = Math.max(0, 1100 - (Date.now() - lastOsmAt));
    return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
      lastOsmAt = Date.now();
      var url = NOMINATIM + '?format=jsonv2&addressdetails=1&limit=8&accept-language=ko,en&q=' + encodeURIComponent(query);
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
      return fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('해외 검색 응답 오류 (' + res.status + ')');
        return res.json();
      }).then(function (arr) {
        var out = (arr || []).slice(0, 8).map(function (r) {
          return {
            name: r.name || String(r.display_name || '').split(',')[0] || '',
            address: r.display_name || '',
            lat: Number(r.lat), lng: Number(r.lon),
            url: 'https://www.openstreetmap.org/' + (r.osm_type || 'node') + '/' + (r.osm_id || ''),
            source: 'osm',
            category: r.type || ''
          };
        }).filter(function (r) { return isFinite(r.lat) && isFinite(r.lng); });
        osmCache[key] = out;
        return out;
      }).catch(function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
    });
  }

  /**
   * 장소 검색. mode: auto(카카오 → 결과 없으면 해외) | kakao | osm
   * 반환: {results:[], source:'kakao'|'osm'|'', note:''}
   */
  Places.search = function (query, mode) {
    var q = String(query || '').trim();
    if (!q) return Promise.resolve({ results: [], source: '', note: '검색어를 입력해 주세요' });
    if (navigator.onLine === false) {
      return Promise.resolve({ results: [], source: '', note: '오프라인이라 장소를 검색할 수 없어요. 이름과 주소를 직접 입력해 주세요.' });
    }
    var m = mode || Places.mode || 'auto';
    if (m === 'osm') {
      return osmSearch(q).then(function (rs) {
        Places.lastSource = 'osm';
        return { results: rs, source: 'osm', note: rs.length ? '' : '해외 지도에서 찾지 못했어요' };
      }).catch(function (e) {
        return { results: [], source: '', note: e.message || '해외 검색에 실패했어요' };
      });
    }
    if (m === 'kakao') {
      return kakaoSearch(q).then(function (rs) {
        Places.lastSource = 'kakao';
        return { results: rs, source: 'kakao', note: rs.length ? '' : '카카오에서 찾지 못했어요. 해외 탭을 눌러 보세요.' };
      }).catch(function (e) {
        return { results: [], source: '', note: e.message || '카카오 검색에 실패했어요' };
      });
    }
    // auto: 카카오 먼저, 없거나 실패하면 해외
    return kakaoSearch(q).then(function (rs) {
      if (rs.length) {
        Places.lastSource = 'kakao';
        return { results: rs, source: 'kakao', note: '' };
      }
      return osmSearch(q).then(function (os) {
        Places.lastSource = 'osm';
        return { results: os, source: 'osm', note: os.length ? '카카오에 없어 해외 지도(OSM)에서 찾았어요' : '두 지도 모두에서 찾지 못했어요' };
      }).catch(function () {
        return { results: [], source: '', note: '카카오에 없고 해외 지도도 응답이 없어요' };
      });
    }).catch(function (e) {
      return osmSearch(q).then(function (os) {
        Places.lastSource = 'osm';
        return { results: os, source: 'osm', note: (e.message || '카카오 검색 실패') + ' · 해외 지도 결과예요' };
      }).catch(function () {
        return { results: [], source: '', note: e.message || '검색에 실패했어요' };
      });
    });
  };

  /* ------------------------------------------------------- 역지오코딩 (v22) */
  var NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
  var revCache = {};
  /** 좌표 → {name, address}. 실패하면 reject (호출한 쪽이 무시해도 된다) */
  Places.reverse = function (lat, lng) {
    var a = Number(lat), b = Number(lng);
    if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) {
      return Promise.reject(new Error('좌표가 올바르지 않아요'));
    }
    var key = a.toFixed(5) + ',' + b.toFixed(5);
    if (revCache[key]) return Promise.resolve(revCache[key]);
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
      return Promise.reject(new Error('오프라인이라 주소를 찾을 수 없어요'));
    }
    var wait = Math.max(0, 1100 - (Date.now() - lastOsmAt));
    return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
      lastOsmAt = Date.now();
      var url = NOMINATIM_REVERSE + '?format=jsonv2&zoom=16&accept-language=ko,en&lat=' + a + '&lon=' + b;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
      return fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          if (!res.ok) throw new Error('주소 검색 응답 오류 (' + res.status + ')');
          return res.json();
        }, function (e) {
          if (timer) clearTimeout(timer);
          throw e || new Error('주소를 찾지 못했어요');
        })
        .then(function (j) {
          if (!j || j.error) throw new Error('주소를 찾지 못했어요');
          var ad = j.address || {};
          var name = j.name || ad.tourism || ad.road || ad.suburb || ad.city || ad.town || ad.village || '';
          var out = { name: name || '', address: j.display_name || '' };
          revCache[key] = out;
          return out;
        });
    });
  };

  Places.resultHtml = function (r) {
    return '<div class="pl-main">' +
      '<span class="pl-name">' + TL.Core.esc(r.name || '(이름 없음)') + '</span>' +
      '<span class="pl-addr">' + TL.Core.esc(r.address || '') + '</span>' +
      '</div>' +
      '<span class="pl-src ' + (r.source === 'kakao' ? 'k' : 'o') + '">' + (r.source === 'kakao' ? '카카오' : 'OSM') + '</span>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
