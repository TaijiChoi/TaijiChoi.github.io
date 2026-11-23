/* 트립로그 — 계정 로그인 (Firebase Authentication)
   · Google 로그인: signInWithPopup → (팝업 차단·미지원) signInWithRedirect + getRedirectResult
   · 이메일/비밀번호 로그인·회원가입·비밀번호 재설정
   · 로그인하지 않아도 앱은 그대로 동작한다(게스트). 로그인은 '내 여행 목록을 계정에 저장'하는 선택 기능이다.
   Firebase 설정이 없으면 아무 것도 불러오지 않는다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Auth = (TL.Auth = {});

  var FB_VERSION = '10.12.2';
  var BASE = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';

  var auth = null;         // firebase auth 인스턴스
  var fbMod = null;        // firebase-auth 모듈
  var appMod = null;
  var user = null;         // 현재 로그인 사용자 (uid·displayName·email·photoURL·providerId)
  var listeners = [];
  var started = false;
  var loading = null;
  var busy = false;
  var lastError = '';
  var lastCode = '';
  var provider = null;     // 테스트에서 갈아끼우는 인증 공급자

  /* ------------------------------------------------------------ 상태 */
  function snapUser(u) {
    if (!u) return null;
    var pid = '';
    try {
      if (u.providerData && u.providerData[0]) pid = u.providerData[0].providerId || '';
    } catch (e) {}
    return {
      uid: String(u.uid || ''),
      displayName: String(u.displayName || ''),
      email: String(u.email || ''),
      photoURL: String(u.photoURL || ''),
      emailVerified: !!u.emailVerified,
      providerId: pid,
      anonymous: !!u.isAnonymous
    };
  }
  Auth.currentUser = function () { return user; };
  Auth.uid = function () { return user ? user.uid : ''; };
  Auth.signedIn = function () { return !!(user && user.uid); };
  Auth.displayName = function () { return user ? TL.Core.accountLabel(user) : ''; };
  Auth.email = function () { return user ? user.email : ''; };
  Auth.busy = function () { return busy; };
  Auth.lastError = function () { return lastError ? { code: lastCode, message: lastError } : null; };
  Auth.onChange = function (cb) {
    listeners.push(cb);
    try { cb(user); } catch (e) { console.error(e); }
    return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
  };
  function emit() {
    listeners.slice().forEach(function (cb) { try { cb(user); } catch (e) { console.error(e); } });
  }
  function setUser(u, opts) {
    var next = snapUser(u);
    var before = user ? user.uid : '';
    user = next;
    if (!next || next.uid !== before) { lastError = ''; lastCode = ''; }
    if (next && next.uid) {
      try { Auth._persist(next, !!(opts && opts.remember)); } catch (e) {}
    } else {
      try { Auth._persist(null); } catch (e) {}
    }
    emit();
  }
  /** 마지막 로그인 계정을 기기에 남겨 두어 '이 계정으로 계속'을 보여준다 */
  Auth._persist = function (u, remember) {
    try {
      var k = 'triplog.lastAccount';
      if (!u) root.localStorage && root.localStorage.removeItem(k);
      else if (remember) root.localStorage && root.localStorage.setItem(k, JSON.stringify({ uid: u.uid, name: TL.Core.accountLabel(u), email: u.email }));
    } catch (e) {}
  };
  Auth.lastAccount = function () {
    try {
      var raw = root.localStorage && root.localStorage.getItem('triplog.lastAccount');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  /* --------------------------------------------------- 오류 → 한국어 */
  var MESSAGES = {
    'auth/popup-blocked': '팝업이 막혀 있어요. 다시 누르면 이동 로그인으로 열게요.',
    'auth/popup-closed-by-user': '로그인 창을 닫았어요.',
    'auth/cancelled-popup-request': '로그인 창을 닫았어요.',
    'auth/operation-not-supported-in-this-environment': '이 브라우저에서는 팝업 로그인이 안 돼요. 이동 로그인으로 다시 시도해 주세요.',
    'auth/operation-not-allowed': 'Firebase 콘솔 › Authentication › Sign-in method에서 이 로그인 방법을 사용 설정해 주세요.',
    'auth/unauthorized-domain': 'Firebase 콘솔 › Authentication › Settings › 승인된 도메인에 지금 주소를 추가해 주세요.',
    'auth/configuration-not-found': 'Firebase 콘솔에서 Authentication을 먼저 시작해 주세요.',
    'auth/invalid-api-key': 'Firebase 설정의 apiKey가 올바르지 않아요. 설정을 다시 확인해 주세요.',
    'auth/invalid-email': '이메일 주소 형식을 확인해 주세요.',
    'auth/missing-password': '비밀번호를 입력해 주세요.',
    'auth/missing-email': '이메일을 입력해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/wrong-password': '비밀번호가 맞지 않아요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/invalid-login-credentials': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/user-not-found': '이 이메일로 가입된 계정이 없어요. 회원가입을 해 주세요.',
    'auth/user-disabled': '이 계정은 사용이 중지됐어요. Firebase 콘솔에서 확인해 주세요.',
    'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'auth/account-exists-with-different-credential': '같은 이메일이 다른 로그인 방법으로 가입돼 있어요. 그 방법으로 로그인해 주세요.',
    'auth/internal-error': '로그인 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.',
    'no-firebase': 'Firebase 설정이 없어 로그인을 쓸 수 없어요. 설정에서 먼저 연결해 주세요.'
  };
  /** 오류 코드를 사용자에게 보여줄 한국어 문장으로 바꾼다 */
  Auth.errorText = function (err) {
    var code = '';
    if (err && typeof err === 'string') code = err;
    else if (err && err.code) code = String(err.code);
    if (MESSAGES[code]) return MESSAGES[code];
    var msg = err && (err.message || err.code) ? (err.message || err.code) : String(err || '로그인하지 못했어요.');
    return '로그인하지 못했어요: ' + msg;
  };
  Auth.REDIRECT_CODES = [
    'auth/popup-blocked',
    'auth/popup-blocked-by-browser',
    'auth/operation-not-supported-in-this-environment'
  ];
  /** 팝업 실패를 이동 로그인으로 넘겨야 하는지 (사용자가 창을 닫은 경우는 넘기지 않는다) */
  Auth.shouldRedirect = function (code) {
    return Auth.REDIRECT_CODES.indexOf(String(code || '')) >= 0;
  };

  /* ------------------------------------------------------- Firebase 로드 */
  function load() {
    if (auth) return Promise.resolve(auth);
    if (loading) return loading;
    var cfg = TL.Store && TL.Store.firebaseConfig && TL.Store.firebaseConfig();
    if (!cfg) return Promise.reject({ code: 'no-firebase' });
    loading = Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js')
    ]).then(function (mods) {
      appMod = mods[0];
      fbMod = mods[1];
      var app;
      try { app = appMod.getApp('triplog'); } catch (e) { app = appMod.initializeApp(cfg, 'triplog'); }
      try { auth = fbMod.getAuth(app); }
      catch (e) { auth = fbMod.initializeAuth(app, { persistence: fbMod.browserLocalPersistence }); }
      try {
        if (fbMod.setPersistence && fbMod.browserLocalPersistence) {
          fbMod.setPersistence(auth, fbMod.browserLocalPersistence).catch(function () {});
        }
      } catch (e) {}
      fbMod.onAuthStateChanged(auth, function (u) { setUser(u, { remember: true }); }, function (e) {
        lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
        emit();
      });
      return auth;
    }).catch(function (e) {
      loading = null;
      lastError = 'Firebase 로그인 모듈을 불러오지 못했어요. 네트워크를 확인해 주세요.';
      lastCode = (e && e.code) || '';
      emit();
      throw e;
    });
    return loading;
  }
  Auth.load = load;

  /* --------------------------------------------------- 실제 인증 공급자 */
  function firebaseProvider() {
    return {
      ready: function () { return load(); },
      google: function () {
        return load().then(function () {
          var p = new fbMod.GoogleAuthProvider();
          try { p.setCustomParameters({ prompt: 'select_account' }); } catch (e) {}
          return fbMod.signInWithPopup(auth, p).then(function (res) {
            if (res && res.user) setUser(res.user, { remember: true });
            return { method: 'popup', user: snapUser(res && res.user) };
          }).catch(function (e) {
            var code = (e && e.code) || '';
            if (Auth.REDIRECT_CODES.indexOf(code) >= 0) {
              // 팝업이 막힌 환경(인앱 브라우저·모바일)은 페이지 이동 로그인으로 넘긴다
              return fbMod.signInWithRedirect(auth, p).then(function () {
                return { method: 'redirect', user: null };
              });
            }
            throw e;
          });
        });
      },
      emailSignIn: function (email, pw) {
        return load().then(function () {
          return fbMod.signInWithEmailAndPassword(auth, email, pw).then(function (res) {
            if (res && res.user) setUser(res.user, { remember: true });
            return snapUser(res && res.user);
          });
        });
      },
      emailSignUp: function (email, pw, name) {
        return load().then(function () {
          return fbMod.createUserWithEmailAndPassword(auth, email, pw).then(function (res) {
            var u = res && res.user;
            if (u && name && fbMod.updateProfile) {
              return fbMod.updateProfile(u, { displayName: name }).catch(function () {}).then(function () {
                setUser(u, { remember: true });
                return snapUser(u);
              });
            }
            setUser(u, { remember: true });
            return snapUser(u);
          });
        });
      },
      resetPassword: function (email) {
        return load().then(function () {
          if (!fbMod.sendPasswordResetEmail) throw { code: 'auth/operation-not-allowed' };
          return fbMod.sendPasswordResetEmail(auth, email).then(function () { return true; });
        });
      },
      signOut: function () {
        if (!auth) { setUser(null); return Promise.resolve(true); }
        return fbMod.signOut(auth).then(function () { setUser(null); return true; });
      },
      redirectResult: function () {
        if (!auth || !fbMod.getRedirectResult) return Promise.resolve(null);
        return fbMod.getRedirectResult(auth).then(function (res) {
          if (res && res.user) { setUser(res.user, { remember: true }); return snapUser(res.user); }
          return null;
        }).catch(function (e) {
          lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
          emit();
          return null;
        });
      }
    };
  }
  function api() { return provider || (provider = firebaseProvider()); }

  /* -------------------------------------------------------------- 공개 */
  /** 앱이 시작할 때 한 번. Firebase 설정이 없으면 아무 것도 하지 않는다. */
  Auth.init = function () {
    if (started) return Promise.resolve(Auth.signedIn());
    started = true;
    var cfg = TL.Store && TL.Store.firebaseConfig && TL.Store.firebaseConfig();
    if (!cfg) { emit(); return Promise.resolve(false); }
    return load().then(function () {
      return api().redirectResult ? api().redirectResult() : null;
    }).then(function () {
      return Auth.signedIn();
    }).catch(function () { return false; });
  };
  /** Firebase 설정을 새로 입력했을 때 다시 시도할 수 있게 초기화한다 */
  Auth.reset = function () {
    auth = null; fbMod = null; appMod = null; loading = null; started = false; provider = null;
  };

  Auth.signInGoogle = function () {
    busy = true; lastError = '';
    return Promise.resolve().then(function () { return api().google(); }).then(function (res) {
      busy = false;
      if (res && res.method === 'redirect') return { method: 'redirect', user: user };
      if (!user) return { method: 'popup', user: null };
      return { method: 'popup', user: user };
    }).catch(function (e) {
      busy = false;
      lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
      emit();
      throw e;
    });
  };
  Auth.signInEmail = function (email, pw) {
    busy = true; lastError = '';
    return Promise.resolve().then(function () { return api().emailSignIn(String(email || '').trim(), String(pw || '')); })
      .then(function (u) { busy = false; return u; })
      .catch(function (e) {
        busy = false;
        lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
        emit();
        throw e;
      });
  };
  Auth.signUpEmail = function (email, pw, name) {
    busy = true; lastError = '';
    return Promise.resolve().then(function () { return api().emailSignUp(String(email || '').trim(), String(pw || ''), name || ''); })
      .then(function (u) { busy = false; return u; })
      .catch(function (e) {
        busy = false;
        lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
        emit();
        throw e;
      });
  };
  Auth.resetPassword = function (email) {
    return Promise.resolve().then(function () { return api().resetPassword(String(email || '').trim()); })
      .catch(function (e) {
        lastError = Auth.errorText(e); lastCode = (e && e.code) || '';
        emit();
        throw e;
      });
  };
  Auth.signOut = function () {
    return Promise.resolve().then(function () { return api().signOut(); }).then(function () {
      setUser(null);
      return true;
    });
  };

  /* ------------------------------------------------------- 테스트 전용 */
  /** 가짜 인증 공급자 (quickjs 테스트·실브라우저 QA에서 실제 Firebase 없이 로그인 흐름을 검사) */
  Auth.setProvider = function (fake) { provider = fake || null; };
  Auth.testSignIn = function (u) { setUser(u || { uid: 'test-uid', displayName: '테스터', email: 'tester@example.com' }, { remember: false }); };
  Auth.testSignOut = function () { setUser(null); };
  Auth.testSetError = function (code) { lastCode = code || ''; lastError = Auth.errorText(code || ''); emit(); };
  Auth.testReset = function () {
    provider = null; auth = null; fbMod = null; appMod = null; loading = null; started = false;
    busy = false; lastError = ''; lastCode = ''; user = null; listeners = [];
  };
})(typeof window !== 'undefined' ? window : globalThis);
