// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 3 && config.step !== 4) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (config.step >= 3) return anonymousChecks(app);
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 3·4단계: 로그인 없이 보낸 실제 요청의 결과만 적습니다. 메모 본문은 기록하지 않습니다.
async function anonymousChecks(app) {
  const get = path => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const json = async response => { try { return await response.json(); } catch { return null; } };
  const list = await get('/api/notes');
  const listBody = await json(list);
  const rejected = [401, 403].includes(list.status) && typeof listBody?.error === 'string'
    && !Array.isArray(listBody);
  const data = await get('/data.json');
  const dataBody = data.ok ? await json(data) : null;
  const exposed = Array.isArray(dataBody?.notes) ? dataBody.notes.length : 0;
  return [
    { attackId: 'anonymous_note_list', expected: '로그인 없이 메모 목록을 요청하면 401 또는 403과 JSON 오류',
      observed: rejected ? `거부됨 (HTTP ${list.status}, JSON 오류 문구)` : `거부되지 않음 (HTTP ${list.status})` },
    { attackId: 'public_data_json', expected: '공개 data.json에 가상 메모가 없음',
      observed: `HTTP ${data.status}, 공개 메모 ${exposed}건` },
  ];
}
