// 11단계: 기기 승인 상태 응답. 승인 여부는 서버와 판정기(엔진이 확인한 deviceRegistered)가 정하며,
// 화면의 버튼·앱 설치 표시·브라우저가 보낸 값은 근거가 되지 않습니다.
// 이 앱 서버는 엔진이 확인한 기기 등록 신호를 받지 못하므로 항상 승인 전으로 답합니다(승인한 것처럼 꾸미지 않습니다).
// 기기 키·서명 원문·토큰을 받거나 저장하거나 돌려주지 않습니다.
const json = (response, status, payload) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(payload);
};

const only = (method, allowed, response) => {
  if (method === allowed) return false;
  response.setHeader('Allow', allowed);
  json(response, 405, { error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
  return true;
};

// GET /api/device/status: 이 기기가 승인됐는지. 신뢰할 수 있는 승인 신호가 없으면 승인 전입니다.
export function deviceStatus(request, response) {
  if (only(request.method, 'GET', response)) return undefined;
  return json(response, 200, { approved: false, reason: 'device_not_registered' });
}

// POST /api/device/request: 승인 요청 안내. 요청을 저장하거나 권한을 주지 않고, 항상 승인 전으로 답합니다.
export function deviceRequest(request, response) {
  if (only(request.method, 'POST', response)) return undefined;
  return json(response, 200, {
    approved: false,
    requested: false,
    reason: 'approval_decided_by_engine',
    message: '이 앱은 기기 승인을 직접 처리하지 않습니다. 강사에게 이 기기의 등록을 요청하세요. 등록 여부는 서버와 판정기가 확인합니다.',
  });
}
