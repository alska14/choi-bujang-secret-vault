# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

각 단계에서 한 일과 확인 방법은 [docs/DEFENSE_STEPS.md](docs/DEFENSE_STEPS.md)에 단계별로 정리했습니다.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계: 자료를 코드 밖으로 옮김

가상 메모는 학습용 Supabase `notes` 테이블에 있고, 화면은 `/api/notes` 서버 함수로 읽습니다. 서버 함수는 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 Vercel 환경변수에서만 읽습니다. `/data.json`과 GitHub 최신 파일에는 메모가 없습니다. 테이블은 RLS를 켰고 `anon`·`authenticated`에 읽기 권한을 주지 않았습니다.

2단계 시점의 남은 약점: `/api/notes`는 로그인 없이 누구나 부를 수 있는 공개 주소였습니다. 3단계에서 로그인 검사를 붙였습니다.

### 가상 메모 노출 확인 절차

메모 문장이 공개 파일에 남았는지 아래 순서로 검색합니다.

1. 현재 배포: `/`, `/data.json`, `/aleph.json`을 로그인 없이 요청해 메모 문장이 있는지 봅니다.
2. GitHub 최신 파일: 푸시한 뒤 `git fetch` 후 `git grep -nE "실습용 가[상] " origin/main`을 실행합니다. 결과가 없어야 합니다.
3. 공개 API: `/api/notes`를 로그인 없이 요청해 응답을 봅니다.

### 확인 결과 (2026-10-06)

- 현재 배포 `/`, `/data.json`: 메모 문장 없음. `/aleph.json`: 메모 문장은 없고, 확인 표시 `SAMPLE_NOTE_1`만 있음(빌드가 `aleph.config.json`에서 복사).
- 로컬 추적 파일: 메모 문장 없음. 메모 본문은 Git에 올리지 않는 `db/seed.local.sql`에만 있음.
- GitHub 최신 파일: 푸시 뒤 `git grep` 검색에서 메모 문장 없음.
- 옛 공개 커밋 `93f6d0e`: `data.json`에 메모 문장 4건이 그대로 남아 있음. 최신 파일에서 지워도 Git 이력에는 남습니다.
- 옛 배포 주소: Vercel 안내 화면이 응답해 메모 유무를 확인하지 못함. 옛 배포를 지웠다고 확인한 것은 아닙니다.

### 남은 약점

- 옛 공개 커밋과 옛 배포에 남은 과거 노출은 해소되지 않았습니다. 이력을 지우거나 옛 배포를 삭제하는 작업은 하지 않았습니다.
- (2단계 시점) `/api/notes`는 로그인 없이 가상 메모 네 건을 돌려주는 공개 API였습니다. 3단계에서 막았습니다.

## 3단계: 진짜 로그인

화면(`public/index.html`)에서 Supabase Auth 이메일·비밀번호로 가입, 로그인, 로그아웃을 합니다. 화면에는 공개용 Project URL과 publishable key만 있고 서버 전용 키는 없습니다. 로그인하면 내 가상 메모를 추가·수정·삭제할 수 있습니다.

서버는 `src/verify-login.mjs`(수정하지 않은 틀 파일)로 요청의 `Authorization: Bearer` 토큰을 검사합니다. 토큰이 없거나 검사에 실패하면 401과 JSON 오류 `{"error":"UNAUTHENTICATED"}`를 돌려주고 자료는 주지 않습니다. 브라우저가 보낸 사용자 ID나 역할은 믿지 않고, 검사로 확인한 사용자 ID만 씁니다. 검사에 쓴 발급자 정보는 `aleph.config.json`의 `identityProvider`에 있습니다(비밀 키 없음).

| 경로 | 동작 |
|---|---|
| `GET /api/notes` | 로그인한 사용자의 메모 배열 |
| `POST /api/notes` | `{id?, title, body}` 추가. `id`는 UUID이며 없으면 서버가 만들어 `{id}`로 돌려줌 |
| `GET /api/notes/:id` | 한 건 `{id, title, body}`. 지운 뒤에는 404 |
| `PUT /api/notes/:id` | `{title, body}` 수정 |
| `DELETE /api/notes/:id` | 삭제(204) |

