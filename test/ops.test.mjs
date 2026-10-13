import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createOpsApi, readRecovery } from '../src/ops-api.mjs';
import { notRunItems, runCodeChecks, runLiveProbes, summarize } from '../src/ops-checks.mjs';
import { loggedInItems, toMarkdown } from '../scripts/verify-table.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://example.vercel.app/';
const reply = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// 올바르게 막는 배포를 흉내 낸다.
const goodFetch = async (url, options) => {
  const { pathname } = new URL(url);
  if (pathname === '/data.json') return reply(200, { notes: [] });
  if (pathname === '/rest/v1/notes') return reply(404, 'not found');
  if (pathname === '/api/device/status') return reply(200, { approved: false, reason: 'device_not_registered' });
  if (pathname === '/api/notices' && options.method === 'PUT') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  return reply(401, { error: 'UNAUTHENTICATED' });
};

test('실제 요청 점검: 올바르게 막으면 모두 기대대로이고 요청 ID가 서로 다르다', async () => {
  const sent = [];
  const items = await runLiveProbes({ base: BASE, fetchImpl: async (url, options) => { sent.push(options.headers['x-request-id']); return goodFetch(url, options); } });
  assert.ok(items.length >= 12);
  assert.ok(items.every(item => item.result === 'as_expected' && item.kind === 'live_api'), JSON.stringify(items.filter(i => i.result !== 'as_expected')));
  assert.equal(new Set(items.map(item => item.requestId)).size, items.length);
  assert.deepEqual([...sent].sort(), items.map(item => item.requestId).sort());
  assert.ok(items.every(item => /^\d{4}-\d\d-\d\dT/u.test(item.checkedAt) && /^HTTP \d{3}$/u.test(item.observed)));
});

test('메모가 새거나 거부하지 않으면 기대와 다름으로 남고, 응답 본문은 저장하지 않는다', async () => {
  const leaky = async (url, options) => {
    const { pathname } = new URL(url);
    if (pathname === '/api/notes') return reply(200, [{ id: 'x', title: '비밀 제목', content: '비밀 내용' }]);
    return goodFetch(url, options);
  };
  const items = await runLiveProbes({ base: BASE, fetchImpl: leaky });
  const bad = items.filter(item => item.result === 'unexpected');
  assert.ok(bad.length >= 3);
  assert.ok(!JSON.stringify(items).includes('비밀 내용'));
  assert.ok(!JSON.stringify(items).includes('비밀 제목'));
});

test('요청을 보내지 못하면 통과로 세지 않고 미실행으로 남긴다', async () => {
  const items = await runLiveProbes({ base: BASE, fetchImpl: async () => { throw new Error('network'); } });
  assert.ok(items.every(item => item.result === 'not_run' && item.observed === '요청을 보내지 못함'));
  assert.equal(summarize(items).asExpected, 0);
});

test('판정기·탐지 직접 실행 점검은 모두 기대대로이고 종류가 code_run 이다', async () => {
  const items = await runCodeChecks();
  assert.ok(items.length >= 10);
  assert.ok(items.every(item => item.kind === 'code_run' && item.result === 'as_expected'), JSON.stringify(items.filter(i => i.result !== 'as_expected')));
});

test('미실행 항목은 통과로 세지 않고 총공세 41종은 임의로 통과 처리하지 않는다', () => {
  const items = notRunItems();
  assert.ok(items.every(item => item.result === 'not_run' && item.kind === 'not_run' && item.observed.startsWith('미실행')));
  assert.ok(items.some(item => item.id === 's12-total-assault' && /41종/u.test(item.request)));
  const summary = summarize(items);
  assert.equal(summary.asExpected, 0);
  assert.equal(summary.notRun, items.length);
});

test('요약 숫자는 항목 수와 맞는다', async () => {
  const items = [...await runLiveProbes({ base: BASE, fetchImpl: goodFetch }), ...await runCodeChecks(), ...notRunItems()];
  const s = summarize(items);
  assert.equal(s.total, items.length);
  assert.equal(s.asExpected + s.unexpected + s.notRun, s.total);
  assert.equal(s.liveApi + s.codeRun + s.notRun, s.total);
});

