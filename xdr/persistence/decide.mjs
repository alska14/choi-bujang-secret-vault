// persistence 판정: 이 파일 하나만으로 동작한다. 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않는다.
// 아래 PATTERNS 는 patterns.json 의 patterns 와 같은 내용이다(variants.test.mjs 가 둘이 같은지 확인한다).
// 명확한 지속성 확보는 block, 애매한 건 alert, 정상 이벤트는 record 로 나눈다. 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 이다.
const PATTERNS = [
  {
    "id": "high-severity",
    "name": "높은 위험도의 지속성 경보",
    "when": {
      "minLevel": 10
    },
    "evidence": "Wazuh 위험도 10 이상의 서비스·예약 작업·시작 폴더 경보는 명확한 지속성 확보 시도로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "unsigned-service",
    "name": "서명 없는 서비스 등록·변경",
    "when": {
      "textAny": [
        "서명 없는",
        "서명이 없습니다"
      ]
    },
    "evidence": "서명 없는 서비스가 새로 등록되거나 실행 파일이 바뀌면 다시 켜도 살아남으려는 시스템 프로세스 변경(T1543)의 전형입니다.",
    "confidence": 0.95
  },
  {
    "id": "unfamiliar-scheduled-task",
    "name": "낯선 예약 작업",
    "when": {
      "textAny": [
        "처음 보는 예약 작업",
        "예약 작업 이름이 임의 문자열"
      ]
    },
    "evidence": "처음 보는 예약 작업이나 이름이 임의 문자열인 예약 작업은 정해진 때마다 다시 실행되도록 심는 예약 작업(T1053)의 전형입니다.",
    "confidence": 0.93
  },
  {
    "id": "startup-folder-addition",
    "name": "시작 폴더 변경",
    "when": {
      "textAny": [
        "시작 폴더에 평소 목록에 없는",
        "시작 프로그램과 예약 작업이 같은"
      ]
    },
    "evidence": "시작 폴더에 평소 목록에 없는 프로그램이 추가되거나 시작 프로그램과 예약 작업이 같은 파일을 가리키면 재시작 때 자동 실행을 노린 것입니다.",
    "confidence": 0.93
  },
  {
    "id": "survives-reboot",
    "name": "다시 켜도 남도록 등록된 새 서비스",
    "when": {
      "textAny": [
        "다시 켜도 남도록"
      ]
    },
    "evidence": "평소 목록에 없는 서비스가 다시 켜도 남도록 등록되면 지속성 확보가 목적입니다.",
    "confidence": 0.93
  },
  {
    "id": "temp-executable",
    "name": "임시 폴더의 실행 파일",
    "when": {
      "pathIn": "temp"
    },
    "evidence": "임시 폴더에 있는 실행 파일은 흔한 은닉 위치지만 그것만으로는 지속성 확보라고 단정하기 어렵습니다.",
    "confidence": 0.6
  },
  {
    "id": "startup-path",
    "name": "시작 폴더 경로의 파일",
    "when": {
      "pathIn": "startup"
    },
    "evidence": "시작 폴더 경로의 파일은 로그인 때마다 실행되므로 사람이 확인합니다.",
    "confidence": 0.7
  },
  {
    "id": "signature-unconfirmed",
    "name": "서명을 아직 확인하지 못한 항목",
    "when": {
      "textAny": [
        "서명은 확인되지 않았습니다",
        "서명은 아직 모릅니다"
      ]
    },
    "evidence": "서명이 없다고 확인된 것이 아니라 아직 확인하지 못한 항목은 공격이라 단정하기 어려워 사람이 확인합니다.",
    "confidence": 0.55
  },
  {
    "id": "mid-severity",
    "name": "중간 위험도 경보",
    "when": {
      "minLevel": 5
    },
    "evidence": "위험도 5~9 경보는 지속성 확보라 단정하기 어려워 사람이 확인합니다.",
    "confidence": 0.55
  }
];

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 임시 폴더와 시작 폴더 경로의 모양. 경로 값은 판단에만 쓰고 결과에 담지 않는다.
const TEMP_PATH = /(?:^|[\\/])(?:temp|tmp)(?:[\\/]|$)/iu;
const STARTUP_PATH = /[\\/]start menu[\\/]programs[\\/]startup[\\/]/iu;

// 경보의 data 안 문자열(깊이 3까지)을 모은다.
function stringsOf(alert) {
  const out = [];
  const walk = (value, depth) => {
    if (typeof value === 'string') out.push(value);
    else if (depth < 3 && value && typeof value === 'object') {
      for (const child of Object.values(value)) walk(child, depth + 1);
    }
  };
  if (alert && typeof alert === 'object') {
    walk(alert.data, 0);
    if (typeof alert.full_log === 'string') out.push(alert.full_log);
  }
  return out;
}

function featuresOf(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number(alert?.rule?.level) || 0;
  const pathKinds = new Set();
  for (const text of stringsOf(alert)) {
    if (TEMP_PATH.test(text)) pathKinds.add('temp');
    if (STARTUP_PATH.test(text)) pathKinds.add('startup');
  }
  return { level, description, pathKinds };
}

function matches(when, f) {
  if (when.minLevel !== undefined && !(f.level >= when.minLevel)) return false;
  if (when.textAny && !when.textAny.some((text) => f.description.includes(text))) return false;
  if (when.pathIn !== undefined && !f.pathKinds.has(when.pathIn)) return false;
  return true;
}

function toAction(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 경보 하나를 받아 { action, confidence, reason } 을 바로 돌려준다. 파일·네트워크·다른 모듈을 쓰지 않고 혼자 계산한다.
// reason 에는 근거 패턴 이름만 적고, 경로 같은 경보의 값은 담지 않는다.
export function decide(alert) {
  const f = featuresOf(alert);
  const hits = PATTERNS.filter((pattern) => matches(pattern.when, f)).sort((a, b) => b.confidence - a.confidence);
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '위험도가 낮고 지속성 확보 형태 없음' };
  let confidence = hits[0].confidence;
  // 서로 다른 강한 신호(확신도 0.85 이상, 위험도 바닥 기준 제외)가 둘 이상 겹치면 조금 더 뚜렷하다.
  const strong = hits.filter((pattern) => pattern.confidence >= BLOCK_AT && pattern.id !== 'high-severity').length;
  if (strong > 1 && confidence < 0.99) confidence = Math.min(0.99, confidence + 0.02);
  return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: hits[0].name };
}
