import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'xdr', 'fixtures', 'brute-force.json');

// 비밀값(비밀번호·토큰·키)처럼 보이는 필드는 처음부터 뽑지 않는다.
export function summarize(alert) {
  const n = Number(alert?.data?.count);
  return {
    id: alert.id,
    time: alert.timestamp,
    srcip: alert.data?.srcip ?? '',
    user: alert.data?.srcuser ?? '',
    level: alert.rule?.level ?? 0,
    description: alert.rule?.description ?? '',
    count: Number.isFinite(n) ? n : null,
    mitre: alert.rule?.mitre ?? [],
  };
}

export async function readAlerts(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return fixture.alerts.map(summarize);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rows = await readAlerts();
  for (const r of rows) console.log([r.id, r.time, r.srcip, r.user, `L${r.level}`, r.description].join(' | '));
  console.log(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
}
