// exfiltration 판정: 이 파일 하나만으로 동작한다. 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않는다.
// 아래 PATTERNS 는 patterns.json 의 patterns 와 같은 내용이다(variants.test.mjs 가 둘이 같은지 확인한다).
// 명확한 자료 유출은 block, 애매한 건 alert, 정상 이벤트는 record 로 나눈다. 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 이다.
const PATTERNS = [
  {
    "id": "high-severity",
    "name": "높은 위험도의 자료 유출 경보",
    "when": {
      "minLevel": 10
    },
    "evidence": "Wazuh 위험도 10 이상의 외부 전송 경보는 명확한 자료 유출 시도로 봅니다.",
    "confidence": 0.9
  },
  {
    "id": "bulk-to-new-destination",
    "name": "처음 보는 목적지로 대용량 전송",
    "when": {
      "bytesAtLeast": 20000000,
      "textAny": [
        "처음 보는",
        "외부 주소"
      ]
    },
    "evidence": "처음 보는 목적지나 외부 주소로 2천만 바이트 이상이 나가면 평소 업무로 보기 어려운 유출(T1048)입니다.",
    "confidence": 0.97
  },
  {
    "id": "off-hours-bulk",
    "name": "업무 시간 밖의 대용량 반출",
    "when": {
      "bytesAtLeast": 20000000,
      "textAny": [
        "업무 시간 밖",
        "수업 시간 밖"
      ]
    },
    "evidence": "평소 일하지 않는 시각에 대용량 파일이 나가면 계정을 도용한 반출일 가능성이 높습니다.",
    "confidence": 0.95
  },
  {
    "id": "repeated-bulk",
    "name": "같은 목적지로 대용량 반복 전송",
    "when": {
      "bytesAtLeast": 50000000,
      "countAtLeast": 5
    },
    "evidence": "같은 목적지로 5번 이상, 합쳐 5천만 바이트 이상이 반복해서 나가면 자료를 조금씩 빼내는 유출(T1041)입니다.",
    "confidence": 0.95
  },
  {
    "id": "mass-files-out",
    "name": "파일 100건 이상의 한꺼번에 반출",
    "when": {
      "bytesAtLeast": 20000000,
      "filesAtLeast": 100
    },
    "evidence": "파일 100건 이상이 한꺼번에 2천만 바이트 넘게 나가면 자료실을 통째로 복사한 것입니다.",
    "confidence": 0.95
  },
  {
    "id": "unusual-port-bulk",
    "name": "평소 쓰지 않던 통로의 대용량 전송",
    "when": {
      "bytesAtLeast": 20000000,
      "textAny": [
        "평소에 쓰지 않던 포트"
      ]
    },
    "evidence": "평소 쓰지 않던 포트로 대용량이 나가면 다른 프로토콜로 몰래 빼내는 유출(T1048)입니다.",
    "confidence": 0.95
  },
  {
    "id": "command-channel-bulk",
    "name": "명령 통로의 대용량 전송",
    "when": {
      "bytesAtLeast": 20000000,
      "textAny": [
        "명령 통로"
      ]
    },
    "evidence": "원격 명령 통로로 대용량 파일이 나가면 명령 통로를 통한 유출(T1041)입니다.",
    "confidence": 0.93
  },
  {
    "id": "unfamiliar-destination",
    "name": "처음 보는 목적지",
    "when": {
      "textAny": [
        "처음 보는 주소",
        "처음 보는 목적지",
        "처음 봅니다"
      ]
    },
    "evidence": "처음 보는 목적지지만 전송량이 작거나 실패했다면 유출이라 단정하기 어려워 사람이 확인합니다.",
    "confidence": 0.6
  },
  {
    "id": "moderate-transfer",
    "name": "평소보다 큰 전송",
    "when": {
      "bytesAtLeast": 5000000
    },
    "evidence": "5백만 바이트 이상의 전송이지만 이상한 맥락이 없으면 정상 백업일 수 있어 사람이 확인합니다.",
    "confidence": 0.6
  },
  {
    "id": "mid-severity",
    "name": "중간 위험도 경보",
    "when": {
      "minLevel": 5
    },
    "evidence": "위험도 5~9 경보는 유출이라 단정하기 어려워 사람이 확인합니다.",
    "confidence": 0.55
  }
];

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 숫자 필드(문자열로 와도 됨)를 읽는다. 없거나 숫자가 아니면 0 으로 본다(정상값으로 채우는 것이 아니라 "큰 값이 아니다"로 본다).
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function featuresOf(alert) {
  const data = alert && typeof alert === 'object' && alert.data && typeof alert.data === 'object' ? alert.data : {};
  return {
    level: Number(alert?.rule?.level) || 0,
    description: typeof alert?.rule?.description === 'string' ? alert.rule.description : '',
    bytes: num(data.bytes ?? data.bytes_out ?? data.size),
    files: num(data.files ?? data.file_count),
    count: num(data.count),
  };
}

// 조건은 적힌 것이 모두 맞아야 한다(AND). 목적지 주소 같은 값은 판단에 쓰지 않는다.
function matches(when, f) {
  if (when.minLevel !== undefined && !(f.level >= when.minLevel)) return false;
  if (when.bytesAtLeast !== undefined && !(f.bytes >= when.bytesAtLeast)) return false;
  if (when.filesAtLeast !== undefined && !(f.files >= when.filesAtLeast)) return false;
  if (when.countAtLeast !== undefined && !(f.count >= when.countAtLeast)) return false;
  if (when.textAny && !when.textAny.some((text) => f.description.includes(text))) return false;
  return true;
}

function toAction(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 경보 하나를 받아 { action, confidence, reason } 을 바로 돌려준다. 파일·네트워크·다른 모듈을 쓰지 않고 혼자 계산한다.
// reason 에는 근거 패턴 이름만 적고, 주소·전송량 같은 경보의 값은 담지 않는다.
export function decide(alert) {
  const f = featuresOf(alert);
  const hits = PATTERNS.filter((pattern) => matches(pattern.when, f)).sort((a, b) => b.confidence - a.confidence);
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '위험도가 낮고 자료 유출 형태 없음' };
  let confidence = hits[0].confidence;
  // 서로 다른 강한 신호(확신도 0.85 이상, 위험도 바닥 기준 제외)가 둘 이상 겹치면 조금 더 뚜렷하다.
  const strong = hits.filter((pattern) => pattern.confidence >= BLOCK_AT && pattern.id !== 'high-severity').length;
  if (strong > 1 && confidence < 0.99) confidence = Math.min(0.99, confidence + 0.02);
  return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: hits[0].name };
}
