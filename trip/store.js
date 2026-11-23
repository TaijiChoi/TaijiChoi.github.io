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
  var COLLS = ['schedules', 'expenses', 'checklist'];

  var listeners = [];
  var app = null;          // firebase app
  var fs = null;           // firestore module
  var db = null;
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
      seenWelcome: false
    };
  }
  var state = load();

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      var s = Object.assign(blank(), parsed || {});
      if (!Array.isArray(s.trips)) s.trips = [];
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
      data: { schedules: [], expenses: [], checklist: [] }
    };
    if (!trip.members.length) trip.members = [{ id: Core.uid('m'), name: state.nickname || '나' }];
    state.trips.push(trip);
    state.currentTripId = trip.id;
    notify();
    return trip;
  };

  Store.updateTrip = function (id, patch) {
    var trip = Store.trip(id);
    if (!trip) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === 'id') return;
      if (k === 'members' || k === 'rates') trip[k] = patch[k];
      else trip[k] = patch[k];
    });
    trip.updatedAt = new Date().toISOString();
    if (trip.remoteCode && conn && conn.code === trip.remoteCode) {
      remoteWrite(trip, metaDoc(trip), metaPayload(trip));
    }
    notify();
    return trip;
  };

  Store.removeTrip = function (id) {
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.currentTripId === id) state.currentTripId = null;
    if (conn && conn.tripId === id) closeConn();
    notify();
  };

  function metaPayload(trip) {
    return {
      name: trip.name || '',
      destination: trip.destination || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      baseCurrency: trip.baseCurrency || 'KRW',
      members: trip.members || [],
      rates: trip.rates || {},
      updatedAt: new Date().toISOString()
    };
  }
  function metaDoc(trip) {
    return ['trips', trip.remoteCode];
  }

  /* ------------------------------------------------------------ runtime */
  Store.settings = function () {
    var s = state;
    return {
      nickname: s.nickname || '',
      firebase: s.firebase || null,
      defaultRates: Object.assign({}, Core.DEFAULT_RATES, s.defaultRates || {})
    };
  };
  Store.setNickname = function (name) { state.nickname = (name || '').trim(); notify(); };
  Store.setFirebase = function (cfg) { state.firebase = cfg || null; notify(); };
  Store.firebaseConfig = function () { return state.firebase || null; };
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
    if (trip.remoteCode && conn && conn.code === trip.remoteCode) {
      remoteWrite(trip, metaDoc(trip), metaPayload(trip));
    }
    notify();
  };

  Store.memberName = function (trip, id) {
    var ms = (trip && trip.members) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i].name;
    return '';
  };
  Store.meId = function (trip, fallback) {
    if (!trip) return fallback || '';
    var nick = state.nickname;
    if (nick) {
      for (var i = 0; i < trip.members.length; i++) if (trip.members[i].name === nick) return trip.members[i].id;
    }
    return fallback || (trip.members[0] && trip.members[0].id) || '';
  };
  Store.addMember = function (tripId, name) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    name = (name || '').trim();
    if (!name) return null;
    for (var i = 0; i < trip.members.length; i++) if (trip.members[i].name === name) return trip.members[i];
    var m = { id: Core.uid('m'), name: name };
    trip.members = trip.members.concat([m]);
    if (trip.remoteCode && conn && conn.code === trip.remoteCode) remoteWrite(trip, metaDoc(trip), metaPayload(trip));
    notify();
    return m;
  };
  Store.removeMember = function (tripId, memberId) {
    var trip = Store.trip(tripId);
    if (!trip) return;
    trip.members = trip.members.filter(function (m) { return m.id !== memberId; });
    trip.data.expenses.forEach(function (e) {
      if (e.payerId === memberId) e.payerId = trip.members[0] ? trip.members[0].id : '';
      if (e.sharedWith) e.sharedWith = e.sharedWith.filter(function (id) { return id !== memberId; });
    });
    if (trip.remoteCode && conn && conn.code === trip.remoteCode) remoteWrite(trip, metaDoc(trip), metaPayload(trip));
    notify();
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
      var next = Object.assign({}, list[i], patch);
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
    trip.data[coll] = collOf(trip, coll).filter(function (x) { return x.id !== id; });
    if (trip.remoteCode) remoteDelete(trip, [trip.remoteCode, coll, id]);
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
    var a = group[idx], b = group[swap];
    var ao = isFinite(a.order) ? a.order : idx;
    var bo = isFinite(b.order) ? b.order : swap;
    if (ao === bo) { ao = idx; bo = swap; }
    var tmp = ao; ao = bo; bo = tmp;
    a.order = ao; b.order = bo;
    if (trip.remoteCode) {
      remoteWrite(trip, [trip.remoteCode, 'schedules', a.id], stripId(a));
      remoteWrite(trip, [trip.remoteCode, 'schedules', b.id], stripId(b));
    }
    notify();
  };

  /* -------------------------------------------------------- Firebase sync */
  function loadFb() {
    if (fs) return Promise.resolve(fs);
    return Promise.all([
      import(FB_BASE + 'firebase-app.js'),
      import(FB_BASE + 'firebase-firestore.js')
    ]).then(function (mods) {
      var appMod = mods[0], fsMod = mods[1];
      var cfg = state.firebase;
      if (!cfg) throw new Error('Firebase 설정이 없습니다. 설정에서 먼저 입력해 주세요.');
      try { app = appMod.getApp('triplog'); } catch (e) { app = appMod.initializeApp(cfg, 'triplog'); }
      db = fsMod.getFirestore(app);
      fs = fsMod;
      return fs;
    });
  }
  Store.loadFb = loadFb;

  /** Firebase 설정 유효성 확인용: 연결 테스트 */
  Store.testFirebase = function (cfg) {
    var prev = state.firebase;
    state.firebase = cfg;
    app = null; fs = null; db = null;
    return loadFb().then(function (fsMod) {
      var ref = fsMod.doc(db, 'triplog_meta', 'ping');
      return fsMod.getDoc(ref).then(function () { return true; });
    }).catch(function (e) {
      state.firebase = prev;
      app = null; fs = null; db = null;
      throw e;
    });
  };

  /** 코드로 방을 열고 실시간 구독을 시작한다. code가 없으면 새로 만든다. */
  Store.connect = function (tripId, opts) {
    opts = opts || {};
    var trip = Store.trip(tripId);
    if (!trip) return Promise.reject(new Error('여행을 찾을 수 없습니다.'));
    if (!state.firebase) return Promise.reject(new Error('설정에서 Firebase 정보를 먼저 입력해 주세요.'));
    return loadFb().then(function (fsMod) {
      var code = opts.code || trip.remoteCode || Core.inviteCode();
      trip.remoteCode = code;
      trip.inviteCode = code;
      closeConn();
      conn = { code: code, tripId: trip.id, unsubs: [] };

      var metaRef = fsMod.doc(db, 'trips', code);
      var settled = false;

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
          var m = snap.data() || {};
          trip.name = m.name || trip.name;
          trip.destination = m.destination || trip.destination;
          trip.startDate = m.startDate || trip.startDate;
          trip.endDate = m.endDate || trip.endDate;
          trip.baseCurrency = m.baseCurrency || trip.baseCurrency;
          trip.members = Array.isArray(m.members) ? m.members : trip.members;
          trip.rates = m.rates || trip.rates;
          trip.remote = true;
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
          COLLS.forEach(function (coll) {
            (trip.data[coll] || []).forEach(function (item) {
              fsMod.setDoc(fsMod.doc(db, 'trips', code, coll, item.id), stripId(item)).catch(reportError);
            });
          });
        }

        COLLS.forEach(function (coll) {
          var colRef = fsMod.collection(db, 'trips', code, coll);
          conn.unsubs.push(fsMod.onSnapshot(colRef, function (snap) {
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
      error: lastError
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

  function remoteWrite(trip, path, data) {
    if (!fs || !db || !trip.remoteCode) return;
    var code = Array.isArray(path) ? path[0] : trip.remoteCode;
    var p = Array.isArray(path) ? path.slice() : ['trips', trip.remoteCode];
    var ref;
    if (p[1] === 'schedules' || p[1] === 'expenses' || p[1] === 'checklist') {
      ref = fs.doc(db, 'trips', code, p[1], p[2]);
    } else {
      ref = fs.doc(db, 'trips', code);
    }
    fs.setDoc(ref, data, { merge: true }).catch(reportError);
  }
  function remoteDelete(trip, path) {
    if (!fs || !db || !trip.remoteCode) return;
    var code = Array.isArray(path) ? path[0] : trip.remoteCode;
    var p = Array.isArray(path) ? path.slice() : ['trips', trip.remoteCode];
    var ref;
    if (p[1] === 'schedules' || p[1] === 'expenses' || p[1] === 'checklist') {
      ref = fs.doc(db, 'trips', code, p[1], p[2]);
    } else {
      ref = fs.doc(db, 'trips', code);
    }
    fs.deleteDoc(ref).catch(reportError);
  }

  /* ----------------------------------------------------- join / create */
  /** 초대 코드로 참여: 로컬에 여행 자리를 만들고 구독한다. */
  Store.joinByCode = function (code, nickname) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code)) return Promise.reject(new Error('초대 코드는 영문·숫자 6자리입니다.'));
    if (nickname) Store.setNickname(nickname);
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
      data: { schedules: [], expenses: [], checklist: [] }
    };
    if (!existing) state.trips.push(trip);
    var prevCurrent = state.currentTripId;
    state.currentTripId = trip.id;
    notify();
    return Store.connect(trip.id, { code: code }).then(function () {
      // 내 닉네임을 일행에 자동 등록
      if (state.nickname) Store.addMember(trip.id, state.nickname);
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
  Store.importJSON = function (text) {
    var parsed = JSON.parse(text);
    var trips = parsed.trips || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(trips)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
    trips.forEach(function (t) {
      if (!t.id) t.id = Core.uid('trip');
      if (!t.data) t.data = {};
      COLLS.forEach(function (c) { if (!Array.isArray(t.data[c])) t.data[c] = []; });
      // 아이디가 겹치면 새 아이디
      while (state.trips.some(function (x) { return x.id === t.id; })) t.id = Core.uid('trip');
      state.trips.push(t);
    });
    if (trips.length) state.currentTripId = trips[0].id;
    notify();
    return trips.length;
  };
  Store.clearAll = function () {
    state = blank();
    closeConn();
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
        if (json && json.projectId) state.firebase = json;
      } catch (e) { /* 무시 */ }
    }
    var code = (q.get('trip') || '').trim().toUpperCase();
    return code || '';
  };
})(typeof window !== 'undefined' ? window : globalThis);
