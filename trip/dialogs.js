/* 트립로그 — 입력 시트와 설정 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var D = (TL.Dialogs = {});
  var A = (TL.Actions = TL.Actions || {});

  var dlg = { kind: '', trip: null, id: null, members: [], sharedWith: [], private: false, payerId: '', dayKey: '' };

  function open(html, title) { UI.open(html, { title: title }); }
  function tripOf() { return D.trip; }

  /* ======================================================== 여행 만들기 */
  function memberEditorHtml() {
    return '<div class="members-pick" id="member-list">' + dlg.members.map(function (m) {
      return '<button class="mpick active" data-action="del-member-chip" data-id="' + UI.esc(m.id) + '">' +
        UI.avatar(m.name) + UI.esc(m.name) + '<span class="ck">' + UI.icon('check', 11) + '</span></button>';
    }).join('') + '</div>' +
    '<div class="inline-add"><input class="input" id="member-new" placeholder="일행 이름 (예: 아내)" maxlength="12">' +
    '<button class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="add-member-chip">추가</button></div>' +
    '<div class="hintline">내 이름도 넣어 주세요. 정산에서 결제자로 선택할 수 있어요.</div>';
  }
  function refreshMemberList() {
    var el = document.getElementById('member-list');
    if (!el) return;
    el.innerHTML = dlg.members.map(function (m) {
      return '<button class="mpick active" data-action="del-member-chip" data-id="' + UI.esc(m.id) + '">' +
        UI.avatar(m.name) + UI.esc(m.name) + '<span class="ck">' + UI.icon('check', 11) + '</span></button>';
    }).join('');
  }

  D.newTrip = function () {
    dlg = { kind: 'new-trip', members: [], id: null };
    D.trip = null;
    var today = Core.todayISO();
    var nick = Store.settings().nickname;
    dlg.members = [{ id: Core.uid('m'), name: nick || '나' }];
    var start = Core.addDays(today, 7), end = Core.addDays(today, 9);
    var html = '';
    html += '<div class="form-row"><label class="fl">여행 이름</label>' +
      '<input class="input" id="f_name" placeholder="예: 오사카 3박 4일" maxlength="40"></div>';
    html += '<div class="form-row"><label class="fl">여행지</label>' +
      '<input class="input" id="f_dest" placeholder="예: 오사카 · 교토" maxlength="40"></div>';
    html += '<div class="form-row"><label class="fl">기간</label><div class="two">' +
      '<input class="input" type="date" id="f_start" value="' + start + '">' +
      '<input class="input" type="date" id="f_end" value="' + end + '"></div></div>';
    html += '<div class="form-row"><label class="fl">기본 통화</label>' +
      '<select class="input" id="f_cur">' + Core.CURRENCIES.map(function (c) {
        return '<option value="' + c.code + '"' + (c.code === 'JPY' ? '' : '') + '>' + c.code + ' · ' + c.name + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="form-row"><label class="fl">일행</label>' + memberEditorHtml() + '</div>';
    html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="save-new-trip">만들기</button></div>';
    open(html, '새 여행 만들기');
  };

  A['save-new-trip'] = function () {
    var name = UI.val('f_name').trim();
    if (!name) { UI.toast('여행 이름을 입력해 주세요'); return; }
    var start = UI.val('f_start') || Core.todayISO();
    var end = UI.val('f_end') || start;
    if (Core.diffDays(start, end) < 0) { var tmp = start; start = end; end = tmp; }
    var members = dlg.members.length ? dlg.members : [{ id: Core.uid('m'), name: '나' }];
    var trip = Store.createTrip({
      name: name,
      destination: UI.val('f_dest').trim(),
      startDate: start,
      endDate: end,
      baseCurrency: UI.val('f_cur') || 'KRW',
      members: members
    });
    var nick = Store.settings().nickname;
    if (!nick) Store.setNickname(members[0].name);
    UI.close();
    TL.App.openTrip(trip.id, 'schedule');
    UI.toast('여행을 만들었어요');
  };

  /* ======================================================== 여행 정보 수정 */
  D.editTrip = function (trip) {
    dlg = { kind: 'edit-trip', members: (trip.members || []).slice(), id: trip.id, trip: trip };
    D.trip = trip;
    var html = '';
    html += '<div class="form-row"><label class="fl">여행 이름</label>' +
      '<input class="input" id="f_name" value="' + UI.esc(trip.name) + '" maxlength="40"></div>';
    html += '<div class="form-row"><label class="fl">여행지</label>' +
      '<input class="input" id="f_dest" value="' + UI.esc(trip.destination || '') + '" maxlength="40"></div>';
    html += '<div class="form-row"><label class="fl">기간</label><div class="two">' +
      '<input class="input" type="date" id="f_start" value="' + UI.esc(trip.startDate) + '">' +
      '<input class="input" type="date" id="f_end" value="' + UI.esc(trip.endDate) + '"></div></div>';
    html += '<div class="form-row"><label class="fl">일행</label>' + memberEditorHtml() + '</div>';
    html += '<div class="sheet-foot"><button class="btn btn-danger" data-action="delete-trip" style="flex:.7">삭제</button>' +
      '<button class="btn btn-primary" data-action="save-edit-trip">저장</button></div>';
    open(html, '여행 정보 수정');
  };

  A['save-edit-trip'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) { UI.toast('여행 정보를 찾을 수 없어요'); return; }
    var name = UI.val('f_name').trim() || trip.name;
    var start = UI.val('f_start') || trip.startDate;
    var end = UI.val('f_end') || start;
    if (Core.diffDays(start, end) < 0) { var tmp = start; start = end; end = tmp; }
    Store.updateTrip(trip.id, {
      name: name,
      destination: UI.val('f_dest').trim(),
      startDate: start,
      endDate: end,
      members: dlg.members.length ? dlg.members : trip.members
    });
    UI.close();
    UI.toast('저장했어요');
  };

  A['delete-trip'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) return;
    if (!confirm('"' + trip.name + '" 여행을 이 기기에서 삭제할까요?\n(실시간 공유 중이면 다른 일행의 데이터는 그대로 남습니다)')) return;
    Store.removeTrip(trip.id);
    UI.close();
    TL.App.goHome();
    UI.toast('삭제했어요');
  };

  A['add-member-chip'] = function () {
    var el = document.getElementById('member-new');
    var v = el ? el.value.trim() : '';
    if (!v) return;
    if (dlg.members.some(function (m) { return m.name === v; })) { UI.toast('이미 있는 이름이에요'); return; }
    dlg.members.push({ id: Core.uid('m'), name: v });
    if (el) el.value = '';
    refreshMemberList();
  };
  A['del-member-chip'] = function (el) {
    var id = el.getAttribute('data-id');
    if (dlg.members.length <= 1) { UI.toast('최소 한 명은 필요해요'); return; }
    dlg.members = dlg.members.filter(function (m) { return m.id !== id; });
    refreshMemberList();
  };

  /* ============================================================== 일정 */
  D.schedule = function (trip, id, dayKey) {
    var item = null;
    ((trip.data && trip.data.schedules) || []).forEach(function (s) { if (s.id === id) item = s; });
    dlg = { kind: 'schedule', id: id || null, trip: trip };
    D.trip = trip;
    var day = item ? item.dayKey : (dayKey || TL.App.view.day || 'd1');
    var html = '';
    html += '<div class="form-row"><label class="fl">날짜</label><select class="input" id="f_day">' +
      Core.dayList(trip).map(function (d) {
        return '<option value="' + d.key + '"' + (d.key === day ? ' selected' : '') + '>' + d.label +
          (d.date ? ' · ' + Core.isoLabel(d.date) : ' (출발 전)') + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="two"><div class="form-row"><label class="fl">시간</label>' +
      '<input class="input" type="time" id="f_time" value="' + UI.esc(item && item.time || '') + '"></div>' +
      '<div class="form-row"><label class="fl">카테고리</label><select class="input" id="f_cat">' +
      Core.SCHED_CATS.map(function (c) {
        return '<option value="' + c.key + '"' + (item && item.category === c.key ? ' selected' : '') + '>' + c.label + '</option>';
      }).join('') + '</select></div></div>';
    html += '<div class="form-row"><label class="fl">장소 · 일정 이름</label>' +
      '<input class="input" id="f_title" placeholder="예: 도톤보리 산책" maxlength="60" value="' + UI.esc(item ? item.title : '') + '"></div>';
    html += '<div class="form-row"><label class="fl">지도에 검색할 장소명 <span style="font-weight:500">(선택)</span></label>' +
      '<input class="input" id="f_place" placeholder="비우면 위 이름으로 검색해요" maxlength="60" value="' + UI.esc(item ? (item.place || '') : '') + '"></div>';
    html += '<div class="form-row"><label class="fl">메모</label>' +
      '<textarea class="input" id="f_memo" placeholder="예약 시간, 팁, 챙길 것" maxlength="300">' + UI.esc(item ? (item.memo || '') : '') + '</textarea></div>';
    html += '<div class="sheet-foot">' +
      (item ? '<button class="btn btn-danger" data-action="del-schedule" data-id="' + UI.esc(item.id) + '">삭제</button>' : '') +
      '<button class="btn btn-primary" data-action="save-schedule">' + (item ? '저장' : '추가') + '</button></div>';
    open(html, item ? '일정 수정' : '일정 추가');
  };

  A['save-schedule'] = function () {
    var trip = tripOf() || TL.App.currentTrip();
    if (!trip) { UI.toast('여행 정보를 찾을 수 없어요'); return; }
    var title = UI.val('f_title').trim();
    if (!title) { UI.toast('장소나 일정 이름을 입력해 주세요'); return; }
    var payload = {
      dayKey: UI.val('f_day') || 'prep',
      time: UI.val('f_time') || '',
      title: title,
      category: UI.val('f_cat') || 'etc',
      place: UI.val('f_place').trim(),
      memo: UI.val('f_memo').trim()
    };
    if (dlg.id) Store.update(trip.id, 'schedules', dlg.id, payload);
    else Store.add(trip.id, 'schedules', payload);
    UI.close();
    TL.App.view.day = payload.dayKey;
    UI.toast(dlg.id ? '수정했어요' : '일정을 추가했어요');
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

  /* ============================================================== 지출 */
  D.expense = function (trip, id) {
    var item = null;
    ((trip.data && trip.data.expenses) || []).forEach(function (e) { if (e.id === id) item = e; });
    var members = trip.members || [];
    var me = Store.meId(trip, members[0] && members[0].id);
    dlg = {
      kind: 'expense', id: id || null, trip: trip,
      sharedWith: item ? (item.sharedWith || []).slice() : members.map(function (m) { return m.id; }),
      payerId: item ? (item.payerId || me) : me,
      private: item ? !!item.private : false,
      dayKey: item ? item.dayKey : (TL.App.view.day && TL.App.view.day !== 'all' ? TL.App.view.day : 'd1')
    };
    D.trip = trip;
    var cur = item ? item.currency : (trip.baseCurrency && trip.baseCurrency !== 'KRW' ? trip.baseCurrency : (trip.baseCurrency || 'KRW'));
    if (!item) {
      // 여행 기본 통화가 외화면 그 통화를 먼저 보여준다
      cur = trip.baseCurrency || 'KRW';
    }
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
          UI.avatar(m.name) + UI.esc(m.name) + '</button>';
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

    html += '<div class="form-row"><label class="fl">메모 <span style="font-weight:500">(선택)</span></label>' +
      '<input class="input" id="f_memo" placeholder="예: 3명 세트" maxlength="100" value="' + UI.esc(item ? (item.memo || '') : '') + '"></div>';

    html += '<div class="sheet-foot">' +
      (item ? '<button class="btn btn-danger" data-action="del-expense" data-id="' + UI.esc(item.id) + '">삭제</button>' : '') +
      '<button class="btn btn-primary" data-action="save-expense">' + (item ? '저장' : '추가') + '</button></div>';
    open(html, item ? '지출 수정' : '지출 추가');
    updateExpensePreview();
  };

  function updateExpensePreview() {
    var amountEl = document.getElementById('f_amount');
    var curEl = document.getElementById('f_currency');
    var rateEl = document.getElementById('f_rate');
    var prev = document.getElementById('f_preview');
    var lab = document.getElementById('f_cur_label');
    var rw = document.getElementById('rate-wrap');
    if (!amountEl || !curEl) return;
    var cur = curEl.value;
    if (lab) lab.textContent = Core.curInfo(cur).symbol;
    if (rw) rw.style.opacity = cur === 'KRW' ? '.45' : '1';
    if (rateEl) rateEl.disabled = cur === 'KRW';
    var amt = Core.num(amountEl.value, 0);
    if (!prev) return;
    if (cur === 'KRW') { prev.textContent = '원화로 기록돼요'; return; }
    var rate = Core.num(rateEl && rateEl.value, 0) || Store.tripRate(tripOf(), cur);
    prev.innerHTML = '1 ' + cur + ' = ' + Core.fmt(rate, 2) + '원 · 환산 <b>' + Core.won(Core.toKRW(amt, cur, null, rate)) + '</b>';
  }
  D.updateExpensePreview = updateExpensePreview;

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
    var payload = {
      dayKey: UI.val('f_day') || 'prep',
      amount: amount,
      currency: currency,
      rate: rate,
      category: category,
      title: title,
      payerId: dlg.payerId || (members[0] && members[0].id) || '',
      sharedWith: shared,
      private: !!dlg.private,
      memo: UI.val('f_memo').trim()
    };
    if (dlg.id) Store.update(trip.id, 'expenses', dlg.id, payload);
    else Store.add(trip.id, 'expenses', payload);
    UI.close();
    UI.toast(dlg.id ? '수정했어요' : '지출을 기록했어요');
  };

  A['del-expense'] = function (el) {
    var trip = tripOf() || TL.App.currentTrip();
    var id = el.getAttribute('data-id') || dlg.id;
    if (!trip || !id) return;
    if (!confirm('이 지출을 삭제할까요?')) return;
    Store.remove(trip.id, 'expenses', id);
    UI.close();
    UI.toast('삭제했어요');
  };

  /* ============================================================ 체크리스트 */
  A['add-check'] = function () {
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

  /* ================================================================ 공유 */
  function b64url(str) { return Core.b64urlEncode(str); }
  function shareUrl(trip) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    var code = trip.remoteCode;
    var q = '?trip=' + encodeURIComponent(code);
    var cfg = Store.firebaseConfig();
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
        '링크에 Firebase 설정이 함께 담겨 있어서 따로 설정할 필요가 없습니다.</div>';
      html += '<div class="kv mt12"><span class="k">참여 중인 일행</span><span class="v">' +
        (trip.members || []).map(function (m) { return UI.esc(m.name); }).join(' · ') + '</span></div>';
      html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">닫기</button></div>';
    } else {
      var cfgOk = !!Store.firebaseConfig();
      html += '<div class="note">지금은 <b>이 기기에만 저장</b>되는 상태예요. 일행과 실시간으로 함께 쓰려면 ' +
        '무료 Firebase 저장소를 연결하면 됩니다. 설정 방법은 1분이면 끝나요.</div>';
      html += '<div class="card flat mt12" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">현재 모드</span><span class="v">로컬 저장</span></div>' +
        '<div class="kv"><span class="k">Firebase 설정</span><span class="v">' + (cfgOk ? '입력됨' : '없음') + '</span></div>' +
      '</div>';
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
      TL.App.openTrip(trip.id, 'schedule');
      UI.toast('참여했어요');
    }).catch(function (e) {
      UI.toast('참여 실패: ' + (e.message || e));
    });
  };

  /* ============================================================== 설정 */
  D.settings = function (trip) {
    trip = trip || TL.App.currentTrip();
    var s = Store.settings();
    var cfg = s.firebase;
    var html = '';
    html += '<div class="form-row"><label class="fl">내 이름 (닉네임)</label>' +
      '<input class="input" id="f_nick" value="' + UI.esc(s.nickname) + '" placeholder="예: 재원" maxlength="12">' +
      '<div class="hintline">결제자를 고를 때 기본값으로 쓰여요.</div>' +
      '<button class="btn btn-ghost sm mt8" data-action="save-nick" style="width:100%">닉네임 저장</button></div>';

    html += '<div class="section-title" style="margin-top:20px"><h2>일행과 실시간 공유</h2>' +
      '<span class="pill ' + (cfg ? 'mint' : 'gray') + '">' + (cfg ? '설정됨' : '미설정') + '</span></div>';
    html += '<div class="note">GitHub Pages는 저장소가 없어서, <b>무료 Firebase Firestore</b>를 저장소로 씁니다. ' +
      '한 번만 설정하면 일행 누구나 링크만 열어 함께 편집할 수 있어요.</div>';

    if (!cfg) {
      html += '<div class="note mt8"><b>1분 설정 순서</b><ol>' +
        '<li><a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a> → <b>프로젝트 추가</b> (이름 아무거나, 애널리틱스는 꺼도 됨)</li>' +
        '<li>왼쪽 <b>Build › Firestore Database</b> → <b>데이터베이스 만들기</b> → 위치 <b>asia-northeast3(서울)</b> → <b>프로덕션 모드로 시작</b></li>' +
        '<li>프로젝트 설정(⚙) › <b>내 앱</b> › 웹 <b>&lt;/&gt;</b> 추가 → <b>firebaseConfig</b> 복사</li>' +
        '<li>Firestore <b>규칙</b> 탭에 아래 규칙을 붙여넣고 <b>게시</b></li>' +
        '<li>복사한 설정을 아래에 붙여넣고 <b>저장</b></li>' +
      '</ol></div>';
      html += '<div class="code-box light" id="rules">' + UI.esc(D.RULES) + '</div>' +
        '<button class="btn btn-ghost sm mt8" data-action="copy-rules" style="width:100%">규칙 복사</button>';
      html += '<div class="form-row mt12"><label class="fl">firebaseConfig 붙여넣기</label>' +
        '<textarea class="input" id="f_fb" placeholder=\'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}\' style="min-height:116px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px"></textarea>' +
        '<div class="hintline">따옴표·중괄호까지 그대로 붙여넣으면 됩니다. (또는 apiKey / projectId / appId 세 줄만 입력)</div>' +
        '<button class="btn btn-mint mt8" data-action="save-fb">저장하고 연결 테스트</button></div>';
    } else {
      html += '<div class="card flat mt8" style="border:1px solid var(--line);padding:2px 14px">' +
        '<div class="kv"><span class="k">프로젝트</span><span class="v">' + UI.esc(cfg.projectId || '-') + '</span></div>' +
        '<div class="kv"><span class="k">App ID</span><span class="v">' + UI.esc(cfg.appId || '(없음)') + '</span></div>' +
        '<div class="kv"><span class="k">상태</span><span class="v" id="fb-status">연결 테스트 전</span></div>' +
      '</div>' +
      '<div class="btn-row mt8">' +
        '<button class="btn btn-ghost sm" data-action="test-fb" style="flex:1">연결 테스트</button>' +
        '<button class="btn btn-ghost sm" data-action="remove-fb" style="flex:1">설정 지우기</button>' +
      '</div>' +
      '<details class="mt12"><summary class="tiny muted" style="cursor:pointer">설정 다시 입력하기</summary>' +
        '<div class="form-row mt8"><textarea class="input" id="f_fb" placeholder="firebaseConfig JSON" style="min-height:110px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px"></textarea>' +
        '<button class="btn btn-ghost mt8" data-action="save-fb">새 설정으로 저장</button></div></details>';
    }

    html += '<div class="section-title" style="margin-top:22px"><h2>환율 (참고값)</h2></div>' +
      '<div class="note" style="margin-bottom:8px">지출을 입력할 때 통화별로 직접 고칠 수 있어요. 여기 값은 새 지출의 기본값입니다.</div>';
    html += '<div class="card flat" style="border:1px solid var(--line);padding:6px 14px">' +
      ['JPY', 'USD', 'EUR', 'THB', 'VND'].map(function (code) {
        var v = (s.defaultRates[code] || Core.DEFAULT_RATES[code]);
        return '<div class="kv"><span class="k">1 ' + code + ' ' + Core.curInfo(code).symbol + '</span>' +
          '<span class="v" style="max-width:45%"><input class="input" id="rate_' + code + '" inputmode="decimal" value="' + v + '" style="height:38px;text-align:right"></span></div>';
      }).join('') + '</div>' +
      '<button class="btn btn-ghost sm mt8" data-action="save-rates" style="width:100%">환율 저장</button>';

    html += '<div class="section-title" style="margin-top:22px"><h2>데이터</h2></div>' +
      '<div class="btn-row"><button class="btn btn-ghost sm" data-action="export-json">' + UI.icon('download', 17) + 'JSON 백업</button>' +
      '<button class="btn btn-ghost sm" data-action="import-json">' + UI.icon('upload', 17) + 'JSON 복원</button></div>' +
      '<input type="file" id="json-file" accept="application/json,.json" class="hidden">' +
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
    "    match /trips/{code} { allow read, write: if true; }\n" +
    "    match /trips/{code}/{document=**} { allow read, write: if true; }\n" +
    "    match /triplog_meta/{doc} { allow read, write: if true; }\n" +
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
      Store.setFirebase(cfg);
      D.settings(TL.App.currentTrip());
      UI.toast('연결됐어요! 이제 여행에서 공유를 켜세요');
    }).catch(function (e) {
      Store.setFirebase(cfg);
      UI.toast('저장은 했지만 테스트 실패: ' + (e.code || e.message || e));
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
  A['remove-fb'] = function () {
    if (!confirm('Firebase 설정을 지울까요? 실시간 공유가 끊기고 로컬 저장으로 돌아갑니다.')) return;
    Store.setFirebase(null);
    Store.disconnect();
    D.settings(TL.App.currentTrip());
    UI.toast('설정을 지웠어요');
  };
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
