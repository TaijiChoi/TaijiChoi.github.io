/* 트립로그 — 샘플 여행 (첫 실행 시 보여주는 예시 데이터) */
(function (root) {
  'use strict';
  var TL = (root.TL = root.TL || {});
  var Core = TL.Core;

  function sch(id, dayKey, order, time, title, category, memo, place) {
    return {
      id: id, dayKey: dayKey, order: order, time: time || '', title: title,
      category: category, memo: memo || '', place: place || title,
      createdAt: '2026-11-01T00:00:00.000Z'
    };
  }
  var expSeq = 0;
  function exp(id, dayKey, title, amount, currency, rate, category, payerId, sharedWith, isPrivate, memo) {
    expSeq++;
    return {
      id: id, dayKey: dayKey, title: title, amount: amount, currency: currency, rate: rate,
      category: category, payerId: payerId, sharedWith: sharedWith || [],
      private: !!isPrivate, memo: memo || '',
      createdAt: '2026-11-01T00:00:' + (10 + expSeq < 60 ? '0' : '') + (10 + expSeq) + '.000Z'
    };
  }
  function chk(id, order, text, assigneeId, done) {
    return { id: id, order: order, text: text, assigneeId: assigneeId || '', done: !!done, createdAt: '2026-11-01T00:00:00.000Z' };
  }

  TL.sampleTrip = function () {
    var M1 = 'm_jw', M2 = 'm_wife', M3 = 'm_son';
    var all = [M1, M2, M3];
    return {
      id: 'trip_sample',
      name: '오사카 3박 4일',
      destination: '오사카 · 교토',
      startDate: Core.addDays(Core.todayISO(), 12),
      endDate: Core.addDays(Core.todayISO(), 15),
      baseCurrency: 'KRW',
      members: [
        { id: M1, name: '재원' },
        { id: M2, name: '아내' },
        { id: M3, name: '아들' }
      ],
      rates: { KRW: 1, JPY: 9.4 },
      sample: true,
      createdAt: new Date().toISOString(),
      data: {
        schedules: [
          sch('s_p1', 'prep', 0, '', '항공권 예약', 'transport', '인천 → 간사이 왕복 3인 · 09:20 출발', '인천국제공항'),
          sch('s_p2', 'prep', 1, '', '숙소 예약', 'stay', '난바 스테이 3박 · 조식 포함 · 무료 취소 ~11/28', '난바'),
          sch('s_p3', 'prep', 2, '', 'eSIM 구입', 'etc', '일행 3명 각 5GB / 4일', ''),
          sch('s_p4', 'prep', 3, '', '엔화 환전', 'etc', '5만엔 현금 + 트래블월렛', ''),
          sch('s_d1_1', 'd1', 0, '09:20', '인천공항 출발', 'transport', '수하물 23kg 1개씩 · 3시간 전 도착', '인천국제공항'),
          sch('s_d1_2', 'd1', 1, '11:10', '간사이공항 도착', 'transport', '입국심사 40분 예상', '간사이국제공항'),
          sch('s_d1_3', 'd1', 2, '13:00', '호텔 체크인', 'stay', '짐 먼저 맡기고 점심', '난바 스테이'),
          sch('s_d1_4', 'd1', 3, '15:30', '도톤보리 산책', 'sight', '글리코상 앞에서 사진 한 장', '도톤보리'),
          sch('s_d1_5', 'd1', 4, '18:30', '이치란 라멘', 'food', '웨이팅 30분 예상 · 2호점 추천', '이치란 도톤보리점'),
          sch('s_d2_1', 'd2', 0, '09:30', '오사카성', 'sight', '입장권 600엔 · 니시노마루 정원', '오사카성'),
          sch('s_d2_2', 'd2', 1, '12:30', '구로몬 시장', 'food', '참치회 · 우니 · 타코야키', '구로몬 시장'),
          sch('s_d2_3', 'd2', 2, '15:00', '신사이바시 쇼핑', 'shop', '아들 운동화 보기', '신사이바시'),
          sch('s_d2_4', 'd2', 3, '19:00', '우메다 공중정원', 'sight', '해질녘 야경 타이밍', '우메다 스카이빌딩'),
          sch('s_d3_1', 'd3', 0, '08:30', '교토 이동', 'transport', '한큐선 40분 · 라피트 대신 보통열차', '오사카우메다역'),
          sch('s_d3_2', 'd3', 1, '10:00', '후시미 이나리', 'sight', '천 개의 도리이 · 아침이 한산', '후시미 이나리 신사'),
          sch('s_d3_3', 'd3', 2, '13:00', '니시키 시장', 'food', '타마고야키 · 유바', '니시키 시장'),
          sch('s_d3_4', 'd3', 3, '16:00', '기온 거리', 'sight', '기모노 골목 산책', '기온'),
          sch('s_d3_5', 'd3', 4, '19:30', '이자카야 저녁', 'food', '예약 필요할 수 있음', '폰토초'),
          sch('s_d4_1', 'd4', 0, '10:00', '체크아웃', 'stay', '짐은 프런트 보관', '난바 스테이'),
          sch('s_d4_2', 'd4', 1, '11:00', '난바 파크스', 'shop', '기념품 · 마지막 쇼핑', '난바 파크스'),
          sch('s_d4_3', 'd4', 2, '14:00', '공항 이동', 'transport', '난카이선 45분', '난바역'),
          sch('s_d4_4', 'd4', 3, '16:30', '간사이공항 출발', 'transport', '면세점 20분 정도만', '간사이국제공항')
        ],
        expenses: [
          exp('e1', 'prep', '항공권 3인 왕복', 1050000, 'KRW', 1, 'transport', M1, all, false, '대한항공 위탁 23kg'),
          exp('e2', 'prep', '숙소 3박', 54000, 'JPY', 9.4, 'stay', M2, all, false, '조식 포함'),
          exp('e3', 'prep', 'eSIM 3개', 33000, 'KRW', 1, 'etc', M1, all, false, ''),
          exp('e4', 'd1', '공항철도', 1940, 'JPY', 9.4, 'transport', M1, all, false, '난카이 라피트'),
          exp('e5', 'd1', '이치란 라멘', 3900, 'JPY', 9.4, 'food', M2, all, false, ''),
          exp('e6', 'd2', '오사카성 입장', 1800, 'JPY', 9.4, 'ticket', M1, all, false, '3명'),
          exp('e7', 'd2', '구로몬 시장', 8500, 'JPY', 9.4, 'food', M1, all, false, '참치회 · 우니'),
          exp('e8', 'd2', '우메다 공중정원', 4500, 'JPY', 9.4, 'ticket', M2, all, false, ''),
          exp('e9', 'd3', '교토 한큐 왕복', 2400, 'JPY', 9.4, 'transport', M1, all, false, ''),
          exp('e10', 'd3', '기념품', 6800, 'JPY', 9.4, 'shop', M2, all, false, '아들 가방'),
          exp('e11', 'd3', '마사지', 3000, 'JPY', 9.4, 'etc', M2, [], true, '혼자 받음 · 정산 제외')
        ],
        checklist: [
          chk('c1', 0, '여권 유효기간 6개월 이상 확인', M1, true),
          chk('c2', 1, 'eSIM 설치 · 개통 테스트', M1, false),
          chk('c3', 2, '충전기 · 보조배터리', M2, false),
          chk('c4', 3, '상비약 (소화제 · 밴드)', M2, false),
          chk('c5', 4, '접이식 우산', M3, false),
          chk('c6', 5, '엔화 현금 5만엔', M1, false),
          chk('c7', 6, '여행자보험 가입', M1, true),
          chk('c8', 7, '멀티 어댑터 (일본 A형)', M3, false)
        ]
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
