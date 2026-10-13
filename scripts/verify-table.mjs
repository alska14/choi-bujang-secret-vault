import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAttackChecks, summarizeAttempts } from '../src/attack-check.mjs';

// 12단계: 1~11단계의 정상·금지 요청을 한 표로 만듭니다. 항목마다 기대 결과, 실제 결과, 요청 ID, 확인 시각을 남깁니다.
// 점검 항목은 제출 묶음(npm run bundle)과 작전실 화면이 쓰는 목록(src/attack-check.mjs)과 같습니다.
//   npm run verify:table                          배포 주소(aleph.config.json 의 publicAppUrl)에 요청을 보냅니다.
//   npm run verify:table -- --base https://...    다른 주소를 지정합니다.
// 로그인이 필요한 정상 요청은 시험 계정 토큰이 있을 때만 실행합니다(읽기 요청만, 메모 본문은 저장하지 않음).
//   VERIFY_TOKEN_A, VERIFY_TOKEN_B 환경변수에 시험 계정 A·B의 로그인 토큰을 넣으면 됩니다. 토큰은 출력하거나 저장하지 않습니다.
// 실행하지 않은 시험은 통과로 처리하지 않고 not_run 으로 남깁니다.
export async function loggedInItems({ base, tokenA, tokenB, fetchImpl = fetch, now = () => new Date(), makeId = () => crypto.randomUUID() }) {
  const head = (attackId, stage, request, expected) => ({ attackId, stage, kind: 'live_api', request, expected, requestId: makeId(), checkedAt: now().toISOString() });
  // 요청을 보내지 않은 항목에는 요청 ID를 적지 않는다. 보냈다가 실패한 경우에만 보낸 ID를 남긴다.
  const skip = (item, reason) => ({ ...item, kind: 'not_run', observed: `not_run: ${reason}`, result: 'not_run',
    requestId: reason === '요청을 보내지 못함' ? item.requestId : null });
  const get = async (path, token, item) => {
    try {
      const response = await fetchImpl(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json', authorization: `Bearer ${token}`, 'x-request-id': item.requestId } });
      let json = null;
      try { json = await response.json(); } catch { /* JSON 아님 */ }
      return { status: response.status, json };
    } catch {
      return null;
    }
  };
  const itemA = head('s03-login-read', 3, 'GET /api/notes (A 로그인)', '정상 요청 허용(200)과 본인 목록');
  const itemB = head('s04-b-reads-a', 4, 'GET /api/notes/:id (B 로그인, A의 메모)', '거부(404)');
  if (!tokenA) return [skip(itemA, '시험 계정 A 토큰 없음'), skip(itemB, '시험 계정 A·B 토큰 없음')];
  const list = await get('/api/notes', tokenA, itemA);
  const out = [];
  if (!list) out.push(skip(itemA, '요청을 보내지 못함'));
  else out.push({ ...itemA, observed: `HTTP ${list.status}, 메모 ${Array.isArray(list.json) ? list.json.length : '-'}건`,
    result: list.status === 200 && Array.isArray(list.json) ? 'blocked' : 'breached' });
  const noteId = Array.isArray(list?.json) ? list.json[0]?.id : undefined;
  if (!tokenB) out.push(skip(itemB, '시험 계정 B 토큰 없음'));
  else if (typeof noteId !== 'string') out.push(skip(itemB, 'A의 메모가 없어 대상 ID가 없음'));
  else {
    const other = await get(`/api/notes/${noteId}`, tokenB, itemB);
    out.push(!other ? skip(itemB, '요청을 보내지 못함') : { ...itemB, observed: `HTTP ${other.status}`, result: other.status === 404 ? 'blocked' : 'breached' });
  }
  return out;
}

export function toMarkdown(items, summary) {
  const kind = { live_api: '실제 API', not_run: '미실행' };
  const result = { blocked: '막음', breached: '뚫림', not_run: '미실행' };
  const lines = ['| 단계 | 종류 | 요청 | 기대 | 실제 | 요청 ID | 확인 시각 | 결과 |', '|---|---|---|---|---|---|---|---|'];
  for (const item of items) {
    lines.push(`| ${item.stage} | ${kind[item.kind] ?? item.kind} | ${item.request} | ${item.expected} | ${item.observed} | ${item.requestId ?? '-'} | ${item.checkedAt} | ${result[item.result]} |`);
  }
  lines.push('', `점검 항목 ${summary.total}개: 막음 ${summary.blocked}, 뚫림 ${summary.failed}, 미실행 ${summary.notRun}`);
  return lines.join('\n');
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
  const at = process.argv.indexOf('--base');
  const base = at >= 0 ? process.argv[at + 1] : config.publicAppUrl;
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/iu.test(base ?? '')) throw new Error('--base 에는 https://….vercel.app 주소를 넣어 주세요.');

  const collected = await collectAttackChecks({ publicAppUrl: base });
  const loggedIn = await loggedInItems({ base, tokenA: process.env.VERIFY_TOKEN_A, tokenB: process.env.VERIFY_TOKEN_B });
  const replaced = new Set(loggedIn.map(item => item.attackId));
  const items = [...collected.filter(item => !replaced.has(item.attackId)), ...loggedIn].sort((a, b) => a.stage - b.stage);
  const summary = summarizeAttempts(items);

  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts', 'verify-table.json'), `${JSON.stringify({ schema: 'aleph.verify-table.v1', base, summary, items }, null, 2)}\n`, 'utf8');
  console.log(toMarkdown(items, summary));
  console.log('\n표를 artifacts/verify-table.json 에도 저장했습니다(커밋하지 않는 폴더). 미실행 항목은 통과로 세지 않습니다.');
  if (summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : '표 만들기 오류'); process.exitCode = 1; });
}
