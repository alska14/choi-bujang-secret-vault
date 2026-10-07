// 단독으로 동작하는 판정 모듈: 다른 파일을 불러오거나 읽지 않는다. (격리된 환경에서 이 파일만 실행돼도 동작하도록)
// 패턴 정의는 patterns.json 과 같은 내용이며, variants.test.mjs 가 둘이 같은지 확인한다.
export const PATTERNS = [
  {
    "id": "high-severity",
    "name": "높은 위험도의 웹 주입 경보",
    "when": {
      "minLevel": 10
    },
    "evidence": "Wazuh 위험도 10 이상의 웹 접근 경보는 명확한 주입 시도로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "repeated-sql",
    "name": "SQL 구문 반복 주입",
    "when": {
      "minCount": 5,
      "textAny": [
        "SQL",
        "데이터베이스 조회",
        "select"
      ]
    },
    "evidence": "요청 인자 안의 SQL 구문 표기가 같은 주소에서 5번 이상 반복되면 사람이 입력한 검색어가 아닙니다.",
    "confidence": 0.93
  },
  {
    "id": "repeated-script",
    "name": "스크립트 태그 반복 삽입",
    "when": {
      "minCount": 5,
      "textAny": [
        "스크립트 삽입",
        "스크립트 표식",
        "스크립트 표기"
      ]
    },
    "evidence": "스크립트 삽입 표기가 5번 이상 반복되면 화면에 코드를 심으려는 시도입니다.",
    "confidence": 0.93
  },
  {
    "id": "path-traversal",
    "name": "경로 거슬러 올라가기 반복",
    "when": {
      "minCount": 5,
      "textAny": [
        "거슬러",
        "경로 이탈",
        "../"
      ]
    },
    "evidence": "경로를 위로 거슬러 오르는 표기가 5번 이상 반복되면 다른 폴더의 파일을 읽으려는 시도입니다.",
    "confidence": 0.92
  },
  {
    "id": "command-separator",
    "name": "명령 구분자 연속 삽입",
    "when": {
      "minCount": 5,
      "textAny": [
        "명령 구분자",
        "명령문"
      ]
    },
    "evidence": "명령 구분자 표기가 연속 요청에 5번 이상 있으면 서버 명령을 이어 붙이려는 시도입니다.",
    "confidence": 0.9
  },
  {
    "id": "repeated-marker",
    "name": "주입 표식 반복",
    "when": {
      "minCount": 5,
      "textAny": [
        "표기",
        "표식",
        "구문"
      ]
    },
    "evidence": "주입 표식이 같은 주소에서 5번 이상 반복되면 도구로 대량 시도한 것입니다.",
    "confidence": 0.88
  },
  {
    "id": "single-marker",
    "name": "주입처럼 보이는 표기 1건",
    "when": {
      "minLevel": 6,
      "textAny": [
        "주입",
        "따옴표",
        "구분 문자",
        "이상한 검색"
      ]
    },
    "evidence": "주입처럼 보이지만 반복이 없어 공격이라 단정하기 어렵습니다.",
    "confidence": 0.6
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
  const state = `보안 경보: ${description}${count === null ? '' : ` (반복 횟수 ${count})`}. 의심 패턴: ${pattern}`;
  const res = await fetchImpl(JEV_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      model: 'jev-latest',
      questions: { attack: { type: 'noul', instructions: '이 경보는 정상 사용자의 검색이 아니라 웹 주입(SQL·스크립트·경로 거슬러 올라가기) 공격이다.' } },
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
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '위험도가 낮고 주입 반복 패턴 없음' };

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
