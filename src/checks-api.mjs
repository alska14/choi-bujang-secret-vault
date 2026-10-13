import { collectAttackChecks, summarizeAttempts } from './attack-check.mjs';
import { runRuleCheck } from './rule-check.mjs';

// GET /api/checks?case=<사례>: 고정된 가상 입력으로 판정기·탐지 규칙을 실행하고 결과(ready)를 돌려준다.
// 심판의 runner 가 이 응답을 독립적으로 관측할 수 있다. 사용자 입력은 사례 이름 선택에만 쓰고 코드로 실행하지 않는다.
// GET /api/checks: 제출 묶음(npm run bundle)과 같은 점검 항목에서 센 수치(점검 항목·막은 공격·뚫린 공격·실행하지 않은 점검).
export function createChecksApi({ base, now = () => new Date(), commit = null }) {
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
      const items = await collectAttackChecks({ publicAppUrl: base }, { now });
      return response.status(200).json({ checkedAt: now().toISOString(), commit, ...summarizeAttempts(items) });
    } catch {
      return response.status(503).json({ error: 'checks_unavailable', message: '점검 기록을 만들지 못했습니다.' });
    }
  };
}
