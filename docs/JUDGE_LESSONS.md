# 심판 점수를 올린 방법 (다른 세션용 정리)

BYTE BACK 방어전 1~12단계와 XDR 보너스를 풀면서 점수가 낮게 나왔던 이유와 고친 방법을 모은 글이다. 새 단계를 시작하거나 점수가 낮을 때 먼저 읽는다. 아래 내용은 판정 메시지와 강사 표본에서 얻은 것이고, 심판 코드를 직접 본 것은 아니다.

## 1. 작업 전에 알아 둘 것

- 저장소: https://github.com/alska14/choi-bujang-secret-vault (main에 push하면 Vercel이 자동 배포)
- 배포 주소: https://choi-bujang-secret-vault-six.vercel.app
- 배포가 반영됐는지는 `/aleph.json` 의 `commit` 값이 방금 push한 커밋과 같은지로 본다. 심판 화면의 커밋도 같아야 한다.
- 제출 묶음은 `npm run bundle`로 만든다. 작업 폴더가 깨끗해야 하고(커밋 완료), `bundle-notes.json`·`artifacts/`·`submission.json` 은 커밋하지 않는다.
- 비밀값(Supabase 키, TypeSafe Jev 키, 토큰)은 저장소, 문서, 대화에 적지 않는다. 환경변수 이름만 적는다.
- 심판은 배포 주소에 실제 요청을 보내고, 저장소 파일은 격리된 복사본에서 실행한다. 그 환경에는 인터넷이 없다.

## 2. 점수가 낮았던 원인과 해결

| 판정 코드 | 의미 | 원인 | 해결 |
|---|---|---|---|
| `X01_CLEAR_NOT_BLOCKED` (XDR 0점) | 명백한 공격을 막지 않음 | `decide.mjs`가 여러 파일을 import해서 격리 실행에서 깨짐, 또는 level 기준이 약함 | `decide.mjs`는 import·fs·네트워크 없이 파일 하나로. level 10 이상은 block, 5~9는 alert를 하한으로 둠 |
| `S08_OTHER_ZONE_ALLOWED` | 다른 구역 경로 허용 | `allowedRoutes`에 구역(zone)이 없고 쓰기·목록 경로가 있었음 | 읽기 전용 경로만, 구역 표시(`my-notes`, `class-notices`)와 함께 4개로 줄임 |
| `S11_KEY_EXPOSED` | 키 노출 | 브라우저 localStorage에 토큰, 해시를 64자리 연속 hex로 적음 | localStorage 제거, 해시는 8자씩 대시로 끊어 표기, 주석 정리 |
| `UNV_RUN_ENVIRONMENT` | 실행 환경을 확인 못 함 | 점검 코드의 요청 형식이 표본과 달랐음 | 표본의 `fetch` 옵션(`redirect:'manual'`, `AbortSignal.timeout`, `alephEvidence`)과 항목 형식을 그대로 따름 |
| `S12_SCREEN_MISMATCH` | 화면 수치와 서버 기록이 다름 | 작전실 26개, 제출 묶음 19개로 숫자가 달랐음 | 점검 목록을 `src/attack-check.mjs` 한 곳으로 모아 화면, API, 묶음이 같은 항목을 셈 |
| `S12_SOURCE_MIXED` | 학생 작업과 제공 엔진의 출처가 안 나뉨 | README가 405줄이고 출처 표가 333번째 줄에 있었음(표본은 10번째 줄) | README를 120줄로 줄이고 맨 앞에 출처 표를 둠. 긴 기록은 `docs/STEP_RECORDS.md`로 이동 |
| `S12_SLOGAN_AS_PASS` | 성공 문구만 있고 실제 응답이 없음 | 「통과」「성공」 문장 위주였음 | 성공·통과 문구를 빼고, 실제 요청 응답(HTTP 상태, 요청 ID, 시각)을 표로 적음 |
| `UNV_AMBIGUOUS` | 응답을 대조할 수 없음 | 보내지 않은 점검의 observed가 `not_run: 사유`였고, 한 attackId가 요청을 두 번 보냈음 | observed는 정확히 `not_run`, attackId 하나에 요청 하나 |

## 3. 심판 형식 규칙 (한 번 틀리면 판정이 보류됨)

