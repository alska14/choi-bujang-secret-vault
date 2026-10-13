import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { collectAttackChecks, runAttackChecks, summarizeAttempts } from '../src/attack-check.mjs';
import { createChecksApi } from '../src/checks-api.mjs';
import { createOpsApi, readRecovery } from '../src/ops-api.mjs';
import { runRuleCheck } from '../src/rule-check.mjs';
import { loggedInItems, toMarkdown } from '../scripts/verify-table.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://example.vercel.app';
const reply = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// 올바르게 막는 배포를 흉내 낸다. 규칙 사례는 실제 판정기·탐지 함수로 답한다.
async function goodDeployment(url) {
  const u = new URL(url);
  const { pathname } = u;
  if (pathname === '/data.json') return reply(200, { notes: [] });
  if (pathname === '/notes.json' || pathname === '/rest/v1/notes') return reply(404, 'not found');
  if (pathname === '/api/checks') return reply(200, await runRuleCheck(u.searchParams.get('case')));
  if (pathname === '/api/device/status') return reply(200, { approved: false, reason: 'device_not_registered' });
  if (pathname === '/manifest.json') return reply(200, { name: '나의 자료실' });
  if (pathname === '/') return reply(200, '<html><link rel="manifest" href="/manifest.json"></html>');
  return reply(401, { error: 'UNAUTHENTICATED' });
}

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('점검 항목: 올바르게 막는 배포에서는 보낸 요청이 모두 막음이고 보내지 않은 2개는 미실행이다', async () => {
  const items = await withFetch(goodDeployment, () => collectAttackChecks(BASE));
  assert.equal(items.length, 20);
  const sent = items.filter(item => item.kind === 'live_api');
  assert.ok(sent.length === 18 && sent.every(item => item.result === 'blocked'), JSON.stringify(sent.filter(i => i.result !== 'blocked')));
  const skipped = items.filter(item => item.kind === 'not_run');
  assert.deepEqual(skipped.map(item => item.attackId).sort(), ['s03-login-read', 's04-b-reads-a']);
  assert.ok(skipped.every(item => item.result === 'not_run' && item.requestId === null && item.observed.startsWith('not_run')));
  assert.deepEqual(summarizeAttempts(items), { total: 20, blocked: 18, failed: 0, notRun: 2 });
});

test('점검 항목: 요청마다 서로 다른 요청 ID와 확인 시각이 있고 같은 ID를 헤더로 보낸다', async () => {
  const sentIds = [];
  const items = await withFetch(async (url, options) => { sentIds.push(options.headers['x-request-id']); return goodDeployment(url); }, () => collectAttackChecks(BASE));
  const ids = items.filter(item => item.requestId).map(item => item.requestId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => sentIds.includes(id)));
  assert.ok(items.every(item => /^\d{4}-\d\d-\d\dT/u.test(item.checkedAt)));
});

test('제출 묶음의 항목은 같은 목록에서 다섯 키만 뽑은 것이라 숫자가 같다', async () => {
  const rich = await withFetch(goodDeployment, () => collectAttackChecks(BASE));
  const bundle = await withFetch(goodDeployment, () => runAttackChecks(BASE));
  assert.deepEqual(bundle.map(item => item.attackId), rich.map(item => item.attackId));
  assert.ok(bundle.every(item => Object.keys(item).sort().join(',') === 'attackId,expected,observed,result,stage'));
  const count = (list, value) => list.filter(item => item.result === value).length;
  assert.deepEqual(summarizeAttempts(rich), { total: bundle.length, blocked: count(bundle, 'blocked'), failed: count(bundle, 'breached'), notRun: count(bundle, 'not_run') });
});

test('메모가 새면 뚫림으로 적고, 응답 본문은 기록하지 않는다', async () => {
  const leaky = async (url) => (new URL(url).pathname === '/api/my/notes' ? reply(200, [{ id: 'x', title: '비밀 제목', content: '비밀 내용' }]) : goodDeployment(url));
  const items = await withFetch(leaky, () => collectAttackChecks(BASE));
  assert.ok(items.filter(item => item.result === 'breached').length >= 3);
  assert.ok(!JSON.stringify(items).includes('비밀 내용') && !JSON.stringify(items).includes('비밀 제목'));
});

test('요청을 보내지 못하면 오류 없이 미실행으로 남고 막음으로 세지 않는다', async () => {
  const items = await withFetch(async () => { throw new Error('network'); }, () => collectAttackChecks(BASE));
  assert.ok(items.every(item => item.result === 'not_run'));
  assert.equal(summarizeAttempts(items).blocked, 0);
});

