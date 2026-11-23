/* 트립로그 — 순수 로직 (DOM 없음)
   dates · currency · totals · N/1 settlement · CSV
   브라우저와 테스트 러너 양쪽에서 쓸 수 있도록 전역 네임스페이스에 붙인다. */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = (TL.Core = {});

  /* ---------------------------------------------------------------- ids */
  var seq = 0;
  Core.uid = function (prefix) {
    seq = (seq + 1) % 100000;
    return (prefix || 'id') + '_' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  };

  Core.num = function (v, def) {
    var n = Number(String(v == null ? '' : v).replace(/[,\s₩원]/g, ''));
    return isFinite(n) ? n : (def == null ? 0 : def);
  };
  Core.clamp = function (n, lo, hi) { return Math.min(hi, Math.max(lo, n)); };

  /* ------------------------------------------------------------ format */
  function group(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  Core.fmt = function (n, dec) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    dec = dec || 0;
    var fixed = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
    var sign = '';
    if (fixed.charAt(0) === '-') { sign = '-'; fixed = fixed.slice(1); }
    var parts = fixed.split('.');
    return sign + group(parts[0]) + (parts[1] ? '.' + parts[1] : '');
  };
  Core.won = function (krw) { return Core.fmt(krw) + '원'; };
  Core.pct = function (a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; };

  /* ---------------------------------------------------------- currency */
  // rate = 1단위당 원화. 참고용 기본값이며 사용자가 직접 고칠 수 있다.
  Core.CURRENCIES = [
    { code: 'KRW', symbol: '₩', name: '대한민국 원', dec: 0, rate: 1 },
    { code: 'JPY', symbol: '¥', name: '일본 엔', dec: 0, rate: 9.4 },
    { code: 'USD', symbol: '$', name: '미국 달러', dec: 2, rate: 1375 },
    { code: 'EUR', symbol: '€', name: '유로', dec: 2, rate: 1490 },
    { code: 'VND', symbol: '₫', name: '베트남 동', dec: 0, rate: 0.054 },
    { code: 'THB', symbol: '฿', name: '태국 바트', dec: 2, rate: 38.5 },
    { code: 'TWD', symbol: 'NT$', name: '대만 달러', dec: 0, rate: 42 },
    { code: 'CNY', symbol: '¥', name: '중국 위안', dec: 2, rate: 190 },
    { code: 'HKD', symbol: 'HK$', name: '홍콩 달러', dec: 2, rate: 176 },
    { code: 'SGD', symbol: 'S$', name: '싱가포르 달러', dec: 2, rate: 1020 },
    { code: 'PHP', symbol: '₱', name: '필리핀 페소', dec: 0, rate: 24 },
    { code: 'MYR', symbol: 'RM', name: '말레이시아 링깃', dec: 2, rate: 310 },
    { code: 'AUD', symbol: 'A$', name: '호주 달러', dec: 2, rate: 900 },
    { code: 'GBP', symbol: '£', name: '영국 파운드', dec: 2, rate: 1745 }
  ];
  Core.DEFAULT_RATES = (function () {
    var o = {};
    Core.CURRENCIES.forEach(function (c) { o[c.code] = c.rate; });
    return o;
  })();
  Core.curInfo = function (code) {
    for (var i = 0; i < Core.CURRENCIES.length; i++) if (Core.CURRENCIES[i].code === code) return Core.CURRENCIES[i];
    return { code: code || 'KRW', symbol: code || '₩', name: code || '원', dec: 0, rate: 1 };
  };
  Core.rateOf = function (rates, code) {
    if (!code || code === 'KRW') return 1;
    var r = rates && Number(rates[code]);
    if (isFinite(r) && r > 0) return r;
    var d = Core.DEFAULT_RATES[code];
    return isFinite(d) && d > 0 ? d : 1;
  };
  Core.toKRW = function (amount, code, rates, customRate) {
    var amt = Core.num(amount, 0);
    if (!code || code === 'KRW') return Math.round(amt);
    var r = isFinite(Number(customRate)) && Number(customRate) > 0 ? Number(customRate) : Core.rateOf(rates, code);
    return Math.round(amt * r);
  };
  Core.amtLabel = function (amount, code) {
    var c = Core.curInfo(code);
    return c.symbol + Core.fmt(amount, c.dec);
  };

  /* ------------------------------------------------------------- dates */
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  Core.pad = pad;
  Core.iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  Core.todayISO = function () { return Core.iso(new Date()); };
  Core.parse = function (isoStr) {
    if (!isoStr) return null;
    var p = String(isoStr).split('-').map(Number);
    if (p.length < 3 || !p[0]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  };
  Core.addDays = function (isoStr, n) {
    var d = Core.parse(isoStr) || new Date();
    d.setDate(d.getDate() + Number(n || 0));
    return Core.iso(d);
  };
  Core.diffDays = function (aISO, bISO) {
    var a = Core.parse(aISO), b = Core.parse(bISO);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  };
  Core.isoLabel = function (isoStr) {
    var d = Core.parse(isoStr);
    if (!d) return '';
    return (d.getMonth() + 1) + '.' + d.getDate() + ' (' + WD[d.getDay()] + ')';
  };
  Core.isoFullLabel = function (isoStr) {
    var d = Core.parse(isoStr);
    if (!d) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' (' + WD[d.getDay()] + ')';
  };
  Core.rangeLabel = function (start, end) {
    if (!start) return '';
    if (!end || end === start) return Core.isoLabel(start);
    var a = Core.parse(start), b = Core.parse(end);
    var sameYear = a && b && a.getFullYear() === b.getFullYear();
    return (sameYear ? '' : (a ? a.getFullYear() + '.' : '')) + Core.isoLabel(start) + ' ~ ' + Core.isoLabel(end);
  };
  Core.nights = function (start, end) {
    var n = Core.diffDays(start, end);
    return Math.max(0, n);
  };
  /** '930' → '09:30', '14:5' → '14:05', 빈 값은 '' */
  Core.normTime = function (v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var h, m;
    if (/^\d{1,2}:\d{1,2}$/.test(s)) {
      var p = s.split(':');
      h = Number(p[0]); m = Number(p[1]);
    } else {
      var d = s.replace(/[^\d]/g, '');
      if (d.length === 1 || d.length === 2) { h = Number(d); m = 0; }
      else if (d.length === 3) { h = Number(d.slice(0, 1)); m = Number(d.slice(1)); }
      else if (d.length === 4) { h = Number(d.slice(0, 2)); m = Number(d.slice(2)); }
      else return s;
    }
    if (!(h >= 0 && h <= 23) || !(m >= 0 && m <= 59)) return s;
    return pad(h) + ':' + pad(m);
  };

  Core.dday = function (trip) {
    if (!trip || !trip.startDate) return '';
    var today = Core.todayISO();
    var toStart = Core.diffDays(today, trip.startDate);
    var toEnd = Core.diffDays(today, trip.endDate || trip.startDate);
    if (toStart > 0) return 'D-' + toStart;
    if (toStart === 0) return 'D-DAY';
    if (toEnd >= 0) return '여행 중';
    return '다녀옴';
  };
  Core.tripDayCount = function (trip) {
    if (!trip || !trip.startDate) return 1;
    var n = Core.diffDays(trip.startDate, trip.endDate || trip.startDate) + 1;
    return Core.clamp(n, 1, 60);
  };
  /** [{key:'prep',label:'사전준비'}, {key:'d1',label:'Day 1',date:'2026-12-05'}, ...] */
  Core.dayList = function (trip) {
    var out = [{ key: 'prep', label: '사전준비', date: null }];
    var n = Core.tripDayCount(trip);
    for (var i = 1; i <= n; i++) {
      out.push({ key: 'd' + i, label: 'Day ' + i, date: Core.addDays(trip.startDate, i - 1) });
    }
    return out;
  };
  Core.dayInfo = function (trip, key) {
    var list = Core.dayList(trip);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0];
  };
  Core.dayLabel = function (trip, key) { return Core.dayInfo(trip, key).label; };
  Core.daySubLabel = function (trip, key) {
    var d = Core.dayInfo(trip, key);
    return d.date ? Core.isoLabel(d.date) : '출발 전';
  };
  Core.dayIndex = function (trip, key) {
    var list = Core.dayList(trip);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return i;
    return 0;
  };
  Core.dayKeyOfDate = function (trip, isoStr) {
    if (!trip || !trip.startDate || !isoStr) return 'prep';
    var n = Core.diffDays(trip.startDate, isoStr);
    if (n < 0) return 'prep';
    return 'd' + (Core.clamp(n, 0, Core.tripDayCount(trip) - 1) + 1);
  };

  /* ---------------------------------------------------------- calendar */
  /** 실제로 존재하는 'YYYY-MM-DD'인지 (2026-02-30 같은 값 거르기) */
  Core.isISODate = function (s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s))) return false;
    var d = Core.parse(s);
    return !!d && Core.iso(d) === String(s);
  };
  Core.monthKeyOf = function (isoStr) {
    var d = Core.parse(isoStr) || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  Core.monthLabel = function (monthKey) {
    var p = String(monthKey || '').split('-');
    if (p.length < 2) return '';
    return Number(p[0]) + '년 ' + Number(p[1]) + '월';
  };
  Core.shiftMonth = function (monthKey, n) {
    var p = String(monthKey || '').split('-');
    var y = Number(p[0]) || 2000, m = Number(p[1]) || 1;
    var d = new Date(y, m - 1 + Number(n || 0), 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  Core.daysInMonth = function (monthKey) {
    var p = String(monthKey || '').split('-');
    var y = Number(p[0]), m = Number(p[1]);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
  };
  /** 한 달 달력: 앞뒤 달을 채운 6주 × 7일 = 42칸 */
  Core.monthGrid = function (monthKey) {
    var p = String(monthKey || '').split('-');
    var y = Number(p[0]) || 2000, m = Number(p[1]) || 1;
    if (m < 1 || m > 12) {
      y = y + Math.floor((m - 1) / 12);
      m = ((m - 1) % 12 + 12) % 12 + 1;
    }
    var offset = new Date(y, m - 1, 1).getDay();
    var first = new Date(y, m - 1, 1 - offset);
    var today = Core.todayISO();
    var out = [];
    for (var i = 0; i < 42; i++) {
      var d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      out.push({ iso: Core.iso(d), day: d.getDate(), wd: d.getDay(), out: d.getMonth() !== m - 1, today: Core.iso(d) === today });
    }
    return out;
  };
  Core.monthWeeks = function (monthKey) {
    var g = Core.monthGrid(monthKey), weeks = [];
    for (var i = 0; i < g.length; i += 7) weeks.push(g.slice(i, i + 7));
    return weeks;
  };
  /** 두 날짜를 순서대로 정리 (시작일 > 종료일 방지) */
  Core.rangeOrder = function (a, b) {
    if (!a && !b) return { start: '', end: '' };
    if (!a) return { start: b, end: b };
    if (!b) return { start: a, end: a };
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  };
  Core.isoMD = function (isoStr) {
    var d = Core.parse(isoStr);
    if (!d) return '';
    return (d.getMonth() + 1) + '.' + d.getDate();
  };
  Core.isoMDwd = function (isoStr) {
    var d = Core.parse(isoStr);
    if (!d) return '';
    return (d.getMonth() + 1) + '.' + d.getDate() + ' (' + WD[d.getDay()] + ')';
  };
  Core.stayLabel = function (start, end) {
    if (!Core.isISODate(start)) return '';
    var n = Math.max(0, Core.diffDays(start, Core.isISODate(end) ? end : start));
    return n === 0 ? '당일치기' : n + '박 ' + (n + 1) + '일';
  };
  /** 달력 요약용: '12.5 (토) ~ 12.8 (화) · 3박 4일' */
  Core.rangeSummary = function (start, end) {
    if (!Core.isISODate(start)) return '';
    var e = Core.isISODate(end) ? end : start;
    var a = Core.isoMDwd(start);
    return (e === start ? a : a + ' ~ ' + Core.isoMDwd(e)) + ' · ' + Core.stayLabel(start, e);
  };
  /** 여행 기간 상한(60일) 검사: {ok, days, error} */
  Core.checkRange = function (start, end) {
    if (!Core.isISODate(start) || !Core.isISODate(end)) return { ok: false, days: 0, error: '날짜를 다시 골라 주세요' };
    var r = Core.rangeOrder(start, end);
    var days = Core.diffDays(r.start, r.end) + 1;
    if (days > 60) return { ok: false, days: days, error: '여행 기간은 60일까지 정할 수 있어요' };
    return { ok: true, days: days, start: r.start, end: r.end, error: '' };
  };

  /* --------------------------------------------------------- categories */
  Core.SCHED_CATS = [
    { key: 'sight', label: '관광', icon: 'camera' },
    { key: 'food', label: '식당', icon: 'food' },
    { key: 'cafe', label: '카페', icon: 'cup' },
    { key: 'stay', label: '숙소', icon: 'bed' },
    { key: 'transport', label: '교통', icon: 'transport' },
    { key: 'shop', label: '쇼핑', icon: 'bag' },
    { key: 'etc', label: '기타', icon: 'pin' }
  ];
  Core.EXP_CATS = [
    { key: 'food', label: '식비', icon: 'food', color: '#368FFF' },
    { key: 'stay', label: '숙박', icon: 'bed', color: '#00C7AE' },
    { key: 'transport', label: '교통', icon: 'transport', color: '#7C5CFF' },
    { key: 'shop', label: '쇼핑', icon: 'bag', color: '#FF8A3D' },
    { key: 'ticket', label: '관광·입장', icon: 'camera', color: '#FF5C8A' },
    { key: 'cafe', label: '카페', icon: 'cup', color: '#F5A623' },
    { key: 'etc', label: '기타', icon: 'pin', color: '#8A94A6' }
  ];
  Core.schedCat = function (key) {
    for (var i = 0; i < Core.SCHED_CATS.length; i++) if (Core.SCHED_CATS[i].key === key) return Core.SCHED_CATS[i];
    return Core.SCHED_CATS[Core.SCHED_CATS.length - 1];
  };
  Core.expCat = function (key) {
    for (var i = 0; i < Core.EXP_CATS.length; i++) if (Core.EXP_CATS[i].key === key) return Core.EXP_CATS[i];
    return Core.EXP_CATS[Core.EXP_CATS.length - 1];
  };

  /* ------------------------------------------------------------- lists */
  function byOrder(a, b) {
    var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
    if (oa !== ob) return oa - ob;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  }
  Core.sortedSchedules = function (data, dayKey) {
    var list = (data && data.schedules) || [];
    list = list.filter(function (s) { return !dayKey || dayKey === 'all' || s.dayKey === dayKey; });
    return list.slice().sort(function (a, b) {
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      if (oa !== ob) return oa - ob;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
  };
  /** dayKey 순서대로 정렬한 일정 (전체) */
  Core.orderSchedules = function (trip, list) {
    var dayIdx = {};
    Core.dayList(trip).forEach(function (d, i) { dayIdx[d.key] = i; });
    return list.slice().sort(function (a, b) {
      var da = dayIdx[a.dayKey] == null ? 0 : dayIdx[a.dayKey];
      var db = dayIdx[b.dayKey] == null ? 0 : dayIdx[b.dayKey];
      if (da !== db) return da - db;
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      if (oa !== ob) return oa - ob;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
  };
  Core.orderExpenses = function (trip, list) {
    var dayIdx = {};
    Core.dayList(trip).forEach(function (d, i) { dayIdx[d.key] = i; });
    return list.slice().sort(function (a, b) {
      var da = dayIdx[a.dayKey] == null ? 0 : dayIdx[a.dayKey];
      var db = dayIdx[b.dayKey] == null ? 0 : dayIdx[b.dayKey];
      if (da !== db) return da - db;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  };

  /* ------------------------------------------------------------ totals */
  Core.expenseKRW = function (e, trip) {
    // 카드 실청구액이 있으면 그 금액이 정산·합계의 기준이다 (원래 외화 금액은 그대로 남는다)
    var charged = Number(e && e.chargedKRW);
    if (isFinite(charged) && charged > 0) return Math.round(charged);
    var rate = e.rate;
    var r = isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : Core.rateOf(trip && trip.rates, e.currency);
    return Core.toKRW(e.amount, e.currency, trip && trip.rates, r);
  };
  Core.totals = function (trip, data) {
    var list = (data && data.expenses) || [];
    var out = { total: 0, shared: 0, personal: 0, byDay: {}, byCat: {}, count: list.length };
    list.forEach(function (e) {
      var krw = Core.expenseKRW(e, trip);
      out.total += krw;
      if (e.private) out.personal += krw; else out.shared += krw;
      out.byDay[e.dayKey || 'prep'] = (out.byDay[e.dayKey || 'prep'] || 0) + krw;
      var cat = e.category || 'etc';
      out.byCat[cat] = (out.byCat[cat] || 0) + krw;
    });
    return out;
  };

  /* -------------------------------------------------------- settlement */
  /**
   * N/1 정산.
   * - 각 지출: 결제자가 전액 부담 후, '함께 쓴 사람'에게 균등 분배.
   * - private(나만 보기) 지출은 정산에서 제외.
   * - 최소 이체 횟수(그리디) 결과 반환.
   */
  Core.settle = function (trip, data) {
    var members = (trip && trip.members) || [];
    var ids = members.map(function (m) { return m.id; });
    var paid = {}, owed = {};
    members.forEach(function (m) { paid[m.id] = 0; owed[m.id] = 0; });

    var list = (data && data.expenses) || [];
    var excluded = 0;
    list.forEach(function (e) {
      if (e.private) { excluded += Core.expenseKRW(e, trip); return; }
      var krw = Core.expenseKRW(e, trip);
      var payer = e.payerId;
      if (!payer || ids.indexOf(payer) < 0) payer = ids[0];
      if (!payer) return;
      var shared = (e.sharedWith && e.sharedWith.length ? e.sharedWith : ids).filter(function (id) {
        return ids.indexOf(id) >= 0;
      });
      if (!shared.length) shared = ids.slice();
      if (!shared.length) return;
      paid[payer] = (paid[payer] || 0) + krw;
      var each = krw / shared.length;
      shared.forEach(function (id) { owed[id] = (owed[id] || 0) + each; });
    });

    var rows = members.map(function (m) {
      var p = Math.round(paid[m.id] || 0);
      var o = Math.round(owed[m.id] || 0);
      return { id: m.id, name: m.name, paid: p, owed: o, balance: p - o };
    });

    var debtors = rows.filter(function (r) { return r.balance < -0.5; })
      .map(function (r) { return { id: r.id, name: r.name, amount: -r.balance }; })
      .sort(function (a, b) { return b.amount - a.amount; });
    var creditors = rows.filter(function (r) { return r.balance > 0.5; })
      .map(function (r) { return { id: r.id, name: r.name, amount: r.balance }; })
      .sort(function (a, b) { return b.amount - a.amount; });

    var transfers = [];
    var i = 0, j = 0, guard = 0;
    while (i < debtors.length && j < creditors.length && guard++ < 500) {
      var amt = Math.min(debtors[i].amount, creditors[j].amount);
      var rounded = Math.round(amt);
      if (rounded >= 1) {
        transfers.push({ fromId: debtors[i].id, fromName: debtors[i].name, toId: creditors[j].id, toName: creditors[j].name, amount: rounded });
      }
      debtors[i].amount -= amt;
      creditors[j].amount -= amt;
      if (debtors[i].amount < 0.5) i++;
      if (creditors[j].amount < 0.5) j++;
    }

    return {
      rows: rows,
      transfers: transfers,
      excluded: excluded,
      hint: transfers.length === 0 ? (rows.length > 1 ? '정산할 금액이 없어요' : '일행을 추가하면 정산이 계산돼요') : transfers.length + '건의 이체로 정산 완료'
    };
  };

  /* --------------------------------------------------------------- CSV */
  Core.csvCell = function (v) {
    var s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  Core.csv = function (trip, data) {
    var members = (trip && trip.members) || [];
    var nameOf = function (id) {
      for (var i = 0; i < members.length; i++) if (members[i].id === id) return members[i].name;
      return '';
    };
    var head = ['구분', '날짜', '내용', '카테고리', '금액', '통화', '환율(원)', '원화금액', '결제한사람', '함께쓴사람', '나만보기', '메모', '카드실청구액'];
    var rows = [head.join(',')];
    var list = Core.orderExpenses(trip, (data && data.expenses) || []);
    list.forEach(function (e) {
      var day = Core.dayInfo(trip, e.dayKey || 'prep');
      var krw = Core.expenseKRW(e, trip);
      var rate = e.currency === 'KRW' || !e.currency ? 1 : (isFinite(Number(e.rate)) && Number(e.rate) > 0 ? Number(e.rate) : Core.rateOf(trip && trip.rates, e.currency));
      var shared = (e.sharedWith && e.sharedWith.length ? e.sharedWith : members.map(function (m) { return m.id; }))
        .map(nameOf).filter(Boolean).join(' · ');
      rows.push([
        day.label,
        day.date || '',
        e.title || '',
        Core.expCat(e.category).label,
        Number(e.amount) || 0,
        e.currency || 'KRW',
        rate,
        krw,
        nameOf(e.payerId),
        shared,
        e.private ? 'Y' : '',
        e.memo || '',
        isFinite(Number(e.chargedKRW)) && Number(e.chargedKRW) > 0 ? Math.round(Number(e.chargedKRW)) : ''
      ].map(Core.csvCell).join(','));
    });
    var t = Core.totals(trip, data);
    rows.push('');
    rows.push(['합계', '', '', '', '', '', '', t.total, '', '', '', '', ''].map(Core.csvCell).join(','));
    rows.push(['정산제외(나만보기)', '', '', '', '', '', '', t.personal, '', '', '', '', ''].map(Core.csvCell).join(','));
    return '\ufeff' + rows.join('\r\n') + '\r\n';
  };

  /* -------------------------------------------------------------- geo */
  Core.hasGeo = function (it) {
    if (!it) return false;
    var la = Number(it.lat), ln = Number(it.lng);
    if (!isFinite(la) || !isFinite(ln)) return false;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
    return !(la === 0 && ln === 0);
  };
  /** 두 좌표의 직선거리(km) — 하버사인 */
  Core.distanceKm = function (a, b) {
    if (!Core.hasGeo(a) || !Core.hasGeo(b)) return 0;
    var rad = Math.PI / 180;
    var dLat = (Number(b.lat) - Number(a.lat)) * rad;
    var dLng = (Number(b.lng) - Number(a.lng)) * rad;
    var la1 = Number(a.lat) * rad, la2 = Number(b.lat) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  /** 직선거리 기준 도보 시간(분). 도심 평균 4.5km/h */
  Core.walkMin = function (km) { return km > 0 ? Math.max(1, Math.round((km / 4.5) * 60)) : 0; };
  /** 직선거리 기준 차량 시간(분). 도심 평균 22km/h + 승하차 3분 */
  Core.carMin = function (km) { return km > 0 ? Math.max(2, Math.round((km / 22) * 60) + 3) : 0; };
  Core.durLabel = function (min) {
    var m = Math.round(Number(min) || 0);
    if (m <= 0) return '-';
    if (m < 60) return m + '분';
    return Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
  };
  Core.kmLabel = function (km) {
    var k = Number(km) || 0;
    if (k < 1) return Math.round(k * 1000) + 'm';
    return (k < 10 ? k.toFixed(1) : String(Math.round(k))) + 'km';
  };
  /** 순서대로 놓인 일정들의 구간별 거리·예상 시간. 좌표가 없는 일정은 건너뛴다. */
  Core.segments = function (items) {
    var geo = (items || []).filter(Core.hasGeo);
    var out = [];
    for (var i = 1; i < geo.length; i++) {
      var km = Core.distanceKm(geo[i - 1], geo[i]);
      out.push({
        fromId: geo[i - 1].id, toId: geo[i].id,
        fromTitle: geo[i - 1].title || '', toTitle: geo[i].title || '',
        from: geo[i - 1], to: geo[i],
        km: km, walkMin: Core.walkMin(km), carMin: Core.carMin(km)
      });
    }
    return out;
  };
  /** 구간 길찾기 링크 (카카오맵 = 자동차, 구글맵 = 도보·대중교통) */
  Core.directionsLinks = function (a, b) {
    if (!Core.hasGeo(a) || !Core.hasGeo(b)) return null;
    var an = encodeURIComponent(String(a.placeName || a.place || a.title || '출발').slice(0, 40));
    var bn = encodeURIComponent(String(b.placeName || b.place || b.title || '도착').slice(0, 40));
    var ala = Number(a.lat), aln = Number(a.lng), bla = Number(b.lat), bln = Number(b.lng);
    return {
      kakao: 'https://map.kakao.com/link/from/' + an + ',' + ala + ',' + aln + '/to/' + bn + ',' + bla + ',' + bln,
      google: 'https://www.google.com/maps/dir/?api=1&origin=' + ala + ',' + aln + '&destination=' + bla + ',' + bln + '&travelmode=walking',
      googleCar: 'https://www.google.com/maps/dir/?api=1&origin=' + ala + ',' + aln + '&destination=' + bla + ',' + bln + '&travelmode=driving'
    };
  };

  /* ------------------------------------------------- 지도 타일 소스 (v17) */
  /** 동선 지도에 쓸 타일 소스. 알 수 없는 값은 구글지도로 본다. */
  Core.MAP_SOURCES = {
    google: {
      key: 'google', label: '구글지도', note: 'Google 지도',
      url: 'https://mt{s}.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}',
      subdomains: ['0', '1', '2', '3'], maxZoom: 19, attribution: '&copy; Google'
    },
    osm: {
      key: 'osm', label: 'OSM', note: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: [], maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }
  };
  Core.mapSourceKeys = ['google', 'osm'];
  Core.mapSource = function (key) {
    var k = String(key == null ? '' : key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(Core.MAP_SOURCES, k) ? Core.MAP_SOURCES[k] : Core.MAP_SOURCES.google;
  };
  /** 타일 URL 템플릿에 값을 채운 실제 주소 (디버그·테스트용) */
  Core.tileUrl = function (key, z, x, y, s) {
    var src = Core.mapSource(key);
    return src.url.replace('{s}', String(s == null ? 0 : s)).replace('{z}', String(z))
      .replace('{x}', String(x)).replace('{y}', String(y));
  };
  /** 좌표 있는 일정을 순서대로 이은 구글 지도 길찾기 URL (1곳이면 장소 검색) */
  Core.routeMapUrl = function (items) {
    var pts = (items || []).filter(Core.hasGeo).map(function (it) {
      return Number(it.lat) + ',' + Number(it.lng);
    });
    if (!pts.length) return '';
    if (pts.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + pts[0];
    var MAX = 10;                       // 구글 지도는 출발·도착 포함 10곳까지 한 번에
    if (pts.length > MAX) pts = pts.slice(0, MAX);
    var url = 'https://www.google.com/maps/dir/?api=1&origin=' + pts[0] +
      '&destination=' + pts[pts.length - 1];
    var mid = pts.slice(1, -1);
    if (mid.length) url += '&waypoints=' + mid.join('%7C');
    return url;
  };
  Core.routeMapLabel = function (count) {
    return Number(count) > 1 ? '구글지도로 전체 동선 보기' : '구글지도에서 장소 보기';
  };

  /* --------------------------------------------------------- overlap */
  Core.timeMin = function (t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(t == null ? '' : t).trim());
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  Core.minLabel = function (min) {
    var m = ((Math.round(Number(min) || 0) % 1440) + 1440) % 1440;
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  };
  /**
   * 같은 날 일정 중 시간이 겹치는 쌍. 일정 하나는 기본 60분(또는 duration 분)을 차지한다고 본다.
   * 시간이 비어 있는 일정은 비교에서 뺀다.
   */
  Core.overlapPairs = function (items, durMin) {
    var def = Number(durMin) > 0 ? Number(durMin) : 60;
    var timed = (items || []).map(function (it) {
      var st = Core.timeMin(it.time);
      var len = Number(it.duration) > 0 ? Number(it.duration) : def;
      return st == null ? null : { it: it, start: st, end: st + len };
    }).filter(Boolean).sort(function (a, b) { return a.start - b.start; });
    var out = [];
    for (var i = 0; i < timed.length; i++) {
      for (var j = i + 1; j < timed.length; j++) {
        if (timed[j].start >= timed[i].end) break;
        out.push({
          aId: timed[i].it.id, bId: timed[j].it.id,
          aTitle: timed[i].it.title || '', bTitle: timed[j].it.title || '',
          aTime: timed[i].it.time, bTime: timed[j].it.time,
          overlapMin: Math.min(timed[i].end, timed[j].end) - timed[j].start
        });
      }
    }
    return out;
  };
  /** 겹침에 걸린 일정 id 집합 */
  Core.overlapIds = function (items, durMin) {
    var ids = {};
    Core.overlapPairs(items, durMin).forEach(function (p) { ids[p.aId] = 1; ids[p.bId] = 1; });
    return ids;
  };

  /* ---------------------------------------------------------- rates */
  /** open.er-api.com/v6/latest/KRW 응답 → {JPY: 9.43, USD: 1375, ...} (1단위당 원화) */
  Core.ratesFromERAPI = function (payload) {
    if (!payload || payload.result === 'error') return null;
    var r = payload.rates;
    if (!r || typeof r !== 'object') return null;
    var out = {};
    Object.keys(r).forEach(function (code) {
      if (!/^[A-Z]{3}$/.test(code) || code === 'KRW') return;
      var v = Number(r[code]);
      if (!(v > 0)) return;
      var per = 1 / v;
      if (!(per > 0) || !isFinite(per)) return;
      out[code] = per >= 1 ? Math.round(per * 100) / 100 : Math.round(per * 10000) / 10000;
    });
    return out;
  };

  /* ---------------------------------------------------- reservations */
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var AIRPORTS = {
    '인천국제공항': '인천', '김포국제공항': '김포', '김해국제공항': '김해', '제주국제공항': '제주', '대구국제공항': '대구',
    '간사이국제공항': '간사이', '간사이공항': '간사이', '이타미공항': '오사카 이타미', '나리타국제공항': '나리타', '하네다공항': '하네다',
    '후쿠오카공항': '후쿠오카', '신치토세공항': '삿포로', '나하공항': '오키나와', '타오위안국제공항': '타이베이',
    '수완나품국제공항': '방콕', '치앙마이공항': '치앙마이', '창이국제공항': '싱가포르', '푸둥국제공항': '상하이',
    '홍콩국제공항': '홍콩', '다낭국제공항': '다낭', '떤선녓국제공항': '호찌민', '노이바이국제공항': '하노이',
    '니노이아키노공항': '마닐라', '파리 샤를드골': '파리', '히스로공항': '런던', '프랑크푸르트공항': '프랑크푸르트',
    '존에프케네디공항': '뉴욕 JFK', '로스앤젤레스공항': 'LA', '샌프란시스코공항': '샌프란시스코',
    '시애틀터코마공항': '시애틀', '호놀룰루공항': '호놀룰루', '괌국제공항': '괌', '사이판공항': '사이판',
    '시드니공항': '시드니', '두바이국제공항': '두바이', '인천공항': '인천', '김포공항': '김포',
    'ICN': '인천', 'GMP': '김포', 'PUS': '김해', 'CJU': '제주', 'TAE': '대구', 'KIX': '간사이', 'ITM': '오사카 이타미',
    'NRT': '나리타', 'HND': '하네다', 'FUK': '후쿠오카', 'CTS': '삿포로', 'OKA': '오키나와', 'TPE': '타이베이',
    'BKK': '방콕', 'CNX': '치앙마이', 'SIN': '싱가포르', 'PVG': '상하이', 'SHA': '상하이', 'PEK': '베이징',
    'HKG': '홍콩', 'DAD': '다낭', 'SGN': '호찌민', 'HAN': '하노이', 'MNL': '마닐라', 'CDG': '파리', 'LHR': '런던',
    'FRA': '프랑크푸르트', 'JFK': '뉴욕 JFK', 'LAX': 'LA', 'SFO': '샌프란시스코', 'SEA': '시애틀',
    'HNL': '호놀룰루', 'GUM': '괌', 'SPN': '사이판', 'SYD': '시드니', 'DXB': '두바이'
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(y, m, d) {
    if (!y || !m || !d) return '';
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function nearest(list, idx, maxDist) {
    var best = null, bd = 1e9;
    (list || []).forEach(function (x) {
      var d = Math.abs(x.index - idx);
      if (d < bd) { bd = d; best = x; }
    });
    if (best && maxDist && bd > maxDist) return null;
    return best;
  }
  /** idx가 있는 줄의 [시작, 끝] 위치. 체크인/아웃처럼 같은 줄에 붙은 값만 고를 때 쓴다. */
  function lineRange(text, idx) {
    var s = String(text || '');
    var a = s.lastIndexOf('\n', Math.max(0, idx - 1)) + 1;
    var b = s.indexOf('\n', idx);
    if (b < 0) b = s.length;
    return [a, b];
  }
  function onSameLine(list, text, idx) {
    var r = lineRange(text, idx);
    var hit = (list || []).filter(function (x) { return x.index >= r[0] && x.index < r[1]; });
    return hit.length ? hit[0] : null;
  }
  /** 글 안의 날짜를 모두 찾는다: 2026-12-05, 2026.12.05, 2026년 12월 5일, 12/5, Dec 5, 2026, 5 Dec 2026 */
  Core.datesIn = function (text, fallbackYear) {
    var s = String(text || '');
    var y0 = Number(fallbackYear) || new Date().getFullYear();
    var found = [];
    var used = [];
    function push(iso, index) {
      if (!iso) return;
      for (var i = 0; i < used.length; i++) {
        if (index >= used[i][0] && index <= used[i][1]) return;
      }
      used.push([index, index + 10]);
      found.push({ iso: iso, index: index });
    }
    var m;
    var re1 = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
    while ((m = re1.exec(s))) push(isoOf(Number(m[1]), Number(m[2]), Number(m[3])), m.index);
    var re2 = /(?:^|[^\d])(\d{1,2})\s*[.\/]\s*(\d{1,2})(?:[^\d]|$)/g;
    while ((m = re2.exec(s))) push(isoOf(y0, Number(m[1]), Number(m[2])), m.index);
    var re3 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/gi;
    while ((m = re3.exec(s))) {
      var mo = MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)];
      push(isoOf(m[3] ? Number(m[3]) : y0, mo, Number(m[2])), m.index);
    }
    var re4 = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s*(\d{4}))?/gi;
    while ((m = re4.exec(s))) {
      var mo4 = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
      push(isoOf(m[3] ? Number(m[3]) : y0, mo4, Number(m[1])), m.index);
    }
    found.sort(function (a, b) { return a.index - b.index; });
    return found;
  };
  /** 글 안의 시각을 모두 찾는다: 09:20, 9시 20분, 15시, 3:00 PM */
  Core.timesIn = function (text) {
    var s = String(text || '');
    var found = [];
    var used = [];
    function push(min, index, len) {
      if (min == null || min < 0 || min > 1439) return;
      for (var i = 0; i < used.length; i++) if (index < used[i][1] && index + len > used[i][0]) return;
      used.push([index, index + len]);
      found.push({ min: min, index: index, label: pad2(Math.floor(min / 60)) + ':' + pad2(min % 60) });
    }
    var m;
    var re1 = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi;
    while ((m = re1.exec(s))) {
      var h1 = Number(m[1]) % 12, mi1 = Number(m[2] || 0);
      if (/p/i.test(m[3])) h1 += 12;
      push(h1 * 60 + mi1, m.index, m[0].length);
    }
    var re2 = /(\d{1,2})\s*[:시]\s*(\d{1,2})?\s*분?/g;
    while ((m = re2.exec(s))) {
      var h2 = Number(m[1]), mi2 = Number(m[2] == null ? 0 : m[2]);
      if (h2 <= 23 && mi2 <= 59) push(h2 * 60 + mi2, m.index, m[0].length);
    }
    found.sort(function (a, b) { return a.index - b.index; });
    return found;
  };
  function flightNoIn(s) {
    var m = /(?:^|[\s(\[|,·])([A-Z]{2}\s?\d{3,4}|[A-Z]\d\s?\d{3,4}|\d[A-Z]\s?\d{3,4})(?=$|[\s)\].,·-])/.exec(String(s || ''));
    return m ? m[1].replace(/\s+/g, '') : '';
  }
  function refIn(s) {
    var text = String(s || '');
    var BAD = /^(confirmation|booking|reservation|number|code|hotel|flight|air|e-?ticket|pnr|no)$/i;
    var strong = /(?:예약\s*(?:번호|코드)|확인\s*(?:번호|코드)|booking\s*(?:no\.?|number|reference|ref)|confirmation\s*(?:no\.?|number|code)|reservation\s*(?:no\.?|number)|pnr|참조\s*번호|e-?ticket)\s*(?:[:：#]|번호)?\s*([A-Z0-9][A-Z0-9-]{3,16})/i.exec(text);
    if (strong && !BAD.test(strong[1])) return strong[1];
    var weak = /(?:booking|confirmation|reservation)\s*(?:id|ref(?:erence)?|no\.?|number|code)?\s*[:#]\s*([A-Z0-9][A-Z0-9-]{3,16})/i.exec(text);
    if (weak && !BAD.test(weak[1])) return weak[1];
    return '';
  }
  function airportsIn(s) {
    var text = String(s || '');
    var hits = [];
    Object.keys(AIRPORTS).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
      var re = new RegExp('(^|[^가-힣A-Za-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^가-힣A-Za-z])', 'g');
      var m;
      while ((m = re.exec(text))) {
        var start = m.index + m[1].length;
        var clash = false;
        for (var i = 0; i < hits.length; i++) {
          if (start < hits[i].end && start + k.length > hits[i].start) { clash = true; break; }
        }
        if (!clash) hits.push({ start: start, end: start + k.length, short: AIRPORTS[k] });
      }
    });
    hits.sort(function (a, b) { return a.start - b.start; });
    var out = [];
    hits.forEach(function (h) { if (!out.some(function (o) { return o.short === h.short; })) out.push(h); });
    return out;
  }
  function cleanLabel(line) {
    return String(line || '')
      .replace(/^\s*[\[【][^\]】]*[\]】]\s*/, '')
      .replace(/^\s*[(\(■●•\-*]+\s*/, '')
      .replace(/\s*[\)]\s*$/, '')
      .replace(/^\s*(숙소명|호텔명|숙소|호텔|hotel|name)\s*[:：]\s*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  /** 예약 확인서 글을 여러 건으로 나눈다 (빈 줄, 또는 한 줄에 한 건씩 적힌 형태) */
  function splitResBlocks(src) {
    var paras = String(src || '').split(/\n\s*\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var out = [];
    paras.forEach(function (p) {
      var lines = p.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var dated = lines.filter(function (l) { return Core.datesIn(l).length > 0; }).length;
      if (lines.length > 2 && dated >= 2) {
        var cur = [];
        lines.forEach(function (l) {
          var starts = Core.datesIn(l).length > 0 || flightNoIn(l) || /^\s*[\[【■]/.test(l);
          if (starts && cur.length && (Core.datesIn(cur[0]).length > 0 || flightNoIn(cur[0]))) {
            out.push(cur.join('\n'));
            cur = [];
          }
          cur.push(l);
        });
        if (cur.length) out.push(cur.join('\n'));
      } else {
        out.push(p);
      }
    });
    return out;
  }
  /**
   * 예약 확인서 텍스트 → 일정 초안 목록.
   * 항공(편명·공항·출도착), 숙소(체크인/아웃), 렌터카(픽업)를 알아보고,
   * 알아보지 못해도 날짜가 있으면 기타 일정으로 한 건 만든다.
   */
  Core.parseReservations = function (text, trip) {
    var src = String(text || '').replace(/\r\n?/g, '\n').trim();
    var out = { source: src, blocks: 0, drafts: [] };
    if (!src) return out;
    var year = trip && Core.isISODate(trip.startDate) ? Number(String(trip.startDate).slice(0, 4)) : new Date().getFullYear();
    var blocks = splitResBlocks(src);
    out.blocks = blocks.length;
    var DAY = function (iso) {
      if (!Core.isISODate(iso)) return 'prep';
      if (!trip || !trip.startDate) return 'prep';
      return Core.dayKeyOfDate(trip, iso);
    };
    var STAY = /(호텔|숙소|료칸|리조트|게스트하우스|호스텔|hotel|hostel|ryokan|resort|inn\b|airbnb|에어비앤비)/i;
    var CIN = /(체크\s*인|check\s*-?\s*in|입실)/i;
    var COUT = /(체크\s*아웃|check\s*-?\s*out|퇴실)/i;
    var CAR = /(렌터카|렌트카|렌트\s*카|rent\s*a?\s*car|rental\s*car|car\s*rental|픽업|pick\s*-?\s*up)/i;
    var FLIGHTY = /(항공|비행기|flight|airline|탑승|boarding)/i;

    blocks.forEach(function (block) {
      var dates = Core.datesIn(block, year);
      var times = Core.timesIn(block);
      var fl = flightNoIn(block);
      var air = airportsIn(block);
      var ref = refIn(block);
      var firstDate = dates[0] ? dates[0].iso : '';
      var stay = STAY.test(block);
      var car = !stay && CAR.test(block);
      var flight = !stay && !car && (!!fl || air.length >= 2 || (FLIGHTY.test(block) && air.length >= 1));

      if (flight) {
        var dep = times[0] ? times[0].label : '';
        var arr = times[1] ? times[1].label : '';
        var fromShort = air[0] ? air[0].short : '';
        var toShort = air[1] ? air[1].short : '';
        var title = (fl ? fl + ' ' : '항공 ') + (fromShort && toShort ? fromShort + ' → ' + toShort : (fromShort || toShort || '항공편'));
        var memo = [];
        if (dep) memo.push('출발 ' + dep);
        if (arr) memo.push('도착 ' + arr);
        if (ref) memo.push('예약번호 ' + ref);
        out.drafts.push({
          kind: 'flight', title: title.slice(0, 60), category: 'transport',
          time: dep, dayKey: DAY(firstDate), dateISO: firstDate,
          place: fromShort ? fromShort + '공항' : '', address: '', memo: memo.join(' · '), ref: ref
        });
        return;
      }
      if (stay && (CIN.test(block) || COUT.test(block))) {
        var hotelLine = '';
        block.split('\n').forEach(function (l) {
          if (hotelLine) return;
          if (!STAY.test(l)) return;
          var c = cleanLabel(l);
          if (c && !/^(체크\s*인|체크\s*아웃|check)/i.test(c)) hotelLine = c;
        });
        if (!hotelLine) {
          var hm = /(호텔|숙소|hotel|ryokan|resort|inn)\s*[:：]?\s*([^\n]{2,40})/i.exec(block.replace(/\n/g, ' '));
          hotelLine = hm ? cleanLabel(hm[0]) : '숙소';
        }
        hotelLine = hotelLine.replace(/\s*(체크\s*인|체크\s*아웃|check\s*-?\s*(in|out)).*$/i, '').slice(0, 40);
        var ci = CIN.exec(block);
        var co = COUT.exec(block);
        var ciDate = ci ? (onSameLine(dates, block, ci.index) || nearest(dates, ci.index, 60)) : dates[0];
        var coDate = co ? (onSameLine(dates, block, co.index) || nearest(dates, co.index, 60)) : (dates[1] || null);
        var ciTime = ci ? (onSameLine(times, block, ci.index) || nearest(times, ci.index, 12)) : (times[0] || null);
        var coTime = co ? (onSameLine(times, block, co.index) || nearest(times, co.index, 12)) : (times[1] || null);
        var mk = function (label, iso, tm) {
          out.drafts.push({
            kind: 'stay', title: (label + ' · ' + hotelLine).slice(0, 60), category: 'stay',
            time: tm ? tm.label : '', dayKey: DAY(iso), dateISO: iso || '',
            place: hotelLine, address: '', memo: ref ? '예약번호 ' + ref : '', ref: ref
          });
        };
        if (ci || ciDate) mk('숙소 체크인', ciDate ? ciDate.iso : '', ciTime);
        if (co || coDate) mk('숙소 체크아웃', coDate ? coDate.iso : '', coTime);
        if (!ci && !co && firstDate) mk('숙소', firstDate, times[0] || null);
        return;
      }
      if (car) {
        var carLine = '';
        block.split('\n').forEach(function (l) {
          if (carLine) return;
          if (!CAR.test(l)) return;
          var c = cleanLabel(l).replace(/^\s*(렌터카|렌트카|렌트|rental\s*car|rent\s*a?\s*car|car\s*rental)\s*[:：]?\s*/i, '').trim();
          if (c && !/^(픽업|pick\s*-?\s*up|예약|확인)$/i.test(c)) carLine = c;
        });
        var carPlace = air.length ? air[0].short + '공항' : carLine;
        var carTitle = '렌터카 픽업' + (carPlace ? ' · ' + carPlace : '');
        out.drafts.push({
          kind: 'car', title: carTitle.slice(0, 60), category: 'transport',
          time: times[0] ? times[0].label : '', dayKey: DAY(firstDate), dateISO: firstDate,
          place: carPlace, address: '', memo: ref ? '예약번호 ' + ref : '', ref: ref
        });
        return;
      }
      // 알아보지 못한 예약: 날짜가 있으면 기타 일정 한 건
      if (firstDate) {
        var line = '';
        block.split('\n').some(function (l) {
          var c = cleanLabel(l);
          if (!c || Core.datesIn(c).length || Core.timesIn(c).length === c.length) return false;
          line = c; return true;
        });
        if (!line) line = cleanLabel(block.split('\n')[0]) || '예약';
        out.drafts.push({
          kind: 'etc', title: line.slice(0, 60), category: 'etc',
          time: times[0] ? times[0].label : '', dayKey: DAY(firstDate), dateISO: firstDate,
          place: '', address: '', memo: ref ? '예약번호 ' + ref : '', ref: ref
        });
      }
    });

    var seen = {};
    out.drafts = out.drafts.filter(function (d) {
      var k = d.title + '|' + d.dayKey + '|' + d.time;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    out.drafts.forEach(function (d, i) { d.key = 'rd' + i; });
    return out;
  };

  /* ------------------------------------------------------------ misc */
  Core.inviteCode = function () {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외
    var s = '';
    for (var i = 0; i < 6; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  };
  Core.b64urlEncode = function (str) {
    if (typeof TextEncoder === 'undefined' || typeof btoa === 'undefined') {
      return encodeURIComponent(str);
    }
    var bytes = new TextEncoder().encode(String(str));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  Core.b64urlDecode = function (str) {
    var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  /* ------------------------------------------------------------ 계정 */
  /** 이메일에서 @ 앞부분 (displayName이 없을 때 쓸 이름) */
  Core.localPart = function (email) {
    var s = String(email == null ? '' : email).trim();
    var at = s.indexOf('@');
    return (at > 0 ? s.slice(0, at) : s).trim();
  };
  /** 로그인 계정에서 화면에 보일 이름: displayName → 이메일 앞부분 → '나' (12자 제한) */
  Core.accountLabel = function (user) {
    var name = String((user && user.displayName) || '').trim();
    if (!name && user && user.email) name = Core.localPart(user.email);
    name = name.trim().slice(0, 12);
    return name || '나';
  };
  /** 여행에서 이 계정의 역할: 만든 사람이면 owner, 아니면 member */
  Core.tripRole = function (trip, uid) {
    if (!trip || !uid) return 'member';
    return trip.ownerUid === uid ? 'owner' : 'member';
  };
  /** 기기 여행 목록과 계정 여행 목록을 맞출 계획
      pull: 계정에는 있는데 이 기기에 없는 초대코드(가져올 것)
      register: 이 기기 원격 여행 중 계정에 없는 코드(올릴 것)
      localOnly: 초대코드가 없어 계정에 올릴 수 없는 여행 id(로컬 전용) */
  Core.accountPlan = function (localTrips, accountTrips) {
    function codeOf(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
    var valid = /^[A-Z0-9]{4,10}$/;
    var localCodes = [];
    var localOnly = [];
    (localTrips || []).forEach(function (t) {
      if (!t) return;
      var c = codeOf(t.remoteCode || t.inviteCode);
      if (valid.test(c)) { if (localCodes.indexOf(c) < 0) localCodes.push(c); }
      else if (t.sample) return;              // 예시 여행은 계정에 올리지 않는다
      else if (t.id) localOnly.push(t.id);
    });
    var accountCodes = [];
    (accountTrips || []).forEach(function (a) {
      if (!a) return;
      var c = codeOf(a.remoteCode || a.code || a.id);
      if (!valid.test(c)) return;
      if (a.local) return;                    // 계정에만 적힌 로컬 여행은 다른 기기에서 못 연다
      if (accountCodes.indexOf(c) < 0) accountCodes.push(c);
    });
    return {
      pull: accountCodes.filter(function (c) { return localCodes.indexOf(c) < 0; }),
      register: localCodes.filter(function (c) { return accountCodes.indexOf(c) < 0; }),
      localOnly: localOnly,
      synced: localCodes.filter(function (c) { return accountCodes.indexOf(c) >= 0; }).length,
      remoteCount: localCodes.length
    };
  };
  Core.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  Core.mapLinks = function (place) {
    var q = encodeURIComponent(place || '');
    return {
      kakao: 'https://map.kakao.com/link/search/' + q,
      google: 'https://www.google.com/maps/search/?api=1&query=' + q
    };
  };
  /** 일정 하나의 지도 링크: 좌표가 있으면 정확한 위치로, 없으면 이름 검색으로 */
  Core.placeLinks = function (it) {
    var name = String((it && (it.placeName || it.place || it.title)) || '').trim();
    var base = Core.mapLinks(name);
    if (!Core.hasGeo(it)) return { kakao: base.kakao, google: base.google, place: (it && it.placeUrl) || '' };
    return {
      kakao: 'https://map.kakao.com/link/map/' + encodeURIComponent(name || '위치') + ',' + Number(it.lat) + ',' + Number(it.lng),
      google: 'https://www.google.com/maps/search/?api=1&query=' + Number(it.lat) + ',' + Number(it.lng),
      place: (it && it.placeUrl) || ''
    };
  };
  /** 하루 안에서 order를 0..n-1로 정리한 목록을 돌려준다 (변경된 항목만 포함) */
  Core.normalize = function (list) {
    return list.slice().sort(function (a, b) {
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      return oa - ob;
    }).map(function (item, i) { return { item: item, order: i }; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