다시 실행하기: `npm install` 후 `node --test test/notes-api.test.mjs`(가짜 인증·가짜 DB 시험), 배포 후에는 로그인 없이 `/api/notes`를 요청해 401을 확인합니다.

### 3단계 남은 약점

- (3단계 시점) `GET·PUT·DELETE /api/notes/:id`는 소유자 검사를 하지 않아, 로그인한 B가 A의 메모 id를 알면 읽고 고치고 지울 수 있었습니다. 4단계에서 막았습니다.
- 로그인은 신원 확인일 뿐 권한 구분이 없습니다.
- 옛 공개 커밋 `93f6d0e`와 옛 배포의 과거 노출은 여전히 해소되지 않았습니다.
- 이 단계의 점검(`src/attack-check.mjs`)은 로그인 없는 요청만 직접 보냈고, 로그인한 A·B 계정 시험은 실행하지 않았습니다.

## 4단계: 로그인해도 내 자료만 보이게

API는 검증된 사용자 ID와 DB의 `owner_id`를 비교합니다. `GET·PUT·DELETE /api/notes/:id`는 id와 소유자가 모두 맞는 행만 다루고, 남의 메모나 주인 없는 메모는 존재 여부를 알리지 않도록 404로 거부합니다. 추가할 때 `owner_id`는 확인된 사용자 ID로 저장하며, URL·본문의 `owner_id`는 쓰지 않습니다. 수정은 소유자를 바꾸지 않고, 삭제는 본인 메모만 됩니다. 한 건 응답은 `{id,title,body}`, 수정 본문은 `{title,body}`입니다. 허용 경로 `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`는 `aleph.config.json`의 `allowedRoutes`에 있습니다.

DB는 `db/rls.sql`로 `notes` 테이블의 권한을 `public·anon·authenticated`에서 모두 회수한 뒤 `authenticated`에만 SELECT·INSERT·UPDATE·DELETE를 주고, 행 단위 보안(RLS) 정책으로 `auth.uid() = owner_id`인 행만 허용합니다. 수정 정책은 기존 행과 새 행의 소유자를 모두 확인합니다. 서버 API는 서버 전용 키로 접속하므로 이 정책과 별개로 코드에서 소유자를 비교합니다.

### 4단계 확인 결과 (2026-10-06)

- 정책 적용 전: `anon`과 `authenticated` 모두 `notes` 권한 없음(`role_table_grants`, `has_table_privilege`). 적용 후: `anon`은 권한 없음, `authenticated`는 SELECT·INSERT·UPDATE·DELETE만 남음.
- DB에서 직접 확인(트랜잭션 안에서 역할과 사용자를 흉내 내고 롤백): A는 자기 메모 4건만, B는 자기 메모 1건만 보임. A가 B의 메모를 수정·삭제하면 0건. A가 메모의 `owner_id`를 B로 바꾸거나 B 소유로 추가하면 정책이 거부함. `anon`은 권한 오류.
- 앱 API의 A/B 흐름은 가짜 인증과 가짜 DB로 시험했습니다(`test/notes-api.test.mjs`). 실제 로그인 토큰을 보낸 A/B 시험과 `src/attack-check.mjs`의 점검은 로그인 없는 요청만 실행했고, 로그인한 A·B 시험은 미실행입니다.

### 4단계 남은 약점

- 주인 없는 메모(`owner_id`가 비어 있는 시험 자료 한 건)는 아무도 읽을 수 없습니다.
- 옛 공개 커밋 `93f6d0e`와 옛 배포의 과거 노출은 여전히 해소되지 않았습니다.
- 서버 전용 키로 접속하는 API는 RLS를 거치지 않으므로, 소유자 비교가 코드에서만 지켜집니다.

## 5단계: 자료 요청을 서버 한곳으로 모음

