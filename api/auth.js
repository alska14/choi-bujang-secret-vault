// 로그인·가입·토큰 갱신·로그아웃 중계. 공개 키는 서버 환경변수에만 둡니다.
import { getAuthApi } from '../src/auth-api.mjs';

export default function handler(request, response) {
  return getAuthApi()(request, response);
}
