import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 확인용 읽기 모듈이다. decide.mjs 는 이 파일을 불러오지 않는다(decide.mjs 는 혼자 동작한다).
// 경보에서 시각·출발 주소·계정·규칙 수준·설명만 뽑는다. 요청 주소·머리글 같은 값(문서용 조회 구문이 들어 있을 수 있음)은 뽑지도 출력하지도 않는다.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'xdr', 'fixtures', 'known-cve.json');

export function summarize(alert) {
  const a = alert && typeof alert === 'object' ? alert : {};
  const data = a.data && typeof a.data === 'object' ? a.data : {};
  const n = Number(data.count);
  return {
    id: a.id,
    time: a.timestamp ?? '',
    srcip: data.srcip ?? '',
    user: data.srcuser ?? '',
    level: Number(a.rule?.level) || 0,
    description: typeof a.rule?.description === 'string' ? a.rule.description : '',
    count: Number.isFinite(n) ? n : null,
    mitre: Array.isArray(a.rule?.mitre) ? a.rule.mitre : [],
  };
}

export async function readAlerts(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return fixture.alerts.map(summarize);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rows = await readAlerts();
  for (const r of rows) console.log([r.id, r.time, r.srcip, r.user, `L${r.level}`, r.description].join(' | '));
  console.log(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
}
