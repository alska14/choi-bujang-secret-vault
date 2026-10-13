# BYTE BACK 방어전: 나의 자료실

BYTE BACK 방어전 시작 틀에서 출발해 1~12단계와 XDR 보너스 6개를 한 단계씩 만든 학생 자료실입니다. 교육용 시험 자료이며 상용 제품이 아니고, 메모는 모두 가상 자료입니다.

- 배포 주소: https://choi-bujang-secret-vault-six.vercel.app
- 저장소: https://github.com/alska14/choi-bujang-secret-vault

## 무엇을 누가 만들었나

출처를 네 갈래로 나눕니다.

| 출처 | 들어 있는 것 |
|---|---|
| 학생이 만든 것 | 판정기(src/decider.mjs), 탐지 규칙(src/detect.mjs), 접속 앱 화면(public/), 자료실 서버 함수(api/, src/notes-api.mjs, src/auth-api.mjs), 복원(src/restore-api.mjs, scripts/policy-restore.mjs, backup/), 점검 코드(src/attack-check.mjs, src/rule-check.mjs), 탈환 작전실(public/ops.html, api/ops.js, api/checks.js, scripts/verify-table.mjs), XDR 판정(xdr/ 아래 모듈 6개의 decide.mjs), 시험(test/) |
| 시작 틀에서 온 것 | 로그인 검사(src/verify-login.mjs), 제출 묶음(scripts/bundle.mjs), 빌드(scripts/build-public.mjs, scripts/deployment-identity.mjs), 연습 시험(scripts/decider-test.mjs, scripts/detect-test.mjs, scripts/xdr-run.mjs), 규칙 문서(AGENTS.md, docs/DECIDER_REQUEST.md, docs/DETECT_EVENTS.md) |
| 제공 엔진 | ALEPH SDP 엔진. 로그인 세션 확인, 기기 등록, 판정기 호출과 집행, 감사 기록 보관, 총공세 심판은 엔진이 맡습니다. 이 저장소에는 엔진 코드가 없습니다. |
| 외부 서비스 | Supabase(DB, 로그인), Vercel(배포), TypeSafe Jev(보너스 판정 보조, 지금은 쓰지 않음) |

비밀값은 이 저장소와 이 안내에 넣지 않습니다. 환경변수는 이름만 적습니다: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, TYPESAFE_API_KEY(선택), NOTES_BACKUP_JSON(운영 사본, 선택).

## 설치·실행·중지·복구

모든 절차는 검사한 커밋을 기준으로 합니다. 검사한 커밋은 배포된 /aleph.json 의 commit 값이고, 제출 묶음의 commit 값과 같습니다.

1. 설치: git clone https://github.com/alska14/choi-bujang-secret-vault, git checkout <검사한 커밋>, npm install (Node.js 22 이상).
2. 실행: Vercel 에 이 저장소를 배포합니다(화면은 public/, 서버 함수는 api/). 위 환경변수는 Vercel 프로젝트 설정에서 직접 넣습니다.
3. 점검: 커밋한 뒤 npm run verify:table 로 표를 만들고, 커밋하지 않는 bundle-notes.json 에 이번 단계에서 한 일을 적어 npm run bundle 을 실행합니다.
4. 중지: Vercel 프로젝트에서 배포를 내리거나(Instant Rollback 또는 프로젝트 일시 중지) 엔진 쪽 경로 허용을 끕니다. 복원 경로만 멈추려면 NOTES_BACKUP_JSON 을 지웁니다(사본이 없으면 복원은 503으로 중단합니다).
5. 복구: 검사한 커밋으로 되돌려 다시 배포합니다. 정책은 npm run policy:diff 로 차이를 보고 npm run policy:restore -- --apply 로 되돌립니다. 메모 한 건은 POST /api/restore/:noteId 로 되돌립니다(10단계). 복구 뒤에는 아래 점검을 다시 합니다.

재현 순서: npm install, npm run decider:test, npm run detect:test, 각 시험 파일을 node --test 로 따로 실행, 배포, npm run verify:table, 브라우저에서 /ops.html 열기, npm run bundle.

## 점검 기록과 작전실 화면 (12단계)

작전실 화면은 /ops.html 이고 메인 화면(/)에도 같은 수치의 요약 영역이 있습니다. 화면의 수치, GET /api/checks 의 요약, 제출 묶음(npm run bundle)은 모두 src/attack-check.mjs 의 같은 점검 항목 목록에서 센 같은 숫자입니다.

