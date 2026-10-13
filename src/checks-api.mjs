import { notRunItems, runCodeChecks, runLiveProbes, summarize } from './ops-checks.mjs';
import { runRuleCheck } from './rule-check.mjs';

// GET /api/checks?case=<사례>: 고정된 가상 입력으로 판정기·탐지 규칙을 실행하고 결과(ready)를 돌려준다.
// 심판의 runner 가 이 응답을 독립적으로 관측할 수 있다. 사용자 입력은 사례 이름 선택에만 쓰고 코드로 실행하지 않는다.
// GET /api/checks: 작전실과 같은 점검(실제 요청·코드 실행·미실행)의 요약 수치.
export function createChecksApi({ base, fetchImpl = fetch, now = () => new Date(), commit = null }) {
  return async function checks(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
    }
    try {
      if (request.query?.case !== undefined) {
        const result = await runRuleCheck(request.query.case);
        return result ? response.status(200).json(result) : response.status(400).json({ error: 'unknown_check' });
      }
      const items = [...await runLiveProbes({ base, fetchImpl, now }), ...await runCodeChecks({ now }), ...notRunItems({ now })];
      const s = summarize(items);
      return response.status(200).json({ checkedAt: now().toISOString(), commit, total: s.total, blocked: s.asExpected, failed: s.unexpected, notRun: s.notRun });
    } catch {
      return response.status(503).json({ error: 'checks_unavailable', message: '점검 기록을 만들지 못했습니다.' });
    }
  };
}
