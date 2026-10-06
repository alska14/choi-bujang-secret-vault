# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

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
- 쿼리 없는 원본 자료 경로는 `aleph.config.json`의 `originalApiUrl`에 적었습니다.

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
