import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fakeDb() {
  const rows = new Map();
  const mine = (id, owner) => { const row = rows.get(id); return row && row.owner_id === owner ? row : null; };
  return {
    rows,
    async list(owner) { return [...rows.values()].filter(r => r.owner_id === owner); },
    async insert(row) { if (rows.has(row.id)) return false; rows.set(row.id, { ...row }); return true; },
    async get(id, owner) { return mine(id, owner); },
    async update(id, owner, patch) { const row = mine(id, owner); if (!row) return null; Object.assign(row, patch); return row; },
    async remove(id, owner) { return mine(id, owner) ? rows.delete(id) : false; },
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

test('B는 A의 메모를 읽고 고치고 지울 수 없고, 소유자도 바꿀 수 없다', async () => {
  const db = fakeDb();
  const api = createNotesApi({ verify, db });
  const { body: { id } } = await call(api.collection, { method: 'POST', auth: 'Bearer a', body: { title: 'A글', body: '비밀' } });
  const denied = [
    await call(api.item, { auth: 'Bearer b', query: { id } }),
    await call(api.item, { method: 'PUT', auth: 'Bearer b', query: { id }, body: { title: '탈취', body: 'x' } }),
    await call(api.item, { method: 'DELETE', auth: 'Bearer b', query: { id } }),
  ];
  for (const r of denied) { assert.equal(r.code, 404); assert.ok(!JSON.stringify(r.body).includes('비밀')); }
  assert.deepEqual((await call(api.item, { auth: 'Bearer a', query: { id } })).body, { id, title: 'A글', body: '비밀' });
  assert.equal((await call(api.collection, { auth: 'Bearer b' })).body.length, 0);
  // 본문의 owner_id는 무시한다: 추가·수정 모두 확인된 사용자 ID만 쓴다.
  const forged = await call(api.collection, { method: 'POST', auth: 'Bearer b', body: { title: 'B글', body: '', owner_id: A } });
  assert.equal(db.rows.get(forged.body.id).owner_id, B);
  await call(api.item, { method: 'PUT', auth: 'Bearer a', query: { id }, body: { title: '수정', body: '', owner_id: B } });
  assert.equal(db.rows.get(id).owner_id, A);
  // 주인 없는 행은 아무도 접근할 수 없다.
  db.rows.set('44444444-4444-4444-8444-444444444444', { id: '44444444-4444-4444-8444-444444444444', owner_id: null, title: 'x', content: 'y' });
  assert.equal((await call(api.item, { auth: 'Bearer a', query: { id: '44444444-4444-4444-8444-444444444444' } })).code, 404);
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
