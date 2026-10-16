# 달리기 · 산책 · 자전거 활동 기록 앱

React Native + Expo로 만든 활동 기록 앱입니다. 🏃 달리기, 🚶 산책, 🚴 자전거를 **하나의 트래킹 엔진**으로 기록하고, 분석·개인 기록·배지·훈련 플랜·장비 관리·센서 연동·긴급 문자까지 지원합니다.

- **백엔드가 없습니다.** 회원가입, 로그인, 서버 동기화, 소셜 기능이 없고 모든 데이터는 기기의 SQLite에만 저장됩니다.
- 네트워크는 **지도 타일 로딩에만** 사용합니다. 분석·광고·크래시 리포팅 SDK가 없으며, 인터넷 없이도 기록·조회·분석이 모두 동작합니다(지도 타일만 비어 보일 수 있음).
- 데이터 접근은 repository 인터페이스 뒤에 있어서, 나중에 서버를 붙일 때 구현체만 바꾸면 됩니다.

| 항목 | 버전 |
|---|---|
| Expo SDK | 58 (React Native 0.88, React 19.3) |
| TypeScript | 5.9 (strict, `noUnusedLocals`, `any` 금지 린트) |
| 라우팅 | Expo Router (파일 기반) |
| 상태 관리 | Zustand |
| 저장소 | expo-sqlite (repository 패턴) |
| 테스트 | Jest(jest-expo) + React Native Testing Library 14 |

---

## 1. 설치

```bash
npm install
npm test            # 단위 + 컴포넌트 테스트
npm run coverage    # 커버리지(utils/features/db 80% 이상 강제)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (eslint-config-expo)
```

> 패키지를 추가할 때는 `npx expo install <패키지>`를 사용해 SDK와 호환되는 버전을 받으세요.

## 2. Development Build 만들기 (EAS)

백그라운드 위치 추적, BLE 센서, HealthKit/Health Connect는 **Expo Go에서 동작하지 않습니다.** Development Build가 필요합니다.

```bash
npm install -g eas-cli          # 또는 npx eas-cli@latest
eas login
eas init                        # app.json에 EAS projectId 연결

# 실기기용 개발 빌드
eas build --profile development --platform ios
eas build --profile development --platform android

# iOS 시뮬레이터용
eas build --profile development-simulator --platform ios

# 빌드 설치 후 개발 서버 실행
npx expo start --dev-client
```

로컬에서 직접 빌드하려면 `npx expo run:ios` / `npx expo run:android` (Xcode / Android Studio 필요). `ios/`, `android/` 폴더는 Continuous Native Generation으로 생성되므로 직접 수정하지 말고 `app.json`과 config plugin으로 설정합니다.

`eas.json` 프로필: `development`(dev client, 내부 배포), `development-simulator`, `preview`(APK), `production`.

## 3. 권한 설정 (app.json)

### iOS (`expo.ios.infoPlist`)

| 키 | 용도 |
|---|---|
| `NSLocationWhenInUseUsageDescription` | 앱 사용 중 위치(먼저 요청) |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | 화면이 꺼져도 기록(이유 설명 화면 후 요청) |
| `NSMotionUsageDescription` | 걸음 수·케이던스(Pedometer) |
| `NSBluetoothAlwaysUsageDescription` | 심박 벨트, 자전거 센서 |
| `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription` | 건강 앱 연동 |
| `UIBackgroundModes`: `location`, `audio`, `bluetooth-central` | 백그라운드 위치, 백그라운드 음성 안내, 백그라운드 BLE |

### Android (`expo.android.permissions`)

`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`(화면이 꺼져도 기록, 포그라운드 서비스 알림 표시), `ACTIVITY_RECOGNITION`(걸음 수), `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS`(훈련 알림), `VIBRATE`, Health Connect 쓰기 권한(`android.permission.health.WRITE_*`).

Health Connect(react-native-health-connect)는 `minSdkVersion 26`이 필요해 `expo-build-properties`로 설정해 두었습니다.

### 권한 요청 흐름 (앱 동작)

