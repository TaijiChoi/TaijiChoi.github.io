/* 트립로그 — 계정 동기화
   로그인한 계정(users/{uid})에 내 여행 목록을 적어 두고, 다른 기기에서 같은 계정으로 로그인하면
   그 목록을 그대로 불러온다. 여행 내용 자체는 기존 실시간 공유 문서(trips/{초대코드})에 있으므로,
   계정 문서에는 초대코드·이름·기간·역할 같은 '목록 정보'만 담는다.

   users/{uid}                       이름·이메일·updatedAt
   users/{uid}/trips/{초대코드}      code, name, destination, startDate, endDate, role, memberCount, updatedAt

   로그인하지 않은 게스트 상태에서는 이 파일의 어떤 것도 동작하지 않는다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Account = (TL.Account = {});

  var me = null;             // {uid, email, name, photo}
  var docs = [];             // 계정의 여행 문서들
  var unsubs = [];
  var io = null;             // Firestore 접근 (테스트에서는 갈아끼운다)
  var listeners = [];
  var registered = {};       // 이번 로그인에서 이미 올린 초대코드
  var timers = {};
  var syncing = false;
  var error = '';
  var autoDone = false;
  var pullTried = {};
  var docsReady = false;     // 계정 여행 목록의 첫 스냅샷을 받았는가 (v29: DB 기준 정리의 전제)
  var docsFromServer = false; // 그 목록이 서버에서 온 것인가 (기기 캐시만으로는 아무것도 지우지 않는다)
  var forgotten = {};        // 이번 로그인에서 내가 뺀 코드 (스냅샷이 늦게 와도 다시 가져오지 않는다)

  function markDocsReady() {
    if (docsReady) return;
    docsReady = true;
    // 목록을 받은 뒤 목록 기준 정리를 한 번 한다 (목록을 받기 전 동기화는 아무것도 지우지 않는다)
    if (Account.signedIn() && !syncing) Account.syncSoon(60);
  }

  function notify() {
    listeners.slice().forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
  }
  Account.onChange = function (cb) {
    listeners.push(cb);
    try { cb(); } catch (e) {}
    return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
  };
  Account.me = function () { return me; };
  Account.signedIn = function () { return !!(me && me.uid); };
  Account.trips = function () { return docs.slice(); };
  Account.error = function () { return error; };
  Account.syncing = function () { return syncing; };
  Account.docsReady = function () { return docsReady; };

  /* --------------------------------------------------- Firestore 접근 */
  function realIO() {
    function dbApi() {
      return TL.Store.loadFb().then(function () {
        var o = TL.Store.fsdb();
        if (!o || !o.fs || !o.db) throw new Error('Firebase 저장소가 준비되지 않았어요');
        return o;
      });
    }
    function refOf(fs, db, path) { return fs.doc.apply(null, [db].concat(path)); }
    function collOf(fs, db, path) { return fs.collection.apply(null, [db].concat(path)); }
    return {
      writeDoc: function (path, data) {
        return dbApi().then(function (o) { return o.fs.setDoc(refOf(o.fs, o.db, path), data, { merge: true }); });
      },
      deleteDoc: function (path) {
        return dbApi().then(function (o) { return o.fs.deleteDoc(refOf(o.fs, o.db, path)); });
      },
      subscribeColl: function (path, cb, onErr) {
        var off = null, dead = false;
        dbApi().then(function (o) {
          if (dead) return;
          off = o.fs.onSnapshot(collOf(o.fs, o.db, path), function (snap) {
            cb((snap && snap.docs ? snap.docs : []).map(function (d) {
              var v = d.data() || {};
              v.id = d.id;
              return v;
            }), { fromCache: !!(snap && snap.metadata && snap.metadata.fromCache) });
          }, function (e) { if (onErr) onErr(e); });
        }).catch(function (e) { if (onErr) onErr(e); });
        return function () { dead = true; if (off) { try { off(); } catch (e) {} } };
      }
    };
  }
  function api() {
    if (!io) io = realIO();
    return io;
  }
  Account.testSetIO = function (fake) { io = fake || null; };

  /* ------------------------------------------------------- 계정 문서 */
  function profilePath(uid) { return ['users', uid]; }
  function tripsPath(uid) { return ['users', uid, 'trips']; }
  function tripDocPath(uid, code) { return ['users', uid, 'trips', code]; }

  function isoNow() { return new Date().toISOString(); }
  /** 계정 문서에 담을 여행 정보 */
  Account.meta = function (trip) {
    if (!trip) return null;
    var code = String(trip.remoteCode || trip.inviteCode || '').toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code)) return null;
    return {
      code: code,
      remoteCode: code,
      name: String(trip.name || '').slice(0, 60),
      destination: String(trip.destination || '').slice(0, 60),
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      role: TL.Core.tripRole(trip, me && me.uid),
      memberCount: (trip.members || []).length,
      updatedAt: isoNow()
    };
  };

  function registerTrip(trip) {
    if (!me || !me.uid) return Promise.resolve(false);
    var meta = Account.meta(trip);
    if (!meta) return Promise.resolve(false);
    var key = me.uid + ':' + meta.code;
    registered[key] = true;
    return Promise.resolve(api().writeDoc(tripDocPath(me.uid, meta.code), meta))
      .then(function () {
        // v29: DB에 올라갔으니 '올리기 대기' 표시를 푼다
        try { if (TL.Store && TL.Store.markSynced) TL.Store.markSynced(trip); } catch (e) {}
        return true;
      })
      .catch(function (e) {
        error = tlErr(e);
        // 올리지 못한 여행은 표시해 둔다 — 다음 동기화가 지우지 않고 다시 올린다
        try { if (TL.Store && TL.Store.markSyncPending) TL.Store.markSyncPending(trip); } catch (x) {}
        notify();
        return false;
      });
  }
  /** 새로 만든·참여한 여행을 계정에 올린다 (Store가 부른다) */
  Account.onTrip = function (trip) {
    if (!Account.signedIn() || !trip) return Promise.resolve(false);
    return registerTrip(trip);
  };
  /** 잠시 뒤 동기화 (로그인 직후 방장 정리처럼 순서가 있는 작업 뒤에 부른다) */
  var soonTimer = 0;
  Account.syncSoon = function (ms) {
    clearTimeout(soonTimer);
    soonTimer = setTimeout(function () {
      soonTimer = 0;
      if (!Account.signedIn()) return;
      Account.sync().catch(function () {});
    }, ms || 400);
  };
  /** 여행 이름·기간이 바뀌면 잠시 뒤 계정 문서도 고친다 */
  Account.touch = function (trip) {
    if (!Account.signedIn() || !trip || !trip.remoteCode) return;
    var code = String(trip.remoteCode).toUpperCase();
    clearTimeout(timers[code]);
    timers[code] = setTimeout(function () { delete timers[code]; registerTrip(trip); }, 1200);
  };
  /** 계정 여행 목록에서 뺀다 (방장이 방을 삭제했거나, 서버에 없는 방일 때) */
  Account.forget = function (code) {
    code = String(code || '').trim().toUpperCase();
    if (!code || !/^[A-Z0-9]{4,10}$/.test(code) || !Account.signedIn()) return Promise.resolve(false);
    delete registered[me.uid + ':' + code];
    forgotten[code] = true;   // 늦게 도착한 스냅샷으로 다시 가져오지 않는다
    clearTimeout(timers[code]);
    delete timers[code];
    docs = docs.filter(function (d) {
      return String((d && (d.code || d.remoteCode || d.id)) || '').toUpperCase() !== code;
    });
    notify();
    return Promise.resolve(api().deleteDoc(tripDocPath(me.uid, code))).then(function () { return true; }, function () { return false; });
  };
  /** 이번 로그인에서 내가 뺀 코드인가 (DB 목록이 늦게 와도 되살리지 않는다) */
  Account.wasForgotten = function (code) { return !!forgotten[String(code || '').toUpperCase()]; };

  function tlErr(e) {
    var s = String((e && (e.code || e.message)) || e);
    if (/permission-denied|insufficient permissions/i.test(s)) {
      return '권한이 없어요 — 설정의 Firestore 규칙에 users 경로 규칙을 넣어 주세요';
    }
    if (/unavailable|network|offline/i.test(s)) return '네트워크가 불안정해 동기화하지 못했어요';
    return s;
  }

  /* ------------------------------------------------------------- 시작 */
  function start(user) {
    var uid = user && user.uid;
    if (!uid) return;
    if (me && me.uid === uid) return;
    stop(false);
    me = {
      uid: uid,
      email: user.email || '',
      name: TL.Core.accountLabel(user),
      photo: user.photoURL || ''
    };
    error = '';
    registered = {};
    autoDone = false;
    docs = [];
    docsReady = false;
    docsFromServer = false;
    forgotten = {};
    unsubs.push(api().subscribeColl(tripsPath(uid), function (list, meta) {
      docs = list || [];
      // 기기 캐시에서 온 목록으로는 아무것도 지우지 않는다 (서버가 확인해 준 목록만 기준)
      if (!meta || !meta.fromCache) docsFromServer = true;
      markDocsReady();
      notify();
    }, function (e) {
      error = tlErr(e);
      notify();
    }));
    notify();
    // 로그인 계정 이름을 내 이름 기본값으로 (아직 정하지 않았을 때만)
    try {
      if (!TL.Store.settings().nickname && me.name) TL.Store.setNickname(me.name);
    } catch (e) {}
    Account.sync().catch(function (e) { error = tlErr(e); notify(); });
  }
  function stop() {
    unsubs.forEach(function (u) { try { u(); } catch (e) {} });
    unsubs = [];
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; });
    clearTimeout(soonTimer);
    soonTimer = 0;
    running = null;
    var was = !!me;
    me = null;
    docs = [];
    registered = {};
    error = '';
    autoDone = false;
    pullTried = {};
    docsReady = false;
    docsFromServer = false;
    forgotten = {};
    syncing = false;   // 다음 계정으로 바뀔 때 이전 동기화 표시가 남지 않게
    // 여행 자체의 실시간 연결은 그대로 둔다 — 로그아웃해도 게스트로 일행과 계속 쓸 수 있다
    if (was) notify();
  }
  Account.stop = function () { stop(); };

  /** 로그인/로그아웃을 계정 동기화에 연결한다 (앱이 시작할 때 한 번) */
  Account.init = function () {
    if (!TL.Auth || !TL.Auth.onChange) return;
    TL.Auth.onChange(function (user) {
      if (user && user.uid) start(user);
      else stop();
    });
  };

  /* ------------------------------------------------------------ 동기화 */
  /** 지금 상태에서 계정에 올릴 코드·가져올 코드·로컬 전용 여행을 계산한다 */
  Account.plan = function () {
    var trips = TL.Store.state ? TL.Store.state().trips : [];
    return TL.Core.accountPlan(trips, docs);
  };

  /**
   * 계정과 기기를 맞춘다.
   *  · 프로필 저장
   *  · 이 기기의 원격 여행 → 계정에 올리기
   *  · 계정에만 있는 여행 → 이 기기로 가져오기(초대코드로 연결)
   */
  function codeOfTrip(t) { return String((t && (t.remoteCode || t.inviteCode)) || '').trim().toUpperCase(); }
  function validCode(c) { return /^[A-Z0-9]{4,10}$/.test(String(c || '')); }

  /**
   * 계정(DB)과 기기를 맞춘다 — v29부터 **DB(users/{uid}/trips)가 여행 목록의 기준**이다.
   *  1) 프로필 저장
   *  2) 기기에만 있는 여행·올리지 못한 여행을 DB로 올린다 (방 생성 + 계정 목록 등록)
   *  3) DB 목록에 없는 기기 여행은 이 기기에서 지운다 — 다른 기기에서 지운 여행이 되살아나지 않는다
   *  4) DB에만 있는 여행은 이 기기로 가져온다
   * 오프라인이면 아무것도 지우지 않고 기기에만 저장해 둔다 (연결되면 다시 맞춘다).
   */
  function runSync() {
    if (!Account.signedIn()) return Promise.reject(new Error('로그인이 필요해요'));
    if (syncing) return Promise.resolve({ skipped: true });
    syncing = true;
    error = '';
    notify();
    var uid = me.uid;
    var out = { registered: 0, pulled: 0, uploaded: 0, pruned: 0, failed: [], localOnly: 0, offline: false };
    var online = true;
    try { if (TL.Store && TL.Store.syncState) online = TL.Store.syncState().online !== false; } catch (e) {}
    out.offline = !online;
    var finish = function () { syncing = false; autoDone = true; notify(); return out; };
    var fail = function (e) { syncing = false; error = tlErr(e); notify(); throw e; };
    var locals = function () {
      return (TL.Store.state().trips || []).filter(function (t) { return t && !t.sample; });
    };

    // 오프라인: 아무것도 지우지 않고 기기(localStorage)에만 저장해 둔다 — 연결되면 다시 맞춘다
    if (!online) {
      out.localOnly = locals().filter(function (t) { return !codeOfTrip(t); }).length;
      return Promise.resolve(finish());
    }

    var stage = { firstRun: true, have: {}, uploaded: {} };
    try { stage.firstRun = !(TL.Store.isUploadedAll && TL.Store.isUploadedAll(uid)); } catch (e) {}

    function saveProfile() {
      return Promise.resolve(api().writeDoc(profilePath(uid), {
        name: me.name, email: me.email, updatedAt: isoNow()
      })).catch(function (e) { error = tlErr(e); });
    }

    /** 지금 받아 둔 계정 여행 목록(DB) — 이 목록이 여행 목록의 기준이다 */
    function snapshotDocs() {
      docs.forEach(function (d) {
        var c = String((d && (d.remoteCode || d.code || d.id)) || '').trim().toUpperCase();
        if (validCode(c) && !(d && d.local)) stage.have[c] = true;
      });
      out.localOnly = locals().filter(function (t) { return !codeOfTrip(t); }).length;
    }

    function uploadOne(t) {
      var cur = TL.Store.trip(t.id);
      if (!cur) return Promise.resolve(null);
      var step = codeOfTrip(cur) ? Promise.resolve(true) : Promise.resolve()
        .then(function () { return TL.Store.connect(cur.id, { create: true }); })
        .then(function () { return true; });
      return step.then(function () {
        var now = TL.Store.trip(t.id);
        if (!now) return null;
        var c = codeOfTrip(now);
        if (!validCode(c)) {
          try { TL.Store.markSyncPending(now); } catch (e) {}
          out.failed.push('upload:' + t.id);
          return null;
        }
        out.uploaded++;
        stage.have[c] = true;               // 이번에 올린 코드는 정리 대상에서 뺀다
        stage.uploaded[c] = true;
        return registerTrip(now).then(function (ok) { if (ok) out.registered++; else out.failed.push(c); });
      }, function (e) {
        try { TL.Store.markSyncPending(cur); } catch (x) {}
        out.failed.push('upload:' + t.id);
        error = tlErr(e);
        return null;
      });
    }

    /** 기기에만 있는 여행(오프라인 생성 포함)과 올리지 못한 여행을 DB로 올린다 */
    function uploadAll() {
      var list = locals().filter(function (t) {
        if (!codeOfTrip(t) || t.syncPending) return true;
        return stage.firstRun && t.createdHere;   // 이 기기에서 만든 옛 여행은 첫 회차에 한 번 올린다
      });
      var chain = Promise.resolve();
      list.forEach(function (t) { chain = chain.then(function () { return uploadOne(t); }); });
      return chain;
    }

    /** DB 목록에 없는 기기 여행은 지운다 — 다른 기기에서 지운 여행은 여기서 사라진다 */
    function pruneLocal() {
      if (!docsReady || !docsFromServer) return 0;              // 목록을 못 받았으면(오프라인·캐시) 지우지 않는다
      if (!Object.keys(stage.have).length) return 0;            // 목록이 비어 있으면 일시 오류로 보고 그대로 둔다
      var liveId = '';
      try { liveId = TL.Store.connectedTripId ? TL.Store.connectedTripId() : ''; } catch (e) {}
      var nowMs = Date.now();
      var n = 0;
      locals().forEach(function (t) {
        var c = codeOfTrip(t);
        if (!validCode(c)) return;
        if (t.syncPending || stage.uploaded[c] || stage.have[c]) return;   // 올리기 대기·이번에 올린 것·DB에 있는 것
        if (registered[uid + ':' + c]) return;                            // 방금 이 기기에서 올린 여행
        if (liveId && t.id === liveId) return;                            // 지금 열어 둔 여행
        if (stage.firstRun && t.createdHere) return;                      // 첫 회차에 올린 옛 여행
        var made = Date.parse(t.createdAt || t.updatedAt || t.joinedAt || '');
        if (isFinite(made) && nowMs - made < 120000) return;              // 방금 만든·참여한 여행(서버 목록 지연)
        if (TL.Store.removeTripLocal(t.id)) n++;
      });
      out.pruned += n;
      return n;
    }

    /** DB에만 있는 여행을 이 기기로 가져온다 */
    function pullMissing() {
      var plan = null;
      try { plan = Account.plan(); } catch (e) { return Promise.resolve(); }
      var list = (plan.pull || []).filter(function (c) {
        return !forgotten[c] && !pullTried[uid + ':' + c];
      });
      var chain = Promise.resolve();
      list.forEach(function (code) {
        chain = chain.then(function () {
          return TL.Store.joinByCode(code, '', { silent: true }).then(function () {
            pullTried[uid + ':' + code] = true;
            out.pulled++;
          }).catch(function (e) {
            out.failed.push(code);
            if (e && e.code === 'notfound') {
              // 서버에 없는(폭파된) 방 — 계정 목록에 남겨두지 않는다
              Account.forget(code);
              return;
            }
            error = tlErr(e);
          });
        });
      });
      return chain;
    }

    function markMigrated() {
      // 첫 회차를 끝냈으면 표시 — 다음부터는 DB 목록만 보고 맞춘다
      if (docsReady && stage.firstRun) { try { TL.Store.markUploadedAll(uid); } catch (e) {} }
    }

    return saveProfile()
      .then(function () { snapshotDocs(); return uploadAll(); })
      .then(function () { pruneLocal(); return pullMissing(); })
      .then(function () { markMigrated(); return finish(); })
      .then(null, fail);
  }

  /* 진행 중인 동기화 — 진행 중에 다시 부르면 끝난 뒤 한 번 더 맞춘다
     (로그인 직후처럼 동기화가 도는 사이에 여행을 만들거나 목록이 바뀌는 경우) */
  var running = null;
  Account.sync = function () {
    if (!Account.signedIn()) return Promise.reject(new Error('로그인이 필요해요'));
    if (running) {
      var again = function () { return Account.sync(); };
      return running.then(again, again);
    }
    running = runSync().then(function (v) { running = null; return v; }, function (e) {
      running = null;
      throw e;
    });
    return running;
  };

  /** 로컬에만 있는 여행을 계정에 연결한다 (실시간 공유 방을 만들어 계정에 올린다) */
  Account.mergeLocal = function () {
    if (!Account.signedIn()) return Promise.reject(new Error('로그인이 필요해요'));
    var plan = Account.plan();
    var out = { merged: 0, failed: [] };
    var chain = Promise.resolve();
    plan.localOnly.forEach(function (id) {
      chain = chain.then(function () {
        var trip = TL.Store.trip(id);
        if (!trip) return null;
        return TL.Store.connect(trip.id, { create: true }).then(function () {
          return registerTrip(TL.Store.trip(trip.id)).then(function (ok) {
            if (ok) out.merged++; else out.failed.push(id);
          });
        }).catch(function () { out.failed.push(id); });
      });
    });
    return chain.then(function () { notify(); return out; });
  };

  Account.status = function () {
    var plan = { localOnly: [], remoteCount: 0 };
    try { plan = Account.plan(); } catch (e) {}
    var pending = 0;
    try { pending = TL.Store.pendingUploads().length; } catch (e) {}
    return {
      signedIn: Account.signedIn(),
      uid: me ? me.uid : '',
      name: me ? me.name : '',
      email: me ? me.email : '',
      photo: me ? me.photo : '',
      docCount: docs.length,
      docsReady: docsReady,
      pending: pending,
      syncing: syncing,
      error: error,
      localOnly: plan.localOnly.length,
      remoteCount: plan.remoteCount
    };
  };

  /* ------------------------------------------------------- 테스트 전용 */
  Account.testReset = function () {
    stop();
    io = null;
    listeners = [];
    pullTried = {};
  };
  Account.testInjectDocs = function (list) { docs = (list || []).slice(); notify(); };
})(typeof window !== 'undefined' ? window : globalThis);