### 실측 결과

측정일은 2026-10-13이고, 측정에 쓴 배포 커밋은 681693f 입니다. 배포 주소에 npm run verify:table 로 실제 읽기 요청을 보내 얻은 응답입니다.

| 단계 | 종류 | 요청 | 기대 | 실제 | 요청 ID | 확인 시각 | 결과 |
|---|---|---|---|---|---|---|---|
| 1 | 실제 API | GET /data.json | /data.json 에 메모가 없음 | HTTP 200 | 21da4a18-4d8e-4f39-84bf-6281d985a8cb | 2026-10-13T03:57:34.795Z | 막음 |
| 2 | 실제 API | GET /notes.json | 다른 정적 사본 없음 | HTTP 404 | c5f6ad21-bd4f-4d8a-907b-e361495aa581 | 2026-10-13T03:57:34.820Z | 막음 |
| 3 | 실제 API | GET /api/my/notes (로그인 없음) | 로그인 없는 목록 401 | HTTP 401 | 88faa4ba-44bf-4e85-ab27-5bc28a00c189 | 2026-10-13T03:57:34.821Z | 막음 |
| 3 | 실제 API | GET /api/my/notes (엉터리 토큰) | 위조 토큰 401 | HTTP 401 | 7b6594c3-3e89-48c3-bcf3-d778e946a10c | 2026-10-13T03:57:34.821Z | 막음 |
| 3 | 미실행 | GET /api/notes (A 로그인) | 정상 요청 허용(200)과 본인 목록 | not_run: 시험 계정 A 토큰 없음 | - | 2026-10-13T03:57:35.104Z | 미실행 |
| 4 | 실제 API | GET /api/my/notes (쿼리에 사용자·역할) | 쿼리 신원 무시 | HTTP 401 | c489eb3b-8595-4728-8014-cc34556c85d4 | 2026-10-13T03:57:34.821Z | 막음 |
| 4 | 실제 API | GET /api/my/notes (헤더에 사용자·역할) | 헤더 신원 무시 | HTTP 401 | e0e83e87-142a-4134-9779-e7d1cfb0bff1 | 2026-10-13T03:57:34.822Z | 막음 |
| 4 | 미실행 | GET /api/notes/:id (B 로그인, A의 메모) | 거부(404) | not_run: 시험 계정 A·B 토큰 없음 | - | 2026-10-13T03:57:35.104Z | 미실행 |
| 5 | 실제 API | GET /rest/v1/notes | 원본 주소 직접 읽기 거부 | HTTP 404 | 9b3c05ea-51ad-4293-b7f5-5230bc30a2c1 | 2026-10-13T03:57:34.822Z | 막음 |
| 6 | 실제 API | GET /api/checks?case=s06-unregistered | 미등록 기기 거부 | HTTP 200; jsonReady=true | da955ccb-5589-4a8f-98ee-41702a40e0be | 2026-10-13T03:57:34.823Z | 막음 |
| 7 | 실제 API | GET /api/checks?case=s07-compound | 복합 이상 재확인 | HTTP 200; jsonReady=true | 42667220-198c-46c6-a5c0-2d02a255c810 | 2026-10-13T03:57:34.823Z | 막음 |
| 8 | 실제 API | GET /api/checks?case=s08-unknown-route | 모르는 경로 거부 | HTTP 200; jsonReady=true | a7cb4b89-d6d3-4c8c-8992-dca0ffb7b3c0 | 2026-10-13T03:57:34.824Z | 막음 |
| 8 | 실제 API | GET /api/checks?case=s08-all-notes | 전체 메모 목록 거부 | HTTP 200; jsonReady=true | 1431ce05-68d2-4ce9-8a79-20ee8823ccc9 | 2026-10-13T03:57:34.824Z | 막음 |
| 8 | 실제 API | GET /api/checks?case=s08-write-notice | 반 공지 쓰기 거부 | HTTP 200; jsonReady=true | e39b261f-a273-42f1-885b-1d3609c8ab32 | 2026-10-13T03:57:34.824Z | 막음 |
| 8 | 실제 API | GET /api/checks?case=s08-own-note | 등록 기기의 내 메모 읽기 허용 | HTTP 200; jsonReady=true | fd66059d-ee8c-49d3-a4ad-e3ed488437f4 | 2026-10-13T03:57:34.825Z | 막음 |
| 8 | 실제 API | GET /api/notices (로그인 없음) | 반 공지 로그인 없이 거부 | HTTP 401 | 02d7fe53-46d6-40e0-8b76-2b0e4712cacd | 2026-10-13T03:57:34.825Z | 막음 |
| 9 | 실제 API | GET /api/checks?case=s09-burst-read | 조회 폭주 회수 제안 | HTTP 200; jsonReady=true | 6a30991b-ed61-48f9-aa5e-a5f7d0d3ae7c | 2026-10-13T03:57:34.825Z | 막음 |
| 10 | 실제 API | GET /api/restore/:noteId (로그인 없음) | 로그인 없는 복원 요청 거부 | HTTP 401 | 7b33929f-2404-491d-8abb-a9d2b35cef9e | 2026-10-13T03:57:34.825Z | 막음 |
| 11 | 실제 API | GET /api/device/status | 승인 전 기기 상태 응답 | HTTP 200 | 8df122ce-908c-4727-b2a7-0cafdcbfd6b5 | 2026-10-13T03:57:34.826Z | 막음 |
| 11 | 실제 API | GET /manifest.json, GET / | 앱 설정(manifest)이 있고 화면이 연결함 | manifest HTTP 200 이름 나의 자료실; 화면 HTTP 200, manifest 연결 있음 | aa238d7c-3f6c-4779-8bb0-c64eb59499e2 | 2026-10-13T03:57:34.826Z | 막음 |

