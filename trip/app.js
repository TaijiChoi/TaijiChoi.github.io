/* 트립로그 — 앱 셸: 라우팅, 렌더, 이벤트 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI, Screens = TL.Screens;
  var App = (TL.App = {});
  var A = TL.Actions;

  App.view = { screen: 'home', tripId: null, tab: 'schedule', day: '', mDay: 'all', mCat: 'all' };
  var scrollMap = {};
  var booted = false;

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
    App.view.screen = 'trip';
    App.view.tripId = id;
    App.view.tab = tab || App.view.tab || 'schedule';
    App.view.day = '';
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
      if (App.view.tab === 'schedule') App.view.day = day;
      else App.view.mDay = day;
      render();
      return;
    }
    if (act === 'filter-day') { App.view.mDay = el.getAttribute('data-day'); render(); return; }
    if (act === 'filter-cat') { App.view.mCat = el.getAttribute('data-cat'); render(); return; }

    /* 여행/일정/지출/체크/설정 */
    var trip = App.currentTrip();
    switch (act) {
      case 'new-trip': TL.Dialogs.newTrip(); return;
      case 'edit-trip': if (trip) TL.Dialogs.editTrip(trip); return;
      case 'open-share': if (trip) TL.Dialogs.share(trip); return;
      case 'join-trip': TL.Dialogs.join(); return;
      case 'open-settings': TL.Dialogs.settings(trip); return;
      case 'load-sample':
        Store.loadSample();
        UI.close();
        App.goHome();
        UI.toast('예시 여행을 불러왔어요');
        return;
      case 'add-schedule': TL.Dialogs.schedule(trip, null, el.getAttribute('data-day')); return;
      case 'edit-schedule': TL.Dialogs.schedule(trip, el.getAttribute('data-id')); return;
      case 'move-schedule':
        Store.moveSchedule(trip.id, el.getAttribute('data-id'), Number(el.getAttribute('data-dir')));
        return;
      case 'add-expense': TL.Dialogs.expense(trip, null); return;
      case 'edit-expense': TL.Dialogs.expense(trip, el.getAttribute('data-id')); return;
    }

    var fn = A[act];
    if (fn) {
      try { fn(el, ev); } catch (e) {
        console.error(e);
        UI.toast('문제가 생겼어요: ' + (e.message || e));
      }
    }
  });

  /* 입력 중 미리보기 */
  function onFieldChange(ev) {
    var id = ev.target.id;
    if (id === 'f_currency') {
      var cur = ev.target.value;
      var rateEl = document.getElementById('f_rate');
      if (rateEl) rateEl.value = cur === 'KRW' ? '' : Store.tripRate(App.currentTrip(), cur);
      TL.Dialogs.updateExpensePreview();
    } else if (id === 'f_amount' || id === 'f_rate') {
      TL.Dialogs.updateExpensePreview();
    }
  }
  document.addEventListener('input', onFieldChange);
  document.addEventListener('change', onFieldChange);

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var id = ev.target.id;
    if (id === 'member-new') { ev.preventDefault(); if (A['add-member-chip']) A['add-member-chip'](); }
    if (id === 'chk-new') { ev.preventDefault(); if (A['add-check']) A['add-check'](); }
    if (id === 'f_code') { ev.preventDefault(); if (A['do-join']) A['do-join'](); }
    if (id === 'f_amount') { ev.preventDefault(); }
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

  /* --------------------------------------------------------------- boot */
  function boot() {
    booted = true;
    var code = Store.bootRemoteFromURL(location.search);
    var initial = parse();

    Store.onChange(function (info) {
      if (info && info.error) return; // 오류는 render에서 토스트
      render();
    });

    if (code) {
      // 초대 링크로 들어온 경우
      if (Store.firebaseConfig()) {
        UI.toast('초대받은 여행을 불러오는 중…');
        Store.joinByCode(code, Store.settings().nickname).then(function (t) {
          App.openTrip(t.id, 'schedule');
          cleanUrl();
        }).catch(function (e) {
          UI.toast('참여 실패: ' + (e.message || e), 4000);
          TL.Dialogs.join();
          var el = document.getElementById('f_code');
          if (el) el.value = code;
        });
      } else {
        render();
        TL.Dialogs.join();
        var el2 = document.getElementById('f_code');
        if (el2) el2.value = code;
        UI.toast('Firebase 설정을 먼저 입력해 주세요', 3000);
        return;
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
