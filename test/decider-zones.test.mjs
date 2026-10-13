import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { RULE_IDS, decide } from '../src/decider.mjs';

const { normal } = fixtureRequests();
const ask = (patch) => decide({ ...normal, requestId: randomUUID(), ...patch });

test('내 메모 한 건·본인 목록 읽기는 등록 기기에서 허용된다', async () => {
  for (const route of ['GET /notes/:id', 'GET /api/notes/:id', 'GET /api/my/notes', 'GET /api/notices']) {
    const out = await ask({ route });
    assert.equal(out.decision, 'allow', route);
  }
});

test('모르는 경로·전체 목록·기능 경로는 거부된다', async () => {
  for (const route of ['GET /__unknown__', 'GET /api/notes', 'GET /api/notes/all', 'GET /api/admin/notes',
    'GET /api/notes/export', 'GET /notes/:id/export', 'GET /api/notes/:id?fn=export', undefined, '']) {
    const out = await ask({ route });
    assert.equal(out.decision, 'deny', String(route));
    assert.equal(out.reasonCode, 'route_not_allowed');
    assert.deepEqual(out.ruleIds, ['route_not_allowed']);
  }
});

test('쓰기는 구역과 관계없이 거부되고, 강사 공지 수정도 막힌다', async () => {
  for (const [method, route] of [['POST', 'POST /api/notices'], ['PUT', 'PUT /api/notices/:id'],
    ['PUT', 'PUT /api/notes/:id'], ['DELETE', 'DELETE /api/notes/:id'], ['PATCH', 'PATCH /api/notes/:id'], ['POST', 'POST /api/notes']]) {
    const out = await ask({ method, route });
    assert.equal(out.decision, 'deny', route);
    assert.equal(out.reasonCode, 'write_not_allowed');
  }
});

test('요청에 끼워 넣은 role·owner·device 값으로 구역이 열리지 않는다', async () => {
  const out = await ask({ route: 'GET /api/admin/notes', role: 'instructor', owner: 'x', device: { approval: 'ok' }, identity: { role: 'instructor' } });
  assert.equal(out.decision, 'deny');
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
});

test('이전 규칙이 유지된다: 미등록 기기 거부, 복합 이상 step_up, 재확인 뒤 allow', async () => {
  assert.equal((await ask({ deviceRegistered: false })).reasonCode, 'device_not_registered');
  assert.equal((await ask({ deviceRegistered: undefined })).decision, 'deny');
  const { suspicious } = fixtureRequests();
  assert.equal((await decide(suspicious)).decision, 'step_up');
  assert.equal((await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
});

test('응답의 규칙 이름은 모두 RULE_IDS 안에 있다', async () => {
  const cases = [{}, { deviceRegistered: false }, { route: 'GET /x' }, { method: 'PUT' }];
  for (const patch of cases) {
    const out = await ask(patch);
    assert.ok(out.ruleIds.every((id) => RULE_IDS.includes(id)));
  }
});
