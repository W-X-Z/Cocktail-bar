# 플레이스토어 배포 가이드

## 빌드 산출물 (CI 자동)

브랜치에 푸시할 때마다 GitHub Actions `Deploy (Pages + APK)` 워크플로가 생성:

| 아티팩트 | 용도 |
|---|---|
| `cocktail-bar-debug-apk` | 기기 테스트용 (디버그 서명, 스토어 업로드 불가) |
| `cocktail-bar-release-aab` | **플레이스토어 업로드용** — secrets 설정 시 업로드 키로 서명됨 |

- 앱 ID `com.wxz.cocktailbar`(유지 — 변경 시 스토어 업데이트 불가), 이름 "소문의 낙원"
- versionCode = 워크플로 run number (자동 증가), versionName = `0.1.<run>`
- 아이콘/스플래시: `resources/icon.png`(1024) · `splash.png`(2732) → CI에서 `@capacitor/assets`로 전체 해상도 생성

## 최초 1회: 서명 키 Secrets 등록

업로드 키스토어(PKCS12)는 세션에서 생성해 별도 전달됨 (리포에 커밋 금지 — `.gitignore` 처리).
리포 **Settings → Secrets and variables → Actions → New repository secret** 2개 등록:

| Secret 이름 | 값 |
|---|---|
| `UPLOAD_KEYSTORE_BASE64` | `upload-keystore.p12` 파일의 base64 문자열 (전달받은 `upload-keystore.base64.txt` 내용 그대로) |
| `UPLOAD_KEYSTORE_PASSWORD` | 전달받은 키스토어 비밀번호 |

등록 후 워크플로를 재실행(Actions → Run workflow)하면 서명된 AAB가 나온다.
⚠️ 키스토어 파일과 비밀번호는 안전한 곳(비밀번호 관리자)에 보관할 것.
분실해도 **Play App Signing**을 쓰면 업로드 키 재설정이 가능하지만 절차가 번거롭다.

## Play Console 업로드 절차

1. https://play.google.com/console — 개발자 계정 (최초 $25)
2. 앱 만들기 → 이름 "소문의 낙원", 게임/시뮬레이션, 무료
3. **Play App Signing 동의** (기본값 — Google이 앱 서명 키 관리, 우리는 업로드 키만 사용)
4. 내부 테스트 트랙 → AAB 업로드 (`cocktail-bar-release-aab` 아티팩트 zip 해제 후 `app-release.aab`)
5. 필수 설문/항목:
   - **콘텐츠 등급 설문**: 주류 소재 → "규제 대상 약물/주류 언급" 항목 체크 (IARC 17+ 또는 청소년 이용불가 등급 예상)
   - **데이터 보안**: 이 앱은 수집 데이터 없음 (전부 localStorage 로컬 저장) → "데이터 수집 안 함"
   - **개인정보처리방침 URL**: `https://w-x-z.github.io/Cocktail-bar/privacy.html` (Pages에 포함됨)
   - 스크린샷·아이콘(512)·피처 그래픽(1024×500): `store/` 폴더에 준비됨 — 문구 포함 전체 등록 자료는 `docs/07-store-listing.md`
6. 내부 테스트 → 비공개 테스트(12명/14일 요건은 개인 계정 신규 등록 시) → 프로덕션

## 로컬 빌드 (참고)

```bash
npm run build && npx cap add android && npx cap sync android
npx @capacitor/assets generate --android --assetPath resources
cd android && ./gradlew bundleRelease
jarsigner -keystore upload-keystore.p12 -storetype PKCS12 -storepass <PW> \
  app/build/outputs/bundle/release/app-release.aab upload
```
