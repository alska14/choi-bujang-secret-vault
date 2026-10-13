// 11단계: 기기 승인 요청 안내(POST). 요청을 저장하거나 권한을 주지 않습니다.
import { deviceRequest } from '../../src/device-api.mjs';

export default function handler(request, response) {
  return deviceRequest(request, response);
}
