// 로그인한 사용자의 메모 목록(GET)과 추가(POST). 로그인 없이는 401을 돌려줍니다.
import { getNotesApi } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return getNotesApi().collection(request, response);
}
