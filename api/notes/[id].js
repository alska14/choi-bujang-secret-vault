// 메모 한 건 조회(GET)·수정(PUT)·삭제(DELETE). 로그인 없이는 401을 돌려줍니다.
import { getNotesApi } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  return getNotesApi().item(request, response);
}
