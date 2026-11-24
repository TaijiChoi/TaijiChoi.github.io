/* 트립로그 — 앱 셸: 라우팅, 렌더, 이벤트 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI, Screens = TL.Screens;
  var App = (TL.App = {});
  var A = TL.Actions;

  App.view = { screen: 'home', tripId: null, tab: 'schedule', day: '', mDay: 'all', mCat: 'all', mapOpen: null, mapSource: 'google' };
  var scrollMap = {};
  var booted = false;

  /* 동선 지도 종류: 기기에 마지막으로 고른 값 (없으면 구글지도) */
  function readMapSource() {
    try {
      var v = root.localStorage && root.localStorage.getItem('triplog.mapSource');
      if (v && TL.Core.MAP_SOURCES[v]) return v;
    } catch (e) {}
    return 'google';
  }

  /** 지도 종류 바꾸기 — 타일이 안 떠서 OSM으로 넘어갈 때도 여기로 온다 */
  App.setMapSource = function (key, opts) {
    var k = TL.Core.mapSource(key).key;
    App.view.mapSource = k;
    try { root.localStorage.setItem('triplog.mapSource', k); } catch (e) {}
    if (App.view.tab === 'schedule') App.view.mapOpen = true;
    render();
    if (opts && opts.message) UI.toast(opts.message, 3200);
    else if (!opts || !opts.silent) UI.toast(k === 'google' ? '구글지도로 바꿨어요' : 'OpenStreetMap으로 바꿨어요', 1600);
  };

  App.currentTrip = function () {
    return App.view.tripId ? Store.trip(App.view.tripId) : null;
  };
  function key() {
    var v = App.view;
    return v.screen === 'home' ? 'home' : 't:' + v.tripId + ':' + v.tab;
  }

  /* ------------------------------------------------------------ routing */
  function parse() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return { screen: 'home' };
    var parts = h.split('/');
    if (parts[0] === 't' && parts[1]) return { screen: 'trip', tripId: decodeURIComponent(parts[1]), tab: parts[2] || 'schedule' };
    return { screen: 'home' };
  }
  function setHash() {
    var v = App.view;
    var h = v.screen === 'trip' ? '#/t/' + encodeURIComponent(v.tripId) + '/' + v.tab : '#/';
    if (location.hash !== h) {
      try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { location.hash = h; }
    }
  }

  App.goHome = function () {
    App.view.screen = 'home';
    App.view.tripId = null;
    setHash();
    render();
    window.scrollTo(0, 0);
  };

  App.openTrip = function (id, tab) {
    var trip = Store.trip(id);
    if (!trip) return;
    // 본인이 방장이거나 일행으로 등록된 여행만 연다 (일행에서 빠졌으면 입장하지 않는다)
    var user = (TL.Auth && TL.Auth.signedIn && TL.Auth.signedIn()) ? TL.Auth.currentUser() : null;
    if (!TL.Core.canViewTrip(trip, user)) {
      App.view.screen = 'home'; App.view.tripId = null;
      setHash(); render();
      UI.toast(trip.sample ? '로그인하면 예시 여행을 체험할 수 있어요' : '이 여행의 일행이 아니에요 · 초대 링크로 다시 참여해 주세요', 3200);
      return;
    }
    App.view.screen = 'trip';
    App.view.tripId = id;
    App.view.tab = tab || 'schedule';
    App.view.day = '';
    App.view.mDay = 'all';
    App.view.mCat = 'all';
    App.view.mapOpen = null;
    Store.setCurrent(id);
    setHash();
    render();
    window.scrollTo(0, 0);
    if (trip.remoteCode) {
      Store.openRemote(trip.id).catch(function (e) {
        UI.toast('실시간 연결 실패: ' + (e.message || e));
      });
    }
  };

  App.setTab = function (tab) {
    if (tab !== 'schedule') App.view.day = App.view.day;
    App.view.tab = tab;
    setHash();
    render();
    window.scrollTo(0, 0);
  };

  /* ------------------------------------------------------------- render */
  function tabbarHtml(active) {
    var tabs = [
      { key: 'schedule', label: '일정', icon: 'calendar' },
      { key: 'money', label: '가계부', icon: 'wallet' },
      { key: 'check', label: '체크리스트', icon: 'checkCircle' }
    ];
    return tabs.map(function (t) {
      return '<button class="' + (active === t.key ? 'active' : '') + '" data-action="tab" data-tab="' + t.key + '">' +
        UI.icon(t.icon, 22) + '<span>' + t.label + '</span><span class="dot"></span></button>';
    }).join('');
  }

  function fabHtml(tab, trip) {
    if (tab === 'schedule') {
      return '<button class="fab" data-action="add-schedule" data-day="' + UI.esc(App.view.day || Screens.defaultDay(trip)) + '">' +
        UI.icon('plus', 20) + '일정</button>';
    }
    if (tab === 'money') {
      return '<button class="fab mint" data-action="add-expense">' + UI.icon('plus', 20) + '지출</button>';
    }
    return '';
  }

  function render() {
    if (!booted) return;
    var v = App.view;
    var screenEl = document.getElementById('screen');
    var tabEl = document.getElementById('tabbar');
    if (!screenEl) return;
    var trip = v.tripId ? Store.trip(v.tripId) : null;
    if (v.screen === 'trip' && !trip) { v.screen = 'home'; v.tripId = null; }
    if (v.screen === 'trip' && trip) {
      var viewer = (TL.Auth && TL.Auth.signedIn && TL.Auth.signedIn()) ? TL.Auth.currentUser() : null;
      if (!Core.canViewTrip(trip, viewer)) {
        // 방장이 일행에서 뺐거나 로그아웃된 경우 — 목록으로 되돌린다
        v.screen = 'home'; v.tripId = null;
        trip = null;
        UI.toast('이 여행은 볼 수 없어요 · 일행에서 빠졌을 수 있어요', 3200);
      }
    }
    if (v.screen === 'trip' && trip) {
      // 기간이 바뀌어 없어진 Day를 가리키고 있으면 초기화한다
      var dayKeys = Core.dayList(trip).map(function (d) { return d.key; });
      if (v.day && dayKeys.indexOf(v.day) < 0) v.day = '';
      if (v.mDay !== 'all' && dayKeys.indexOf(v.mDay) < 0) v.mDay = 'all';
    }

    var html = '';
    if (v.screen === 'home') {
      screenEl.className = 'screen no-tabs';
      html = UI.renderHome();
      tabEl.hidden = true;
      tabEl.innerHTML = '';
      document.title = '트립로그 — 여행 일정 · 가계부';
    } else {
      screenEl.className = 'screen';
      var body = v.tab === 'money' ? Screens.money(trip, v)
        : v.tab === 'check' ? Screens.check(trip, v)
          : Screens.schedule(trip, v);
      html = Screens.tripHeader(trip) + body + fabHtml(v.tab, trip);
      tabEl.hidden = false;
      tabEl.innerHTML = tabbarHtml(v.tab);
      document.title = trip.name + ' — 트립로그';
    }
    screenEl.innerHTML = html;
    var k = key();
    requestAnimationFrame(function () { window.scrollTo(0, scrollMap[k] || 0); });

    // 동선 지도: 지도 패널이 열려 있을 때만 그림을 그린다 (구간 정보는 HTML에 이미 있음)
    if (TL.RouteMap) {
      if (v.screen === 'trip' && trip && v.tab === 'schedule') {
        var dayKey = v.day || Screens.defaultDay(trip);
        requestAnimationFrame(function () { TL.RouteMap.paint(trip, dayKey, v.mapSource); });
      } else {
        TL.RouteMap.hide();
      }
    }

    // 실시간 상태 안내
    if (v.screen === 'trip' && trip && trip.remoteCode) {
      var st = Store.status();
      if (st.error) UI.toast('실시간 오류: ' + st.error, 3200);
    }
  }
  App.render = render;

  /* ------------------------------------------------------------- events */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var act = el.getAttribute('data-action');
    ev.preventDefault();

    /* 라우팅/셸 */
    if (act === 'open-trip') { App.openTrip(el.getAttribute('data-id')); return; }
    if (act === 'go-home') { App.goHome(); return; }
    if (act === 'tab') { App.setTab(el.getAttribute('data-tab')); return; }
    if (act === 'modal-backdrop') {
      if (ev.target === el) UI.close();
      return;
    }
    if (act === 'close-modal') { UI.close(); return; }
    if (act === 'pick-day') {
      var day = el.getAttribute('data-day');
      if (App.view.tab === 'schedule') { App.view.day = day; App.view.mapOpen = null; }
      else App.view.mDay = day;
      render();
      return;
    }
    if (act === 'toggle-map') {
      App.view.mapOpen = el.getAttribute('aria-expanded') !== 'true';
      render();
      return;
    }
    if (act === 'map-source') {
      App.setMapSource(el.getAttribute('data-src'));
      return;
    }
    if (act === 'filter-day') { App.view.mDay = el.getAttribute('data-day'); render(); return; }
    if (act === 'filter-cat') { App.view.mCat = el.getAttribute('data-cat'); render(); return; }

    /* 여행/일정/지출/체크/설정 */
    var trip = App.currentTrip();
    switch (act) {
      case 'new-trip': if (!UI.requireLogin('로그인하면 여행을 만들 수 있어요')) return; TL.Dialogs.newTrip(); return;
      case 'edit-trip': if (!UI.requireLogin('로그인하면 여행 정보를 고칠 수 있어요')) return; if (trip) TL.Dialogs.editTrip(trip); return;
      case 'manage-members': if (trip) TL.Dialogs.members(trip); return;
      case 'who-am-i': if (trip) TL.Dialogs.whoAmI(trip); return;
      case 'open-share': if (trip) TL.Dialogs.share(trip); return;
      case 'join-trip': if (!UI.requireLogin('로그인하면 초대 코드로 참여할 수 있어요')) return; TL.Dialogs.join(); return;
      case 'open-settings': TL.Dialogs.settings(trip); return;
      case 'load-sample':
        Store.loadSample();
        UI.close();
        App.goHome();
        UI.toast('예시 여행을 불러왔어요');
        return;
      case 'add-schedule':
        if (!UI.requireLogin('로그인하면 일정을 추가할 수 있어요')) return;
        TL.Dialogs.schedule(trip, null, el.getAttribute('data-day')); return;
      case 'edit-schedule':
        if (!UI.requireLogin('로그인하면 일정을 고칠 수 있어요')) return;
        TL.Dialogs.schedule(trip, el.getAttribute('data-id')); return;
      case 'move-schedule':
        if (!UI.requireLogin('로그인하면 일정을 옮길 수 있어요')) return;
        Store.moveSchedule(trip.id, el.getAttribute('data-id'), Number(el.getAttribute('data-dir')));
        break;
      case 'add-expense': if (!UI.requireLogin('로그인하면 지출을 기록할 수 있어요')) return; TL.Dialogs.expense(trip, null); return;
      case 'edit-expense': if (!UI.requireLogin('로그인하면 지출을 고칠 수 있어요')) return; TL.Dialogs.expense(trip, el.getAttribute('data-id')); return;
    }

    var fn = A[act];
    if (fn) {
      try { fn(el, ev); } catch (e) {
        console.error(e);
        UI.toast('문제가 생겼어요: ' + (e.message || e));
      }
    }
    // Store가 권한 때문에 거부했으면 그 이유를 알려 준다 (로그인 유도 포함)
    var deny = Store.takeError();
    if (deny) UI.denyToast(deny);
  });

  /* 입력 중 미리보기 */
  function onFieldChange(ev) {
    var id = ev.target.id;
    if (id === 'f_currency') {
      var cur = ev.target.value;
      var rateEl = document.getElementById('f_rate');
      if (rateEl) rateEl.value = cur === 'KRW' ? '' : (Store.cachedAutoRate(cur) || Store.tripRate(App.currentTrip(), cur));
      if (TL.Dialogs.resetRateManual) TL.Dialogs.resetRateManual();
      TL.Dialogs.updateExpensePreview();
      if (cur !== 'KRW' && TL.Dialogs.autoRate) TL.Dialogs.autoRate(cur);
    } else if (id === 'f_time') {
      if (TL.Dialogs.syncTimePick) TL.Dialogs.syncTimePick();
    } else if (id === 'f_amount' || id === 'f_rate' || id === 'f_charged') {
      if (id === 'f_rate' && TL.Dialogs.markRateManual) TL.Dialogs.markRateManual();
      TL.Dialogs.updateExpensePreview();
    }
  }
  document.addEventListener('input', onFieldChange);
  document.addEventListener('change', onFieldChange);

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (TL.UI.modalOpen()) { TL.UI.close(); ev.preventDefault(); }
      return;
    }
    if (ev.key !== 'Enter') return;
    var id = ev.target.id;
    if (id === 'member-new') { ev.preventDefault(); if (A['add-member-chip']) A['add-member-chip'](); }
    if (id === 'mem-new') { ev.preventDefault(); if (A['mem-add']) A['mem-add'](); }
    if (id === 'mem-edit-input') { ev.preventDefault(); if (A['mem-save']) A['mem-save'](document.activeElement); }
    if (id === 'who-new') { ev.preventDefault(); if (A['who-join']) A['who-join'](); }
    if (id === 'chk-new') { ev.preventDefault(); if (A['add-check']) A['add-check'](); }
    if (id === 'f_code') { ev.preventDefault(); if (A['do-join']) A['do-join'](); }
    if (id === 'f_name' || id === 'f_dest') { ev.preventDefault(); }
    if (id === 'f_amount') { ev.preventDefault(); }
    if (id === 'pl_q') { ev.preventDefault(); if (A['pl-search']) A['pl-search'](); }
    if (id === 'f_charged') { ev.preventDefault(); }
  });

  window.addEventListener('scroll', function () {
    scrollMap[key()] = window.scrollY;
  }, { passive: true });

  window.addEventListener('hashchange', function () {
    var r = parse();
    if (r.screen === 'trip') {
      App.view.screen = 'trip';
      App.view.tripId = r.tripId;
      App.view.tab = r.tab;
      render();
    } else {
      App.view.screen = 'home';
      App.view.tripId = null;
      render();
    }
  });

  /* ---------------------------------------------------- 순서 드래그(포인터) */
  var drag = null;

  function dragCleanup() {
    if (!drag) return;
    if (drag.el) {
      drag.el.classList.remove('dragging');
      drag.el.style.transform = '';
    }
    Array.prototype.forEach.call(document.querySelectorAll('.tl-item.drop-hint'), function (el) {
      el.classList.remove('drop-hint');
    });
    document.body.classList.remove('dragging');
    drag = null;
  }

  document.addEventListener('pointerdown', function (ev) {
    var h = ev.target.closest('[data-drag="handle"]');
    if (!h || ev.button === 2) return;
    var item = h.closest('.tl-item');
    var list = document.getElementById('tl-list');
    if (!item || !list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('.tl-item'));
    var idx = items.indexOf(item);
    if (idx < 0) return;
    ev.preventDefault();
    drag = {
      el: item, items: items, from: idx, to: idx, startY: ev.clientY, moved: false,
      day: list.getAttribute('data-day'), id: h.getAttribute('data-id'), pointer: ev.pointerId
    };
    item.classList.add('dragging');
    document.body.classList.add('dragging');
    try { h.setPointerCapture(ev.pointerId); } catch (e) {}
  });

  document.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var dy = ev.clientY - drag.startY;
    if (Math.abs(dy) > 5) drag.moved = true;
    drag.el.style.transform = 'translateY(' + dy + 'px)';
    var y = ev.clientY;
    var to = 0;
    drag.items.forEach(function (el) {
      if (el === drag.el) return;
      var r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) to++;
    });
    drag.to = to;
    drag.items.forEach(function (el) { if (el !== drag.el) el.classList.remove('drop-hint'); });
    var others = drag.items.filter(function (el) { return el !== drag.el; });
    if (others[to]) others[to].classList.add('drop-hint');
    if (ev.cancelable) ev.preventDefault();
  }, { passive: false });

  document.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag;
    var trip = App.currentTrip();
    dragCleanup();
    if (d.moved && trip) Store.reorderSchedule(trip.id, d.day, d.id, d.to);
  });
  document.addEventListener('pointercancel', dragCleanup);

  /* --------------------------------------------------------- 오프라인 */
  window.addEventListener('online', function () {
    Store.setOnline(true);
    UI.toast('다시 연결됐어요 · 저장한 내용을 동기화해요');
    if (TL.RouteMap) TL.RouteMap.online();
    render();
  });
  window.addEventListener('offline', function () {
    Store.setOnline(false);
    UI.toast('오프라인 · 기기에 저장하고 나중에 동기화해요', 3000);
    render();
  });

  /* ------------------------------------------------------- 서비스 워커 */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    var https = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!https) return;
    try {
      navigator.serviceWorker.register('./sw.js').catch(function (e) {
        console.warn('[triplog] service worker', e);
      });
    } catch (e) { /* 사생활 보호 모드 등 */ }
  }

  /* --------------------------------------------------------------- boot */
  var pendingCode = '';   // 로그인 전에 열린 초대 링크 — 로그인하면 이어서 참여한다

  function tryJoin(code, opts) {
    if (!Store.firebaseConfig()) {
      render();
      TL.Dialogs.join();
      var e1 = document.getElementById('f_code');
      if (e1) e1.value = code;
      UI.toast('Firebase 설정을 먼저 입력해 주세요', 3000);
      return;
    }
    UI.toast('초대받은 여행을 불러오는 중…');
    Store.joinByCode(code, Store.settings().nickname).then(function (t) {
      pendingCode = '';
      App.openTrip(t.id, 'schedule');
      cleanUrl();
      TL.Dialogs.maybeWhoAmI(Store.trip(t.id));
    }).catch(function (e) {
      var needLogin = e && e.code === 'need-login';
      UI.toast(needLogin ? '로그인한 뒤 초대 링크를 다시 열어 주세요' : '참여 실패: ' + (e.message || e), 4000);
      TL.Dialogs.join();
      var el = document.getElementById('f_code');
      if (el) el.value = code;
    });
  }

  function boot() {
    booted = true;
    App.view.mapSource = readMapSource();
    Store.setOnline(navigator.onLine !== false);
    // 계정 로그인: Firebase 설정이 있을 때만 조용히 시작한다
    try {
      if (TL.Auth) TL.Auth.init();
      if (TL.Account) {
        TL.Account.init();
        TL.Account.onChange(function () { render(); });
      }
      if (TL.Auth && TL.Auth.onChange) {
        TL.Auth.onChange(function (user) {
          if (!user || !user.uid) return;
          // 로그인 직후: 소유자 없는 내 여행을 이 계정 것으로 정리하고, 대기 중인 초대 링크를 이어서 처리
          try { Store.claimTrips(user.uid); } catch (e) {}
          if (pendingCode) { var c = pendingCode; pendingCode = ''; tryJoin(c); }
        });
      }
    } catch (e) { console.warn('[triplog] auth', e); }
    var code = Store.bootRemoteFromURL(location.search);
    var initial = parse();

    Store.onChange(function (info) {
      if (info && info.error) return; // 오류는 render에서 토스트
      render();
    });

    if (code) {
      // 초대 링크로 들어온 경우 — 참여는 로그인한 사용자만
      if (!Store.signedIn()) {
        pendingCode = code;
        render();
        UI.requireLogin('초대받은 여행에 참여하려면 로그인해 주세요');
        var ce = document.getElementById('f_code');
        if (ce) ce.value = code;
      } else {
        tryJoin(code);
      }
    } else if (Store.firstRun()) {
      Store.loadSample();
      Store.markWelcome();
    }

    if (initial.screen === 'trip') {
      App.view.screen = 'trip';
      App.view.tripId = initial.tripId;
      App.view.tab = initial.tab;
    }
    render();
    registerSW();
    if (initial.screen === 'trip') {
      var t = Store.trip(initial.tripId);
      if (t && t.remoteCode) Store.openRemote(t.id).catch(function () {});
    }
  }

  function cleanUrl() {
    try {
      var u = location.pathname + location.hash;
      history.replaceState(null, '', u);
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
