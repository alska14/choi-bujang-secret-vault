// 10단계 한 건 복원: POST /api/restore/:noteId. 로그인한 본인의 메모 한 건만, 비공개 사본과 해시를 대조해 복원합니다.
import { getNotesDeps } from '../../src/notes-api.mjs';
import { createRestoreApi, loadBackupFromEnv } from '../../src/restore-api.mjs';

let handler;

export default function restore(request, response) {
  if (!handler) {
    const { verify, db } = getNotesDeps();
    handler = createRestoreApi({ verify, db, loadBackup: async () => loadBackupFromEnv() });
  }
  return handler(request, response);
}