1. 기록 시작 시 **앱 사용 중 위치** 권한을 먼저 요청합니다.
2. **백그라운드 위치**와 **동작(걸음)** 권한은 이유를 설명하는 화면을 보여준 뒤 요청합니다.
3. 위치 권한을 거부하면 **실내 모드**로 기록하도록 안내합니다.

## 4. Android Google 지도 API 키

iOS는 Apple 지도(키 불필요), Android는 Google 지도를 사용합니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고 **Maps SDK for Android**를 사용 설정합니다.
2. API 키를 만들고 **Android 앱으로 제한**합니다(패키지 `com.example.runwalkride` + 앱 서명 SHA-1. EAS 빌드의 SHA-1은 `eas credentials`로 확인).
3. `app.json`의 플러그인 설정에서 키를 바꿉니다.

```json
["react-native-maps", { "androidGoogleMapsApiKey": "YOUR_ANDROID_GOOGLE_MAPS_API_KEY" }]
```

키를 저장소에 커밋하고 싶지 않다면 `app.json`을 `app.config.ts`로 바꾸고 `process.env.GOOGLE_MAPS_API_KEY`(EAS Secret)를 읽으세요. 번들 ID/패키지 이름(`com.example.runwalkride`)도 실제 값으로 바꾸세요.

## 5. 프로젝트 구조

```
app/                          Expo Router 화면
  (tabs)/                     하단 탭: 홈 / 기록하기 / 기록 / 내 정보
  tracking.tsx                기록 중 화면(카운트다운, 큰 숫자, 지도, 일시정지/종료, SOS, 자전거 가로 화면)
  summary.tsx                 종료 후 요약(색상 경로, 스플릿, 모드 오선택 제안, 저장/삭제)
  activity/[id].tsx           상세(그래프, 구간 비교, 수정, 모드 변경, 공유 이미지, GPX 내보내기)
  activity/segment-create.tsx 내 구간 만들기
  stats, records, badges, goals, plans, plan/[id], gear/, segments, segment/[id],
  sensors, settings, contacts, privacy, backup
src/
  components/                 BigStat, MetricChart, RouteMap, ModeSelector, Button, LongPressButton,
                              ProgressRing, CalendarHeatmap, ShareCard, ActivityStats(SplitTable) …
  features/
    activity/                 activityConfig.ts(모드 설정), modeDetection.ts(오선택 감지), activityService.ts
    tracking/                 trackingEngine.ts(공용 엔진), autoPause.ts, trackingService.ts(오케스트레이터),
                              locationSource.ts(백그라운드 태스크), simulator.ts(GPX 재생), pedometer.ts,
                              voiceCoach.ts / voiceMessages.ts, activityBuilder.ts, liveMetrics.ts, permissions.ts
    workouts/                 targetCoach.ts(목표 활동), interval.ts, indoor.ts, trainingPlans.ts, planReminders.ts
    analysis/                 splits.ts, personalRecords.ts(PR), racePredictor.ts, stats.ts, segments.ts, series.ts
    gamification/             badges.ts, levels.ts, streak.ts, challenges.ts, goals.ts
    gear/                     신발·자전거·부품 마모 계산
    sensors/                  bleParsers.ts(0x180D/0x1816 파서), bleSensors.ts, heartRateZones.ts
    safety/                   sos.ts(긴급 문자)
    share/                    privacy.ts(프라이버시 존), shareImage.ts
    health/                   healthSync.ts(HealthKit / Health Connect)
    backup/                   backupFormat.ts(스키마·마이그레이션·합치기), backupService.ts, backupIO.ts,
                              gpx.ts, gpxImport.ts, backupReminder.ts
  db/
    schema.ts                 테이블 정의, PRAGMA user_version 마이그레이션
    sqlDatabase.ts            repository가 의존하는 최소 SQL 인터페이스
    repositories/types.ts     ActivityRepository 등 인터페이스
    repositories/sqlite/      SQLite 구현체
    database.ts               DB 열기 / repository 주입(getRepositories, setRepositories)
  store/                      Zustand: settingsStore, trackingStore, dataStore
  hooks/                      useAsync, useActivitySummaries, useNow
  theme/                      다크 모드·고대비 색상, 야외 사용성 상수(숫자 48pt+, 버튼 64pt+)
  utils/                      geo(하버사인·필터·고도), format(페이스/속도/단위), calories(MET), date, id
  data/                       badges.json, trainingPlans.json, challenges.json
  types/                      Activity, TrackPoint, Split, PersonalRecord, Segment, Gear, Goal, Badge …
assets/gpx/                   GPS 시뮬레이션용 샘플(run/walk/ride, 노이즈 포함)
scripts/                      샘플 GPX·훈련 플랜 생성 스크립트
__tests__/unit, components    Jest 테스트 (helpers/에 sql.js 기반 SQLite 어댑터)
```

