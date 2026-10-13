import { decide } from './decider.mjs';
import { detect } from './detect.mjs';

// 공개 가상 입력만 실행한다. 실제 세션·메모·기기 상태는 읽거나 바꾸지 않는다.
// 응답의 ready 는 이 가상 조건에서 기대한 판정이 나왔는지만 뜻하며, 실제 사용자 기기의 승인 상태가 아니다.
const base = {
  schema: 'aleph.decision.v1', requestId: 'check', method: 'GET', route: 'GET /api/notes/:id',
  deviceRegistered: true, stepUp: { verified: false }, recentEvents: [],
  signals: { source: 'check', region: 'local', network: 'usual', hour: 14 },
};

const CASES = {
  's06-unregistered': [{ ...base, deviceRegistered: false }, 'deny'],
  's07-compound': [{ ...base, signals: { source: 'check', region: 'foreign', network: 'unusual', hour: 3 } }, 'step_up'],
  's08-unknown-route': [{ ...base, route: 'GET /__unknown__' }, 'deny'],
  's08-all-notes': [{ ...base, route: 'GET /api/notes' }, 'deny'],
  's08-write-notice': [{ ...base, method: 'POST', route: 'POST /api/notices' }, 'deny'],
};

export const CASE_IDS = Object.freeze([...Object.keys(CASES), 's09-burst-read']);

// 알려진 사례 이름이면 결과 객체를, 아니면 null 을 돌려준다. 사용자 입력을 코드로 실행하지 않는다.
export async function runRuleCheck(caseId) {
  if (typeof caseId !== 'string') return null;
  if (Object.hasOwn(CASES, caseId)) {
    const [request, expected] = CASES[caseId];
    const result = await decide(request);
    return { ready: result.decision === expected, decision: result.decision, reasonCode: result.reasonCode };
  }
  if (caseId === 's09-burst-read') {
    const start = Date.UTC(2026, 9, 1);
    const events = Array.from({ length: 121 }, (_, i) => ({
      at: new Date(start + i * 2000).toISOString(), method: 'GET', identity: { sub: 'check_user' },
    }));
    const result = detect(events);
    return { ready: result.action === 'propose_revocation', action: result.action };
  }
  return null;
}
