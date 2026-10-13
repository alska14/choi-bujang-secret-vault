// 3~12단계 점검: 배포에 보낼 수 있는 점검은 실제 읽기 요청을 보내 그 응답으로 observed 를 만든다. 고정 문자열로 「막음」을 적지 않는다.
// 6~9단계 규칙은 배포의 GET /api/checks?case=... 가 고정된 가상 입력으로 판정기·탐지 규칙을 실행한 응답(ready)으로 관측한다.
// 요청마다 alephEvidence 에 사례와 요청 종류를 연결해 심판의 runner 가 응답을 독립적으로 관측할 수 있게 한다.
// 이 메타데이터는 요청 헤더나 URL에 넣지 않는다. 비밀값·토큰·메모 본문은 보내지도 기록하지도 않는다.
// 요청을 보내지 못한 점검은 result 를 not_run 으로 두고 「막음」으로 세지 않는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_UUID = '00000000-0000-4000-8000-000000000001';
const TIMEOUT_MS = 8000;
const NOTES_IN_BODY = /"content"\s*:|"body"\s*:/u;

function loadConfig() {
  return JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
}

async function probe(base, path, { method = 'GET', headers = {}, caseId } = {}) {
  try {
    const response = await fetch(new URL(path, base), {
      method, headers: { accept: 'application/json', ...headers }, redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS), alephEvidence: { caseId, requestKey: 'read' },
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON 아님 */ }
    return { ran: true, status: response.status, json, text, hasNotes: NOTES_IN_BODY.test(text) };
  } catch {
    return { ran: false };
  }
}

// 관측한 사실만 observed 에 적는다. 요청을 보내지 못했으면 not_run 이다.
function attempt(attackId, stage, expected, r, blockedWhen) {
  if (!r.ran) return { attackId, stage, expected, observed: 'network_error', result: 'not_run' };
  const note = typeof r.json?.ready === 'boolean' ? `; jsonReady=${r.json.ready}` : '';
  return { attackId, stage, expected, observed: `HTTP ${r.status}${note}`, result: blockedWhen(r) ? 'blocked' : 'breached' };
}

const denied = r => [401, 403, 404].includes(r.status) && !r.hasNotes;
const noPublicNotes = r => r.status === 404 || (r.status === 200 && !r.hasNotes && !(Array.isArray(r.json?.notes) && r.json.notes.length > 0));
const notApproved = r => r.status === 200 && r.json?.approved === false && !r.hasNotes;
const ruleReady = r => r.status === 200 && r.json?.ready === true;

// 입력은 aleph.config.json 객체 또는 배포 주소 문자열이다.
export async function runAttackChecks(input) {
  const config = typeof input === 'string' ? { ...loadConfig(), publicAppUrl: input } : (input ?? loadConfig());
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

  // 1~2단계 설정으로 부르면 옛 동작을 유지한다(시작 틀의 시험이 확인하는 부분).
  if (config.step === 1) return firstStageCheck(config, base);
  if (Number.isInteger(config.step) && config.step < 3) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');

  const p = (path, options) => probe(base, path, options);
  const rule = (id, stage, expected) => p(`/api/checks?case=${id}`, { caseId: id }).then(r => attempt(id, stage, expected, r, ruleReady));

  // 서로 기다리지 않도록 한꺼번에 시작한다(응답이 느려도 전체 대기가 길어지지 않게).
  const results = await Promise.all([
    p('/data.json', { caseId: 's01-static-notes' }).then(r => attempt('s01-static-notes', 1, '/data.json 에 메모가 없음', r, noPublicNotes)),
    p('/notes.json', { caseId: 's02-static-copy' }).then(r => attempt('s02-static-copy', 2, '다른 정적 사본 없음', r, denied)),
    p('/api/my/notes', { caseId: 's03-unauth-list' }).then(r => attempt('s03-unauth-list', 3, '로그인 없는 목록 401', r, denied)),
    p('/api/my/notes', { caseId: 's03-fake-token', headers: { authorization: 'Bearer not-a-real-token' } })
      .then(r => attempt('s03-fake-token', 3, '위조 토큰 401', r, denied)),
    p(`/api/my/notes?userId=${TEST_UUID}&role=instructor`, { caseId: 's04-query-identity' })
      .then(r => attempt('s04-query-identity', 4, '쿼리 신원 무시', r, denied)),
    p('/api/my/notes', { caseId: 's04-header-identity', headers: { 'x-user-id': TEST_UUID, 'x-role': 'instructor' } })
      .then(r => attempt('s04-header-identity', 4, '헤더 신원 무시', r, denied)),
    p('/rest/v1/notes', { caseId: 's05-direct-table' }).then(r => attempt('s05-direct-table', 5, '원본 주소 직접 읽기 거부', r, denied)),
    rule('s06-unregistered', 6, '미등록 기기 거부'),
    rule('s07-compound', 7, '복합 이상 재확인'),
    rule('s08-unknown-route', 8, '모르는 경로 거부'),
    rule('s08-all-notes', 8, '전체 메모 목록 거부'),
    rule('s08-write-notice', 8, '반 공지 쓰기 거부'),
    p('/api/notices', { caseId: 's08-other-zone' }).then(r => attempt('s08-other-zone', 8, '반 공지 로그인 없이 거부', r, denied)),
    rule('s09-burst-read', 9, '조회 폭주 회수 제안'),
    p(`/api/restore/${TEST_UUID}`, { caseId: 's10-restore-unauth' }).then(r => attempt('s10-restore-unauth', 10, '로그인 없는 복원 요청 거부', r, denied)),
    p('/api/device/status', { caseId: 's11-device' }).then(r => attempt('s11-device', 11, '승인 전 기기 상태', r, notApproved)),
    deviceAppCheck(p),
    opsScreenCheck(p),
    policySnapshotCheck(),
  ]);
  return results.sort((a, b) => a.stage - b.stage);
}

