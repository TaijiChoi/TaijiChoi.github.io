/* 트립로그 — 예약 보관함
   예약 확인서 텍스트를 붙여넣으면 일정 초안을 만들고, 원본은 여행에 저장한다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var R = (TL.Reserve = {});
  var A = (TL.Actions = TL.Actions || {});
  var st = { trip: null, text: '', parsed: null, checked: {} };

  var EXAMPLE = '[항공] 대한항공 KE721\n2026년 12월 5일 09:20 인천국제공항 → 간사이국제공항 11:10\n예약번호: ABC123\n\n' +
    '[숙소] 난바 스테이 호텔\n체크인 2026-12-05 15:00\n체크아웃 2026-12-08 11:00\n예약번호 NMB-7788';

  R.kindLabel = function (kind) {
    return kind === 'flight' ? '항공' : kind === 'stay' ? '숙소' : kind === 'car' ? '렌터카' : '예약';
  };

  R.previewHtml = function () {
    var drafts = (st.parsed && st.parsed.drafts) || [];
    if (!drafts.length) {
      return '<div class="note warn mt12">예약 내용을 알아보지 못했어요. 날짜·시간과 편명이나 호텔명이 들어 있는지 확인해 주세요.</div>';
    }
    var days = Core.dayList(st.trip);
    return '<div class="res-preview"><div class="section-title" style="margin-top:16px"><h2>일정 초안 ' + drafts.length + '개</h2>' +
      '<span class="hint">체크해서 추가</span></div>' +
      drafts.map(function (x, i) {
        var on = st.checked[x.key] !== false;
        return '<div class="res-row' + (on ? ' on' : '') + '" data-key="' + x.key + '">' +
          '<button type="button" class="box" data-action="res-toggle" data-key="' + x.key + '" aria-label="이 초안 선택">' + UI.icon('check', 14) + '</button>' +
          '<div class="res-body">' +
            '<input class="input res-title" id="res_t_' + i + '" value="' + UI.esc(x.title) + '" maxlength="60">' +
            '<div class="res-meta">' +
              '<span class="res-kind">' + R.kindLabel(x.kind) + '</span>' +
              '<select class="input res-day" id="res_d_' + i + '">' + days.map(function (day) {
                return '<option value="' + day.key + '"' + (day.key === x.dayKey ? ' selected' : '') + '>' + day.label + '</option>';
              }).join('') + '</select>' +
              '<input class="input res-time" id="res_tm_' + i + '" value="' + UI.esc(x.time || '') + '" placeholder="시간" maxlength="5" inputmode="numeric" aria-label="시간">' +
            '</div>' +
            (x.memo ? '<div class="hintline">' + UI.esc(x.memo) + '</div>' : '') +
          '</div></div>';
      }).join('') + '</div>';
  };

  R.savedHtml = function (trip) {
    var list = (trip.data.reservations || []).slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    if (!list.length) return '';
    return '<div class="section-title" style="margin-top:18px"><h2>저장된 예약</h2><span class="hint">' + list.length + '건</span></div>' +
      '<div class="card flat" style="border:1px solid var(--line);padding:2px 12px">' +
      list.map(function (r) {
        return '<div class="res-saved">' +
          '<div class="rs-main"><b>' + UI.esc(r.title || '예약 메모') + '</b>' +
            '<small>' + UI.esc(Core.isoFullLabel(String(r.createdAt || '').slice(0, 10)) || '') +
            (r.count ? ' · 초안 ' + r.count + '개' : '') + '</small></div>' +
          '<button class="btn xs btn-ghost" data-action="res-open" data-id="' + UI.esc(r.id) + '">불러오기</button>' +
          '<button class="icon-btn sm danger" data-action="res-del" data-id="' + UI.esc(r.id) + '" aria-label="예약 삭제">' + UI.icon('trash', 16) + '</button>' +
        '</div>';
      }).join('') + '</div>';
  };

  R.open = function (trip) {
    if (!trip) return;
    st.trip = trip;
    var html = '';
    html += '<div class="note">항공권·숙소·렌터카 예약 확인 메일을 통째로 붙여넣으면 날짜·시간·편명·호텔명을 읽어 <b>일정 초안</b>을 만들어요. 초안은 고쳐서 한 번에 추가할 수 있고, 원본은 예약 보관함에 남습니다.</div>';
    html += '<div class="form-row mt12"><label class="fl">예약 확인서 붙여넣기</label>' +
      '<textarea class="input res-text" id="res-text" placeholder="예) 대한항공 KE721&#10;2026년 12월 5일 09:20 인천 → 11:10 간사이&#10;예약번호 ABC123" style="min-height:118px">' +
      UI.esc(st.text) + '</textarea>' +
      '<div class="row between mt8"><button class="btn xs btn-ghost" data-action="res-example" type="button">예시 채우기</button>' +
      '<button class="btn btn-soft" style="width:auto;height:42px;padding:0 16px;flex:none" data-action="res-parse">' + UI.icon('sparkle', 16) + '분석</button></div></div>';
    if (st.parsed) html += R.previewHtml();
    html += R.savedHtml(trip);
    html += '<div class="sheet-foot"><button class="btn btn-ghost" data-action="close-modal">닫기</button>' +
      (st.parsed && st.parsed.drafts.length ? '<button class="btn btn-primary" data-action="res-add">' + UI.icon('plus', 18) + '일정에 추가</button>' : '') +
      '</div>';
    UI.open(html, '예약 보관함');
    var ta = document.getElementById('res-text');
    if (ta) ta.addEventListener('input', function () { st.text = ta.value; });
  };

  A['open-reserve'] = function () {
    var trip = TL.App.currentTrip();
    if (trip) { st.parsed = null; R.open(trip); }
  };
  A['res-example'] = function () {
    st.text = EXAMPLE;
    st.parsed = null;
    R.open(st.trip);
  };
  A['res-parse'] = function () {
    var el = document.getElementById('res-text');
    var txt = el ? el.value : st.text;
    st.text = txt;
    if (!String(txt || '').trim()) { UI.toast('예약 확인서를 붙여넣어 주세요'); return; }
    var out = Core.parseReservations(txt, st.trip);
    st.parsed = out;
    st.checked = {};
    out.drafts.forEach(function (d) { st.checked[d.key] = true; });
    R.open(st.trip);
    if (!out.drafts.length) UI.toast('예약 내용을 알아보지 못했어요. 날짜와 편명·호텔명을 확인해 주세요', 3200);
    else UI.toast(out.drafts.length + '개의 일정 초안을 만들었어요 (Day에 나눠 담았어요)');
  };
  A['res-toggle'] = function (el) {
    var key = el.getAttribute('data-key');
    var on = !(st.checked[key] !== false);
    st.checked[key] = on;
    el.classList.toggle('on', on);
    var row = el.closest('.res-row');
    if (row) row.classList.toggle('on', on);
  };
  A['res-add'] = function () {
    var trip = st.trip || TL.App.currentTrip();
    var drafts = (st.parsed && st.parsed.drafts) || [];
    if (!trip || !drafts.length) return;
    var payloads = [];
    var firstDay = '';
    drafts.forEach(function (x, i) {
      if (st.checked[x.key] === false) return;
      var tEl = document.getElementById('res_t_' + i);
      var dEl = document.getElementById('res_d_' + i);
      var tmEl = document.getElementById('res_tm_' + i);
      var title = (tEl && tEl.value ? tEl.value : x.title || '').trim();
      if (!title) return;
      var day = (dEl && dEl.value) || x.dayKey;
      var time = Core.normTime(tmEl && tmEl.value ? tmEl.value : x.time);
      if (!firstDay) firstDay = day;
      payloads.push({
        dayKey: day, time: time, title: title.slice(0, 60), category: x.category || 'etc',
        place: x.place || '', placeName: x.placeName || x.place || '', address: x.address || '',
        memo: x.memo || '', source: ''
      });
    });
    if (!payloads.length) { UI.toast('추가할 초안을 하나 이상 체크해 주세요'); return; }
    if (TL.App && TL.App.view) TL.App.view.day = firstDay;
    Store.addSchedulesBulk(trip.id, payloads);
    var text = st.text || '';
    if (String(text).trim()) {
      var firstTitle = payloads[0].title;
      var exists = (trip.data.reservations || []).some(function (r) { return r.text === text; });
      if (!exists) {
        Store.add(trip.id, 'reservations', { title: firstTitle, text: text.slice(0, 4000), count: payloads.length });
      }
    }
    st.parsed = null;
    st.text = '';
    UI.close();
    UI.toast(payloads.length + '개 일정을 추가했어요 · ' + Core.dayLabel(trip, firstDay));
  };
  A['res-open'] = function (el) {
    var trip = st.trip || TL.App.currentTrip();
    var id = el.getAttribute('data-id');
    var rec = null;
    ((trip && trip.data.reservations) || []).forEach(function (r) { if (r.id === id) rec = r; });
    if (!rec) return;
    st.text = rec.text;
    var out = Core.parseReservations(st.text, trip);
    st.parsed = out;
    st.checked = {};
    out.drafts.forEach(function (d) { st.checked[d.key] = true; });
    R.open(trip);
    UI.toast('저장된 예약을 다시 읽었어요 · 초안 ' + out.drafts.length + '개');
  };
  A['res-del'] = function (el) {
    var trip = st.trip || TL.App.currentTrip();
    if (!trip) return;
    if (!confirm('이 예약 메모를 보관함에서 지울까요?\n(이미 추가한 일정은 그대로 남아요)')) return;
    Store.remove(trip.id, 'reservations', el.getAttribute('data-id'));
    R.open(trip);
    UI.toast('예약 메모를 지웠어요');
  };
})(typeof window !== 'undefined' ? window : globalThis);
