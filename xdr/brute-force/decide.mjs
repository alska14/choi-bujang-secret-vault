import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './read-alerts.mjs';

const { patterns } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'patterns.json'), 'utf8'));

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const JEV_TIMEOUT_MS = 3000;

// Jev 연결점. 기본은 없음 → 애매한 경보는 alert 로 떨어진다. (실행기는 네트워크를 쓰지 않는다)
let askJev = null;
export function configureJev(fn) {
  askJev = typeof fn === 'function' ? fn : null;
}

function accountsMentioned(text) {
  const m = text.match(/계정\s*(\d+)개/);
  return m ? Number(m[1]) : 0;
}

function matches(when, a) {
  const failure = a.description.includes('실패');
  if (when.failure !== undefined && when.failure !== failure) return false;
  if (when.minCount !== undefined && !(a.count !== null && a.count >= when.minCount)) return false;
  if (when.accountsAtLeast !== undefined && accountsMentioned(a.description) < when.accountsAtLeast) return false;
  if (when.textAny && !when.textAny.some((t) => a.description.includes(t))) return false;
  return true;
}

function toAction(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

async function jevScore(a, hit) {
  if (!askJev) return null;
  try {
    const v = await Promise.race([
      askJev({ id: a.id, description: a.description, count: a.count, pattern: hit.id }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), JEV_TIMEOUT_MS)),
    ]);
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

export async function decide(alert) {
  const a = summarize(alert);
  const hits = patterns.filter((p) => matches(p.when, a)).sort((x, y) => y.confidence - x.confidence);
  if (hits.length === 0) return { action: 'record', confidence: 0.05, reason: '실패 반복 패턴 없음' };

  const hit = hits[0];
  let confidence = hit.confidence;
  let reason = hit.name;
  if (confidence < BLOCK_AT) {
    const jev = await jevScore(a, hit);
    if (jev !== null) {
      confidence = jev;
      reason = `${hit.name} (Jev 판단)`;
    }
  }
  return { action: toAction(confidence), confidence, reason };
}
