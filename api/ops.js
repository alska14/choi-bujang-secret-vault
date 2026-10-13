// 12단계 탈환 작전실이 읽는 서버 기록(GET). 가상 메모 본문과 토큰은 담지 않습니다.
import config from '../aleph.config.json' with { type: 'json' };
import { createOpsApi } from '../src/ops-api.mjs';

let handler;

export default function ops(request, response) {
  if (!handler) handler = createOpsApi({ base: config.publicAppUrl, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || null });
  return handler(request, response);
}
