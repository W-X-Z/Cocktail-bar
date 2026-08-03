# 🍸 Cocktail Bar

모바일 퍼스트 칵테일 바 운영 게임. 실제 IBA 레시피대로 조주하고, 발주로 메뉴를 넓혀가는 시뮬레이션.

- **탑다운 뷰**: 바 운영 — 손님 입장·주문·인내심 게이지
- **POV 뷰**: 조주 — 붓기(홀드), **셰이킹(휴대폰 실제 흔들기)**, 스터링(원형 드래그)
- **발주 루프**: 한정된 초기 자금 → 보틀 구매 → 레시피 해금 → 메뉴 등록
- 메뉴에 있는 술을 원한 손님만 팁을 줌 (정확도 × 인내심 배율)

## 실행

```bash
npm install
npm run dev      # 개발 서버 (모바일에서 같은 네트워크로 접속 가능: --host)
npm run build    # 프로덕션 빌드 → dist/
```

데스크톱에서는 셰이킹을 화면 문지르기로 대체할 수 있습니다.

## 스택

Phaser 3.90 · TypeScript · Vite — 안드로이드 패키징은 Capacitor (출시 시 `npx cap add android`)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/01-research.md](docs/01-research.md) | 레퍼런스 게임·스택·레시피 조사 |
| [docs/02-game-design.md](docs/02-game-design.md) | 게임 기획서 (코어 루프, 채점, 경제, MVP 범위) |
| [docs/03-architecture.md](docs/03-architecture.md) | 아키텍처, 모듈 경계, 셰이크 감지 설계 |

## 구조 (요약)

```
src/
  data/       # IBA 검증 레시피 15종 + 재료 마스터 (JSON)
  systems/    # 엔진 비의존 게임 로직 (상태·채점·주문·셰이크/스터 감지)
  scenes/     # Phaser 씬 (Boot/Bar/Mix/Shop)
  ui/         # 테마·공용 위젯
```
