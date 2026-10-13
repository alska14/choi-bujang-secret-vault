import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runXdr } from '../../scripts/xdr-run.mjs';
import { decide } from './decide.mjs';
import { readAlerts, summarize } from './read-alerts.mjs';
import { respond } from './respond.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'exfiltration.json');

const mk = (description, level, data = {}) => ({
  id: 'v', timestamp: '2026-10-01T00:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre: ['T1048'] }, data: { srcip: '192.0.2.20', srcuser: 'user01', dstip: '203.0.113.50', ...data },
});

test('decide.mjs 파일 하나만 있어도 경보 묶음이 10/10/10 으로 나뉜다 (격리 환경)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-ex-'));
  try {
    await cp(join(here, 'decide.mjs'), join(dir, 'decide.mjs'));
    const iso = await import(pathToFileURL(join(dir, 'decide.mjs')).href);
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) counts[(await iso.decide(alert)).action] += 1;
    assert.deepEqual(counts, { block: 10, alert: 10, record: 10 });
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
  assert.deepEqual(file.technique, ['T1041', 'T1048']);
  for (const pattern of file.patterns) {
    assert.ok(pattern.name && pattern.when && typeof pattern.evidence === 'string' && pattern.evidence.length > 10 && !pattern.evidence.includes('\n'), pattern.id);
    assert.ok(pattern.confidence >= 0 && pattern.confidence <= 1, pattern.id);
  }
});

test('큰 전송이 이상한 맥락과 함께 있으면 위험도가 낮아도 block 이다 (숫자는 문자열이어도 된다)', () => {
  assert.equal(decide(mk('처음 보는 목적지로 파일이 나갔습니다.', 4, { bytes: '240000000', files: '200' })).action, 'block');
  assert.equal(decide(mk('처음 보는 목적지로 파일이 나갔습니다.', 4, { bytes: 25000000 })).action, 'block');
  assert.equal(decide(mk('외부 주소로 복사됐습니다.', 4, { bytes: '30000000' })).action, 'block');
  assert.equal(decide(mk('수업 시간 밖에 압축 파일이 나갔습니다.', 4, { bytes: '180000000' })).action, 'block');
  assert.equal(decide(mk('같은 목적지로 전송이 8번입니다.', 4, { bytes: '90000000', count: '8' })).action, 'block');
  assert.equal(decide(mk('자료가 한꺼번에 나갔습니다.', 4, { bytes: '70000000', files: '140' })).action, 'block');
  assert.equal(decide(mk('평소에 쓰지 않던 포트로 전송됐습니다.', 4, { bytes: '120000000' })).action, 'block');
  assert.equal(decide(mk('명령 통로로 파일이 나갔습니다.', 4, { bytes: '80000000' })).action, 'block');
  assert.equal(decide(mk('알 수 없는 문구', 12, { bytes: '10' })).action, 'block');
});

test('큰 전송이라도 맥락이 없거나, 맥락이 있어도 작으면 block 이 아니라 alert 이다', () => {
  assert.equal(decide(mk('평소 백업이 끝났습니다.', 3, { bytes: '100000000', files: '5' })).action, 'alert');
  assert.equal(decide(mk('처음 보는 주소로 작은 파일이 2건 나갔습니다.', 6, { bytes: '400000', files: '2' })).action, 'alert');
  assert.equal(decide(mk('명령 통로에 짧은 자료 이름이 3번 보였습니다.', 6, { bytes: '90000', count: '3' })).action, 'alert');
  assert.equal(decide(mk('전송이 실패 1건으로 끝났습니다. 목적지는 처음 봅니다.', 5, { bytes: '0' })).action, 'alert');
  assert.equal(decide(mk('중간 크기 파일 1건이 나갔습니다.', 6, { bytes: '8000000' })).action, 'alert');
});

test('숫자가 없거나 이상해도 큰 값으로 치지 않는다', () => {
  for (const bytes of [undefined, null, '', 'abc', '-5', -5, NaN, {}, []]) {
    const out = decide(mk('처음 보는 목적지로 파일이 나갔습니다.', 3, { bytes }));
    assert.notEqual(out.action, 'block', String(bytes));
  }
});

test('정상 이벤트는 record 이고 확신도가 0.5 보다 낮다', () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const out = decide(mk('내 메모 한 건을 읽었습니다.', level, { bytes: '2400', files: '1', dstip: '192.0.2.10' }));
    assert.equal(out.action, 'record');
    assert.ok(out.confidence < 0.5);
  }
  assert.equal(decide(mk('수업 자료 주소로 작은 동기화가 끝났습니다.', 3, { bytes: '20000', files: '3' })).action, 'record');
  assert.equal(decide(mk('로그아웃했습니다.', 3, { bytes: '300' })).action, 'record');
});

