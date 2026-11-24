/* 트립로그 — 여행 상세 공통 헤더 + 일정 탭 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var S = (TL.Screens = TL.Screens || {});

  /* 여행 상세 상단 (커버 + 요약) */
  S.tripHeader = function (trip) {
    var t = Core.totals(trip, trip.data);
    var days = Core.tripDayCount(trip);
    var dday = Core.dday(trip);
    var remote = Store.isRemote(trip);
    var html = '';
    html += '<header class="topbar">' +
      '<button class="icon-btn" data-action="go-home" aria-label="뒤로">' + UI.icon('back') + '</button>' +
      '<h1>' + UI.esc(trip.name) + '<span class="sub">' + UI.esc(S.syncLabel(trip)) + '</span></h1>' +
      '<button class="icon-btn" data-action="open-share" aria-label="공유">' + UI.icon('share') + '</button>' +
      '<button class="icon-btn" data-action="edit-trip" aria-label="여행 정보 수정">' + UI.icon('edit') + '</button>' +
      '</header>';

    html += '<div class="trip-head"><div class="cover" style="background:' + UI.thumbBg(trip.destination || trip.name) + '">' +
      '<div class="cover-txt">' +
        '<h2>' + UI.esc(trip.destination || trip.name) + '</h2>' +
        '<div class="m">' + UI.esc(Core.rangeLabel(trip.startDate, trip.endDate)) + ' · ' + days + '일</div>' +
      '</div>' +
    '</div>';
    html += '<div class="trip-summary">' +
      '<span class="item"><span class="dday">' + UI.esc(dday) + '</span></span>' +
      '<span class="item">' + UI.icon('users', 15) + (trip.members || []).length + '명</span>' +
      '<span class="item">' + UI.icon('wallet', 15) + (t.total ? Core.won(t.total) : '지출 없음') + '</span>' +
      '<span class="item" style="margin-left:auto">' + UI.avatarsHtml(trip.members, 4) + '</span>' +
    '</div>' +
    UI.peopleBarHtml(trip) + '</div>';
    return html;
  };

  /** 상단 부제: 오프라인·동기화 상태 */
  S.syncLabel = function (trip) {
    var st = Store.syncState();
    if (!Store.isRemote(trip)) {
      return st.online ? '이 기기에 저장 중' : '오프라인 · 기기에 저장됨';
    }
    if (!st.online) return '오프라인 · 기기에 저장하고 나중에 동기화';
    if (st.fromCache) return '오프라인 캐시 · 동기화 대기';
    return st.connected ? '일행과 실시간 공유 중' : '연결 중…';
  };

  /* 날짜 칩 */
  S.dayChips = function (trip, active, action) {
    var list = Core.dayList(trip);
    return '<div class="chips">' + list.map(function (d) {
      var mmdd = d.date ? (Core.parse(d.date).getMonth() + 1) + '/' + Core.parse(d.date).getDate() : '';
      return '<button class="chip' + (active === d.key ? ' active' : '') + '" data-action="' + action + '" data-day="' + d.key + '">' +
        d.label + (mmdd ? '<span class="d">' + mmdd + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  };

  /* ------------------------------------------------------ 예약 보관함 줄 */
  S.reserveBar = function (trip) {
    var n = ((trip.data && trip.data.reservations) || []).length;
    return '<button class="res-bar" data-action="open-reserve">' +
      '<span class="rb-ic">' + UI.icon('receipt', 18) + '</span>' +
      '<span class="rb-tx"><b>예약 보관함</b><small>예약 확인서를 붙여넣으면 일정 초안을 만들어요</small></span>' +
      '<span class="pill ' + (n ? 'gray' : 'blue') + '">' + (n ? n + '건' : '열기') + '</span>' +
    '</button>';
  };

  /* --------------------------------------------------------- 동선 지도 */
  /** 동선 지도에 지금 쓰는 타일 소스: 화면 상태 → 기기에 저장한 값 → 구글지도 */
  S.mapSourceOf = function (view) {
    if (view && view.mapSource) return Core.mapSource(view.mapSource);
    try {
      var saved = root.localStorage && root.localStorage.getItem('triplog.mapSource');
      if (saved) return Core.mapSource(saved);
    } catch (e) {}
    return Core.mapSource('google');
  };

  /** 그 날 도로 경로 상태 (map.js의 TL.Route). 없으면 'none' */
  S.routeStateOf = function (items) {
    var R = TL.Route;
    if (!R || !R.state) return { status: 'none', route: null };
    try { return R.state(items) || { status: 'none', route: null }; } catch (e) { return { status: 'none', route: null }; }
  };

  /** 도로 경로 / 직선 폴백을 화면에서 분명히 구분하는 배지 */
  S.routeBadgeOf = function (rs, sum) {
    if (sum.anyRoad) {
      return { cls: 'road', label: '도로 경로 기준',
        note: sum.straightCount ? '일부 구간은 도로 경로가 없어 직선으로 추정했어요' : 'OSRM 자동차 경로 · 실제 도로 거리와 예상 시간' };
    }
    if (rs.status === 'loading' || rs.status === 'idle') {
      return { cls: 'loading', label: '도로 경로 확인 중…', note: '잠시 뒤 실제 도로 거리와 시간으로 바뀌어요' };
    }
    if (rs.status === 'fail') {
      return { cls: 'straight', label: '직선 추정(폴백)', note: '도로 경로를 받지 못해 직선거리로 계산했어요 · 오프라인·배편 구간은 도로 경로가 없어요' };
    }
    return { cls: 'straight', label: '직선 추정(폴백)', note: '도로 경로 정보가 없어 직선거리로 계산했어요' };
  };

  S.routePanel = function (trip, day, items, view) {
    var geo = items.filter(Core.hasGeo);
    if (!geo.length) {
      return '<div class="route-card empty-map"><div class="route-head static">' +
        '<span class="rh-ic">' + UI.icon('map', 18) + '</span>' +
        '<span class="rb-tx"><b>하루 동선 지도</b><small>장소를 검색해 일정을 넣으면 지도에 순서대로 표시돼요</small></span>' +
        '</div></div>';
    }
    var open = view.mapOpen;
    if (open == null) open = geo.length >= 2;
    var rs = S.routeStateOf(items);
    var sum = Core.routeSummary(items, rs.route);
    var badge = S.routeBadgeOf(rs, sum);
    var headNote = geo.length + '곳';
    if (sum.segs.length) {
      headNote += ' · 구간 ' + sum.segs.length + '개 · ' + (sum.anyRoad ? '도로 ' : '직선 ') + Core.kmLabel(sum.km);
      if (sum.anyRoad) headNote += ' · 약 ' + Core.durLabel(sum.min);
    } else {
      headNote += ' · 핀만 표시';
    }
    var html = '<div class="route-card">';
    html += '<button class="route-head" data-action="toggle-map" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="rh-ic">' + UI.icon('map', 18) + '</span>' +
      '<span class="rb-tx"><b>하루 동선 지도</b><small>' + headNote + '</small></span>' +
      (sum.segs.length ? '<span class="rt-badge ' + badge.cls + ' head">' + badge.label + '</span>' : '') +
      '<span class="chev' + (open ? ' open' : '') + '">' + UI.icon('down', 16) + '</span>' +
    '</button>';
    var src = S.mapSourceOf(view);
    var routeUrl = Core.routeMapUrl(geo);
    if (open) {
      html += '<div class="map-wrap"><div class="map-src" role="group" aria-label="지도 종류">' +
        Core.mapSourceKeys.map(function (k) {
          var o = Core.mapSource(k);
          var on = o.key === src.key;
          return '<button type="button" class="ms-btn' + (on ? ' active' : '') + '" data-action="map-source" data-src="' + o.key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + o.label + '</button>';
        }).join('') +
        '<span class="ms-hint">지도 종류</span></div>' +
        '<div id="route-map" class="route-map" role="img" aria-label="' + UI.esc(Core.dayLabel(trip, day)) + ' 동선 지도">' +
        '<div class="map-offline" style="display:none">지도를 불러오지 못했어요</div></div>' +
        '<div class="map-note">' + (src.key === 'google'
          ? 'Google 지도 · 타일이 안 보이면 OSM으로 바꿔 보세요 · 오프라인에서는 지도 그림 없이 아래 구간 정보만 보여요'
          : 'OpenStreetMap · 오프라인에서는 지도 그림 없이 아래 구간 정보만 보여요') + '</div></div>';
      // v23: 도로 경로 기준 / 직선 추정(폴백)을 분명히
      html += '<div class="route-src ' + badge.cls + '"><span class="rt-badge ' + badge.cls + '">' + badge.label + '</span>' +
        '<span class="rs-note">' + UI.esc(badge.note) + '</span></div>';
      // v23: 카테고리 색 범례 (핀 색 = 일정 종류)
      var legend = Core.catLegend(geo);
      if (legend.length) {
        html += '<div class="cat-legend" aria-label="카테고리 색 범례">' + legend.map(function (c) {
          return '<span class="cl-item" data-cat="' + c.key + '"><i style="background:' + c.color + '"></i>' + UI.esc(c.label) + '</span>';
        }).join('') + '</div>';
      }
      html += '<div class="route-pins">' + geo.map(function (it, i) {
        return '<span class="rp"><b style="background:' + Core.catColor(it.category) + '">' + (i + 1) + '</b>' + UI.esc(it.title) + '</span>';
      }).join('') + '</div>';
      if (routeUrl) {
        html += '<a class="btn btn-soft map-all" href="' + UI.esc(routeUrl) + '" target="_blank" rel="noopener"' +
          (geo.length > 1 ? ' title="' + UI.esc(geo.slice(0, 10).map(function (it) { return it.title; }).join(' → ')) + '"' : '') + '>' +
          UI.icon('map', 17) + Core.routeMapLabel(geo.length) + '</a>';
      }
      if (sum.segs.length) {
        html += '<div class="seg-list">' + sum.segs.map(function (s, i) { return S.segRow(s, i); }).join('') + '</div>';
      } else {
        html += '<div class="hintline" style="padding:0 12px 10px">좌표가 있는 일정이 2곳 이상이면 구간 거리와 길찾기가 나와요.</div>';
      }
    }
    html += '</div>';
    return html;
  };

  S.segRow = function (seg, i) {
    var links = Core.directionsLinks(seg.from, seg.to);
    var detail = seg.road
      ? '<span class="seg-tag road">도로</span> ' + Core.kmLabel(seg.km) + ' · 차 약 ' + Core.durLabel(seg.min) +
        ' <span class="seg-alt">직선 ' + Core.kmLabel(seg.straightKm) + '</span>'
      : '<span class="seg-tag straight">직선 추정</span> ' + Core.kmLabel(seg.km) + ' · 도보 약 ' + Core.durLabel(seg.walkMin) +
        ' · 차 약 ' + Core.durLabel(seg.carMin);
    return '<div class="seg-row' + (seg.road ? ' road' : '') + '">' +
      '<span class="seg-n">' + (i + 1) + '→' + (i + 2) + '</span>' +
      '<span class="seg-mid"><b>' + UI.esc(seg.fromTitle) + ' → ' + UI.esc(seg.toTitle) + '</b>' +
        '<small>' + detail + '</small></span>' +
      (links ? '<span class="seg-links">' +
        '<a class="tl-map kakao" href="' + links.kakao + '" target="_blank" rel="noopener">카카오 길찾기</a>' +
        '<a class="tl-map google" href="' + links.google + '" target="_blank" rel="noopener">구글 도보</a>' +
      '</span>' : '') +
    '</div>';
  };

  /* ------------------------------------------------------------- 일정 탭 */
  S.schedule = function (trip, view) {
    var day = view.day || S.defaultDay(trip);
    var items = Core.sortedSchedules(trip.data, day);
    var pairs = Core.overlapPairs(items);
    var overIds = {};
    pairs.forEach(function (p) { overIds[p.aId] = 1; overIds[p.bId] = 1; });
    var html = '';
    html += '<div class="body">';
    html += S.reserveBar(trip);
    html += S.dayChips(trip, day, 'pick-day');
    html += '<div class="row between" style="margin:14px 2px 6px">' +
      '<span class="tiny muted">' + Core.daySubLabel(trip, day) + '</span>' +
      '<span class="row" style="gap:10px">' +
        (items.length > 1
          ? '<button type="button" class="chip sort-chip" data-action="sort-day" data-day="' + UI.esc(day) + '" title="이 날 일정을 시간순으로 정렬 (시간 없는 일정은 뒤로)">' +
            UI.icon('clock', 13) + '시간순 정렬</button>'
          : '') +
        '<span class="tiny muted">' + items.length + '개 일정</span>' +
      '</span>' +
    '</div>';

    if (day !== 'prep') html += S.routePanel(trip, day, items, view);

    if (pairs.length) {
      html += '<div class="warn-bar">' + UI.icon('clock', 16) +
        '<span><b>시간이 겹치는 일정 ' + pairs.length + '쌍</b> — ' +
        pairs.map(function (p) { return p.aTime + ' ' + p.aTitle + ' / ' + p.bTime + ' ' + p.bTitle; }).join(', ') +
        '<br><small>저장은 그대로 되었어요. 시간을 조정해 보세요.</small></span></div>';
    }

    if (!items.length) {
      html += '<div class="empty" style="margin-top:6px">' +
        '<div class="emo">🗺️</div>' +
        '<h3>' + Core.dayLabel(trip, day) + ' 일정이 비어 있어요</h3>' +
        '<p>' + (day === 'prep' ? '항공권·숙소 같은 준비 항목을 적어두면 좋아요.' : '가고 싶은 곳을 검색해서 순서대로 추가해 보세요.') + '</p>' +
        '<div class="btn-row"><button class="btn btn-soft" data-action="add-schedule" data-day="' + day + '">' +
          UI.icon('plus') + '일정 추가</button></div>' +
      '</div>';
    } else {
      html += '<div class="tl" id="tl-list" data-day="' + UI.esc(day) + '">' + items.map(function (it, i) {
        return S.scheduleItem(trip, it, i + 1, items.length, !!overIds[it.id]);
      }).join('') + '</div>';
      html += '<button class="btn btn-ghost" data-action="add-schedule" data-day="' + day + '" style="margin-top:6px">' +
        UI.icon('plus') + '일정 추가</button>';
    }
    html += '</div>';
    return html;
  };

  S.scheduleItem = function (trip, it, n, total, overlap) {
    var cat = Core.schedCat(it.category);
    var links = Core.placeLinks(it);
    var hasPlace = !!(it.place || it.title || it.placeName);
    var time = it.time ? '<span class="tl-time">' + UI.esc(it.time) + '</span>' : '<span class="tl-time none">시간 미정</span>';
    var geo = Core.hasGeo(it);
    return '<div class="tl-item cat-' + cat.key + (overlap ? ' overlap' : '') + '" data-id="' + UI.esc(it.id) + '">' +
      '<div class="tl-badge">' + n + '</div>' +
      '<div class="tl-card">' +
        '<div class="tl-top">' +
          time +
          '<span class="tl-title">' + UI.esc(it.title) + '</span>' +
          (geo ? '<span class="tl-geo" title="지도에 표시됨">' + UI.icon('pin', 12) + '</span>' : '') +
          '<span class="tl-cat">' + UI.icon(cat.icon, 12) + UI.esc(cat.label) + '</span>' +
        '</div>' +
        (it.address ? '<div class="tl-addr">' + UI.esc(it.address) + '</div>' : '') +
        (it.memo ? '<div class="tl-memo">' + UI.esc(it.memo) + '</div>' : '') +
        (overlap ? '<div class="tl-warn">' + UI.icon('clock', 12) + '시간이 겹쳐요</div>' : '') +
        '<div class="tl-foot">' +
          '<button type="button" class="drag-handle" data-drag="handle" data-id="' + UI.esc(it.id) + '" aria-label="' + UI.esc(it.title) + ' 순서 바꾸기">' + UI.icon('grip', 15) + '</button>' +
          (hasPlace ?
            '<a class="tl-map kakao" href="' + links.kakao + '" target="_blank" rel="noopener">' + UI.icon('pin', 13) + '카카오맵</a>' +
            '<a class="tl-map google" href="' + links.google + '" target="_blank" rel="noopener">' + UI.icon('map', 13) + '구글맵</a>' +
            (links.place ? '<a class="tl-map place" href="' + UI.esc(links.place) + '" target="_blank" rel="noopener">장소 정보</a>' : '')
            : '') +
          '<span class="tl-actions">' +
            '<button class="icon-btn" data-action="move-schedule" data-id="' + UI.esc(it.id) + '" data-dir="-1" ' +
              (n === 1 ? 'disabled' : '') + ' aria-label="위로">' + UI.icon('up', 16) + '</button>' +
            '<button class="icon-btn" data-action="move-schedule" data-id="' + UI.esc(it.id) + '" data-dir="1" ' +
              (n === total ? 'disabled' : '') + ' aria-label="아래로">' + UI.icon('down', 16) + '</button>' +
            '<button class="icon-btn" data-action="copy-schedule" data-id="' + UI.esc(it.id) + '" aria-label="다른 날로 복사">' + UI.icon('copy', 16) + '</button>' +
            '<button class="icon-btn" data-action="edit-schedule" data-id="' + UI.esc(it.id) + '" aria-label="수정">' + UI.icon('edit', 16) + '</button>' +
            '<button class="icon-btn danger" data-action="del-schedule" data-id="' + UI.esc(it.id) + '" aria-label="삭제">' + UI.icon('trash', 16) + '</button>' +
          '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  S.defaultDay = function (trip) {
    var key = Core.dayKeyOfDate(trip, Core.todayISO());
    if (key !== 'prep') return key;
    var prep = Core.sortedSchedules(trip.data, 'prep');
    return prep.length ? 'prep' : 'd1';
  };
})(typeof window !== 'undefined' ? window : globalThis);
