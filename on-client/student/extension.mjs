// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

const DEVICE_LABEL = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_LABEL = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_LABEL = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };

// 알 수 없는 값은 정상으로 바꾸지 않고 확인 불가로 둔다.
// 한글 설명 옆에 서버가 준 원래 상태 코드를 괄호로 함께 보여 준다. 값이 없으면 코드는 unknown 으로 적는다.
const raw = (status) => (typeof status === 'string' && status ? status : 'unknown');
const deviceText = (status) => `${DEVICE_LABEL[status] ?? DEVICE_LABEL.unknown} (${raw(status)})`;
const sessionText = (status) => `${SESSION_LABEL[status] ?? SESSION_LABEL.unknown} (${raw(status)})`;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

// 정상이 아닌 상태는 색이 아니라 글자로 구분한다.
function row(name, value, abnormal) {
  const item = node('li', null, abnormal ? 'identity-row identity-warning' : 'identity-row');
  item.append(node('strong', `${name}: `), node('span', value));
  return item;
}

function modeNotice(mode) {
  return MODE_LABEL[mode] ? node('p', MODE_LABEL[mode], 'identity-mode') : null;
}

function renderIdentity({ me, devices, sessions } = {}) {
  const root = node('div', null, 'student-identity');
  const notice = modeNotice(me?.mode);
  if (notice) root.append(notice);

  if (!me || me.status === 'loading') {
    root.append(node('p', '불러오는 중', 'identity-loading'));
    return root;
  }
  if (me.status === 'error') {
    // 이전 사용자 값은 남기지 않고 실패만 보여 준다.
    const message = me.error && me.error.message ? me.error.message : '확인 불가';
    root.append(node('p', `연결 실패: ${message}`, 'identity-error'));
    return root;
  }
  if (me.status !== 'ok' || !me.data) {
    root.append(node('p', '확인 불가', 'identity-error'));
    return root;
  }

  const { user, device, session } = me.data;
  const list = node('ul', null, 'identity-list');
  list.append(
    row('사용자', (user && (user.label || user.id)) || '확인 불가', false),
    row('현재 기기', `${(device && (device.label || device.id)) || '확인 불가'} · ${deviceText(device && device.status)}`, !device || device.status !== 'compliant'),
    row('로그인 세션', `${(session && session.id) || '확인 불가'} · ${sessionText(session && session.status)}`, !session || session.status !== 'active'),
  );
  root.append(list);

  root.append(listSection('내 기기', devices, (d) => `${d.label || d.id} · ${deviceText(d.status)}`));
  root.append(listSection('내 세션', sessions, (s) => `${s.id} · ${sessionText(s.status)}`));
  return root;
}

// 기기·세션 목록은 자기 상태를 따로 가진다. 한쪽 실패가 다른 쪽이나 사용자 표시를 지우지 않는다.
function listSection(title, resource, describe) {
  const section = node('div', null, 'identity-section');
  section.append(node('h4', title));
  if (!resource || resource.status === 'loading') {
    section.append(node('p', '불러오는 중'));
  } else if (resource.status === 'error') {
    section.append(node('p', `연결 실패: ${(resource.error && resource.error.message) || '확인 불가'}`, 'identity-error'));
  } else if (resource.status !== 'ok' || !Array.isArray(resource.data)) {
    section.append(node('p', '확인 불가'));
  } else if (resource.data.length === 0) {
    section.append(node('p', '표시할 항목이 없습니다.'));
  } else {
    const list = node('ul', null, 'identity-list');
    for (const item of resource.data) list.append(node('li', describe(item)));
    section.append(list);
  }
  const notice = modeNotice(resource && resource.mode);
  if (notice) section.append(notice);
  return section;
}

// ---------- 14단계: 업무 앱 접근 요청 결과 ----------
const DECISION_LABEL = {
  allow: '접근 허용',
  deny: '접근 거부',
  challenge: '추가 인증 또는 확인 필요',
  unknown: '판정 확인 불가',
};
const DECISION_NOTE = {
  allow: '정책상 접근 허용이라는 뜻이며 실제 앱 접속 성공을 보장하지 않습니다.',
  deny: '정책에 따라 접근이 거부되었습니다.',
  challenge: '추가 확인이 필요합니다. 이 앱은 추가 인증을 대신 수행하지 않습니다.',
  unknown: '판정을 확인할 수 없습니다. 접근이 허용되지 않은 것으로 다룹니다.',
};

function formatChecked(value) {
  if (typeof value !== 'string' || !value) return '시각 정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.toLocaleString('ko-KR')} (${value})`;
}

// 알 수 없는 decision 은 허용으로 보이지 않게 unknown 으로 처리한다. 원래 값은 그대로 함께 적는다.
function renderDecision({ status, mode, data, error, appId } = {}) {
  const root = node('div', null, 'student-decision');
  if (MODE_LABEL[mode]) root.append(node('p', MODE_LABEL[mode], 'decision-mode'));

  if (status === 'idle' || status == null) {
    root.append(node('p', '앱을 골라 접속을 요청하세요', 'decision-idle'));
    return root;
  }
  if (status === 'loading') {
    root.append(node('p', '판정 확인 중', 'decision-loading'));
    return root;
  }
  if (status === 'error') {
    // 요청 실패는 접근 판정이 아니다. 이전 판정 값은 남기지 않는다.
    const message = error && error.message ? error.message : '확인 불가';
    root.append(
      node('p', `요청 실패: ${message}`, 'decision-error'),
      node('p', '요청이 실패한 것이며 접근 거부 판정이 아닙니다. 접근이 허용되었다는 뜻도 아닙니다.', 'decision-note'),
    );
    return root;
  }
  if (status !== 'ok' || !data) {
    root.append(node('p', '판정 확인 불가(unknown). 접근이 허용되지 않은 것으로 다룹니다.', 'decision-unknown'));
    return root;
  }

  const known = Object.prototype.hasOwnProperty.call(DECISION_LABEL, data.decision);
  const code = known ? data.decision : 'unknown';
  const list = node('ul', null, 'decision-list');
  list.append(
    row('대상 앱', data.appId || appId || '확인 불가', false),
    row('판정', `${DECISION_LABEL[code]} (${known ? data.decision : 'unknown'})`, code !== 'allow'),
    row('이유', typeof data.reason === 'string' && data.reason ? data.reason : '이유 정보 없음', false),
    row('판정 시각', formatChecked(data.checkedAt), false),
  );
  root.append(list, node('p', DECISION_NOTE[code], 'decision-note'));
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
