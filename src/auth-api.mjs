import { createClient } from '@supabase/supabase-js';

const MAX_EMAIL = 254;
const MAX_PASSWORD = 128;
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };

const send = (response, status, payload) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(payload);
};
const fail = (response, status, error, message) => send(response, status, { error, message });

// 브라우저에는 토큰 네 가지만 돌려줍니다. 사용자 원본 객체나 키는 돌려주지 않습니다.
const sessionOf = session => ({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  email: session.user?.email ?? '',
});

// auth: 공개 키 클라이언트의 auth, revoke(accessToken): 서버 전용 키로 세션 폐기
export function createAuthApi({ auth, revoke }) {
  return async function handler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return fail(response, 405, 'METHOD_NOT_ALLOWED', '허용되지 않는 방법입니다.');
    }
    const body = request.body && typeof request.body === 'object' ? request.body : null;
    const text = value => typeof value === 'string' ? value : '';
    try {
      switch (body?.action) {
        case 'login':
        case 'signup': {
          const email = text(body.email).trim();
          const password = text(body.password);
          if (!email || email.length > MAX_EMAIL || !password || password.length > MAX_PASSWORD) {
            return fail(response, 400, 'INVALID_REQUEST', '이메일과 비밀번호를 확인해 주세요.');
          }
          const { data, error } = body.action === 'login'
            ? await auth.signInWithPassword({ email, password })
            : await auth.signUp({ email, password });
          if (error) return fail(response, 400, 'AUTH_FAILED', error.message);
          return send(response, 200, data.session ? { session: sessionOf(data.session) } : { pending: true });
        }
        case 'refresh': {
          const refreshToken = text(body.refresh_token);
          if (!refreshToken || refreshToken.length > 512) return fail(response, 400, 'INVALID_REQUEST', '다시 로그인해 주세요.');
          const { data, error } = await auth.refreshSession({ refresh_token: refreshToken });
          if (error || !data.session) return fail(response, 401, 'AUTH_FAILED', '다시 로그인해 주세요.');
          return send(response, 200, { session: sessionOf(data.session) });
        }
        case 'logout': {
          const token = text(body.access_token);
          if (token) await revoke(token).catch(() => {});
          return send(response, 200, { ok: true });
        }
        default:
          return fail(response, 400, 'INVALID_REQUEST', '요청 형식이 맞지 않습니다.');
      }
    } catch {
      return fail(response, 500, 'SERVER_ERROR', '서버에서 처리하지 못했습니다.');
    }
  };
}

let runtime;
// 공개 키(SUPABASE_PUBLISHABLE_KEY)와 서버 전용 키는 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
export function getAuthApi() {
  if (!runtime) {
    const url = process.env.SUPABASE_URL;
    const publicClient = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
    const adminClient = createClient(url, process.env.SUPABASE_SECRET_KEY, clientOptions);
    runtime = createAuthApi({
      auth: publicClient.auth,
      revoke: token => adminClient.auth.admin.signOut(token, 'local'),
    });
  }
  return runtime;
}
