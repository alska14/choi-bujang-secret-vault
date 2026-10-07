import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './decide.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'xdr', 'fixtures', 'brute-force.json');

export { summarize };

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
