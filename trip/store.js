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
  var CONTACTS_KEY = 'triplog.contacts.v1';   // v28: 지난 일행 이름·이메일 (이 기기에만)
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

  /** 서버가 '방이 없다·폭파됐다'를 확인했을 때 보여 줄 말 (앱·안내가 같은 문구를 쓴다) */
  var GONE_MESSAGE = '삭제되었거나 유효하지 않은 초대 링크예요.';
  Store.GONE_MESSAGE = GONE_MESSAGE;

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
      uploadedAll: {}          // v29: 계정별 '기기에만 있던 여행 올리기' 완료 표시 (uid → true)
    };
  }
  var state = load();
  /** 예시 여행(샘플)인가 — v29부터 앱은 예시 여행을 만들지도, 기기에 남기지도 않는다 */
  function isSampleTrip(t) {
    return !!(t && (t.sample === true || String(t.id || '').indexOf('trip_sample') === 0));
  }
  /** 목록에서 예시 여행을 걸러 낸다 (로드·로그인 때 조용히 정리) */
  function purgeSamples(list) {
    return (Array.isArray(list) ? list : []).filter(function (t) { return !isSampleTrip(t); });
  }
  Store.isSampleTrip = isSampleTrip;
  Store.purgeSamples = purgeSamples;

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
      /* v29: '오사카' 예시 여행 시드를 없앴다 — 기기에 남아 있던 예시 여행도 함께 지운다
         (여러 기기에서 자꾸 보이던 샘플을 로그인·로드 때 다시 올리지 않도록 여기서 걸러 낸다) */
      s.trips = purgeSamples(s.trips);
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
  /** 보던 방이 서버에서 폭파됐다 — 화면이 이 기기 목록에서 지우고 홈으로 돌아갈 수 있게 알린다 */
  function roomGone(code, tripId) {
    listeners.slice().forEach(function (cb) {
      try { cb({ gone: String(code || ''), tripId: String(tripId || '') }); } catch (e) { console.error(e); }
    });
  }
  /** v32: 규칙이 이 방의 접근을 막았다(일행이 아니거나 로그인 계정이 다름) — 기기 데이터는 그대로 두고 화면만 돌린다 */
  function roomDenied(code, tripId) {
    listeners.slice().forEach(function (cb) {
      try { cb({ denied: String(code || ''), tripId: String(tripId || '') }); } catch (e) { console.error(e); }
    });
  }

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

  /* ---------------------------------------------- v28: 초대 코드 / 재발급
     방 문서 코드(trip.remoteCode)는 데이터 경로라 바뀌지 않고, 초대 코드(trip.inviteCode)만 새로 발급한다.
     · 새 코드는 별칭 문서(triplog_meta/joins/<코드>)가 방 문서를 가리킨다 (v32)
       — 예전 별칭(triplog_meta/join-<코드>)도 함께 남겨 v31 이하 기기가 읽을 수 있게 한다
     · 방 문서의 inviteCode와 다른 코드(예전 코드)로는 새로 들어올 수 없다 — 이미 들어온 일행의 연결은 그대로
     · 이 기기에 이미 있는 방은 remoteCode로 계속 붙으므로, 초대 코드가 바뀌어도 끊기지 않는다 */
  function normalizeCode(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
  Store.normalizeCode = normalizeCode;
  Store.REVOKED_MESSAGE = '방장이 초대 코드를 새로 발급했어요. 새 초대 링크를 받아 주세요.';
  /** 지금 유효한 초대 코드 (없으면 방 문서 코드) */
  Store.inviteCodeOf = function (trip) {
    return normalizeCode((trip && (trip.inviteCode || trip.remoteCode)) || '');
  };
  /* v32: 초대 코드 별칭 — 저장소 규칙이 문서 경로로 '지금 살아 있는 초대 코드'를 확인할 수 있게
     코드를 그대로 문서 id로 쓰는 하위 컬렉션(triplog_meta/joins/<코드>)에 둔다 */
  function aliasRef(fsMod, code, legacy) {
    var c = normalizeCode(code);
    return legacy ? fsMod.doc(db, 'triplog_meta', 'join-' + c) : fsMod.doc(db, 'triplog_meta', 'joins', c);
  }
  function joinAliasDocId(code) { return 'join-' + normalizeCode(code); }   // v31 이하 기기 호환 별칭
  function claimRef(fsMod, invite, uid) {
    return fsMod.doc(db, 'triplog_meta', 'joins', normalizeCode(invite), 'claims', String(uid));
  }
  /** 초대 코드 → 방 문서 코드. 별칭 문서가 있으면 그 방, 없으면 같은 이름의 방 문서를 본다
      · 읽지 못했을 때(오프라인·권한)는 코드를 방 문서 코드로 보고 넘긴다 —
        연결 뒤 방 문서 스냅샷의 inviteCode로 다시 한 번 확인한다 */
  function resolveInvite(fsMod, code) {
    var c = normalizeCode(code);
    if (!/^[A-Z0-9]{4,10}$/.test(c)) return Promise.resolve({ ok: false, reason: 'badcode' });
    var existsOf = function (snap) {
      return !!(snap && (typeof snap.exists === 'function' ? snap.exists() : (snap.data && snap.data())));
    };
    var dataOf = function (snap) { return (snap && snap.data && snap.data()) || {}; };
    /** 별칭 한 곳을 읽어 본다 — 없으면 null, 읽지 못하면 {error} */
    function readAlias(legacy) {
      return withTimeout(fsMod.getDoc(aliasRef(fsMod, c, legacy)), 8000, 'join-timeout').then(function (snap) {
        var d = existsOf(snap) ? dataOf(snap) : null;
        if (d && d.room && d.deleted !== true) return { ok: true, room: normalizeCode(d.room), invite: c };
        return null;
      }, function (e) { return { error: e }; });
    }
    return readAlias(false).then(function (hit) {
      if (hit && hit.ok) return hit;
      return readAlias(true);
    }).then(function (hit) {
      if (hit && hit.ok) return hit;
      var roomRef = fsMod.doc(db, 'trips', c);
      return withTimeout(fsMod.getDoc(roomRef), 8000, 'room-timeout').then(function (snap2) {
        if (!existsOf(snap2)) return { ok: false, reason: 'notfound' };
        var m = dataOf(snap2);
        if (m.deleted === true) return { ok: false, reason: 'notfound' };
        var inv = normalizeCode(m.inviteCode);
        // 재발급 전의 예전 코드 — 단, 그 방의 방장·일행(내 계정)이면 그대로 열어 준다
        if (inv && inv !== c && !Core.amInRoom(m, currentUser())) return { ok: false, reason: 'revoked' };
        return { ok: true, room: c, invite: c };
      }, function (e) {
        // v32: 규칙이 막았다 — 재발급으로 닫힌 코드이거나 들어올 수 없는 코드다 (네트워크 오류와 구분)
        if (errCodeOf(e) === 'denied') {
          // 폭파된 방이면 '삭제된 링크'로 안내한다 (폭파 기록이 남아 있다)
          return readGrave(fsMod, c).then(function (g) {
            return { ok: false, reason: (g && g.found) ? 'notfound' : 'revoked' };
          });
        }
        return { ok: true, room: c, invite: c, unchecked: true };
      });
    }, function () { return { ok: true, room: c, invite: c, unchecked: true }; });
  }
  /** 방장이 초대 코드를 새로 발급한다 — 이전 코드·링크로는 더 이상 들어올 수 없다 */
  Store.reissueInviteCode = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip) return Promise.reject(Object.assign(new Error('여행을 찾을 수 없습니다'), { code: 'notfound' }));
    if (!Store.canWrite()) {
      denyLogin();
      return Promise.reject(Object.assign(new Error('로그인이 필요해요'), { code: 'need-login' }));
    }
    if (!Core.canManageMembers(trip, currentUser())) {
      return Promise.reject(Object.assign(new Error('방장만 초대 코드를 새로 발급할 수 있어요'), { code: 'notowner' }));
    }
    var room = normalizeCode(trip.remoteCode);
    if (!room) return Promise.reject(Object.assign(new Error('아직 공유 방이 없어요 · 실시간 공유를 먼저 켜 주세요'), { code: 'nolink' }));
    var oldInvite = Store.inviteCodeOf(trip);
    var next = '';
    for (var i = 0; i < 10 && !next; i++) {
      var c = normalizeCode(Core.inviteCode());
      if (c && c !== oldInvite && c !== room) next = c;
    }
    if (!next) next = normalizeCode(Core.inviteCode());
    var acct = currentUser();
    var stamp = new Date().toISOString();
    return Promise.resolve().then(function () { return loadFb(); }).then(function (fsMod) {
      var roomRef = fsMod.doc(db, 'trips', room);
      var payload = { inviteCode: next, inviteCodeAt: stamp, inviteCodeBy: (acct && acct.uid) || '' };
      var write = (typeof fsMod.updateDoc === 'function')
        ? fsMod.updateDoc(roomRef, payload)                       // 방이 살아 있을 때만 (폭발한 방을 되살리지 않는다)
        : fsMod.setDoc(roomRef, payload, { merge: true });
      return write.then(function () {
        var aliasData = { room: room, code: next, at: stamp, by: (acct && acct.uid) || '' };
        return fsMod.setDoc(aliasRef(fsMod, next), aliasData, { merge: true }).then(function () {
          // v31 이하 기기 호환 별칭도 함께 고친다
          return fsMod.setDoc(aliasRef(fsMod, next, true), aliasData, { merge: true }).catch(function () {});
        });
      }).then(function () {
        // 예전 코드의 별칭 문서를 지우면 그 링크는 바로 닫힌다 (방 문서 코드 자체는 데이터 경로라 남긴다)
        if (!oldInvite || oldInvite === room || oldInvite === next) return null;
        return fsMod.deleteDoc(aliasRef(fsMod, oldInvite)).catch(function () {}).then(function () {
          return fsMod.deleteDoc(aliasRef(fsMod, oldInvite, true)).catch(function () {});
        });
      }).then(function () {
        trip.inviteCode = next;
        notify();
        return { code: next, room: room, oldCode: oldInvite };
      });
    });
  };

  /* --------------------------------------------------------- 권한(v20) */
  /** 지금 로그인한 계정 (없으면 null) */
  function currentUser() {
    try { return (TL.Auth && TL.Auth.currentUser && TL.Auth.currentUser()) || null; } catch (e) { return null; }
  }
  Store.currentUser = currentUser;
  Store.signedIn = function () {
    try { return !!(TL.Auth && TL.Auth.signedIn && TL.Auth.signedIn()); } catch (e) { return false; }
  };
  /** 화면이 '로그인이 필요해요'를 띄울 수 있게 마지막 거부 이유를 남긴다 */
  function denyLogin() {
    stateError = 'login';
    return false;
  }
  /** 쓰기 가능한가: 로그인한 사용자만 등록·수정·삭제·참여할 수 있다 */
  Store.canWrite = function () { return Store.signedIn(); };
  /** 이 여행을 고칠 수 있는가: 로그인 + (방장이거나 일행으로 등록) */
  function canTouch(trip) {
    if (!Store.canWrite()) { denyLogin(); return false; }
    if (!trip) return false;
    if (trip.sample) return true;
    if (Core.canViewTrip(trip, currentUser())) return true;
    // 예전 데이터(방장·계정 연결 없음)는 막지 않는다 — 로그인하면서 방장으로 정리된다
    var legacy = !trip.ownerUid && !(trip.members || []).some(function (m) { return m.uid || m.email; });
    if (legacy) return true;
    stateError = 'notmember';
    return false;
  }
  Store.canTouch = function (trip) { return canTouch(trip); };

  /** 로그인 직후: 방장(ownerUid)이 비어 있는 내 여행을 이 계정 것으로 정리한다
      · 이 기기에서 만든 여행(createdHere)·로컬 전용 여행만 (남의 공유 여행을 가져오지 않는다) */
  Store.claimTrips = function (uid) {
    if (!uid) return 0;
    var n = 0;
    state.trips.forEach(function (t) {
      if (!t || t.ownerUid || t.sample) return;
      // 예전 공유 방(방장·계정 연결이 하나도 없는 방)도 이 계정 것으로 정리한다
      var legacyRoom = !!t.remoteCode && !(t.members || []).some(function (m) { return m.uid || m.email; });
      if (t.remoteCode && !t.createdHere && !legacyRoom) return;
      t.ownerUid = String(uid);
      t.createdHere = true;
      n++;
      pushMeta(t, ['name']);
    });
    if (n) notify();
    return n;
  };
  /** 홈에 보일 여행: 방장이거나 일행으로 등록된 여행만 (예시 여행은 체험으로 항상) */
  Store.visibleTrips = function (user) {
    var u = user === undefined ? currentUser() : user;
    return Store.trips().filter(function (t) { return Core.canViewTrip(t, u); });
  };

  Store.createTrip = function (input) {
    if (!Store.canWrite()) { denyLogin(); return null; }
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
    try {
      var owner = currentUser();
      if (owner && owner.uid) {
        trip.ownerUid = owner.uid;
        if (owner.email) trip.ownerEmail = String(owner.email).toLowerCase();
      }
    } catch (e) {}
    // 방장의 일행 한 명에 자기 계정을 연결해 두면 '나' 찾기·정산이 정확해진다
    try {
      var acct = currentUser();
      if (acct) {
        trip.members.forEach(function (m) {
          if (Core.memberMatches(m, acct)) { if (!m.uid) m.uid = acct.uid; if (!m.email && acct.email) m.email = acct.email; }
        });
        if (state.nickname && !trip.members.some(function (m) { return Core.memberMatches(m, acct); })) {
          for (var i = 0; i < trip.members.length; i++) {
            if (trip.members[i].name === state.nickname) { trip.members[i].uid = acct.uid; if (acct.email) trip.members[i].email = acct.email; break; }
          }
        }
      }
    } catch (e) {}
    trip.createdHere = true;
    /* v29: 로그인 상태에서 만든 여행은 곧 DB에 올라간다. 올라가기 전까지 syncPending으로 표시해
       오프라인에서 만든 여행이 계정 목록 동기화에 지워지지 않게 한다 */
    trip.syncPending = !!currentUser();
    state.trips.push(trip);
    state.currentTripId = trip.id;
    notify();
    maybeAutoShare(trip);
    return trip;
  };

  /** 로그인 상태에서 만든 여행은 계정에 남겨 다른 기기에서도 열 수 있게 실시간 방을 만든다 (실패하면 로컬로 남는다) */
  function maybeAutoShare(trip) {
    if (!trip) return;
    var signed = false;
    try { signed = !!(TL.Auth && TL.Auth.signedIn()); } catch (e) {}
    if (!signed) { trip.syncPending = false; return; }
    if (!Store.firebaseConfig()) return;
    setTimeout(function () {
      var t = Store.trip(trip.id);
      if (!t) return;
      if (t.remoteCode && !t.syncPending) return;
      var step = t.remoteCode ? Promise.resolve(t) : Store.connect(t.id, { create: true });
      step.then(function () {
        var now = Store.trip(t.id);
        if (!now) return null;
        if (!now.remoteCode) { now.syncPending = true; save(); return null; }
        return TL.Account ? TL.Account.onTrip(now) : null;
      }).catch(function () { /* 오프라인·규칙 오류 → 로컬 유지, 온라인이 되면 다시 올린다 */
        if (TL.Store.trip(t.id)) { TL.Store.trip(t.id).syncPending = true; save(); }
      });
    }, 0);
  }

  Store.updateTrip = function (id, patch) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(id);
    if (!trip) return null;
    if (!canTouch(trip)) return null;
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

  /** 이 기기 목록에서만 지운다 (계정 문서는 건드리지 않는다 — 이미 서버에서 지워진 여행 정리에 쓴다) */
  Store.removeTripLocal = function (id) {
    var before = state.trips.length;
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.trips.length === before) return false;
    if (state.currentTripId === id) state.currentTripId = null;
    if (state.meByTrip) delete state.meByTrip[id];
    if (conn && conn.tripId === id) closeConn();
    notify();
    return true;
  };
  /** 여행을 목록에서 지운다 (v29: 초대코드가 있으면 계정 목록 users/{uid}/trips/{code}에서도 지운다)
      · 계정 문서까지 지워야 다른 기기가 DB를 조회할 때 이 여행이 다시 살아나지 않는다
      · 방 자체(폭파)는 destroyTrip이 따로 처리한다 */
  Store.removeTrip = function (id) {
    var trip = Store.trip(id);
    var code = normalizeCode(trip && (trip.remoteCode || trip.inviteCode));
    var ok = Store.removeTripLocal(id);
    if (ok && code) {
      try { if (TL.Account && TL.Account.forget) TL.Account.forget(code); } catch (e) {}
    }
    return ok;
  };
  /** 이 기기 목록과 계정 목록에서 여행을 뺀다 (서버 방은 건드리지 않는다) */
  function forgetLocal(code, tripId) {
    var up = String(code || '').toUpperCase();
    state.trips = state.trips.filter(function (t) {
      return t.id !== tripId && !(up && String(t.remoteCode || '').toUpperCase() === up);
    });
    if (state.currentTripId === tripId) state.currentTripId = null;
    try { if (TL.Account && TL.Account.forget) TL.Account.forget(code); } catch (e) {}
    notify();
  }

  var META_FIELDS = ['name', 'destination', 'startDate', 'endDate', 'baseCurrency', 'members', 'rates', 'ratesUpdatedAt', 'ownerUid', 'ownerEmail', 'inviteCode', 'memberUids', 'pendingEmails'];
  /** 메타 문서에 실어 보낼 값. keys를 주면 그 항목만 담는다(merge 쓰기라 나머지 필드는 그대로 남는다). */  function metaPayload(trip, keys) {
    var use = Array.isArray(keys) && keys.length ? keys.slice() : META_FIELDS.slice();
    /* v32: 일행 목록이 바뀌면 접근 명단도 함께 보낸다 — 방장이 이메일만 적어 둔 일행(pendingEmails)이
       규칙에서 바로 열리게 (따로 적지 않으면 이메일이 방 문서에 올라가지 않는다) */
    if (use.indexOf('members') >= 0) {
      if (use.indexOf('memberUids') < 0) use.push('memberUids');
      if (use.indexOf('pendingEmails') < 0) use.push('pendingEmails');
    }
    var out = {};
    use.forEach(function (k) {
      if (META_FIELDS.indexOf(k) < 0) return;
      if (k === 'members') out.members = trip.members || [];
      else if (k === 'rates') out.rates = trip.rates || {};
      else if (k === 'baseCurrency') out.baseCurrency = trip.baseCurrency || 'KRW';
      /* v32: 저장소 규칙이 보는 접근 명단 — 방장 + 계정이 연결된 일행, 이메일만 적힌 일행 */
      else if (k === 'memberUids') out.memberUids = Core.memberUidsOf(trip);
      else if (k === 'pendingEmails') out.pendingEmails = Core.pendingEmailsOf(trip);
      // v24: 방장 계정은 값이 있을 때만 싣는다 — 빈 값으로 다른 기기의 방장 기록을 지우지 않는다
      else if (k === 'ownerUid' || k === 'ownerEmail') { if (trip[k]) out[k] = k === 'ownerEmail' ? String(trip[k]).trim().toLowerCase() : String(trip[k]); }
      // v28: 지금 유효한 초대 코드 (방 문서 코드와 다를 수 있다 — 재발급 때 바뀐다)
      else if (k === 'inviteCode') { if (trip.inviteCode) out.inviteCode = String(trip.inviteCode).trim().toUpperCase(); }
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
    if (!trip || !trip.remoteCode) return;
    if (!conn || conn.code !== trip.remoteCode || !conn.metaReady) {
      trip.metaDirty = true;   // v29: 연결되면 올린다
      save();
      return;
    }
    remoteWrite(trip, metaDoc(trip), metaPayload(trip, keys), { mustExist: true });
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

  /* ------------------------------------------------ v28: 지난 일행 자동완성
     이름·이메일을 본인 기기의 localStorage('triplog.contacts.v1')에만 저장한다.
     · 계정 문서·공용 DB(방 문서)로는 보내지 않는다 — rememberContact는 pushMeta를 부르지 않는다
     · 일행 추가 입력창에서 한 글자만 쳐도 후보가 뜨고, 고르면 이름과 이메일이 함께 채워진다 */
  Store.CONTACTS_KEY = CONTACTS_KEY;
  Store.CONTACTS_MAX = 200;
  function readContacts() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(CONTACTS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (c) { return c && c.name; }) : [];
    } catch (e) { return []; }
  }
  function writeContacts(list) {
    try {
      var sorted = (list || []).slice().sort(function (a, b) {
        var d = String(b.lastAt || '').localeCompare(String(a.lastAt || ''));
        if (d) return d;
        // 같은 시각이면 이름순 — 정렬이 흔들려도 후보 순서가 매번 같게
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      root.localStorage && root.localStorage.setItem(CONTACTS_KEY, JSON.stringify(sorted.slice(0, Store.CONTACTS_MAX)));
    } catch (e) { /* 저장 공간 부족 등 */ }
  }
  function cleanEmail(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
  }
  Store.contacts = function () { return readContacts(); };
  /** 지난 일행 한 명을 기억한다 (이름은 필수, 이메일은 있을 때만). 같은 이름은 최근 이메일로 갱신 */
  Store.rememberContact = function (name, email, opts) {
    var nm = String(name == null ? '' : name).trim().slice(0, 12);
    if (!nm) return null;
    var mail = cleanEmail(email);
    var list = readContacts();
    var hit = null;
    list.forEach(function (c) { if (!hit && String(c.name).trim().toLowerCase() === nm.toLowerCase()) hit = c; });
    if (hit) {
      if (mail && hit.email !== mail) hit.email = mail;
      if (!(opts && opts.quiet)) hit.count = (Number(hit.count) || 1) + 1;
      hit.lastAt = new Date().toISOString();
    } else {
      hit = { name: nm, email: mail, count: 1, lastAt: new Date().toISOString() };
      list.push(hit);
    }
    writeContacts(list);
    return hit;
  };
  /** 함께한 여행들의 일행을 기기에 모아 둔다 (앱을 열 때·일행을 더할 때 조용히 부른다) */
  Store.syncContacts = function () {
    var n = 0;
    (state.trips || []).forEach(function (t) {
      if (!t || t.sample) return;
      (t.members || []).forEach(function (m) {
        if (!m || !String(m.name || '').trim()) return;
        var mail = cleanEmail(m.email);
        var hit = null;
        readContacts().forEach(function (c) { if (!hit && String(c.name).toLowerCase() === String(m.name).trim().toLowerCase() && String(c.email || '') === mail) hit = c; });
        if (hit) return;                      // 이미 기억한 이름·이메일
        Store.rememberContact(m.name, mail, { quiet: true });
        n++;
      });
    });
    return n;
  };
  /** 입력한 글자로 지난 일행 후보 (순수 매칭은 Core.contactMatch) */
  Store.contactSuggest = function (query, limit) {
    return Core.contactMatch(readContacts(), query, limit);
  };
  Store.forgetContacts = function () { writeContacts([]); return 0; };
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
  /** v28: '이 사람이 나'라고 정하면서 계정(uid·이메일)까지 연결한다
      · 기기 설정(meByTrip)만 바꾸고 계정 연결이 빠지면 방 목록·정산에서 다른 사람으로 보인다 */
  Store.claimMe = function (tripId, memberId) {
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var target = null;
    (trip.members || []).forEach(function (m) { if (m.id === memberId) target = m; });
    if (!target) return null;
    if (Core.memberTakenByOther(target, currentUser())) { stateError = 'taken'; return null; }
    Store.setMeMember(tripId, memberId);
    if (Store.canWrite()) {
      var linked = Store.linkMe(tripId, memberId);   // 로그인 상태면 uid·이메일도 함께 저장
      if (linked) target = linked;
    }
    return target;
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
    if (!Store.canWrite()) { denyLogin(); return { ok: false, error: '로그인이 필요해요', needLogin: true }; }
    var trip = Store.trip(tripId);
    if (!trip) return { ok: false, error: '여행을 찾을 수 없어요' };
    var name = String(newName == null ? '' : newName).trim();
    if (!name) return { ok: false, error: '이름을 입력해 주세요' };
    if (name.length > 12) return { ok: false, error: '이름은 12자까지 쓸 수 있어요' };
    var target = null;
    (trip.members || []).forEach(function (m) { if (m.id === memberId) target = m; });
    if (!target) return { ok: false, error: '일행을 찾을 수 없어요' };
    if (!Core.canEditMember(trip, target, currentUser())) {
      return { ok: false, error: '방장만 일행 이름을 바꿀 수 있어요' };
    }
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
  /** 일행 추가: 방장만. email을 주면 그 사람이 로그인했을 때 이 일행으로 연결된다 */
  Store.addMember = function (tripId, name, email) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(tripId);
    if (!trip) return null;
    if (!Core.canManageMembers(trip, currentUser())) { stateError = 'owner'; return null; }
    name = (name || '').trim();
    if (!name) return null;
    var mail = String(email == null ? '' : email).trim().toLowerCase();
    for (var i = 0; i < trip.members.length; i++) {
      if (trip.members[i].name !== name) continue;
      // v28: 같은 이름이면 새로 만들지 않는다 — 받은 이메일을 그 일행에 붙인다
      var same = trip.members[i];
      if (mail && !same.email && !same.uid) {
        same.email = mail;
        pushMeta(trip, ['members']);
        notify();
      }
      return same;
    }
    var m = { id: Core.uid('m'), name: name };
    if (mail) m.email = mail;
    trip.members = trip.members.concat([m]);
    if (Store.rememberContact) Store.rememberContact(name, mail);   // v28: 지난 일행 자동완성 (이 기기에만)
    pushMeta(trip, ['members']);
    notify();
    return m;
  };
  /** 일행 정보 수정(이름·이메일·계정 연결): 방장은 모두, 본인은 자기 것만 */
  Store.updateMember = function (tripId, memberId, patch) {
    if (!Store.canWrite()) { denyLogin(); return { ok: false, error: '로그인이 필요해요', needLogin: true }; }
    var trip = Store.trip(tripId);
    if (!trip) return { ok: false, error: '여행을 찾을 수 없어요' };
    var target = null;
    (trip.members || []).forEach(function (m) { if (m.id === memberId) target = m; });
    if (!target) return { ok: false, error: '일행을 찾을 수 없어요' };
    if (!Core.canEditMember(trip, target, currentUser())) {
      return { ok: false, error: '방장만 일행 정보를 바꿀 수 있어요' };
    }
    var p = patch || {};
    if (p.name != null) {
      var nm = String(p.name).trim();
      if (!nm) return { ok: false, error: '이름을 입력해 주세요' };
      if (nm.length > 12) return { ok: false, error: '이름은 12자까지 쓸 수 있어요' };
      if ((trip.members || []).some(function (m) { return m.id !== memberId && m.name === nm; })) {
        return { ok: false, error: '이미 같은 이름의 일행이 있어요' };
      }
      if (state.nickname === target.name) state.nickname = nm;
      target.name = nm;
    }
    if (p.email != null) {
      var mail = String(p.email).trim().toLowerCase();
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, error: '이메일 주소를 확인해 주세요' };
      if (mail) target.email = mail; else delete target.email;
    }
    if (p.uid != null) { if (p.uid) target.uid = String(p.uid); else delete target.uid; }
    if (p.name != null || p.email != null) {
      try { if (Store.rememberContact) Store.rememberContact(target.name, target.email || ''); } catch (e) {}
    }
    pushMeta(trip, ['members']);
    notify();
    return { ok: true, member: target };
  };
  /** 초대 링크로 들어온 로그인 사용자: 같은 이메일·uid의 일행이 있으면 그 일행으로 연결하고,
      없으면 자기 자신을 일행으로 등록한다(방장의 일행 관리와 섞이지 않게 addMember와 분리). */
  Store.joinAsMember = function (tripId, opts) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var acct = currentUser();
    if (!acct) return null;
    opts = opts || {};
    var ms = trip.members || [];
    var found = null;
    // v28: 화면에서 고른 일행(memberId)이 있으면 그 사람으로 — 이름 충돌로 남의 자리를 빼았지 않는다
    if (opts.memberId) ms.forEach(function (m) { if (!found && m.id === opts.memberId) found = m; });
    if (found) {
      if (Core.memberTakenByOther(found, acct)) { stateError = 'taken'; return null; }
      var dirty0 = false;
      if (!found.uid) { found.uid = acct.uid; dirty0 = true; }
      if (!found.email && acct.email) { found.email = String(acct.email).toLowerCase(); dirty0 = true; }
      if (dirty0) { pushMeta(trip, ['members']); notify(); }
      return found;
    }
    ms.forEach(function (m) { if (!found && Core.memberMatches(m, acct)) found = m; });
    if (found) {
      var dirty = false;
      if (!found.uid) { found.uid = acct.uid; dirty = true; }
      if (!found.email && acct.email) { found.email = String(acct.email).toLowerCase(); dirty = true; }
      if (dirty) { // 방장 몫인 일행 목록에 내 계정만 얹는다 (이름은 건드리지 않는다)
        pushMeta(trip, ['members']);
        notify();
      }
      return found;
    }
    var name = String(opts.name || '').trim() || Core.accountLabel(acct);
    if (name.length > 12) name = name.slice(0, 12);
    if (ms.some(function (m) { return m.name === name; })) {
      var base = name.slice(0, 9), n = 2;
      while (ms.some(function (m) { return m.name === name; })) { name = base + ' ' + n; n++; }
    }
    var m = { id: Core.uid('m'), name: name, uid: acct.uid };
    if (acct.email) m.email = String(acct.email).toLowerCase();
    trip.members = ms.concat([m]);
    pushMeta(trip, ['members']);
    notify();
    return m;
  };
  Store.linkMe = function (tripId, memberId) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(tripId);
    if (!trip) return null;
    var acct = currentUser();
    if (!acct) return null;
    var target = null;
    (trip.members || []).forEach(function (m) { if (m.id === memberId) target = m; });
    if (!target) return null;
    // 이미 다른 사람 계정이 붙은 일행은 빼앗지 않는다 (v28)
    if (Core.memberTakenByOther(target, acct)) { stateError = 'taken'; return null; }
    var dirty = false;
    if (!target.uid) { target.uid = acct.uid; dirty = true; }
    if (!target.email && acct.email) { target.email = String(acct.email).toLowerCase(); dirty = true; }
    if (dirty) { pushMeta(trip, ['members']); notify(); }
    return target;
  };
  Store.removeMember = function (tripId, memberId) {
    if (!Store.canWrite()) { denyLogin(); return { ok: false, error: '로그인이 필요해요', needLogin: true }; }
    var trip = Store.trip(tripId);
    if (!trip) return { ok: false, error: '여행을 찾을 수 없어요' };
    if (!Core.canManageMembers(trip, currentUser())) {
      return { ok: false, error: '방장만 일행을 삭제할 수 있어요' };
    }
    if ((trip.members || []).length <= 1) return { ok: false, error: '최소 한 명은 남겨야 해요' };
    var removed = trip.members.filter(function (m) { return m.id === memberId; })[0];
    if (!removed) return { ok: false, error: '일행을 찾을 수 없어요' };
    trip.members = trip.members.filter(function (m) { return m.id !== memberId });
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
    /* v32: 뺀 일행의 계정은 저장소 접근 명단(memberUids)에서도 지운다 — 남겨 두면 계속 읽고 쓸 수 있다 */
    if (removed.uid) {
      var uidGone = String(removed.uid);
      trip.memberUids = (Array.isArray(trip.memberUids) ? trip.memberUids : []).filter(function (u) { return String(u) !== uidGone; });
      dropClaimsOf(trip, uidGone);
    }
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
          if (trip.remoteCode && !trip.hydrating) remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
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
    if (trip.remoteCode && !trip.hydrating) {
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
  /** v28: 일정 하나를 그 날의 시간순 자리에 넣고 order를 0..n-1로 다시 매긴다
      · 같은 시간이면 먼저 있던 일정 뒤에 · 시간 없는 일정은 뒤로
      · 바뀐 다른 일정은 실시간 공유 중이면 바로 올린다 */
  function placeScheduleByTime(trip, item) {
    if (!trip || !item) return -1;
    var day = Core.sortedSchedules(trip.data, item.dayKey).filter(function (x) { return x.id !== item.id; });
    var idx = Core.insertIndexByTime(day, item);
    day.splice(idx, 0, item);
    day.forEach(function (x, i) {
      if (x.order === i) return;
      x.order = i;
      if (trip.remoteCode && x.id !== item.id) remoteWrite(trip, [trip.remoteCode, 'schedules', x.id], stripId(x));
    });
    return idx;
  }
  Store.placeScheduleByTime = function (tripId, itemId) {
    var trip = Store.trip(tripId);
    if (!trip || !itemId) return -1;
    var it = null;
    (trip.data.schedules || []).forEach(function (s) { if (s.id === itemId) it = s; });
    if (!it) return -1;
    return placeScheduleByTime(trip, it);
  };
  Store.add = function (tripId, coll, item) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(tripId);
    if (!trip) return null;
    if (!canTouch(trip)) return null;
    var list = collOf(trip, coll);
    var it = Object.assign({}, item);
    it.id = it.id || Core.uid(coll.charAt(0));
    it.createdAt = it.createdAt || new Date().toISOString();
    if (it.id) clearTomb(trip, coll, it.id);   // 같은 id로 새로 넣는 것은 되살리기가 아니라 새 항목이다
    var hadOrder = isFinite(item && item.order);   // 순서를 직접 준 경우(복원·시드)는 그대로 둔다
    list.push(it);
    if (coll === 'schedules' && !hadOrder) {
      placeScheduleByTime(trip, it);           // v28: 추가한 순서가 아니라 시간순 자리로
    } else if (!isFinite(it.order)) {
      it.order = list.filter(function (x) { return x.id !== it.id && x.dayKey === it.dayKey; }).length;
    }
    if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, it.id], stripId(it));
    notify();
    return it;
  };
  Store.update = function (tripId, coll, id, patch) {
    if (!Store.canWrite()) { denyLogin(); return null; }
    var trip = Store.trip(tripId);
    if (!trip) return null;
    if (!canTouch(trip)) return null;
    var list = collOf(trip, coll);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var prev = list[i];
      var next = Object.assign({}, prev, patch);
      var movedDay = coll === 'schedules' && !!patch.dayKey && patch.dayKey !== prev.dayKey;
      var timeChanged = coll === 'schedules' && patch.time !== undefined && Core.normTime(patch.time) !== Core.normTime(prev.time);
      // 다른 날로 옮기면 그 날의 맨 뒤로 보낸다 (시간이 있으면 아래에서 시간순 자리로 다시 잡힌다)
      if (movedDay) {
        next.order = list.filter(function (x) { return x !== prev && x.dayKey === patch.dayKey; }).length;
      }
      list[i] = next;
      if (movedDay || timeChanged) placeScheduleByTime(trip, next);   // v28
      if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, coll, id], stripId(next));
      notify();
      return next;
    }
    return null;
  };
  Store.remove = function (tripId, coll, id) {
    if (!Store.canWrite()) { denyLogin(); return; }
    var trip = Store.trip(tripId);
    if (!trip) return;
    if (!canTouch(trip)) return;
    var gone = collOf(trip, coll).filter(function (x) { return x.id === id; })[0];
    trip.data[coll] = collOf(trip, coll).filter(function (x) { return x.id !== id; });
    // 지운 id를 기록해 두면 캐시·예전 스냅샷이 같은 항목을 다시 실어 와도 목록에 돌아오지 않는다
    markDeleted(trip, coll, id);
    if (trip.remoteCode) {
      if (!remoteDelete(trip, [trip.remoteCode, coll, id])) queueDelete(trip, coll, id);  // 연결 전이면 나중에 지운다
      pushDeletes(trip);
    }
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
    if (!Store.canWrite()) { denyLogin(); return; }
    var trip = Store.trip(tripId);
    if (!trip) return;
    if (!canTouch(trip)) return;
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
    if (!Store.canWrite()) { denyLogin(); return; }
    var trip = Store.trip(tripId);
    if (!trip) return;
    if (!canTouch(trip)) return;
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
  /** v24: 그 날 일정을 시간순으로 정렬해 order를 다시 매긴다 (시간 없는 일정은 뒤로)
      · 드래그 수동 순서는 그대로 두고, 사용자가 '시간순 정렬'을 누를 때만 바뀐다
      · 실시간 공유 중이면 바뀐 일정 문서를 바로 올린다
      · 정렬한 일정 수를 돌려준다 (0이면 정렬할 것이 없음) */
  Store.sortDayByTime = function (tripId, dayKey) {
    if (!Store.canWrite()) { denyLogin(); return 0; }
    var trip = Store.trip(tripId);
    if (!trip) return 0;
    if (!canTouch(trip)) return 0;
    var group = Core.sortByTime(Core.sortedSchedules(trip.data, dayKey));
    group.forEach(function (it, i) {
      if (it.order !== i) {
        it.order = i;
        if (trip.remoteCode) remoteWrite(trip, [trip.remoteCode, 'schedules', it.id], stripId(it));
      }
    });
    if (group.length) notify();
    return group.length;
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
  /** v22: 환율은 30분까지만 믿는다 (그 뒤에는 백그라운드로 새로 받는다) */
  Store.RATE_TTL = 30 * 60 * 1000;
  Store.ratesAge = function () {
    var c = Store.rateCache();
    return c.fetchedAt ? Math.max(0, Date.now() - c.fetchedAt) : Infinity;
  };
  /** 캐시가 없거나 ttl(기본 30분)보다 오래됐으면 true */
  Store.ratesStale = function (ttl) {
    var limit = ttl == null ? Store.RATE_TTL : Number(ttl);
    var c = Store.rateCache();
    if (!c.fetchedAt) return true;
    var age = Date.now() - c.fetchedAt;
    return !(age >= 0 && age <= limit);
  };
  /** 캐시가 신선하면 자동 환율, 아니면 0 (기본 30분) */
  Store.cachedAutoRate = function (code, maxAgeMs) {
    var c = Store.rateCache();
    var age = Date.now() - c.fetchedAt;
    var limit = maxAgeMs == null ? Store.RATE_TTL : maxAgeMs;
    var v = Number(c.rates[code]);
    if (c.fetchedAt && age >= 0 && age <= limit && isFinite(v) && v > 0) return v;
    return 0;
  };

  /* ------------------------------------------------------ 환율 새로고침 (v22) */
  var ratesFetching = null;
  var ratesFetcher = null;          // 테스트·QA에서 실제 네트워크 대신 쓸 함수
  /** QA·테스트용: 환율을 대신 돌려줄 함수를 꽂는다. null이면 실제 open.er-api.com */
  Store.testSetRateFetcher = function (fn) { ratesFetcher = typeof fn === 'function' ? fn : null; };

  function defaultRateFetch() {
    if (typeof fetch !== 'function') return Promise.reject(new Error('이 브라우저에서는 환율을 불러올 수 없어요'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
    return fetch('https://open.er-api.com/v6/latest/KRW', { signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (res && res.ok === false) throw new Error('환율 서버 응답 오류 (' + res.status + ')');
        return res.json();
      }, function (e) {
        if (timer) clearTimeout(timer);
        throw e || new Error('환율 서버에 닿지 못했어요');
      })
      .then(function (json) {
        var rates = Core.ratesFromERAPI(json);
        if (!rates || !Object.keys(rates).length) throw new Error('환율을 읽지 못했어요');
        return rates;
      });
  }

  /** 최신 환율을 받아 기기 캐시에 저장한다. 동시에 여러 번 불러도 한 번만 나간다. */
  Store.fetchRates = function () {
    if (ratesFetching) return ratesFetching;
    var p;
    try { p = (ratesFetcher || defaultRateFetch)(); } catch (e) { return Promise.reject(e); }
    ratesFetching = Promise.resolve(p).then(function (rates) {
      ratesFetching = null;
      if (!rates || typeof rates !== 'object' || !Object.keys(rates).length) throw new Error('환율을 읽지 못했어요');
      Store.setRateCache(rates);
      return Store.rateCache().rates;
    }, function (e) {
      ratesFetching = null;
      throw e || new Error('환율을 불러오지 못했어요');
    });
    return ratesFetching;
  };

  /** 이 여행이 외화를 쓰는가 (기본 통화 또는 외화 지출이 있음) */
  Store.usesForeign = function (trip) {
    if (!trip) return false;
    if (trip.baseCurrency && trip.baseCurrency !== 'KRW') return true;
    return ((trip.data && trip.data.expenses) || []).some(function (e) {
      return e.currency && e.currency !== 'KRW';
    });
  };
  /**
   * 이 여행이 실제로 쓰는 통화 코드(기본 통화 + 외화 지출).
   * trip.rates에는 기기 기본 환율이 모두 들어 있어서, 그것까지 '쓰는 통화'로 치면
   * 가계부에 쓰지도 않는 15개 통화가 나열된다 — 실제로 쓴 통화만 고른다.
   */
  Store.tripRateCodes = function (trip) {
    var set = {};
    if (!trip) return [];
    if (trip.baseCurrency && trip.baseCurrency !== 'KRW') set[trip.baseCurrency] = 1;
    ((trip.data && trip.data.expenses) || []).forEach(function (e) {
      if (e.currency && e.currency !== 'KRW') set[e.currency] = 1;
    });
    return Object.keys(set);
  };
  /**
   * 최신 환율을 이 여행의 기본 환율(trip.rates)에 반영한다.
   * 기존 지출의 rate는 건드리지 않는다(입력 당시 환율을 기억).
   */
  Store.applyRates = function (tripId, rates, at) {
    var trip = Store.trip(tripId);
    if (!trip || !rates) return null;
    var codes = Store.tripRateCodes(trip);
    var next = Object.assign({}, trip.rates || {});
    var used = 0;
    codes.forEach(function (code) {
      var v = Number(rates[code]);
      if (!isFinite(v) || v <= 0 || code === 'KRW') return;
      next[code] = v;
      used++;
    });
    if (!used) return { count: 0, codes: [] };
    var stamp = new Date(at == null ? Date.now() : Number(at)).toISOString();
    var saved = Store.updateTrip(tripId, { rates: next, ratesUpdatedAt: stamp });
    return saved ? { count: used, codes: codes, at: stamp } : null;
  };
  /**
   * 실청구액이 없는 외화 지출을 이 여행의 최신 환율로 다시 계산한다 (사용자가 고를 때만).
   * 카드 실청구액(chargedKRW)이 있는 지출은 그 금액이 실제 청구라 건드리지 않는다.
   */
  Store.applyRatesToExpenses = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip || !Store.canWrite()) return null;
    var before = 0, after = 0, count = 0, kept = 0;
    var list = (trip.data && trip.data.expenses) || [];
    list.forEach(function (e) {
      if (!e.currency || e.currency === 'KRW') return;
      if (Number(e.chargedKRW) > 0) { kept++; return; }
      var r = Store.tripRate(trip, e.currency);
      var oldR = Number(e.rate);
      if (!(r > 0)) return;
      var oldK = Core.expenseKRW(e, trip);
      var newK = Core.toKRW(e.amount, e.currency, trip.rates, r);
      if (isFinite(oldR) && oldR > 0 && Math.abs(oldR - r) < 1e-9) { kept++; return; }
      before += oldK;
      after += newK;
      count++;
      e.rate = r;
      Store.update(tripId, 'expenses', e.id, { rate: r });
    });
    return { count: count, kept: kept, before: before, after: after };
  };
  /**
   * 여행을 열거나 가계부에 들어올 때 부르는 조용한 최신화.
   * 온라인 + 외화 사용 + 캐시 만료(30분)일 때만 나가고, 실패는 조용히 넘긴다.
   */
  var autoRatesBusy = {};
  Store.autoRefreshRates = function (trip, opts) {
    if (!trip || !Store.canWrite()) return Promise.resolve(false);
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return Promise.resolve(false);
    if (!Store.usesForeign(trip)) return Promise.resolve(false);
    if (!Store.ratesStale(opts && opts.ttl)) return Promise.resolve(false);
    if (autoRatesBusy[trip.id]) return Promise.resolve(false);
    autoRatesBusy[trip.id] = true;
    return Store.fetchRates().then(function (rates) {
      autoRatesBusy[trip.id] = false;
      var saved = Store.applyRates(trip.id, rates);
      return !!(saved && saved.count);
    }, function () {
      autoRatesBusy[trip.id] = false;
      return false;
    });
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

  /** Firebase 설정 유효성 확인용: 연결 테스트 (지금 쓰는 인스턴스는 그대로 두고 임시로 붙여 본다)
      v32: 로그인하지 않은 상태에서는 규칙이 triplog_meta 읽기를 막는다. 그 거절(permission-denied)은
      서버·프로젝트가 정상이고 규칙이 작동한다는 뜻이므로 연결 성공으로 본다. */
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
          return { ok: true, denied: false };
        }, function (e) {
          app = prev.app; fs = prev.fs; db = prev.db; loadedKey = prev.key;
          if (errCodeOf(e) === 'denied') return { ok: true, denied: true };   // 규칙이 막았을 뿐, 연결은 정상
          throw e;
        });
    }).catch(function (e) {
      app = prev.app; fs = prev.fs; db = prev.db; loadedKey = prev.key;
      throw e;
    });
  };

  /* ------------------------------------------------ v32: 저장소 규칙과 맞춘 접근
     규칙은 방 문서(trips/{code})의 ownerUid·memberUids·pendingEmails와
     초대 코드 표시(triplog_meta/join-<초대코드>/claims/<uid>)만 보고 허용한다.
     · 일행이면 그대로 읽고 쓴다
     · 초대받아 처음 들어온 계정은 자기 uid 하나를 memberUids에 더해 일행이 된다 (규칙이 그 쓰기만 허용)
     · 재발급된 초대 코드로 들어오면 그 코드로 들어왔다는 표시(claim)를 먼저 남긴다 */
  var DENIED_MESSAGE = '이 여행을 볼 권한이 없어요 · 초대받은 계정으로 로그인했는지 확인해 주세요.';
  Store.DENIED_MESSAGE = DENIED_MESSAGE;

  /** Firestore 오류 → 앱이 다루는 코드 (권한 없음은 'denied'로, 없는 방과 구분한다) */
  function errCodeOf(e) {
    var msg = String((e && (e.code || e.message)) || e);
    return /permission-denied|insufficient permissions|PERMISSION_DENIED/i.test(msg) ? 'denied' : '';
  }
  Store.errCodeOf = errCodeOf;

  function claimPath(invite, uid) { return ['triplog_meta', 'joins', normalizeCode(invite), 'claims', String(uid)]; }
  /** 재발급된 초대 코드로 들어왔다는 표시를 남긴다 (규칙: 그 코드의 별칭 문서가 살아 있어야 만든다) */
  function leaveClaim(fsMod, invite, uid) {
    var code = normalizeCode(invite);
    if (!code || !uid) return Promise.resolve(false);
    return withTimeout(fsMod.setDoc(fsMod.doc.apply(null, [db].concat(claimPath(code, uid))),
      { uid: String(uid), code: code, at: new Date().toISOString() }, { merge: true }), 10000, 'claim-timeout')
      .then(function () { return true; }, function (e) { reportError(e); return false; });
  }
  /** 다 쓴 초대 표시를 지운다 (일행 명단에 올랐으니 필요 없다 · 방장은 일행을 뺄 때도 지운다) */
  function dropClaim(fsMod, invite, uid) {
    var code = normalizeCode(invite);
    if (!fsMod || !code || !uid) return Promise.resolve(false);
    return fsMod.deleteDoc(fsMod.doc.apply(null, [db].concat(claimPath(code, uid))))
      .then(function () { return true; }, function () { return false; });
  }
  /** 지금 붙어 있는 Firestore로 초대 표시를 지운다 (없으면 조용히 넘어간다) */
  function dropClaimsOf(trip, uid) {
    if (!fs || !db || !trip || !uid) return;
    [trip.inviteCode, trip.remoteCode].forEach(function (c) {
      var code = normalizeCode(c);
      if (!code) return;
      try { dropClaim(fs, code, uid); } catch (e) {}
    });
  }
  /** 이 계정이 초대받은 사람인가 — 방 문서만 보고 판단하는 클라이언트 쪽 기준 (규칙이 한 번 더 막는다) */
  function invitedTo(trip, opts) {
    var me = Core.whoOf(currentUser());
    if (!trip || !me.uid) return false;
    var invite = normalizeCode(opts && opts.invite);
    var code = normalizeCode(trip.remoteCode);
    if (invite && invite !== code) return true;                       // 재발급된 새 초대 코드로 들어왔다
    if (code && normalizeCode(trip.inviteCode) === code) return true; // 초대 코드 = 방 문서 코드 (v28 이후 방)
    var mails = (Array.isArray(trip.pendingEmails) ? trip.pendingEmails : []).map(function (m) { return String(m).toLowerCase(); });
    if (me.email && mails.indexOf(me.email) >= 0) return true;        // 방장이 이메일을 적어 둔 일행
    return false;
  }
  Store.isRuleMember = function (trip, user) {
    return Core.isRuleMember(trip, user === undefined ? currentUser() : user);
  };
  /**
   * 규칙이 하위 문서(일정·지출…)를 열어 줄 수 있게, 초대받아 처음 들어온 계정을 일행 명단에 올린다.
   *  · 규칙은 "이미 있는 명단에 내 uid 하나만 더하는 쓰기"만 허용한다 (남의 방 명단을 고칠 수 없다)
   *  · 이미 일행이면 아무것도 쓰지 않는다
   *  · 실패하면 false — 하위 문서 구독을 시작하지 않는다 (권한 오류를 반복하지 않는다)
   */
  function ensureMembership(fsMod, trip, opts) {
    var acct = currentUser();
    if (!acct || !acct.uid || !trip || !trip.remoteCode) return Promise.resolve(false);
    var uid = String(acct.uid);
    var invite = normalizeCode(opts && opts.invite);
    if (Core.isRuleMember(trip, acct)) {
      if (invite) dropClaim(fsMod, invite, uid);   // 이미 일행 — 초대 표시는 남기지 않는다
      return Promise.resolve(true);
    }
    if (!invitedTo(trip, opts)) return Promise.resolve(false);
    var ref = fsMod.doc(db, 'trips', trip.remoteCode);
    /** 명단을 (필요하면 서버에서 다시 읽고) 내 uid 하나만 더해 쓴다 */
    function tryOnce(reread) {
      var step = !reread ? Promise.resolve() : withTimeout(fsMod.getDoc(ref), 8000, 'membership-read').then(function (snap) {
        var d = (snap && typeof snap.exists === 'function' && snap.exists()) ? (snap.data() || {}) : null;
        if (d && Array.isArray(d.memberUids)) trip.memberUids = d.memberUids.map(String).filter(Boolean);
      }, function () {});
      return step.then(function () {
        var before = (Array.isArray(trip.memberUids) ? trip.memberUids : []).map(String).filter(Boolean);
        if (before.indexOf(uid) >= 0) return true;                     // 그 사이 다른 기기가 명단에 올려 두었다
        var next = before.concat([uid]);
        var write = (typeof fsMod.updateDoc === 'function')
          ? fsMod.updateDoc(ref, { memberUids: next })
          : fsMod.setDoc(ref, { memberUids: next }, { merge: true });
        return withTimeout(write, 12000, 'membership-timeout').then(function () {
          trip.memberUids = next;
          save();
          return true;
        }, function (e) {
          reportError(e);
          return false;
        });
      });
    }
    /* 다른 기기가 동시에 명단을 바꿨으면 규칙이 거절한다 — 서버 값으로 한 번만 다시 시도한다 */
    return tryOnce(false).then(function (ok) {
      return ok ? true : tryOnce(true);
    }).then(function (ok) {
      if (ok && invite) dropClaim(fsMod, invite, uid);
      return ok;
    });
  }

  /** 코드로 방을 열고 실시간 구독을 시작한다. code가 없으면 새로 만든다. */
  Store.connect = function (tripId, opts) {
    opts = opts || {};
    var trip = Store.trip(tripId);
    if (!trip) return Promise.reject(new Error('여행을 찾을 수 없습니다.'));
    if (!Store.firebaseConfig()) return Promise.reject(new Error('설정에서 Firebase 정보를 먼저 입력해 주세요.'));
    /* v32: 저장소는 로그인한 계정만 연다 (규칙이 비로그인 접근을 모두 막는다) */
    if (!Store.signedIn()) {
      denyLogin();
      return Promise.reject(Object.assign(new Error('로그인이 필요해요'), { code: 'need-login' }));
    }
    return loadFb().then(function (fsMod) {
      var code = opts.code || trip.remoteCode || Core.inviteCode();
      trip.remoteCode = code;
      if (opts.invite) trip.inviteCode = normalizeCode(opts.invite);
      trip.inviteCode = normalizeCode(trip.inviteCode) || code;   // v28: 지금 유효한 초대 코드
      closeConn();
      conn = { code: code, tripId: trip.id, unsubs: [], metaReady: false, serverReady: {} };
      // 기존 방에 다시 붙는 경우: 첫 스냅샷이 오기 전에는 기기에 있던 목록을 서버로 밀어 올리지 않는다
      if (!opts.create) trip.hydrating = true;

      var metaRef = fsMod.doc(db, 'trips', code);
      var settled = false;
      var linkedOnce = false;
      var itemsStarted = false;      // v32: 하위 문서 구독을 한 번만 시작한다
      var membershipTried = false;   // v32: 첫 참여 명단 쓰기를 한 번만 시도한다
      /* v32: 재발급된 새 초대 코드로 들어오는 경우 — 이 코드로 초대받았다는 표시를 먼저 남긴다
         (규칙은 그 표시가 있어야 방 문서를 읽어 준다. 초대 코드 = 방 코드인 방은 필요 없다) */
      var claimReady = (!opts.create && opts.invite && normalizeCode(opts.invite) !== normalizeCode(code))
        ? leaveClaim(fsMod, opts.invite, (currentUser() || {}).uid)
        : Promise.resolve(true);
      // v23: 이 코드가 폭파된 적이 있는지(무덤 기록)를 먼저 본다 — 늦은 쓰기가 방 문서를 되살려도 링크는 열리지 않는다
      return claimReady.then(function () { return readGrave(fsMod, code); }).then(function (grave) {
        return new Promise(function (resolve, reject) {
        function done(err) {
          if (settled) return;
          settled = true;
          if (err) reject(err); else resolve({ code: code });
        }

        conn.unsubs.push(fsMod.onSnapshot(metaRef, function (snap) {
          /* 방 문서가 없거나 폭파 표시(deleted)면 열지 않는다.
             초대 코드로 새 문서를 만들지도, 기기에 남은 사본을 살리지도 않는다. */
          var exists = snap.exists();
          var metaData = exists ? (snap.data() || {}) : null;
          var destroyed = !exists || !!(metaData && metaData.deleted === true);
          // 이름·만든 시각·일행이 하나도 없는 껍데기 문서(폭파 뒤 늦은 쓰기가 되살린 방)
          if (!destroyed && exists && Core.isOrphanRoom(metaData)) destroyed = true;
          // 폭파 기록이 있고, 그 뒤에 새로 만든 방이 아니면 폭파된 방이다
          if (!destroyed && exists && graveHit(grave, metaData)) destroyed = true;
          var cached = !!(snap.metadata && snap.metadata.fromCache);
          if (destroyed) {
            // 새 방을 만드는 중이면 우리가 곧 이 문서를 덮어쓴다
            if (opts.create) { done(); return; }
            // 오프라인 캐시에 없다는 것만으로는 폭파됐다고 단정하지 않는다 (서버 확인을 기다린다)
            if (!exists && cached) return;
            tlStateError('notfound');
            if (settled) {
              // 보는 도중에 방장이 방을 폭파했다 — 이 기기에서도 치우고 화면을 돌린다
              closeConn();
              roomGone(code, trip.id);
              return;
            }
            var e = new Error(GONE_MESSAGE);
            e.code = 'notfound';
            closeConn();
            done(e);
            return;
          }
          Store.setFromCache(cached);
          var m = snap.data() || {};
          /* v28: 초대 코드로 들어온 경우, 방 문서의 지금 초대 코드와 다르면(재발급된 예전 링크)
             들어오지 않는다. 이미 들어온 기기는 remoteCode로 붙을 뿐 opts.invite가 없어 영향이 없다. */
          if (!opts.create && opts.invite) {
            var invNow = normalizeCode(m.inviteCode);
            if (invNow && invNow !== normalizeCode(opts.invite) && !Core.amInRoom(m, currentUser())) {
              closeConn();
              var rev = new Error(Store.REVOKED_MESSAGE);
              rev.code = 'revoked';
              done(rev);
              return;
            }
          }
          trip.name = m.name || trip.name;
          trip.destination = m.destination || trip.destination;
          trip.startDate = m.startDate || trip.startDate;
          trip.endDate = m.endDate || trip.endDate;
          trip.baseCurrency = m.baseCurrency || trip.baseCurrency;
          trip.members = Array.isArray(m.members) ? m.members : trip.members;
          trip.rates = m.rates || trip.rates;
          // v24: 방장(ownerUid)·방장 이메일도 방 문서에서 받는다 — 다른 기기에서 같은 계정으로
          //      로그인해도 방장 권한(일행 관리·방 삭제)이 그대로 동작한다
          if (m.ownerUid) trip.ownerUid = String(m.ownerUid);
          if (m.ownerEmail) trip.ownerEmail = String(m.ownerEmail).toLowerCase();
          // v28: 다른 기기(방장)가 새로 발급한 초대 코드를 받아 둔다 — 공유할 때 새 링크가 나간다
          if (m.inviteCode) trip.inviteCode = normalizeCode(m.inviteCode);
          /* v32: 저장소 규칙이 보는 접근 명단도 서버 값으로 맞춘다 (내가 쓴 값이 늦게 덮어쓰지 않게) */
          if (Array.isArray(m.memberUids)) trip.memberUids = m.memberUids.map(String).filter(Boolean);
          else if (!Array.isArray(trip.memberUids)) trip.memberUids = [];
          if (Array.isArray(m.pendingEmails)) trip.pendingEmails = m.pendingEmails.map(String).filter(Boolean);
          // 다른 기기가 남긴 삭제 기록도 받아들인다 (늦은 쓰기로 되살아난 항목을 다시 숨긴다)
          if (Array.isArray(m.deletedKeys)) {
            m.deletedKeys.forEach(function (d) {
              if (!d || !d.key) return;
              var t = tombMap(trip);
              if (t && (!t[d.key] || String(d.at || '') > String(t[d.key]))) t[d.key] = d.at || new Date().toISOString();
            });
          }
          // 로그인한 사용자가 일행 명단에 있으면(이메일로 매칭) 그 일행에 내 uid를 연결해 정확히 나로 인식하게 한다
          try {
            var acct = currentUser();
            if (acct) {
              var linked = null;
              (trip.members || []).forEach(function (mm) { if (!linked && Core.memberMatches(mm, acct)) linked = mm; });
              if (linked && !linked.uid) {
                linked.uid = acct.uid;
                if (!linked.email && acct.email) linked.email = String(acct.email).toLowerCase();
                pushMeta(trip, ['members']);
              }
            }
          } catch (e) {}
          trip.remote = true;
          if (conn) conn.metaReady = true;
          // v24: 예전 방(메타에 방장 기록이 없음)은 **이 기기에서 만든** 여행일 때만 방장 기록을 채운다
          //      (복원·참여한 사본이 남의 방 방장을 가로채지 않게)
          var meNow = currentUser();
          if (!m.ownerUid && trip.ownerUid && trip.createdHere && meNow && String(trip.ownerUid) === String(meNow.uid)) {
            pushMeta(trip, ['ownerUid', 'ownerEmail']);
          } else if (m.ownerUid && !m.ownerEmail && trip.ownerEmail) {
            pushMeta(trip, ['ownerEmail']);
          }
          if (!linkedOnce) {
            linkedOnce = true;
            if (TL.Account) TL.Account.onTrip(trip);   // 로그인 상태면 계정 여행 목록에도 남긴다
          }
          flushWrites(trip);   // v29: 방 정보를 받은 뒤 오프라인 대기열(메타 포함)을 올린다
          notify();
          done();
          /* v32: 하위 문서(일정·지출·준비물·예약)는 규칙상 '일행'만 읽을 수 있다.
             초대받아 처음 들어온 계정은 이때 일행 명단에 자기 uid를 더한 뒤에 구독을 시작한다.
             (화면에서 내가 누구인지 골라 일행 명단에 오르면 다음 스냅샷에서 구독이 시작된다) */
          if (Core.isRuleMember(trip, currentUser())) { beginItems(); return; }
          if (membershipTried) return;
          membershipTried = true;
          ensureMembership(fsMod, trip, opts).then(function (ok) {
            if (ok) { beginItems(); return; }
            // 일행이 아니거나 명단에 올리지 못했다 — 권한 오류를 반복하지 않고 화면에 이유를 남긴다
            tlStateError('denied');
            roomDenied(code, trip.id);
          });
        }, function (e) {
          reportError(e);
          /* v32: 권한 거절은 '없는 방'과 다르다. 폭파 기록이 있으면 폭파된 방으로 처리한다 */
          var d = errCodeOf(e);
          if (d === 'denied') {
            closeConn();
            if (grave && grave.found) {
              var g = new Error(GONE_MESSAGE);
              g.code = 'notfound';
              done(g);
              return;
            }
            tlStateError('denied');
            var dn = new Error(DENIED_MESSAGE);
            dn.code = 'denied';
            done(dn);
            return;
          }
          done(new Error(e && (e.code || e.message) ? (e.code || e.message) : '연결할 수 없습니다'));
        }));

        if (opts.create) {
          // 방을 처음 만들 때 방장 기록이 비어 있으면 지금 로그인한 계정을 방장으로 남긴다
          if (!trip.ownerUid) {
            var owner = currentUser();
            if (owner && owner.uid) {
              trip.ownerUid = String(owner.uid);
              if (owner.email) trip.ownerEmail = String(owner.email).toLowerCase();
            }
          }
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

        // v29: 오프라인에서 고쳐 둔 항목을 구독 전에 먼저 올린다 (첫 스냅샷이 지운 것처럼 보이지 않게)
        flushWrites(trip);
        function beginItems() {
          if (itemsStarted || !conn || conn.code !== code) return;   // 그 사이 연결이 닫혔으면 시작하지 않는다
          itemsStarted = true;
          COLLS.forEach(function (coll) {
            var colRef = fsMod.collection(db, 'trips', code, coll);
            conn.unsubs.push(fsMod.onSnapshot(colRef, function (snap) {
              if (snap.metadata && snap.metadata.fromCache) Store.setFromCache(true);
              if (conn && conn.code === code && !(snap.metadata && snap.metadata.fromCache) && conn.serverReady) {
                conn.serverReady[coll] = true;
              }
              // 서버 기준으로 통째로 교체한다 — 로컬에 남은 예전 항목은 사라지고, 지운 기록이 있는 id는 빼낸다
              trip.data[coll] = snap.docs.map(function (d) {
                var v = d.data() || {};
                v.id = d.id;
                return v;
              }).filter(function (v) { return !Store.isDeleted(trip, coll, v.id); });
              // 첫 스냅샷 전에는 일괄 재업로드(순서 정리·기간 축소)를 하지 않는다
              if (trip.hydrating) trip.hydrating = false;
              notify();
            }, function (e) {
              reportError(e);
              // v32: 일행에서 빠졌거나 규칙에 막혔다 — 화면에 이유를 남기고 홈으로 돌려보낸다
              if (errCodeOf(e) === 'denied' && conn && conn.code === code) {
                tlStateError('denied');
                roomDenied(code, trip.id);
              }
            }));
          });
          // 연결되면 밀려 있던 삭제를 Firestore에 반영한다
          flushDeletes(trip);
          trip.remote = true;
          notify();
        }
        // 내가 이미 일행(방장 포함)이면 곧바로 구독한다 — 초대받아 처음 들어온 경우는 위 스냅샷 처리에서 명단에 올린 뒤
        if (Core.isRuleMember(trip, currentUser())) beginItems();

        // 규칙/네트워크 오류로 응답이 없을 때를 대비한 안전 장치
        setTimeout(function () { done(); }, 12000);
        });
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
  /** 지금 실시간 연결 중인 여행 id (없으면 '') — 계정 목록 정리 때 방금 연 여행을 건드리지 않게 */
  Store.connectedTripId = function () { return conn ? String(conn.tripId || '') : ''; };
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
  function remoteWrite(trip, path, data, opts) {
    var ref = remoteRef(trip, path);
    if (!ref) {
      /* v29: Firestore를 아직 불러오지 못한 오프라인 상태 — 기기에 대기열로 남겨 두고 연결되면 올린다
         (앱을 오프라인으로 새로 열어 고친 내용이 사라지지 않게) */
      var q = queuePathOf(path);
      if (!trip) return false;
      if (q === 'meta') { trip.metaDirty = true; save(); return true; }
      if (q && q.coll && q.id) { queueWrite(trip, q.coll, q.id, data); save(); return true; }
      return false;
    }
    /* mustExist: 방 문서가 살아 있을 때만 고친다(updateDoc)
       — 보던 기기의 늦은 메타 쓰기가 폭파된 방 문서를 되살리는 일을 막는다 */
    if (opts && opts.mustExist && fs && typeof fs.updateDoc === 'function') {
      fs.updateDoc(ref, data).catch(function (e) {
        var msg = String((e && (e.code || e.message)) || '');
        if (/not-?found|no document/i.test(msg)) return;   // 이미 사라진 방 — 조용히 무시
        reportError(e);
      });
      return true;
    }
    fs.setDoc(ref, data, { merge: true }).catch(reportError);
    return true;
  }
  /** 문서 삭제. 지금 Firestore가 준비되지 않았으면 false(→ 호출한 쪽이 pendingDeletes에 쌓는다) */  function remoteDelete(trip, path) {
    var ref = remoteRef(trip, path);
    if (!ref) {
      var q = queuePathOf(path);
      if (q && q.coll && q.id) { queueDelete(trip, q.coll, q.id); save(); }
      return false;
    }
    fs.deleteDoc(ref).catch(reportError);
    return true;
  }

  /* ------------------------------------------------ 삭제 기록(tombstone)
     기기의 캐시·예전 스냅샷·오프라인 쓰기가 지운 항목을 다시 보여 주거나 되살리는 것을 막는다.
     · 지운 id는 trip.deleted 에 남겨 같은 id가 다시 스냅샷에 실려 와도 목록에 넣지 않는다
     · Firestore가 아직 준비되지 않아 지우지 못한 요청은 pendingDeletes 에 쌓아 두고 연결되면 지운다 */
  /* ------------------------------------- v29: 오프라인 쓰기 대기열
     Firestore를 아직 불러오지 못한 상태(오프라인으로 새로 연 화면)에서 고친 내용은
     trip.pendingWrites 에 남겨 두고, 연결되면 setDoc으로 올린다. 기기에는 즉시 저장된다(localStorage). */
  function queuePathOf(path) {
    var p = (Array.isArray(path) ? path : []).filter(function (s) { return s !== '' && s != null; });
    if (p[0] === 'trips') p.shift();
    if (p.length > 2 && COLLS.indexOf(p[1]) >= 0) return { coll: p[1], id: String(p[2]) };
    if (p.length > 1 && COLLS.indexOf(p[0]) >= 0) return { coll: p[0], id: String(p[1]) };
    return 'meta';
  }
  function queueWrite(trip, coll, id, data) {
    if (!trip || !coll || !id) return false;
    if (!trip.pendingWrites || typeof trip.pendingWrites !== 'object' || Array.isArray(trip.pendingWrites)) trip.pendingWrites = {};
    trip.pendingWrites[coll + '/' + id] = { coll: coll, id: String(id), data: data || {}, at: new Date().toISOString() };
    return true;
  }
  /** 대기열에 쌓인 쓰기를 Firestore로 올린다. 첫 스냅샷을 받은 뒤에 부르면 메타까지 함께 올린다. */
  function flushWrites(trip) {
    if (!trip || !trip.remoteCode || !fs || !db) return 0;
    var n = 0;
    var q = trip.pendingWrites;
    if (q && typeof q === 'object') {
      Object.keys(q).forEach(function (k) {
        var it = q[k];
        if (!it || !it.coll || !it.id) { delete q[k]; return; }
        var ref = null;
        try { ref = fs.doc(db, 'trips', trip.remoteCode, it.coll, String(it.id)); } catch (e) { ref = null; }
        if (!ref) return;
        n++;
        fs.setDoc(ref, it.data || {}).then(function () { delete q[k]; }, function (e) { reportError(e); });
      });
    }
    if (trip.metaDirty) {
      // 메타는 방 문서의 첫 스냅샷을 받은 뒤에만 올린다 (기기 캐시로 방 정보를 덮어쓰지 않게)
      if (conn && conn.code === trip.remoteCode && conn.metaReady) {
        trip.metaDirty = false;
        remoteWrite(trip, [trip.remoteCode], metaPayload(trip), { mustExist: true });
        n++;
      }
    }
    return n;
  }
  Store.flushWrites = function (tripId) { return flushWrites(Store.trip(tripId)); };
  Store.pendingWriteCount = function (tripId) {
    var t = typeof tripId === 'string' ? Store.trip(tripId) : tripId;
    if (!t) return 0;
    return Object.keys(t.pendingWrites || {}).length + (t.metaDirty ? 1 : 0);
  };

  function tombKey(coll, id) { return coll + '/' + id; }  function tombMap(trip) {
    if (!trip) return null;
    if (!trip.deleted || typeof trip.deleted !== 'object' || Array.isArray(trip.deleted)) trip.deleted = {};
    return trip.deleted;
  }
  Store.isDeleted = function (trip, coll, id) {
    return !!(trip && trip.deleted && trip.deleted[tombKey(coll, id)]);
  };
  function markDeleted(trip, coll, id) {
    var t = tombMap(trip);
    if (!t) return;
    t[tombKey(coll, id)] = new Date().toISOString();
    var keys = Object.keys(t);
    if (keys.length > 500) {   // 기록이 무한정 커지지 않게 오래된 것부터 버린다
      keys.sort(function (a, b) { return String(t[a]).localeCompare(String(t[b])); });
      keys.slice(0, keys.length - 500).forEach(function (k) { delete t[k]; });
    }
  }
  function clearTomb(trip, coll, id) {
    if (trip && trip.deleted) delete trip.deleted[tombKey(coll, id)];
  }
  function queueDelete(trip, coll, id) {
    if (!trip) return;
    if (!Array.isArray(trip.pendingDeletes)) trip.pendingDeletes = [];
    var key = tombKey(coll, id);
    if (trip.pendingWrites && trip.pendingWrites[key]) delete trip.pendingWrites[key];   // 올리기 전에 지운 것은 올리지 않는다
    if (!trip.pendingDeletes.some(function (d) { return d && d.key === key; })) {
      trip.pendingDeletes.push({ key: key, coll: coll, id: id });
    }
  }
  /** 연결이 살아났을 때 밀린 삭제를 Firestore에 반영한다 */
  function flushDeletes(trip) {
    if (!trip || !trip.remoteCode || !Array.isArray(trip.pendingDeletes) || !trip.pendingDeletes.length) return 0;
    var left = [];
    var n = 0;
    trip.pendingDeletes.forEach(function (d) {
      if (!d || !d.coll || !d.id) return;
      if (remoteDelete(trip, [trip.remoteCode, d.coll, d.id])) n++;
      else left.push(d);
    });
    trip.pendingDeletes = left;
    return n;
  }
  Store.flushDeletes = function (tripId) { return flushDeletes(Store.trip(tripId)); };
  /** 지운 항목이 다른 기기의 늦은 쓰기·예전 캐시로 되살아나지 않게, 지운 기록을 방 문서에도 남긴다 */
  function pushDeletes(trip) {
    if (!trip || !trip.remoteCode || !trip.deleted) return;
    var keys = Object.keys(trip.deleted);
    if (!keys.length) return;
    var recent = keys.slice(-40).map(function (k) { return { key: k, at: trip.deleted[k] }; });
    remoteWrite(trip, [trip.remoteCode], { deletedKeys: recent, deletedAt: new Date().toISOString() }, { mustExist: true });
  }
  Store.pushDeletes = pushDeletes;

  /* ------------------------------------------- 폭파 무덤(grave)
     방 문서를 지우면 늦은 메타 쓰기(setDoc merge)가 문서를 통째로 되살릴 수 있다.
     그래서 폭파할 때 triplog_meta/gone-<코드>에 기록을 남기고, 연결할 때 먼저 본다.
     · 무덤 이후에 새로 만든 같은 코드의 방(createdAt이 무덤보다 뒤)은 정상으로 본다
     · 무덤 읽기가 실패해도 방 문서 검사는 그대로 하므로 판단이 더 느슨해지지 않는다 */
  function graveDocId(code) { return 'gone-' + String(code || '').toUpperCase(); }
  function readGrave(fsMod, code) {
    try {
      if (!fsMod || typeof fsMod.getDoc !== 'function') return Promise.resolve(null);
      var ref = fsMod.doc(db, 'triplog_meta', graveDocId(code));
      return withTimeout(fsMod.getDoc(ref), 6000, 'grave-timeout').then(function (snap) {
        var exists = snap && typeof snap.exists === 'function' ? snap.exists() : !!(snap && snap.data());
        if (!exists) return null;
        var d = (snap.data && snap.data()) || {};
        return { found: true, at: String(d.at || d.deletedAt || ''), by: String(d.by || '') };
      }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  Store.readGrave = function (code) { return fs ? readGrave(fs, code) : Promise.resolve(null); };
  function graveHit(grave, meta) {
    if (!grave || !grave.found) return false;
    var created = String((meta && meta.createdAt) || '');
    if (created && grave.at && created > grave.at) return false;   // 폭파 뒤에 새로 만든 같은 코드의 방
    return true;
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
  /** 방을 서버에서 완전히 없앤다 (방장이 여행을 삭제할 때)
      · 먼저 폭파 표시(deleted:true)를 남겨, 항목을 지우는 사이에도 초대 링크가 열리지 않게 한다
      · 이 기기가 아는 항목 문서를 지우고, 마지막에 방 문서를 지운다
      · 실패하면 기기 목록은 그대로 두어 다시 시도할 수 있게 한다 (성공한 척하지 않는다) */
  Store.destroyTrip = function (tripId) {
    var trip = Store.trip(tripId);
    if (!trip) return Promise.reject(new Error('여행을 찾을 수 없습니다.'));
    if (!Store.canWrite()) {
      denyLogin();
      return Promise.reject(Object.assign(new Error('로그인이 필요해요'), { code: 'need-login' }));
    }
    var code = String(trip.remoteCode || trip.inviteCode || '').trim().toUpperCase();
    if (!code) {   // 이 기기에만 있는 여행 — 서버에 지울 방이 없다
      Store.removeTrip(tripId);
      return Promise.resolve({ code: '', local: true });
    }
    // 방장(또는 예전 방에서 방장으로 확인되는 계정)만 방을 폭파할 수 있다 (일행은 목록에서 빼는 것만 가능)
    if (!Core.canDestroyRoom(trip, currentUser())) {
      return Promise.reject(Object.assign(new Error('방장만 방을 삭제할 수 있어요'), { code: 'notowner' }));
    }
    var items = [];
    COLLS.forEach(function (coll) {
      (trip.data[coll] || []).forEach(function (it) { if (it && it.id) items.push([coll, String(it.id)]); });
    });
    closeConn();   // 폭파 표시가 내 구독으로 되돌아오지 않게 먼저 끊는다
    return Promise.resolve().then(function () { return loadFb(); }).then(function (fsMod) {
      var metaRef = fsMod.doc(db, 'trips', code);
      var acct = currentUser();
      var stamp = new Date().toISOString();
      // 먼저 폭파 기록(무덤)을 남긴다 — 이후 어떤 경로(늦은 쓰기·캐시·새로고침)로도 링크가 열리지 않게
      var mark = function () {
        try {
          return fsMod.setDoc(fsMod.doc(db, 'triplog_meta', graveDocId(code)),
            { code: code, at: stamp, by: (acct && acct.uid) || '' }).catch(function () {});
        } catch (e) { return Promise.resolve(); }
      };
      return mark().then(function () {
        return fsMod.setDoc(metaRef, {
          deleted: true,
          deletedAt: stamp,
          deletedBy: (acct && acct.uid) || ''
        }, { merge: true });
      }).then(function () {
        // 항목 문서는 하나씩 지운다 (실패해도 방 폭파는 계속한다)
        var chain = Promise.resolve();
        items.forEach(function (pair) {
          chain = chain.then(function () {
            return fsMod.deleteDoc(fsMod.doc(db, 'trips', code, pair[0], pair[1])).catch(function () {});
          });
        });
        return chain;
      }).then(function () {
        return fsMod.deleteDoc(metaRef);   // 방 문서까지 지우면 초대 코드는 완전히 끝난다
      });
    }).then(function () {
      forgetLocal(code, tripId);
      return { code: code };
    }, function (e) {
      reportError(e);
      throw e;
    });
  };

  /** 초대 코드로 참여: 로컬에 여행 자리를 만들고 구독한다. opts.silent면 화면 전환·닉네임 변경 없이 목록에만 더한다.
      v28: 코드를 먼저 방 문서로 풀어 본다 — 재발급된 새 코드는 별칭 문서(triplog_meta/join-<코드>)를 거치고,
      방장이 새 코드를 발급한 뒤의 예전 코드로는 들어올 수 없다. */
  Store.joinByCode = function (code, nickname, opts) {
    opts = opts || {};
    if (!Store.canWrite()) {
      denyLogin();
      return Promise.reject(Object.assign(new Error('로그인이 필요해요'), { code: 'need-login' }));
    }
    var c = normalizeCode(code);
    if (!/^[A-Z0-9]{4,10}$/.test(c)) return Promise.reject(new Error('초대 코드는 영문·숫자 4~10자리입니다.'));
    if (nickname && !opts.silent) Store.setNickname(nickname);
    return Promise.resolve().then(function () { return loadFb(); }).then(function (fsMod) {
      return resolveInvite(fsMod, c);
    }).then(function (res) {
      if (!res.ok) {
        var revoked = res.reason === 'revoked';
        var e = new Error(revoked ? Store.REVOKED_MESSAGE : GONE_MESSAGE);
        e.code = revoked ? 'revoked' : (res.reason === 'net' ? 'network' : 'notfound');
        // 서버가 '없는 방'이라고 확인했으면 기기에 캐시로 남은 사본도 치운다
        if (!revoked && res.reason !== 'net') { closeConn(); dropLocalByCode(c); }
        throw e;
      }
      return openRoom(res.room, res.invite, opts);
    });
  };
  /** 초대 코드(지금 코드·예전 코드)로 이 기기에 남은 여행 사본을 치운다 */
  function dropLocalByCode(code) {
    var c = normalizeCode(code);
    if (!c) return 0;
    var ids = [];
    state.trips = state.trips.filter(function (t) {
      var hit = normalizeCode(t.remoteCode) === c || normalizeCode(t.inviteCode) === c;
      if (hit && t.id) ids.push(t.id);
      return !hit;
    });
    ids.forEach(function (id) { if (state.meByTrip) delete state.meByTrip[id]; });
    if (state.currentTripId && ids.indexOf(state.currentTripId) >= 0) state.currentTripId = null;
    try { if (TL.Account && TL.Account.forget) TL.Account.forget(c); } catch (e) {}
    notify();
    return ids.length;
  }
  /** 확인된 방 코드(room)로 이 기기의 여행 자리를 만들고 구독한다. invite는 사용자가 누른 초대 코드 */
  function openRoom(code, invite, opts) {
    var room = normalizeCode(code);
    var used = normalizeCode(invite) || room;
    var existing = null;
    state.trips.forEach(function (t) { if (normalizeCode(t.remoteCode) === room) existing = t; });
    var trip = existing || {
      id: 'remote_' + room,
      name: '여행을 불러오는 중…',
      destination: '',
      startDate: Core.todayISO(),
      endDate: Core.todayISO(),
      baseCurrency: 'KRW',
      members: [],
      rates: {},
      remoteCode: room,
      inviteCode: used,
      createdAt: new Date().toISOString(),
      data: { schedules: [], expenses: [], checklist: [], reservations: [] }
    };
    if (existing) { existing.remoteCode = room; existing.inviteCode = used; }
    if (!existing) state.trips.push(trip);
    /* 이미 이 기기에 있던 여행으로 다시 들어오는 경우:
       기기에 캐시된 예전 항목(다른 곳에서 지운 일정·지출 등)이 되살아나거나 다시 업로드되지 않도록
       첫 스냅샷이 올 때까지 비워 둔다. 연결이 실패하면 원래 값을 돌려준다. */
    var prevData = null;
    if (existing && existing.remoteCode) {
      prevData = existing.data;
      existing.data = { schedules: [], expenses: [], checklist: [], reservations: [] };
      existing.hydrating = true;
    }
    var prevCurrent = state.currentTripId;
    if (!opts.silent) state.currentTripId = trip.id;
    notify();
    return Store.connect(trip.id, { code: room, invite: used }).then(function () {
      // 일행 목록에 내가 있는지는 사용자가 직접 고른다 (Dialogs.afterJoin / joinChoice)
      trip.hydrating = false;
      notify();
      return trip;
    }).catch(function (e) {
      if (e && e.code === 'revoked' && existing) {
        // 이미 이 기기에 있던 방 — 예전 링크를 눌렀어도 내 여행은 지우지 않는다
        if (prevData) existing.data = prevData;
        existing.hydrating = false;
        notify();
        throw e;
      }
      var dead = !!(e && (e.code === 'notfound' || e.code === 'revoked'));
      if (dead) {
        /* 서버가 '없거나 폭파된 방'이라고 확인했다 — 기기에 캐시로 남아 있던 이 방도 함께 지운다 */
        state.trips = state.trips.filter(function (t) { return t.id !== trip.id && t !== existing; });
        if (state.currentTripId === trip.id) state.currentTripId = (prevCurrent === trip.id ? null : prevCurrent);
        if (state.meByTrip) delete state.meByTrip[trip.id];
        try { if (TL.Account && TL.Account.forget) TL.Account.forget(room); } catch (x) {}
      } else if (!existing) {
        state.trips = state.trips.filter(function (t) { return t.id !== trip.id; });
        state.currentTripId = prevCurrent;
      } else if (prevData) {
        existing.data = prevData;   // 연결에 실패하면 기기에 있던 내용을 그대로 둔다
        existing.hydrating = false;
      }
      notify();
      throw e;
    });
  }

  /* ---------------------------------------------------- backup / restore */
  /** 내보내기: 방장·일행 계정 연결 정보까지 함께 담는다
      (v24 — ownerUid/ownerEmail/memberUids와 일행별 uid·email이 없으면
       다른 기기에서 복원했을 때 '내 여행만 보기' 필터에 걸려 여행이 안 보였다) */
  function exportTrip(t) {
    var out = Object.assign({}, t);
    var members = (t.members || []).map(function (m) {
      var o = Object.assign({}, m);
      if (m && m.uid) o.uid = String(m.uid);
      if (m && m.email) o.email = String(m.email).trim().toLowerCase();
      return o;
    });
    out.members = members;
    var ownerUid = String(t.ownerUid || '');
    out.ownerUid = ownerUid;
    var ownerEmail = String(t.ownerEmail || '').trim().toLowerCase();
    if (!ownerEmail && ownerUid) {
      members.forEach(function (m) { if (!ownerEmail && m.uid && String(m.uid) === ownerUid && m.email) ownerEmail = String(m.email).toLowerCase(); });
    }
    out.ownerEmail = ownerEmail;
    out.memberUids = members.map(function (m) { return m.uid; }).filter(Boolean);
    return out;
  }
  Store.exportJSON = function () {
    return JSON.stringify({
      app: 'triplog',
      version: 2,
      exportedAt: new Date().toISOString(),
      nickname: state.nickname,
      trips: state.trips.map(exportTrip)
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
      var outM = { id: id, name: name };
      // v24: 일행의 계정 연결(uid·email)도 보존한다
      var uid = typeof m.uid === 'string' ? m.uid.trim().slice(0, 128) : '';
      if (uid) outM.uid = uid;
      var mail = typeof m.email === 'string' ? m.email.trim().toLowerCase().slice(0, 120) : '';
      if (mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) outM.email = mail;
      return outM;
    }).filter(Boolean);
    if (!out.members.length) out.members = [{ id: Core.uid('m'), name: '나' }];
    memIds = {};
    out.members.forEach(function (m) { memIds[m.id] = 1; });

    // v24: 방장 계정(ownerUid·ownerEmail)도 보존한다 — 없으면 복원 뒤 홈 필터에서 숨겨졌다
    out.ownerUid = typeof t.ownerUid === 'string' ? t.ownerUid.trim().slice(0, 128) : '';
    out.ownerEmail = typeof t.ownerEmail === 'string' ? t.ownerEmail.trim().toLowerCase().slice(0, 120) : '';
    out.members.forEach(function (m) {
      if (!out.ownerEmail && out.ownerUid && m.uid === out.ownerUid && m.email) out.ownerEmail = m.email;
      if (!out.ownerUid && out.ownerEmail && m.email === out.ownerEmail && m.uid) out.ownerUid = m.uid;
    });
    out.memberUids = out.members.map(function (m) { return m.uid; }).filter(Boolean);

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

  /** v24: 복원한 여행에 지금 로그인한 계정을 연결한다
      · 방장이 비어 있으면 내 계정을 방장(ownerUid)으로 — 그래야 홈의 '내 여행만 보기'에 나온다
      · 일행 중 내 계정(uid·email)이나 내 이름과 같은 사람, 없으면 계정이 연결되지 않은 첫 일행에 내 계정을 붙인다
      · 다른 사람 계정이 이미 붙은 일행은 건드리지 않는다 (남의 연결을 빼앗지 않는다) */
  function linkImportedTrip(t, acct) {
    if (!t || !acct || !acct.uid) return false;
    var uid = String(acct.uid);
    var mail = acct.email ? String(acct.email).trim().toLowerCase() : '';
    var changed = false;
    if (!t.ownerUid) {
      t.ownerUid = uid;
      if (mail) t.ownerEmail = mail;
      changed = true;
    }
    var members = t.members || [];
    var mine = null;
    members.forEach(function (m) { if (!mine && Core.memberMatches(m, acct)) mine = m; });
    if (!mine) {
      var names = [];
      if (state.nickname) names.push(state.nickname);
      try { var label = TL.Auth && TL.Auth.displayName ? TL.Auth.displayName() : ''; if (label) names.push(label); } catch (e) {}
      members.forEach(function (m) {
        if (mine || names.indexOf(m.name) < 0) return;
        if (m.uid && String(m.uid) !== uid) return;   // 다른 사람 계정이 붙은 동명이인은 건너뛴다
        mine = m;
      });
    }
    if (!mine) {
      // 계정이 하나도 연결되지 않은 첫 일행 — 방장이 아니어도 목록·화면에 열리게
      members.forEach(function (m) { if (!mine && !m.uid && !m.email) mine = m; });
    }
    if (mine) {
      if (!mine.uid) { mine.uid = uid; changed = true; }
      if (!mine.email && mail) { mine.email = mail; changed = true; }
    }
    if (changed) {
      t.memberUids = members.map(function (m) { return m.uid; }).filter(Boolean);
    }
    return changed;
  }

  Store.importJSON = function (text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error('JSON 파일을 읽을 수 없어요.'); }
    var trips = (parsed && parsed.trips) || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(trips)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
    var acct = currentUser();
    var added = [];
    trips.forEach(function (raw) {
      var t = sanitizeTrip(raw);
      if (acct) linkImportedTrip(t, acct);   // v24: 복원한 여행이 홈에서 바로 보이게 내 계정 연결
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

  /* ---------------------------------------- v29: DB 기준 동기화 표시
     DB(Firestore)가 여행 목록의 기준이다. 기기에만 있는 여행은 올라갈 때까지 syncPending으로 표시해
     계정 목록 동기화가 아직 올리지 못한 오프라인 생성분을 지우지 않게 한다. */
  /** 올리기 대기 표시를 켜고 끈다 (계정 등록에 성공하면 끈다) */
  Store.setSyncPending = function (trip, on) {
    var t = typeof trip === 'string' ? Store.trip(trip) : trip;
    if (!t) return false;
    var next = !!on;
    if (!!t.syncPending === next) return false;
    t.syncPending = next;
    save();
    return true;
  };
  Store.markSynced = function (trip) { return Store.setSyncPending(trip, false); };
  Store.markSyncPending = function (trip) { return Store.setSyncPending(trip, true); };
  /** 아직 계정·방에 올리지 못한 여행 (오프라인에서 만든 것) */
  Store.pendingUploads = function () {
    return (state.trips || []).filter(function (t) { return t && !t.sample && (!t.remoteCode || t.syncPending); });
  };
  /** 계정별 '기기에만 있던 여행을 한 번 올렸다' 표시 */
  Store.isUploadedAll = function (uid) { return !!(uid && state.uploadedAll && state.uploadedAll[uid]); };
  Store.markUploadedAll = function (uid) {
    if (!uid) return false;
    if (!state.uploadedAll || typeof state.uploadedAll !== 'object') state.uploadedAll = {};
    if (state.uploadedAll[uid]) return false;
    state.uploadedAll[uid] = true;
    save();
    return true;
  };

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
