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
            }));
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
      .then(function () { return true; })
      .catch(function (e) { error = tlErr(e); notify(); return false; });
  }
  /** 새로 만든·참여한 여행을 계정에 올린다 (Store가 부른다) */
  Account.onTrip = function (trip) {
    if (!Account.signedIn() || !trip) return Promise.resolve(false);
    return registerTrip(trip);
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
    clearTimeout(timers[code]);
    delete timers[code];
    docs = docs.filter(function (d) {
      return String((d && (d.code || d.remoteCode || d.id)) || '').toUpperCase() !== code;
    });
    notify();
    return Promise.resolve(api().deleteDoc(tripDocPath(me.uid, code))).then(function () { return true; }, function () { return false; });
  };

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
    unsubs.push(api().subscribeColl(tripsPath(uid), function (list) {
      docs = list || [];
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
    var was = !!me;
    me = null;
    docs = [];
    registered = {};
    error = '';
    autoDone = false;
    pullTried = {};
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
  Account.sync = function () {
    if (!Account.signedIn()) return Promise.reject(new Error('로그인이 필요해요'));
    if (syncing) return Promise.resolve({ skipped: true });
    syncing = true;
    error = '';
    notify();
    var uid = me.uid;
    var out = { registered: 0, pulled: 0, failed: [], localOnly: 0 };
    return Promise.resolve(api().writeDoc(profilePath(uid), {
      name: me.name, email: me.email, updatedAt: isoNow()
    })).catch(function (e) { error = tlErr(e); }).then(function () {
      var plan = Account.plan();
      out.localOnly = plan.localOnly.length;
      var localByCode = {};
      (TL.Store.state().trips || []).forEach(function (t) {
        if (t.remoteCode) localByCode[String(t.remoteCode).toUpperCase()] = t;
      });
      var chain = Promise.resolve();
      plan.register.forEach(function (code) {
        chain = chain.then(function () {
          return registerTrip(localByCode[code]).then(function (ok) { if (ok) out.registered++; else out.failed.push(code); });
        });
      });
      plan.pull.forEach(function (code) {
        chain = chain.then(function () {
          if (pullTried[uid + ':' + code]) return null;
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
    }).then(function () {
      syncing = false;
      autoDone = true;
      notify();
      return out;
    }, function (e) {
      syncing = false;
      error = tlErr(e);
      notify();
      throw e;
    });
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
    return {
      signedIn: Account.signedIn(),
      uid: me ? me.uid : '',
      name: me ? me.name : '',
      email: me ? me.email : '',
      photo: me ? me.photo : '',
      docCount: docs.length,
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
