import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runXdr } from '../../scripts/xdr-run.mjs';
import { decide } from './decide.mjs';
import { readAlerts, summarize } from './read-alerts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'persistence.json');
const TEMP_EXE = 'C:\\Users\\user01\\AppData\\Local\\Temp\\helper.exe';
const STARTUP_EXE = 'C:\\Users\\user02\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\note-helper.exe';

const mk = (description, level, data = {}) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre: ['T1543'] }, data: { srcip: '203.0.113.1', srcuser: 'user01', ...data },
});

test('decide.mjs 파일 하나만 있어도 경보 묶음이 8/8/8 로 나뉜다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-ps-'));
  try {
    await cp(join(here, 'decide.mjs'), join(dir, 'decide.mjs'));
    const iso = await import(pathToFileURL(join(dir, 'decide.mjs')).href);
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) counts[(await iso.decide(alert)).action] += 1;
    assert.deepEqual(counts, { block: 8, alert: 8, record: 8 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('decide.mjs 는 다른 파일·패키지를 불러오지 않고 파일·네트워크·프로세스를 쓰지 않는다', async () => {
  const source = await readFile(join(here, 'decide.mjs'), 'utf8');
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/^\s*import\s/mu.test(code), 'import 문 없음');
  assert.ok(!/\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(|\bprocess\b|\beval\s*\(|new Function|node:|readFile|writeFile|XMLHttpRequest|WebSocket/u.test(code));
  const mod = await import('./decide.mjs');
  assert.deepEqual(Object.keys(mod), ['decide']);
});

test('PATTERNS 상수는 patterns.json 과 같고, 패턴마다 이름·조건·근거 한 줄이 있다', async () => {
  const source = await readFile(join(here, 'decide.mjs'), 'utf8');
  const literal = source.slice(source.indexOf('const PATTERNS = ') + 'const PATTERNS = '.length, source.indexOf('];\n') + 1);
  const file = JSON.parse(await readFile(join(here, 'patterns.json'), 'utf8'));
  assert.deepEqual(JSON.parse(literal), file.patterns);
  assert.deepEqual(file.technique, ['T1543', 'T1053']);
  for (const pattern of file.patterns) {
    assert.ok(pattern.name && pattern.when && typeof pattern.evidence === 'string' && pattern.evidence.length > 10 && !pattern.evidence.includes('\n'), pattern.id);
    assert.ok(pattern.confidence >= 0 && pattern.confidence <= 1, pattern.id);
  }
});

test('서명 없는 서비스·낯선 예약 작업·시작 폴더 추가는 위험도가 낮아도 block 이다', () => {
  assert.equal(decide(mk('서명 없는 새 서비스가 등록됐습니다.', 4)).action, 'block');
  assert.equal(decide(mk('서비스 실행 파일이 바뀌었고 서명이 없습니다.', 4)).action, 'block');
  assert.equal(decide(mk('처음 보는 예약 작업이 만들어졌습니다.', 4)).action, 'block');
  assert.equal(decide(mk('시작 폴더에 평소 목록에 없는 프로그램이 추가됐습니다.', 4, { path: STARTUP_EXE })).action, 'block');
  assert.equal(decide(mk('평소 목록에 없는 서비스가 다시 켜도 남도록 등록됐습니다.', 4)).action, 'block');
  assert.equal(decide(mk('알 수 없는 문구', 12)).action, 'block');
  assert.equal(decide(mk('알 수 없는 문구', 10, { path: TEMP_EXE })).action, 'block');
});

test('서명을 아직 확인하지 못한 것이나 임시 폴더 파일만 있으면 alert 이고, 서명된 정상 서비스는 record 이다', () => {
  assert.equal(decide(mk('수업 중 예약 작업을 만들었습니다. 서명은 확인되지 않았습니다.', 6, { path: 'C:\\lab\\class-backup.cmd' })).action, 'alert');
  assert.equal(decide(mk('임시 폴더에 실행 파일이 하나 생겼습니다.', 8, { path: TEMP_EXE })).action, 'alert');
  assert.equal(decide(mk('파일이 생겼습니다.', 3, { path: '/tmp/helper.sh' })).action, 'alert');
  assert.equal(decide(mk('파일이 생겼습니다.', 3, { path: 'C:\\Users\\a\\AppData\\Local\\Temporary Internet Files\\x' })).action, 'record');
  for (const level of [1, 2, 3, 4]) {
    const out = decide(mk('기존 수업 도구 서비스가 서명된 채로 실행 중입니다.', level, { path: 'C:\\lab\\class-tool\\signed-service.exe' }));
    assert.equal(out.action, 'record');
    assert.ok(out.confidence < 0.5);
  }
  assert.equal(decide(mk('운영체제 업데이트 예약이 평소 시각에 그대로입니다.', 2)).action, 'record');
});

test('필드가 빠지거나 모양이 틀린 경보도 오류 없이 record 이다', () => {
  for (const bad of [undefined, null, 'x', 5, [], {}, { rule: null, data: 5 }, { rule: { level: 'abc' }, data: null }, { data: { a: { b: { c: { d: TEMP_EXE } } } } }]) {
    assert.equal(decide(bad).action, 'record', JSON.stringify(bad));
  }
});

test('반환은 action·confidence·reason 세 값만이고, 이유에는 경로를 담지 않는다', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const alert of fixture.alerts) {
    const out = decide(alert);
    assert.deepEqual(Object.keys(out).sort(), ['action', 'confidence', 'reason']);
    assert.ok(['block', 'alert', 'record'].includes(out.action));
    assert.ok(out.confidence >= 0 && out.confidence <= 1);
    assert.ok(typeof out.reason === 'string' && out.reason.length > 0 && !out.reason.includes('\n'));
    assert.ok(!/AppData|Temp\\|C:|\.exe|\.cmd/u.test(out.reason));
    assert.equal(decide(alert).action, out.action);
  }
});

test('입력 경보를 바꾸지 않는다', () => {
  const alert = mk('서명 없는 새 서비스가 등록됐습니다.', 12, { path: TEMP_EXE });
  const copy = JSON.stringify(alert);
  decide(alert);
  assert.equal(JSON.stringify(alert), copy);
});

test('읽기 모듈은 24건에서 24줄을 뽑고 파일 경로는 뽑지 않는다', async () => {
  const rows = await readAlerts();
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'description', 'id', 'level', 'mitre', 'srcip', 'time', 'user']);
  assert.ok(!/AppData|\\Temp\\|\.exe/u.test(JSON.stringify(rows)));
  assert.ok(!JSON.stringify(summarize(mk('x', 5, { path: TEMP_EXE }))).includes('AppData'));
  assert.equal(summarize(null).level, 0);
  const source = await readFile(join(here, 'read-alerts.mjs'), 'utf8');
  assert.ok(!/from '\.\/decide\.mjs'/u.test(source), '읽기 모듈은 판정 모듈을 부르지 않는다');
});

test('실행기가 결과 파일을 만들고 건수가 나온다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-run-ps-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await mkdir(join(dir, 'xdr', 'persistence'), { recursive: true });
    await cp(fixturePath, join(dir, 'xdr', 'fixtures', 'persistence.json'));
    await cp(join(here, 'decide.mjs'), join(dir, 'xdr', 'persistence', 'decide.mjs'));
    const errors = [];
    const result = await runXdr({ root: dir, moduleKey: 'persistence', writeError: (line) => errors.push(line) });
    assert.deepEqual(result.counts, { block: 8, alert: 8, record: 8 });
    assert.deepEqual(errors, []);
    const written = JSON.parse(await readFile(join(dir, 'xdr', 'persistence', 'result.json'), 'utf8'));
    assert.equal(written.schema, 'aleph.xdr.result.v1');
    assert.equal(written.decisions.length, 24);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
