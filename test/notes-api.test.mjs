import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fakeDb() {
  const rows = new Map();
  return {
    async list(owner) { return [...rows.values()].filter(r => r.owner_id === owner); },
    async insert(row) { if (rows.has(row.id)) return false; rows.set(row.id, { ...row }); return true; },
    async get(id) { return rows.get(id) ?? null; },
    async update(id, patch) { if (!rows.has(id)) return null; Object.assign(rows.get(id), patch); return rows.get(id); },
    async remove(id) { return rows.delete(id); },
  };
}
const verify = async auth => ({ 'Bearer a': { kind: 'student', userId: A }, 'Bearer b': { kind: 'student', userId: B } }[auth] ?? null);
function call(handler, { method = 'GET', auth, query, body } = {}) {
  return new Promise(resolve => {
    const headers = {};
    const response = { status(code) { response.code = code; return response; },
      setHeader(key, value) { headers[key.toLowerCase()] = value; },
      json(payload) { resolve({ code: response.code, body: payload, headers }); },
      end() { resolve({ code: response.code, body: undefined, headers }); } };
    handler({ method, headers: { authorization: auth }, query, body }, response);
  });
}

test('로그인 없이 또는 잘못된 토큰이면 401과 JSON 오류, 자료는 없음', async () => {
  const api = createNotesApi({ verify, db: fakeDb() });
  for (const auth of [undefined, 'Bearer nope']) {
    const r = await call(api.collection, { auth });
    assert.equal(r.code, 401);
    assert.equal(typeof r.body.error, 'string');
    assert.ok(!Array.isArray(r.body));
    assert.equal(r.headers['cache-control'], 'no-store');
  }
  const post = await call(api.collection, { method: 'POST', body: { title: 't', body: 'b' } });
  assert.equal(post.code, 401);
  const one = await call(api.item, { query: { id: A } });
  assert.equal(one.code, 401);
});

test('A가 추가·조회·수정·삭제하고 삭제 뒤 GET은 404', async () => {
  const api = createNotesApi({ verify, db: fakeDb() });
  const created = await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { title: '제목', body: '내용' } });
  assert.equal(created.code, 201);
  assert.match(created.body.id, /^[0-9a-f-]{36}$/u);
  const givenId = '33333333-3333-4333-8333-333333333333';
  const own = await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { id: givenId, title: 'x', body: '' } });
  assert.deepEqual(own.body, { id: givenId });
  assert.equal((await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { id: givenId, title: 'x', body: '' } })).code, 409);
  const list = await call(api.collection, { auth: 'Bearer a' });
  assert.equal(list.body.length, 2);
  assert.deepEqual(Object.keys(list.body[0]).sort(), ['body', 'id', 'title']);
  assert.equal((await call(api.collection, { auth: 'Bearer b' })).body.length, 0);
  const id = created.body.id;
  assert.deepEqual((await call(api.item, { auth: 'Bearer a', query: { id } })).body, { id, title: '제목', body: '내용' });
  const put = await call(api.item, { method: 'PUT', auth: 'Bearer a', query: { id }, body: { title: '새', body: '글' } });
  assert.deepEqual(put.body, { id, title: '새', body: '글' });
  assert.equal((await call(api.item, { method: 'DELETE', auth: 'Bearer a', query: { id } })).code, 204);
  assert.equal((await call(api.item, { auth: 'Bearer a', query: { id } })).code, 404);
});

test('잘못된 id·본문은 400, 허용 안 된 방법은 405', async () => {
  const api = createNotesApi({ verify, db: fakeDb() });
  assert.equal((await call(api.item, { auth: 'Bearer a', query: { id: 'not-a-uuid' } })).code, 400);
  assert.equal((await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { title: '', body: 'x' } })).code, 400);
  assert.equal((await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { id: 'x', title: 't', body: '' } })).code, 400);
  assert.equal((await call(api.collection, { method: 'PATCH', auth: 'Bearer a' })).code, 405);
});

test('실제 aleph.config.json이 틀의 로그인 검사 설정으로 받아들여진다', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const verifier = createLoginVerifier({ config, supabaseClient: { auth: { getClaims: async () => ({ error: true }) } },
    judgeKeySet: async () => { throw new Error('unused'); } });
  assert.equal(await verifier(undefined), null);
  assert.equal(await verifier('Bearer a.b.c'), null);
  assert.ok(config.allowedRoutes.length >= 5);
});