test('필드가 빠지거나 모양이 틀린 경보도 오류 없이 record 이다', () => {
  for (const bad of [undefined, null, 'x', 5, [], {}, { rule: null, data: 5 }, { rule: { level: 'abc' }, data: null }]) {
    assert.equal(decide(bad).action, 'record', JSON.stringify(bad));
  }
});

test('반환은 action·confidence·reason 세 값만이고, 이유에는 주소·전송량을 담지 않는다', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const alert of fixture.alerts) {
    const out = decide(alert);
    assert.deepEqual(Object.keys(out).sort(), ['action', 'confidence', 'reason']);
    assert.ok(['block', 'alert', 'record'].includes(out.action));
    assert.ok(out.confidence >= 0 && out.confidence <= 1);
    assert.ok(typeof out.reason === 'string' && out.reason.length > 0 && !out.reason.includes('\n'));
    assert.ok(!/\d{4,}|203\.0\.113|198\.51\.100|192\.0\.2|user\d/u.test(out.reason));
    assert.equal(decide(alert).action, out.action);
  }
});

test('입력 경보를 바꾸지 않는다', () => {
  const alert = mk('처음 보는 목적지로 대용량 전송', 12, { bytes: '240000000', files: '200' });
  const copy = JSON.stringify(alert);
  decide(alert);
  assert.equal(JSON.stringify(alert), copy);
});

test('읽기 모듈은 30건에서 30줄을 뽑고 목적지·전송량은 뽑지 않는다', async () => {
  const rows = await readAlerts();
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'description', 'id', 'level', 'mitre', 'srcip', 'time', 'user']);
  assert.ok(!/dstip|bytes|240000000|203\.0\.113\.50/u.test(JSON.stringify(rows)));
  assert.ok(!JSON.stringify(summarize(mk('x', 5, { dstip: '203.0.113.99', bytes: '12345678' }))).includes('203.0.113.99'));
  assert.equal(summarize(null).level, 0);
  const source = await readFile(join(here, 'read-alerts.mjs'), 'utf8');
  assert.ok(!/from '\.\/decide\.mjs'/u.test(source), '읽기 모듈은 판정 모듈을 부르지 않는다');
});

test('실행기가 결과 파일을 만들고, 차단 후보는 목적지 기준이며 평소 목적지는 뺀다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-run-ex-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await mkdir(join(dir, 'xdr', 'exfiltration'), { recursive: true });
    await cp(fixturePath, join(dir, 'xdr', 'fixtures', 'exfiltration.json'));
    await cp(join(here, 'decide.mjs'), join(dir, 'xdr', 'exfiltration', 'decide.mjs'));
    const errors = [];
    const result = await runXdr({ root: dir, moduleKey: 'exfiltration', writeError: (line) => errors.push(line) });
    assert.deepEqual(result.counts, { block: 10, alert: 10, record: 10 });
    assert.deepEqual(errors, []);
    assert.equal(JSON.parse(await readFile(join(dir, 'xdr', 'exfiltration', 'result.json'), 'utf8')).decisions.length, 30);

    // 다른 모듈의 알림 줄은 보존하고 이 모듈의 줄만 바꾼다.
    await writeFile(join(dir, 'xdr', 'alerts.log'), '[brute-force] 기존 줄 하나\n오래된 접두사 없는 줄\n[exfiltration] 지난번 줄\n', 'utf8');
    const summary = await respond({ root: dir });
    assert.equal(summary.alerts, 20);
    const log = (await readFile(join(dir, 'xdr', 'alerts.log'), 'utf8')).split('\n').filter(Boolean);
    assert.ok(log.includes('[brute-force] 기존 줄 하나'));
    assert.ok(!log.some((line) => line.includes('지난번 줄') || line.includes('오래된 접두사')));
    assert.equal(log.filter((line) => line.startsWith('[exfiltration] ')).length, 20);
    assert.ok(!log.some((line) => line.includes(' RECORD ')));

    const { rules } = JSON.parse(await readFile(join(dir, 'xdr', 'exfiltration', 'block-rules.json'), 'utf8'));
    assert.ok(rules.length >= 1 && rules.length <= 10);
    const normalDestinations = ['192.0.2.10', '198.51.100.10'];
    for (const rule of rules) {
      assert.deepEqual(Object.keys(rule).sort(), ['action', 'dstip', 'evidenceAlertId', 'expiresAt']);
      assert.equal(rule.action, 'deny');
      assert.match(rule.evidenceAlertId, /^ex-(0[1-9]|10)$/u);
      assert.ok(Number.isFinite(Date.parse(rule.expiresAt)));
      assert.ok(!normalDestinations.includes(rule.dstip), '평소 목적지는 차단 후보가 아니다');
    }
    assert.equal(new Set(rules.map((rule) => rule.dstip)).size, rules.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
