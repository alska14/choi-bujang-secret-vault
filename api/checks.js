// 점검 사례 실행(GET ?case=...)과 점검 요약(GET). 가상 입력만 실행하고 메모 본문·토큰은 담지 않습니다.
import config from '../aleph.config.json' with { type: 'json' };
import { createChecksApi } from '../src/checks-api.mjs';

let handler;

export default function checks(request, response) {
  if (!handler) handler = createChecksApi({ base: config.publicAppUrl, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || null });
  return handler(request, response);
}
