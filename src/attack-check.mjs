// 3~12단계 점검: 배포에 보낼 수 있는 점검은 실제 읽기 요청을 보내 그 응답으로 observed 를 만든다. 고정 문자열로 「막음」을 적지 않는다.
// 6~9단계 규칙은 배포의 GET /api/checks?case=... 가 고정된 가상 입력으로 판정기·탐지 규칙을 실행한 응답(ready)으로 관측한다.
// 요청마다 alephEvidence 에 사례와 요청 종류를 연결해 심판의 runner 가 응답을 독립적으로 관측할 수 있게 한다.
// 이 메타데이터는 요청 헤더나 주소에 넣지 않는다. 비밀값·토큰·메모 본문은 보내지도 기록하지도 않는다.
// 요청을 보내지 못했거나 보내지 않은 점검은 result 를 not_run 으로 두고 「막음」으로 세지 않는다.
//
// 제출 묶음(npm run bundle), 작전실 화면(/ops.html, /api/ops), 점검 요약(/api/checks)이 모두 이 파일의 같은 항목에서 숫자를 만든다.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TEST_UUID = '00000000-0000-4000-8000-000000000001';
const TIMEOUT_MS = 8000;
const NOTES_IN_BODY = /"content"\s*:|"body"\s*:/u;

function loadConfig() {
  return JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
}

// 요청마다 새 ID를 헤더(x-request-id)로 보내고 같은 값을 결과에 남긴다. 확인 시각도 함께 남긴다.
async function probe(base, path, { method = 'GET', headers = {}, caseId, now, makeId } = {}) {
  const requestId = makeId();
  const checkedAt = now().toISOString();
  try {
    const response = await fetch(new URL(path, base), {
      method, headers: { accept: 'application/json', 'x-request-id': requestId, ...headers }, redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS), alephEvidence: { caseId, requestKey: 'read' },
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON 아님 */ }
    return { ran: true, status: response.status, json, text, hasNotes: NOTES_IN_BODY.test(text), requestId, checkedAt };
  } catch {
    return { ran: false, requestId, checkedAt };
  }
}

// 관측한 사실만 observed 에 적는다. 요청을 보내지 못했으면 not_run 이다.
function attempt(attackId, stage, request, expected, r, blockedWhen) {
  const head = { attackId, stage, kind: 'live_api', request, expected, requestId: r.requestId, checkedAt: r.checkedAt };
  if (!r.ran) return { ...head, observed: 'not_run', result: 'not_run' };
  const note = typeof r.json?.ready === 'boolean' ? `; jsonReady=${r.json.ready}` : '';
  return { ...head, observed: `HTTP ${r.status}${note}`, result: blockedWhen(r) ? 'blocked' : 'breached' };
}

// 보내지 않은 점검. 요청 ID는 없고, 결과는 항상 not_run 이다(통과로 세지 않는다).
function notRun(attackId, stage, request, expected, _reason, now) {
  return { attackId, stage, kind: 'not_run', request, expected, observed: 'not_run', result: 'not_run', requestId: null, checkedAt: now().toISOString() };
}

const denied = r => [401, 403, 404].includes(r.status) && !r.hasNotes;
const noPublicNotes = r => r.status === 404 || (r.status === 200 && !r.hasNotes && !(Array.isArray(r.json?.notes) && r.json.notes.length > 0));
const notApproved = r => r.status === 200 && r.json?.approved === false && !r.hasNotes;
const manifestOk = r => r.status === 200 && typeof r.json?.name === 'string' && r.json.name.length > 0 && !r.hasNotes;
const ruleReady = r => r.status === 200 && r.json?.ready === true;