### 핵심 설계

- **모드 = 설정 객체.** 트래킹 엔진, 화면, 음성 안내, PR, 레벨, 헬스 연동은 모두 `ACTIVITY_CONFIGS`를 읽습니다. 코드 곳곳에 `if (type === 'ride')` 분기를 두지 않습니다.
- **트래킹 엔진은 순수 로직**(`TrackingEngine`)이고 시간을 외부에서 주입받습니다. 그래서 GPS 없이 단위 테스트하고, 시뮬레이션에서는 가속된 시계로 재생합니다.
- **크래시 복구:** 진행 중 상태(JSON)와 새 GPS 포인트를 10초마다 SQLite에 저장합니다(포인트는 트랜잭션 일괄 삽입). 앱이 강제 종료된 뒤 다시 실행하면 "이어서 기록 / 종료하고 저장 / 버리기"를 묻고, 꺼져 있던 시간은 일시정지로 처리합니다.
- **PR은 저장 시 계산한 활동별 최고 구간(bestEfforts)을 모드별로 집계**합니다. 그래서 저장 후 모드를 바꿔도 GPS를 다시 읽지 않고 PR이 즉시 재계산됩니다(스플릿·칼로리는 포인트로 재계산).
- 목록 화면은 요약 컬럼만 읽고, GPS 포인트는 상세 화면에서만 읽습니다.

## 6. 배지 / 훈련 플랜 / 챌린지 데이터 추가

### 배지 (`src/data/badges.json`)

```json
{ "id": "run-total-2000", "name": "달리기 2000km", "description": "누적 2000km를 달렸어요",
  "icon": "🌌", "activityType": "run", "condition": { "kind": "totalDistance", "meters": 2000000 } }
```

- `activityType`: `"run" | "walk" | "ride" | null`(null = 모든 모드 공통)
- `condition.kind`: `activityCount{min}`, `startedBeforeHour{hour}`, `weeklyStreak{weeks}`, `allModes`, `singleDistance{meters}`, `totalDistance{meters}`, `dailySteps{steps}`, `totalSteps{steps}`, `totalElevation{meters}`
- 새 조건 종류가 필요하면 `src/features/gamification/badges.ts`의 `BadgeCondition`과 `isBadgeEarned`에 한 줄씩 추가합니다. 잘못된 JSON은 앱 시작 시 예외로 바로 드러납니다(테스트 포함).

### 훈련 플랜 (`src/data/trainingPlans.json`)

```json
{ "id": "my-plan", "title": "나의 플랜", "activityType": "run", "icon": "🔥", "level": "초급",
  "description": "…", "weeks": [ { "week": 1, "workouts": [
    { "id": "my-plan-w1-d1", "title": "편한 달리기 5km", "description": "…", "activityType": "run",
      "workout": { "kind": "target", "target": { "distanceM": 5000, "durationSec": null, "speedMps": null } } },
    { "id": "my-plan-w1-d2", "title": "인터벌", "description": "…", "activityType": "run",
      "workout": { "kind": "interval", "interval": { "warmupSec": 600, "workSec": 180, "recoverSec": 120, "repeats": 5, "cooldownSec": 600 } } }
  ] } ] }
```

JSON을 직접 편집해도 되고, `scripts/generateTrainingPlans.js`를 고친 뒤 `npm run gen:plans`로 다시 만들 수도 있습니다. 훈련 `id`는 플랜 안에서 고유해야 합니다(완료 기록이 id로 저장됨).

### 월간 챌린지 (`src/data/challenges.json`)

`metric`: `distance`(m) · `steps` · `count` · `duration`(초) · `elevation`(m), `activityType`이 null이면 전체 모드.

## 7. 새 활동 모드 추가하기

