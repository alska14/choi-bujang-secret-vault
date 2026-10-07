import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PATTERNS, configureJev, decide } from './decide.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mk = (description, count, level) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00',
  rule: { level, description, mitre: ['T1190'] },
  data: { srcip: '203.0.113.1', url: '/x', ...(count === undefined ? {} : { count }) },
});

test('다른 문구의 반복 주입은 block', async () => {
  configureJev(null);
  assert.equal((await decide(mk('SQL 구문이 한 주소에서 30번 들어왔습니다.', '30', 9))).action, 'block');
  assert.equal((await decide(mk('스크립트 삽입 표기가 7번 반복됐습니다.', '7', 9))).action, 'block');
  assert.equal((await decide(mk('경로 이탈 표기가 6번 반복됐습니다.', 6, 9))).action, 'block');
  assert.equal((await decide(mk('알 수 없는 문구', undefined, 12))).action, 'block');
});

test('수업 단어 1건·반복 없는 표기는 alert, 정상은 record', async () => {
  configureJev(null);
  assert.equal((await decide(mk('SQL 이라는 수업 공지 제목을 한 번 조회했습니다.', '1', 7))).action, 'alert');
  assert.equal((await decide(mk('주입처럼 보이는 표기가 1건 있고 반복되지 않았습니다.', '1', 8))).action, 'alert');
  assert.equal((await decide(mk('자료 목록을 조회했습니다.', undefined, 3))).action, 'record');
  assert.equal((await decide({ id: 'x' })).action, 'record');
});

test('Jev 는 올리기만 한다: 오류·낮은 값은 alert 유지, 높으면 block', async () => {
  const amb = mk('이름 검색에 구분 문자가 1건 있습니다.', '1', 6);
  configureJev(async () => { throw new Error('down'); });
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.1);
  assert.equal((await decide(amb)).action, 'alert');
  configureJev(async () => 0.95);
  assert.equal((await decide(amb)).action, 'block');
  configureJev(null);
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
    const fixture = JSON.parse(await readFile(join(here, '..', 'fixtures', 'web-injection.json'), 'utf8'));
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) counts[(await iso.decide(alert)).action] += 1;
    assert.deepEqual(counts, { block: 8, alert: 9, record: 9 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
