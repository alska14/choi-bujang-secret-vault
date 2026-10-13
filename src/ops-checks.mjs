import { randomUUID } from 'node:crypto';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { RULE_IDS, decide } from './decider.mjs';
import { detect } from './detect.mjs';

// 12단계 탈환 작전실의 점검 모음. 항목마다 종류를 구분한다.
//   live_api  : 배포된 주소에 실제 HTTP 요청을 보내 받은 응답 상태로 판단한 결과
//   code_run  : 판정기·탐지 함수를 가상 요청으로 직접 실행한 결과(배포 요청이 아님)
//   not_run   : 실행하지 못했거나 실행하지 않은 시험. 통과로 세지 않는다.
// 응답 본문(가상 메모 포함)과 토큰은 저장하거나 돌려주지 않고, 상태 코드와 기대 여부만 남긴다.
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';
const REJECT = [401, 403];

const rejects = (statuses = REJECT) => r => statuses.includes(r.status)
  && !/"content"\s*:|"body"\s*:/u.test(r.text) && (statuses.includes(405) || typeof r.json?.error === 'string');

const LIVE_PROBES = [
  { id: 's01-public-data', stage: 1, expected: '공개 data.json에 메모가 없음', path: '/data.json',
    judge: r => r.status === 404 || (r.status === 200 && (!Array.isArray(r.json?.notes) || r.json.notes.length === 0)) },
  { id: 's03-unauth-list', stage: 3, expected: '로그인 없는 목록 요청은 401·403과 JSON 오류', path: '/api/notes', judge: rejects() },
  { id: 's03-bad-token', stage: 3, expected: '엉터리 토큰은 401·403', path: '/api/notes',
    headers: { authorization: 'Bearer not-a-real-token' }, judge: rejects() },
  { id: 's04-query-identity', stage: 4, expected: '쿼리에 끼워 넣은 사용자·역할은 무시되어 401·403',
    path: `/api/notes?userId=${UNKNOWN_ID}&role=instructor`, judge: rejects() },
  { id: 's04-header-identity', stage: 4, expected: '헤더에 끼워 넣은 사용자·역할은 무시되어 401·403', path: '/api/notes',
    headers: { 'x-user-id': UNKNOWN_ID, 'x-role': 'instructor' }, judge: rejects() },
  { id: 's05-direct-table', stage: 5, expected: '원본 자료 주소 직접 요청은 401·403·404이고 메모 없음', path: '/rest/v1/notes',
    judge: r => [401, 403, 404].includes(r.status) && !/"content"\s*:|"body"\s*:/u.test(r.text) },
  { id: 's08-notices-unauth', stage: 8, expected: '로그인 없는 반 공지 요청은 401·403', path: '/api/notices', judge: rejects() },
  { id: 's08-my-notes-unauth', stage: 8, expected: '로그인 없는 본인 목록 요청은 401·403', path: '/api/my/notes', judge: rejects() },
  { id: 's08-notice-write', stage: 8, expected: '로그인 없는 공지 수정 요청은 401·403·405', path: '/api/notices', method: 'PUT',
    judge: rejects([401, 403, 405]) },
  { id: 's10-restore-unauth', stage: 10, expected: '로그인 없는 복원 요청은 401·403', path: `/api/restore/${UNKNOWN_ID}`, method: 'POST', judge: rejects() },
  { id: 's11-device-status', stage: 11, expected: '기기 상태는 승인 전(approved=false)', path: '/api/device/status',
    judge: r => r.status === 200 && r.json?.approved === false },
  { id: 's11-device-forged', stage: 11, expected: '승인한 척하는 헤더가 있어도 승인 전', path: '/api/device/status',
    headers: { 'x-device-registered': 'true' }, judge: r => r.status === 200 && r.json?.approved === false },
];

const result = ok => (ok ? 'as_expected' : 'unexpected');