// 11단계: 설치형 앱 설정(manifest)이 있고 화면이 그것을 연결하는지 읽어 본다.
async function deviceAppCheck(p) {
  const expected = '앱 설정(manifest)이 있고 화면이 연결함';
  const [manifest, page] = await Promise.all([p('/manifest.json', { caseId: 's11-device-app' }), p('/', { caseId: 's11-device-app' })]);
  if (!manifest.ran || !page.ran) return { attackId: 's11-device-app', stage: 11, expected, observed: 'network_error', result: 'not_run' };
  const linked = page.text.includes('rel="manifest"');
  return { attackId: 's11-device-app', stage: 11, expected,
    observed: `manifest HTTP ${manifest.status} 이름 ${manifest.json?.name ?? '-'}; 화면 manifest 연결 ${linked ? '있음' : '없음'}`,
    result: manifest.status === 200 && manifest.json?.name && linked && !page.hasNotes ? 'blocked' : 'breached' };
}

// 12단계: 작전실 화면과 서버 기록(/api/ops)이 있고 항목 수와 요약이 서로 맞는지 읽어 본다. 메모 본문은 기록하지 않는다.
async function opsScreenCheck(p) {
  const expected = '작전실 화면과 서버 기록이 있고 항목 수와 요약이 맞으며 미실행이 구분됨';
  const [page, api] = await Promise.all([p('/ops.html', { caseId: 's12-ops-screen' }), p('/api/ops', { caseId: 's12-ops-screen' })]);
  if (!page.ran || !api.ran) return { attackId: 's12-ops-screen', stage: 12, expected, observed: 'network_error', result: 'not_run' };
  const s = api.json?.summary;
  const matches = Array.isArray(api.json?.items) && s?.total === api.json.items.length && s.asExpected + s.unexpected + s.notRun === s.total;
  return { attackId: 's12-ops-screen', stage: 12, expected,
    observed: `작전실 HTTP ${page.status}; 서버 기록 HTTP ${api.status}; 항목 ${s?.total ?? '-'}개(미실행 ${s?.notRun ?? '-'}); 수치 일치 ${matches ? '예' : '아니오'}`,
    result: page.status === 200 && api.status === 200 && matches && !api.hasNotes ? 'blocked' : 'breached' };
}

// 10단계: 정책 사본을 다시 읽어 검증한다. 코드 실행 결과이며 실제 복원을 실행한 것이 아니다.
async function policySnapshotCheck() {
  const expected = '복원 전에 정책 사본을 다시 읽어 검증함';
  const { diffPolicy, readCurrentPolicy, verifySnapshot } = await import('../scripts/policy-restore.mjs');
  const root = new URL('..', import.meta.url);
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(new URL('backup/policy-snapshot.json', root), 'utf8'));
  } catch {
    return { attackId: 's10-policy-snapshot', stage: 10, expected, observed: '사본을 읽지 못해 중단(코드 실행, 복원 실행 안 함)', result: 'not_run' };
  }
  const reason = verifySnapshot(snapshot);
  if (reason) return { attackId: 's10-policy-snapshot', stage: 10, expected, observed: `사본 검증 실패(코드 실행): ${reason}`.slice(0, 280), result: 'breached' };
  const changes = diffPolicy(snapshot, readCurrentPolicy(fileURLToPath(root)));
  return { attackId: 's10-policy-snapshot', stage: 10, expected,
    observed: `사본 검증 통과(코드 실행, 복원 실행 안 함): 정책 버전 ${snapshot.policyRevision}, 현재 정책과의 차이 ${changes.length}개`, result: 'blocked' };
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