브라우저는 Supabase를 직접 부르지 않고 Vercel 서버 함수(`/api/auth`, `/api/notes`)만 부릅니다. 화면 코드(`public/index.html`)에는 Supabase 공개 키(`sb_publishable_…`)도 SDK도 없습니다. 키는 서버 환경변수(`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)에만 둡니다.

- `/api/auth`(`src/auth-api.mjs`)가 로그인·가입·토큰 갱신·로그아웃을 대신 받습니다. 브라우저에는 `access_token`, `refresh_token`, `expires_at`, `email`만 돌려주고, 이 토큰을 `/api/notes`에 `Authorization: Bearer`로 보냅니다. 서버 함수의 로그인·소유자 검사는 4단계 그대로입니다.
- `db/revoke-direct.sql`로 `notes` 테이블의 `public·anon·authenticated` 직접 권한을 모두 회수했습니다. 서버 함수는 서버 전용 키(`service_role`)로 접속해 영향이 없습니다. RLS와 정책은 남겨 둔 이중 방어입니다.
- 쿼리 없는 원본 자료 경로는 `aleph.config.json`의 `originalApiUrl`에 적었습니다. 심판은 배포 주소의 `/aleph.json`에서 이 값을 읽으므로, 빌드(`scripts/deployment-identity.mjs`)가 `originalApiUrl`, `allowedRoutes`, `identityProvider`(비밀값 없음)를 `/aleph.json`에도 기록합니다. 설정에만 적고 `/aleph.json`에 안 옮기면 심판이 `S05_ORIGINAL_URL_MISSING`으로 거부합니다.

### 5단계 확인 결과 (2026-10-06)

- 권한 회수 전: `authenticated`에 SELECT·INSERT·UPDATE·DELETE가 있었음. 회수 후: `anon`, `authenticated` 모두 권한 없음, `service_role`은 유지(서버 역할이 6건을 읽음). `role_table_grants`와 `has_table_privilege`로 대조.
- 공개 키로 원본 REST 경로를 직접 호출하면 HTTP 401 `permission denied for table notes`. 키 없이 호출해도 401.
- 배포 화면 코드에서 `sb_publishable`, `sb_secret`, SDK 문자열 검색 결과 0건.
- 배포된 `/api/auth`에 틀린 비밀번호로 로그인을 요청하면 Supabase의 `Invalid login credentials`가 400으로 돌아옴(서버→Supabase 경로 확인). 가입 요청은 계정이 생겨서 보내지 않았습니다.
- 로그인한 A·B 실제 토큰으로 앱을 쓴 시험은 실행하지 않았습니다(가짜 인증·가짜 DB 시험만 실행).

### 5단계 남은 약점

- 로그인 호출을 서버 함수로 옮긴 것은 화면에서 키를 없애기 위한 변경입니다. `/api/auth`는 로그인 없이 부를 수 있는 공개 주소이고 자체 횟수 제한이 없어, 비밀번호 대입 방어는 Supabase Auth의 기본 제한에 기댑니다.
- 로그인 토큰은 브라우저 `localStorage`에 저장됩니다. 화면에 스크립트가 주입되면 읽힐 수 있습니다.
- 주인 없는 메모 한 건, 옛 공개 커밋 `93f6d0e`와 옛 배포의 과거 노출은 그대로입니다.
- 화면 코드에서 지운 공개 키(`sb_publishable_…`)는 3단계 커밋부터 Git 이력에 남아 있습니다. 공개용 키이고 `notes` 직접 권한을 회수해 쓸 수 없지만, 이력까지 지운 것은 아닙니다. 필요하면 Supabase에서 키를 새로 만들어 교체합니다.

## 6단계: 등록된 기기만 자료실에 들어갑니다

`src/decider.mjs`에 규칙 하나 `device_registered`를 추가했습니다. 반 엔진이 확인해 요청에 담아 보내는 `deviceRegistered`가 `true`이고 동작이 `GET`(자료 읽기)일 때만 `allow`(이유 코드 `device_registered`)합니다. 값이 `false`이거나 없으면 `deny`와 이유 코드 `device_not_registered`로 거부합니다. 그 밖의 요청(등록 기기의 `GET` 아닌 동작 등)은 시작 틀의 기본 거부(`starter.deny`)로 남습니다. 요청 계약에 없는 값은 쓰지 않았고, 새 키·비밀값은 만들지 않았습니다.

다시 실행하기: `npm run decider:test`를 실행하면 아래 둘이 보여야 합니다.

- `통과 · 등록 기기의 정상 요청`: 등록 기기 + 읽기는 allow
- `통과 · 미등록 기기의 가상 요청`: deny, `device_not_registered`

이 명령은 가상 요청으로 연습하는 것이며 심판 판정이나 실제 기기 차단 증거가 아닙니다. 미등록 기기 공격은 심판이 따로 시험합니다. `src/attack-check.mjs`의 `unregistered_device` 점검도 판정기를 직접 실행한 결과이고 배포에 보낸 요청이 아닙니다.

### 6단계 남은 약점

- 등록 기기의 `GET` 아닌 요청(추가·수정·삭제)은 이 규칙으로 허용하지 않아 기본 거부로 남습니다. 어떤 동작을 허용할지는 이후 규칙에서 정해야 합니다.
- `deviceRegistered`가 실제로 참인지는 반 엔진이 확인합니다. 이 판정기는 그 값을 그대로 받아 쓰므로, 엔진 확인이 틀리면 판정도 틀립니다. 로컬 연습은 이 연결을 확인하지 못합니다.
- 실제 등록 기기 화면과 판정기 연결을 배포에서 눌러 본 시험은 실행하지 않았습니다.

## 7단계: 평소와 다른 접속은 다시 확인합니다

`src/decider.mjs`에 규칙 하나 `step_up_required`를 더했습니다. 등록 기기의 읽기(`GET`) 요청에서 아래 위험 신호가 **둘 이상** 겹치고, 엔진이 확인한 재인증이 없으면 `step_up`(이유 코드 `step_up_required`)을 돌려줍니다. 하나뿐이면 막지 않고 `allow` 합니다. 지역 하나만으로 사용자를 영구 차단하지 않습니다.

- `signals.region`이 `foreign`
- `signals.network`가 `unusual`
- `signals.hour`가 0~5시
- `recentEvents`에 `risk_signal`이 10건 이상

값이 없거나 `unknown`이면 위험으로 세지도, 정상값으로 채우지도 않습니다. 판정기는 엔진이 검증해 넘긴 요청 필드만 읽고 브라우저 헤더나 요청 본문의 위치 값은 읽지 않습니다. 재인증은 `stepUp.verified`가 `true`이고 `authAgeSeconds`가 0~900초일 때만 인정합니다(나이가 없거나 900초를 넘으면 인정하지 않음). 기기 규칙(`device_registered`)과 미등록 기기 거부는 그대로입니다.

다시 실행하기: `npm run decider:test`를 실행하면 아래 넷이 보여야 합니다. `npm run fixture:7`은 정상 사건 allow, 복합 이상 사건 step_up을 보여 줍니다.

- 등록 기기의 정상 요청: allow
- 미등록 기기의 가상 요청: deny, `device_not_registered`
- 복합 이상 접속: step_up, `step_up_required`
- 다시 확인한 복합 이상 접속: allow

이 명령들은 가상 요청으로 연습하는 것이며 심판 판정이나 실제 접속 차단 증거가 아닙니다.

### 7단계 확인 결과와 남은 약점

- 엔진의 재로그인 계약은 요청의 `stepUp`(`verified`, `authAgeSeconds`)으로만 확인했습니다. 엔진이 "확인 전 자료를 막고 새 로그인 뒤 요청을 다시 판정"하는 실제 경로는 이 환경에서 시험하지 않았습니다. 가상 사건 규칙만 로컬에서 시험했고 **실제 자료 차단은 미실행**입니다.
- `src/attack-check.mjs`의 `compound_anomaly` 점검도 판정기를 직접 실행한 결과이며 배포에 보낸 요청이 아닙니다.
- 위험 신호의 임계값(두 개 이상, `risk_signal` 10건, 0~5시)은 연습용 값이고 실제 사용자 행동 기준으로 조정하지 않았습니다.
- 등록 기기의 `GET` 아닌 요청은 6단계처럼 기본 거부로 남아 있어, 대량 수정 사건도 추가 확인이 아니라 거부됩니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

**구역(자원 ID) 표.** `src/decider.mjs`의 `ZONES`가 엔진이 확인한 `route` 모양을 구역에 묶습니다. 표에 없는 경로는 모두 `route_not_allowed`로 거부합니다. 쿼리로 기능을 고르지 않고 자료 ID(`:id`)만 고르며, `:id`와 같은 깊이에 `export` 같은 기능 경로를 두지 않았습니다.

| 구역 ID | 열어 둔 경로 | 동작 |
|---|---|---|
| `my-notes` | `GET /notes/:id`, `GET /api/notes/:id`, `GET /api/my/notes` | 읽기만 |
| `class-notices` | `GET /api/notices` | 읽기만 |
| `instructor-materials` | 없음 | 이 앱에서는 열지 않음(표에 없어 거부) |

**쓰기는 모두 거부.** `POST·PUT·PATCH·DELETE`는 구역과 관계없이 `write_not_allowed`로 거부합니다. 일반 학생이 강사 공지를 수정하는 요청도 여기서 막힙니다. 요청 계약에는 메모 주인이나 강사 역할 값이 없어서 판정기는 역할로 구역을 열지 않습니다. 주인 비교는 엔진과 자료 API가 맡습니다. 이전 규칙(`device_registered`, `step_up_required`)은 그대로 유지했습니다.

**자료 API 확인(제작 3).** `/api/notes`는 4단계부터 검증된 사용자 ID와 저장된 `owner_id`를 비교하고, 남의 메모는 존재 여부를 알리지 않도록 404(`NOT_FOUND`)로 거부합니다. 8단계에서는 로직을 바꾸지 않고 시험을 추가했습니다. 본문·쿼리에 `role`, `owner_id`를 끼워 넣은 직접 요청으로도 B가 A의 메모를 읽거나 고치거나 지우지 못하고, 목록에는 본인 메모만 나옵니다(`test/notes-api.test.mjs`).

다시 실행하기:

- `node --test test/decider-zones.test.mjs test/notes-api.test.mjs`: 구역 규칙과 직접 API 시험
- `npm run decider:test`: 이전 단계 4개 연습도 그대로 통과해야 합니다

이 명령들은 가상 요청과 가짜 DB로 하는 연습이며 심판 판정이나 실제 배포 시험이 아닙니다. `src/attack-check.mjs`의 `other_zone` 점검도 판정기를 직접 실행한 결과입니다.

### 8단계 확인 결과와 남은 약점

- 판정기 쓰기 거부: 이 규칙은 본인 메모 수정도 판정기 단계에서 허용하지 않습니다. 요청 계약에 주인 값이 없어 "내 메모인지"를 판정기가 확인할 수 없기 때문입니다. 본인 메모 수정의 허용 여부는 자료 API(소유자 비교)가 정합니다. 엔진이 이 판정기를 실제 경로에서 호출하면 화면의 추가·수정·삭제가 막힐 수 있습니다.
- 화면(`public/index.html`)은 `GET /api/notes`로 목록을 읽습니다. 이 경로는 구역 표와 `allowedRoutes`에서 뺐으므로 엔진 경로에서는 열리지 않습니다. 화면 메뉴 변경은 이번 요청에 넣지 않아 화면 연결은 손대지 않았습니다. 기존 `/api/notes` 주소와 4단계 소유자 검사는 코드에 그대로 남아 있습니다.
- 강사 공지 구역: 이 앱에는 저장된 공지 자료가 없습니다. `GET /api/notices`는 로그인한 사용자에게 빈 목록을 돌려주고 쓰기는 405로 거부합니다. 강사 역할 값은 계약에 없어 역할로 여는 코드는 없습니다.
- 실제 배포에서 다른 계정으로 직접 API를 불러 본 시험은 실행하지 않았습니다. 가짜 인증·가짜 DB 시험만 실행했습니다.

### 8단계 보완: 구역을 설정에도 선언 (첫 제출 36/100점 뒤)

첫 제출에서 심판이 `S08_OTHER_ZONE_ALLOWED`(다른 사용자의 메모가 열리거나 일반 학생이 공지를 수정할 수 있음)로 판정했습니다. 판정기 표(`ZONES`)는 맞았지만 `aleph.config.json`의 `allowedRoutes`에는 구역 없이 쓰기 경로(`POST·PUT·DELETE /api/notes/:id`)와 목록 경로까지 열려 있었습니다. 심판은 이 값을 `/aleph.json`으로 읽으므로, 설정도 판정기 표와 같은 내용으로 맞췄습니다.

- `allowedRoutes`를 `{service, method, pathPattern, zone}` 객체로 바꾸고 읽기 경로 4개만 남겼습니다: `GET /api/my/notes`, `GET /notes/:id`, `GET /api/notes/:id`(구역 `my-notes`)와 `GET /api/notices`(구역 `class-notices`). 쓰기와 전체 목록 경로는 뺐습니다.
- 선언한 경로가 실제로 있도록 `api/my/notes.js`(본인 메모 목록, GET만)와 `api/notices.js`(반 공지 읽기, GET만)를 추가했습니다. 둘 다 로그인 없이는 401, 읽기 외 동작은 405입니다.
- 이 변경은 첫 제출 결과와 강사 통과용 표본의 설정 모양을 근거로 한 것이며, 심판의 정확한 판정 방식을 확인한 것은 아닙니다.

## 9단계: 도플갱어를 찾고 권한을 거둡니다

`src/detect.mjs`의 `detect(events)`가 가상 조회 사건에서 이상한 조회 폭주를 찾아 회수를 **제안**합니다. 같은 `identity.sub`의 `GET` 사건이 어느 10분 구간에서든 **120건을 넘을 때만** `{ action: 'propose_revocation', reasonCode: 'burst_read', subject: '해당 sub' }`를 돌려줍니다. 그 밖에는 `{ action: 'observe' }`입니다.

- 정확히 120건은 제안하지 않고, 121건부터 제안합니다.
- 다른 사용자의 사건은 합산하지 않고, 10분 밖의 사건은 같은 묶음으로 세지 않습니다. 사건이 시간 순서가 아니어도 사용자별로 정렬해 셉니다.
- 사건에서 시각(`at`), 요청 종류(`method`), 가명 사용자(`identity.sub`)만 읽습니다. 메모 내용·토큰·실명 같은 다른 값은 읽거나 저장하거나 출력하지 않고, 결과에는 계약의 세 값만 있습니다.
- `GET`이 아니거나 형식이 틀린 사건은 세지 않고 버립니다. 정상값으로 채우지 않습니다. 배열이 아닌 입력은 `invalid_detection_events` 오류입니다.
- 이 파일은 다른 파일을 불러오지 않는 단독 파일입니다. 실제 회수 API는 만들지 않았고, 판정기(`src/decider.mjs`)와 기존 허용·거부 응답은 바꾸지 않았습니다.

다시 실행하기: `npm run detect:test`에서 아래 여섯 개가 통과해야 합니다. `node --test test/detect.test.mjs`는 경계·섞인 사용자·형식 오류·단독 실행 시험입니다.

- 정상 조회 30건, 10분 안에 120건: 관찰
- 10분 안에 121건, 폭주 조회 200건: 회수 제안
- 서로 다른 사용자 각 100건, 10분 밖으로 흩어진 조회 200건: 관찰

이 명령들은 가상 사건 연습이며 **실제 접속 회수나 심판 판정이 아닙니다.** `src/attack-check.mjs`의 `burst_read` 점검도 탐지 함수를 직접 실행한 결과입니다.

### 9단계 확인 결과와 남은 약점

- 실제 회수 집행, 회수된 신원으로 다음 요청을 재시도하는 경우, 회수 뒤 남은 세션으로 재접속하는 경우, 회수된 기기가 다른 자원으로 이동하는 경우는 운영 반 엔진이 집행하고 심판이 확인합니다. 이 저장소에서는 시험하지 못했고 **엔진 연결·실제 회수는 미실행**입니다.
- 프롬프트의 "평소와 다른 네트워크가 함께 나타날 때만 의심"은 구현하지 않았습니다. 계약(`docs/DETECT_EVENTS.md`)의 사건에는 네트워크 값이 없고 계약에 없는 값은 쓰지 않기로 했기 때문입니다. 규칙은 계약대로 조회 폭주 하나입니다.
- 회수 대상은 계약의 `subject`(가명 사용자) 하나입니다. 기기 값은 사건에 없어서 기기 한 개로 한정하는 부분은 구현하지 않았습니다.
- 임계값 120건·10분은 연습 계약의 값이며 실제 사용자 행동으로 조정하지 않았습니다.
