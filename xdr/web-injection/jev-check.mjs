// 키가 실제로 먹히는지 확인용. 애매한 경보에 Jev 가 준 확률만 출력한다(키는 출력하지 않음).
import { askJev } from './jev.mjs';
import { readAlerts } from './read-alerts.mjs';

if (!process.env.TYPESAFE_API_KEY) {
  console.log('TYPESAFE_API_KEY 가 설정돼 있지 않습니다.');
  process.exit(1);
}
const ambiguous = (await readAlerts()).filter((a) => a.level >= 5 && a.level <= 8);
for (const a of ambiguous) {
  const p = await askJev({ description: a.description, count: a.count, pattern: 'check' }).catch((e) => `오류: ${e.message}`);
  console.log(a.id, p);
}
