import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 10단계: 침해 전에 검증한 안전 정책 사본(backup/policy-snapshot.json)과 현재 시험 정책의 차이를 보여 주고,
// 사본의 정책 버전으로 되돌립니다. 실제 운영 정책(엔진·배포 설정)은 건드리지 않고, 이 저장소의 시험 정책 파일만 다룹니다.
//   npm run policy:diff                      차이만 보여 줍니다(아무것도 바꾸지 않음).
//   npm run policy:restore                   바뀔 항목만 보여 줍니다(기본은 실행하지 않음).
//   npm run policy:restore -- --apply        검증을 통과하면 바뀔 항목만 되돌립니다.
//   npm run policy:snapshot -- --commit <sha> 검증한 커밋에서 사본을 새로 만듭니다.
// 다른 서비스 규칙, 감사 이력, 메모 자료는 읽지도 바꾸지도 않습니다.
const SNAPSHOT_PATH = 'backup/policy-snapshot.json';
const POLICY_FILES = ['src/decider.mjs', 'src/detect.mjs'];
const SCHEMA = 'aleph.policy.snapshot.v1';
const COMMIT = /^[0-9a-f]{7,40}$/u;

// 줄바꿈 차이(CRLF/LF)로 해시가 달라지지 않게 맞춘 뒤 SHA-256을 낸다.
export function fileHash(text) {
  return dashed(createHash('sha256').update(String(text).replace(/\r\n/gu, '\n')).digest('hex'));
}

// 사본에 적는 해시는 8자리씩 끊어 적는다. 저장소에 64자리 16진수 문자열이 그대로 남아 키 값처럼 보이지 않게 하려는 형식이다.
const dashed = hex => hex.match(/.{8}/gu).join('-');
const DASHED_HASH = /^[0-9a-f]{8}(?:-[0-9a-f]{8}){7}$/u;
const sealOf = body => dashed(createHash('sha256').update(JSON.stringify(body)).digest('hex'));

export function sealSnapshot(body) {
  return { ...body, sha256: sealOf(body) };
}

// 사본 검증: 형식, 필요한 값, 봉인 해시가 모두 맞아야 한다. 맞지 않으면 이유를 돌려준다(null 이면 통과).
export function verifySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return '사본 형식이 아닙니다.';
  const { sha256, ...body } = snapshot;
  if (body.schema !== SCHEMA) return '사본 형식(schema)이 맞지 않습니다.';
  if (!Number.isInteger(body.policyRevision) || body.policyRevision < 1) return '정책 버전(policyRevision)이 없습니다.';
  if (typeof body.verifiedCommit !== 'string' || !COMMIT.test(body.verifiedCommit)) return '검증한 커밋(verifiedCommit)이 없습니다.';
  if (!Array.isArray(body.allowedRoutes) || !body.allowedRoutes.length) return '허용 경로(allowedRoutes)가 없습니다.';
  if (!body.files || POLICY_FILES.some(path => !DASHED_HASH.test(body.files[path] ?? ''))) return '정책 파일 해시(files)가 없습니다.';
  if (typeof sha256 !== 'string' || sha256 !== sealOf(body)) return '사본 봉인 해시가 맞지 않습니다. 사본이 바뀌었을 수 있습니다.';
  return null;
}

// 현재 시험 정책: 허용 경로(설정)와 정책 파일의 해시.
export function readCurrentPolicy(root) {
  const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
  const files = {};
  for (const path of POLICY_FILES) files[path] = fileHash(readFileSync(join(root, path), 'utf8'));
  return { allowedRoutes: config.allowedRoutes ?? [], files };
}

// 사본과 현재 정책의 차이. 항목마다 { item, kind } 로 알려 준다.
export function diffPolicy(snapshot, current) {
  const changes = [];
  if (JSON.stringify(snapshot.allowedRoutes) !== JSON.stringify(current.allowedRoutes)) {
    changes.push({ item: 'aleph.config.json 의 allowedRoutes', kind: 'config' });
  }
  for (const path of POLICY_FILES) {
    if (snapshot.files[path] !== current.files[path]) changes.push({ item: path, kind: 'file', path });
  }
  return changes;
}

