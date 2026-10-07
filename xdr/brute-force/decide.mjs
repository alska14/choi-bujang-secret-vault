// 단독으로 동작하는 판정 모듈: 다른 파일을 불러오거나 읽지 않는다. (격리된 환경에서 이 파일만 실행돼도 동작하도록)
// 패턴 정의는 patterns.json 과 같은 내용이며, variants.test.mjs 가 둘이 같은지 확인한다.
export const PATTERNS = [
  {
    "id": "high-severity",
    "name": "높은 위험도의 로그인 실패 경보",
    "when": {
      "minLevel": 10
    },
    "evidence": "Wazuh 위험도 10 이상의 로그인 계열 경보는 명확한 공격으로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "elevated-burst",
    "name": "위험도 9 + 반복 실패",
    "when": {
      "minLevel": 9,
      "failure": true,
      "minCount": 10
    },
    "evidence": "위험도 9 이상이면서 실패가 10건 이상 반복되면 공격으로 봅니다.",
    "confidence": 0.88
  },
  {
    "id": "burst-failures",
    "name": "단시간 대량 실패",
    "when": {
      "failure": true,
      "minCount": 20
    },
    "evidence": "같은 주소·계정에서 짧은 시간에 로그인 실패 20건 이상은 사람이 넣는 양이 아닙니다.",
    "confidence": 0.95
  },
  {
    "id": "password-spraying",
    "name": "여러 계정에 같은 비밀번호",
    "when": {
      "textAny": [
        "같은 비밀번호"
      ]
    },
    "evidence": "한 주소가 여러 계정에 같은 비밀번호를 넣는 것은 비밀번호 스프레이의 전형입니다.",
    "confidence": 0.92
  },
  {
    "id": "many-accounts",
    "name": "계정 다수 동시 시도",
    "when": {
      "failure": true,
      "accountsAtLeast": 5
    },
    "evidence": "계정 5개 이상을 한 번에 시도하면 정상 로그인 실수로 보기 어렵습니다.",
    "confidence": 0.9
  },
  {
    "id": "incremental-guess",
    "name": "비밀번호 한 글자씩 변경",
    "when": {
      "failure": true,
      "textAny": [
        "한 글자씩",
        "사전",
        "목록을 돌려",
        "계정 이름을 바꿔"
      ]
    },
    "evidence": "비밀번호를 한 글자씩 바꿔 넣는 것은 자동 대입 도구의 모양입니다.",
    "confidence": 0.9
  },
  {
    "id": "fail-then-success",
    "name": "실패 뒤 성공",
    "when": {
      "failure": true,
      "minCount": 4,
      "textAny": [
        "성공"
      ]
    },
    "evidence": "실패가 이어진 뒤 성공한 것은 뚫렸을 수도, 단순 오타일 수도 있어 사람이 봐야 합니다.",
    "confidence": 0.6
  },
  {
    "id": "low-volume-failures",
    "name": "소량 반복 실패",
    "when": {
      "failure": true,
      "minCount": 3
    },
    "evidence": "실패 3건 이상이지만 양이 적어 공격이라 단정하기 어렵습니다.",
    "confidence": 0.55
  },
  {
    "id": "mid-severity",
    "name": "중간 위험도 경보",
    "when": {
      "minLevel": 5
    },
    "evidence": "위험도 5~9 경보는 공격이라 단정하긴 어려워 사람이 확인합니다.",
    "confidence": 0.55
  }
];

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const JEV_TIMEOUT_MS = 3000;
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// 비밀값(비밀번호·토큰·키)처럼 보이는 필드는 읽지 않는다. 필드 모양이 조금 달라도 읽도록 후보를 모은다.
export function summarize(alert) {
  const a = alert && typeof alert === 'object' ? alert : {};
  const data = a.data && typeof a.data === 'object' ? a.data : {};
  const text = [a.rule?.description, a.description, a.full_log, a.message, data.title, data.message]
    .filter((v) => typeof v === 'string').join(' ');
  const field = data.count ?? data.failures ?? data.attempts;
  const fromText = Number((text.match(/(\d+)\s*(?:건|회|번)/) ?? [])[1]);
  const n = field !== undefined ? Number(field) : fromText;
  const accounts = Array.isArray(data.accounts) ? data.accounts.length
    : typeof data.accounts === 'string' ? data.accounts.split(',').filter(Boolean).length : 0;
  return {
    id: a.id,
    time: a.timestamp ?? a.time ?? '',
    srcip: data.srcip ?? data.src_ip ?? '',
    user: data.srcuser ?? data.user ?? '',
    level: Number(a.rule?.level ?? a.level) || 0,
    description: text,
    count: Number.isFinite(n) ? n : null,
    accounts,
    mitre: a.rule?.mitre ?? [],
  };
}

// Jev(TypeSafe System One). 키는 환경변수 TYPESAFE_API_KEY 에서만 읽고, 없으면 null.
export async function askJev({ description, count, pattern }, { fetchImpl = globalThis.fetch, apiKey = globalThis.process?.env?.TYPESAFE_API_KEY } = {}) {
  if (!apiKey || typeof fetchImpl !== 'function') return null;
  const state = `보안 경보: ${description}${count === null ? '' : ` (실패 건수 ${count})`}. 의심 패턴: ${pattern}`;
  const res = await fetchImpl(JEV_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      model: 'jev-latest',
      questions: { attack: { type: 'noul', instructions: '이 경보는 정상 사용자의 실수가 아니라 무차별 대입 로그인 공격이다.' } },
    }),
  });
  if (!res.ok) return null;
  const v = (await res.json())?.answers?.attack?.noul;
  return typeof v === 'number' ? v : null;
}

let jevHook = askJev;
export function configureJev(fn) {
  jevHook = typeof fn === 'function' ? fn : null;
}

function accountsMentioned(text) {
  const m = text.match(/계정\s*(\d+)개/);
  return m ? Number(m[1]) : 0;
}

function matches(when, a) {
  const failure = a.description.includes('실패');
  if (when.failure !== undefined && when.failure !== failure) return false;
  if (when.minLevel !== undefined && !(a.level >= when.minLevel)) return false;
  if (when.minCount !== undefined && !(a.count !== null && a.count >= when.minCount)) return false;
  if (when.accountsAtLeast !== undefined && Math.max(accountsMentioned(a.description), a.accounts) < when.accountsAtLeast) return false;
  if (when.textAny && !when.textAny.some((t) => a.description.includes(t))) return false;
  return true;
}

function toAction(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

async function jevScore(a, hit) {
  if (!jevHook) return null;
  try {
    const v = await Promise.race([
      jevHook({ id: a.id, description: a.description, count: a.count, pattern: hit.id }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), JEV_TIMEOUT_MS)),
    ]);
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

export async function decide(alert) {
  const a = summarize(alert);
  const hits = PATTERNS.filter((p) => matches(p.when, a)).sort((x, y) => y.confidence - x.confidence);
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '위험도가 낮고 실패 반복 패턴 없음' };

  const hit = hits[0];
  let confidence = hit.confidence;
  let reason = hit.name;
  if (confidence < BLOCK_AT) {
    const jev = await jevScore(a, hit);
    // Jev 는 확신도를 올리는 데만 쓴다. 패턴이 이미 잡은 애매한 경보를 record 로 내리지는 않는다.
    if (jev !== null && jev > confidence) {
      confidence = jev;
      reason = `${hit.name} (Jev 판단)`;
    }
  }
  return { action: toAction(confidence), confidence, reason };
}
