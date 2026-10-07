import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAlerts } from './read-alerts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE = 'brute-force';
const BLOCK_TTL_MS = 60 * 60 * 1000;

// result.json 을 읽어 알림 줄과 차단 후보 규칙을 만든다. 판정기(src/decider.mjs)는 고치지 않는다.
export async function respond({ root = ROOT } = {}) {
  const result = JSON.parse(await readFile(join(root, 'xdr', 'brute-force', 'result.json'), 'utf8'));
  const byId = new Map((await readAlerts()).map((a) => [a.id, a]));

  // 같은 주소에서 record(정상) 판정이 나온 적이 있으면 그 주소는 차단 후보에서 뺀다.
  const normalIps = new Set(result.decisions.filter((d) => d.action === 'record').map((d) => byId.get(d.alertId)?.srcip));
  const lines = [];
  const rules = new Map();

  for (const d of result.decisions) {
    const a = byId.get(d.alertId);
    if (!a || d.action === 'record') continue;
    lines.push(`[${MODULE}] ${a.time} ${d.action.toUpperCase()} ${a.id} ip=${a.srcip} user=${a.user} conf=${d.confidence} ${d.reason}`);
    if (d.action === 'block' && a.srcip && !normalIps.has(a.srcip) && !rules.has(a.srcip)) {
      rules.set(a.srcip, {
        action: 'deny',
        srcip: a.srcip,
        evidenceAlertId: a.id,
        expiresAt: new Date(Date.parse(a.time) + BLOCK_TTL_MS).toISOString(),
      });
    }
  }

  // 알림 로그는 모듈들이 함께 쓴다. 이 모듈의 이전 줄만 바꾸고 다른 모듈의 줄은 보존한다.
  const logPath = join(root, 'xdr', 'alerts.log');
  const previous = (await readFile(logPath, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const keep = previous.filter((l) => l.startsWith('[') && !l.startsWith(`[${MODULE}] `));
  await writeFile(logPath, `${[...keep, ...lines].join('\n')}\n`, 'utf8');
  const out = { schema: 'aleph.xdr.blockrules.v1', note: '차단 후보. 판정기 적용 전 사람이 확인한다.', rules: [...rules.values()] };
  await writeFile(join(root, 'xdr', 'brute-force', 'block-rules.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  return { alerts: lines.length, rules: out.rules.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  console.log(await respond());
}
