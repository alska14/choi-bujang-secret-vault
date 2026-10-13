import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffPolicy, readCurrentPolicy, verifySnapshot } from '../scripts/policy-restore.mjs';
import { collectAttackChecks, summarizeAttempts } from './attack-check.mjs';
import { RULE_IDS } from './decider.mjs';

// 12단계 탈환 작전실이 읽는 서버 기록. 화면의 수치와 표는 모두 이 응답에서 온다.
// 점검 항목은 제출 묶음(npm run bundle)과 같은 목록(src/attack-check.mjs)에서 만들어서, 화면의 수치와 묶음의 수치가 같다.
// 항목마다 종류를 구분한다: live_api(배포 주소에 보낸 실제 요청의 응답), not_run(보내지 않은 시험).
// 가상 메모 본문과 토큰은 담지 않는다.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 복구 버전 요약: 검증한 정책 사본을 읽어 검증하고 현재 시험 정책과의 차이 개수를 센다.
export async function readRecovery(root = ROOT) {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(join(root, 'backup', 'policy-snapshot.json'), 'utf8'));
  } catch {
    return { available: false, reason: '정책 사본을 읽지 못했습니다.' };
  }
  const reason = verifySnapshot(snapshot);
  if (reason) return { available: true, valid: false, reason };
  let changes = null;
  try { changes = diffPolicy(snapshot, readCurrentPolicy(root)).length; } catch { /* 현재 정책 파일을 읽지 못하면 비워 둔다 */ }
  return { available: true, valid: true, policyRevision: snapshot.policyRevision, verifiedCommit: snapshot.verifiedCommit.slice(0, 12), changes };
}

export function createOpsApi({ base, recovery = readRecovery, now = () => new Date(), commit = null, collect = collectAttackChecks }) {
  return async function ops(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
    }
    try {
      const [items, recovered] = await Promise.all([collect({ publicAppUrl: base }, { now }), recovery()]);
      return response.status(200).json({
        schema: 'aleph.ops.v1',
        checkedAt: now().toISOString(),
        commit,
        rules: { count: RULE_IDS.length, ids: [...RULE_IDS] },
        recovery: recovered,
        summary: summarizeAttempts(items),
        items,
      });
    } catch {
      return response.status(503).json({ error: 'OPS_UNAVAILABLE', message: '점검 기록을 만들지 못했습니다.' });
    }
  };
}
