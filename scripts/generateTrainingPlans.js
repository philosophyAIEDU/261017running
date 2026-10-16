// src/data/trainingPlans.json 생성 스크립트.
// 실행: node scripts/generateTrainingPlans.js
// 직접 JSON을 편집해도 되며, 이 스크립트는 기본 플랜을 다시 만들 때만 사용한다.
const fs = require('fs');
const path = require('path');

const min = (m) => m * 60;


function intervalWorkout(title, description, activityType, interval) {
  return { title, description, activityType, workout: { kind: 'interval', interval } };
}

function distanceWorkout(title, description, activityType, km) {
  return { title, description, activityType, workout: { kind: 'target', target: { distanceM: km * 1000, durationSec: null, speedMps: null } } };
}

function durationWorkout(title, description, activityType, minutes) {
  return { title, description, activityType, workout: { kind: 'target', target: { distanceM: null, durationSec: min(minutes), speedMps: null } } };
}

function weeks(plan, perWeek) {
  return perWeek.map((workouts, w) => ({ week: w + 1, workouts: workouts.map((wo, d) => ({ id: `${plan}-w${w + 1}-d${d + 1}`, ...wo })) }));
}

// 🏃 5K 입문: 걷기+달리기 인터벌로 시작해 8주 후 30분 연속 달리기
const c25kSteps = [
  [1, 1.5, 8],
  [1.5, 2, 6],
  [2, 2, 6],
  [3, 1.5, 5],
  [5, 2, 3],
  [8, 2, 2],
  [12, 2, 2],
];
const plan5k = weeks(
  '5k',
  [
    ...c25kSteps.map(([runMin, walkMin, reps]) => {
      const iv = { warmupSec: min(5), workSec: min(runMin), recoverSec: min(walkMin), repeats: reps, cooldownSec: min(5) };
      const t = `달리기 ${runMin}분 + 걷기 ${walkMin}분 × ${reps}`;
      return [
        intervalWorkout(t, '5분 빠르게 걷기로 몸을 풀고 시작하세요.', 'run', iv),
        intervalWorkout(t, '편하게 대화할 수 있는 속도로 달리세요.', 'run', iv),
        intervalWorkout(t, '이번 주 마지막 훈련! 무리하지 마세요.', 'run', iv),
      ];
    }),
    [durationWorkout('30분 연속 달리기', '쉬지 않고 30분 달리기에 도전!', 'run', 30), durationWorkout('25분 달리기', '가볍게 회복 달리기', 'run', 25), distanceWorkout('5K 달리기', '드디어 5K 완주!', 'run', 5)],
  ],
);

function progressive(planId, weeksCount, perWeek, baseKm, peakKm, raceKm, label) {
  const out = [];
  for (let w = 0; w < weeksCount; w += 1) {
    const isTaper = w >= weeksCount - 2;
    const isRace = w === weeksCount - 1;
    const progress = Math.min(1, w / Math.max(1, weeksCount - 3));
    const longKm = Math.round((baseKm + (peakKm - baseKm) * progress) * (isTaper && !isRace ? 0.7 : 1));
    const easyKm = Math.max(3, Math.round(longKm * 0.45));
    const list = [
      distanceWorkout(`편한 달리기 ${easyKm}km`, '대화가 가능한 편한 페이스로 달리세요.', 'run', easyKm),
      intervalWorkout('인터벌 3분 × 5', '빠르게 3분, 천천히 2분. 워밍업과 쿨다운 10분씩.', 'run', { warmupSec: min(10), workSec: min(3), recoverSec: min(2), repeats: 5, cooldownSec: min(10) }),
    ];
    if (perWeek >= 4) list.push(distanceWorkout(`템포 달리기 ${Math.max(5, Math.round(easyKm * 1.2))}km`, '조금 힘들지만 유지 가능한 페이스로.', 'run', Math.max(5, Math.round(easyKm * 1.2))));
    list.push(isRace ? distanceWorkout(`${label} 레이스!`, '그동안의 훈련을 믿고 달리세요.', 'run', raceKm) : distanceWorkout(`장거리 ${longKm}km`, '천천히, 꾸준히. 장거리는 속도보다 시간이 중요합니다.', 'run', longKm));
    out.push(list);
  }
  return weeks(planId, out);
}

const walkPlan = weeks(
  'walk4',
  [15, 20, 25, 30].map((m, w) => [
    durationWorkout(`${m}분 걷기`, '편한 신발을 신고 가볍게 걸어요.', 'walk', m),
    durationWorkout(`${m}분 걷기`, '팔을 자연스럽게 흔들며 걸어보세요.', 'walk', m),
    durationWorkout(`${m + 5}분 걷기`, '조금 더 빠른 걸음으로!', 'walk', m + 5),
    durationWorkout(`${m}분 걷기`, '주변 풍경을 즐기며 걸어요.', 'walk', m),
    distanceWorkout(`${2 + w}km 걷기`, '이번 주 마무리 걷기.', 'walk', 2 + w),
  ]),
);

const ridePlan = weeks(
  'ride50',
  [10, 15, 20, 25, 30, 35, 40, 50].map((km, w) => [
    durationWorkout(`${30 + w * 5}분 가볍게 타기`, '케이던스 80~90rpm을 유지해 보세요.', 'ride', 30 + w * 5),
    intervalWorkout('언덕/인터벌 2분 × 5', '2분 힘차게, 3분 회복.', 'ride', { warmupSec: min(10), workSec: min(2), recoverSec: min(3), repeats: 5, cooldownSec: min(10) }),
    distanceWorkout(w === 7 ? '50km 도전!' : `장거리 ${km}km`, w === 7 ? '드디어 50km! 보급을 챙기세요.' : '주말 장거리 라이딩. 물과 간식을 챙기세요.', 'ride', km),
  ]),
);

const plans = [
  { id: '5k-beginner', title: '5K 입문', activityType: 'run', icon: '🌱', level: '입문', description: '걷기와 달리기를 섞어 8주 만에 5K 완주', weeks: plan5k },
  { id: '10k', title: '10K 완주', activityType: 'run', icon: '🏃', level: '초급', description: '8주 동안 주 3회, 10K 완주 목표', weeks: progressive('10k', 8, 3, 5, 10, 10, '10K') },
  { id: 'half', title: '하프 마라톤', activityType: 'run', icon: '🥈', level: '중급', description: '12주 동안 주 4회, 하프 마라톤 완주', weeks: progressive('half', 12, 4, 8, 19, 21.1, '하프 마라톤') },
  { id: 'full', title: '풀코스 마라톤', activityType: 'run', icon: '🏅', level: '상급', description: '16주 동안 주 4회, 풀코스 완주', weeks: progressive('full', 16, 4, 12, 32, 42.2, '풀코스 마라톤') },
  { id: 'walk-habit', title: '걷기 습관 만들기', activityType: 'walk', icon: '🚶', level: '입문', description: '4주 동안 주 5회 걷기로 습관 만들기', weeks: walkPlan },
  { id: 'ride-50k', title: '첫 50km 도전', activityType: 'ride', icon: '🚴', level: '초급', description: '8주 동안 주 3회, 50km 라이딩 완주', weeks: ridePlan },
];

const out = path.join(__dirname, '..', 'src', 'data', 'trainingPlans.json');
fs.writeFileSync(out, `${JSON.stringify(plans, null, 2)}\n`);
console.log(`wrote ${out}`);
