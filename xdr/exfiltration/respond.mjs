import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// result.json 을 읽어 알림 줄과 차단 후보 규칙을 만든다. 판정기(src/decider.mjs)는 고치지 않는다.
// 자료 유출은 데이터가 나간 쪽이 문제이므로, 차단 후보는 출발 주소가 아니라 목적지 주소(dstip)로 만든다.
// decide.mjs 는 이 파일의 일(파일 쓰기·판정기 연결)을 하지 않고 판단 결과만 돌려준다.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE = 'exfiltration';
const BLOCK_TTL_MS = 60 * 60 * 1000;

export async function respond({ root = ROOT } = {}) {
  const result = JSON.parse(await readFile(join(root, 'xdr', 'exfiltration', 'result.json'), 'utf8'));
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', 'exfiltration.json'), 'utf8'));
  const byId = new Map(fixture.alerts.map((a) => [a.id, {
    id: a.id, time: a.timestamp ?? '', srcip: a.data?.srcip ?? '', dstip: a.data?.dstip ?? '', user: a.data?.srcuser ?? '',
  }]));

  // 같은 목적지로 record(정상) 판정이 나온 적이 있으면 그 목적지는 차단 후보에서 뺀다(평소 쓰는 목적지를 막지 않는다).
  const normalDestinations = new Set(result.decisions.filter((d) => d.action === 'record').map((d) => byId.get(d.alertId)?.dstip));
  const lines = [];
  const rules = new Map();

  for (const d of result.decisions) {
    const a = byId.get(d.alertId);
    if (!a || d.action === 'record') continue;
    lines.push(`[${MODULE}] ${a.time} ${d.action.toUpperCase()} ${a.id} src=${a.srcip} dst=${a.dstip} user=${a.user} conf=${d.confidence} ${d.reason}`);
    if (d.action === 'block' && a.dstip && !normalDestinations.has(a.dstip) && !rules.has(a.dstip)) {
      rules.set(a.dstip, {
        action: 'deny',
        dstip: a.dstip,
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
  const out = { schema: 'aleph.xdr.blockrules.v1', note: '차단 후보(목적지 기준). 판정기 적용 전 사람이 확인한다.', rules: [...rules.values()] };
  await writeFile(join(root, 'xdr', 'exfiltration', 'block-rules.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  return { alerts: lines.length, rules: out.rules.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  console.log(await respond());
}
