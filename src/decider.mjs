// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 이 기본 응답은 모든 요청을 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

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

  // 6단계 device_registered: 엔진이 확인한 deviceRegistered 가 true 일 때만 자료 읽기(GET)를 허용한다.
  // false 이거나 값이 없으면 거부한다. 다른 동작은 아래 기본 거부로 남는다.
  if (request.deviceRegistered !== true) return response('deny', 'device_not_registered', 'device_registered');
  if (request.method === 'GET') {
    // 7단계 step_up_required: 위험 신호가 둘 이상 겹칠 때만 추가 확인을 요구한다. 신호 하나(지역만 등)로는 막지 않는다.
    if (riskCount(request) >= 2 && !stepUpDone(request)) return response('step_up', 'step_up_required', 'step_up_required');
    return response('allow', 'device_registered', 'device_registered');
  }

  return response('deny', 'starter_not_ready', RULE_IDS[0]);
}
