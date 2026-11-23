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
    return 'd' + (Core.clamp(n, 0, 59) + 1);
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
    var head = ['구분', '날짜', '내용', '카테고리', '금액', '통화', '환율(원)', '원화금액', '결제한사람', '함께쓴사람', '나만보기', '메모'];
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
        e.memo || ''
      ].map(Core.csvCell).join(','));
    });
    var t = Core.totals(trip, data);
    rows.push('');
    rows.push(['합계', '', '', '', '', '', '', t.total, '', '', '', ''].map(Core.csvCell).join(','));
    rows.push(['정산제외(나만보기)', '', '', '', '', '', '', t.personal, '', '', '', ''].map(Core.csvCell).join(','));
    return '\ufeff' + rows.join('\r\n') + '\r\n';
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
  /** 하루 안에서 order를 0..n-1로 정리한 목록을 돌려준다 (변경된 항목만 포함) */
  Core.normalize = function (list) {
    return list.slice().sort(function (a, b) {
      var oa = isFinite(a.order) ? a.order : 0, ob = isFinite(b.order) ? b.order : 0;
      return oa - ob;
    }).map(function (item, i) { return { item: item, order: i }; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
