// 학습용 DB의 가상 메모를 서버에서 읽어 돌려줍니다.
// 서버 전용 키는 환경변수에서만 읽고, 응답과 로그에는 넣지 않습니다.
// 3단계 로그인 전까지 이 함수는 공개 주소입니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  try {
    const upstream = await fetch(`${baseUrl}/rest/v1/notes?select=title,content&order=created_at.asc`, {
      headers: { apikey: secretKey, Accept: 'application/json' },
    });
    if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const rows = await upstream.json();
    const notes = rows.map(({ title, content }) => ({ title, content }));
    return response.status(200).json({ notes });
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