// 배포 주소에 실제 요청을 보낸다. 요청마다 ID를 새로 만들어 헤더(x-request-id)로 보내고 확인 시각과 함께 남긴다.
export async function runLiveProbes({ base, fetchImpl = fetch, now = () => new Date(), makeId = randomUUID, timeoutMs = 8000 }) {
  return Promise.all(LIVE_PROBES.map(async probe => {
    const requestId = makeId();
    const checkedAt = now().toISOString();
    const head = { id: probe.id, stage: probe.stage, kind: 'live_api',
      request: `${probe.method ?? 'GET'} ${probe.path.split('?')[0]}`, expected: probe.expected, requestId, checkedAt };
    try {
      const response = await fetchImpl(new URL(probe.path, base), {
        method: probe.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', 'x-request-id': requestId, ...probe.headers },
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* JSON 아님 */ }
      return { ...head, observed: `HTTP ${response.status}`, result: result(probe.judge({ status: response.status, json, text })) };
    } catch {
      return { ...head, observed: '요청을 보내지 못함', result: 'not_run' };
    }
  }));
}

// 판정기·탐지 함수를 가상 요청으로 직접 실행한다. 배포에 보낸 요청이 아니다.
export async function runCodeChecks({ now = () => new Date() } = {}) {
  const { normal, suspicious } = fixtureRequests();
  const ask = patch => decide({ ...normal, requestId: randomUUID(), ...patch });
  const item = (id, stage, request, expected, observed, ok, requestId) => ({
    id, stage, kind: 'code_run', request, expected, observed, requestId, checkedAt: now().toISOString(), result: result(ok) });
  const out = [];
  const registered = await ask({});
  out.push(item('s06-registered-allow', 6, '판정기 정상 요청(등록 기기 읽기)', '허용', registered.decision, registered.decision === 'allow', registered.requestId));
  const unregistered = await ask({ deviceRegistered: false });
  out.push(item('s06-unregistered-deny', 6, '판정기 미등록 기기 요청', '거부(device_not_registered)', `${unregistered.decision}/${unregistered.reasonCode}`,
    unregistered.decision === 'deny' && unregistered.reasonCode === 'device_not_registered', unregistered.requestId));
  const compound = await decide({ ...suspicious, requestId: randomUUID() });
  out.push(item('s07-compound-step-up', 7, '판정기 복합 이상 접속', '추가 확인(step_up)', compound.decision, compound.decision === 'step_up', compound.requestId));
  const verified = await decide({ ...suspicious, requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } });
  out.push(item('s07-verified-allow', 7, '판정기 다시 확인한 복합 이상 접속', '허용', verified.decision, verified.decision === 'allow', verified.requestId));
  for (const [id, label, patch] of [
    ['s08-unknown-route', '모르는 경로', { route: 'GET /__unknown__' }],
    ['s08-all-notes', '전체 메모 목록', { route: 'GET /api/notes' }],
    ['s08-notice-write', '반 공지 쓰기', { method: 'POST', route: 'POST /api/notices' }],
    ['s08-note-write', '메모 수정', { method: 'PUT', route: 'PUT /api/notes/:id' }],
  ]) {
    const out8 = await ask(patch);
    out.push(item(id, 8, `판정기 ${label} 요청`, '거부', `${out8.decision}/${out8.reasonCode}`, out8.decision === 'deny', out8.requestId));
  }
  const start = Date.UTC(2026, 9, 1);
  const reads = count => Array.from({ length: count }, (_, i) => ({
    at: new Date(start + i * 2000).toISOString(), method: 'GET', identity: { sub: 'ops_check_user' } }));
  const burst = detect(reads(121));
  out.push(item('s09-burst-proposed', 9, '탐지 조회 121건', '회수 제안', burst.action, burst.action === 'propose_revocation', randomUUID()));
  const edge = detect(reads(120));
  out.push(item('s09-edge-observe', 9, '탐지 조회 120건', '관찰', edge.action, edge.action === 'observe', randomUUID()));
  return out;
}

// 실행하지 못한 시험. 임의로 통과 처리하지 않고 이유와 함께 미실행으로 남긴다.
export function notRunItems({ now = () => new Date() } = {}) {
  const base = { kind: 'not_run', requestId: null, checkedAt: now().toISOString(), result: 'not_run' };
  return [
    { ...base, id: 's03-login-read', stage: 3, request: '로그인한 본인의 목록 읽기(정상 요청)', expected: '허용(200)', observed: '미실행: 시험 계정 토큰 없음' },
    { ...base, id: 's04-b-reads-a', stage: 4, request: '로그인한 B가 A의 메모 읽기', expected: '거부(404)', observed: '미실행: 시험 계정 토큰 없음' },
    { ...base, id: 's10-restore-real', stage: 10, request: '사본으로 메모 한 건 복원', expected: '복원 뒤 ID·소유자·내용 해시가 사본과 같음', observed: '미실행: 운영 사본 없음' },
    { ...base, id: 's12-total-assault', stage: 12, request: '총공세 41종 공격', expected: '41종 모두 방어', observed: '미실행: 심판이 실행하는 시험' },
  ];
}

export function summarize(items) {
  const count = value => items.filter(item => item.result === value).length;
  return { total: items.length, asExpected: count('as_expected'), unexpected: count('unexpected'), notRun: count('not_run'),
    liveApi: items.filter(item => item.kind === 'live_api').length, codeRun: items.filter(item => item.kind === 'code_run').length };
}

export const ruleSummary = () => ({ count: RULE_IDS.length, ids: [...RULE_IDS] });
