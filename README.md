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

- `GET·PUT·DELETE /api/notes/:id`는 아직 소유자 검사를 하지 않습니다. 로그인한 B가 A의 메모 id를 알면 읽고 고치고 지울 수 있습니다. 4단계에서 `owner_id`를 비교해 막습니다. 목록 `GET /api/notes`만 본인 메모로 거릅니다.
- 로그인은 신원 확인일 뿐 권한 구분이 없습니다.
- 옛 공개 커밋 `93f6d0e`와 옛 배포의 과거 노출은 여전히 해소되지 않았습니다.
- 이 단계의 점검(`src/attack-check.mjs`)은 로그인 없는 요청만 직접 보냈고, 로그인한 A·B 계정 시험은 실행하지 않았습니다.
