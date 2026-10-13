import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { detect } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1);
const reads = (count, { sub = 'learner_fixture', every = 2, start = START, method = 'GET', extra = {} } = {}) =>
  Array.from({ length: count }, (_, i) => ({ at: new Date(start + i * every * 1000).toISOString(), method, identity: { sub }, ...extra }));
const burst = { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' };

test('120건은 관찰, 121건부터 회수 제안', () => {
  assert.deepEqual(detect(reads(120)), { action: 'observe' });
  assert.deepEqual(detect(reads(121)), burst);
});

test('10분 창 경계: 창 안의 121건만 제안, 창 밖으로 벌어지면 관찰', () => {
  assert.deepEqual(detect(reads(121, { every: 4.9 })), burst); // 121건이 약 588초 안
  assert.deepEqual(detect(reads(121, { every: 5 })), { action: 'observe' }); // 첫 건과 121번째가 600초 차이
  assert.deepEqual(detect(reads(200, { every: 7 })), { action: 'observe' });
});

test('정렬되지 않은 사건과 사용자 섞임에도 사용자별로 센다', () => {
  const mixed = [...reads(100), ...reads(100, { sub: 'other_fixture' })].sort(() => 0.5 - Math.random());
  assert.deepEqual(detect(mixed), { action: 'observe' });
  const shuffled = reads(150).reverse();
  assert.deepEqual(detect(shuffled), burst);
  const two = [...reads(100, { sub: 'quiet' }), ...reads(130, { sub: 'burst_user' })];
  assert.deepEqual(detect(two), { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'burst_user' });
});

test('GET 이 아니거나 형식이 틀린 사건은 세지 않고 오류도 내지 않는다', () => {
  assert.deepEqual(detect(reads(200, { method: 'POST' })), { action: 'observe' });
  assert.deepEqual(detect(reads(121, { method: 'get' })), burst);
  const junk = [null, undefined, 1, 'x', {}, { at: 'bad', method: 'GET', identity: { sub: 'a' } }, { at: START, method: 'GET', identity: {} }, { at: START, method: 'GET' }];
  assert.deepEqual(detect([...junk, ...reads(30)]), { action: 'observe' });
  assert.deepEqual(detect([]), { action: 'observe' });
  assert.throws(() => detect(null), TypeError);
  assert.throws(() => detect('events'), TypeError);
});

test('결과는 계약의 세 값만 담고, 사건의 다른 값(토큰·내용·실명)은 출력하지 않는다', () => {
  const out = detect(reads(130, { extra: { token: 'SECRET_TOKEN_VALUE', body: '메모 본문', realName: '홍길동', deviceId: 'dev1' } }));
  assert.deepEqual(Object.keys(out).sort(), ['action', 'reasonCode', 'subject']);
  assert.ok(!JSON.stringify(out).includes('SECRET_TOKEN_VALUE') && !JSON.stringify(out).includes('메모 본문') && !JSON.stringify(out).includes('홍길동'));
});

test('입력 사건을 바꾸지 않는다', () => {
  const events = reads(130);
  const copy = JSON.stringify(events);
  detect(events);
  assert.equal(JSON.stringify(events), copy);
});

test('detect.mjs 파일 하나만 있어도 동작한다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'detect-iso-'));
  try {
    await cp(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'detect.mjs'), join(dir, 'detect.mjs'));
    const iso = await import(pathToFileURL(join(dir, 'detect.mjs')).href);
    assert.deepEqual(iso.detect(reads(121)), burst);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
