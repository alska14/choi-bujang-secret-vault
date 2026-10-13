import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRestoreApi, loadBackupFromEnv, noteHash, sealNote } from '../src/restore-api.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOTE_B = '33333333-3333-4333-8333-333333333333';
const NOTE_B2 = '44444444-4444-4444-8444-444444444444';
const NOTE_A = '55555555-5555-4555-8555-555555555555';
const verify = async auth => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } }[auth] ?? null);

function fakeDb(initial = []) {
  const rows = new Map(initial.map(r => [r.id, { ...r }]));
  const mine = (id, owner) => { const r = rows.get(id); return r && r.owner_id === owner ? r : null; };
  return {
    rows,
    async get(id, owner) { return mine(id, owner); },
    async insert(row) { if (rows.has(row.id)) return false; rows.set(row.id, { ...row }); return true; },
    async update(id, owner, patch) { const r = mine(id, owner); if (!r) return null; Object.assign(r, patch); return r; },
  };
}
function call(handler, { method = 'POST', auth, noteId } = {}) {
  return new Promise(resolve => {
    const headers = {};
    const response = {
      status(code) { response.code = code; return response; },
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      json(body) { resolve({ code: response.code, body, headers }); },
    };
    handler({ method, headers: { authorization: auth }, query: { noteId } }, response);
  });
}
const original = { id: NOTE_B, owner_id: B, title: 'B의 메모', content: 'B 원본 내용' };
const backup = [
  sealNote(original),
  sealNote({ id: NOTE_B2, owner_id: B, title: '둘째', content: '둘째 내용' }),
  sealNote({ id: NOTE_A, owner_id: A, title: 'A글', content: 'A 내용' }),
];
const api = db => createRestoreApi({ verify, db, loadBackup: async () => backup });

test('변조된 B의 메모를 한 건만 사본으로 되돌리고 해시가 사본과 같다', async () => {
  const db = fakeDb([{ ...original, content: '변조된 내용' }, { id: NOTE_B2, owner_id: B, title: '둘째', content: '바뀐 둘째' }]);
  const out = await call(api(db), { auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(out.code, 200);
  assert.deepEqual(out.body, { id: NOTE_B, restored: true, sha256: backup[0].sha256 });
  assert.equal(noteHash(db.rows.get(NOTE_B)), backup[0].sha256);
  assert.equal(db.rows.get(NOTE_B2).content, '바뀐 둘째'); // 다른 메모는 그대로
  assert.ok(!JSON.stringify(out.body).includes('B 원본 내용')); // 내용은 응답에 없다
});

test('삭제된 B의 메모는 다시 만들어진다', async () => {
  const db = fakeDb([]);
  const out = await call(api(db), { auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(out.code, 200);
  assert.equal(out.body.restored, true);
  assert.equal(noteHash(db.rows.get(NOTE_B)), backup[0].sha256);
  assert.equal(db.rows.size, 1);
});

test('이미 사본과 같으면 바꾸지 않는다', async () => {
  const db = fakeDb([original]);
  const out = await call(api(db), { auth: 'Bearer b', noteId: NOTE_B });
  assert.deepEqual(out.body, { id: NOTE_B, restored: false, sha256: backup[0].sha256 });
});

test('로그인 없음 401, POST 아님 405, 잘못된 ID 400', async () => {
  const db = fakeDb([]);
  assert.equal((await call(api(db), { noteId: NOTE_B })).code, 401);
  assert.equal((await call(api(db), { auth: 'Bearer wrong', noteId: NOTE_B })).code, 401);
  const get = await call(api(db), { method: 'GET', auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(get.code, 405);
  assert.equal(get.headers.allow, 'POST');
  assert.equal((await call(api(db), { auth: 'Bearer b', noteId: 'not-a-uuid' })).code, 400);
  assert.equal((await call(api(db), { auth: 'Bearer b' })).code, 400);
  assert.equal(db.rows.size, 0);
});

test('남의 메모나 사본에 없는 메모는 404이고 아무것도 바꾸지 않는다', async () => {
  const db = fakeDb([{ id: NOTE_A, owner_id: A, title: 'A글', content: '변조' }]);
  const asB = await call(api(db), { auth: 'Bearer b', noteId: NOTE_A }); // B가 A의 메모 복원 시도
  assert.equal(asB.code, 404);
  assert.equal(db.rows.get(NOTE_A).content, '변조');
  const missing = await call(api(db), { auth: 'Bearer b', noteId: '66666666-6666-4666-8666-666666666666' });
  assert.equal(missing.code, 404);
  assert.equal(db.rows.size, 1);
});

test('사본이 없거나 검증에 실패하면 복원하지 않고 멈춘다', async () => {
  const db = fakeDb([{ ...original, content: '변조된 내용' }]);
  const none = createRestoreApi({ verify, db, loadBackup: async () => null });
  assert.equal((await call(none, { auth: 'Bearer b', noteId: NOTE_B })).code, 503);
  const forged = [{ ...backup[0], content: '사본이 조작됨' }]; // 해시와 내용이 맞지 않는 사본
  const bad = createRestoreApi({ verify, db, loadBackup: async () => forged });
  const out = await call(bad, { auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(out.code, 409);
  assert.equal(out.body.error, 'BACKUP_INVALID');
  assert.equal(db.rows.get(NOTE_B).content, '변조된 내용');
});

test('복원 결과가 사본과 다르면 실패로 기록하고 다시 시도하지 않는다', async () => {
  const db = fakeDb([{ ...original, content: '변조된 내용' }]);
  let writes = 0;
  const flaky = { ...db, async update(id, owner, patch) { writes += 1; return db.update(id, owner, { ...patch, content: '엉뚱한 값' }); } };
  const out = await call(api(flaky), { auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(out.code, 500);
  assert.equal(out.body.error, 'RESTORE_MISMATCH');
  assert.equal(writes, 1);
});

test('다른 소유자가 같은 ID를 쓰고 있으면 덮어쓰지 않는다', async () => {
  const db = fakeDb([{ id: NOTE_B, owner_id: A, title: '남의 것', content: 'A 소유' }]);
  const out = await call(api(db), { auth: 'Bearer b', noteId: NOTE_B });
  assert.equal(out.code, 409);
  assert.equal(db.rows.get(NOTE_B).owner_id, A);
});

test('사본은 환경변수에서만 읽고 형식이 틀리면 없음으로 본다', () => {
  assert.equal(loadBackupFromEnv({}), null);
  assert.equal(loadBackupFromEnv({ NOTES_BACKUP_JSON: 'not json' }), null);
  assert.equal(loadBackupFromEnv({ NOTES_BACKUP_JSON: '{"a":1}' }), null);
  assert.deepEqual(loadBackupFromEnv({ NOTES_BACKUP_JSON: JSON.stringify(backup) }), backup);
});
