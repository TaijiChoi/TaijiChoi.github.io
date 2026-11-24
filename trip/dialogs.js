/* 트립로그 — 입력 시트와 설정 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var D = (TL.Dialogs = {});
  var A = (TL.Actions = TL.Actions || {});

  var dlg = { kind: '', trip: null, id: null, members: [], sharedWith: [], private: false, payerId: '', dayKey: '', meId: '' };
  var cal = { open: false, month: '', start: '', end: '' };
  var mem = { trip: null, editing: '' };

  function open(html, title) { UI.open(html, { title: title }); }
  function tripOf() { return D.trip; }

  /* ======================================================== 여행 만들기 */
  function memberChipsHtml() {
    return dlg.members.map(function (m) {
      return UI.memberChip(m, { me: m.id === dlg.meId, remove: 'del-member-chip' });
    }).join('');
  }
  function memberEditorHtml() {
    return '<div class="members-pick" id="member-list">' + memberChipsHtml() + '</div>' +
      '<div class="inline-add"><input class="input" id="member-new" placeholder="일행 이름 (예: 아내)" maxlength="12" autocomplete="off" enterkeyhint="done">' +
      '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="add-member-chip">' + UI.icon('plus', 16) + '추가</button></div>' +
      '<div class="hintline">이름을 넣고 <b>추가</b>(또는 Enter)를 누르면 색 배지로 붙어요. 배지의 × 를 누르면 빠져요.</div>';
  }
  function refreshMemberList() {
    var el = document.getElementById('member-list');
    if (el) el.innerHTML = memberChipsHtml();
  }
  function rangeInputsHtml() {
    return '<input type="hidden" id="f_start" value="' + UI.esc(cal.start) + '">' +
      '<input type="hidden" id="f_end" value="' + UI.esc(cal.end || cal.start) + '">';
  }
  function renderRangeField() {
    var box = document.getElementById('range-field');
    if (!box) return;
    box.outerHTML = UI.rangeFieldHtml({ start: cal.start, end: cal.end, open: cal.open, month: cal.month });
    var s = document.getElementById('f_start'), e = document.getElementById('f_end');
    if (s) s.value = cal.start || '';
    if (e) e.value = cal.end || cal.start || '';
  }

  D.newTrip = function () {
    var today = Core.todayISO();
    var nick = Store.settings().nickname;
    var start = Core.addDays(today, 7), end = Core.addDays(today, 9);
    dlg = { kind: 'new-trip', members: [{ id: Core.uid('m'), name: nick || '나' }], id: null };
    dlg.meId = dlg.members[0].id;
    D.trip = null;
    cal = { open: false, month: Core.monthKeyOf(start), start: start, end: end };
    var html = '';
    html += '<div class="form-row"><label class="fl">여행 이름</label>' +
      '<input class="input" id="f_name" placeholder="예: 오사카 3박 4일" maxlength="40" autocomplete="off"></div>';
    html += '<div class="form-row"><label class="fl">여행지</label>' +
      '<input class="input" id="f_dest" placeholder="예: 오사카 · 교토" maxlength="40" autocomplete="off"></div>';
    html += '<div class="form-row"><label class="fl">기간</label>' +
      UI.rangeFieldHtml({ start: start, end: end, open: false, month: cal.month }) + rangeInputsHtml() + '</div>';
    html += '<div class="form-row"><label class="fl">기본 통화</label>' +
      '<select class="input" id="f_cur">' + Core.CURRENCIES.map(function (c) {
        return '<option value="' + c.code + '"' + (c.code === 'KRW' ? ' selected' : '') + '>' + c.code + ' · ' + c.name + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="form-row"><label class="fl">일행</label>' + memberEditorHtml() + '</div>';
    html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="save-new-trip">만들기</button></div>';
    open(html, '새 여행 만들기');
  };

  A['save-new-trip'] = function () {
    if (!UI.requireLogin('로그인하면 여행을 만들 수 있어요')) return;
    var name = UI.val('f_name').trim();
    if (!name) { UI.toast('여행 이름을 입력해 주세요'); return; }
    var chk = Core.checkRange(cal.start, cal.end || cal.start);
    if (!chk.ok) { UI.toast(chk.error); cal.open = true; renderRangeField(); return; }
    var members = dlg.members.length ? dlg.members : [{ id: Core.uid('m'), name: Store.settings().nickname || '나' }];
    var trip = Store.createTrip({
      name: name,
      destination: UI.val('f_dest').trim(),
      startDate: chk.start,
      endDate: chk.end,
      baseCurrency: UI.val('f_cur') || 'KRW',
      members: members
    });
    if (!trip) { UI.toast('여행을 만들지 못했어요 · 로그인을 확인해 주세요', 3000); return; }
    Store.setMeMember(trip.id, members.some(function (m) { return m.id === dlg.meId; }) ? dlg.meId : members[0].id);
    if (!Store.settings().nickname) Store.setNickname(members[0].name);
    UI.close();
    TL.App.openTrip(trip.id, 'schedule');
    UI.toast('여행을 만들었어요 · ' + Core.stayLabel(chk.start, chk.end));
  };

  /* ======================================================== 여행 정보 수정 */
  D.editTrip = function (trip) {
    dlg = { kind: 'edit-trip', members: (trip.members || []).slice(), id: trip.id, trip: trip };
    dlg.meId = Store.meId(trip, (trip.members[0] || {}).id);
    D.trip = trip;
    cal = { open: false, month: Core.monthKeyOf(trip.startDate), start: trip.startDate, end: trip.endDate || trip.startDate };
    var html = '';
    html += '<div class="form-row"><label class="fl">여행 이름</label>' +
      '<input class="input" id="f_name" value="' + UI.esc(trip.name) + '" maxlength="40" autocomplete="off"></div>';
    html += '<div class="form-row"><label class="fl">여행지</label>' +
      '<input class="input" id="f_dest" value="' + UI.esc(trip.destination || '') + '" maxlength="40" autocomplete="off"></div>';
    html += '<div class="form-row"><label class="fl">기간</label>' +
      UI.rangeFieldHtml({ start: cal.start, end: cal.end, open: false, month: cal.month }) + rangeInputsHtml() + '</div>';
    html += '<div class="form-row"><label class="fl">일행</label>' + memberEditorHtml() + '</div>';
    html += '<div class="sheet-foot"><button class="btn btn-danger" data-action="delete-trip" style="flex:.7">삭제</button>' +
      '<button class="btn btn-primary" data-action="save-edit-trip">저장</button></div>';
    open(html, '여행 정보 수정');
  };

  A['save-edit-trip'] = function () {
    if (!UI.requireLogin('로그인하면 여행 정보를 고칠 수 있어요')) return;
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) { UI.toast('여행 정보를 찾을 수 없어요'); return; }
    var name = UI.val('f_name').trim() || trip.name;
    var chk = Core.checkRange(cal.start || trip.startDate, cal.end || trip.endDate || trip.startDate);
    if (!chk.ok) { UI.toast(chk.error); cal.open = true; renderRangeField(); return; }
    var members = dlg.members.length ? dlg.members : trip.members;
    // 폼에서 빠진 일행은 지출·준비물 참조까지 정리한다
    (trip.members || []).forEach(function (m) {
      if (!members.some(function (x) { return x.id === m.id; })) Store.removeMember(trip.id, m.id);
    });
    Store.updateTrip(trip.id, {
      name: name,
      destination: UI.val('f_dest').trim(),
      startDate: chk.start,
      endDate: chk.end,
      members: members
    });
    var moved = Store.fitDaysToTrip(trip.id);
    if (members.some(function (m) { return m.id === dlg.meId; })) Store.setMeMember(trip.id, dlg.meId);
    UI.close();
    UI.toast(moved ? '저장했어요 · 사라진 날의 ' + moved + '개 항목을 마지막 날로 옮겼어요' : '저장했어요', moved ? 3200 : 2200);
  };

  /* ======================================================== 여행 삭제
     방장이 공유 방을 지우면 되돌릴 수 없다 — 확인 단계에서 분명히 알리고,
     확인을 눌렀을 때만 서버의 방까지 폭파한다. */
  var danger = { trip: null, mode: '' };

  /** 이 여행의 방장인가 (예전 방은 계정이 연결된 일행이나 만든 사람으로 본다)
      v23: Core.canDestroyRoom과 같은 기준을 쓴다 — 예전 방(HMHLXW 같은)도 방장이면 '완전히 삭제'할 수 있다 */
  function isRoomOwner(trip) {
    if (!trip) return false;
    try { return Core.canDestroyRoom(trip, Store.currentUser()); } catch (e) { return false; }
  }

  A['delete-trip'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) return;
    var shared = !!trip.remoteCode;
    danger.trip = trip;
    danger.mode = shared ? (isRoomOwner(trip) ? 'destroy' : 'leave') : 'local';
    var html = '';
    if (danger.mode === 'destroy') {
      html += '<div class="danger-box">' +
        '<div class="danger-head">' + UI.icon('close', 18) + '<b>' + UI.esc(trip.name) + ' 방을 삭제할까요?</b></div>' +
        '<p class="danger-lead">삭제하면 방이 완전히 사라지며 복구할 수 없어요. 일행들의 초대 링크도 더 이상 사용할 수 없게 됩니다.</p>' +
        '<ul class="danger-list">' +
          '<li>이 방의 일정·지출·준비물·예약이 모두 사라져요</li>' +
          '<li>일행 화면에서도 이 여행이 사라져요</li>' +
          '<li>초대코드 ' + UI.esc(String(trip.remoteCode)) + ' 로는 다시 들어올 수 없어요</li>' +
        '</ul></div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
        '<button class="btn btn-danger" data-action="delete-trip-confirm">완전히 삭제</button></div>';
    } else if (danger.mode === 'leave') {
      html += '<div class="danger-box">' +
        '<div class="danger-head">' + UI.icon('close', 18) + '<b>' + UI.esc(trip.name) + ' 여행을 목록에서 뺄까요?</b></div>' +
        '<p class="danger-lead">이 기기 목록에서만 빠지고, 방장과 일행들의 방·데이터는 그대로 남아요.</p>' +
        '<p class="hintline">초대 링크(' + UI.esc(String(trip.remoteCode)) + ')로 다시 들어올 수는 있어요.</p></div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
        '<button class="btn btn-danger" data-action="delete-trip-confirm">목록에서 빼기</button></div>';
    } else {
      html += '<div class="danger-box">' +
        '<div class="danger-head">' + UI.icon('close', 18) + '<b>' + UI.esc(trip.name) + ' 여행을 삭제할까요?</b></div>' +
        '<p class="danger-lead">이 기기에만 있는 여행이에요. 삭제하면 되돌릴 수 없어요.</p></div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
        '<button class="btn btn-danger" data-action="delete-trip-confirm">삭제</button></div>';
    }
    open(html, danger.mode === 'destroy' ? '방 삭제' : '여행 삭제');
  };

  A['delete-trip-confirm'] = function () {
    var ref = danger.trip;
    var mode = danger.mode || 'local';
    danger = { trip: null, mode: '' };
    var trip = ref ? Store.trip(ref.id) : null;
    if (!trip) { UI.close(); return; }
    if (mode !== 'destroy') {
      Store.removeTrip(trip.id);
      UI.close();
      TL.App.goHome();
      UI.toast(mode === 'leave' ? '목록에서 뺐어요 · 일행들의 방은 그대로예요' : '삭제했어요');
      return;
    }
    UI.close();
    TL.App.goHome();
    UI.toast('방을 삭제하는 중…', 4000);
    Store.destroyTrip(trip.id).then(function () {
      UI.toast('방을 완전히 삭제했어요 · 초대 링크도 더 이상 쓸 수 없어요', 4000);
    }, function (e) {
      if (e && e.code === 'need-login') { UI.requireLogin('로그인하면 여행을 삭제할 수 있어요'); return; }
      UI.toast('방을 삭제하지 못했어요 · 네트워크를 확인하고 다시 시도해 주세요', 4000);
    });
  };

  A['add-member-chip'] = function () {
    var el = document.getElementById('member-new');
    var v = el ? el.value.trim() : '';
    if (!v) { if (el) el.focus(); UI.toast('일행 이름을 입력해 주세요'); return; }
    if (v.length > 12) { UI.toast('이름은 12자까지 쓸 수 있어요'); return; }
    if (dlg.members.some(function (m) { return m.name === v; })) { UI.toast('이미 있는 이름이에요'); if (el) el.select(); return; }
    var m = { id: Core.uid('m'), name: v };
    dlg.members.push(m);
    if (!dlg.meId) dlg.meId = m.id;
    if (el) { el.value = ''; el.focus(); }
    refreshMemberList();
  };
  A['del-member-chip'] = function (el) {
    var id = el.getAttribute('data-id');
    if (dlg.members.length <= 1) { UI.toast('최소 한 명은 필요해요'); return; }
    dlg.members = dlg.members.filter(function (m) { return m.id !== id; });
    if (dlg.meId === id) dlg.meId = dlg.members[0].id;
    refreshMemberList();
  };

  /* ------------------------------------------------- 달력(기간 선택) */
  A['cal-toggle'] = function () {
    cal.open = !cal.open;
    if (cal.open) cal.month = Core.monthKeyOf(cal.start || Core.todayISO());
    renderRangeField();
  };
  A['cal-prev'] = function () { cal.month = Core.shiftMonth(cal.month, -1); renderRangeField(); };
  A['cal-next'] = function () { cal.month = Core.shiftMonth(cal.month, 1); renderRangeField(); };
  A['cal-pick'] = function (el) {
    var d = el.getAttribute('data-date');
    if (!Core.isISODate(d)) return;
    if (!cal.start || (cal.start && cal.end)) {
      cal.start = d;
      cal.end = '';
    } else if (d < cal.start) {
      cal.end = cal.start;
      cal.start = d;
    } else {
      cal.end = d;
    }
    cal.month = Core.monthKeyOf(d);
    if (cal.end) cal.open = false;
    renderRangeField();
  };
  A['cal-preset'] = function (el) {
    var n = Number(el.getAttribute('data-nights')) || 0;
    var base = Core.isISODate(cal.start) ? cal.start : Core.todayISO();
    var end = Core.addDays(base, n);
    cal.start = base;
    cal.end = end;
    cal.open = false;
    cal.month = Core.monthKeyOf(base);
    renderRangeField();
    UI.toast('기간을 ' + Core.stayLabel(base, end) + '로 정했어요');
  };

  /* ========================================================== 일행 관리 */
  function memRows(trip) {
    var me = Store.meId(trip, null);
    var canManage = Core.canManageMembers(trip, TL.Auth && TL.Auth.currentUser ? TL.Auth.currentUser() : null);
    return (trip.members || []).map(function (m) {
      var st = Store.memberStats(trip, m.id);
      var sub = (st.paidCount ? '결제 ' + st.paidCount + '건 · ' + Core.won(st.paidSum) : '결제 없음') +
        (st.checkCount ? ' · 준비물 ' + st.checkCount + '개' : '');
      if (m.email) sub = m.email + ' · ' + sub;
      if (mem.editing === m.id) {
        return '<div class="mrow editing" data-id="' + UI.esc(m.id) + '">' + UI.avatar(m.name, 'lg') +
          '<input class="input" id="mem-edit-input" value="' + UI.esc(m.name) + '" maxlength="12" autocomplete="off">' +
          '<button class="icon-btn sm" data-action="mem-save" data-id="' + UI.esc(m.id) + '" aria-label="이름 저장">' + UI.icon('check') + '</button>' +
          '<button class="icon-btn sm" data-action="mem-cancel" aria-label="취소">' + UI.icon('close') + '</button>' +
        '</div>';
      }
      return '<div class="mrow" data-id="' + UI.esc(m.id) + '">' +
        '<button type="button" class="mem-main" data-action="mem-set-me" data-id="' + UI.esc(m.id) + '" aria-label="' + UI.esc(m.name) + ' 내 이름으로 지정">' +
          UI.avatar(m.name, 'lg') +
          '<span class="tx"><b>' + UI.esc(m.name) + (m.id === me ? ' <span class="me-tag">나</span>' : '') +
            (m.uid && m.id !== me ? ' <span class="linked-tag">계정 연결</span>' : '') + '</b><small>' + UI.esc(sub) + '</small></span>' +
        '</button>' +
        (canManage
          ? '<button class="icon-btn sm" data-action="mem-edit" data-id="' + UI.esc(m.id) + '" aria-label="' + UI.esc(m.name) + ' 이름 수정">' + UI.icon('edit', 16) + '</button>' +
            '<button class="icon-btn sm danger" data-action="mem-del" data-id="' + UI.esc(m.id) + '" aria-label="' + UI.esc(m.name) + ' 삭제">' + UI.icon('trash', 16) + '</button>'
          : '') +
      '</div>';
    }).join('');
  }
  function refreshMemRows() {
    var el = document.getElementById('mem-rows');
    if (el && mem.trip) el.innerHTML = memRows(mem.trip);
    UI.refresh();
  }
  function isMemberOwner(trip) {
    return Core.canManageMembers(trip, TL.Auth && TL.Auth.currentUser ? TL.Auth.currentUser() : null);
  }
  D.members = function (trip) {
    if (!trip) return;
    mem = { trip: trip, editing: '' };
    var canManage = isMemberOwner(trip);
    var html = '<div class="note">이름을 누르면 <b>내 이름</b>으로 지정돼요. 내가 결제자 기본값이 되고 정산에 ‘나’로 쓰여요.</div>' +
      '<div class="mem-rows" id="mem-rows">' + memRows(trip) + '</div>';
    if (canManage) {
      html += '<div class="inline-add" style="margin-top:12px"><input class="input" id="mem-new" placeholder="일행 이름 (예: 아내)" maxlength="12" autocomplete="off" enterkeyhint="done">' +
        '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="mem-add">' + UI.icon('plus', 16) + '추가</button></div>' +
        '<div class="inline-add" style="margin-top:8px"><input class="input" id="mem-email" type="email" inputmode="email" placeholder="이메일 (선택) · 그 사람 계정과 연결" autocomplete="off"></div>' +
        '<div class="hintline">이메일을 넣으면 그 사람이 이 계정으로 로그인했을 때 자동으로 이 일행으로 연결돼요.</div>' +
        '<div class="hintline">실시간 공유 중이면 이름 변경과 추가가 일행 모두에게 보여요.</div>';
    } else {
      html += '<div class="lock-note">' + UI.icon('lock', 16) + '<span><b>방장만 일행을 추가·수정·삭제할 수 있어요.</b><br>' +
        '내 이름은 위 목록에서 눌러 지정할 수 있어요.</span></div>';
    }
    html += '<div class="sheet-foot"><button class="btn btn-primary" data-action="close-modal">완료</button></div>';
    open(html, '일행 관리');
  };
  A['mem-add'] = function () {
    var trip = mem.trip;
    var el = document.getElementById('mem-new');
    var mailEl = document.getElementById('mem-email');
    var v = el ? el.value.trim() : '';
    var email = mailEl ? mailEl.value.trim() : '';
    if (!trip) return;
    if (!UI.requireLogin('로그인하면 일행을 추가할 수 있어요')) return;
    if (!isMemberOwner(trip)) { UI.toast('방장만 일행을 추가·수정·삭제할 수 있어요', 2800); return; }
    if (!v) { if (el) el.focus(); UI.toast('일행 이름을 입력해 주세요'); return; }
    if (v.length > 12) { UI.toast('이름은 12자까지 쓸 수 있어요'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (mailEl) mailEl.focus(); UI.toast('이메일 주소를 확인해 주세요'); return; }
    var m = Store.addMember(trip.id, v, email);
    if (!m) { UI.toast('일행을 추가하지 못했어요 · 이름을 확인해 주세요'); return; }
    if (el) { el.value = ''; el.focus(); }
    if (mailEl) mailEl.value = '';
    refreshMemRows();
    UI.toast(m.name + (m.email ? ' · ' + m.email + ' 연결' : '') + ' 추가했어요', 2600);
  };
  A['mem-set-me'] = function (el) {
    var trip = mem.trip;
    var id = el.getAttribute('data-id');
    if (!trip) return;
    Store.setMeMember(trip.id, id);
    var m = Store.myMember(trip);
    if (m) { Store.setNickname(m.name); UI.toast(m.name + ' 님으로 설정했어요'); }
    refreshMemRows();
  };
  A['mem-edit'] = function (el) {
    mem.editing = el.getAttribute('data-id');
    refreshMemRows();
    var input = document.getElementById('mem-edit-input');
    if (input) { input.focus(); input.select(); }
  };
  A['mem-cancel'] = function () { mem.editing = ''; refreshMemRows(); };
  A['mem-save'] = function (el) {
    var trip = mem.trip;
    var id = el.getAttribute('data-id');
    var input = document.getElementById('mem-edit-input');
    if (!trip || !id) return;
    var r = Store.renameMember(trip.id, id, input ? input.value : '');
    if (!r.ok) { UI.toast(r.error); if (input) input.focus(); return; }
    mem.editing = '';
    refreshMemRows();
    UI.toast('이름을 바꿨어요');
  };
  A['mem-del'] = function (el) {
    var trip = mem.trip;
    var id = el.getAttribute('data-id');
    if (!trip) return;
    var m = (trip.members || []).filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var st = Store.memberStats(trip, id);
    var msg = '“' + m.name + '” 님을 일행에서 뺄까요?';
    if (st.paidCount) msg += '\n결제한 지출 ' + st.paidCount + '건은 다른 일행에게로 옮겨요.';
    if (!confirm(msg)) return;
    var r = Store.removeMember(trip.id, id);
    if (!r.ok) { UI.toast(r.error); return; }
    refreshMemRows();
    UI.toast('일행에서 뺐어요');
  };

  /* ====================================================== 나는 누구인가요 */
  D.whoAmI = function (trip) {
    if (!trip) return;
    mem = { trip: trip, editing: '' };
    var ms = trip.members || [];
    var nick = Store.settings().nickname;
    var html = '<div class="note">일행 목록에서 나를 골라 주세요. 결제자와 정산이 내 기준으로 계산돼요.</div>';
    if (ms.length) {
      html += '<div class="who-list" id="who-list">' + ms.map(function (m) {
        return '<button type="button" class="mpick" data-action="who-pick" data-id="' + UI.esc(m.id) + '">' +
          UI.avatar(m.name) + UI.esc(m.name) + '</button>';
      }).join('') + '</div>';
    }
    html += '<div class="form-row mt12"><label class="fl">목록에 없어요 · 새 일행으로 합류</label>' +
      '<div class="inline-add" style="margin-top:0"><input class="input" id="who-new" placeholder="내 이름" maxlength="12" value="' + UI.esc(nick) + '" autocomplete="off">' +
      '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="who-join">합류</button></div></div>' +
      '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">나중에</button></div>';
    open(html, '나는 누구인가요?');
  };
  D.maybeWhoAmI = function (trip) {
    if (!trip || !(trip.members || []).length) return false;
    var explicit = (Store.state().meByTrip || {})[trip.id];
    if (explicit && (trip.members || []).some(function (m) { return m.id === explicit; })) return false;
    var nick = Store.settings().nickname;
    if (nick && (trip.members || []).some(function (m) { return m.name === nick; })) return false;
    D.whoAmI(trip);
    return true;
  };
  A['who-pick'] = function (el) {
    var trip = mem.trip;
    var id = el.getAttribute('data-id');
    if (!trip) return;
    Store.setMeMember(trip.id, id);
    Store.linkMe(trip.id, id);   // 이 일행에 내 계정(uid·이메일)을 연결해 본인 확인이 되게 한다
    var m = Store.myMember(trip);
    if (m) {
      if (!Store.settings().nickname) Store.setNickname(m.name);
      UI.toast(m.name + ' 님으로 설정했어요');
    }
    UI.close();
  };
  A['who-join'] = function () {
    var trip = mem.trip;
    var el = document.getElementById('who-new');
    var v = el ? el.value.trim() : '';
    if (!trip) return;
    if (!UI.requireLogin('로그인해야 여행에 참여할 수 있어요')) return;
    if (!v) { if (el) el.focus(); UI.toast('이름을 입력해 주세요'); return; }
    var m = Store.joinAsMember(trip.id, { name: v });
    if (!m) { UI.toast('이름을 다시 확인해 주세요'); return; }
    Store.setMeMember(trip.id, m.id);
    Store.setNickname(m.name);
    UI.close();
    UI.toast(v + ' 님으로 합류했어요');
  };
  /** 초대 링크로 들어온 로그인 사용자: 이메일·이름으로 나를 찾거나 새로 합류시킨다 */
  D.joinSelf = function (trip, name) {
    if (!trip || !Store.signedIn()) return null;
    var acct = TL.Auth.currentUser();
    var found = null;
    (trip.members || []).forEach(function (m) { if (!found && Core.memberMatches(m, acct)) found = m; });
    if (!found) {
      var nick = String(name || '').trim() || Store.settings().nickname || Core.accountLabel(acct);
      (trip.members || []).forEach(function (m) { if (!found && m.name === nick) found = m; });
    }
    var m = found || Store.joinAsMember(trip.id, { name: name || '' });
    if (m) {
      Store.setMeMember(trip.id, m.id);
      Store.linkMe(trip.id, m.id);
    }
    return m;
  };

  /* ============================================================== 일정 */
  function P() { return TL.Places || {}; }

  /* ---- 시·분 고르기 (터치 한두 번) ---- */
  var MIN_CHIPS = [0, 10, 15, 20, 30, 40, 45, 50];
  function minuteText(m) { return (m < 10 ? '0' : '') + m; }
  D.timePickHtml = function (value) {
    var p = Core.timeParts(value);
    var hasHour = p.hour != null;
    var summary = hasHour ? Core.hourLabel(p.hour) + ' ' + p.minute + '분' : '시간 미정';
    var html = '<div class="time-pick" id="time-pick">';
    html += '<div class="tp-sum"><span class="tp-val" id="tp-val">' + UI.esc(summary) + '</span>' +
      '<button type="button" class="btn xs btn-ghost" data-action="time-clear">미정</button></div>';
    html += '<div class="tp-group"><span class="tp-label">시</span><div class="tp-chips tp-hours">';
    for (var h = 0; h < 24; h++) {
      html += '<button type="button" class="tp-chip' + (hasHour && p.hour === h ? ' active' : '') + '" ' +
        'data-action="time-hour" data-h="' + h + '" aria-label="' + Core.hourLabel(h) + '시" ' +
        'title="' + Core.hourLabel(h) + '">' + (h < 10 ? '0' : '') + h + '</button>';
    }
    html += '</div></div>';
    html += '<div class="tp-group"><span class="tp-label">분</span><div class="tp-chips tp-mins">';
    MIN_CHIPS.forEach(function (m) {
      html += '<button type="button" class="tp-chip' + (hasHour && p.minute === m ? ' active' : '') + '" ' +
        'data-action="time-min" data-m="' + m + '" aria-label="' + m + '분">' + minuteText(m) + '</button>';
    });
    html += '</div></div>';
    html += '<input class="input tp-input" type="text" inputmode="numeric" id="f_time" maxlength="5" ' +
      'placeholder="직접 입력 예: 09:30" value="' + UI.esc(value || '') + '">';
    html += '<div class="hintline">시·분을 누르면 바로 채워져요. 직접 입력도 돼요(비우면 시간 미정).</div>';
    html += '</div>';
    return html;
  };
  /** 칩·요약 문구를 현재 f_time 값에 맞춰 갱신 (입력 중에는 HTML을 갈아끼우지 않는다) */
  D.syncTimePick = function () {
    var val = UI.val('f_time');
    var p = Core.timeParts(val);
    var sum = document.getElementById('tp-val');
    if (sum) sum.textContent = p.hour != null ? Core.hourLabel(p.hour) + ' ' + p.minute + '분' : '시간 미정';
    var hours = document.querySelectorAll('.tp-hours .tp-chip');
    for (var i = 0; i < hours.length; i++) {
      var h = Number(hours[i].getAttribute('data-h'));
      if (p.hour != null && h === p.hour) hours[i].classList.add('active');
      else hours[i].classList.remove('active');
    }
    var mins = document.querySelectorAll('.tp-mins .tp-chip');
    for (var j = 0; j < mins.length; j++) {
      var m = Number(mins[j].getAttribute('data-m'));
      if (p.hour != null && m === p.minute) mins[j].classList.add('active');
      else mins[j].classList.remove('active');
    }
  };
  function setTimeValue(t) {
    var el = document.getElementById('f_time');
    if (el) el.value = t;
    D.syncTimePick();
  }
  A['time-hour'] = function (el) {
    var h = Number(el.getAttribute('data-h'));
    var p = Core.timeParts(UI.val('f_time'));
    var m = p.hour == null ? 0 : p.minute;
    setTimeValue(Core.makeTime(h, m));
  };
  A['time-min'] = function (el) {
    var m = Number(el.getAttribute('data-m'));
    var p = Core.timeParts(UI.val('f_time'));
    var h = p.hour == null ? 9 : p.hour;   // 분만 골랐으면 오전 9시부터
    setTimeValue(Core.makeTime(h, m));
  };
  A['time-clear'] = function () { setTimeValue(''); };

  function srcLabel(src) {
    return src === 'osm' ? 'OSM' : src === 'kakao' ? '카카오' : src === 'map' ? '지도' : src === 'coord' ? '좌표' : '직접';
  }
  function pickedHtml(p) {
    if (!p) return '';
    var geo = Core.hasGeo(p) ? Core.coordLabel(p.lat, p.lng) : '';
    var sub = [p.address || '', geo].filter(Boolean).join(' · ');
    return '<span class="pp-dot">' + UI.icon('pin', 14) + '</span>' +
      '<span class="pp-tx"><b>' + UI.esc(p.name || (geo ? '지도에서 고른 위치' : '')) + '</b>' +
      (sub ? '<small>' + UI.esc(sub) + '</small>' : '') + '</span>' +
      '<span class="pp-src">' + srcLabel(p.source) + '</span>' +
      '<button type="button" class="icon-btn sm" data-action="pl-clear" aria-label="장소 선택 해제">' + UI.icon('close', 15) + '</button>';
  }

  /** 지도에서 위치 찍기 · 지도 링크/좌표 붙여넣기 (v22) */
  function coordBoxHtml(p) {
    var has = p && Core.hasGeo(p);
    var src = (dlg && dlg.pinSource) || 'google';
    return '<div class="coord-box">' +
      '<div class="pl-head"><span class="fl">지도에서 위치</span><span class="pl-modes">' +
        Core.mapSourceKeys.map(function (k) {
          return '<button type="button" class="pl-mode' + (src === k ? ' active' : '') + '" data-action="pin-src" data-src="' + k + '">' +
            Core.mapSource(k).label + '</button>';
        }).join('') +
      '</span></div>' +
      '<div class="inline-add" style="margin-top:0">' +
        '<input class="input" id="f_coord" placeholder="지도 공유 링크 또는 좌표 (예: -8.65,115.13)" autocomplete="off" enterkeyhint="done">' +
        '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="use-coord">적용</button>' +
      '</div>' +
      '<div class="coord-line"><span id="coord-status">' +
        (has ? '📍 ' + UI.esc(Core.coordLabel(p.lat, p.lng)) : '아직 위치를 고르지 않았어요') + '</span>' +
        '<button type="button" class="btn xs btn-ghost" data-action="pin-toggle" aria-expanded="' + (dlg && dlg.pinOpen ? 'true' : 'false') + '">' +
          (dlg && dlg.pinOpen ? '지도 접기' : '📍 지도에서 위치 찍기') + '</button></div>' +
      '<div class="pin-map' + (dlg && dlg.pinOpen ? '' : ' hide') + '" id="pin-map"></div>' +
      '<div class="hintline">지도를 눌러 핀을 놓으면 위·경도가 채워져요. 구글·카카오·네이버 지도 공유 링크를 붙여넣어도 되고, 이름 검색이 안 되는 해외에서 편해요.</div>' +
    '</div>';
  }

  function placeBoxHtml(p) {
    var mode = P().mode || 'auto';
    var modes = [['auto', '자동'], ['kakao', '카카오'], ['osm', '해외 OSM']];
    return '<div class="place-box">' +
      '<div class="pl-head"><span class="fl">장소 검색</span><span class="pl-modes">' +
        modes.map(function (m) {
          return '<button type="button" class="pl-mode' + (mode === m[0] ? ' active' : '') + '" data-action="pl-mode" data-mode="' + m[0] + '">' + m[1] + '</button>';
        }).join('') +
      '</span></div>' +
      '<div class="inline-add" style="margin-top:0">' +
        '<input class="input" id="pl_q" placeholder="예: 강남역 · 도톤보리 · Namba" autocomplete="off" enterkeyhint="search">' +
        '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="pl-search">검색</button>' +
      '</div>' +
      '<div id="pl-results" class="pl-results"></div>' +
      '<div id="pl-picked" class="pl-picked' + (p ? '' : ' hide') + '">' + pickedHtml(p) + '</div>' +
      '<div class="hintline">국내는 카카오, 해외는 OpenStreetMap. 검색이 안 되면 직접 입력해도 돼요.</div>' +
    '</div>';
  }

  D.renderPlaceResults = function (out) {
    var box = document.getElementById('pl-results');
    if (!box) return;
    if (!out) { box.innerHTML = ''; return; }
    if (!out.results || !out.results.length) {
      box.innerHTML = '<div class="hintline">' + UI.esc(out.note || '결과가 없어요') + '</div>';
      return;
    }
    dlg.results = out.results;
    var render = P().resultHtml || function (r) {
      return '<span class="pl-main"><b>' + UI.esc(r.name) + '</b><small>' + UI.esc(r.address) + '</small></span>';
    };
    box.innerHTML = (out.note ? '<div class="hintline">' + UI.esc(out.note) + '</div>' : '') +
      out.results.map(function (r, i) {
        return '<button type="button" class="pl-row" data-action="pl-pick" data-idx="' + i + '">' + render(r) + '</button>';
      }).join('');
  };

  D.schedule = function (trip, id, dayKey) {
    var item = null;
    ((trip.data && trip.data.schedules) || []).forEach(function (s) { if (s.id === id) item = s; });
    if (id && !item) { UI.toast('일정을 찾을 수 없어요'); return; }
    dlg = {
      kind: 'schedule', id: id || null, trip: trip, results: null,
      pinSource: Core.mapSource((dlg && dlg.pinSource) || 'google').key, pinOpen: false,
      picked: item && (Core.hasGeo(item) || item.placeName || item.address)
        ? {
          name: item.placeName || item.place || item.title || '', address: item.address || '',
          lat: item.lat, lng: item.lng, url: item.placeUrl || '', source: item.source || ''
        }
        : null
    };
    D.trip = trip;
    var day = item ? item.dayKey : (dayKey || TL.App.view.day || 'd1');
    var html = '';
    html += placeBoxHtml(dlg.picked);
    html += coordBoxHtml(dlg.picked);
    html += '<div class="form-row"><label class="fl">날짜</label><select class="input" id="f_day">' +
      Core.dayList(trip).map(function (d) {
        return '<option value="' + d.key + '"' + (d.key === day ? ' selected' : '') + '>' + d.label +
          (d.date ? ' · ' + Core.isoLabel(d.date) : ' (출발 전)') + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="form-row"><label class="fl">시간 <span style="font-weight:500">(선택)</span></label>' +
      D.timePickHtml(item && item.time || '') + '</div>';
    html += '<div class="form-row"><label class="fl">카테고리</label><select class="input" id="f_cat">' +
      Core.SCHED_CATS.map(function (c) {
        return '<option value="' + c.key + '"' + (item && item.category === c.key ? ' selected' : '') + '>' + c.label + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="form-row"><label class="fl">일정 이름</label>' +
      '<input class="input" id="f_title" placeholder="예: 도톤보리 산책" maxlength="60" value="' + UI.esc(item ? item.title : '') + '"></div>';
    html += '<div class="form-row"><label class="fl">지도에 검색할 장소명 <span style="font-weight:500">(선택)</span></label>' +
      '<input class="input" id="f_place" placeholder="비우면 위 이름으로 검색해요" maxlength="60" value="' + UI.esc(item ? (item.place || '') : '') + '"></div>';
    html += '<div class="form-row"><label class="fl">메모</label>' +
      '<textarea class="input" id="f_memo" placeholder="예약 시간, 팁, 챙길 것" maxlength="300">' + UI.esc(item ? (item.memo || '') : '') + '</textarea></div>';
    if (item) {
      html += '<div class="form-row"><label class="fl">다른 날로</label>' +
        '<div class="inline-add" style="margin-top:0">' +
          '<select class="input" id="f_to_day">' + Core.dayList(trip).filter(function (d) { return d.key !== item.dayKey; }).map(function (d) {
            return '<option value="' + d.key + '">' + d.label + (d.date ? ' · ' + Core.isoLabel(d.date) : ' (출발 전)') + '</option>';
          }).join('') + '</select>' +
          '<button type="button" class="btn btn-soft" style="width:auto;height:44px;padding:0 12px;flex:none" data-action="sched-move-day">이동</button>' +
          '<button type="button" class="btn btn-ghost" style="width:auto;height:44px;padding:0 12px;flex:none" data-action="sched-copy-day">복사</button>' +
        '</div>' +
        '<div class="hintline">이동하면 이 날에서 빠지고, 복사하면 원본이 남아요.</div>' +
      '</div>';
    }
    html += '<div class="sheet-foot">' +
      (item ? '<button class="btn btn-danger" data-action="del-schedule" data-id="' + UI.esc(item.id) + '">삭제</button>' : '') +
      '<button class="btn btn-primary" data-action="save-schedule">' + (item ? '저장' : '추가') + '</button></div>';
    open(html, item ? '일정 수정' : '일정 추가');
  };

  A['pl-mode'] = function (el) {
    var m = el.getAttribute('data-mode');
    if (!TL.Places) return;
    TL.Places.mode = m;
    UI.$$('.pl-mode').forEach(function (b) { b.classList.toggle('active', b === el); });
  };
  A['pl-search'] = function () {
    var qEl = document.getElementById('pl_q');
    var q = qEl ? qEl.value.trim() : '';
    var box = document.getElementById('pl-results');
    if (!q) { if (qEl) qEl.focus(); UI.toast('장소 이름을 입력해 주세요'); return; }
    if (!TL.Places) { UI.toast('장소 검색을 쓸 수 없어요'); return; }
    if (box) box.innerHTML = '<div class="pl-loading">검색 중…</div>';
    TL.Places.search(q).then(function (out) {
      D.renderPlaceResults(out);
      if (!out.results.length && out.note) UI.toast(out.note, 3000);
    }).catch(function (e) {
      D.renderPlaceResults({ results: [], note: (e && e.message) || '검색에 실패했어요' });
    });
  };
  A['pl-pick'] = function (el) {
    var i = Number(el.getAttribute('data-idx'));
    var r = (dlg.results || [])[i];
    if (!r) return;
    dlg.picked = { name: r.name, address: r.address, lat: r.lat, lng: r.lng, url: r.url, source: r.source };
    var chip = document.getElementById('pl-picked');
    if (chip) { chip.innerHTML = pickedHtml(dlg.picked); chip.classList.remove('hide'); }
    var titleEl = document.getElementById('f_title');
    if (titleEl && !titleEl.value.trim()) titleEl.value = r.name;
    var placeEl = document.getElementById('f_place');
    if (placeEl) placeEl.value = r.name;
    UI.$$('.pl-row').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
    UI.toast(r.name + ' 선택');
  };
  A['pl-clear'] = function () {
    dlg.picked = null;
    var chip = document.getElementById('pl-picked');
    if (chip) { chip.innerHTML = ''; chip.classList.add('hide'); }
    var st = document.getElementById('coord-status');
    if (st) st.textContent = '아직 위치를 고르지 않았어요';
  };

  /* ------------------------------------------ v22: 지도에서 위치 찍기 */
  function applyCoord(lat, lng, opts) {
    opts = opts || {};
    if (!dlg || dlg.kind !== 'schedule') return false;
    var a = Number(lat), b = Number(lng);
    if (!Core.validLatLng(a, b)) return false;
    var name = (dlg.picked && dlg.picked.name) || opts.name || '';
    if (!dlg.picked || !Core.hasGeo(dlg.picked)) {
      dlg.picked = { name: name, address: '', lat: a, lng: b, url: '', source: 'map' };
    } else {
      dlg.picked.lat = a;
      dlg.picked.lng = b;
      dlg.picked.source = 'map';
    }
    var st = document.getElementById('coord-status');
    if (st) st.textContent = '📍 ' + Core.coordLabel(a, b);
    var chip = document.getElementById('pl-picked');
    if (chip) { chip.innerHTML = pickedHtml(dlg.picked); chip.classList.remove('hide'); }
    var placeEl = document.getElementById('f_place');
    if (placeEl && !placeEl.value.trim()) placeEl.value = dlg.picked.name || '';
    // 역지오코딩: 이름·주소를 채워 준다 (실패해도 좌표는 남는다)
    if (TL.Places && TL.Places.reverse) {
      TL.Places.reverse(a, b).then(function (r) {
        if (!r || !dlg || dlg.kind !== 'schedule' || !dlg.picked) return;
        if (Math.abs(Number(dlg.picked.lat) - a) > 1e-6 || Math.abs(Number(dlg.picked.lng) - b) > 1e-6) return;
        if (!dlg.picked.name) dlg.picked.name = r.name || '';
        if (!dlg.picked.address) dlg.picked.address = r.address || '';
        var chip2 = document.getElementById('pl-picked');
        if (chip2) { chip2.innerHTML = pickedHtml(dlg.picked); chip2.classList.remove('hide'); }
        var titleEl = document.getElementById('f_title');
        if (titleEl && !titleEl.value.trim() && r.name) titleEl.value = r.name;
        var placeEl2 = document.getElementById('f_place');
        if (placeEl2 && !placeEl2.value.trim() && r.name) placeEl2.value = r.name;
      }).catch(function () {});
    }
    return true;
  }
  /** QA·단위 테스트용: 지도를 누른 것과 같은 경로 */
  D.testPickAt = function (lat, lng) { return applyCoord(lat, lng); };

  function paintPicker() {
    var box = document.getElementById('pin-map');
    if (!box || !dlg || !dlg.pinOpen) return;
    if (!TL.RouteMap || !TL.RouteMap.pickMap) {
      box.innerHTML = '<div class="pin-note">지도를 쓸 수 없어요. 위 칸에 좌표를 붙여넣어 주세요.</div>';
      return;
    }
    var p = dlg.picked;
    box.innerHTML = '';
    TL.RouteMap.pickMap(box, {
      source: dlg.pinSource || 'google',
      lat: p && Core.hasGeo(p) ? p.lat : null,
      lng: p && Core.hasGeo(p) ? p.lng : null,
      onPick: function (lat, lng) {
        applyCoord(lat, lng);
        UI.toast('위치를 잡았어요 · ' + Core.coordLabel(lat, lng), 1800);
      }
    }).catch(function (e) {
      if (!box) return;
      box.innerHTML = '<div class="pin-note">' + UI.esc((e && e.message) || '지도를 여지 못했어요') +
        '<br>위 칸에 좌표를 붙여넣어도 돼요.</div>';
    });
  }

  A['pin-toggle'] = function (el) {
    if (!dlg || dlg.kind !== 'schedule') return;
    var box = document.getElementById('pin-map');
    dlg.pinOpen = !dlg.pinOpen;
    if (el) {
      el.setAttribute('aria-expanded', dlg.pinOpen ? 'true' : 'false');
      el.textContent = dlg.pinOpen ? '지도 접기' : '📍 지도에서 위치 찍기';
    }
    if (!box) return;
    if (!dlg.pinOpen) {
      box.classList.add('hide');
      if (TL.RouteMap && TL.RouteMap.closePicker) TL.RouteMap.closePicker();
      return;
    }
    box.classList.remove('hide');
    paintPicker();
  };
  A['pin-src'] = function (el) {
    if (!dlg || dlg.kind !== 'schedule') return;
    dlg.pinSource = Core.mapSource(el.getAttribute('data-src')).key;
    UI.$$('[data-action="pin-src"]').forEach(function (b) { b.classList.toggle('active', b === el); });
    if (dlg.pinOpen) {
      if (TL.RouteMap && TL.RouteMap.closePicker) TL.RouteMap.closePicker();
      paintPicker();
    }
  };
  A['use-coord'] = function () {
    if (!dlg || dlg.kind !== 'schedule') return;
    var raw = UI.val('f_coord');
    var c = Core.parseCoords(raw);
    if (!c) {
      UI.toast('좌표를 찾지 못했어요 · 예: -8.65,115.13 또는 구글지도 링크', 3000);
      return;
    }
    applyCoord(c.lat, c.lng, { source: c.source });
    if (dlg.pinOpen && TL.RouteMap && TL.RouteMap.recenterPick) TL.RouteMap.recenterPick(c.lat, c.lng);
    UI.toast('위치를 잡았어요 · ' + Core.coordLabel(c.lat, c.lng), 2200);
  };

  A['save-schedule'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) { UI.toast('여행 정보를 찾을 수 없어요'); return; }
    var title = UI.val('f_title').trim();
    if (!title && dlg.picked) title = dlg.picked.name;
    if (!title) { UI.toast('장소나 일정 이름을 입력해 주세요'); return; }
    var manualPlace = UI.val('f_place').trim();
    var p = dlg.picked;
    var payload = {
      dayKey: UI.val('f_day') || 'prep',
      time: Core.normTime(UI.val('f_time')),
      title: title,
      category: UI.val('f_cat') || 'etc',
      place: p ? p.name : manualPlace,
      placeName: p ? p.name : '',
      address: p ? (p.address || '') : '',
      placeUrl: p ? (p.url || '') : '',
      lat: p ? Number(p.lat) : null,
      lng: p ? Number(p.lng) : null,
      source: p ? (p.source || '') : '',
      memo: UI.val('f_memo').trim()
    };
    TL.App.view.day = payload.dayKey;
    var saved = dlg.id ? Store.update(trip.id, 'schedules', dlg.id, payload) : Store.add(trip.id, 'schedules', payload);
    if (!saved) {
      var deny = Store.takeError();
      UI.close();
      UI.denyToast(deny || 'login');
      return;
    }
    var pairs = Core.overlapPairs(Core.sortedSchedules(trip.data, payload.dayKey))
      .filter(function (x) { return saved && (x.aId === saved.id || x.bId === saved.id); });
    UI.close();
    if (pairs.length) {
      UI.toast((dlg.id ? '수정했어요' : '일정을 추가했어요') + ' · 시간이 겹치는 일정이 ' + pairs.length + '개 있어요', 3400);
    } else {
      UI.toast(dlg.id ? '수정했어요' : '일정을 추가했어요');
    }
  };

  /* 다른 날로 이동/복사 */
  A['sched-move-day'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    var to = UI.val('f_to_day');
    if (!trip || !dlg.id || !to) return;
    TL.App.view.day = to;
    Store.moveScheduleToDay(trip.id, dlg.id, to);
    UI.close();
    UI.toast(Core.dayLabel(trip, to) + '로 옮겼어요');
  };
  A['sched-copy-day'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    var to = UI.val('f_to_day');
    if (!trip || !dlg.id || !to) return;
    TL.App.view.day = to;
    var copy = Store.copySchedule(trip.id, dlg.id, to);
    UI.close();
    UI.toast(copy ? Core.dayLabel(trip, to) + '에 복사했어요' : '복사하지 못했어요');
  };

  /** 카드의 복사 버튼 → 날짜 고르기 시트 */
  D.dayPicker = function (trip, id, mode) {
    var item = null;
    ((trip.data && trip.data.schedules) || []).forEach(function (s) { if (s.id === id) item = s; });
    if (!item) return;
    dlg = { kind: 'day-pick', id: id, trip: trip };
    D.trip = trip;
    var html = '<div class="note">“' + UI.esc(item.title) + '” 일정을 어느 날로 ' + (mode === 'move' ? '옮길까요?' : '복사할까요?') + '</div>' +
      '<div class="day-pick-list">' + Core.dayList(trip).filter(function (d) { return d.key !== item.dayKey; }).map(function (d) {
        return '<button class="day-pick" data-action="quick-day" data-day="' + d.key + '" data-mode="' + (mode || 'copy') + '">' +
          '<b>' + d.label + '</b><small>' + (d.date ? Core.isoLabel(d.date) : '출발 전') + '</small>' +
          UI.icon('swap', 16) + '</button>';
      }).join('') + '</div>' +
      '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">닫기</button></div>';
    open(html, mode === 'move' ? '다른 날로 이동' : '다른 날로 복사');
  };
  A['copy-schedule'] = function (el) {
    var trip = TL.App.currentTrip();
    if (trip) D.dayPicker(trip, el.getAttribute('data-id'), 'copy');
  };
  A['move-schedule-day'] = function (el) {
    var trip = TL.App.currentTrip();
    if (trip) D.dayPicker(trip, el.getAttribute('data-id'), 'move');
  };
  A['quick-day'] = function (el) {
    var trip = dlg.trip || TL.App.currentTrip();
    var day = el.getAttribute('data-day');
    var mode = el.getAttribute('data-mode');
    if (!trip || !dlg.id || !day) return;
    TL.App.view.day = day;
    if (mode === 'move') {
      Store.moveScheduleToDay(trip.id, dlg.id, day);
      UI.toast(Core.dayLabel(trip, day) + '로 옮겼어요');
    } else {
      Store.copySchedule(trip.id, dlg.id, day);
      UI.toast(Core.dayLabel(trip, day) + '에 복사했어요');
    }
    UI.close();
  };

  A['del-schedule'] = function (el) {
    var trip = tripOf() || TL.App.currentTrip();
    var id = el.getAttribute('data-id') || dlg.id;
    if (!trip || !id) return;
    if (!confirm('이 일정을 삭제할까요?')) return;
    Store.remove(trip.id, 'schedules', id);
    UI.close();
    UI.toast('삭제했어요');
  };

  /** v24: 그 날 일정을 시간순으로 (시간 없는 일정은 뒤로) — 드래그 순서는 누를 때만 바뀐다 */
  A['sort-day'] = function (el) {
    var trip = TL.App.currentTrip() || tripOf();   // 일정 화면의 여행이 기준 (다른 시트의 여행이 남아 있어도)
    if (!trip) return;
    if (!Store.canWrite()) { UI.denyToast('login'); return; }
    var day = el.getAttribute('data-day') || TL.App.view.day || 'd1';
    var before = Core.sortedSchedules(trip.data, day).map(function (s) { return s.id; }).join(',');
    var n = Store.sortDayByTime(trip.id, day);
    if (!n) { UI.toast('정렬할 일정이 없어요'); return; }
    var after = Core.sortedSchedules(trip.data, day).map(function (s) { return s.id; }).join(',');
    UI.toast(before === after ? '이미 시간순으로 정렬되어 있어요' : n + '개 일정을 시간순으로 정렬했어요');
  };

  /* ============================================================== 지출 */
  var rateFetch = { loading: false, error: '' };

  function rateStatusText() {
    var c = Store.rateCache();
    if (!c.fetchedAt) return '';
    return new Date(c.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  function setRateStatus(txt) {
    var el = document.getElementById('rate-status');
    if (el) el.textContent = txt;
  }

  /** 고른 통화의 환율을 자동으로 채운다 (캐시 12시간, 없으면 API 호출) */
  function applyAutoRate(cur, force) {
    var rateEl = document.getElementById('f_rate');
    if (cur === 'KRW') { setRateStatus('원화로 기록돼요'); return; }
    var cached = force ? 0 : Store.cachedAutoRate(cur);
    if (cached && rateEl) {
      rateEl.value = cached;
      setRateStatus('자동 환율 · ' + rateStatusText() + ' 기준');
      updateExpensePreview();
      return;
    }
    if (!rateEl) return;
    rateEl.value = Store.tripRate(tripOf(), cur);
    fetchRates(cur);
  }

  /** 고른 통화의 최신 환율을 받아 입력칸에 채운다 (v22: 30분 캐시 · Store가 한 번만 호출) */
  function fetchRates(cur) {
    var target = cur || UI.val('f_currency') || 'KRW';
    if (target === 'KRW') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setRateStatus('오프라인 · 기본 환율을 써요'); return; }
    if (rateFetch.loading) return;
    rateFetch.loading = true;
    setRateStatus('자동 환율 불러오는 중…');
    Store.fetchRates()
      .then(function (rates) {
        rateFetch.loading = false;
        var rateEl = document.getElementById('f_rate');
        var curNow = UI.val('f_currency') || 'KRW';
        if (!rates[target] && !rates[curNow]) throw new Error('환율을 읽지 못했어요');
        if (rateEl && curNow !== 'KRW' && rates[curNow] && !(dlg && dlg.rateManual)) {
          rateEl.value = rates[curNow];
          setRateStatus('자동 환율 · ' + rateStatusText() + ' 기준');
          updateExpensePreview();
        }
      })
      .catch(function (e) {
        rateFetch.loading = false;
        rateFetch.error = (e && e.message) || '실패';
        setRateStatus('자동 환율 실패 · 기본 환율을 써요');
      });
  }

  D.expense = function (trip, id) {
    var item = null;
    ((trip.data && trip.data.expenses) || []).forEach(function (e) { if (e.id === id) item = e; });
    if (id && !item) { UI.toast('지출을 찾을 수 없어요'); return; }
    var members = trip.members || [];
    var me = Store.meId(trip, members[0] && members[0].id);
    var dayKeys = Core.dayList(trip).map(function (d) { return d.key; });
    var wantDay = item ? item.dayKey : (TL.App.view.day && TL.App.view.day !== 'all' ? TL.App.view.day : 'd1');
    if (dayKeys.indexOf(wantDay) < 0) wantDay = dayKeys[dayKeys.length - 1] || 'prep';
    dlg = {
      kind: 'expense', id: id || null, trip: trip,
      sharedWith: item ? (item.sharedWith || []).slice() : members.map(function (m) { return m.id; }),
      payerId: item ? (item.payerId || me) : me,
      private: item ? !!item.private : false,
      chargedOn: !!(item && Number(item.chargedKRW) > 0),
      rateManual: false,
      dayKey: wantDay
    };
    D.trip = trip;
    var cur = item ? item.currency : (trip.baseCurrency || 'KRW');
    var rate = item ? (item.rate || Store.tripRate(trip, cur)) : Store.tripRate(trip, cur);
    var html = '';
    html += '<div class="form-row"><label class="fl">날짜</label><select class="input" id="f_day">' +
      Core.dayList(trip).map(function (d) {
        return '<option value="' + d.key + '"' + (d.key === dlg.dayKey ? ' selected' : '') + '>' + d.label +
          (d.date ? ' · ' + Core.isoLabel(d.date) : ' (출발 전)') + '</option>';
      }).join('') + '</select></div>';

    html += '<div class="form-row"><label class="fl">금액</label>' +
      '<div class="money-in"><input class="input" id="f_amount" inputmode="decimal" placeholder="0" value="' +
        (item ? item.amount : '') + '"><span class="cur" id="f_cur_label">' + Core.curInfo(cur).symbol + '</span></div>' +
      '<div class="input-row mt8">' +
        '<select class="input" id="f_currency" style="flex:1.1">' + Core.CURRENCIES.map(function (c) {
          return '<option value="' + c.code + '"' + (c.code === cur ? ' selected' : '') + '>' + c.code + ' ' + c.symbol + '</option>';
        }).join('') + '</select>' +
        '<div style="flex:1.4" id="rate-wrap"><input class="input" id="f_rate" inputmode="decimal" placeholder="환율" value="' +
          (cur === 'KRW' ? '' : rate) + '"' + (cur === 'KRW' ? ' disabled' : '') + '></div>' +
      '</div>' +
      '<div class="rate-line"><span class="tiny muted" id="rate-status">' + (cur === 'KRW' ? '원화로 기록돼요' : '1 ' + cur + ' = ' + rate + '원') + '</span>' +
        '<button type="button" class="btn xs btn-ghost" data-action="refresh-rate">' + (TL.UI.icon ? '자동 환율' : '환율') + '</button></div>' +
      '<div class="hintline" id="f_preview">' + (cur === 'KRW' ? '원화로 기록돼요' : '1 ' + cur + ' = ' + rate + '원 · 환율은 직접 고칠 수 있어요') + '</div>' +
    '</div>';

    html += '<div class="form-row"><label class="fl">카테고리</label><div class="opt-chips" id="cat-chips">' +
      Core.EXP_CATS.map(function (c) {
        return '<button class="opt' + ((item ? item.category : 'food') === c.key ? ' active' : '') + '" data-action="pick-exp-cat" data-cat="' + c.key + '">' +
          UI.icon(c.icon, 15) + c.label + '</button>';
      }).join('') + '</div></div>';

    html += '<div class="form-row"><label class="fl">내용 · 장소</label>' +
      '<input class="input" id="f_title" placeholder="예: 이치란 라멘" maxlength="50" value="' + UI.esc(item ? item.title : '') + '"></div>';

    html += '<div class="form-row"><label class="fl">결제한 사람</label><div class="members-pick" id="payer-pick">' +
      members.map(function (m) {
        return '<button class="mpick' + (m.id === dlg.payerId ? ' active' : '') + '" data-action="pick-payer" data-id="' + UI.esc(m.id) + '">' +
          UI.avatar(m.name) + UI.esc(m.name) + (m.id === me ? '<span class="me-tag">나</span>' : '') + '</button>';
      }).join('') + '</div></div>';

    html += '<div class="form-row"><label class="fl row between" style="display:flex">' +
      '<span>함께 쓴 사람</span>' +
      '<span class="row gap6"><button class="btn xs btn-ghost" data-action="shared-all">전체</button>' +
      '<button class="btn xs btn-ghost" data-action="shared-none">해제</button></span></label>' +
      '<div class="members-pick" id="shared-pick">' +
      members.map(function (m) {
        return '<button class="mpick' + (dlg.sharedWith.indexOf(m.id) >= 0 ? ' active' : '') + '" data-action="pick-shared" data-id="' + UI.esc(m.id) + '">' +
          UI.avatar(m.name) + UI.esc(m.name) + '<span class="ck">' + UI.icon('check', 11) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="hintline">선택한 사람에게 1/N로 나눠요. 아무도 없으면 전원에게 나눠요.</div></div>';

    html += '<div class="card flat" style="border:1px solid var(--line);padding:2px 13px;margin-bottom:12px">' +
      '<div class="switch-row"><span class="tx"><b>나만 보기</b><span>정산에서 빼고 내 지출로만 기록</span></span>' +
      '<button class="switch' + (dlg.private ? ' on' : '') + '" data-action="toggle-private" aria-label="나만 보기"></button></div></div>';

    html += '<div class="card flat' + (cur === 'KRW' ? ' hide' : '') + '" id="charged-block" style="border:1px solid var(--line);padding:2px 13px;margin-bottom:12px">' +
      '<div class="switch-row"><span class="tx"><b>카드 실청구액으로 덮어쓰기</b><span>실제 청구된 원화 금액으로 합계·정산을 계산해요</span></span>' +
      '<button class="switch' + (dlg.chargedOn ? ' on' : '') + '" data-action="toggle-charged" aria-label="카드 실청구액 사용"></button></div>' +
      '<div id="charged-wrap" class="charged-wrap' + (dlg.chargedOn ? '' : ' hide') + '">' +
        '<div class="money-in"><input class="input" id="f_charged" inputmode="numeric" placeholder="예: 36500" value="' +
          (item && item.chargedKRW ? item.chargedKRW : '') + '"><span class="cur">원</span></div>' +
        '<div class="hintline">외화 금액·통화는 그대로 남고, 합계와 정산만 실청구액 기준이 돼요.</div>' +
      '</div></div>';

    html += '<div class="form-row"><label class="fl">메모 <span style="font-weight:500">(선택)</span></label>' +
      '<input class="input" id="f_memo" placeholder="예: 3명 세트" maxlength="100" value="' + UI.esc(item ? (item.memo || '') : '') + '"></div>';

    html += '<div class="sheet-foot">' +
      (item ? '<button class="btn btn-danger" data-action="del-expense" data-id="' + UI.esc(item.id) + '">삭제</button>' : '') +
      '<button class="btn btn-primary" data-action="save-expense">' + (item ? '저장' : '추가') + '</button></div>';
    open(html, item ? '지출 수정' : '지출 추가');
    updateExpensePreview();
    if (!item && cur !== 'KRW') applyAutoRate(cur, false);
  };

  function updateExpensePreview() {
    var amountEl = document.getElementById('f_amount');
    var curEl = document.getElementById('f_currency');
    var rateEl = document.getElementById('f_rate');
    var prev = document.getElementById('f_preview');
    var lab = document.getElementById('f_cur_label');
    var rw = document.getElementById('rate-wrap');
    var chargedBlock = document.getElementById('charged-block');
    if (!amountEl || !curEl) return;
    var cur = curEl.value;
    if (lab) lab.textContent = Core.curInfo(cur).symbol;
    if (rw) rw.style.opacity = cur === 'KRW' ? '.45' : '1';
    if (rateEl) rateEl.disabled = cur === 'KRW';
    if (chargedBlock) chargedBlock.classList.toggle('hide', cur === 'KRW');
    var amt = Core.num(amountEl.value, 0);
    if (!prev) return;
    if (cur === 'KRW') { prev.textContent = '원화로 기록돼요'; return; }
    var rate = Core.num(rateEl && rateEl.value, 0) || Store.tripRate(tripOf(), cur);
    var charged = dlg.chargedOn ? Core.num((document.getElementById('f_charged') || {}).value, 0) : 0;
    if (charged > 0) {
      prev.innerHTML = '1 ' + cur + ' = ' + Core.fmt(rate, 2) + '원 · 추정 <s>' + Core.won(Core.toKRW(amt, cur, null, rate)) + '</s> → <b>실청구 ' + Core.won(charged) + '</b>으로 정산';
    } else {
      prev.innerHTML = '1 ' + cur + ' = ' + Core.fmt(rate, 2) + '원 · 환산 <b>' + Core.won(Core.toKRW(amt, cur, null, rate)) + '</b>';
    }
  }
  D.updateExpensePreview = updateExpensePreview;
  D.autoRate = applyAutoRate;

  D.markRateManual = function () { if (dlg) dlg.rateManual = true; };
  D.resetRateManual = function () { if (dlg) dlg.rateManual = false; };
  A['refresh-rate'] = function () {
    if (dlg) dlg.rateManual = false;
    fetchRates(UI.val('f_currency'));
  };
  A['toggle-charged'] = function (el) {
    dlg.chargedOn = !dlg.chargedOn;
    el.classList.toggle('on', dlg.chargedOn);
    var w = document.getElementById('charged-wrap');
    if (w) w.classList.toggle('hide', !dlg.chargedOn);
    if (dlg.chargedOn) {
      var i = document.getElementById('f_charged');
      if (i) setTimeout(function () { i.focus(); }, 40);
    }
    updateExpensePreview();
  };
  A['pick-exp-cat'] = function (el) {
    UI.$$('#cat-chips .opt').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
  };
  A['pick-payer'] = function (el) {
    dlg.payerId = el.getAttribute('data-id');
    UI.$$('#payer-pick .mpick').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
  };
  A['pick-shared'] = function (el) {
    var id = el.getAttribute('data-id');
    if (dlg.sharedWith.indexOf(id) >= 0) {
      dlg.sharedWith = dlg.sharedWith.filter(function (x) { return x !== id; });
      el.classList.remove('active');
    } else {
      dlg.sharedWith.push(id);
      el.classList.add('active');
    }
  };
  A['shared-all'] = function () {
    var trip = tripOf();
    dlg.sharedWith = (trip.members || []).map(function (m) { return m.id; });
    UI.$$('#shared-pick .mpick').forEach(function (b) { b.classList.add('active'); });
  };
  A['shared-none'] = function () {
    dlg.sharedWith = [];
    UI.$$('#shared-pick .mpick').forEach(function (b) { b.classList.remove('active'); });
  };
  A['toggle-private'] = function (el) {
    dlg.private = !dlg.private;
    el.classList.toggle('on', dlg.private);
  };

  A['save-expense'] = function () {
    if (!UI.requireLogin('로그인하면 지출을 기록할 수 있어요')) return;
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) { UI.toast('여행 정보를 찾을 수 없어요'); return; }
    var amount = Core.num(UI.val('f_amount'), 0);
    if (!(amount > 0)) { UI.toast('금액을 입력해 주세요'); return; }
    var currency = UI.val('f_currency') || 'KRW';
    var rate = currency === 'KRW' ? 1 : (Core.num(UI.val('f_rate'), 0) || Store.tripRate(trip, currency));
    var catEl = UI.$('#cat-chips .opt.active');
    var category = catEl ? catEl.getAttribute('data-cat') : 'etc';
    var title = UI.val('f_title').trim() || Core.expCat(category).label;
    var members = trip.members || [];
    var shared = dlg.sharedWith.filter(function (id) { return members.some(function (m) { return m.id === id; }); });
    if (!dlg.private && !shared.length) shared = members.map(function (m) { return m.id; });
    var charged = 0;
    if (dlg.chargedOn && currency !== 'KRW') charged = Math.round(Core.num(UI.val('f_charged'), 0));
    var payload = {
      dayKey: UI.val('f_day') || 'prep',
      amount: amount,
      currency: currency,
      rate: rate,
      chargedKRW: charged > 0 ? charged : 0,
      category: category,
      title: title,
      payerId: dlg.payerId || (members[0] && members[0].id) || '',
      sharedWith: shared,
      private: !!dlg.private,
      memo: UI.val('f_memo').trim()
    };
    var out = dlg.id ? Store.update(trip.id, 'expenses', dlg.id, payload) : Store.add(trip.id, 'expenses', payload);
    if (!out) {
      var deny = Store.takeError();
      UI.close();
      UI.denyToast(deny || 'login');
      return;
    }
    UI.close();
    if (charged > 0) UI.toast((dlg.id ? '수정했어요' : '지출을 기록했어요') + ' · 실청구 ' + Core.won(charged) + ' 기준', 2800);
    else UI.toast(dlg.id ? '수정했어요' : '지출을 기록했어요');
  };

  /* ======================================= v22: 가계부 실시간 환율 · 정산 복사 */
  var ratesUI = { busy: false };

  function fxSummary(trip) {
    var list = ((trip.data && trip.data.expenses) || []).filter(function (e) {
      return e.currency && e.currency !== 'KRW' && !(Number(e.chargedKRW) > 0);
    });
    var before = 0, after = 0;
    list.forEach(function (e) {
      before += Core.expenseKRW(e, trip);
      after += Core.toKRW(e.amount, e.currency, trip.rates, Store.tripRate(trip, e.currency));
    });
    return { count: list.length, before: before, after: after };
  }

  /** '🔄 실시간 환율 새로고침' — 이 여행의 기본 환율을 최신값으로 바꾼다 */
  A['refresh-rates'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      UI.toast('오프라인이라 환율을 새로고침할 수 없어요 · 연결되면 다시 눌러 주세요', 3200);
      return;
    }
    if (ratesUI.busy) { UI.toast('환율을 불러오는 중이에요'); return; }
    ratesUI.busy = true;
    var btn = document.getElementById('rate-refresh');
    if (btn) { btn.disabled = true; btn.textContent = '환율 불러오는 중…'; }
    Store.fetchRates().then(function (rates) {
      ratesUI.busy = false;
      var saved = Store.applyRates(trip.id, rates);
      TL.App.render();
      if (saved && saved.count) {
        UI.toast('최신 환율로 바꿨어요 · ' + Core.stampLabel(Store.rateCache().fetchedAt) + ' · 기존 지출은 그대로예요', 3200);
      } else if (saved) {
        UI.toast('환율을 받았어요 · 이 여행은 아직 외화 지출이 없어요', 2800);
      } else {
        UI.toast('환율은 받았지만 이 여행에 저장하지 못했어요', 3000);
      }
    }).catch(function (e) {
      ratesUI.busy = false;
      TL.App.render();
      UI.toast('환율 새로고침 실패 · ' + ((e && e.message) || '잠시 뒤 다시 시도해 주세요'), 3400);
    });
  };

  /** 기존 외화 지출에 최신 환율을 일괄 적용하기 전에 무엇이 바뀌는지 보여 준다 */
  A['apply-rates-expenses'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var sum = fxSummary(trip);
    if (!sum.count) { UI.toast('최신 환율을 적용할 외화 지출이 없어요 · 카드 실청구액이 있는 지출은 그대로 둬요'); return; }
    dlg = { kind: 'rates-apply', trip: trip, id: null };
    D.trip = trip;
    var diff = sum.after - sum.before;
    var diffTxt = diff === 0 ? '차이 없음' : (diff > 0 ? '+' : '-') + Core.fmt(Math.abs(diff)) + '원';
    var html = '<div class="note">이 여행의 기본 환율을 <b>이미 기록한 외화 지출 ' + sum.count + '건</b>에도 적용할까요?<br>' +
      '각 지출에 저장된 환율(입력 당시 값)을 지금 환율로 바꾸고, 원화 합계·정산이 다시 계산돼요.</div>' +
      '<div class="card flat" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">적용 전 합계</span><span class="v">' + Core.won(sum.before) + '</span></div>' +
        '<div class="kv"><span class="k">적용 후 합계</span><span class="v">' + Core.won(sum.after) + '</span></div>' +
        '<div class="kv"><span class="k">차이</span><span class="v">' + diffTxt + '</span></div>' +
      '</div>' +
      '<div class="hintline">카드 실청구액이 있는 지출은 실제 청구 금액이라 건드리지 않아요. 나중에 되돌리려면 각 지출의 환율을 직접 고쳐 주세요.</div>' +
      '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="apply-rates-confirm">' + sum.count + '건에 적용</button></div>';
    open(html, '기존 지출에 최신 환율 적용');
  };
  A['apply-rates-confirm'] = function () {
    var trip = (dlg && dlg.trip) || TL.App.currentTrip();
    if (!trip) { UI.close(); return; }
    var r = Store.applyRatesToExpenses(trip.id);
    UI.close();
    if (!r) { UI.toast('적용하지 못했어요 · 잠시 뒤 다시 시도해 주세요'); return; }
    UI.toast(r.count ? r.count + '건의 환율을 최신값으로 바꿨어요' : '바꿀 지출이 없었어요');
  };

  /** 정산 결과를 카톡에 붙여넣을 수 있게 복사한다 (실패하면 직접 복사할 수 있게 보여 준다) */
  D.settleTextSheet = function (text) {
    var html = '<div class="note">자동 복사가 막혀 있어요. 아래 내용을 길게 눌러 전체 선택한 뒤 복사해 카톡에 붙여넣어 주세요.</div>' +
      '<textarea class="input" id="settle-text" readonly style="min-height:190px;font-size:13px;line-height:1.6">' + UI.esc(text) + '</textarea>' +
      '<div class="sheet-foot"><button class="btn btn-primary" data-action="close-modal">닫기</button></div>';
    open(html, '정산 복사');
    var ta = document.getElementById('settle-text');
    if (ta) { try { ta.focus(); ta.select(); } catch (e) {} }
  };
  A['copy-settle'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var text = Core.settleText(trip, trip.data);
    UI.copyAsync(text).then(function (ok) {
      if (ok) UI.toast('정산을 복사했어요 · 카톡에 붙여넣으세요', 2400);
      else D.settleTextSheet(text);
    });
  };

  /* ============================================================ 체크리스트 */
  A['add-check'] = function () {
    if (!UI.requireLogin('로그인하면 준비물을 추가할 수 있어요')) return;
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var el = document.getElementById('chk-new');
    var text = el ? el.value.trim() : '';
    if (!text) { if (el) el.focus(); return; }
    var who = UI.val('chk-who');
    var items = trip.data.checklist || [];
    Store.add(trip.id, 'checklist', {
      text: text, done: false, assigneeId: who || '',
      order: items.length
    });
    if (el) el.value = '';
    UI.refresh();
    setTimeout(function () {
      var again = document.getElementById('chk-new');
      if (again) again.focus();
    }, 30);
  };
  A['toggle-check'] = function (el) {
    var trip = TL.App.currentTrip();
    var id = el.getAttribute('data-id');
    var it = (trip.data.checklist || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    Store.update(trip.id, 'checklist', id, { done: !it.done });
  };
  A['del-check'] = function (el) {
    var trip = TL.App.currentTrip();
    Store.remove(trip.id, 'checklist', el.getAttribute('data-id'));
  };

  /* 준비물 수정 시트 */
  D.checkItem = function (trip, id) {
    var item = null;
    ((trip.data && trip.data.checklist) || []).forEach(function (i) { if (i.id === id) item = i; });
    if (!item) return;
    dlg = { kind: 'check', id: id, trip: trip };
    D.trip = trip;
    var members = trip.members || [];
    var html = '<div class="form-row"><label class="fl">준비물</label>' +
      '<input class="input" id="f_text" maxlength="60" value="' + UI.esc(item.text) + '"></div>' +
      '<div class="form-row"><label class="fl">담당자</label><select class="input" id="f_who">' +
      '<option value=""' + (!item.assigneeId ? ' selected' : '') + '>지정 안 함</option>' +
      members.map(function (m) {
        return '<option value="' + UI.esc(m.id) + '"' + (m.id === item.assigneeId ? ' selected' : '') + '>' + UI.esc(m.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="sheet-foot">' +
      '<button class="btn btn-danger" data-action="del-check-edit">삭제</button>' +
      '<button class="btn btn-primary" data-action="save-check">저장</button></div>';
    open(html, '준비물 수정');
  };

  A['edit-check'] = function (el) {
    var trip = TL.App.currentTrip();
    if (trip) D.checkItem(trip, el.getAttribute('data-id'));
  };
  A['save-check'] = function () {
    if (!UI.requireLogin('로그인하면 준비물을 고칠 수 있어요')) return;
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip || !dlg.id) return;
    var text = UI.val('f_text').trim();
    if (!text) { UI.toast('준비물을 입력해 주세요'); return; }
    Store.update(trip.id, 'checklist', dlg.id, { text: text, assigneeId: UI.val('f_who') || '' });
    UI.close();
    UI.toast('저장했어요');
  };
  A['del-check-edit'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip || !dlg.id) return;
    if (!confirm('이 준비물을 삭제할까요?')) return;
    Store.remove(trip.id, 'checklist', dlg.id);
    UI.close();
  };
  A['load-template'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var have = {};
    (trip.data.checklist || []).forEach(function (i) { have[i.text] = 1; });
    var n = (trip.data.checklist || []).length;
    var added = 0;
    TL.Screens.DEFAULT_CHECKLIST.forEach(function (text, i) {
      if (have[text]) return;
      Store.add(trip.id, 'checklist', { text: text, done: false, assigneeId: '', order: n + added });
      added++;
    });
    UI.toast(added ? added + '개 준비물을 추가했어요' : '이미 다 있어요');
  };
  A['clear-done'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var done = (trip.data.checklist || []).filter(function (i) { return i.done; });
    if (!done.length) { UI.toast('완료한 항목이 없어요'); return; }
    if (!confirm('완료한 ' + done.length + '개 항목을 지울까요?')) return;
    done.forEach(function (i) { Store.remove(trip.id, 'checklist', i.id); });
    UI.toast('정리했어요');
  };

  /* ============================================================== 계정 */
  function authMsg(text, kind) {
    var el = document.getElementById('auth-msg');
    if (!el) { if (text && kind === 'err') UI.toast(text, 3200); return; }
    el.textContent = text || '';
    el.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
  function afterSignIn() {
    UI.close();
    if (TL.App && TL.App.render) TL.App.render();
    var name = TL.Auth.displayName();
    UI.toast(name + '님, 로그인했어요 · 여행 목록을 맞추는 중', 2800);
    setTimeout(function () {
      var st = TL.Account ? TL.Account.status() : null;
      if (st && st.localOnly > 0) D.merge();
    }, 1200);
  }

  D.account = function () {
    var signed = !!(TL.Auth && TL.Auth.signedIn());
    var cfg = Store.firebaseConfig();
    var st = TL.Account ? TL.Account.status() : { docCount: 0, localOnly: 0, remoteCount: 0, error: '', syncing: false };
    var html = '';
    if (signed) {
      var name = TL.Auth.displayName();
      var email = TL.Auth.email();
      html += '<div class="acct-card">' + UI.avatar(name, 'lg') +
        '<div class="acct-id"><b>' + UI.esc(name) + '</b><small>' + UI.esc(email || '이메일 없음') + '</small>' +
        (st.syncing ? '<small class="sync-line">동기화 중…</small>' : '<small class="sync-line ok">계정과 연결됨</small>') + '</div></div>';
      html += '<div class="card flat mt12" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">계정에 저장된 여행</span><span class="v">' + st.docCount + '개</span></div>' +
        '<div class="kv"><span class="k">이 기기 여행</span><span class="v">' + Store.trips().length + '개' +
          (st.remoteCount ? ' · 공유 ' + st.remoteCount + '개' : '') + '</span></div>' +
        '</div>';
      if (st.error) html += '<div class="auth-msg err">동기화 문제: ' + UI.esc(st.error) + '</div>';
      html += '<div class="btn-row mt12"><button class="btn btn-ghost" data-action="auth-sync">' + UI.icon('swap', 17) +
        (st.syncing ? '동기화 중…' : '지금 동기화') + '</button></div>';
      if (st.localOnly > 0) {
        html += '<div class="note mt12">이 기기에만 있는 여행이 <b>' + st.localOnly + '개</b> 있어요. 계정에 연결하면 다른 기기에서도 열 수 있어요.</div>' +
          '<button class="btn btn-mint mt8" data-action="acct-merge" style="width:100%">' + UI.icon('upload', 17) + '이 기기 여행 계정에 연결</button>';
      }
      html += '<div class="hintline">로그인 상태에서 만든 여행은 다른 기기에서도 열 수 있도록 자동으로 공유 방(초대 코드)이 만들어져 계정에 저장됩니다.</div>';
      html += '<div class="hintline">로그인한 계정 이름은 결제자·정산의 ‘나’ 기본값으로도 쓰여요.</div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">닫기</button>' +
        '<button class="btn btn-ghost" data-action="auth-signout">로그아웃</button></div>';
    } else {
      html += '<div class="note">로그인하면 <b>내 여행 목록이 계정에 저장</b>되고, 여행 만들기·참여·일정·지출·준비물 등록을 할 수 있어요. ' +
        '내가 방장이거나 일행으로 등록된 여행만 목록에 보여요.</div>';
      if (!cfg) {
        html += '<div class="note mt12 warn-note">로그인을 쓰려면 먼저 <b>Firebase 연결</b>이 필요해요. 설정은 1분이면 끝나요.</div>' +
          '<div class="btn-row mt12"><button class="btn btn-primary" data-action="open-settings">Firebase 설정 열기</button></div>' +
          '<div class="hintline">Firebase를 연결하고 Authentication에서 Google·이메일 로그인을 켜면 바로 로그인할 수 있어요.</div>';
      } else {
        html += '<button class="btn provider google mt12" data-action="auth-google">' + UI.icon('google', 18) + 'Google로 계속하기</button>';
        html += '<button class="btn btn-link sm" data-action="auth-google-redirect">현재 창에서 Google 로그인 (팝업이 안 열릴 때)</button>';
        html += '<div class="hintline">팝업 창이 빈 화면으로 닫히거나 보안 프로그램이 막는 PC에서는 위 <b>현재 창에서 Google 로그인</b>을 누르세요. 화면이 잠시 이동했다가 돌아오면서 로그인돼요.</div>';
        html += '<div class="or-line"><span>또는 이메일</span></div>';
        html += '<div class="form-row"><label class="fl">이메일</label>' +
          '<input class="input" id="auth_email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></div>';
        html += '<div class="form-row"><label class="fl">비밀번호</label>' +
          '<input class="input" id="auth_pw" type="password" autocomplete="current-password" placeholder="6자 이상"></div>';
        var lastErr = TL.Auth && TL.Auth.lastError ? TL.Auth.lastError() : null;
        html += '<div class="auth-msg' + (lastErr ? ' err' : '') + '" id="auth-msg">' + (lastErr ? UI.esc(lastErr.message) : '') + '</div>';
        html += '<div class="btn-row"><button class="btn btn-ghost" data-action="auth-email">로그인</button>' +
          '<button class="btn btn-primary" data-action="auth-signup">회원가입</button></div>';
        html += '<button class="btn btn-link sm" data-action="auth-reset">비밀번호를 잊었어요</button>';
        html += '<div class="hintline">Firebase 콘솔 › Authentication에서 <b>Google</b>·<b>이메일/비밀번호</b>를 켜고, ' +
          '<b>승인된 도메인</b>에 이 사이트 주소(<b>taijichoi.github.io</b>)가 있어야 로그인돼요.</div>';
        html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">나중에</button></div>';
      }
    }
    open(html, '계정');
  };

  /** 이 기기에만 있는 여행을 계정에 연결할지 묻는 시트 */
  D.merge = function () {
    if (!TL.Account || !TL.Account.signedIn()) return;
    var plan = TL.Account.plan();
    var trips = plan.localOnly.map(function (id) { return Store.trip(id); }).filter(Boolean);
    if (!trips.length) return;
    var html = '<div class="note">이 기기에만 있던 여행 <b>' + trips.length + '개</b>를 계정에 연결할까요? ' +
      '연결하면 다른 기기에서 같은 계정으로 로그인했을 때도 열려요.</div>';
    html += '<div class="merge-list">' + trips.map(function (t) {
      return '<div class="mrow">' + UI.avatar(t.name, 'sm') + '<span class="grow"><b>' + UI.esc(t.name) + '</b>' +
        '<small>' + UI.esc(t.destination || '여행지 없음') + ' · ' + UI.esc(Core.rangeLabel(t.startDate, t.endDate)) + '</small></span></div>';
    }).join('') + '</div>';
    html += '<div class="hintline">로그인 계정에 연결하면 그 여행은 초대 코드로 공유할 수 있는 상태가 돼요.</div>';
    html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">나중에</button>' +
      '<button class="btn btn-primary" data-action="acct-merge">계정에 연결</button></div>';
    open(html, '내 여행 계정에 연결');
  };

  A['open-account'] = function () { D.account(); };
  A['auth-google'] = function () {
    if (!Store.firebaseConfig()) { D.account(); UI.toast('먼저 Firebase를 연결해 주세요', 2600); return; }
    if (!TL.Auth) return;
    authMsg('Google 로그인 창을 여는 중…');
    TL.Auth.signInGoogle().then(function (res) {
      if (res && res.method === 'redirect') { UI.toast('로그인 화면으로 이동해요…', 2400); return; }
      afterSignIn();
    }).catch(function (e) {
      authMsg(TL.Auth.errorText(e), 'err');
    });
  };
  /** 팝업이 막히는 PC를 위한 현재 창 로그인 (signInWithRedirect) */
  A['auth-google-redirect'] = function () {
    if (!Store.firebaseConfig()) { D.account(); UI.toast('먼저 Firebase를 연결해 주세요', 2600); return; }
    if (!TL.Auth) return;
    authMsg('로그인 화면으로 이동하는 중…');
    TL.Auth.signInGoogleRedirect().then(function () {
      UI.toast('Google 로그인 화면으로 이동해요…', 2600);
    }).catch(function (e) {
      authMsg(TL.Auth.errorText(e), 'err');
    });
  };
  A['auth-email'] = function () {
    var email = (UI.val('auth_email') || '').trim();
    var pw = UI.val('auth_pw') || '';
    if (!validEmail(email)) { authMsg('이메일 주소를 확인해 주세요.', 'err'); return; }
    if (!pw) { authMsg('비밀번호를 입력해 주세요.', 'err'); return; }
    authMsg('로그인하는 중…');
    TL.Auth.signInEmail(email, pw).then(afterSignIn).catch(function (e) {
      authMsg(TL.Auth.errorText(e), 'err');
    });
  };
  A['auth-signup'] = function () {
    var email = (UI.val('auth_email') || '').trim();
    var pw = UI.val('auth_pw') || '';
    if (!validEmail(email)) { authMsg('이메일 주소를 확인해 주세요.', 'err'); return; }
    if (String(pw).length < 6) { authMsg('비밀번호는 6자 이상이어야 해요.', 'err'); return; }
    authMsg('계정을 만드는 중…');
    TL.Auth.signUpEmail(email, pw, Core.localPart(email)).then(afterSignIn).catch(function (e) {
      authMsg(TL.Auth.errorText(e), 'err');
    });
  };
  A['auth-reset'] = function () {
    var email = (UI.val('auth_email') || '').trim();
    if (!validEmail(email)) { authMsg('재설정 메일을 받을 이메일을 먼저 입력해 주세요.', 'err'); return; }
    authMsg('재설정 메일을 보내는 중…');
    TL.Auth.resetPassword(email).then(function () {
      authMsg('비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.', 'ok');
    }).catch(function (e) { authMsg(TL.Auth.errorText(e), 'err'); });
  };
  A['auth-signout'] = function () {
    TL.Auth.signOut().then(function () {
      if (TL.Account) TL.Account.stop();
      UI.close();
      if (TL.App && TL.App.render) TL.App.render();
      UI.toast('로그아웃했어요 · 게스트로 계속 쓸 수 있어요', 2800);
    }).catch(function (e) { authMsg(TL.Auth.errorText(e), 'err'); });
  };
  A['auth-sync'] = function () {
    if (!TL.Account || !TL.Account.signedIn()) return;
    UI.toast('동기화하는 중…', 1600);
    TL.Account.sync().then(function (r) {
      D.account();
      UI.toast('동기화했어요 · 올림 ' + (r.registered || 0) + ' · 가져옴 ' + (r.pulled || 0), 3000);
    }).catch(function (e) { UI.toast('동기화 실패: ' + (e.message || e), 3200); });
  };
  A['acct-merge'] = function () {
    if (!TL.Account || !TL.Account.signedIn()) return;
    var n = TL.Account.plan().localOnly.length;
    if (!confirm('이 기기의 여행 ' + n + '개를 계정에 연결할까요?\n연결하면 다른 기기에서도 열 수 있어요.')) return;
    UI.toast('계정에 연결하는 중…', 2000);
    TL.Account.mergeLocal().then(function (r) {
      D.account();
      UI.toast(r.merged ? r.merged + '개 여행을 계정에 연결했어요' : '연결할 여행이 없어요', 3000);
    }).catch(function (e) { UI.toast('연결 실패: ' + (e.message || e), 3200); });
  };

  /* ================================================================ 공유 */
  function b64url(str) { return Core.b64urlEncode(str); }
  function shareUrl(trip) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    var code = trip.remoteCode;
    var q = '?trip=' + encodeURIComponent(code);
    // 내 Firebase로 바꾼 경우에만 설정을 링크에 담는다 (기본 프로젝트는 앱에 들어 있어 필요 없음)
    var cfg = Store.customFirebase();
    if (cfg) q += '&cfg=' + b64url(JSON.stringify(cfg));
    return base + q;
  }
  D.shareUrl = shareUrl;

  D.share = function (trip) {
    var html = '';
    if (trip.remoteCode) {
      var url = shareUrl(trip);
      html += '<div class="note" style="text-align:center;background:linear-gradient(160deg,#EAF2FF,#E4FAF6);border:0">' +
        '<div class="tiny" style="font-weight:700;color:#2A74DB">초대 코드</div>' +
        '<div class="invite-code">' + UI.esc(trip.remoteCode) + '</div>' +
        '<div class="badge-line" style="justify-content:center"><span class="dot-live"></span>일행과 실시간으로 함께 쓰는 중</div>' +
      '</div>';
      html += '<div class="form-row mt12"><label class="fl">초대 링크</label>' +
        '<div class="share-link" id="share-link">' + UI.esc(url) + '</div></div>';
      html += '<div class="btn-row"><button class="btn btn-ghost" data-action="copy-code" data-code="' + UI.esc(trip.remoteCode) + '">' +
        UI.icon('copy', 18) + '코드 복사</button>' +
        '<button class="btn btn-primary" data-action="share-link">' + UI.icon('share', 18) + '링크 보내기</button></div>';
      html += '<div class="note mt12">링크를 받은 일행은 앱을 설치하지 않아도 브라우저에서 바로 열 수 있어요. ' +
        '필요한 설정이 앱에 들어 있어서 일행은 아무것도 설정하지 않아도 됩니다.</div>';
      html += '<div class="kv mt12"><span class="k">참여 중인 일행</span><span class="v">' +
        (trip.members || []).map(function (m) { return UI.esc(m.name); }).join(' · ') + '</span></div>';
      html += '<div class="btn-row mt12"><button class="btn btn-ghost" data-action="manage-members">' +
        UI.icon('users', 18) + '일행 관리</button></div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">닫기</button></div>';
    } else {
      var cfgOk = !!Store.firebaseConfig();
      html += '<div class="note">지금은 <b>이 기기에만 저장</b>되는 상태예요. 일행과 실시간으로 함께 쓰려면 ' +
        '실시간 공유를 켜면 됩니다. Firebase는 이미 연결되어 있어 따로 설정할 것이 없어요.</div>';
      html += '<div class="card flat mt12" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">현재 모드</span><span class="v">로컬 저장</span></div>' +
        '<div class="kv"><span class="k">Firebase</span><span class="v">' +
          (cfgOk ? (Store.isDefaultFirebase() ? '기본 프로젝트 연결됨' : '내 설정 연결됨') : '없음') + '</span></div>' +
      '</div>';
      html += '<div class="btn-row mt12"><button class="btn btn-ghost" data-action="manage-members">' +
        UI.icon('users', 18) + '일행 관리</button></div>';
      html += '<div class="sheet-foot">' +
        '<button class="btn btn-ghost" data-action="open-settings">설정 열기</button>' +
        (cfgOk
          ? '<button class="btn btn-mint" data-action="make-remote">실시간 공유 켜기</button>'
          : '<button class="btn btn-mint" data-action="fb-guide">Firebase 연결하기</button>') +
      '</div>';
    }
    UI.open(html, '일행과 공유');
  };

  A['copy-code'] = function (el) { UI.copy(el.getAttribute('data-code')); };
  A['share-link'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var url = shareUrl(trip);
    UI.shareText(trip.name + ' 초대', trip.name + ' 같이 쓰자!\n' + url);
  };
  A['make-remote'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    UI.close();
    UI.toast('공유 방을 만드는 중…');
    Store.connect(trip.id, { create: true }).then(function () {
      var t = Store.trip(trip.id);
      D.share(t);
      UI.toast('실시간 공유를 켰어요');
    }).catch(function (e) {
      UI.toast('연결 실패: ' + (e.message || e));
    });
  };
  A['fb-guide'] = function () {
    var trip = TL.App.currentTrip();
    D.settings(trip);
  };

  /* ================================================================ 참여 */
  D.join = function () {
    var nick = Store.settings().nickname;
    var html = '';
    html += '<div class="note">일행에게 받은 <b>6자리 초대 코드</b>나 초대 링크를 입력하세요. ' +
      '링크로 열었다면 자동으로 채워집니다.</div>';
    html += '<div class="form-row mt12"><label class="fl">초대 코드</label>' +
      '<input class="input" id="f_code" placeholder="예: 7KD2QM" maxlength="10" autocapitalize="characters" ' +
      'style="text-transform:uppercase;letter-spacing:4px;font-weight:800;text-align:center;font-size:20px"></div>';
    html += '<div class="form-row"><label class="fl">내 이름 (일행에게 보일 이름)</label>' +
      '<input class="input" id="f_nick" placeholder="예: 재원" maxlength="12" value="' + UI.esc(nick) + '"></div>';
    html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="do-join">참여하기</button></div>';
    open(html, '초대 코드로 참여');
  };

  A['do-join'] = function () {
    if (!UI.requireLogin('로그인하면 초대 코드로 참여할 수 있어요')) return;
    var code = (UI.val('f_code') || '').trim().toUpperCase();
    var nick = (UI.val('f_nick') || '').trim();
    if (!code) { UI.toast('초대 코드를 입력해 주세요'); return; }
    if (!Store.firebaseConfig()) {
      UI.toast('설정에서 Firebase 정보를 먼저 입력해 주세요');
      D.settings(null);
      return;
    }
    UI.close();
    UI.toast('여행을 불러오는 중…');
    Store.joinByCode(code, nick).then(function (trip) {
      var t = Store.trip(trip.id);
      var m = D.joinSelf(t, nick);      // 내 계정(uid·이메일)을 일행에 연결 → 목록에 보이고 본인 판별이 된다
      TL.App.openTrip(trip.id, 'schedule');
      UI.toast(m ? '참여했어요 · ' + m.name : '참여했어요');
    }).catch(function (e) {
      var needLogin = e && e.code === 'need-login';
      UI.toast(needLogin ? '로그인한 뒤 다시 참여해 주세요' : '참여 실패: ' + (e.message || e));
    });
  };

  /* ============================================================== 설정 */
  D.settings = function (trip) {
    trip = trip || TL.App.currentTrip();
    var s = Store.settings();
    var cfg = s.firebase;
    var custom = !!s.firebaseCustom;
    var signed = !!(TL.Auth && TL.Auth.signedIn());
    var html = '';
    html += '<div class="form-row"><label class="fl">내 이름 (닉네임)</label>' +
      '<input class="input" id="f_nick" value="' + UI.esc(s.nickname) + '" placeholder="예: 재원" maxlength="12">' +
      '<div class="hintline">결제자를 고를 때 기본값으로 쓰여요.</div>' +
      '<button class="btn btn-ghost sm mt8" data-action="save-nick" style="width:100%">닉네임 저장</button></div>';

    html += '<div class="section-title" style="margin-top:20px"><h2>계정 로그인</h2>' +
      '<span class="pill ' + (signed ? 'mint' : 'gray') + '">' + (signed ? UI.esc(TL.Auth.displayName()) + '님' : '게스트') + '</span></div>';
    html += '<div class="note">Google 또는 이메일로 로그인하면 <b>내 여행 목록이 계정에 저장</b>돼 다른 기기에서도 그대로 열려요. ' +
      '로그인하지 않아도 이 기기 저장·초대 코드 참여는 그대로 동작해요.</div>';
    html += '<div class="btn-row mt8"><button class="btn btn-ghost sm" data-action="open-account">' +
      UI.icon(signed ? 'users' : 'google', 17) + (signed ? '계정 관리 · 로그아웃' : '로그인 · 계정') + '</button></div>';
    html += '<details class="mt12"><summary class="tiny muted" style="cursor:pointer">Firebase에서 로그인 켜기 (Google · 이메일)</summary>' +
      '<div class="note mt8"><b>Authentication 설정 (한 번만)</b><ol>' +
      '<li>Firebase 콘솔 → 왼쪽 <b>Build › Authentication</b> → <b>시작하기</b></li>' +
      '<li><b>Sign-in method</b> 탭 → <b>Google</b> → <b>사용 설정</b> → 프로젝트 지원 이메일 고르고 <b>저장</b></li>' +
      '<li>같은 화면 <b>Email/Password</b> → <b>사용 설정</b> → <b>저장</b></li>' +
      '<li><b>Settings</b> 탭 → <b>승인된 도메인</b>에 <b>taijichoi.github.io</b> 추가(기본 <b>localhost</b>는 그대로)</li>' +
      '<li>Firestore <b>규칙</b>에 아래 로그인 규칙을 넣고 <b>게시</b> (계정별 여행 목록 저장용)</li>' +
      '</ol></div></details>';

    html += '<div class="section-title" style="margin-top:20px"><h2>일행과 실시간 공유</h2>' +
      '<span class="pill ' + (cfg ? 'mint' : 'gray') + '">' + (cfg ? (custom ? '내 설정' : '기본 연결') : '미설정') + '</span></div>';
    html += '<div class="note">여행 데이터는 <b>무료 Firebase Firestore</b>에 저장되어 일행과 실시간으로 함께 쓸 수 있어요. ' +
      (custom
        ? '지금은 <b>내 Firebase 프로젝트</b>에 연결되어 있어요.'
        : '지금은 기본 프로젝트 <b>' + UI.esc((cfg && cfg.projectId) || '') + '</b>이(가) 앱에 들어 있어서, 따로 설정하지 않아도 바로 로그인·실시간 공유를 쓸 수 있어요.') +
      '</div>';

    if (cfg) {
      html += '<div class="card flat mt8" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">프로젝트</span><span class="v">' + UI.esc(cfg.projectId || '-') + '</span></div>' +
        '<div class="kv"><span class="k">연결 방식</span><span class="v">' + (custom ? '내 설정' : '기본 내장') + '</span></div>' +
        '<div class="kv"><span class="k">App ID</span><span class="v" style="max-width:62%;overflow-wrap:anywhere;text-align:right">' + UI.esc(cfg.appId || '(없음)') + '</span></div>' +
        '<div class="kv"><span class="k">상태</span><span class="v" id="fb-status">연결 테스트 전</span></div>' +
      '</div>' +
      '<div class="btn-row mt8">' +
        '<button class="btn btn-ghost sm" data-action="test-fb" style="flex:1">연결 테스트</button>' +
        (custom ? '<button class="btn btn-ghost sm" data-action="reset-fb" style="flex:1">기본값으로 되돌리기</button>' : '') +
      '</div>' +
      (custom ? '' : '<div class="hintline">기본 프로젝트는 트립로그 사용자가 함께 쓰는 공유 저장소예요. 내 Firebase로 바꾸면 내 데이터만 따로 관리할 수 있어요.</div>') +
      '<details class="mt12"><summary class="tiny muted" style="cursor:pointer">' + (custom ? '설정 다시 입력하기 / 내 프로젝트 안내' : '내 Firebase 프로젝트로 바꾸기') + '</summary>' +
        '<div class="form-row mt8"><label class="fl">firebaseConfig</label>' +
        '<textarea class="input" id="f_fb" style="min-height:150px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px">' + UI.esc(JSON.stringify(cfg, null, 2)) + '</textarea>' +
        '<div class="hintline">지금 쓰는 설정이 채워져 있어요. Firebase 콘솔 › 프로젝트 설정 › 내 앱 › 웹의 firebaseConfig로 바꾸면 내 프로젝트로 연결됩니다.</div>' +
        '<button class="btn btn-mint mt8" data-action="save-fb">저장하고 연결 테스트</button></div>' +
        '<div class="note mt8"><b>내 프로젝트를 쓸 때 (한 번만)</b><ol>' +
        '<li><a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a> → <b>프로젝트 추가</b> (애널리틱스는 꺼도 됨)</li>' +
        '<li><b>Build › Firestore Database</b> → <b>데이터베이스 만들기</b> → 위치 <b>asia-northeast3(서울)</b> → 프로덕션 모드</li>' +
        '<li><b>Build › Authentication</b> → 시작하기 → <b>Google</b>·<b>Email/Password</b> 사용 설정, <b>Settings › 승인된 도메인</b>에 <b>taijichoi.github.io</b> 추가 (로그인)</li>' +
        '<li>Firestore <b>규칙</b> 탭에 아래 규칙을 붙여넣고 <b>게시</b> (공유 + 로그인 계정)</li>' +
        '<li>복사한 설정을 위 칸에 붙여넣고 <b>저장하고 연결 테스트</b></li>' +
        '</ol></div>' +
        '<div class="code-box light" id="rules">' + UI.esc(D.RULES) + '</div>' +
        '<button class="btn btn-ghost sm mt8" data-action="copy-rules" style="width:100%">규칙 복사</button></details>';
    }

    html += '<div class="section-title" style="margin-top:22px"><h2>환율 (참고값)</h2></div>' +
      '<div class="note" style="margin-bottom:8px">지출을 입력할 때 통화별로 직접 고칠 수 있어요. 여기 값은 새 지출의 기본값입니다.</div>';
    html += '<div class="card flat" style="border:1px solid var(--line);padding:6px 14px">' +
      Core.QUICK_RATES.map(function (code) {
        var v = (s.defaultRates[code] || Core.DEFAULT_RATES[code]);
        return '<div class="kv"><span class="k">1 ' + code + ' ' + Core.curInfo(code).symbol + '</span>' +
          '<span class="v" style="max-width:45%"><input class="input" id="rate_' + code + '" inputmode="decimal" value="' + v + '" style="height:38px;text-align:right"></span></div>';
      }).join('') + '</div>' +
      '<button class="btn btn-ghost sm mt8" data-action="save-rates" style="width:100%">환율 저장</button>';

    html += '<div class="section-title" style="margin-top:22px"><h2>데이터</h2></div>' +
      '<div class="btn-row"><button class="btn btn-ghost sm" data-action="export-json">' + UI.icon('download', 17) + 'JSON 백업</button>' +
      '<label class="btn btn-ghost sm" for="json-file">' + UI.icon('upload', 17) + 'JSON 복원</label></div>' +
      '<input type="file" id="json-file" accept="application/json,.json" class="sr-file">' +
      '<div class="hintline">백업 파일은 이 기기 여행 전부를 담아요. 다른 폰에서 복원하면 그대로 이어서 쓸 수 있어요.</div>' +
      '<button class="btn btn-ghost sm mt12" data-action="load-sample" style="width:100%">' + UI.icon('sparkle', 17) + '예시 여행 불러오기</button>' +
      '<button class="btn btn-danger sm mt8" data-action="reset-all" style="width:100%">모든 데이터 지우기</button>';

    html += '<div class="sheet-foot"><button class="btn btn-primary" data-action="close-modal">닫기</button></div>';
    open(html, '설정');

    var fileEl = document.getElementById('json-file');
    if (fileEl) fileEl.addEventListener('change', D.importFile);
  };

  D.RULES = "rules_version = '2';\n" +
    "service cloud.firestore {\n" +
    "  match /databases/{database}/documents {\n" +
    "    // 일행 공유: 초대 코드를 아는 사람은 누구나 읽고 쓸 수 있다\n" +
    "    match /trips/{code} { allow read, write: if true; }\n" +
    "    match /trips/{code}/{document=**} { allow read, write: if true; }\n" +
    "    match /triplog_meta/{doc} { allow read, write: if true; }\n" +
    "    // 로그인 계정: 본인만 읽고 쓸 수 있다 (내 여행 목록·프로필)\n" +
    "    match /users/{uid} {\n" +
    "      allow read, write: if request.auth != null && request.auth.uid == uid;\n" +
    "      match /trips/{code} { allow read, write: if request.auth != null && request.auth.uid == uid; }\n" +
    "    }\n" +
    "  }\n" +
    "}";

  A['save-nick'] = function () {
    var v = UI.val('f_nick').trim();
    Store.setNickname(v);
    UI.toast(v ? '닉네임을 저장했어요' : '닉네임을 비웠어요');
  };
  A['copy-rules'] = function () { UI.copy(D.RULES); };
  A['save-fb'] = function () {
    var raw = (UI.val('f_fb') || '').trim();
    if (!raw) { UI.toast('firebaseConfig를 붙여넣어 주세요'); return; }
    var cfg = null;
    try {
      // "const firebaseConfig = {...};" 형태에서 객체만 뽑아낸다
      var m = raw.match(/\{[\s\S]*\}/);
      cfg = JSON.parse(m ? m[0] : raw);
    } catch (e) {
      UI.toast('JSON 형식이 아니에요. { } 안의 내용을 그대로 붙여넣어 주세요');
      return;
    }
    if (!cfg || !cfg.projectId) { UI.toast('projectId가 없어요. 설정 전체를 붙여넣어 주세요'); return; }
    if (!cfg.apiKey) { UI.toast('apiKey가 없어요. 설정 전체를 붙여넣어 주세요'); return; }
    UI.toast('연결을 확인하는 중…');
    Store.testFirebase(cfg).then(function () {
      Store.setFirebase(Store.isDefaultConfig(cfg) ? null : cfg);
      if (TL.Auth) { TL.Auth.reset(); TL.Auth.init(); }
      D.settings(TL.App.currentTrip());
      UI.toast(Store.isDefaultFirebase() ? '기본 프로젝트로 연결됐어요' : '내 Firebase 프로젝트로 연결됐어요', 3000);
    }).catch(function (e) {
      Store.setFirebase(Store.isDefaultConfig(cfg) ? null : cfg);
      if (TL.Auth) { TL.Auth.reset(); TL.Auth.init(); }
      UI.toast('저장은 했지만 테스트 실패: ' + (e.code || e.message || e), 3600);
      D.settings(TL.App.currentTrip());
    });
  };
  A['test-fb'] = function () {
    var cfg = Store.firebaseConfig();
    if (!cfg) return;
    var st = document.getElementById('fb-status');
    if (st) st.textContent = '확인 중…';
    Store.testFirebase(cfg).then(function () {
      if (st) st.textContent = '정상 ✅';
      UI.toast('Firebase 연결 정상');
    }).catch(function (e) {
      if (st) st.textContent = '실패: ' + (e.code || e.message || e);
      UI.toast('연결 실패 — 규칙/DB 생성을 확인해 주세요');
    });
  };
  A['reset-fb'] = function () {
    if (!Store.isDefaultFirebase() && !confirm('내 Firebase 설정을 지우고 기본 프로젝트로 되돌릴까요? 여행 데이터는 그대로예요.')) return;
    if (TL.Account) TL.Account.stop();
    Store.setFirebase(null);
    Store.disconnect();
    if (TL.Auth) { TL.Auth.reset(); TL.Auth.init(); }
    D.settings(TL.App.currentTrip());
    UI.toast('기본 프로젝트로 되돌렸어요');
  };
  A['remove-fb'] = A['reset-fb'];
  A['save-rates'] = function () {
    ['JPY', 'USD', 'EUR', 'THB', 'VND'].forEach(function (code) {
      var v = Core.num(UI.val('rate_' + code), 0);
      if (v > 0) Store.setDefaultRate(code, v);
    });
    UI.toast('환율을 저장했어요');
  };
  A['export-json'] = function () {
    UI.download('triplog-backup-' + Core.todayISO() + '.json', Store.exportJSON(), 'application/json;charset=utf-8');
  };
  A['import-json'] = function () {
    var el = document.getElementById('json-file');
    if (el) el.click();
  };
  D.importFile = function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = Store.importJSON(String(reader.result));
        UI.close();
        UI.toast(n + '개 여행을 복원했어요');
        TL.App.goHome();
      } catch (e) {
        UI.toast('복원 실패: ' + (e.message || e));
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  A['reset-all'] = function () {
    if (!confirm('이 기기의 여행·지출·설정을 모두 지울까요? 되돌릴 수 없습니다.')) return;
    if (!confirm('정말 지울까요? 백업(JSON)을 먼저 받아두는 걸 권해요.')) return;
    Store.clearAll();
    UI.close();
    TL.App.goHome();
    UI.toast('모두 지웠어요');
  };

  /* ================================================================ CSV */
  A['export-csv'] = function () {
    var trip = TL.App.currentTrip();
    if (!trip) return;
    var csv = Core.csv(trip, trip.data);
    var safe = (trip.name || 'trip').replace(/[\\/:*?"<>|]/g, '');
    UI.download('가계부_' + safe + '_' + Core.todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
    UI.toast('CSV로 내보냈어요');
  };
})(typeof window !== 'undefined' ? window : globalThis);