test('작전실 API: GET 은 서버 기록을 돌려주고 쓰기는 405, 본문·토큰·성공 문구가 없다', async () => {
  const handler = createOpsApi({ base: BASE, fetchImpl: goodFetch, commit: 'abcdef123456' });
  const call = (method = 'GET') => new Promise(resolve => {
    const headers = {};
    const response = { status(code) { response.code = code; return response; }, setHeader(k, v) { headers[k.toLowerCase()] = v; },
      json(body) { resolve({ code: response.code, body, headers }); } };
    handler({ method }, response);
  });
  const ok = await call();
  assert.equal(ok.code, 200);
  assert.equal(ok.body.schema, 'aleph.ops.v1');
  assert.equal(ok.body.commit, 'abcdef123456');
  assert.equal(ok.body.summary.total, ok.body.items.length);
  assert.ok(ok.body.rules.ids.includes('device_registered'));
  assert.equal(ok.body.recovery.valid, true);
  assert.equal(ok.headers['cache-control'], 'no-store');
  const text = JSON.stringify(ok.body);
  assert.ok(!/Bearer|"content"|"body"|통과했습니다|성공했습니다|방어에 성공/u.test(text));
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const denied = await call(method);
    assert.equal(denied.code, 405);
    assert.equal(denied.headers.allow, 'GET');
  }
});

test('복구 버전 요약은 검증한 사본을 읽고, 사본이 없으면 없다고 알린다', async () => {
  const real = await readRecovery(root);
  assert.equal(real.valid, true);
  assert.equal(real.policyRevision, 9);
  assert.match(real.verifiedCommit, /^[0-9a-f]{12}$/u);
  const missing = await readRecovery(join(root, 'does-not-exist'));
  assert.equal(missing.available, false);
});

test('로그인이 필요한 정상 요청은 토큰이 있을 때만 실행하고 토큰을 남기지 않는다', async () => {
  const none = await loggedInItems({ base: BASE, fetchImpl: goodFetch });
  assert.ok(none.length === 2 && none.every(item => item.result === 'not_run'));
  assert.ok(none.every(item => item.requestId === null)); // 보내지 않은 요청에는 요청 ID가 없다
  const noteId = '77777777-7777-4777-8777-777777777777';
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    const token = options.headers.authorization;
    if (pathname === '/api/notes') return { status: 200, json: async () => [{ id: noteId, title: 't', body: 'SECRET_BODY' }] };
    if (pathname === `/api/notes/${noteId}`) return { status: token === 'Bearer tokenB' ? 404 : 200, json: async () => ({ error: 'NOT_FOUND' }) };
    return { status: 500, json: async () => null };
  };
  const ran = await loggedInItems({ base: BASE, tokenA: 'tokenA', tokenB: 'tokenB', fetchImpl });
  assert.deepEqual(ran.map(item => item.result), ['as_expected', 'as_expected']);
  const text = JSON.stringify(ran);
  assert.ok(!text.includes('tokenA') && !text.includes('tokenB') && !text.includes('SECRET_BODY'));
  const leaky = await loggedInItems({ base: BASE, tokenA: 'tokenA', tokenB: 'tokenB', fetchImpl: async (url, options) => (new URL(url).pathname === '/api/notes'
    ? { status: 200, json: async () => [{ id: noteId }] } : { status: 200, json: async () => ({ id: noteId }) }) });
  assert.equal(leaky[1].result, 'unexpected');
});

test('표 출력에는 단계·요청·기대·실제·요청 ID·확인 시각·결과가 모두 있다', () => {
  const items = [{ id: 'x', stage: 3, kind: 'live_api', request: 'GET /api/notes', expected: '401', observed: 'HTTP 401', requestId: 'rid', checkedAt: '2026-10-13T00:00:00.000Z', result: 'as_expected' }];
  const md = toMarkdown(items, summarize(items));
  for (const word of ['단계', '요청 ID', '확인 시각', 'GET /api/notes', 'HTTP 401', 'rid', '2026-10-13T00:00:00.000Z', '기대대로']) assert.ok(md.includes(word), word);
});

test('작전실 화면은 저장소를 쓰지 않고, 서버가 준 값을 textContent 로만 그리고, 문법 오류가 없다', () => {
  const html = readFileSync(join(root, 'public', 'ops.html'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML/u.test(html));
  assert.match(html, /fetch\('\/api\/ops'/u);
  assert.ok(!/통과했습니다|방어에 성공|성공했습니다/u.test(html));
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  const dir = mkdtempSync(join(tmpdir(), 'ops-'));
  try {
    writeFileSync(join(dir, 'page.mjs'), script);
    execFileSync(process.execPath, ['--check', join(dir, 'page.mjs')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
