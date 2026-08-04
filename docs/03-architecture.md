# 아키텍처 & 모듈화

## 스택

- **Phaser 3.90** (2D 엔진) + **TypeScript** + **Vite** (번들러)
- **Capacitor** (안드로이드 패키징 — 출시 시점에 `npx cap add android`)
- 아트: MVP는 절차 생성 텍스처(코드로 그림) → 추후 스프라이트 교체 용이하도록 텍스처 키 중앙 관리

## 디렉터리 구조

```
src/
  main.ts               # Phaser 부트스트랩 (720×1280 포트레이트, Scale.FIT)
  data/
    ingredients.json    # 재료 마스터 (가격, 색상, 타입)
    recipes.json        # IBA 검증 레시피 15종 (steps = 조주 시퀀스)
  systems/              # ⚠ 엔진 비의존 순수 로직 — 유닛 테스트 가능, 엔진 교체 시 그대로 이식
    GameState.ts        # 돈/재고/메뉴/일차 상태 + localStorage 저장
    RecipeSystem.ts     # 레시피 조회, 제조 가능 여부, 채점(scoreMix)
    OrderSystem.ts      # 손님 주문 생성(페르소나 취향 반영), 팁 계산
    CustomerSystem.ts   # 페르소나 추첨·대화 선택·단골 레벨 (docs/04 참고)
    ShakeDetector.ts    # DeviceMotion 셰이크 감지 + 포인터 폴백
    StirDetector.ts     # 원형 드래그 각도 누적 감지
    TiltDetector.ts     # DeviceOrientation 기울기 붓기 + 드래그 폴백
  scenes/               # Phaser 씬 — 표현/입력만 담당, 로직은 systems에 위임
    BootScene.ts        # 타이틀 + 세이브 슬롯 3개 선택/삭제
    BarScene.ts         # 바텐더 POV 운영 뷰 (HUD·손님 반응·채점 토스트·운영비 정산)
    MixScene.ts         # POV 조주 뷰 (틸트 붓기 게이지)
    ShopScene.ts        # 발주 + 메뉴 등록
  ui/
    theme.ts            # 색상 팔레트, 폰트, 버튼/패널 팩토리
```

## 모듈 경계 원칙

1. **systems/는 Phaser를 import하지 않는다.** 게임 규칙(채점·경제·주문)은 순수 TS. Flutter/Flame 등으로 이관하더라도 systems/와 data/는 로직 번역만 하면 됨.
2. **scenes/는 상태를 소유하지 않는다.** 모든 영속 상태는 `GameState` 싱글턴, 씬은 렌더링과 입력 → 시스템 호출.
3. **데이터 주도**: 레시피/재료는 JSON. 콘텐츠 추가는 코드 수정 없이 JSON 추가로.
4. **입력 추상화**: 셰이크는 `ShakeDetector`가 DeviceMotion과 포인터 폴백을 동일 이벤트로 통일 → 씬은 입력 소스를 모름.

## 씬 흐름

```
Boot(슬롯 선택) → Bar(바텐더 POV)
                   ├─ 손님 탭 → Bar sleep + Mix run(POV) → 서빙 즉시 Bar wake
                   │            (손님 반응·채점 토스트는 Bar에서 연출)
                   └─ 영업 종료 → 운영비 정산 → Shop(발주/메뉴) → 다음 날 Bar 재시작
```

## 셰이크 감지 설계

- `devicemotion` 이벤트 → 중력 제외 가속도 크기 `|a| > 12 m/s²` 를 셰이크 틱으로 판정, 250ms 디바운스
- iOS 13+: `DeviceMotionEvent.requestPermission()` 필요 → 최초 셰이크 단계 진입 시 유저 제스처로 요청
- Android WebView(Capacitor): 권한 팝업 없이 동작
- 폴백(데스크톱/거부 시): 포인터를 빠르게 좌우로 흔드는 드래그를 셰이크 틱으로 인정
- 판정은 "흔드는 중" 시간 누적 — 세기·각도는 요구하지 않음 (조사 결론: 관대한 판정)

## 저장

- `localStorage["cocktail-bar-save-v2-slot{0..2}"]` — 슬롯 3개, GameState 직렬화 (돈, 재고 ml, 메뉴, 일차, 당일 매출)
- 스키마 버전 키 포함 → 마이그레이션 대비

## 안드로이드 배포 경로 (출시 시)

```bash
npm run build                 # dist/ 생성
npx cap add android           # 최초 1회
npx cap sync && npx cap open android   # 로컬 Android Studio에서 AAB 서명·빌드
```
