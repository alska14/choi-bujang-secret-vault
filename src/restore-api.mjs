import { createHash } from 'node:crypto';

// 10단계: 비공개 가상 메모 사본에서 지정한 한 건만 복원합니다.
// 사본이 없거나 검증에 실패하면 복원하지 않고 멈춥니다. 다른 메모와 감사 기록은 건드리지 않습니다.
// 응답과 로그에는 메모 내용·토큰을 넣지 않고 ID와 해시만 돌려줍니다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const send = (response, status, payload) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(payload);
};

// 메모의 ID·소유자·내용을 묶은 SHA-256. 사본과 복원 결과를 이 값으로 대조한다.
export function noteHash(note) {
  return createHash('sha256').update(JSON.stringify([note.id, note.owner_id, note.title, note.content])).digest('hex');
}

// 사본 항목에 해시를 붙인다. 사본을 만들 때 쓴다: { id, owner_id, title, content } 에 sha256 을 더한다.
export function sealNote(note) {
  const entry = { id: note.id, owner_id: note.owner_id, title: note.title, content: note.content };
  return { ...entry, sha256: noteHash(entry) };
}

// 사본은 서버 환경변수 NOTES_BACKUP_JSON(JSON 배열)에서만 읽는다. Git에는 사본을 올리지 않는다.
export function loadBackupFromEnv(env = process.env) {
  const raw = env.NOTES_BACKUP_JSON;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// db: { get(id, ownerId), insert(row), update(id, ownerId, patch) }  (notes-api 의 DB 연결과 같은 모양)
export function createRestoreApi({ verify, db, loadBackup }) {
  return async function restore(request, response) {
    try {
      const identity = await verify(request.headers?.authorization);
      if (!identity) {
        response.setHeader('WWW-Authenticate', 'Bearer');
        return send(response, 401, { error: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' });
      }
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return send(response, 405, { error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
      }
      const id = request.query?.noteId;
      if (typeof id !== 'string' || !UUID.test(id)) {
        return send(response, 400, { error: 'INVALID_REQUEST', message: '복원할 메모 ID 하나를 지정해 주세요.' });
      }

      // 1) 사본 검증: 사본이 없으면 중단한다.
      const backup = await loadBackup();
      if (!Array.isArray(backup)) {
        return send(response, 503, { error: 'BACKUP_UNAVAILABLE', message: '검증할 사본이 없어 복원하지 않았습니다.' });
      }
      const entry = backup.find(item => item && item.id === id);
      // 사본에 없거나 호출한 사용자의 메모가 아니면 존재 여부를 알리지 않는다.
      if (!entry || entry.owner_id !== identity.userId) {
        return send(response, 404, { error: 'NOT_FOUND', message: '복원할 메모를 찾을 수 없습니다.' });
      }
      // 사본 항목의 해시가 내용과 맞지 않으면 검증 실패로 중단한다.
      if (typeof entry.title !== 'string' || typeof entry.content !== 'string' || noteHash(entry) !== entry.sha256) {
        return send(response, 409, { error: 'BACKUP_INVALID', message: '사본 검증에 실패해 복원하지 않았습니다.' });
      }

      // 2) 지정한 한 건만 복원한다. 이미 사본과 같으면 바꾸지 않는다.
      const owner = identity.userId;
      const current = await db.get(id, owner);
      if (current && noteHash({ ...current, owner_id: owner }) === entry.sha256) {
        return send(response, 200, { id, restored: false, sha256: entry.sha256 });
      }
      if (current) {
        await db.update(id, owner, { title: entry.title, content: entry.content });
      } else if (!(await db.insert({ id, owner_id: owner, title: entry.title, content: entry.content }))) {
        return send(response, 409, { error: 'CONFLICT', message: '이 ID는 다른 곳에서 쓰고 있어 복원하지 않았습니다.' });
      }

      // 3) 복원 뒤 ID·소유자·내용 해시를 사본과 다시 대조한다. 다르면 실패로 기록하고 다시 시도하지 않는다.
      const after = await db.get(id, owner);
      if (!after || noteHash({ ...after, owner_id: owner }) !== entry.sha256) {
        return send(response, 500, { error: 'RESTORE_MISMATCH', message: '복원 결과가 사본과 달라 실패로 기록했습니다.' });
      }
      return send(response, 200, { id, restored: true, sha256: entry.sha256 });
    } catch {
      return send(response, 500, { error: 'SERVER_ERROR', message: '서버에서 처리하지 못했습니다.' });
    }
  };
}