점검 항목 20개: 막음 18, 뚫림 0, 미실행 2

정상 요청의 허용은 다음 응답으로 확인했습니다. GET /api/device/status 는 HTTP 200, GET /manifest.json 과 GET / 는 HTTP 200, GET /api/checks?case=s08-own-note(등록 기기의 내 메모 읽기)는 HTTP 200 에 decision allow 입니다.

금지 요청의 거부는 다음 응답으로 확인했습니다. 로그인 없는 목록, 엉터리 토큰, 쿼리와 헤더에 끼워 넣은 사용자·역할, 로그인 없는 반 공지, 로그인 없는 복원 요청은 HTTP 401 입니다. 정적 사본(/notes.json)과 원본 자료 주소(/rest/v1/notes)는 HTTP 404 입니다. 규칙 사례 중 미등록 기기, 모르는 경로, 전체 목록, 반 공지 쓰기는 deny, 복합 이상 접속은 step_up 으로 응답합니다.

실행하지 않은 점검은 2개입니다. 로그인한 정상 요청(본인 목록 읽기)과 B 계정이 A의 메모를 읽는 요청은 시험 계정 토큰이 없어서 보내지 않았습니다. 총공세 41종은 심판이 실행하는 시험이라 이 목록에 넣지 않았습니다. 시험 계정 토큰이 있으면 환경변수 VERIFY_TOKEN_A, VERIFY_TOKEN_B 에 넣고 npm run verify:table 을 실행해 채울 수 있으며, 토큰과 메모 본문은 출력하거나 저장하지 않습니다.

### 점검 방식

- 작전실 화면은 /ops.html 이고, 메인 화면(/)에도 같은 수치의 요약 영역이 있습니다. 수치는 서버 기록에서 읽어 옵니다(/ops.html 은 GET /api/ops, 메인 화면은 GET /api/checks).
- GET /api/ops, GET /api/checks, 제출 묶음(npm run bundle)은 모두 src/attack-check.mjs 의 같은 점검 항목 목록에서 숫자를 셉니다. 그래서 화면의 수치와 제출 묶음의 수치가 같습니다.
- 점검 항목은 배포 주소에 보낸 실제 읽기 요청의 응답 상태(live_api)와 보내지 않은 시험(not_run)으로 나뉩니다. 실제 응답이 없는 결과를 계산해서 채우지 않습니다. 가상 메모 본문과 토큰은 기록하지 않습니다.
- 막은 공격은 기대한 결과가 나온 항목 수입니다(금지 요청을 거부했거나 정상 요청을 허용한 경우). 뚫린 공격은 기대와 다른 결과가 나온 항목 수입니다. 실행하지 않은 점검은 막은 공격으로 세지 않습니다.
- 규칙 점검은 GET /api/checks?case=<사례> 가 고정된 가상 입력으로 판정기와 탐지 규칙을 실행하고 돌려주는 ready 값으로 관측합니다. ready 는 가상 조건에서 기대한 판정이 나왔다는 뜻이며 실제 사용자 기기의 승인 상태가 아닙니다.
- 점검 요청마다 fetch 옵션 alephEvidence 에 사례 이름과 요청 종류를 붙이고, 요청 헤더와 주소에는 넣지 않습니다. 읽기(GET) 요청만 보내고 요청마다 대기 시간 상한(8초)이 있습니다.

