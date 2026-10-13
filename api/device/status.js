// 11단계: 이 기기의 승인 상태(GET). 승인은 서버와 판정기가 정합니다.
import { deviceStatus } from '../../src/device-api.mjs';

export default function handler(request, response) {
  return deviceStatus(request, response);
}
