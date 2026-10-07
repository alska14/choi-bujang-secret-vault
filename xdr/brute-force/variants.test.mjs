import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PATTERNS, configureJev, decide } from './decide.mjs';

const here = dirname(fileURLToPath(import.meta.url));

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

test('애매한 경보: Jev 없음/오류/낮은 값은 alert 유지, 높으면 block', async () => {
  const amb = mk('10분 동안 한 계정의 로그인 실패가 5건입니다.', '5', 6);
  configureJev(null);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => { throw new Error('down'); });
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 'abc');
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.1);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.7);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.95);
  assert.equal((await decide(amb)).action, 'block');
});

test('명확한 공격은 Jev 가 낮게 답해도 block 유지', async () => {
  configureJev(async () => 0);
  assert.equal((await decide(mk('로그인 실패 90건이 있고 성공은 없습니다.', '90', 12))).action, 'block');
});

test('문구·건수가 달라도 위험도 10 이상 로그인 실패 경보는 block', async () => {
  configureJev(null);
  assert.equal((await decide(mk('비밀번호 대입 시도가 감지되었습니다. 실패 12건.', '12', 12))).action, 'block');
  assert.equal((await decide(mk('로그인 실패가 빠르게 반복되고 있습니다.', undefined, '10'))).action, 'block');
  assert.equal((await decide(mk('계정 6개에 로그인 실패가 이어졌습니다.', '6', 8))).action, 'block');
});

test('위험도가 낮은 정상·애매 경보는 block 되지 않음', async () => {
  configureJev(null);
  assert.notEqual((await decide(mk('로그인 실패 5건 뒤 성공했습니다.', '5', 7))).action, 'block');
  assert.equal((await decide(mk('로그인이 성공했습니다.', undefined, 3))).action, 'record');
});

test('설명문 필드 이름이 다르거나 건수가 문장에만 있어도 읽는다', async () => {
  configureJev(null);
  const alt = { id: 'a', time: '2026-10-01T00:00:00Z', level: 12, full_log: 'sshd: Failed password 로그인 실패 80회', data: { srcip: '203.0.113.9' } };
  assert.equal((await decide(alt)).action, 'block');
  assert.equal((await decide({ id: 'b', rule: { level: 11, description: '로그인 시도가 폭주합니다. 비밀번호 실패.' }, data: {} })).action, 'block');
  assert.equal((await decide({ id: 'c', rule: { level: 12, description: '알 수 없는 문구' }, data: {} })).action, 'block');
  assert.equal((await decide({ id: 'd', rule: { level: 6, description: '알 수 없는 문구' }, data: {} })).action, 'alert');
});

test('patterns.json 과 decide.mjs 의 패턴 정의가 같다', async () => {
  const file = JSON.parse(await readFile(join(here, 'patterns.json'), 'utf8'));
  assert.deepEqual(file.patterns, PATTERNS);
});

test('decide.mjs 파일 하나만 있어도 동작한다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-iso-'));
  try {
    await cp(join(here, 'decide.mjs'), join(dir, 'decide.mjs'));
    const iso = await import(pathToFileURL(join(dir, 'decide.mjs')).href);
    iso.configureJev(null);
    const fixture = JSON.parse(await readFile(join(here, '..', 'fixtures', 'brute-force.json'), 'utf8'));
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) counts[(await iso.decide(alert)).action] += 1;
    assert.deepEqual(counts, { block: 10, alert: 9, record: 9 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
