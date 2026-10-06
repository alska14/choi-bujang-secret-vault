import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;

const send = (response, status, payload) => {
  response.setHeader('Cache-Control', 'no-store');
  return payload === undefined ? response.status(status).end() : response.status(status).json(payload);
};

function readJson(request) {
  const raw = request.body;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

function readFields(request) {
  const data = readJson(request);
  if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return null;
  const title = data.title.trim();
  if (!title || title.length > TITLE_MAX || data.body.length > BODY_MAX) return null;
  return { id: data.id, title, body: data.body };
}

const publicNote = row => ({ id: row.id, title: row.title, body: row.content });

// db: { list(ownerId), insert(row), get(id, ownerId), update(id, ownerId, patch), remove(id, ownerId) }
// 조회·수정·삭제는 id와 확인된 사용자 ID가 모두 맞는 행만 다룹니다. 본문·URL의 owner_id는 쓰지 않습니다.
export function createNotesApi({ verify, db }) {
  async function authenticate(request, response) {
    const identity = await verify(request.headers?.authorization);
    if (!identity) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      send(response, 401, { error: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' });
      return null;
    }
    return identity;
  }
  const bad = response => send(response, 400, { error: 'INVALID_REQUEST', message: '요청 형식이 맞지 않습니다.' });
  const guard = handler => async (request, response) => {
    try {
      const identity = await authenticate(request, response);
      if (identity) await handler(request, response, identity);
    } catch {
      send(response, 500, { error: 'SERVER_ERROR', message: '서버에서 처리하지 못했습니다.' });
    }
  };

  const collection = guard(async (request, response, identity) => {
    if (request.method === 'GET') {
      const rows = await db.list(identity.userId);
      return send(response, 200, rows.map(publicNote));
    }
    if (request.method === 'POST') {
      const fields = readFields(request);
      if (!fields || (fields.id !== undefined && !(typeof fields.id === 'string' && UUID.test(fields.id)))) {
        return bad(response);
      }
      const id = fields.id ?? randomUUID();
      const inserted = await db.insert({ id, owner_id: identity.userId, title: fields.title, content: fields.body });
      if (!inserted) return send(response, 409, { error: 'CONFLICT', message: '이미 있는 id입니다.' });
      return send(response, 201, { id });
    }
    response.setHeader('Allow', 'GET, POST');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
  });

  const notFound = response => send(response, 404, { error: 'NOT_FOUND', message: '메모를 찾을 수 없습니다.' });
  const item = guard(async (request, response, identity) => {
    const id = request.query?.id;
    if (typeof id !== 'string' || !UUID.test(id)) return bad(response);
    const owner = identity.userId;
    if (request.method === 'GET') {
      const row = await db.get(id, owner);
      return row ? send(response, 200, publicNote(row)) : notFound(response);
    }
    if (request.method === 'PUT') {
      const fields = readFields(request);
      if (!fields) return bad(response);
      const row = await db.update(id, owner, { title: fields.title, content: fields.body });
      return row ? send(response, 200, publicNote(row)) : notFound(response);
    }
    if (request.method === 'DELETE') {
      return (await db.remove(id, owner)) ? send(response, 204) : notFound(response);
    }
    response.setHeader('Allow', 'GET, PUT, DELETE');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED', message: '허용되지 않는 방법입니다.' });
  });

  return { collection, item };
}

function supabaseDb(client) {
  const columns = 'id,title,content';
  const fail = error => { if (error) throw new Error('db_error'); };
  return {
    async list(ownerId) {
      const { data, error } = await client.from('notes').select(columns)
        .eq('owner_id', ownerId).order('created_at', { ascending: true });
      fail(error);
      return data;
    },
    async insert(row) {
      const { error } = await client.from('notes').insert(row);
      if (error?.code === '23505') return false;
      fail(error);
      return true;
    },
    async get(id, ownerId) {
      const { data, error } = await client.from('notes').select(columns)
        .eq('id', id).eq('owner_id', ownerId).maybeSingle();
      fail(error);
      return data;
    },
    // patch에는 owner_id를 넣지 않습니다. 기존 행의 소유자도 조건으로 다시 확인합니다.
    async update(id, ownerId, patch) {
      const { data, error } = await client.from('notes').update(patch)
        .eq('id', id).eq('owner_id', ownerId).select(columns);
      fail(error);
      return data[0] ?? null;
    },
    async remove(id, ownerId) {
      const { data, error } = await client.from('notes').delete()
        .eq('id', id).eq('owner_id', ownerId).select('id');
      fail(error);
      return data.length > 0;
    },
  };
}

let runtime;
// 서버 전용 키는 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
export function getNotesApi() {
  if (!runtime) {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const url = process.env.SUPABASE_URL;
    const client = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    runtime = createNotesApi({
      verify: createLoginVerifier({ config, supabaseSecretKey: secretKey }),
      db: supabaseDb(client),
    });
  }
  return runtime;
}
