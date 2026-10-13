// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 이 기본 응답은 모든 요청을 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

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
  if (request.method === 'GET') return response('allow', 'approved', 'device_registered');

  return response('deny', 'starter_not_ready', RULE_IDS[0]);
}
