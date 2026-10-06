import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthApi } from '../src/auth-api.mjs';

const user = { email: 'a@test.example', id: 'secret-user-id', app_metadata: { x: 1 } };
const session = { access_token: 'at', refresh_token: 'rt', expires_at: 2000000000, token_type: 'bearer', user };
function call(handler, { method = 'POST', body } = {}) {
  return new Promise(resolve => {
    const response = { headers: {}, status(code) { response.code = code; return response; },
      setHeader(key, value) { response.headers[key.toLowerCase()] = value; },
      json(payload) { resolve({ code: response.code, body: payload, headers: response.headers }); } };
    handler({ method, body }, response);
  });
}
function makeApi(overrides = {}) {
  const revoked = [];
  const auth = {
    signInWithPassword: async ({ password }) => password === 'good-pass'
      ? { data: { session }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } },
    signUp: async () => ({ data: { session: null }, error: null }),
    refreshSession: async ({ refresh_token }) => refresh_token === 'rt'
      ? { data: { session }, error: null } : { data: {}, error: { message: 'bad' } },
    ...overrides,
  };
  return { handler: createAuthApi({ auth, revoke: async token => { revoked.push(token); } }), revoked };
}

test('로그인 성공은 토큰 네 가지만 돌려주고 사용자 원본은 숨긴다', async () => {
  const { handler } = makeApi();
  const r = await call(handler, { body: { action: 'login', email: ' a@test.example ', password: 'good-pass' } });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, { session: { access_token: 'at', refresh_token: 'rt', expires_at: 2000000000, email: 'a@test.example' } });
  assert.ok(!JSON.stringify(r.body).includes('secret-user-id'));
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('틀린 비밀번호·잘못된 요청은 거부한다', async () => {
  const { handler } = makeApi();
  assert.equal((await call(handler, { body: { action: 'login', email: 'a@test.example', password: 'nope' } })).code, 400);
  assert.equal((await call(handler, { body: { action: 'login', email: '', password: 'x' } })).code, 400);
  assert.equal((await call(handler, { body: { action: 'login', email: 'a@b.c', password: 'x'.repeat(200) } })).code, 400);
  assert.equal((await call(handler, { body: { action: 'unknown' } })).code, 400);
  assert.equal((await call(handler, { body: null })).code, 400);
  assert.equal((await call(handler, { method: 'GET' })).code, 405);
});

test('가입은 세션이 없으면 대기 상태, 갱신은 성공과 실패를 구분한다', async () => {
  const { handler } = makeApi();
  assert.deepEqual((await call(handler, { body: { action: 'signup', email: 'a@test.example', password: 'good-pass' } })).body, { pending: true });
  assert.equal((await call(handler, { body: { action: 'refresh', refresh_token: 'rt' } })).code, 200);
  assert.equal((await call(handler, { body: { action: 'refresh', refresh_token: 'bad' } })).code, 401);
});

test('로그아웃은 서버에서 세션을 폐기하고, 폐기 실패에도 성공으로 응답한다', async () => {
  const { handler, revoked } = makeApi();
  assert.equal((await call(handler, { body: { action: 'logout', access_token: 'at' } })).code, 200);
  assert.deepEqual(revoked, ['at']);
  const failing = createAuthApi({ auth: {}, revoke: async () => { throw new Error('x'); } });
  assert.equal((await call(failing, { body: { action: 'logout', access_token: 'at' } })).code, 200);
});

test('내부 오류는 세부 내용 없이 500', async () => {
  const { handler } = makeApi({ signInWithPassword: async () => { throw new Error('secret detail'); } });
  const r = await call(handler, { body: { action: 'login', email: 'a@test.example', password: 'good-pass' } });
  assert.equal(r.code, 500);
  assert.ok(!JSON.stringify(r.body).includes('secret detail'));
});
