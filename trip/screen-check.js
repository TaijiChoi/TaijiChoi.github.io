/* 트립로그 — 체크리스트 탭 */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var S = (TL.Screens = TL.Screens || {});

  S.DEFAULT_CHECKLIST = [
    '여권 유효기간 6개월 이상 확인',
    '항공권 · 숙소 예약 확인서 저장',
    '여행자보험 가입',
    'eSIM / 유심 준비',
    '충전기 · 보조배터리',
    '상비약 (소화제 · 밴드)',
    '세면도구 · 선크림',
    '현금 환전',
    '접이식 우산',
    '멀티 어댑터'
  ];

  S.check = function (trip, view) {
    var items = ((trip.data && trip.data.checklist) || []).slice().sort(function (a, b) {
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      return oa - ob;
    });
    var done = items.filter(function (i) { return i.done; }).length;
    var pct = items.length ? Math.round((done / items.length) * 100) : 0;
    var members = trip.members || [];

    var html = '<div class="body">';
    html += '<div class="card pad">' +
      '<div class="row between" style="margin-bottom:9px">' +
        '<span style="font-size:14px;font-weight:750">준비물 <span class="muted" style="font-weight:600">' + done + '/' + items.length + '</span></span>' +
        '<span class="pill ' + (items.length && done === items.length ? 'mint' : 'blue') + '">' + pct + '%</span>' +
      '</div>' +
      '<div class="progress"><div class="fill" style="width:' + pct + '%"></div></div>' +
      (items.length ? '' : '<div class="hintline">기본 준비물 목록을 불러와서 하나씩 체크해 보세요.</div>') +
    '</div>';

    if (!items.length) {
      html += '<div class="empty" style="margin-top:14px">' +
        '<div class="emo">🎒</div><h3>준비물을 챙겨볼까요</h3>' +
        '<p>여행 준비물 기본 목록을 불러오면 바로 시작할 수 있어요.</p>' +
        '<div class="btn-row"><button class="btn btn-mint" data-action="load-template">' + UI.icon('sparkle') + '기본 준비물 불러오기</button></div>' +
      '</div>';
    } else {
      html += '<div class="card pad mt12" style="padding:2px 15px">' + items.map(function (it) {
        var who = Store.memberName(trip, it.assigneeId);
        return '<div class="chk' + (it.done ? ' done' : '') + '">' +
          '<button class="box" data-action="toggle-check" data-id="' + UI.esc(it.id) + '" aria-label="체크">' + UI.icon('check', 14) + '</button>' +
          '<button class="chk-main" data-action="edit-check" data-id="' + UI.esc(it.id) + '" aria-label="' + UI.esc(it.text) + ' 수정">' +
            '<span class="tx">' + UI.esc(it.text) + '</span>' +
            (who ? '<span class="who">' + UI.avatar(who, 'xs') + '</span>' : '<span class="who tiny muted">담당</span>') +
          '</button>' +
          '<button class="icon-btn sm" data-action="del-check" data-id="' + UI.esc(it.id) + '" aria-label="삭제">' + UI.icon('trash', 16) + '</button>' +
        '</div>';
      }).join('') + '</div>';

      html += '<div class="card pad mt12">' +
        '<div class="tiny" style="font-weight:750;margin-bottom:8px">항목 추가</div>' +
        '<div class="inline-add" style="margin-top:0">' +
          '<input class="input" id="chk-new" placeholder="예: 돼지코 어댑터" maxlength="60">' +
          (members.length ? '<select class="input" id="chk-who" style="width:96px;flex:none">' +
            '<option value="">담당</option>' +
            members.map(function (m) { return '<option value="' + UI.esc(m.id) + '">' + UI.esc(m.name) + '</option>'; }).join('') +
            '</select>' : '') +
          '<button class="btn btn-soft" style="width:auto;height:44px;padding:0 14px;flex:none" data-action="add-check">추가</button>' +
        '</div>' +
      '</div>';
    }

    if (items.length) {
      html += '<div class="row" style="gap:8px;margin-top:12px">' +
        '<button class="btn btn-ghost sm" style="flex:1" data-action="load-template">' + UI.icon('sparkle', 16) + '기본 목록 추가</button>' +
        '<button class="btn btn-ghost sm" style="flex:1" data-action="clear-done">' + UI.icon('trash', 16) + '완료 항목 지우기</button>' +
      '</div>';
    }
    html += '</div>';
    return html;
  };
})(typeof window !== 'undefined' ? window : globalThis);
