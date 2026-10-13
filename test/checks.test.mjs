import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';
import { createChecksApi } from '../src/checks-api.mjs';
import { CASE_IDS, runRuleCheck } from '../src/rule-check.mjs';

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

test('규칙 사례는 모두 기대한 판정이 나오고, 모르는 사례는 실행하지 않는다', async () => {
  assert.ok(CASE_IDS.length >= 7);
  assert.ok(CASE_IDS.includes('s08-own-note'));
  for (const id of CASE_IDS) assert.equal((await runRuleCheck(id)).ready, true, id);
  for (const bad of ['unknown', ['s06-unregistered'], undefined, '__proto__', 'constructor']) assert.equal(await runRuleCheck(bad), null);
});

test('점검 API: 사례 실행은 200, 모르는 사례와 배열은 400, 쓰기는 405, 요약은 점검 묶음과 같은 숫자', async () => {
  const handler = createChecksApi({ base: BASE });
  const call = (query, method = 'GET') => new Promise(resolve => {
    const headers = {};
    const response = { status(code) { response.code = code; return response; }, setHeader(k, v) { headers[k.toLowerCase()] = v; },
      json(body) { resolve({ code: response.code, body, headers }); } };
    handler({ method, query }, response);
  });
  const ok = await call({ case: 's06-unregistered' });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.ready, true);
  assert.equal(ok.body.decision, 'deny');
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal((await call({ case: 's08-own-note' })).body.decision, 'allow');
  assert.equal((await call({ case: 's09-burst-read' })).body.action, 'propose_revocation');
  assert.equal((await call({ case: 'unknown' })).code, 400);
  assert.equal((await call({ case: ['s06-unregistered'] })).code, 400);
  assert.equal((await call({}, 'POST')).code, 405);
  await withFetch(goodDeployment, async () => {
    const summary = await call({});
    const bundle = await runAttackChecks(BASE);
    const count = value => bundle.filter(item => item.result === value).length;
    assert.equal(summary.code, 200);
    assert.deepEqual([summary.body.total, summary.body.blocked, summary.body.failed, summary.body.notRun],
      [bundle.length, count('blocked'), count('breached'), count('not_run')]);
    assert.ok(!/Bearer|"content"/u.test(JSON.stringify(summary.body)));
  });
});

test('점검 코드: 항목은 정해진 다섯 키만 갖고 최대 20개이며 형식이 올바르다', async () => {
  const attempts = await withFetch(goodDeployment, () => runAttackChecks(BASE + '/'));
  assert.ok(attempts.length >= 16 && attempts.length <= 20, String(attempts.length));
  for (const item of attempts) {
    assert.deepEqual(Object.keys(item).sort(), ['attackId', 'expected', 'observed', 'result', 'stage']);
    assert.match(item.attackId, /^[a-z0-9][a-z0-9_.-]{0,79}$/iu);
    assert.ok(item.observed.length > 0 && item.observed.length <= 300);
    assert.ok(['blocked', 'breached', 'not_run'].includes(item.result));
    assert.ok(Number.isInteger(item.stage) && item.stage >= 1 && item.stage <= 12);
  }
  assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length);
  assert.deepEqual(attempts.map(item => item.stage), [...attempts.map(item => item.stage)].sort((a, b) => a - b));
  for (const id of ['s06-unregistered', 's07-compound', 's08-unknown-route', 's08-all-notes', 's08-write-notice', 's08-own-note', 's09-burst-read']) {
    assert.ok(attempts.some(item => item.attackId === id && item.observed.includes('jsonReady=true')), id);
  }
  // 정상 허용(허용 사례)과 금지 거부(거부 사례)가 모두 실제 응답으로 남는다.
  assert.ok(attempts.some(item => item.attackId === 's11-device' && item.observed === 'HTTP 200'));
  assert.ok(attempts.some(item => item.attackId === 's03-unauth-list' && item.observed === 'HTTP 401'));
});

test('점검 코드: 모든 요청에 증거 표식을 붙이고 헤더·주소에는 넣지 않으며 읽기 요청만 보낸다', async () => {
  const seen = [];
  await withFetch(async (url, options) => { seen.push({ url: String(url), options }); return goodDeployment(url, options); }, () => runAttackChecks(BASE));
  assert.ok(seen.length >= 18);
  for (const { url, options } of seen) {
    assert.equal(options.method, 'GET', url);
    assert.ok(typeof options.alephEvidence?.caseId === 'string' && options.alephEvidence.caseId, url);
    assert.equal(options.alephEvidence.requestKey, 'read');
    assert.ok(!/aleph/iu.test(url) && !/aleph/iu.test(JSON.stringify(options.headers)), url);
    assert.ok(options.signal, '대기 시간 상한이 있다');
  }
});

test('점검 코드: 메모가 새거나 거부하지 않으면 뚫림으로 적고, 본문은 기록하지 않는다', async () => {
  const leaky = async (url, options) => {
    if (new URL(url).pathname === '/api/my/notes') return reply(200, [{ id: 'x', title: '비밀 제목', content: '비밀 내용' }]);
    return goodDeployment(url, options);
  };
  const attempts = await withFetch(leaky, () => runAttackChecks(BASE));
  const breached = attempts.filter(item => item.result === 'breached');
  assert.ok(breached.length >= 3);
  assert.ok(breached.every(item => item.stage === 3 || item.stage === 4));
  assert.ok(!JSON.stringify(attempts).includes('비밀 내용') && !JSON.stringify(attempts).includes('비밀 제목'));
});

test('점검 코드: 요청을 보내지 못하면 오류로 멈추지 않고 미실행으로 남긴다', async () => {
  const attempts = await withFetch(async () => { throw new Error('network'); }, () => runAttackChecks(BASE));
  assert.ok(attempts.every(item => item.result === 'not_run'), JSON.stringify(attempts.filter(i => i.result !== 'not_run')));
});

test('점검 코드: 배포 주소가 잘못되면 알려 주고, 설정 객체와 주소 문자열을 둘 다 받는다', async () => {
  await assert.rejects(() => runAttackChecks({ publicAppUrl: 'http://example.vercel.app' }), /배포 주소/u);
  await assert.rejects(() => runAttackChecks({ publicAppUrl: 'not a url' }), /배포 주소/u);
  const viaConfig = await withFetch(goodDeployment, () => runAttackChecks({ publicAppUrl: BASE }));
  const viaString = await withFetch(goodDeployment, () => runAttackChecks(BASE));
  assert.deepEqual(viaConfig.map(item => item.attackId), viaString.map(item => item.attackId));
});
