import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'xdr', 'fixtures', 'brute-force.json');

// 비밀값(비밀번호·토큰·키)처럼 보이는 필드는 처음부터 뽑지 않는다.
export function summarize(alert) {
  const a = alert && typeof alert === 'object' ? alert : {};
  const data = a.data && typeof a.data === 'object' ? a.data : {};
  // 필드 모양이 조금 달라도 읽도록 설명문 후보를 모아 한 줄로 만든다. 비밀값 필드(password 등)는 쓰지 않는다.
  const text = [a.rule?.description, a.description, a.full_log, a.message, data.title, data.message]
    .filter((v) => typeof v === 'string').join(' ');
  const field = data.count ?? data.failures ?? data.attempts;
  const fromText = Number((text.match(/(d+)s*(?:건|회|번)/) ?? [])[1]);
  const n = field !== undefined ? Number(field) : fromText;
  const accounts = Array.isArray(data.accounts) ? data.accounts.length
    : typeof data.accounts === 'string' ? data.accounts.split(',').filter(Boolean).length : 0;
  return {
    id: a.id,
    time: a.timestamp ?? a.time ?? '',
    srcip: data.srcip ?? data.src_ip ?? '',
    user: data.srcuser ?? data.user ?? '',
    level: Number(a.rule?.level ?? a.level) || 0,
    description: text,
    count: Number.isFinite(n) ? n : null,
    accounts,
    mitre: a.rule?.mitre ?? [],
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