function resolveBase(config) {
  let base;
  try {
    base = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
      || base.pathname !== '/' || base.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return base;
}

// 점검 항목을 요청 ID·확인 시각·종류와 함께 모은다(작전실과 점검 요약이 쓴다). 입력은 aleph.config.json 객체 또는 배포 주소 문자열이다.
export async function collectAttackChecks(input, { now = () => new Date(), makeId = randomUUID } = {}) {
  const config = typeof input === 'string' ? { ...loadConfig(), publicAppUrl: input } : (input ?? loadConfig());
  const base = resolveBase(config);
  const p = (path, options) => probe(base, path, { ...options, now, makeId });
  const rule = (id, stage, expected) => p(`/api/checks?case=${id}`, { caseId: id }).then(r => attempt(id, stage, `GET /api/checks?case=${id}`, expected, r, ruleReady));

  // 서로 기다리지 않도록 한꺼번에 시작한다(응답이 느려도 전체 대기가 길어지지 않게).
  const results = await Promise.all([
    p('/data.json', { caseId: 's01-static-notes' }).then(r => attempt('s01-static-notes', 1, 'GET /data.json', '/data.json 에 메모가 없음', r, noPublicNotes)),
    p('/notes.json', { caseId: 's02-static-copy' }).then(r => attempt('s02-static-copy', 2, 'GET /notes.json', '다른 정적 사본 없음', r, denied)),
    p('/api/my/notes', { caseId: 's03-unauth-list' }).then(r => attempt('s03-unauth-list', 3, 'GET /api/my/notes (로그인 없음)', '로그인 없는 목록 401', r, denied)),
    p('/api/my/notes', { caseId: 's03-fake-token', headers: { authorization: 'Bearer not-a-real-token' } })
      .then(r => attempt('s03-fake-token', 3, 'GET /api/my/notes (엉터리 토큰)', '위조 토큰 401', r, denied)),
    p(`/api/my/notes?userId=${TEST_UUID}&role=instructor`, { caseId: 's04-query-identity' })
      .then(r => attempt('s04-query-identity', 4, 'GET /api/my/notes (쿼리에 사용자·역할)', '쿼리 신원 무시', r, denied)),
    p('/api/my/notes', { caseId: 's04-header-identity', headers: { 'x-user-id': TEST_UUID, 'x-role': 'instructor' } })
      .then(r => attempt('s04-header-identity', 4, 'GET /api/my/notes (헤더에 사용자·역할)', '헤더 신원 무시', r, denied)),
    p('/rest/v1/notes', { caseId: 's05-direct-table' }).then(r => attempt('s05-direct-table', 5, 'GET /rest/v1/notes', '원본 주소 직접 읽기 거부', r, denied)),
    rule('s06-unregistered', 6, '미등록 기기 거부'),
    rule('s07-compound', 7, '복합 이상 재확인'),
    rule('s08-unknown-route', 8, '모르는 경로 거부'),
    rule('s08-all-notes', 8, '전체 메모 목록 거부'),
    rule('s08-write-notice', 8, '반 공지 쓰기 거부'),
    rule('s08-own-note', 8, '등록 기기의 내 메모 읽기 허용'),
    p('/api/notices', { caseId: 's08-other-zone' }).then(r => attempt('s08-other-zone', 8, 'GET /api/notices (로그인 없음)', '반 공지 로그인 없이 거부', r, denied)),
    rule('s09-burst-read', 9, '조회 폭주 회수 제안'),
    p(`/api/restore/${TEST_UUID}`, { caseId: 's10-restore-unauth' }).then(r => attempt('s10-restore-unauth', 10, 'GET /api/restore/:noteId (로그인 없음)', '로그인 없는 복원 요청 거부', r, denied)),
    p('/api/device/status', { caseId: 's11-device' }).then(r => attempt('s11-device', 11, 'GET /api/device/status', '승인 전 기기 상태 응답', r, notApproved)),
    p('/manifest.json', { caseId: 's11-device-app' }).then(r => attempt('s11-device-app', 11, 'GET /manifest.json', '설치형 앱 설정(manifest)이 있음', r, manifestOk)),
  ]);
  // 로그인이 필요한 정상 요청은 시험 계정 토큰이 없어 보내지 않았다. 통과로 세지 않고 미실행으로 남긴다.
  results.push(
    notRun('s03-login-read', 3, 'GET /api/notes (A 로그인)', '정상 요청 허용(200)과 본인 목록', '시험 계정 토큰이 없어 보내지 않음', now),
    notRun('s04-b-reads-a', 4, 'GET /api/notes/:id (B 로그인, A의 메모)', '거부(404)', '시험 계정 토큰이 없어 보내지 않음', now),
  );
  return results.sort((a, b) => a.stage - b.stage);
}

// 제출 묶음용: 항목마다 정해진 다섯 키만 남긴다.
export async function runAttackChecks(input) {
  const config = typeof input === 'string' ? { ...loadConfig(), publicAppUrl: input } : (input ?? loadConfig());
  const base = resolveBase(config);
  // 1~2단계 설정으로 부르면 옛 동작을 유지한다(시작 틀의 시험이 확인하는 부분).
  if (config.step === 1) return firstStageCheck(config, base);
  if (Number.isInteger(config.step) && config.step < 3) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const items = await collectAttackChecks(config);
  return items.map(({ attackId, stage, expected, observed, result }) => ({ attackId, stage, expected, observed, result }));
}

// 점검 항목을 세어 요약한다. 화면과 묶음이 같은 숫자를 쓰도록 한 곳에서 센다.
export function summarizeAttempts(items) {
  const count = value => items.filter(item => item.result === value).length;
  return { total: items.length, blocked: count('blocked'), failed: count('breached'), notRun: count('not_run') };
}

// 1단계: 공개 data.json 을 로그인 없이 읽어 가상 메모의 확인 표시가 보이는지 본다.
async function firstStageCheck(config, base) {
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', base), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes) && data.notes.length > 0;
    } catch {
      // JSON 이 아니면 확인 표시가 보이지 않은 것으로 본다.
    }
  }
  return [{ attackId: 'anonymous_note_read', stage: 1, expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})`,
    result: visible ? 'breached' : 'blocked' }];
}
