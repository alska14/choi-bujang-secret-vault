import test from 'node:test';
import assert from 'node:assert/strict';
import { configureJev, decide } from './decide.mjs';

const mk = (description, count, level = 8) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00',
  rule: { level, description, mitre: ['T1110'] },
  data: { srcip: '203.0.113.1', srcuser: 'userX', ...(count === undefined ? {} : { count }) },
});

test('다른 문구·숫자 문자열의 명확한 공격은 block', async () => {
  configureJev(null);
  assert.equal((await decide(mk('로그인 실패 120건이 1분 안에 있었습니다.', '120'))).action, 'block');
  assert.equal((await decide(mk('같은 주소가 서로 다른 계정 25개에 로그인 실패를 넣었습니다.', '25'))).action, 'block');
  assert.equal((await decide(mk('같은 비밀번호를 여러 계정에 넣었습니다.'))).action, 'block');
});

test('정상 이벤트는 record, Jev 를 부르지 않음', async () => {
  let called = 0;
  configureJev(async () => { called += 1; return 1; });
  for (const d of ['로그인이 성공했습니다.', '로그아웃했습니다.', '로그인 실패 1건 뒤에 성공했습니다.']) {
    assert.equal((await decide(mk(d, d.includes('실패') ? '1' : undefined, 3))).action, 'record');
  }
  assert.equal(called, 0);
});

test('필드가 빠진 경보도 오류 없이 record', async () => {
  configureJev(null);
  assert.equal((await decide({ id: 'x' })).action, 'record');
  assert.equal((await decide({ id: 'x', rule: {}, data: {} })).action, 'record');
});

test('애매한 경보: Jev 없음/오류는 alert, 낮으면 record, 높으면 block', async () => {
  const amb = mk('10분 동안 한 계정의 로그인 실패가 5건입니다.', '5', 6);
  configureJev(null);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => { throw new Error('down'); });
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 'abc');
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.1);
  assert.equal((await decide(amb)).action, 'record');
  configureJev(async () => 0.7);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.95);
  assert.equal((await decide(amb)).action, 'block');
});

test('명확한 공격은 Jev 가 낮게 답해도 block 유지', async () => {
  configureJev(async () => 0);
  assert.equal((await decide(mk('로그인 실패 90건이 있고 성공은 없습니다.', '90', 12))).action, 'block');
});
