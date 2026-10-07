// Jev(TypeSafe System One) 호출. 키는 환경변수 TYPESAFE_API_KEY 에서만 읽는다. 코드·로그에 남기지 않는다.
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export async function askJev({ description, count, pattern }, { fetchImpl = fetch, apiKey = process.env.TYPESAFE_API_KEY } = {}) {
  if (!apiKey) return null;
  const state = `보안 경보: ${description}${count === null ? '' : ` (실패 건수 ${count})`}. 의심 패턴: ${pattern}`;
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      model: 'jev-latest',
      questions: {
        attack: { type: 'noul', instructions: '이 경보는 정상 사용자의 실수가 아니라 무차별 대입 로그인 공격이다.' },
      },
    }),
  });
  if (!res.ok) return null;
  const v = (await res.json())?.answers?.attack?.noul;
  return typeof v === 'number' ? v : null;
}
