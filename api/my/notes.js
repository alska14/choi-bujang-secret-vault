// 8단계 my-notes 구역: 로그인한 사용자 본인의 메모 목록(GET만). 로그인 없이는 401을 돌려줍니다.
import { getNotesApi } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  return getNotesApi().myNotes(request, response);
}