## 단계별 현재 기능과 다시 실행하는 방법

| 단계 | 현재 기능 | 다시 실행하는 방법 |
|---|---|---|
| 1 | 시작 틀 배포(일부러 뚫린 출발점) | npm run build -- --local |
| 2 | 가상 메모를 Supabase DB로 옮기고 /api/notes 서버 함수로 읽음 | node --test test/notes-api.test.mjs |
| 3 | 이메일·비밀번호 로그인과 토큰 검사(없으면 401) | node --test test/auth-api.test.mjs |
| 4 | 로그인한 사용자의 owner_id 비교, DB 행 단위 보안(db/rls.sql) | node --test test/notes-api.test.mjs |
| 5 | 브라우저는 서버 함수만 부름, DB 직접 권한 회수(db/revoke-direct.sql) | node --test test/r5.test.mjs |
| 6 | 판정기 device_registered 규칙(등록 기기의 읽기만 허용) | npm run decider:test |
| 7 | 판정기 step_up_required 규칙(위험 신호 2개 이상이면 재확인) | npm run decider:test |
| 8 | 구역 표(my-notes, class-notices)와 읽기 전용 allowedRoutes | node --test test/decider-zones.test.mjs |
| 9 | 탐지 규칙(같은 사용자의 조회 10분 안 120건 초과면 회수 제안) | npm run detect:test |
| 10 | 정책 사본 비교·복원, 메모 한 건 복원(POST /api/restore/:noteId) | npm run policy:diff, node --test test/restore-api.test.mjs |
| 11 | 설치형 앱 설정(manifest)과 기기 상태 API, 승인 전에는 메모를 열지 않음 | node --test test/device-app.test.mjs |
| 12 | 탈환 작전실과 점검 요약 | npm run verify:table, node --test test/ops.test.mjs test/checks.test.mjs |

## XDR 보너스

경보 묶음(xdr/fixtures/)을 읽어 경보마다 block(막을 후보), alert(알림), record(기록)로 나눕니다. 모듈마다 decide.mjs 한 파일이 혼자 계산하고, 차단 후보와 알림은 respond.mjs 가 xdr/alerts.log 와 block-rules.json 에 적습니다. 차단 후보는 판정기에 연결하지 않았고 파일로만 있습니다. 다시 실행: npm run xdr:run -- <모듈>.

| 모듈 | 찾는 공격 | block / alert / record |
|---|---|---|
| brute-force | 무차별 로그인 | 10 / 9 / 9 |
| web-injection | 웹 주입 | 8 / 9 / 9 |
| known-cve | 알려진 취약점 악용 | 8 / 8 / 8 |
| persistence | 몰래 심어진 프로그램 | 8 / 8 / 8 |
| privilege | 권한 가로채기 | 9 / 8 / 9 |
| exfiltration | 자료 빼돌리기 | 10 / 10 / 10 |

## 실행하지 못한 것

- 시험 계정 토큰이 필요한 정상 요청 2개, 운영 사본으로 하는 메모 복원, 심판이 실행하는 총공세 41종은 이 저장소에서 실행하지 못했습니다.
- 작전실의 막은 공격은 우리가 정한 기대와 맞았다는 뜻이며 심판의 판정이 아닙니다.
- 11단계의 기기 승인은 엔진이 확인하는 값이라 이 앱 서버는 항상 승인 전으로 응답하고, 그래서 화면에서 메모는 보이지 않습니다.
- 차단 후보를 판정기에 연결하지 않았습니다(판정기 요청에 접속 주소나 목적지가 없습니다).

## 더 자세한 기록

- docs/STEP_RECORDS.md: 이전 README 의 단계별 기록 전체(확인 결과와 남은 약점 포함)
- docs/steps/README.md: 단계마다 나눈 풀이(제작 프롬프트별 한 일과 쉬운 설명)
- docs/DEFENSE_STEPS.md: 한 장 요약
- AGENTS.md: 코딩 도구에 전달하는 규칙
