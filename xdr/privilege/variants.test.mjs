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
const fixturePath = join(here, '..', 'fixtures', 'privilege.json');

const mk = (description, level, data = {}) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre: ['T1078'] }, data: { srcip: '203.0.113.1', srcuser: 'user01', ...data },
});

test('decide.mjs 파일 하나만 있어도 경보 묶음이 9/8/9 로 나뉜다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-pv-'));
  try {
    await cp(join(here, 'decide.mjs'), join(dir, 'decide.mjs'));
    const iso = await import(pathToFileURL(join(dir, 'decide.mjs')).href);
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) counts[(await iso.decide(alert)).action] += 1;
    assert.deepEqual(counts, { block: 9, alert: 8, record: 9 });
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
  assert.deepEqual(file.technique, ['T1068', 'T1078']);
  for (const pattern of file.patterns) {
    assert.ok(pattern.name && pattern.when && typeof pattern.evidence === 'string' && pattern.evidence.length > 10 && !pattern.evidence.includes('\n'), pattern.id);
    assert.ok(pattern.confidence >= 0 && pattern.confidence <= 1, pattern.id);
  }
});

test('관리자 그룹 추가·방금 관리자가 된 계정·업무 시간 밖·다른 계정 권한은 위험도가 낮아도 block 이다', () => {
  assert.equal(decide(mk('평범한 계정이 관리자 그룹에 추가됐습니다.', 4, { group: 'administrators' })).action, 'block');
  assert.equal(decide(mk('방금 관리자가 된 계정이 관리자 명령을 실행했습니다.', 4)).action, 'block');
  assert.equal(decide(mk('수업 시간 밖에 관리자 명령을 실행했습니다.', 4)).action, 'block');
  assert.equal(decide(mk('user07 이 다른 계정의 권한으로 관리자 명령을 실행했습니다.', 4)).action, 'block');
  assert.equal(decide(mk('처음 보는 주소에서 관리자 명령을 실행했습니다.', 4)).action, 'block');
  assert.equal(decide(mk('알 수 없는 문구', 12)).action, 'block');
  assert.equal(decide(mk('알 수 없는 문구', 10, { group: 'project' })).action, 'block');
  // 신호가 둘 이상 겹치면 확신도가 조금 올라간다.
  const both = decide(mk('수업 시간 밖에 처음 보는 주소에서 관리자 명령을 실행했습니다.', 4));
  assert.ok(both.confidence > 0.93 && both.confidence <= 0.99);
});

test('"관리자 그룹은 아닙니다" 같은 부정 문장, 관리자 명령 한 번, 그룹 필드만 있는 경우는 alert 이다', () => {
  assert.equal(decide(mk('user02 가 과제 그룹에 추가됐습니다. 관리자 그룹은 아닙니다.', 7, { group: 'project-week3' })).action, 'alert');
  assert.equal(decide(mk('평소 주소에서 관리자 명령이 한 번 실행됐습니다.', 5)).action, 'alert');
  assert.equal(decide(mk('관리자 명령이 실패 1건으로 끝났습니다.', 7)).action, 'alert');
  assert.equal(decide(mk('그룹 정보를 확인했습니다.', 3, { group: 'Administrators' })).action, 'alert');
  assert.equal(decide(mk('새 로컬 그룹이 하나 만들어졌습니다.', 6, { group: 'lab-notes' })).action, 'alert');
});

test('정상 이벤트는 record 이고 확신도가 0.5 보다 낮다', () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const out = decide(mk('수업용 관리 계정 admin01 이 평소 주소에서 로그인했습니다.', level, { srcuser: 'admin01' }));
    assert.equal(out.action, 'record');
    assert.ok(out.confidence < 0.5);
  }
  assert.equal(decide(mk('그룹 소속을 읽기만 했습니다.', 3)).action, 'record');
  assert.equal(decide(mk('비밀번호를 변경했습니다.', 2)).action, 'record');
  assert.equal(decide(mk('자료실을 열었습니다.', 3, { group: 'class-readers' })).action, 'record');
});

test('필드가 빠지거나 모양이 틀린 경보도 오류 없이 record 이다', () => {
  for (const bad of [undefined, null, 'x', 5, [], {}, { rule: null, data: 5 }, { rule: { level: 'abc' }, data: null }, { data: { a: { b: { c: { group: 'administrators' } } } } }]) {
    assert.equal(decide(bad).action, 'record', JSON.stringify(bad));
  }
});

test('반환은 action·confidence·reason 세 값만이고, 이유에는 계정·그룹 이름을 담지 않는다', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const alert of fixture.alerts) {
    const out = decide(alert);
    assert.deepEqual(Object.keys(out).sort(), ['action', 'confidence', 'reason']);
    assert.ok(['block', 'alert', 'record'].includes(out.action));
    assert.ok(out.confidence >= 0 && out.confidence <= 1);
    assert.ok(typeof out.reason === 'string' && out.reason.length > 0 && !out.reason.includes('\n'));
    assert.ok(!/user\d|admin01|svc-lab|administrators|203\.0\.113|198\.51\.100|192\.0\.2/u.test(out.reason));
    assert.equal(decide(alert).action, out.action);
  }
});

test('입력 경보를 바꾸지 않는다', () => {
  const alert = mk('평범한 계정이 관리자 그룹에 추가됐습니다.', 12, { group: 'administrators' });
  const copy = JSON.stringify(alert);
  decide(alert);
  assert.equal(JSON.stringify(alert), copy);
});

test('읽기 모듈은 26건에서 26줄을 뽑고 그룹 이름은 뽑지 않는다', async () => {
  const rows = await readAlerts();
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'description', 'id', 'level', 'mitre', 'srcip', 'time', 'user']);
  assert.ok(!JSON.stringify(rows).includes('"administrators"'));
  assert.ok(!JSON.stringify(summarize(mk('x', 5, { group: 'administrators' }))).includes('administrators'));
  assert.equal(summarize(null).level, 0);
  const source = await readFile(join(here, 'read-alerts.mjs'), 'utf8');
  assert.ok(!/from '\.\/decide\.mjs'/u.test(source), '읽기 모듈은 판정 모듈을 부르지 않는다');
});

test('실행기가 결과 파일을 만들고 건수가 나온다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-run-pv-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await mkdir(join(dir, 'xdr', 'privilege'), { recursive: true });
    await cp(fixturePath, join(dir, 'xdr', 'fixtures', 'privilege.json'));
    await cp(join(here, 'decide.mjs'), join(dir, 'xdr', 'privilege', 'decide.mjs'));
    const errors = [];
    const result = await runXdr({ root: dir, moduleKey: 'privilege', writeError: (line) => errors.push(line) });
    assert.deepEqual(result.counts, { block: 9, alert: 8, record: 9 });
    assert.deepEqual(errors, []);
    const written = JSON.parse(await readFile(join(dir, 'xdr', 'privilege', 'result.json'), 'utf8'));
    assert.equal(written.schema, 'aleph.xdr.result.v1');
    assert.equal(written.decisions.length, 26);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
