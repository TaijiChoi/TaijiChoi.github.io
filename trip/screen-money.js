/* 트립로그 — 가계부 탭 (요약 · 필터 · 내역 · N/1 정산 · CSV) */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core, Store = TL.Store, UI = TL.UI;
  var S = (TL.Screens = TL.Screens || {});

  S.money = function (trip, view) {
    var data = trip.data;
    var t = Core.totals(trip, data);
    var dayKeys = Core.dayList(trip).map(function (d) { return d.key; });
    var dayFilter = view.mDay || 'all';
    if (dayFilter !== 'all' && dayKeys.indexOf(dayFilter) < 0) dayFilter = 'all';
    var catFilter = view.mCat || 'all';
    if (catFilter !== 'all' && !Core.EXP_CATS.some(function (c) { return c.key === catFilter; })) catFilter = 'all';
    var html = '<div class="body">';

    /* ---- 요약 카드 */
    var avg = (trip.members || []).length ? Math.round(t.shared / trip.members.length) : 0;
    html += '<div class="sum-card">' +
      '<button class="sum-export" data-action="export-csv">' + UI.icon('download', 14) + 'CSV</button>' +
      '<div class="lab">총 지출 (원화 환산)</div>' +
      '<div class="big">' + Core.fmt(t.total) + '<span class="unit">원</span></div>' +
      '<div class="split">' +
        '<div><div class="k">정산 대상</div><b>' + Core.won(t.shared) + '</b></div>' +
        '<div><div class="k">나만 보기</div><b>' + Core.won(t.personal) + '</b></div>' +
        '<div><div class="k">1인 평균</div><b>' + Core.won(avg) + '</b></div>' +
      '</div>' +
    '</div>';

    /* ---- 일별 막대 */
    var days = Core.dayList(trip);
    var maxDay = 1;
    days.forEach(function (d) { maxDay = Math.max(maxDay, t.byDay[d.key] || 0); });
    html += '<div class="card pad mt12">' +
      '<div class="section-title"><h2>일별 지출</h2><span class="hint">원화 기준</span></div>' +
      '<div class="mini-bars">' + days.map(function (d) {
        var v = t.byDay[d.key] || 0;
        return '<div class="mini-bar">' +
          '<span class="k">' + d.label + '</span>' +
          '<span class="track"><span class="fill" style="width:' + Math.round((v / maxDay) * 100) + '%;' + (v ? '' : 'opacity:0') + '"></span></span>' +
          '<span class="v">' + (v ? Core.fmt(v) : '-') + '</span>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';

    /* ---- 카테고리 비율 */
    var cats = Object.keys(t.byCat).map(function (k) { return { key: k, v: t.byCat[k] }; })
      .sort(function (a, b) { return b.v - a.v; });
    html += '<div class="card pad mt12">' +
      '<div class="section-title"><h2>카테고리별</h2><span class="hint">총 ' + Core.fmt(t.total) + '원</span></div>';
    if (!cats.length) {
      html += '<div class="empty-settle">지출을 추가하면 비율이 보여요</div>';
    } else {
      html += '<div class="ratio">' + cats.map(function (c) {
        var info = Core.expCat(c.key);
        var pct = Core.pct(c.v, t.total);
        return '<div class="ratio-row">' +
          '<span class="ratio-ic" style="background:' + info.color + '">' + UI.icon(info.icon, 12) + '</span>' +
          '<span class="ratio-mid"><span class="nm"><span>' + info.label + '</span><span>' + pct + '%</span></span>' +
          '<span class="track"><span class="fill" style="width:' + pct + '%;background:' + info.color + '"></span></span></span>' +
          '<span class="amt">' + Core.fmt(c.v) + '</span>' +
        '</div>';
      }).join('') + '</div>';
    }
    html += '</div>';

    /* ---- 필터 */
    html += '<div class="section-title mt16" style="align-items:center">' +
      '<h2>지출 내역</h2>' +
      '<span class="row gap6">' +
        '<span class="tiny muted">' + ((trip.data.expenses || []).length) + '건</span>' +
      '</span>' +
    '</div>';
    html += '<div class="chips small" style="margin:0 -16px 6px">' +
      ['all'].concat(days.map(function (d) { return d.key; })).map(function (k) {
        var label = k === 'all' ? '전체' : Core.dayLabel(trip, k);
        return '<button class="chip' + (dayFilter === k ? ' active' : '') + '" data-action="filter-day" data-day="' + k + '">' + label + '</button>';
      }).join('') + '</div>';
    html += '<div class="chips small" style="margin:0 -16px 10px">' +
      ['all'].concat(Core.EXP_CATS.map(function (c) { return c.key; })).map(function (k) {
        var label = k === 'all' ? '카테고리 전체' : Core.expCat(k).label;
        return '<button class="chip' + (catFilter === k ? ' active' : '') + '" data-action="filter-cat" data-cat="' + k + '">' + label + '</button>';
      }).join('') + '</div>';

    /* ---- 내역 */
    var list = ((trip.data && trip.data.expenses) || []).filter(function (e) {
      if (dayFilter !== 'all' && e.dayKey !== dayFilter) return false;
      if (catFilter !== 'all' && e.category !== catFilter) return false;
      return true;
    });
    list = Core.orderExpenses(trip, list);

    if (!list.length) {
      html += '<div class="empty"><div class="emo">🧾</div><h3>지출이 없어요</h3>' +
        '<p>' + (data.expenses && data.expenses.length ? '필터를 바꾸면 다른 지출이 보여요.' : '여행 중 쓴 돈을 기록하면 정산까지 자동으로 계산돼요.') + '</p>' +
        '<div class="btn-row"><button class="btn btn-soft" data-action="add-expense">' + UI.icon('plus') + '지출 추가</button></div></div>';
    } else {
      var groups = {};
      var order = [];
      list.forEach(function (e) {
        var k = e.dayKey || 'prep';
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(e);
      });
      html += '<div class="card pad" style="padding:4px 15px">';
      order.forEach(function (k) {
        var sum = groups[k].reduce(function (a, e) { return a + Core.expenseKRW(e, trip); }, 0);
        html += '<div class="day-head" style="margin-top:12px">' +
          '<span>' + Core.dayLabel(trip, k) + '</span>' +
          '<span class="tiny muted">' + Core.daySubLabel(trip, k) + '</span>' +
          '<span class="line"></span><span class="sum">' + Core.fmt(sum) + '원</span></div>';
        html += groups[k].map(function (e) { return S.expRow(trip, e); }).join('');
      });
      html += '</div>';
    }

    /* ---- 정산 */
    var set = Core.settle(trip, data);
    html += '<div class="card pad mt16">' +
      '<div class="section-title"><h2>정산 (N/1)</h2>' +
      '<span class="hint">' + (trip.members || []).length + '명 기준</span></div>';
    if (!(trip.members || []).length) {
      html += '<div class="empty-settle">일행을 먼저 등록해 주세요.</div>';
    } else {
      html += set.rows.map(function (r) {
        var cls = r.balance > 0.5 ? 'pos' : (r.balance < -0.5 ? 'neg' : 'zero');
        var txt = r.balance > 0.5 ? '+' + Core.fmt(r.balance) : (r.balance < -0.5 ? '-' + Core.fmt(-r.balance) : '0');
        return '<div class="settle-row">' +
          '<span class="nm">' + UI.avatar(r.name) + '<span>' + UI.esc(r.name) + '</span></span>' +
          '<span class="nums">냈음 ' + Core.fmt(r.paid) + '<br>부담 ' + Core.fmt(r.owed) + '</span>' +
          '<span class="bal ' + cls + '">' + txt + '</span>' +
        '</div>';
      }).join('');

      if (set.transfers.length) {
        html += '<div style="margin-top:12px">' +
          '<div class="tiny" style="font-weight:750;color:var(--ink-2);margin-bottom:6px">이렇게 보내면 정산 끝</div>' +
          set.transfers.map(function (tr) {
            return '<div class="transfer">' +
              '<span>' + UI.esc(tr.fromName) + '</span>' +
              '<span class="arrow">' + UI.icon('swap', 15) + '</span>' +
              '<span>' + UI.esc(tr.toName) + '</span>' +
              '<span class="amt">' + Core.won(tr.amount) + '</span>' +
            '</div>';
          }).join('') +
        '</div>';
      } else {
        html += '<div class="empty-settle" style="padding-top:12px">✅ ' + UI.esc(set.hint) + '</div>';
      }
      if (set.excluded > 0) {
        html += '<div class="hintline" style="margin-top:10px">🔒 나만 보기로 표시한 ' + Core.won(set.excluded) + '은(는) 정산에서 빠졌어요.</div>';
      }
    }
    html += '</div>';

    html += '</div>';
    return html;
  };

  S.expRow = function (trip, e) {
    var cat = Core.expCat(e.category);
    var krw = Core.expenseKRW(e, trip);
    var foreign = e.currency && e.currency !== 'KRW';
    var charged = Number(e.chargedKRW) > 0;
    var payer = Store.memberName(trip, e.payerId) || '결제자 미정';
    var shared = (e.sharedWith && e.sharedWith.length) ? e.sharedWith.length : (trip.members || []).length;
    var subs = [Core.dayLabel(trip, e.dayKey), payer, e.private ? '나만 보기' : shared + '명 함께'];
    if (charged && foreign) subs.push('추정 ' + Core.won(Core.toKRW(e.amount, e.currency, trip.rates, e.rate)));
    return '<button class="exp-row" data-action="edit-expense" data-id="' + UI.esc(e.id) + '" style="width:100%;background:none;border:0;border-bottom:1px solid #F1F4F9;text-align:left">' +
      '<span class="exp-ic" style="background:' + cat.color + '">' + UI.icon(cat.icon, 19) + '</span>' +
      '<span class="exp-main">' +
        '<span class="exp-title">' + UI.esc(e.title || cat.label) + (e.private ? ' 🔒' : '') + '</span>' +
        '<span class="exp-sub">' + UI.esc(subs.filter(Boolean).join(' · ')) + '</span>' +
      '</span>' +
      '<span class="exp-amt">' +
        '<span class="a">' + (foreign ? Core.amtLabel(e.amount, e.currency) : Core.won(e.amount)) + '</span>' +
        (charged ? '<span class="b charge">카드 ' + Core.won(e.chargedKRW) + '</span>' :
          (foreign ? '<span class="b">' + Core.won(krw) + '</span>' : '')) +
      '</span>' +
    '</button>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
