// 8단계 class-notices 구역: 반 공지 읽기(GET만). 로그인 없이는 401, 쓰기는 405입니다.
import { getNotesApi } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return getNotesApi().notices(request, response);
}
