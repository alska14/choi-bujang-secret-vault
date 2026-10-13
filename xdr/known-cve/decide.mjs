// known-cve 판정: 이 파일 하나만으로 동작한다. 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않는다.
// 아래 PATTERNS 는 patterns.json 의 patterns 와 같은 내용이다(variants.test.mjs 가 둘이 같은지 확인한다).
// 명확한 공격은 block, 애매한 건 alert, 정상 이벤트는 record 로 나눈다. 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 이다.
// 경보의 조회 구문은 문서용 표기이며, 이 파일은 그 문자열을 찾기만 하고 만들거나 바꾸거나 다른 곳에 보내지 않는다.
const PATTERNS = [
  {
    "id": "high-severity",
    "name": "높은 위험도의 취약점 악용 경보",
    "when": {
      "minLevel": 10
    },
    "evidence": "Wazuh 위험도 10 이상의 알려진 취약점 경보는 명확한 악용 시도로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "lookup-in-header",
    "name": "머리글 안의 원격 조회 구문",
    "when": {
      "lookupIn": "header"
    },
    "evidence": "요청 머리글(user-agent 등)에 jndi 형태의 원격 조회 구문이 있으면 CVE-2021-44228 악용의 전형입니다.",
    "confidence": 0.97
  },
  {
    "id": "lookup-in-argument",
    "name": "요청 인자 안의 원격 조회 구문",
    "when": {
      "lookupIn": "argument"
    },
    "evidence": "주소·검색어 같은 요청 인자에 jndi 형태의 원격 조회 구문이 있으면 취약한 로그 기록기를 노린 요청입니다.",
    "confidence": 0.95
  },
  {
    "id": "cve-form-described",
    "name": "CVE-2021-44228 형태로 설명된 요청",
    "when": {
      "textAny": [
        "CVE-2021-44228 형태"
      ]
    },
    "evidence": "경보 설명이 요청을 CVE-2021-44228 형태라고 밝히면 악용 시도로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "scanner-trace",
    "name": "알려진 취약점 점검 도구의 흔적",
    "when": {
      "scanner": true
    },
    "evidence": "알려진 취약점 점검 도구의 이름이나 표지가 있으면 탐색 단계의 시도지만 악용이라 단정하기는 어렵습니다.",
    "confidence": 0.6
  },
  {
    "id": "cve-name-only",
    "name": "취약점 이름이나 단어만 있는 요청",
    "when": {
      "nameOnly": true
    },
    "evidence": "취약점 이름이나 jndi 같은 단어만 있고 조회 구문이 없으면 수업 자료 검색일 수 있어 사람이 확인합니다.",
    "confidence": 0.55
  },
  {
    "id": "mid-severity",
    "name": "중간 위험도 경보",
    "when": {
      "minLevel": 5
    },
    "evidence": "위험도 5~9 경보는 악용이라 단정하기 어려워 사람이 확인합니다.",
    "confidence": 0.55
  }
];

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 요청 머리글로 보는 필드 이름. 그 밖의 문자열 필드(주소, 검색어, 본문 등)는 요청 인자로 본다.
const HEADER_KEYS = /user-?agent|referer|referrer|header|cookie|accept|authorization|x-[a-z-]+/iu;
// 원격 조회 구문(jndi 형태)을 찾는 모양. 조회 방식 이름과 뒤따르는 구분 문자를 함께 본다. 문자열을 만들거나 바꾸지 않고 찾기만 한다.
const LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|nis|corba|https?)\s*:/iu;
const SCANNER = /\b(?:nuclei|log4j-?scan|log4shell-?scan|interactsh|zgrab|masscan)\b|[?&]probe=/iu;
const CVE_NAME = /CVE-2021-44228|\bjndi\b|\blog4j\b|\blog4shell\b/iu;

// 경보의 data 안 문자열(깊이 3까지)을 [필드 이름, 값]으로 모은다. 값은 판단에만 쓰고 결과에 담지 않는다.
function fieldsOf(alert) {
  const out = [];
  const walk = (value, key, depth) => {
    if (typeof value === 'string') out.push([key, value]);
    else if (depth < 3 && value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey, depth + 1);
    }
  };
  if (alert && typeof alert === 'object') {
    walk(alert.data, '', 0);
    if (typeof alert.full_log === 'string') out.push(['full_log', alert.full_log]);
  }
  return out;
}

function featuresOf(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number(alert?.rule?.level) || 0;
  const fields = fieldsOf(alert);
  const lookupIn = new Set();
  for (const [key, text] of fields) {
    if (LOOKUP.test(text)) lookupIn.add(HEADER_KEYS.test(key) ? 'header' : 'argument');
  }
  if (LOOKUP.test(description)) lookupIn.add('argument');
  const all = [description, ...fields.map(([, text]) => text)].join(' ');
  return { level, description, lookupIn, scanner: SCANNER.test(all), nameOnly: lookupIn.size === 0 && CVE_NAME.test(all) };
}

function matches(when, f) {
  if (when.minLevel !== undefined && !(f.level >= when.minLevel)) return false;
  if (when.lookupIn !== undefined && !f.lookupIn.has(when.lookupIn)) return false;
  if (when.textAny && !when.textAny.some((text) => f.description.includes(text))) return false;
  if (when.scanner !== undefined && f.scanner !== when.scanner) return false;
  if (when.nameOnly !== undefined && f.nameOnly !== when.nameOnly) return false;
  return true;
}

function toAction(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 경보 하나를 받아 { action, confidence, reason } 을 바로 돌려준다. 파일·네트워크·다른 모듈을 쓰지 않고 혼자 계산한다.
// reason 에는 근거 패턴 이름만 적고, 요청의 값(조회 구문 등)은 담지 않는다.
export function decide(alert) {
  const f = featuresOf(alert);
  const hits = PATTERNS.filter((pattern) => matches(pattern.when, f)).sort((a, b) => b.confidence - a.confidence);
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '위험도가 낮고 악용 형태 없음' };
  let confidence = hits[0].confidence;
  // 머리글과 인자 양쪽에 겹쳐 있으면 조금 더 뚜렷하다.
  if (f.lookupIn.size > 1 && confidence < 0.99) confidence = Math.min(0.99, confidence + 0.02);
  return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: hits[0].name };
}
