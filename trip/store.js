/* 트립로그 — 저장소
   로컬 모드: localStorage
   실시간 모드: Firebase Firestore (CDN ESM, 필요할 때만 로드)
   두 모드 모두 같은 API를 쓴다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core;
  var Store = (TL.Store = {});

  var KEY = 'triplog.v1';
  var FB_VERSION = '10.12.2';
  var FB_BASE = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
  var COLLS = ['schedules', 'expenses', 'checklist', 'reservations'];

  /* 기본 내장 Firebase 프로젝트 (triplog-c4921).
     기기에 저장된 내 설정이 없으면 이 값으로 바로 로그인·실시간 공유를 쓴다.
     apiKey는 Firebase 웹 앱에서 공개되는 값이고, 실제 접근은 Firestore 규칙이 막는다. */
  var DEFAULT_FIREBASE = {
    apiKey: 'AIzaSyB2l8IQ6IFb_Dz-pLlfOXeNW6NDY_vJMjM',
    authDomain: 'triplog-c4921.firebaseapp.com',
    projectId: 'triplog-c4921',
    storageBucket: 'triplog-c4921.firebasestorage.app',
    messagingSenderId: '83063596223',
    appId: '1:83063596223:web:049fd16faf118ad55b120a',
    measurementId: 'G-68X0HJ92GN'
  };

  var listeners = [];
  var app = null;          // firebase app
  var fs = null;           // firestore module
  var db = null;
  var loadedKey = '';      // 지금 db가 붙어 있는 설정(projectId|apiKey)
  var conn = null;         // {code, unsubs:[], tripId}
  var lastError = '';

  /* ------------------------------------------------------------- state */
  function blank() {
    return {
      version: 1,
      trips: [],
      currentTripId: null,
      nickname: '',
      firebase: null,
      defaultRates: Object.assign({}, Core.DEFAULT_RATES),
      ratesCache: { fetchedAt: 0, rates: {} },
      meByTrip: {},
      seenWelcome: false
    };
  }
  var state = load();

  /** 지금 쓸 Firebase 설정: 내 설정(state.firebase)이 있으면 그것, 없으면 기본 내장값 */
  function cfgOf(cfg) { return cfg || state.firebase || DEFAULT_FIREBASE; }
  /** 기본 내장 프로젝트와 같은 설정인가 (같으면 내 설정으로 저장하지 않는다) */
  function sameAsDefault(cfg) {
    return !!cfg && cfg.projectId === DEFAULT_FIREBASE.projectId && cfg.apiKey === DEFAULT_FIREBASE.apiKey;
  }
  /** 같은 프로젝트인지 비교할 열쇠 */
  function fbKey(cfg) {
    var c = cfgOf(cfg);
    return String(c.projectId || '') + '|' + String(c.apiKey || '');
  }
  /** Firebase 앱 이름 — 프로젝트마다 달라야 설정을 바꿨을 때 새 프로젝트로 붙는다 */
  function appNameOf(cfg) { return 'triplog-' + String(cfgOf(cfg).projectId || 'default'); }
  Store.DEFAULT_FIREBASE = DEFAULT_FIREBASE;
  Store.isDefaultConfig = sameAsDefault;
  Store.fbAppName = function () { return appNameOf(null); };
  /** Firebase 런타임(app·Firestore 인스턴스)을 놓아 준다 — 설정을 바꾸면 다음 연결 때 새로 붙는다 */
  function resetFb() {
    try { closeConn(); } catch (e) {}
    app = null; fs = null; db = null; loadedKey = ''; lastError = '';
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      var s = Object.assign(blank(), parsed || {});
      if (!Array.isArray(s.trips)) s.trips = [];
      // 예전에 같은 프로젝트를 직접 저장해 둔 경우에는 내 설정이 아닌 기본값으로 본다
      if (sameAsDefault(s.firebase)) s.firebase = null;
      if (!s.meByTrip || typeof s.meByTrip !== 'object' || Array.isArray(s.meByTrip)) s.meByTrip = {};
      if (!s.ratesCache || typeof s.ratesCache !== 'object') s.ratesCache = { fetchedAt: 0, rates: {} };
      if (!s.ratesCache.rates || typeof s.ratesCache.rates !== 'object') s.ratesCache.rates = {};
      s.trips.forEach(function (t) {
        if (!t.data) t.data = {};
        COLLS.forEach(function (c) { if (!Array.isArray(t.data[c])) t.data[c] = []; });
        if (!t.rates) t.rates = {};
      });
      return s;
    } catch (e) {
      return blank();
    }
  }
  function save() {
    try {
      var copy = Object.assign({}, state);
      // 원격 여행의 캐시도 함께 남겨 오프라인에서 CSV/백업이 가능하게 한다
      root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(copy));
    } catch (e) { /* 저장 공간 부족 등 */ }
  }
  Store.state = function () { return state; };
  Store.save = save;
  Store.hasData = function () { return state.trips.length > 0; };

  function notify() {
    save();
    listeners.slice().forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
  }
  Store.onChange = function (cb) {
    listeners.push(cb);
    return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
  };
  Store.notify = notify;

  /* -------------------------------------------------------------- trips */
  Store.trips = function () {
    return state.trips.slice().sort(function (a, b) {
      var ad = a.startDate || '9999', bd = b.startDate || '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  };
  Store.trip = function (id) {
    for (var i = 0; i < state.trips.length; i++) if (state.trips[i].id === id) return state.trips[i];
    return null;
  };
  Store.currentTrip = function () {
    return state.currentTripId ? Store.trip(state.currentTripId) : null;
  };
  Store.setCurrent = function (id) {
    state.currentTripId = id;
    save();
  };
  Store.isRemote = function (trip) { return !!(trip && trip.remoteCode); };

  Store.createTrip = function (input) {
    var meName = '';
    try { if (TL.Auth && TL.Auth.signedIn()) meName = TL.Auth.displayName(); } catch (e) {}
    var trip = {
      id: Core.uid('trip'),
      name: (input.name || '새 여행').trim(),
      destination: (input.destination || '').trim(),
      startDate: input.startDate || Core.todayISO(),
      endDate: input.endDate || input.startDate || Core.todayISO(),
      baseCurrency: input.baseCurrency || 'KRW',
      members: (input.members || []).map(function (m) {
        return typeof m === 'string' ? { id: Core.uid('m'), name: m } : m;
      }),
      rates: Object.assign({}, state.defaultRates || {}, input.rates || {}),
      createdAt: new Date().toISOString(),
      data: { schedules: [], expenses: [], checklist: [], reservations: [] }
    };
    if (!trip.members.length) trip.members = [{ id: Core.uid('m'), name: state.nickname || meName || '나' }];
    try { if (TL.Auth && TL.Auth.uid()) trip.ownerUid = TL.Auth.uid(); } catch (e) {}
    state.trips.push(trip);
    state.currentTripId = trip.id;
    notify();
    maybeAutoShare(trip);
    return trip;
  };

  /** 로그인 상태에서 만든 여행은 계정에 남겨 다른 기기에서도 열 수 있게 실시간 방을 만든다 (실패하면 로컬로 남는다) */
  function maybeAutoShare(trip) {
    if (!trip || !Store.firebaseConfig()) return;
    var signed = false;
    try { signed = !!(TL.Auth && TL.Auth.signedIn()); } catch (e) {}
    if (!signed) return;
    setTimeout(function () {
      var t = Store.trip(trip.id);
      if (!t || t.remoteCode) return;
      Store.connect(t.id, { create: true }).then(function () {
        if (TL.Account) TL.Account.onTrip(Store.trip(t.id));
      }).catch(function () { /* 오프라인·규칙 오류 → 로컬 유지 */ });
    }, 0);
  }

  Store.updateTrip = function (id, patch) {
    var trip = Store.trip(id);
    if (!trip) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === 'id') return;
      if (k === 'members' || k === 'rates') trip[k] = patch[k];
      else trip[k] = patch[k];
    });
    trip.updatedAt = new Date().toISOString();
    var metaKeys = Object.keys(patch);
    if (metaKeys.length) pushMeta(trip, metaKeys);
    if (metaKeys.length && TL.Account) TL.Account.touch(trip);
    notify();
    return trip;
  };

  Store.removeTrip = function (id) {
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.currentTripId === id) state.currentTripId = null;
    if (conn && conn.tripId === id) closeConn();
    notify();
  };

  var META_FIELDS = ['name', 'destination', 'startDate', 'endDate', 'baseCurrency', 'members', 'rates'];
  /** 메타 문서에 실어 보낼 값. keys를 주면 그 항목만 담는다(merge 쓰기라 나머지 필드는 그대로 남는다). */
  function metaPayload(trip, keys) {
    var use = Array.isArray(keys) && keys.length ? keys : META_FIELDS;
    var out = {};
    use.forEach(function (k) {
      if (META_FIELDS.indexOf(k) < 0) return;
      if (k === 'members') out.members = trip.members || [];
      else if (k === 'rates') out.rates = trip.rates || {};
      else if (k === 'baseCurrency') out.baseCurrency = trip.baseCurrency || 'KRW';
      else out[k] = trip[k] || '';
    });
    out.updatedAt = new Date().toISOString();
    return out;
  }
  /** 여행 정보·일행 목록이 사는 문서의 경로. remoteWrite는 첫 요소를 초대코드로 읽는다. */
  function metaDoc(trip) {
    return [trip.remoteCode];
  }
  /** 연결이 살아 있을 때만 메타 문서에 쓴다. 첫 스냅샷을 받기 전에는 상대 여행 정보를 덮어쓰지 않는다. */
  function pushMeta(trip, keys) {
    if (!trip || !trip.remoteCode || !conn || conn.code !== trip.remoteCode || !conn.metaReady) return;
    remoteWrite(trip, metaDoc(trip), metaPayload(trip, keys));
  }

  /* ------------------------------------------------------------ runtime */
  Store.settings = function () {
    var s = state;
    return {
      nickname: s.nickname || '',
      firebase: cfgOf(null),
      firebaseCustom: !!s.firebase,
      defaultRates: Object.assign({}, Core.DEFAULT_RATES, s.defaultRates || {})
    };
  };
  Store.setNickname = function (name) { state.nickname = (name || '').trim(); notify(); };
  /** 내 Firebase 설정 저장. null(또는 쓸 수 없는 값)이면 기본 내장 설정으로 되돌린다. */
  Store.setFirebase = function (cfg) {
    var next = (cfg && typeof cfg === 'object' && cfg.projectId) ? Object.assign({}, cfg) : null;
    var changed = fbKey(state.firebase) !== fbKey(next);
    state.firebase = next;
    if (changed) resetFb();
    notify();
  };
  /** 지금 실제로 쓰는 설정(기본 내장 포함) */
  Store.firebaseConfig = function () { return cfgOf(null); };
  /** 기기에 저장된 내 설정만 (없으면 null) */
  Store.customFirebase = function () { return state.firebase || null; };
  Store.isDefaultFirebase = function () { return !state.firebase; };
  Store.setDefaultRate = function (code, rate) {
    var r = Number(rate);
    if (!isFinite(r) || r <= 0) return;
    state.defaultRates = Object.assign({}, state.defaultRates || {}, {});
    state.defaultRates[code] = r;
    notify();
  };
  Store.tripRate = function (trip, code) {
    if (!trip) return Core.rateOf(state.defaultRates, code);
    var r = trip.rates && Number(trip.rates[code]);
    if (isFinite(r) && r > 0) return r;
    return Core.rateOf(state.defaultRates, code);
  };
  Store.setTripRate = function (tripId, code, rate) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    var r = Number(rate);
    if (!isFinite(r) || r <= 0) return;
    trip.rates = Object.assign({}, trip.rates || {}, {});
    trip.rates[code] = r;
    pushMeta(trip, ['rates']);
    notify();
  };

  Store.memberName = function (trip, id) {
    var ms = (trip && trip.members) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i].name;
    return '';
  };
  /** 이 기기에서 '나'로 지정한 일행 id. 없으면 닉네임 → 첫 일행 순으로 찾는다. */
  Store.meId = function (trip, fallback) {
    if (!trip) return fallback || '';
    var ms = trip.members || [];
    var saved = state.meByTrip && state.meByTrip[trip.id];
    if (saved && ms.some(function (m) { return m.id === saved; })) return saved;
    var nick = state.nickname;
    if (nick) {
      for (var i = 0; i < ms.length; i++) if (ms[i].name === nick) return ms[i].id;
    }
    var acct = '';
    try { if (TL.Auth && TL.Auth.signedIn()) acct = TL.Auth.displayName(); } catch (e) {}
    if (acct && acct !== nick) {
      for (var j = 0; j < ms.length; j++) if (ms[j].name === acct) return ms[j].id;
    }
    return fallback || (ms[0] && ms[0].id) || '';
  };
  /** 정산·결제자 기본값에 쓸 '나'를 일행 중에서 지정한다. */
  Store.setMeMember = function (tripId, memberId) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    if (!state.meByTrip) state.meByTrip = {};
    if (memberId && !(trip.members || []).some(function (m) { return m.id === memberId; })) return;
    if (memberId) state.meByTrip[tripId] = memberId;
    else delete state.meByTrip[tripId];
    notify();
  };
  Store.myMember = function (trip) {
    var id = Store.meId(trip, null);
    for (var i = 0; trip && i < (trip.members || []).length; i++) if (trip.members[i].id === id) return trip.members[i];
    return null;
  };
  Store.memberStats = function (trip, memberId) {
    var paidCount = 0, paidSum = 0, spent = 0;
    ((trip && trip.data && trip.data.expenses) || []).forEach(function (e) {
      if (e.payerId === memberId) { paidCount++; paidSum += Core.expenseKRW(e, trip); }
      if (Array.isArray(e.sharedWith) && e.sharedWith.indexOf(memberId) >= 0) spent++;
    });
    var checks = ((trip && trip.data && trip.data.checklist) || []).filter(function (c) { return c.assigneeId === memberId; }).length;
    return { paidCount: paidCount, paidSum: paidSum, spentCount: spent, checkCount: checks };
  };
  Store.renameMember = function (tripId, memberId, newName) {
    var trip = Store.trip(tripId);
    if (!trip) return { ok: false, error: '여행을 찾을 수 없어요' };
    var name = String(newName == null ? '' : newName).trim();
    if (!name) return { ok: false, error: '이름을 입력해 주세요' };
    if (name.length > 12) return { ok: false, error: '이름은 12자까지 쓸 수 있어요' };
    var target = null;
    (trip.members || []).forEach(function (m) { if (m.id === memberId) target = m; });
    if (!target) return { ok: false, error: '일행을 찾을 수 없어요' };
    if (trip.members.some(function (m) { return m.id !== memberId && m.name === name; })) {
      return { ok: false, error: '이미 같은 이름의 일행이 있어요' };
    }
    var old = target.name;
    target.name = name;
    if (state.nickname === old) state.nickname = name;
    pushMeta(trip, ['members']);
    notify();
    return { ok: true, name: name };
  };
  Store.addMember = function (tripId, name) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    name = (name || '').trim();
    if (!name) return null;
    for (var i = 0; i < trip.members.length; i++) if (trip.members[i].name === name) return trip.members[i];
    var m = { id: Core.uid('m'), name: name };
    trip.members = trip.members.concat([m]);
    pushMeta(trip, ['members']);
    notify();
    return m;
  };
  Store.removeMember = function (tripId, memberId) {
    var trip = Store.trip(tripId);
    if (!trip) return { ok: false, error: '여행을 찾을 수 없어요' };
    if ((trip.members || []).length <= 1) return { ok: false, error: '최소 한 명은 남겨야 해요' };
    var removed = trip.members.filter(function (m) { return m.id === memberId; })[0];
    if (!removed) return { ok: false, error: '일행을 찾을 수 없어요' };
    trip.members = trip.members.filter(function (m) { return m.id !== memberId; });
    var nextPay = trip.members[0] ? trip.members[0].id : '';
    var moved = 0;
    var touched = [];
    (trip.data.expenses || []).forEach(function (e) {
      var dirty = false;
      if (e.payerId === memberId) { e.payerId = nextPay; moved++; dirty = true; }
      if (Array.isArray(e.sharedWith) && e.sharedWith.indexOf(memberId) >= 0) {
        e.sharedWith = e.sharedWith.filter(function (id) { return id !== memberId; });
        dirty = true;
      }
      if (dirty) touched.push(e);
    });
    var touchedChecks = [];
    (trip.data.checklist || []).forEach(function (c) {
      if (c.assigneeId === memberId) { c.assigneeId = ''; touchedChecks.push(c); }
    });
    if (state.meByTrip && state.meByTrip[tripId] === memberId) delete state.meByTrip[tripId];
    if (trip.remoteCode) {
      touched.forEach(function (e) { remoteWrite(trip, [trip.remoteCode, 'expenses', e.id], stripId(e)); });
      touchedChecks.forEach(function (c) { remoteWrite(trip, [trip.remoteCode, 'checklist', c.id], stripId(c)); });
    }
    if (removed.name && state.nickname === removed.name) state.nickname = '';
    pushMeta(trip, ['members']);
    notify();
    return { ok: true, name: removed.name, moved: moved };
  };
  /** 여행 기간이 줄어 사라진 Day의 일정·지출을 마지막 날로 옮긴다 */
  Store.fitDaysToTrip = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip) return 0;
    var max = Core.tripDayCount(trip);
    var moved = 0;
    var lists = [['schedules', 'dayKey'], ['expenses', 'dayKey']];
    lists.forEach(function (pair) {
      var coll = pair[0];
      (trip.data[coll] || []).forEach(function (it) {
        var m = /^d(\d+)$/.exec(String(it.dayKey || ''));
        if (!m) return;
        if (Number(m[1]) > max) {
          it.dayKey = 'd' + max;
          moved++;
          if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
        }
      });
    });
    if (moved) { Store.normalizeOrders(tripId); notify(); }
    return moved;
  };
  /** 같은 날 안의 order를 0..n-1로 정리한다 */
  Store.normalizeOrders = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    var changed = [];
    var days = Core.dayList(trip).map(function (d) { return d.key; });
    days.forEach(function (day) {
      var group = Core.sortedSchedules(trip.data, day);
      group.forEach(function (it, i) {
        if (it.order !== i) { it.order = i; changed.push(it); }
      });
    });
    (trip.data.schedules || []).forEach(function (it) {
      if (days.indexOf(it.dayKey) < 0) it.dayKey = 'd' + Core.tripDayCount(trip);
    });
    var checks = (trip.data.checklist || []).slice().sort(function (a, b) {
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      return oa - ob;
    });
    checks.forEach(function (it, i) { if (it.order !== i) { it.order = i; changed.push(it); } });
    if (trip.remoteCode) {
      changed.forEach(function (it) {
        var coll = it.dayKey != null ? 'schedules' : 'checklist';
        if (it.text != null) coll = 'checklist';
        remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
      });
    }
  };

  /* ------------------------------------------------------------ 항목 CRUD */
  function collOf(trip, coll) {
    if (!trip.data) trip.data = {};
    if (!Array.isArray(trip.data[coll])) trip.data[coll] = [];
    return trip.data[coll];
  }
  Store.add = function (tripId, coll, item) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var list = collOf(trip, coll);
    var it = Object.assign({}, item);
    it.id = it.id || Core.uid(coll.charAt(0));
    it.createdAt = it.createdAt || new Date().toISOString();
    if (!isFinite(it.order)) it.order = list.filter(function (x) { return x.dayKey === it.dayKey; }).length;
    list.push(it);
    if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
    notify();
    return it;
  };
  Store.update = function (tripId, coll, id, patch) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var list = collOf(trip, coll);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var prev = list[i];
      var next = Object.assign({}, prev, patch);
      // 다른 날로 옮기면 그 날의 맨 뒤로 보낸다
      if (coll === 'schedules' && patch.dayKey && patch.dayKey !== prev.dayKey) {
        next.order = list.filter(function (x) { return x !== prev && x.dayKey === patch.dayKey; }).length;
      }
      list[i] = next;
      if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, id], stripId(next));
      notify();
      return next;
    }
    return null;
  };
  Store.remove = function (tripId, coll, id) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    var gone = collOf(trip, coll).filter(function (x) { return x.id === id; })[0];
    trip.data[coll] = collOf(trip, coll).filter(function (x) { return x.id !== id; });
    if (trip.remoteCode) remoteDelete(trip, [trip.remoteCode, coll, id]);
    // 남은 항목의 순서를 다시 0..n-1로 맞춘다
    if (coll === 'schedules' && gone) {
      Core.sortedSchedules(trip.data, gone.dayKey).forEach(function (it, i) {
        if (it.order !== i) {
          it.order = i;
          if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
        }
      });
    }
    if (coll === 'checklist') {
      collOf(trip, coll).sort(function (a, b) {
        return (isFinite(a.order) ? a.order : 0) - (isFinite(b.order) ? b.order : 0);
      }).forEach(function (it, i) { it.order = i; });
    }
    notify();
  };
  function stripId(it) {
    var o = Object.assign({}, it);
    delete o.id;
    return o;
  }
  /** 같은 day 안에서 위/아래로 한 칸 이동 */
  Store.moveSchedule = function (tripId, id, dir) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    var item = null;
    trip.data.schedules.forEach(function (s) { if (s.id === id) item = s; });
    if (!item) return;
    var group = Core.sortedSchedules(trip.data, item.dayKey);
    var idx = group.findIndex(function (s) { return s.id === id; });
    var swap = idx + (dir < 0 ? -1 : 1);
    if (idx < 0 || swap < 0 || swap >= group.length) return;
    group.splice(swap, 0, group.splice(idx, 1)[0]);
    group.forEach(function (it, i) {
      if (it.order !== i) {
        it.order = i;
        if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, 'schedules', it.id], stripId(it));
      }
    });
    notify();
  };

  /** 드래그 앤 드롭: 같은 날 안에서 id를 toIndex 위치로 옮긴다 */
  Store.reorderSchedule = function (tripId, dayKey, id, toIndex) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    var group = Core.sortedSchedules(trip.data, dayKey);
    var from = -1;
    group.forEach(function (s, i) { if (s.id === id) from = i; });
    if (from < 0) return;
    var item = group.splice(from, 1)[0];
    var idx = Core.clamp(Math.round(Number(toIndex) || 0), 0, group.length);
    group.splice(idx, 0, item);
    group.forEach(function (it, i) {
      if (it.order !== i) {
        it.order = i;
        if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, 'schedules', it.id], stripId(it));
      }
    });
    notify();
  };
  /** 일정을 다른 날로 복사한다 (새 일정, 원본 유지) */
  Store.copySchedule = function (tripId, id, dayKey) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var src = null;
    (trip.data.schedules || []).forEach(function (s) { if (s.id === id) src = s; });
    if (!src) return null;
    var copy = {};
    Object.keys(src).forEach(function (k) {
      if (k === 'id' || k === 'createdAt' || k === 'order') return;
      copy[k] = src[k];
    });
    if (dayKey) copy.dayKey = dayKey;
    return Store.add(tripId, 'schedules', copy);
  };
  /** 일정을 다른 날로 옮긴다 (그 날의 맨 뒤로) */
  Store.moveScheduleToDay = function (tripId, id, dayKey) {
    if (!dayKey) return null;
    return Store.update(tripId, 'schedules', id, { dayKey: dayKey });
  };
  Store.addSchedulesBulk = function (tripId, list) {
    var out = [];
    (list || []).forEach(function (it) {
      var added = Store.add(tripId, 'schedules', it);
      if (added) out.push(added);
    });
    return out;
  };
  /** 일정의 시간 겹침 (같은 날 기준) */
  Store.overlapsFor = function (trip, dayKey, durMin) {
    if (!trip) return [];
    return Core.overlapPairs(Core.sortedSchedules(trip.data, dayKey), durMin);
  };

  /* ------------------------------------------------------- 환율 캐시 */
  Store.rateCache = function () {
    var c = (state && state.ratesCache) || {};
    return { fetchedAt: Number(c.fetchedAt) || 0, rates: Object.assign({}, c.rates || {}) };
  };
  Store.setRateCache = function (rates) {
    if (!rates || typeof rates !== 'object') return;
    state.ratesCache = {
      fetchedAt: Date.now(),
      rates: Object.assign({}, (state.ratesCache && state.ratesCache.rates) || {}, rates)
    };
    notify();
  };
  /** 캐시가 신선하면 자동 환율, 아니면 0 */
  Store.cachedAutoRate = function (code, maxAgeMs) {
    var c = Store.rateCache();
    var age = Date.now() - c.fetchedAt;
    var limit = maxAgeMs == null ? 12 * 3600 * 1000 : maxAgeMs;
    var v = Number(c.rates[code]);
    if (c.fetchedAt && age >= 0 && age <= limit && isFinite(v) && v > 0) return v;
    return 0;
  };

  /* ------------------------------------------------------ 연결 상태 */
  var sync = { online: true, fromCache: false };
  Store.setOnline = function (v) {
    if (sync.online === !!v) return;
    sync.online = !!v;
    notify();
  };
  Store.setFromCache = function (v) {
    sync.fromCache = !!v;
  };
  Store.syncState = function () {
    return { online: sync.online, fromCache: sync.fromCache, connected: !!(conn && db), code: conn ? conn.code : '' };
  };

  /* -------------------------------------------------------- Firebase sync */
  function withTimeout(p, ms, msg) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(msg || '응답이 없어요. 네트워크를 확인해 주세요.'));
      }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }
  Store.withTimeout = withTimeout;

  function loadFb(cfgOverride) {
    var cfg = cfgOf(cfgOverride);
    if (!cfg) throw new Error('Firebase 설정이 없습니다. 설정에서 먼저 입력해 주세요.');
    var key = fbKey(cfg);
    if (fs && db && loadedKey === key) return Promise.resolve(fs);
    return withTimeout(Promise.all([
      import(FB_BASE + 'firebase-app.js'),
      import(FB_BASE + 'firebase-firestore.js')
    ]), 15000, 'Firebase 라이브러리를 불러오지 못했어요. 네트워크를 확인해 주세요.').then(function (mods) {
      var appMod = mods[0], fsMod = mods[1];
      var name = appNameOf(cfg);
      try { app = appMod.getApp(name); } catch (e) { app = appMod.initializeApp(cfg, name); }
      // 오프라인 지속성(IndexedDB) — 지원하지 않거나 이미 초기화된 경우에는 일반 모드로
      try {
        if (typeof fsMod.initializeFirestore === 'function' && typeof fsMod.persistentLocalCache === 'function') {
          var cache = fsMod.persistentLocalCache({
            tabManager: typeof fsMod.persistentMultipleTabManager === 'function' ? fsMod.persistentMultipleTabManager() : undefined
          });
          db = fsMod.initializeFirestore(app, { localCache: cache });
        } else {
          db = fsMod.getFirestore(app);
        }
      } catch (e) {
        db = fsMod.getFirestore(app);
      }
      fs = fsMod;
      loadedKey = key;
      return fs;
    });
  }
  Store.loadFb = loadFb;
  /** 다른 모듈(계정 동기화)이 같은 Firestore 인스턴스를 쓸 수 있게 열어 준다 */
  Store.fsdb = function () { return { fs: fs, db: db }; };

  /** Firebase 설정 유효성 확인용: 연결 테스트 (지금 쓰는 인스턴스는 그대로 두고 임시로 붙여 본다) */
  Store.testFirebase = function (cfg) {
    var use = cfgOf(cfg);
    if (!use) return Promise.reject(new Error('Firebase 설정이 없습니다. 설정에서 먼저 입력해 주세요.'));
    var prev = { app: app, fs: fs, db: db, key: loadedKey };
    app = null; fs = null; db = null; loadedKey = '';
    return loadFb(use).then(function (fsMod) {
      var ref = fsMod.doc(db, 'triplog_meta', 'ping');
      return withTimeout(fsMod.getDoc(ref), 10000, 'Firestore 응답이 없어요. 데이터베이스 생성 여부와 네트워크를 확인해 주세요.')
        .then(function () {
          app = prev.app; fs = prev.fs; db = prev.db; loadedKey = prev.key;
          return true;
        });
    }).catch(function (e) {
      app = prev.app; fs = prev.fs; db = prev.db; loadedKey = prev.key;
      throw e;
    });
  };

  /** 코드로 방을 열고 실시간 구독을 시작한다. code가 없으면 새로 만든다. */
  Store.connect = function (tripId, opts) {
    opts = opts || {};
    var trip = Store.trip(tripId);
    if (!trip) return Promise.reject(new Error('여행을 찾을 수 없습니다.'));
    if (!Store.firebaseConfig()) return Promise.reject(new Error('설정에서 Firebase 정보를 먼저 입력해 주세요.'));
    return loadFb().then(function (fsMod) {
      var code = opts.code || trip.remoteCode || Core.inviteCode();
      trip.remoteCode = code;
      trip.inviteCode = code;
      closeConn();
      conn = { code: code, tripId: trip.id, unsubs: [], metaReady: false };

      var metaRef = fsMod.doc(db, 'trips', code);
      var settled = false;
      var linkedOnce = false;

      return new Promise(function (resolve, reject) {
        function done(err) {
          if (settled) return;
          settled = true;
          if (err) reject(err); else resolve({ code: code });
        }

        conn.unsubs.push(fsMod.onSnapshot(metaRef, function (snap) {
          if (!snap.exists()) {
            if (!opts.create) {
              var e = new Error('초대 코드 ' + code + '에 해당하는 여행을 찾을 수 없습니다.');
              tlStateError('notfound');
              closeConn();
              done(e);
            } else {
              done();
            }
            return;
          }
          Store.setFromCache(!!(snap.metadata && snap.metadata.fromCache));
          var m = snap.data() || {};
          trip.name = m.name || trip.name;
          trip.destination = m.destination || trip.destination;
          trip.startDate = m.startDate || trip.startDate;
          trip.endDate = m.endDate || trip.endDate;
          trip.baseCurrency = m.baseCurrency || trip.baseCurrency;
          trip.members = Array.isArray(m.members) ? m.members : trip.members;
          trip.rates = m.rates || trip.rates;
          trip.remote = true;
          if (conn) conn.metaReady = true;
          if (!linkedOnce) {
            linkedOnce = true;
            if (TL.Account) TL.Account.onTrip(trip);   // 로그인 상태면 계정 여행 목록에도 남긴다
          }
          notify();
          done();
        }, function (e) {
          reportError(e);
          done(new Error(e && (e.code || e.message) ? (e.code || e.message) : '연결할 수 없습니다'));
        }));

        if (opts.create) {
          var payload = metaPayload(trip);
          payload.createdAt = new Date().toISOString();
          payload.version = 1;
          fsMod.setDoc(metaRef, payload).catch(reportError);
          // 방을 만든 쪽은 방금 전체 문서를 썼으므로 바로 메타 쓰기를 허용한다
          if (conn) conn.metaReady = true;
          COLLS.forEach(function (coll) {
            (trip.data[coll] || []).forEach(function (item) {
              fsMod.setDoc(fsMod.doc(db, 'trips', code, coll, item.id), stripId(item)).catch(reportError);
            });
          });
        }

        COLLS.forEach(function (coll) {
          var colRef = fsMod.collection(db, 'trips', code, coll);
          conn.unsubs.push(fsMod.onSnapshot(colRef, function (snap) {
            if (snap.metadata && snap.metadata.fromCache) Store.setFromCache(true);
            trip.data[coll] = snap.docs.map(function (d) {
              var v = d.data() || {};
              v.id = d.id;
              return v;
            });
            notify();
          }, function (e) { reportError(e); }));
        });

        trip.remote = true;
        notify();

        // 규칙/네트워크 오류로 응답이 없을 때를 대비한 안전 장치
        setTimeout(function () { done(); }, 12000);
      });
    });
  };

  Store.openRemote = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip || !trip.remoteCode) return Promise.resolve(null);
    if (conn && conn.code === trip.remoteCode && conn.tripId === trip.id) return Promise.resolve(null);
    return Store.connect(trip.id, { code: trip.remoteCode });
  };
  Store.disconnect = function () { closeConn(); };
  Store.status = function () {
    return {
      connected: !!(conn && db),
      code: conn ? conn.code : '',
      error: lastError,
      online: sync.online,
      fromCache: sync.fromCache
    };
  };
  function closeConn() {
    if (conn) {
      conn.unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      conn = null;
    }
  }
  function reportError(e) {
    lastError = (e && (e.message || e.code)) || String(e);
    console.warn('[triplog] firebase', e);
    listeners.slice().forEach(function (cb) { try { cb({ error: lastError }); } catch (x) {} });
  }
  var stateError = '';
  function tlStateError(code) { stateError = code; }
  Store.takeError = function () { var e = stateError; stateError = ''; return e; };

  /** 경로 → Firestore 문서 참조
     ['<초대코드>'], ['<초대코드>', coll, id] 를 기본으로 하고 ['trips', '<초대코드>', ...] 전체 경로도 받아 준다.
     어떤 모양이 들어와도 항상 trip.remoteCode 아래의 문서 하나로 모은다. */
  function remoteRef(trip, path) {
    if (!fs || !db || !trip || !trip.remoteCode) return null;
    var p = (Array.isArray(path) ? path : []).filter(function (s) { return s !== '' && s != null; });
    if (p[0] === 'trips') p.shift();
    if (p[0] === trip.remoteCode) p.shift();
    else if (p.length > 1 && COLLS.indexOf(p[0]) < 0) p.shift(); // 엉뚱한 코드가 섞여 들어온 경우
    if (COLLS.indexOf(p[0]) >= 0 && p.length > 1) {
      return fs.doc(db, 'trips', trip.remoteCode, p[0], String(p[1]));
    }
    return fs.doc(db, 'trips', trip.remoteCode);
  }
  function remoteWrite(trip, path, data) {
    var ref = remoteRef(trip, path);
    if (!ref) return;
    fs.setDoc(ref, data, { merge: true }).catch(reportError);
  }
  function remoteDelete(trip, path) {
    var ref = remoteRef(trip, path);
    if (!ref) return;
    fs.deleteDoc(ref).catch(reportError);
  }

  /* 테스트 전용: 실제 Firebase 없이 원격 쓰기 경로를 검사할 때 가짜 모듈을 끼워 넣는다 */
  Store.testInjectRemote = function (fsMod, dbStub) { fs = fsMod || null; db = dbStub || null; loadedKey = (fs && db) ? fbKey(null) : ''; };
  Store.testInjectConn = function (tripId, code, ready) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    closeConn();
    trip.remoteCode = code;
    trip.inviteCode = code;
    conn = { code: code, tripId: trip.id, unsubs: [], metaReady: ready !== false };   // ready=false → 첫 스냅샷 전 상태
  };

  /* ----------------------------------------------------- join / create */
  /** 초대 코드로 참여: 로컬에 여행 자리를 만들고 구독한다. opts.silent면 화면 전환·닉네임 변경 없이 목록에만 더한다. */
  Store.joinByCode = function (code, nickname, opts) {
    opts = opts || {};
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code)) return Promise.reject(new Error('초대 코드는 영문·숫자 6자리입니다.'));
    if (nickname && !opts.silent) Store.setNickname(nickname);
    var existing = null;
    state.trips.forEach(function (t) { if (t.remoteCode === code) existing = t; });
    var trip = existing || {
      id: 'remote_' + code,
      name: '여행을 불러오는 중…',
      destination: '',
      startDate: Core.todayISO(),
      endDate: Core.todayISO(),
      baseCurrency: 'KRW',
      members: [],
      rates: {},
      remoteCode: code,
      createdAt: new Date().toISOString(),
      data: { schedules: [], expenses: [], checklist: [], reservations: [] }
    };
    if (!existing) state.trips.push(trip);
    var prevCurrent = state.currentTripId;
    if (!opts.silent) state.currentTripId = trip.id;
    notify();
    return Store.connect(trip.id, { code: code }).then(function () {
      // 일행 목록에 내가 있는지는 사용자가 직접 고른다 (Dialogs.whoAmI)
      return trip;
    }).catch(function (e) {
      if (!existing) {
        state.trips = state.trips.filter(function (t) { return t.id !== trip.id; });
        state.currentTripId = prevCurrent;
        notify();
      }
      throw e;
    });
  };

  /* ---------------------------------------------------- backup / restore */
  Store.exportJSON = function () {
    return JSON.stringify({
      app: 'triplog',
      version: 1,
      exportedAt: new Date().toISOString(),
      nickname: state.nickname,
      trips: state.trips.map(function (t) { return Object.assign({}, t); })
    }, null, 2);
  };
  /** 백업 파일의 여행 하나를 앱이 기대하는 모양으로 고친다 (깨진 값은 기본값으로) */
  function sanitizeTrip(raw) {
    var t = raw && typeof raw === 'object' ? raw : {};
    var out = {
      id: typeof t.id === 'string' && t.id ? t.id : Core.uid('trip'),
      name: String(t.name || '가져온 여행').trim().slice(0, 60) || '가져온 여행',
      destination: String(t.destination || '').trim().slice(0, 60),
      startDate: Core.isISODate(t.startDate) ? t.startDate : Core.todayISO(),
      endDate: Core.isISODate(t.endDate) ? t.endDate : '',
      baseCurrency: /^[A-Z]{3}$/.test(String(t.baseCurrency || '')) ? t.baseCurrency : 'KRW',
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      rates: {},
      data: { schedules: [], expenses: [], checklist: [], reservations: [] }
    };
    if (!out.endDate) out.endDate = out.startDate;
    var r = Core.rangeOrder(out.startDate, out.endDate);
    out.startDate = r.start;
    out.endDate = Core.diffDays(r.start, r.end) > 59 ? Core.addDays(r.start, 59) : r.end;

    var memIds = {};
    var names = {};
    out.members = (Array.isArray(t.members) ? t.members : []).map(function (m) {
      if (typeof m === 'string') m = { name: m };
      if (!m || typeof m !== 'object') return null;
      var name = String(m.name == null ? '' : m.name).trim().slice(0, 12);
      if (!name) return null;
      var id = typeof m.id === 'string' && m.id && !memIds[m.id] ? m.id : Core.uid('m');
      memIds[id] = 1;
      var base = name, n = 2;
      while (names[name]) { name = (base.slice(0, 9) + ' ' + n).slice(0, 12); n++; }
      names[name] = 1;
      return { id: id, name: name };
    }).filter(Boolean);
    if (!out.members.length) out.members = [{ id: Core.uid('m'), name: '나' }];
    memIds = {};
    out.members.forEach(function (m) { memIds[m.id] = 1; });

    if (t.rates && typeof t.rates === 'object') {
      Object.keys(t.rates).forEach(function (k) {
        if (!/^[A-Z]{3}$/.test(k)) return;
        var v = Number(t.rates[k]);
        if (isFinite(v) && v > 0) out.rates[k] = v;
      });
    }
    var dayKeys = {};
    Core.dayList(out).forEach(function (d) { dayKeys[d.key] = 1; });
    var fallDay = dayKeys.d1 ? 'd1' : 'prep';
    var src = t.data && typeof t.data === 'object' ? t.data : {};

    var sched = Array.isArray(src.schedules) ? src.schedules : [];
    out.data.schedules = sched.map(function (s, i) {
      if (!s || typeof s !== 'object') return null;
      var title = String(s.title == null ? '' : s.title).trim().slice(0, 60);
      if (!title) return null;
      var dayKey = dayKeys[s.dayKey] ? s.dayKey : fallDay;
      return {
        id: typeof s.id === 'string' && s.id ? s.id : Core.uid('s'),
        dayKey: dayKey,
        order: isFinite(s.order) ? Number(s.order) : i,
        time: Core.normTime(s.time),
        title: title,
        category: Core.schedCat(s.category).key,
        place: String(s.place || '').slice(0, 60),
        placeName: String(s.placeName || '').slice(0, 60),
        address: String(s.address || '').slice(0, 120),
        placeUrl: String(s.placeUrl || '').slice(0, 300),
        lat: isFinite(Number(s.lat)) && Number(s.lat) !== 0 ? Number(s.lat) : null,
        lng: isFinite(Number(s.lng)) && Number(s.lng) !== 0 ? Number(s.lng) : null,
        source: s.source === 'kakao' || s.source === 'osm' ? s.source : '',
        duration: isFinite(Number(s.duration)) && Number(s.duration) > 0 ? Number(s.duration) : 0,
        memo: String(s.memo || '').slice(0, 300),
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString()
      };
    }).filter(Boolean);

    var exps = Array.isArray(src.expenses) ? src.expenses : [];
    out.data.expenses = exps.map(function (e, i) {
      if (!e || typeof e !== 'object') return null;
      var amount = Core.num(e.amount, 0);
      if (!(amount > 0)) return null;
      var cur = /^[A-Z]{3}$/.test(String(e.currency || '')) ? e.currency : 'KRW';
      var rate = Number(e.rate);
      if (!(rate > 0)) rate = cur === 'KRW' ? 1 : Core.rateOf(out.rates, cur);
      var shared = (Array.isArray(e.sharedWith) ? e.sharedWith : []).filter(function (id) { return memIds[id]; });
      return {
        id: typeof e.id === 'string' && e.id ? e.id : Core.uid('e'),
        dayKey: dayKeys[e.dayKey] ? e.dayKey : fallDay,
        amount: amount,
        currency: cur,
        rate: rate,
        category: Core.expCat(e.category).key,
        title: String(e.title || '').trim().slice(0, 50) || Core.expCat(e.category).label,
        payerId: memIds[e.payerId] ? e.payerId : '',
        sharedWith: shared,
        private: !!e.private,
        chargedKRW: isFinite(Number(e.chargedKRW)) && Number(e.chargedKRW) > 0 ? Math.round(Number(e.chargedKRW)) : 0,
        memo: String(e.memo || '').slice(0, 100),
        createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString()
      };
    }).filter(Boolean);

    var resv = Array.isArray(src.reservations) ? src.reservations : [];
    out.data.reservations = resv.map(function (r, i) {
      if (!r || typeof r !== 'object') return null;
      var text = String(r.text == null ? '' : r.text).slice(0, 4000);
      if (!text.trim()) return null;
      return {
        id: typeof r.id === 'string' && r.id ? r.id : Core.uid('r'),
        title: String(r.title || '').trim().slice(0, 60) || '예약 메모',
        text: text,
        count: isFinite(Number(r.count)) ? Number(r.count) : 0,
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
      };
    }).filter(Boolean);

    var checks = Array.isArray(src.checklist) ? src.checklist : [];
    out.data.checklist = checks.map(function (c, i) {
      if (!c || typeof c !== 'object') return null;
      var text = String(c.text == null ? '' : c.text).trim().slice(0, 60);
      if (!text) return null;
      return {
        id: typeof c.id === 'string' && c.id ? c.id : Core.uid('c'),
        order: isFinite(c.order) ? Number(c.order) : i,
        text: text,
        done: !!c.done,
        assigneeId: memIds[c.assigneeId] ? c.assigneeId : '',
        createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString()
      };
    }).filter(Boolean);

    if (t.sample) out.sample = true;
    if (typeof t.remoteCode === 'string' && /^[A-Z0-9]{4,10}$/.test(t.remoteCode)) out.remoteCode = t.remoteCode;
    return out;
  }
  Store.sanitizeTrip = sanitizeTrip;

  Store.importJSON = function (text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error('JSON 파일을 읽을 수 없어요.'); }
    var trips = (parsed && parsed.trips) || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(trips)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
    var added = [];
    trips.forEach(function (raw) {
      var t = sanitizeTrip(raw);
      while (state.trips.some(function (x) { return x.id === t.id; })) t.id = Core.uid('trip');
      state.trips.push(t);
      added.push(t);
    });
    if (added.length) {
      state.currentTripId = added[0].id;
      Store.fitDaysToTrip(added[0].id);
    }
    notify();
    return added.length;
  };
  Store.clearAll = function () {
    var key = fbKey(state.firebase);
    state = blank();
    if (key !== fbKey(null)) resetFb(); else closeConn();
    notify();
  };
  Store.loadSample = function () {
    var t = TL.sampleTrip();
    t.id = 'trip_sample_' + Date.now().toString(36);
    state.trips.push(t);
    state.currentTripId = t.id;
    notify();
    return t;
  };
  Store.firstRun = function () {
    return !state.seenWelcome && state.trips.length === 0;
  };
  Store.markWelcome = function () { state.seenWelcome = true; save(); };

  /* --------------------------------------------------------- bootstrap */
  /** URL의 ?trip=CODE, ?cfg=... 를 읽어 초기 참여를 준비한다. */
  Store.bootRemoteFromURL = function (search) {
    var q = new URLSearchParams(search || '');
    var cfgRaw = q.get('cfg');
    if (cfgRaw) {
      try {
        var json = JSON.parse(Core.b64urlDecode(cfgRaw));
        if (json && json.projectId) {
          // 링크에 담긴 설정이 기본 프로젝트와 같으면 내 설정으로 저장하지 않는다
          state.firebase = Store.isDefaultConfig(json) ? null : json;
        }
      } catch (e) { /* 무시 */ }
    }
    var code = (q.get('trip') || '').trim().toUpperCase();
    return code || '';
  };
})(typeof window !== 'undefined' ? window : globalThis);