예: 🛼 인라인 스케이트(`skate`)

1. `src/types/index.ts`의 `ActivityType`에 `'skate'`를 추가합니다.
2. `src/features/activity/activityConfig.ts`의 `ACTIVITY_CONFIGS`에 항목을 하나 추가합니다.

```ts
skate: config({
  type: 'skate', label: '인라인', icon: '🛼', color: '#9E3FD6', colorDark: '#C58AF0',
  primaryMetric: 'speed',
  secondaryMetrics: ['distance', 'duration', 'calories', 'heartRate'],
  liveMetrics: ['duration', 'distance', 'currentSpeed', 'avgSpeed', 'heartRate'],
  gps: { timeIntervalMs: 1000, distanceIntervalM: 5 },
  filter: { maxAccuracyM: 20, maxSpeedMps: 15 },
  autoPause: { speedBelowMps: 1, durationSec: 4 },
  announceEveryKm: 2, splitEveryKm: 2,
  metTable: [[14, 7.0], [20, 9.8]],
  plausibleAvgSpeedMps: [2.5, 9], typicalSpeedMps: 4.5,
  usesPedometer: false, supportsIntervals: true, supportsLandscape: false, voiceOnlyWhileMoving: false,
  distancePrKeys: ['5k', '10k', '20k'], extraPrKeys: ['maxSpeed', 'longestDistance'],
  levelDistanceKm: 300, gearKind: 'shoe',
  healthKitType: 'Cycling', healthConnectType: 'BIKING', indoorLabel: '실내 트랙',
}),
```

이것만으로 모드 선택, 트래킹, 노이즈 필터, 자동 일시정지, 음성 안내, 스플릿, 칼로리, 모드 오선택 감지, PR, 레벨, 통계, 필터가 모두 동작합니다. (필요하면 `badges.json`/`challenges.json`에 해당 모드 항목을 추가하고, 시뮬레이션용 `assets/gpx/skate.gpx`를 `simulator.ts`의 `SAMPLE_ASSETS`에 등록하세요.) `healthKitType`/`healthConnectType`은 현재 Running/Walking/Cycling 중에서 고르며, 새 유형이 필요하면 `healthSync.ts`의 매핑을 넓히면 됩니다.

## 8. 백업 파일 형식

설정 > 백업 및 복원에서 JSON 파일 하나로 내보내고, 휴대폰 공유 시트로 파일 앱·클라우드 드라이브·메신저 등에 저장합니다. 앱은 파일을 외부로 전송하지 않습니다.

```jsonc
{
  "schemaVersion": 2,               // 현재 스키마 버전
  "exportedAt": 1792134000000,      // ms
  "appVersion": "1.0.0",
  "data": {
    "activities":     [ /* Activity: 요약 + details(일시정지, 스플릿, 최고 구간, 심박 구간, 걸음 샘플 …) */ ],
    "trackPoints":    [ /* TrackPoint: activityId, timestamp, latitude, longitude, altitude, accuracy, heartRate, cadence, sensorSpeedMps */ ],
    "gear":           [ /* 신발/자전거 */ ],
    "gearComponents": [ /* 자전거 부품 */ ],
    "goals":          [ ],
    "badges":         [ /* 획득한 배지 */ ],
    "segments":       [ /* 내 구간 */ ],
    "segmentEfforts": [ /* 구간 기록 */ ],
    "planProgress":   [ /* 훈련 플랜 진행 */ ],
    "settings":       { /* 단위, 체중, 긴급 연락처, 프라이버시 존 … (센서 페어링·헬스 연동 등 기기 전용 설정 제외) */ }
  }
}
```

- **복원 방식:** "기존 데이터에 합치기"(id 기준 중복 제외, 같은 배지는 한 번만, 기존 설정 우선) 또는 "모두 덮어쓰기"(경고 후 실행). 복원 전체가 하나의 트랜잭션이라 실패하면 기존 데이터가 그대로 남습니다.
- **마이그레이션:** 파일의 `schemaVersion`부터 현재 버전까지 `backupFormat.ts`의 `MIGRATIONS`를 차례로 적용합니다. v1(초기 형식: `details`/`updatedAt` 없음, 설정이 `data.preferences`)은 v2로 자동 변환됩니다. 스키마를 바꿀 때는 `BACKUP_SCHEMA_VERSION`을 올리고 `MIGRATIONS[이전버전]`을 추가하세요.
- 앱 시작 후 마지막 백업에서 30일이 지나면(백업한 적이 없다면 첫 기록부터) 홈 화면에 백업 안내가 표시됩니다.