test('작전실 API: 수치와 표가 같은 항목에서 오고 점검 요약(/api/checks)과 숫자가 같다', async () => {
  const call = (handler, request) => new Promise(resolve => {
    const headers = {};
    const response = { status(code) { response.code = code; return response; }, setHeader(k, v) { headers[k.toLowerCase()] = v; },
      json(body) { resolve({ code: response.code, body, headers }); } };
    handler(request, response);
  });
  const { summary, ops, checks } = await withFetch(goodDeployment, async () => {
    const opsHandler = createOpsApi({ base: BASE, commit: 'abcdef123456' });
    const checksHandler = createChecksApi({ base: BASE, commit: 'abcdef123456' });
    return {
      ops: await call(opsHandler, { method: 'GET' }),
      checks: await call(checksHandler, { method: 'GET', query: {} }),
      summary: await call(opsHandler, { method: 'POST' }),
    };
  });
  assert.equal(ops.code, 200);
  assert.equal(ops.body.schema, 'aleph.ops.v1');
  assert.equal(ops.body.commit, 'abcdef123456');
  assert.equal(ops.body.summary.total, ops.body.items.length);
  assert.ok(ops.body.rules.ids.includes('device_registered'));
  assert.equal(ops.body.recovery.valid, true);
  assert.equal(ops.headers['cache-control'], 'no-store');
  assert.equal(checks.code, 200);
  for (const key of ['total', 'blocked', 'failed', 'notRun']) assert.equal(checks.body[key], ops.body.summary[key], key);
  assert.ok(!/Bearer|"content"|"body"/u.test(JSON.stringify(ops.body)));
  assert.equal(summary.code, 405);
  assert.equal(summary.headers.allow, 'GET');
});

test('규칙 사례: 정상 요청 허용과 금지 요청 거부가 모두 기대한 판정이다', async () => {
  assert.equal((await runRuleCheck('s08-own-note')).decision, 'allow');
  assert.equal((await runRuleCheck('s06-unregistered')).decision, 'deny');
  assert.equal((await runRuleCheck('s07-compound')).decision, 'step_up');
  assert.equal(await runRuleCheck('unknown'), null);
});

test('복구 버전 요약은 검증한 사본을 읽고, 사본이 없으면 없다고 알린다', async () => {
  const real = await readRecovery(root);
  assert.equal(real.valid, true);
  assert.equal(real.policyRevision, 9);
  assert.match(real.verifiedCommit, /^[0-9a-f]{12}$/u);
  assert.equal((await readRecovery(join(root, 'does-not-exist'))).available, false);
});

test('로그인이 필요한 정상 요청은 토큰이 있을 때만 실행하고 토큰을 남기지 않는다', async () => {
  const none = await loggedInItems({ base: BASE, fetchImpl: goodDeployment });
  assert.ok(none.length === 2 && none.every(item => item.result === 'not_run' && item.requestId === null));
  const noteId = '77777777-7777-4777-8777-777777777777';
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    const token = options.headers.authorization;
    if (pathname === '/api/notes') return { status: 200, json: async () => [{ id: noteId, title: 't', body: 'SECRET_BODY' }] };
    if (pathname === `/api/notes/${noteId}`) return { status: token === 'Bearer tokenB' ? 404 : 200, json: async () => ({ error: 'NOT_FOUND' }) };
    return { status: 500, json: async () => null };
  };
  const ran = await loggedInItems({ base: BASE, tokenA: 'tokenA', tokenB: 'tokenB', fetchImpl });
  assert.deepEqual(ran.map(item => item.result), ['blocked', 'blocked']);
  const text = JSON.stringify(ran);
  assert.ok(!text.includes('tokenA') && !text.includes('tokenB') && !text.includes('SECRET_BODY'));
  const leaky = await loggedInItems({ base: BASE, tokenA: 'tokenA', tokenB: 'tokenB', fetchImpl: async (url) => (new URL(url).pathname === '/api/notes'
    ? { status: 200, json: async () => [{ id: noteId }] } : { status: 200, json: async () => ({ id: noteId }) }) });
  assert.equal(leaky[1].result, 'breached');
});

test('표 출력에는 단계·요청·기대·실제·요청 ID·확인 시각·결과가 모두 있다', () => {
  const items = [{ attackId: 'x', stage: 3, kind: 'live_api', request: 'GET /api/notes', expected: '401', observed: 'HTTP 401', requestId: 'rid', checkedAt: '2026-10-13T00:00:00.000Z', result: 'blocked' }];
  const md = toMarkdown(items, summarizeAttempts(items));
  for (const word of ['단계', '요청 ID', '확인 시각', 'GET /api/notes', 'HTTP 401', 'rid', '2026-10-13T00:00:00.000Z', '막음']) assert.ok(md.includes(word), word);
});

test('작전실 화면은 저장소를 쓰지 않고, 서버가 준 값을 textContent 로만 그리고, 문법 오류가 없다', () => {
  const html = readFileSync(join(root, 'public', 'ops.html'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML/u.test(html));
  assert.match(html, /fetch\('\/api\/ops'/u);
  for (const label of ['점검 항목', '막은 공격', '뚫린 공격', '실행하지 않은 점검']) assert.ok(html.includes(label), label);
  for (const key of ['total', 'blocked', 'failed', 'notRun']) assert.ok(html.includes(`data-k="${key}"`), key);
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
