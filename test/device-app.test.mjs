import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deviceRequest, deviceStatus } from '../src/device-api.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

function call(handler, { method = 'GET', headers = {}, body } = {}) {
  const out = { headers: {} };
  const response = {
    status(code) { out.code = code; return response; },
    setHeader(key, value) { out.headers[key.toLowerCase()] = value; },
    json(payload) { out.body = payload; return response; },
  };
  handler({ method, headers, body }, response);
  return out;
}

test('기기 상태는 승인 전으로 답하고, 브라우저가 보낸 값으로 바뀌지 않는다', () => {
  const plain = call(deviceStatus);
  assert.equal(plain.code, 200);
  assert.deepEqual(plain.body, { approved: false, reason: 'device_not_registered' });
  assert.equal(plain.headers['cache-control'], 'no-store');
  // 승인한 척하는 헤더·본문·설치 표시가 있어도 승인되지 않는다.
  const forged = call(deviceStatus, { headers: { 'x-device-registered': 'true', 'x-aleph-device': 'approved', authorization: 'Bearer x' },
    body: { approved: true, deviceRegistered: true, installed: true } });
  assert.equal(forged.body.approved, false);
});

test('기기 상태는 GET만, 승인 요청 안내는 POST만 받는다', () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const out = call(deviceStatus, { method });
    assert.equal(out.code, 405);
    assert.equal(out.headers.allow, 'GET');
  }
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const out = call(deviceRequest, { method });
    assert.equal(out.code, 405);
    assert.equal(out.headers.allow, 'POST');
  }
});

test('승인 요청 안내는 요청을 저장하거나 권한을 주지 않고 기기 값을 돌려주지 않는다', () => {
  const out = call(deviceRequest, { method: 'POST', body: { credential: 'DUMMY_VALUE_123', signature: 'SIG', approved: true } });
  assert.equal(out.code, 200);
  assert.equal(out.body.approved, false);
  assert.equal(out.body.requested, false);
  assert.ok(!JSON.stringify(out.body).includes('DUMMY_VALUE_123'));
  assert.ok(!JSON.stringify(out.body).includes('SIG'));
});

test('manifest 는 앱 이름·시작 주소·표시 방식·아이콘을 갖고, 설치만으로 승인되지 않음을 알린다', () => {
  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.name, '나의 자료실');
  assert.ok(manifest.short_name);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 1);
  for (const icon of manifest.icons) assert.ok(read(icon.src.replace(/^\//u, 'public/')).includes('<svg'));
  assert.match(manifest.description, /설치했다는 표시만으로 기기가 승인되지 않/u);
});

test('화면은 manifest 를 연결하고 오프라인 안내를 두며, 설치 표시를 승인으로 쓰지 않는다', () => {
  const html = read('public/index.html');
  assert.match(html, /<link rel="manifest" href="\/manifest\.json">/u);
  assert.match(html, /오프라인입니다/u);
  assert.match(html, /설치했다는 표시만으로는 기기가 승인되지 않습니다/u);
  assert.ok(!/beforeinstallprompt|appinstalled|display-mode/u.test(html)); // 설치 이벤트를 승인 근거로 쓰지 않는다
  assert.ok(!/serviceWorker/u.test(html)); // 보호 자료를 캐시하지 않는다
});

test('메모는 로그인과 서버의 승인이 모두 있을 때만 열고, 브라우저 저장소에 아무것도 저장하지 않는다', () => {
  const html = read('public/index.html');
  assert.match(html, /const open = Boolean\(session\) && deviceApproved;/u);
  assert.match(html, /deviceApproved = response\.ok && data\?\.approved === true;/u);
  assert.match(html, /if \(next && deviceApproved\) run\(/u);
  // 승인 여부를 바꾸는 코드는 서버 응답 하나뿐이다.
  assert.equal(html.split('deviceApproved = true').length - 1, 0);
  // 로그인 정보도 화면의 메모리에만 두고, 브라우저 저장소(localStorage·sessionStorage·IndexedDB·쿠키)를 쓰지 않는다.
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./u.test(html));
  // 키처럼 보이는 값(PEM 머리말, 긴 16진수, JWT 모양)이 화면 묶음에 없다.
  for (const path of ['public/index.html', 'public/manifest.json', 'public/icon.svg', 'public/data.json']) {
    const text = read(path);
    assert.ok(!/-----BEGIN|\b[0-9a-fA-F]{40,}\b|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u.test(text), path);
  }
});

test('화면 스크립트에 문법 오류가 없다', () => {
  const html = read('public/index.html');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  const dir = mkdtempSync(join(tmpdir(), 'page-'));
  try {
    writeFileSync(join(dir, 'page.mjs'), script);
    execFileSync(process.execPath, ['--check', join(dir, 'page.mjs')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
