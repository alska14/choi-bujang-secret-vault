// 9단계 탐지 함수: 같은 사용자(identity.sub)의 GET 조회가 어느 10분 구간에서든 120건을 넘으면 권한 회수를 제안합니다.
// 정확히 120건은 제안하지 않습니다. 다른 사용자의 사건을 합산하지 않고, 10분 밖의 사건을 같은 묶음으로 세지 않습니다.
// 반 엔진이 검증해 넘긴 사건만 받으며, 브라우저가 보낸 사용자 번호는 신원으로 쓰지 않습니다.
// 사건에서 시각(at), 요청 종류(method), 가명 사용자(identity.sub)만 읽습니다. 메모 내용·토큰·실명 같은 다른 값은 읽지도 저장하지도 출력하지도 않습니다.
// 이 파일은 다른 파일을 불러오지 않는 단독 파일입니다. 실제 회수 API는 만들지 않고 제안만 돌려줍니다.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;

// 사건 하나에서 필요한 두 값만 꺼낸다. 형식이 맞지 않으면 null 로 버린다(정상값으로 채우지 않는다).
function readEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const sub = event.identity?.sub;
  if (typeof sub !== 'string' || sub === '') return null;
  if (typeof event.method !== 'string' || event.method.toUpperCase() !== 'GET') return null;
  const at = typeof event.at === 'number' ? event.at : Date.parse(event.at);
  if (!Number.isFinite(at)) return null;
  return { sub, at };
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  const timesBySubject = new Map();
  for (const event of events) {
    const read = readEvent(event);
    if (!read) continue;
    if (!timesBySubject.has(read.sub)) timesBySubject.set(read.sub, []);
    timesBySubject.get(read.sub).push(read.at);
  }

  for (const [subject, times] of timesBySubject) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= WINDOW_MS) start += 1;
      if (end - start + 1 > LIMIT) return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
    }
  }
  return { action: 'observe' };
}