// 되돌릴 쓰기 계획. 검증한 커밋의 파일 내용이 사본의 해시와 다르면 아무것도 쓰지 않고 중단한다.
export function planRestore({ snapshot, current, readCommitFile }) {
  const reason = verifySnapshot(snapshot);
  if (reason) throw new Error(`검증 실패: ${reason}`);
  const changes = diffPolicy(snapshot, current);
  const writes = [];
  for (const change of changes.filter(item => item.kind === 'file')) {
    const content = readCommitFile(snapshot.verifiedCommit, change.path);
    if (fileHash(content) !== snapshot.files[change.path]) {
      throw new Error(`검증 실패: ${snapshot.verifiedCommit} 의 ${change.path} 내용이 사본의 해시와 다릅니다.`);
    }
    writes.push({ path: change.path, content });
  }
  return { policyRevision: snapshot.policyRevision, verifiedCommit: snapshot.verifiedCommit, changes, writes,
    restoreAllowedRoutes: changes.some(item => item.kind === 'config') };
}

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000, windowsHide: true });
const readCommitFile = root => (commit, path) => {
  if (!COMMIT.test(commit)) throw new Error('검증 실패: 커밋 값이 올바르지 않습니다.');
  return git(root, 'show', `${commit}:${path}`);
};

export function loadSnapshot(root) {
  const path = join(root, SNAPSHOT_PATH);
  if (!existsSync(path)) throw new Error('검증 실패: 정책 사본(backup/policy-snapshot.json)이 없어 중단합니다.');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('검증 실패: 정책 사본을 읽을 수 없어 중단합니다.');
  }
}

export function createSnapshot(root, commit, policyRevision) {
  if (!COMMIT.test(commit ?? '')) throw new Error('--commit 에 검증한 커밋 해시를 넣어 주세요.');
  const read = readCommitFile(root);
  const config = JSON.parse(read(commit, 'aleph.config.json'));
  const files = {};
  for (const path of POLICY_FILES) files[path] = fileHash(read(commit, path));
  return sealSnapshot({
    schema: SCHEMA,
    policyRevision: policyRevision ?? config.step,
    verifiedCommit: git(root, 'rev-parse', '--verify', `${commit}^{commit}`).trim(),
    note: '침해 전에 검증한 안전 정책 사본. 비밀값과 메모 내용은 없습니다.',
    allowedRoutes: config.allowedRoutes,
    files,
  });
}

function show(plan) {
  const out = [];
  out.push(`복원할 정책 버전: ${plan.policyRevision} (검증한 커밋 ${plan.verifiedCommit.slice(0, 12)})`);
  if (!plan.changes.length) out.push('변경 범위: 없음. 현재 시험 정책이 사본과 같습니다.');
  else {
    out.push(`변경 범위: ${plan.changes.length}개 항목`);
    for (const change of plan.changes) out.push(`  - ${change.item}`);
  }
  out.push('바뀌지 않는 것: 다른 서비스 규칙, 감사 이력, 메모 자료, 실제 운영 정책');
  return out.join('\n');
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const [command = 'diff', ...rest] = process.argv.slice(2);
  try {
    if (command === 'snapshot') {
      const at = rest.indexOf('--commit');
      const revisionAt = rest.indexOf('--revision');
      const snapshot = createSnapshot(root, at >= 0 ? rest[at + 1] : undefined,
        revisionAt >= 0 ? Number(rest[revisionAt + 1]) : undefined);
      writeFileSync(join(root, SNAPSHOT_PATH), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      console.log(`사본을 만들었습니다: ${SNAPSHOT_PATH} (정책 버전 ${snapshot.policyRevision}, 커밋 ${snapshot.verifiedCommit.slice(0, 12)})`);
      return;
    }
    if (command !== 'diff' && command !== 'restore') throw new Error('명령은 diff, restore, snapshot 중 하나입니다.');
    const snapshot = loadSnapshot(root);
    const plan = planRestore({ snapshot, current: readCurrentPolicy(root), readCommitFile: readCommitFile(root) });
    console.log(show(plan));
    if (command === 'diff') return;
    if (!rest.includes('--apply')) {
      console.log(plan.changes.length ? '실행하지 않았습니다. 위 항목을 되돌리려면 --apply 를 붙여 다시 실행하세요.' : '되돌릴 항목이 없습니다.');
      return;
    }
    for (const write of plan.writes) writeFileSync(join(root, write.path), write.content, 'utf8');
    if (plan.restoreAllowedRoutes) {
      const path = join(root, 'aleph.config.json');
      const config = JSON.parse(readFileSync(path, 'utf8'));
      config.allowedRoutes = snapshot.allowedRoutes;
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    }
    console.log(`되돌렸습니다: ${plan.changes.length}개 항목. 이어서 npm run decider:test 와 npm run detect:test 로 확인하세요.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '정책 복원 오류');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
