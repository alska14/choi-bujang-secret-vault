// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'starter.deny', 'device_registered', 'step_up_required', 'route_not_allowed', 'write_not_allowed',
]);

// 8단계 구역(자원 ID) 표: 엔진이 확인한 route 모양만 키로 쓰고, 이 표에 없는 경로는 모두 거부한다(route_not_allowed).
//   my-notes: 내 메모. 한 건 조회 GET /notes/:id, GET /api/notes/:id 와 본인 목록 GET /api/my/notes. 읽기만 허용한다.
//   class-notices: 반 공지. GET /api/notices. 읽기만 허용한다.
//   instructor-materials: 이 앱에서는 어떤 경로도 열지 않는다. 표에 없으므로 거부된다.
// 쿼리로 기능을 고르지 않고 자료 ID(:id)만 고른다. :id 와 같은 깊이에 export 같은 기능 경로를 두지 않는다.
// 요청 계약에는 메모 주인이나 강사 역할 값이 없으므로, 주인 비교는 엔진과 자료 API가 맡고 역할로 구역을 여는 코드는 두지 않는다.
const ZONES = Object.freeze({
  'GET /notes/:id': 'my-notes',
  'GET /api/notes/:id': 'my-notes',
  'GET /api/my/notes': 'my-notes',
  'GET /api/notices': 'class-notices',
});
// 쓰기(추가·수정·삭제)는 구역과 관계없이 모두 거부한다. 반 공지·강사 자료 쓰기도 여기서 막힌다.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 7단계: 위험 신호를 센다. 요청 계약(signals, recentEvents)에 정의된 값만 읽고,
// 값이 없거나 'unknown' 이면 위험으로 세지도, 정상값으로 바꿔 넣지도 않는다.
// 브라우저 헤더는 이 함수에 오지 않으며, 엔진이 검증해 넘긴 request 필드만 근거로 쓴다.
function riskCount(request) {
  const signals = request.signals && typeof request.signals === 'object' ? request.signals : {};
  let count = 0;
  if (signals.region === 'foreign') count += 1;
  if (signals.network === 'unusual') count += 1;
  if (Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour < 6) count += 1;
  const events = Array.isArray(request.recentEvents) ? request.recentEvents : [];
  if (events.some((e) => e && e.kind === 'risk_signal' && Number(e.count) >= 10)) count += 1;
  return count;
}

// 엔진이 확인한 재인증만 인정한다. 계약상 verified 가 true 이면 나이는 0~900초다.
function stepUpDone(request) {
  const step = request.stepUp;
  return Boolean(step) && step.verified === true
    && Number.isInteger(step.authAgeSeconds) && step.authAgeSeconds >= 0 && step.authAgeSeconds <= 900;
}

export async function decide(request) {
  const response = (decision, reasonCode, ruleId) => ({
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision,
    reasonCode,
    ruleIds: [ruleId],
  });

  // 8단계: 쓰기는 모두 거부하고, 구역 표에 없는 경로(전체 목록, 모르는 경로 등)도 거부한다.
  if (WRITE_METHODS.has(request.method)) return response('deny', 'write_not_allowed', 'write_not_allowed');
  if (!Object.hasOwn(ZONES, request.route)) return response('deny', 'route_not_allowed', 'route_not_allowed');

  // 6단계 device_registered: 엔진이 확인한 deviceRegistered 가 true 일 때만 허용한다. false 이거나 값이 없으면 거부한다.
  if (request.deviceRegistered !== true) return response('deny', 'device_not_registered', 'device_registered');

  // 7단계 step_up_required: 위험 신호가 둘 이상 겹칠 때만 추가 확인을 요구한다. 신호 하나(지역만 등)로는 막지 않는다.
  if (request.method === 'GET') {
    if (riskCount(request) >= 2 && !stepUpDone(request)) return response('step_up', 'step_up_required', 'step_up_required');
    return response('allow', 'device_registered', 'device_registered');
  }

  return response('deny', 'starter_not_ready', RULE_IDS[0]);
}
