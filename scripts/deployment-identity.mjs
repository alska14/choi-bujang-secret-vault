const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step) || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 aleph.config.json의 step을 확인하세요.');
  }
  const identity = {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  };
  // 단계가 올라가며 심판이 /aleph.json에서 읽는 값입니다. 비밀값은 없고, 설정에 있을 때만 옮겨 담습니다.
  if (config.identityProvider) identity.identityProvider = config.identityProvider;
  if (Array.isArray(config.allowedRoutes) && config.allowedRoutes.length) {
    identity.allowedRoutes = config.allowedRoutes;
  }
  if (config.originalApiUrl) {
    const original = new URL(config.originalApiUrl);
    if (original.protocol !== 'https:' || original.username || original.password
        || original.search || original.hash) {
      throw new Error('aleph.config.json의 originalApiUrl은 쿼리 없는 HTTPS 주소여야 합니다.');
    }
    identity.originalApiUrl = config.originalApiUrl;
  }
  if (config.restoreRoute) identity.restoreRoute = config.restoreRoute;
  return identity;
}