- 제출 묶음의 점검 항목은 정확히 `attackId, stage, expected, observed, result` 다섯 키만 쓴다. result는 `blocked`, `breached`, `not_run` 중 하나, 항목은 1~20개.
- observed는 심판이 알아보는 형식이어야 한다: `HTTP 401`, `bodyBytes=`, `jsonArrayLength=`, `jsonReady=`, `method=`, `urlSha256=`, 또는 `not_run`.
- 요청을 보내지 않은 항목은 observed를 정확히 `not_run`으로 쓰고 막은 공격으로 세지 않는다. 통과로 꾸미지 않는다.
- attackId 하나에는 요청 하나만 대응시킨다. 여러 번 보내면 `request=키#번호` 형식이 필요한데, 가장 안전한 방법은 항목을 나누거나 줄이는 것이다.
- 점검 요청에는 `alephEvidence: { caseId, requestKey }` 를 fetch 옵션으로 붙인다. 요청 헤더나 URL에 넣지 않는다.
- 화면에 보이는 수치(점검 항목, 막은 공격, 뚫린 공격, 실행하지 않은 점검)와 제출 묶음 수치는 같은 목록에서 세어 일치시킨다. 이름표도 표본과 같게 쓴다.
- README에는 `**` 굵은 글씨를 쓰지 않는다(심판 AI가 문장을 인용해 대조할 때 방해가 될 수 있다는 표본 저장소의 변경 기록이 있다).

## 4. README 구성 (12단계에서 통과한 형태)

1. 한 문단 소개와 링크
2. 출처 표: 학생이 만든 것 / 시작 틀에서 온 것 / 제공 엔진(ALEPH SDP 엔진, 이 저장소에 엔진 코드 없음) / 외부 서비스
3. 설치·실행·중지·복구 (검사한 커밋 기준)
4. 점검 기록: 실제 요청 표(요청 ID, 확인 시각 포함)와 정상 허용·금지 거부 응답
5. 실행하지 못한 것을 솔직하게 적기
6. 더 자세한 기록 링크

원칙: 핵심 내용은 앞쪽에, 평문으로, 측정한 값만 적는다. 과장하거나 꾸미지 않는다.

## 5. 제출 칸 글 쓰는 법

- "한 일"에는 출처 구분(학생 / 시작 틀 / 제공 엔진 / 외부 서비스), 실제로 보낸 요청 수와 결과, 실제 응답 예시를 직접 쓴다. README만 믿지 않는다.
- 실제로 못 한 것(토큰이 필요한 요청, 심판이 돌리는 총공세 등)은 막힌 점에 쓴다.
- 비밀값, 토큰, 메모 본문은 쓰지 않는다.

## 6. 작업 습관

- 점수가 낮으면 판정 코드와 메시지를 먼저 그대로 읽고, 코드마다 원인을 하나씩 가설로 세운다. 추측으로 여러 곳을 한꺼번에 고치지 않는다.
- 강사의 통과용 표본 저장소(`byteback-sample-pass`)와 같은 형식인지 비교한다. 우리 쪽이 표본과 다르면 그 차이가 첫 후보다.
- 수정 뒤에는 테스트를 돌리고, push하고, 배포의 `/aleph.json` 커밋을 확인한 다음 `npm run bundle`을 한다. 제출 전에 심판 화면 커밋이 같은지 본다.
- 결과가 어떤 수정 덕분인지 알 수 없는 경우가 많다. 문서에는 확인한 사실과 추정을 나눠 적는다.
- `test/package-starter.test.mjs` 1건은 시작 틀부터 실패하던 것이라 무시한다.

## 7. XDR 보너스 요약

- 구조: `xdr/fixtures/<모듈>.json`(경보), `scripts/xdr-run.mjs`(실행기), 모듈 폴더의 `decide.mjs`(경보 하나를 받아 `{action, confidence, reason}` 반환).
- 임계값: confidence 0.85 이상 block, 0.5 이상 alert, 그 아래 record. level 10 이상은 block, 5~9는 alert를 하한으로 둔다.
- `decide.mjs`는 단독 파일, import 없음, 파일·네트워크 접근 없음. 패턴은 파일 안에 넣는다.
- TypeSafe Jev API는 xdr-01·02에서만 쓰고 confidence를 올리는 용도로만 쓴다. 응답이 없어도 규칙만으로 판정한다.
- 결과: brute-force 10/9/9, web-injection 8/9/9, known-cve 8/8/8, persistence 8/8/8, privilege 9/8/9, exfiltration 10/10/10 (block/alert/record 개수). 01·02는 100점, 03~06은 결과를 아직 확인하지 못했다.

## 8. 단계별 진행 상태

| 단계 | 결과 |
|---|---|
| 1~9 | 통과(6~8단계는 구역 문제로 한 번 36점 후 수정) |
| 10 | 제출했으나 판정 결과를 이 기록에서 확인하지 못함 |
| 11 | 키 노출로 40점 후 수정해서 통과 |
| 12 | 여섯 번째 제출에서 통과(커밋 6df2243) |

자세한 풀이는 `docs/steps/README.md`, 단계별 확인 결과와 남은 약점은 `docs/STEP_RECORDS.md` 에 있다.