## 9. GPS 시뮬레이션 (개발 빌드)

설정 > 개발자(`__DEV__` 빌드에서만 보임) > **GPS 시뮬레이션**을 켜면, 기록을 시작할 때 실제 GPS 대신 `assets/gpx/{run,walk,ride}.gpx`를 재생합니다(1/5/20배속).

샘플에는 노이즈가 들어 있습니다: 정확도 불량 포인트(`hdop` 큼 → 정확도 필터), 수백 m 튄 좌표(속도 필터), ±1.5m 고도 잡음(스무딩 + 3m 임계값), 신호 대기 같은 정지 구간(자동 일시정지). 실제로 움직이지 않고도 카운트다운 → 기록 → 자동 일시정지/재개 → 음성 안내/스플릿 → 종료 → 요약 → 저장 흐름을 확인할 수 있습니다. 샘플은 `npm run gen:gpx`로 다시 만들 수 있습니다.

## 10. 테스트

- **단위 테스트(`__tests__/unit`)**: 하버사인, 모드별 노이즈 필터·자동 일시정지, 트래킹 엔진(일시정지·자동 일시정지·스플릿 이벤트·최고 속도·센서·직렬화/복원), 스플릿, 모드별 PR, 레이스 예측, 내 구간 매칭, 통계, MET 칼로리, 모드 오선택 감지, 배지·스트릭·레벨·챌린지·목표, 인터벌·목표 코치·실내·훈련 플랜, BLE 파서·심박 구간, 장비, 프라이버시 존, SOS, GPX 입출력(샘플 노이즈 검증 포함), **백업 왕복·합치기 중복 방지·v1 마이그레이션**, SQLite repository 전체.
- **컴포넌트 테스트(`__tests__/components`)**: 세 모드 각각 "모드 선택 → 시작(카운트다운) → 일시정지 → 재개 → 종료(1.5초 길게 누르기) → 요약 → 저장" 전체 흐름(실제 엔진·서비스·메모리 SQLite 사용, GPS만 가짜), 요약 화면의 모드별 지표와 오선택 제안, 기록 목록 모드 필터, 강제 종료 후 복구.
- repository 테스트는 [sql.js](https://github.com/sql-js/sql.js)(WASM SQLite)로 만든 `SqlDatabase` 어댑터를 사용해 실제 SQL을 실행합니다.
- 커버리지 기준(라인 80%)은 `package.json`의 `coverageThreshold`로 강제합니다. 네이티브 모듈을 직접 다루는 얇은 래퍼(위치 태스크, BLE 연결, TTS, 헬스, 파일 공유)는 집계에서 제외했습니다.

## 11. 구현 체크리스트

### Phase 1 — 핵심 트래킹 & 데이터 보호
- [x] 모드 선택(마지막 모드 기억), 모드별 색상·아이콘
- [x] 3초 카운트다운, 일시정지/재개/종료, 모드별 실시간 지표, 실시간 지도·경로
- [x] 백그라운드 기록(iOS 백그라운드 위치, Android 포그라운드 서비스 알림)
- [x] 모드별 자동 일시정지(설정에서 모드별 on/off), 자전거 가로 화면
- [x] 음성 안내(모드별 간격, 구간 페이스/속도), 시작·일시정지·재개·종료 피드백, 오디오 덕킹
- [x] 요약: 페이스/속도 색상 경로, 모드별 지표, 스플릿 표, 이름·메모·체감 강도, 모드 오선택 제안, 저장/삭제(확인)
- [x] 기록 목록(모드 필터), 상세 수정·삭제, 저장 후 모드 변경(통계·PR 재계산)
- [x] 크래시 복구(10초마다 저장, 재실행 시 이어서 기록)
- [x] 백업/복원(JSON, 공유 시트, 합치기/덮어쓰기, schemaVersion 마이그레이션, 30일 백업 안내)

### Phase 2 — 분석 & 개인 기록
- [x] 페이스/속도 그래프, 고도 그래프(상승/하강), 구간 비교, 달리기 케이던스, 산책 시간대별 걸음 수, 심박 그래프·구간
- [x] 모드별 PR(달리기 1K~풀, 산책 최장 거리/시간·하루 최다 걸음, 자전거 5초 평균 최고 속도·20/40/100km·최장 거리·최대 상승)
- [x] 레이스 예측(Riegel)
- [x] 통계 대시보드(주/월/연, 모드별·전체, 캘린더 모드별 점, 전년 대비)
- [x] 내 구간(경로에서 시작/끝 선택, 자동 감지, 모드별 순위, 최고 기록 경신 알림)
- [x] 목표 활동(이탈 시 음성), 인터벌(음성+진동), 실내 모드(거리 입력, 산책은 걸음 수로 추정)
- [x] GPX 내보내기/가져오기(평균 속도로 모드 추정 제안)

### Phase 3 — 동기 부여 · 장비 · 안전
- [x] 활동 시간 기준 전체 레벨, 모드별 거리 레벨, 배지(`badges.json`), 주 단위 스트릭, 월간 챌린지
- [x] 목표(모드별 주/월/연 거리, 하루 걸음 수) 진행률 링
- [x] 훈련 플랜 6종(`trainingPlans.json`), 오늘의 훈련, 완료 체크 시 다음 훈련 로컬 알림
- [x] 장비: 신발 교체 알림(기본 700km, 수정 가능), 자전거 여러 대·부품별 거리·교체 기준 수정
- [x] BLE 심박(0x180D, Zone 1~5, 최대 심박 입력 또는 220-나이), 자전거 속도·케이던스(0x1816, 센서 속도 우선)
- [x] HealthKit / Health Connect 저장(동의 후, 설정에서 끄기)
- [x] 공유 이미지(기기에서 생성, 프라이버시 존 경로 숨김)
- [x] 긴급 연락처(최대 3명), SOS 길게 누르기 → 위치 링크 문자 작성 화면(자동 전송 없음)
- [x] 안전: 첫 실행 안내, 자전거 시작 전 안내 + 상태 음성 버튼, 종료/SOS 1.5초 길게 누르기, 큰 숫자·큰 버튼, 다크 모드·고대비

## 12. 알려진 제약과 다음 단계

실제 기기에서 확인이 필요한 부분 (이 저장소의 테스트는 Node 환경에서 실행되므로 네이티브 동작은 검증하지 못했습니다)

- **실기기 검증:** 백그라운드 위치(특히 Android 제조사별 배터리 최적화), BLE 센서 실제 연결, HealthKit/Health Connect 저장, 오디오 덕킹, 공유 이미지 캡처는 Development Build에서 직접 확인해야 합니다. JS 번들은 iOS/Android 모두 `expo export`로 빌드되는 것을 확인했습니다.
- **걸음 수:** Android에서 화면이 꺼진 동안 `watchStepCount`가 멈출 수 있습니다. 다음 단계로 종료 시 iOS `getStepCountAsync`로 활동 시간 구간 걸음 수를 보정하는 기능을 추가하면 좋습니다.
- **헬스 연동:** 현재는 운동 세션·거리·칼로리·걸음 수만 저장합니다. 경로(ExerciseRoute/HKWorkoutRoute)와 심박 샘플 저장은 다음 단계 후보입니다.
- **지도 오프라인:** 타일 캐시가 없으면 오프라인에서 지도 배경이 비어 보입니다(경로 선은 표시됨).
- **추후 서버 연동:** `src/db/repositories/types.ts` 인터페이스의 원격/동기화 구현체를 만들고 `setRepositories()`로 주입하면 됩니다. 모든 레코드에 UUID와 `createdAt`/`updatedAt`이 있어 동기화 충돌 해결에 사용할 수 있습니다.
- `app.json`의 번들 ID(`com.example.runwalkride`), Google 지도 키, 아이콘을 실제 값으로 바꿔야 스토어 배포가 가능합니다. 라이선스 파일은 포함하지 않았으니 필요한 라이선스를 추가하세요.
