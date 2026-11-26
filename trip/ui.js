/* 트립로그 — 공통 UI 조각 (아이콘, 토스트, 모달, 홈 화면) */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core;
  var Store = TL.Store;
  var UI = (TL.UI = {});

  /* --------------------------------------------------------------- icons */
  var P = {
    plane: '<path d="M2.5 13.2 21 6.4l-8.2 15.4-2.2-6.5z"/><path d="M10.6 15.3 13.9 12"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3.5"/><path d="M8 3v4M16 3v4M3 10.5h18"/>',
    wallet: '<rect x="2.6" y="6" width="18.8" height="13.4" rx="3.4"/><path d="M2.6 10.4h18.8"/><circle cx="17" cy="15" r="1.3"/>',
    receipt: '<path d="M6 3.2h12v17.6l-3-1.9-3 1.9-3-1.9-3 1.9z"/><path d="M9.2 8.6h5.6M9.2 12.3h5.6"/>',
    check: '<path d="M5 12.6l4.6 4.6L19 6.8"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.2 12.3l2.7 2.7 4.9-5.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.69 2.69l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.47V21a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.69-2.69l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.47-.97H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.69-2.69l.06.06a1.6 1.6 0 0 0 1.76.32H9a1.6 1.6 0 0 0 .97-1.47V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.69 2.69l-.06.06a1.6 1.6 0 0 0-.32 1.76V9a1.6 1.6 0 0 0 1.47.97H21a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.47.97z"/>',
    share: '<circle cx="18" cy="5.5" r="2.8"/><circle cx="6" cy="12" r="2.8"/><circle cx="18" cy="18.5" r="2.8"/><path d="M8.6 10.7l6.8-3.9M8.6 13.3l6.8 3.9"/>',
    camera: '<path d="M3.6 8.4h3l1.9-2.8h7l1.9 2.8h3v10.6H3.6z"/><circle cx="12" cy="13.4" r="3.3"/>',
    food: '<path d="M7 3.2v7.6a2 2 0 0 0 4 0V3.2"/><path d="M9 10.8v10"/><path d="M17 3.2c-1.4 1.3-2.1 3.1-2.1 5.3s.7 3.9 2.1 5.2v7.1"/>',
    cup: '<path d="M4.2 8.2h11.6v5.9a4.2 4.2 0 0 1-4.2 4.2H8.4a4.2 4.2 0 0 1-4.2-4.2z"/><path d="M15.8 9.4h1.6a2.5 2.5 0 1 1 0 5h-1.6"/><path d="M7.4 5.6c0-1 .9-1.2.9-2.2"/>',
    bed: '<path d="M3 18.4v-6.2h13.2a4.2 4.2 0 0 1 4.2 4.2v2"/><path d="M3 18.4h18"/><path d="M7.4 12.2V9.6h4.8v2.6"/>',
    transport: '<path d="M3.2 15.6 20.8 8.4 12 21l-2.2-6.2z"/>',
    bag: '<path d="M6.2 8.2h11.6l1 11.6H5.2z"/><path d="M9.2 8.2V6.6a2.8 2.8 0 0 1 5.6 0v1.6"/>',
    pin: '<path d="M12 21.2s7-5.6 7-11.2a7 7 0 1 0-14 0c0 5.6 7 11.2 7 11.2z"/><circle cx="12" cy="10" r="2.5"/>',
    trash: '<path d="M4 7h16M9.2 7V4.2h5.6V7M6.2 7l1 13.2h9.6L17.8 7"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M15 5.4H6.4A2.4 2.4 0 0 0 4 7.8v8.6"/>',
    link: '<path d="M10.2 13.4a4.6 4.6 0 0 0 6.6 0l1.8-1.8a4.6 4.6 0 0 0-6.6-6.6l-1 1"/><path d="M13.8 10.6a4.6 4.6 0 0 0-6.6 0l-1.8 1.8a4.6 4.6 0 0 0 6.6 6.6l1-1"/>',
    download: '<path d="M12 4v10.6M7.4 10.8 12 15.4l4.6-4.6"/><path d="M4.4 19.2h15.2"/>',
    upload: '<path d="M12 15.4V4.8M7.4 8.6 12 4l4.6 4.6"/><path d="M4.4 19.2h15.2"/>',
    users: '<circle cx="9.2" cy="8" r="3.2"/><path d="M3.2 19.8c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6"/><path d="M15.8 5.4a3 3 0 0 1 0 5.4"/><path d="M17.4 14.6c2.1.8 3.4 2.5 3.4 5.2"/>',
    lock: '<rect x="4.8" y="10.6" width="14.4" height="9.6" rx="2.6"/><path d="M8.2 10.6V8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
    sparkle: '<path d="M12 3.4l1.8 5.2 5.2 1.8-5.2 1.8L12 17.4l-1.8-5.2L5 10.4l5.2-1.8z"/><path d="M18.6 16.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
    clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.4 2"/>',
    swap: '<path d="M4 8.4h13.2M14 5l3.4 3.4-3.4 3.4"/><path d="M20 15.6H6.8M10 12.2 6.6 15.6 10 19"/>',
    chart: '<path d="M4 20V9.6M9.4 20V4.4M14.8 20v-7.2M20.2 20v-4"/>',
    google: '<path d="M20.6 12.2c0-.7-.06-1.3-.18-1.9H12v3.6h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.7z"/><path d="M12 21c2.4 0 4.4-.8 5.9-2.1l-2.9-2.3c-.8.5-1.8.9-3 .9a5.3 5.3 0 0 1-5-3.6H4v2.4A9 9 0 0 0 12 21z"/><path d="M7 13.9a5.4 5.4 0 0 1 0-3.8V7.7H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.7l3 2.4a5.3 5.3 0 0 1 5-3.5z"/>',
    map: '<path d="M9.4 3.6 3.6 5.8v14.6l5.8-2.2 5.2 2.2 5.8-2.2V3.6L14.6 5.8z"/><path d="M9.4 3.6v14.6M14.6 5.8v14.6"/>',
    bell: '<path d="M18 15.6V10a6 6 0 1 0-12 0v5.6L4.4 18h15.2z"/><path d="M10 21h4"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.2A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>',
    grip: '<circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9z"/>'
  };
  UI.icon = function (name, size) {
    var p = P[name] || P.pin;
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  };
  UI.icons = P;

  /* ------------------------------------------------------------- helpers */
  UI.esc = Core.esc;
  UI.avatar = function (name, cls) {
    var n = String(name || '?').trim();
    var ch = n ? n.charAt(0) : '?';
    var hue = 0;
    for (var i = 0; i < n.length; i++) hue = (hue * 31 + n.charCodeAt(i)) % 360;
    var bg = 'linear-gradient(135deg, hsl(' + hue + ',72%,58%), hsl(' + ((hue + 34) % 360) + ',72%,48%))';
    return '<span class="avatar ' + (cls || '') + '" style="background:' + bg + '">' + UI.esc(ch) + '</span>';
  };
  UI.avatarsHtml = function (members, max) {
    var list = (members || []).slice(0, max || 3);
    var extra = (members || []).length - list.length;
    return '<span class="avatars">' + list.map(function (m) { return UI.avatar(m.name); }).join('') +
      (extra > 0 ? '<span class="avatar" style="background:#E8EDF6;color:#64748B">+' + extra + '</span>' : '') + '</span>';
  };
  /* ------------------------------------------------------- member chips */
  /** 색 배지가 붙은 일행 칩. remove 액션 이름을 주면 × 버튼이 생긴다. */
  UI.memberChip = function (m, opts) {
    opts = opts || {};
    return '<span class="mchip' + (opts.me ? ' me' : '') + '">' +
      UI.avatar(m.name, 'sm') +
      '<span class="nm">' + UI.esc(m.name) + '</span>' +
      (opts.me ? '<span class="me-tag">나</span>' : '') +
      (opts.remove
        ? '<button type="button" class="chip-x" data-action="' + opts.remove + '" data-id="' + UI.esc(m.id) + '" aria-label="' + UI.esc(m.name) + ' 삭제">' + UI.icon('close', 11) + '</button>'
        : '') +
      '</span>';
  };

  /* ------------------------------------------------------------ calendar */
  UI.calendarHtml = function (o) {
    o = o || {};
    var start = Core.isISODate(o.start) ? o.start : '';
    var end = Core.isISODate(o.end) ? o.end : '';
    var month = /^\d{4}-\d{2}$/.test(o.month || '') ? o.month : Core.monthKeyOf(start || Core.todayISO());
    var weeks = Core.monthWeeks(month);
    var html = '<div class="cal" data-month="' + month + '">';
    html += '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-action="cal-prev" aria-label="이전 달">' + UI.icon('back', 18) + '</button>' +
      '<div class="cal-month" aria-live="polite">' + Core.monthLabel(month) + '</div>' +
      '<button type="button" class="cal-nav fwd" data-action="cal-next" aria-label="다음 달">' + UI.icon('back', 18) + '</button>' +
    '</div>';
    html += '<div class="cal-wd">' + ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) {
      return '<span class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</span>';
    }).join('') + '</div>';
    html += '<div class="cal-grid">';
    weeks.forEach(function (week) {
      week.forEach(function (c) {
        var cls = 'cal-day';
        if (c.out) cls += ' out';
        if (c.today) cls += ' today';
        if (start && c.iso === start) cls += ' start';
        if (end && c.iso === end && end !== start) cls += ' end';
        if (start && end && c.iso > start && c.iso < end) cls += ' in';
        if (c.wd === 0) cls += ' sun';
        if (c.wd === 6) cls += ' sat';
        html += '<button type="button" class="' + cls + '" data-action="cal-pick" data-date="' + c.iso + '" ' +
          'aria-label="' + Core.isoFullLabel(c.iso) + '">' + c.day + '</button>';
      });
    });
    html += '</div>';
    var sum = '';
    if (start) sum = end && end !== start ? Core.isoMDwd(start) + ' ~ ' + Core.isoMDwd(end) : Core.isoMDwd(start);
    html += '<div class="cal-legend">' + (start
      ? '<b>' + UI.esc(sum) + '</b><span>' + (end ? Core.stayLabel(start, end) : '종료일을 눌러 주세요') + '</span>'
      : '<span class="muted">시작일을 눌러 주세요</span>') + '</div>';
    html += '<div class="cal-quick">' + [0, 1, 2, 3, 4].map(function (n) {
      return '<button type="button" class="cal-chip" data-action="cal-preset" data-nights="' + n + '">' +
        (n === 0 ? '당일' : n + '박 ' + (n + 1) + '일') + '</button>';
    }).join('') + '</div>';
    html += '</div>';
    return html;
  };

  /** 기간 선택 필드: 버튼을 누르면 폼 안에서 달력이 펼쳐진다 */
  UI.rangeFieldHtml = function (o) {
    o = o || {};
    var start = Core.isISODate(o.start) ? o.start : '';
    var end = Core.isISODate(o.end) ? o.end : '';
    var days = start && end ? Core.diffDays(start, end) + 1 : 0;
    var label = start ? Core.isoMDwd(start) + (end && end !== start ? ' ~ ' + Core.isoMDwd(end) : '') : '날짜를 골라 주세요';
    var sub = !start ? '달력에서 시작일과 종료일을 차례로 눌러 주세요'
      : end ? Core.stayLabel(start, end) + ' · ' + days + '일'
        : '시작일을 골랐어요 · 종료일을 눌러 주세요';
    return '<div class="range-field' + (o.open ? ' open' : '') + '" id="range-field">' +
      '<button type="button" class="range-btn" data-action="cal-toggle" aria-expanded="' + (o.open ? 'true' : 'false') + '">' +
        '<span class="range-ic">' + UI.icon('calendar', 20) + '</span>' +
        '<span class="range-txt"><b id="range-label">' + UI.esc(label) + '</b><small id="range-sub">' + UI.esc(sub) + '</small></span>' +
        '<span class="range-chev">' + UI.icon('down', 16) + '</span>' +
      '</button>' +
      '<div class="cal-wrap' + (o.open ? '' : ' hide') + '" id="cal-wrap">' +
        (o.open ? UI.calendarHtml({ start: start, end: end, month: o.month }) : '') +
      '</div>' +
    '</div>';
  };

  /** 여행 상세 상단의 일행 줄 */
  UI.peopleBarHtml = function (trip) {
    var members = trip.members || [];
    var me = Store.meId(trip, null);
    return '<div class="people-bar">' +
      '<div class="people-list">' + (members.length ? members.map(function (m) {
        return '<span class="pchip' + (m.id === me ? ' me' : '') + '">' + UI.avatar(m.name, 'sm') +
          '<span class="nm">' + UI.esc(m.name) + '</span>' + (m.id === me ? '<span class="me-tag">나</span>' : '') + '</span>';
      }).join('') : '<span class="tiny muted">일행을 추가해 보세요</span>') + '</div>' +
      '<button type="button" class="people-add" data-action="manage-members">' + UI.icon('plus', 14) + '일행</button>' +
    '</div>';
  };

  UI.thumbBg = function (seed) {
    var hues = [[214, 100, 58], [174, 92, 44], [262, 78, 62], [24, 92, 58], [330, 80, 60], [196, 88, 50]];
    var h = 0;
    var s = String(seed || 'trip');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    var c = hues[h % hues.length];
    return 'linear-gradient(140deg, hsl(' + c[0] + ',' + c[1] + '%,' + c[2] + '%), hsl(' + ((c[0] + 42) % 360) + ',' + c[1] + '%,' + Math.max(28, c[2] - 12) + '%))';
  };

  UI.toast = function (msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  };

  UI.open = function (bodyHtml, opts) {
    opts = opts || {};
    var rootEl = document.getElementById('modal-root');
    rootEl.innerHTML =
      '<div class="modal" data-action="modal-backdrop">' +
        '<div class="sheet" role="dialog" aria-modal="true">' +
          '<div class="sheet-handle"></div>' +
          (opts.title ? '<div class="sheet-head"><h3>' + UI.esc(opts.title) + '</h3>' +
            '<button class="icon-btn sm" data-action="close-modal" aria-label="닫기">' + UI.icon('close') + '</button></div>' : '') +
          '<div class="sheet-body">' + bodyHtml + '</div>' +
        '</div>' +
      '</div>';
    document.body.style.overflow = 'hidden';
  };
  UI.close = function () {
    var rootEl = document.getElementById('modal-root');
    if (rootEl) rootEl.innerHTML = '';
    document.body.style.overflow = '';
  };
  UI.modalOpen = function () { return !!(document.getElementById('modal-root') || {}).innerHTML; };

  UI.val = function (id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  };
  UI.num = function (id) { return Core.num(UI.val(id), 0); };
  UI.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  UI.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  UI.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  };
  UI.copy = function (text) {
    UI.copyAsync(text).then(function (ok) { UI.toast(ok ? '복사했어요' : '복사에 실패했어요'); });
  };
  /** 클립보드 복사 → Promise<boolean>. 실패하면 textarea 폴백까지 시도한다. */
  UI.copyAsync = function (text) {
    return new Promise(function (resolve) {
      try {
        if (typeof navigator !== 'undefined' && navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); },
            function () { resolve(UI.fallbackCopy(text)); });
          return;
        }
      } catch (e) {}
      resolve(UI.fallbackCopy(text));
    });
  };
  UI.fallbackCopy = function (text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy') !== false; } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  };
  UI.shareText = function (title, text) {
    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function () {});
    } else {
      UI.copy(text);
    }
  };
  UI.refresh = function () { if (TL.App && TL.App.render) TL.App.render(); };
  /** v27: 새 버전이 준비됐을 때 띄우는 배너 HTML (app.js가 화면에 붙인다) */
  UI.updateBannerHtml = function () {
    return '<span class="ub-ic">' + UI.icon('sparkle', 16) + '</span>' +
      '<span class="ub-tx"><b>새 버전이 준비됐어요</b><small>새로고침하면 최신 화면으로 바뀌어요</small></span>' +
      '<button type="button" class="btn xs btn-primary" id="upd-go">새로고침</button>' +
      '<button type="button" class="icon-btn sm" id="upd-close" aria-label="나중에">' + UI.icon('close', 14) + '</button>';
  };

  /* ------------------------------------------------------------ 권한(v20) */
  /** 로그인했는지 확인하고, 안 했으면 안내 토스트와 함께 로그인 시트를 연다 */
  UI.requireLogin = function (msg) {
    var signed = false;
    try { signed = !!(TL.Auth && TL.Auth.signedIn && TL.Auth.signedIn()); } catch (e) {}
    if (signed) return true;
    UI.toast(msg || '로그인하고 함께 써요 · 로그인하면 여행을 만들고 기록할 수 있어요', 3000);
    if (TL.Dialogs && TL.Dialogs.account) TL.Dialogs.account();
    return false;
  };
  /** Store가 남긴 거부 이유를 사용자 문장으로 보여준다 */
  UI.denyToast = function (code) {
    if (code === 'login') { UI.requireLogin(); return; }
    if (code === 'owner') { UI.toast('방장만 일행을 추가·수정·삭제할 수 있어요', 2800); return; }
    if (code === 'notmember') { UI.toast('이 여행의 일행이 아니에요 · 초대 링크로 다시 참여해 주세요', 3200); return; }
  };

  /* ------------------------------------------------------------ account */
  /** 홈 상단의 계정 배지: 로그인 전에는 'Google 로그인' 버튼, 로그인 뒤에는 이름 칩 */
  UI.accountBadgeHtml = function () {
    if (TL.Auth && TL.Auth.signedIn()) {
      var name = TL.Auth.displayName();
      return '<button class="acct-chip" data-action="open-account" aria-label="계정">' +
        UI.avatar(name, 'sm') + '<span class="nm">' + UI.esc(name) + '</span>' +
        (TL.Account && TL.Account.syncing() ? '<span class="dot-sync" aria-hidden="true"></span>' : '') +
        '</button>';
    }
    return '<button class="auth-btn" data-action="open-account">' + UI.icon('google', 15) + '<span>로그인</span></button>';
  };

  /* --------------------------------------------------------------- home */
  UI.renderHome = function () {
    var signed = !!(TL.Auth && TL.Auth.signedIn());
    var user = signed ? TL.Auth.currentUser() : null;
    var trips = Store.visibleTrips(user);          // 방장이거나 일행으로 등록된 여행만
    var mine = trips.filter(function (t) { return !t.sample; });
    var html = '';
    html += '<header class="topbar plain">' +
      '<div class="brand"><span class="brand-mark">' + UI.icon('plane', 16) + '</span>트립로그</div>' +
      UI.accountBadgeHtml() +
      '<button class="icon-btn" data-action="open-settings" aria-label="설정">' + UI.icon('gear') + '</button>' +
      '</header>';
    html += '<div class="body">';
    html += '<section class="hello">' +
      '<h1>' + (signed ? UI.esc(TL.Auth.displayName()) + '님,<br><span class="grad-text">여행 준비는 여기서</span>' : '여행 준비,<br><span class="grad-text">기록은 여기서</span>') + '</h1>' +
      '<p>일정 · 가계부 · 준비물을 한 곳에. 일행과 실시간으로 함께 써요.</p>' +
      '</section>';

    if (!signed) {
      html += '<div class="card flat login-note">' +
        '<div class="ln-head">' + UI.icon('lock', 17) + '<b>로그인하면 내 여행이 보여요</b></div>' +
        '<p>내가 만든 여행과 일행으로 등록된 여행만 목록에 나와요. 여행 만들기·참여·일정·지출 등록도 로그인 후에 할 수 있어요.</p>' +
        '<button class="btn btn-primary sm" data-action="open-account">' + UI.icon('google', 16) + 'Google로 로그인</button>' +
        '<div class="hintline" style="margin-top:6px">내 여행은 <b>계정(Firebase)에 저장</b>돼 다른 기기에서도 그대로 열려요.</div>' +
      '</div>';
    }

    if (!mine.length) {
      html += '<div class="empty">' +
        '<div class="emo">🧳</div>' +
        '<h3>' + (signed ? '아직 여행이 없어요' : '내 여행은 로그인 후에 보여요') + '</h3>' +
        '<p>' + (signed ? '새 여행을 만들거나, 일행에게 받은 초대 코드로 참여해 보세요.' : '로그인하면 내 여행 목록이 여기에 나와요.') + '</p>' +
        '<div class="btn-row"><button class="btn btn-primary" data-action="new-trip">' + UI.icon('plus') + '새 여행 만들기</button></div>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-action="join-trip">' + UI.icon('link') + '초대 코드로 참여하기</button></div>' +
        '</div>';
    }

    if (mine.length) {
      html += '<div class="trip-list">' + mine.map(function (t) { return UI.tripCardHtml(t, user); }).join('') + '</div>';
      html += '<div class="home-actions">' +
        '<button class="btn btn-primary" data-action="new-trip">' + UI.icon('plus') + '새 여행 만들기</button>' +
        '<button class="btn btn-ghost" data-action="join-trip">' + UI.icon('link') + '초대 코드로 참여하기</button>' +
        '</div>';
    }

    html += '<div class="tiny muted center" style="margin:26px 0 8px;line-height:1.6">' +
      (signed
        ? '로그인한 계정에 여행 목록을 저장했어요.<br>다른 기기에서 같은 계정으로 로그인하면 그대로 열려요.'
        : '데이터는 로그인한 계정에 저장돼요.<br>일행과 함께 쓰려면 초대 링크를 받아 참여하세요.') + '</div>';
    html += '</div>';
    return html;
  };

  UI.tripCardHtml = function (trip, user) {
    var t = Core.totals(trip, trip.data);
    var dday = Core.dday(trip);
    var dcls = /D-\d|D-DAY/.test(dday) ? '' : (dday === '여행 중' ? 'mint' : 'gray');
    var people = (trip.members || []).length;
    var sub = [trip.destination, Core.rangeLabel(trip.startDate, trip.endDate)].filter(Boolean).join(' · ');
    var me = user === undefined ? null : user;
    var isOwner = !!(me && me.uid && String(trip.ownerUid || '') === String(me.uid));
    return '<button class="trip-card" data-action="open-trip" data-id="' + UI.esc(trip.id) + '">' +
      '<span class="trip-thumb" style="background:' + UI.thumbBg(trip.destination || trip.name) + '">' +
        (trip.remoteCode ? UI.icon('users', 24) : UI.icon('plane', 24)) +
      '</span>' +
      '<span class="trip-main">' +
        '<span class="row between" style="gap:6px">' +
          '<span class="trip-title">' + UI.esc(trip.name) + '</span>' +
          '<span class="row gap6" style="flex:none">' +
            (trip.sample ? '<span class="pill gray">예시</span>' : (isOwner && trip.remoteCode ? '<span class="pill mint">방장</span>' : '')) +
            '<span class="dday ' + dcls + '">' + UI.esc(dday) + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="trip-meta">' + UI.esc(sub) + '</span>' +
        '<span class="trip-foot">' +
          '<span class="row gap6">' + UI.avatarsHtml(trip.members, 3) +
            '<span class="trip-meta">' + (people ? people + '명' : '일행 없음') + '</span>' +
          '</span>' +
          '<span class="trip-total">' + (t.total ? Core.won(t.total) : '지출 없음') + '</span>' +
        '</span>' +
      '</span>' +
    '</button>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
