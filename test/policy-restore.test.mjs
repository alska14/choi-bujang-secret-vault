import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnapshot, diffPolicy, fileHash, planRestore, readCurrentPolicy, sealSnapshot, verifySnapshot } from '../scripts/policy-restore.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const DECIDER = 'export const RULE_IDS = [1];\n';
const DETECT = 'export function detect() {}\n';
const ROUTES = [{ service: 'notes', method: 'GET', pathPattern: '/api/my/notes', zone: 'my-notes' }];
const snapshot = sealSnapshot({
  schema: 'aleph.policy.snapshot.v1', policyRevision: 9, verifiedCommit: 'abc1234def',
  allowedRoutes: ROUTES, files: { 'src/decider.mjs': fileHash(DECIDER), 'src/detect.mjs': fileHash(DETECT) },
});
const same = { allowedRoutes: ROUTES, files: { 'src/decider.mjs': fileHash(DECIDER), 'src/detect.mjs': fileHash(DETECT) } };
const readCommitFile = (_commit, path) => ({ 'src/decider.mjs': DECIDER, 'src/detect.mjs': DETECT })[path];

test('줄바꿈(CRLF/LF)이 달라도 파일 해시는 같다', () => {
  assert.equal(fileHash('a\r\nb\r\n'), fileHash('a\nb\n'));
  assert.notEqual(fileHash('a\nb\n'), fileHash('a\nc\n'));
});

test('정상 사본은 검증을 통과한다', () => {
  assert.equal(verifySnapshot(snapshot), null);
});

test('사본이 없거나 바뀌었거나 형식이 틀리면 검증에 실패한다', () => {
  assert.ok(verifySnapshot(null));
  assert.ok(verifySnapshot('x'));
  assert.ok(verifySnapshot({ ...snapshot, policyRevision: 8 })); // 봉인 해시 불일치
  assert.ok(verifySnapshot({ ...snapshot, allowedRoutes: [...ROUTES, { method: 'PUT' }] }));
  assert.ok(verifySnapshot({ ...snapshot, schema: 'other' }));
  const { sha256, ...body } = snapshot;
  assert.ok(verifySnapshot(body)); // 봉인 없음
  assert.ok(verifySnapshot(sealSnapshot({ ...body, files: {} })));
  assert.ok(verifySnapshot(sealSnapshot({ ...body, verifiedCommit: 'not-a-commit; rm' })));
});

test('차이는 바뀐 항목만 알려 준다', () => {
  assert.deepEqual(diffPolicy(snapshot, same), []);
  const changed = { allowedRoutes: [...ROUTES, { method: 'PUT' }], files: { ...same.files, 'src/decider.mjs': fileHash('hacked') } };
  assert.deepEqual(diffPolicy(snapshot, changed).map(item => item.item),
    ['aleph.config.json 의 allowedRoutes', 'src/decider.mjs']);
  const onlyDetect = { ...same, files: { ...same.files, 'src/detect.mjs': fileHash('x') } };
  assert.deepEqual(diffPolicy(snapshot, onlyDetect).map(item => item.path), ['src/detect.mjs']);
});

test('되돌리기 계획은 바뀐 파일만 쓰고, 다른 파일은 건드리지 않는다', () => {
  const current = { allowedRoutes: ROUTES, files: { ...same.files, 'src/decider.mjs': fileHash('hacked') } };
  const plan = planRestore({ snapshot, current, readCommitFile });
  assert.equal(plan.policyRevision, 9);
  assert.deepEqual(plan.writes, [{ path: 'src/decider.mjs', content: DECIDER }]);
  assert.equal(plan.restoreAllowedRoutes, false);
  assert.deepEqual(planRestore({ snapshot, current: same, readCommitFile }).writes, []);
});

test('검증한 커밋의 파일이 사본 해시와 다르면 아무것도 쓰지 않고 중단한다', () => {
  const current = { allowedRoutes: ROUTES, files: { ...same.files, 'src/decider.mjs': fileHash('hacked') } };
  assert.throws(() => planRestore({ snapshot, current, readCommitFile: () => '다른 내용' }), /검증 실패/u);
  assert.throws(() => planRestore({ snapshot: { ...snapshot, sha256: 'x' }, current, readCommitFile }), /검증 실패/u);
});

test('커밋 값에 명령을 끼워 넣을 수 없다', () => {
  assert.throws(() => createSnapshot('.', 'HEAD; echo hacked'), /커밋 해시/u);
  assert.throws(() => createSnapshot('.', undefined), /커밋 해시/u);
});

test('저장소에 있는 정책 사본은 검증을 통과하고 비밀값이 없다', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const stored = JSON.parse(readFileSync(join(root, 'backup', 'policy-snapshot.json'), 'utf8'));
  assert.equal(verifySnapshot(stored), null);
  assert.ok(!/sb_secret|BEGIN [A-Z ]*PRIVATE|Bearer\s|eyJ[A-Za-z0-9_-]{12}/u.test(JSON.stringify(stored)));
  assert.ok(readCurrentPolicy(root).files['src/decider.mjs']);
});

test('저장소의 정책 사본에는 64자리 연속 16진수(키처럼 보이는 값)가 없다', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const raw = readFileSync(join(root, 'backup', 'policy-snapshot.json'), 'utf8');
  assert.ok(!/[0-9a-fA-F]{64,}/u.test(raw)); // 40자리 커밋 번호는 키가 아니므로 허용한다
  assert.match(fileHash('x'), /^[0-9a-f]{8}(?:-[0-9a-f]{8}){7}$/u);
});
