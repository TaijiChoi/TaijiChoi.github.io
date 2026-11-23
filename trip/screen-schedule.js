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
      '<h1>' + UI.esc(trip.name) + (remote ? '<span class="sub">일행과 실시간 공유 중</span>' : '') + '</h1>' +
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

  /* 날짜 칩 */
  S.dayChips = function (trip, active, action) {
    var list = Core.dayList(trip);
    return '<div class="chips">' + list.map(function (d) {
      var sub = d.date ? Core.isoLabel(d.date).replace(/\s?\(.\)$/, '') : '';
      var mmdd = d.date ? (Core.parse(d.date).getMonth() + 1) + '/' + Core.parse(d.date).getDate() : '';
      return '<button class="chip' + (active === d.key ? ' active' : '') + '" data-action="' + action + '" data-day="' + d.key + '">' +
        d.label + (mmdd ? '<span class="d">' + mmdd + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  };

  /* ------------------------------------------------------------- 일정 탭 */
  S.schedule = function (trip, view) {
    var day = view.day || S.defaultDay(trip);
    var items = Core.sortedSchedules(trip.data, day);
    var html = '';
    html += '<div class="body">';
    html += S.dayChips(trip, day, 'pick-day');
    html += '<div class="row between" style="margin:14px 2px 6px">' +
      '<span class="tiny muted">' + Core.daySubLabel(trip, day) + '</span>' +
      '<span class="tiny muted">' + items.length + '개 일정</span>' +
    '</div>';

    if (!items.length) {
      html += '<div class="empty" style="margin-top:6px">' +
        '<div class="emo">🗺️</div>' +
        '<h3>' + Core.dayLabel(trip, day) + ' 일정이 비어 있어요</h3>' +
        '<p>' + (day === 'prep' ? '항공권·숙소 같은 준비 항목을 적어두면 좋아요.' : '가고 싶은 곳을 순서대로 추가해 보세요.') + '</p>' +
        '<div class="btn-row"><button class="btn btn-soft" data-action="add-schedule" data-day="' + day + '">' +
          UI.icon('plus') + '일정 추가</button></div>' +
      '</div>';
    } else {
      html += '<div class="tl">' + items.map(function (it, i) {
        return S.scheduleItem(trip, it, i + 1, items.length);
      }).join('') + '</div>';
      html += '<button class="btn btn-ghost" data-action="add-schedule" data-day="' + day + '" style="margin-top:6px">' +
        UI.icon('plus') + '일정 추가</button>';
    }
    html += '</div>';
    return html;
  };

  S.scheduleItem = function (trip, it, n, total) {
    var cat = Core.schedCat(it.category);
    var links = Core.mapLinks(it.place || it.title);
    var hasPlace = !!(it.place || it.title);
    var time = it.time ? '<span class="tl-time">' + UI.esc(it.time) + '</span>' : '<span class="tl-time none">시간 미정</span>';
    return '<div class="tl-item cat-' + cat.key + '">' +
      '<div class="tl-badge">' + n + '</div>' +
      '<div class="tl-card">' +
        '<div class="tl-top">' +
          time +
          '<span class="tl-title">' + UI.esc(it.title) + '</span>' +
          '<span class="tl-cat">' + UI.icon(cat.icon, 12) + UI.esc(cat.label) + '</span>' +
        '</div>' +
        (it.memo ? '<div class="tl-memo">' + UI.esc(it.memo) + '</div>' : '') +
        '<div class="tl-foot">' +
          (hasPlace ?
            '<a class="tl-map kakao" href="' + links.kakao + '" target="_blank" rel="noopener">' + UI.icon('pin', 13) + '카카오맵</a>' +
            '<a class="tl-map google" href="' + links.google + '" target="_blank" rel="noopener">' + UI.icon('map', 13) + '구글맵</a>'
            : '') +
          '<span class="tl-actions">' +
            '<button class="icon-btn" data-action="move-schedule" data-id="' + UI.esc(it.id) + '" data-dir="-1" ' +
              (n === 1 ? 'disabled' : '') + ' aria-label="위로">' + UI.icon('up', 16) + '</button>' +
            '<button class="icon-btn" data-action="move-schedule" data-id="' + UI.esc(it.id) + '" data-dir="1" ' +
              (n === total ? 'disabled' : '') + ' aria-label="아래로">' + UI.icon('down', 16) + '</button>' +
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
