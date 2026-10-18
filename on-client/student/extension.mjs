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

// ---------- 15단계: 접속 기록·XDR 경보 목록과 상세 ----------
const KIND_NAME = { access: '접속', xdr: 'XDR 경보' };
const ACCESS_STATE = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const ALL = 'all';

// 필터·상세 선택은 같은 파일 안에서만 둔다. 새 자료가 오면 모두 지운다.
const eventsUi = { signature: null, kind: ALL, app: ALL, access: ALL, selected: null };

const kindText = (kind) => `${KIND_NAME[kind] ?? '확인 불가'} (${raw(kind)})`;
const accessText = (value) => `${ACCESS_STATE[value] ?? '확인 불가'} (${raw(value)})`;
const appText = (appId) => (typeof appId === 'string' && appId ? appId : '앱 확인 불가 (appId 없음)');

function timeText(at) {
  if (typeof at !== 'string' || !at) return '시각 정보 없음';
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : `${date.toLocaleString('ko-KR')} (${at})`;
}

// 원본 배열은 고치지 않고 복사해 at 기준 최신순으로 정렬한다.
function newestFirst(data) {
  const time = (event) => { const value = Date.parse(event && event.at); return Number.isNaN(value) ? -Infinity : value; };
  return [...data].sort((a, b) => time(b) - time(a));
}

function filterSelect(id, label, options, current, onPick) {
  const wrap = node('div', null, 'events-filter');
  const labelNode = node('label', label);
  labelNode.htmlFor = id;
  const select = document.createElement('select');
  select.id = id;
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = current;
  select.addEventListener('change', () => onPick(select.value, id));
  wrap.append(labelNode, select);
  return wrap;
}

function listBlock(title, items, emptyText) {
  const block = node('div', null, 'events-detail-block');
  block.append(node('h5', title));
  if (!Array.isArray(items) || items.length === 0) {
    block.append(node('p', emptyText));
    return block;
  }
  const list = node('ul');
  for (const item of items) list.append(node('li', `${raw(item && item.id)}: ${(item && item.text) || '내용 없음'}`));
  block.append(list);
  return block;
}

function detailView(event) {
  const detail = node('div', null, 'events-detail');
  detail.dataset.studentEventDetail = event.id;
  const state = event.state || {};
  detail.append(
    node('h4', `${event.id} 상세`),
    node('p', `사건 ID: ${event.id}`),
    node('p', `업무 앱: ${appText(event.appId)}`),
    listBlock('근거(evidence)', event.evidence, '근거 정보 없음'),
    listBlock('규칙(rules)', event.rules, '규칙 정보 없음'),
  );
  const states = node('div', null, 'events-detail-block');
  states.append(node('h5', '상태'));
  const list = node('ul');
  list.append(
    node('li', `접속 상태(access): ${accessText(state.access)}`),
    node('li', `세션 상태(session): ${sessionText(state.session)}`),
    node('li', `기기 상태(device): ${deviceText(state.device)}`),
  );
  states.append(list);
  detail.append(states);
  return detail;
}

function drawEvents(root, events, focusId) {
  const uniq = (pick) => [...new Set(events.map(pick))];
  const sorted = newestFirst(events);
  const shown = sorted.filter((event) =>
    (eventsUi.kind === ALL || event.kind === eventsUi.kind)
    && (eventsUi.app === ALL || (event.appId ?? '') === eventsUi.app)
    && (eventsUi.access === ALL || (event.state && event.state.access) === eventsUi.access));
  if (eventsUi.selected && !shown.some((event) => event.id === eventsUi.selected)) eventsUi.selected = null;

  const redraw = (key) => (value, id) => { eventsUi[key] = value; drawEvents(root, events, id); };
  const filters = node('div', null, 'events-filters');
  filters.append(
    filterSelect('student-filter-kind', '기록 종류', [[ALL, '전체'], ...uniq((e) => e.kind).map((v) => [v, kindText(v)])], eventsUi.kind, redraw('kind')),
    filterSelect('student-filter-app', '업무 앱', [[ALL, '전체'], ...uniq((e) => e.appId ?? '').map((v) => [v, appText(v)])], eventsUi.app, redraw('app')),
    filterSelect('student-filter-access', '접속 상태', [[ALL, '전체'], ...uniq((e) => e.state && e.state.access).map((v) => [v, accessText(v)])], eventsUi.access, redraw('access')),
  );

  const list = node('ul', null, 'events-list');
  for (const event of shown) {
    const item = node('li', null, 'events-row');
    item.dataset.studentEventId = event.id;
    item.append(node('span', `${event.id} · ${timeText(event.at)} · ${kindText(event.kind)} · ${appText(event.appId)} · ${event.summary ?? ''}`));
    const button = node('button', `${event.id} 상세`);
    button.type = 'button';
    button.setAttribute('aria-label', `${event.id} 상세`);
    button.setAttribute('aria-expanded', String(eventsUi.selected === event.id));
    button.dataset.focusKey = `detail-${event.id}`;
    button.addEventListener('click', () => {
      eventsUi.selected = eventsUi.selected === event.id ? null : event.id;
      drawEvents(root, events, `detail-${event.id}`);
    });
    item.append(button);
    list.append(item);
  }

  const children = [
    node('p', `전체 ${events.length}건 중 ${shown.length}건 표시 (본인의 최근 기록 범위이며 전체 직원 이력이 아닙니다)`, 'events-count'),
    filters,
    shown.length ? list : node('p', '선택한 조건에 맞는 기록이 없습니다.', 'events-none'),
  ];
  const selected = shown.find((event) => event.id === eventsUi.selected);
  if (selected) children.push(detailView(selected));
  root.replaceChildren(...children);
  if (focusId) {
    const target = [...root.querySelectorAll('select, button')].find((el) => el.id === focusId || el.dataset.focusKey === focusId);
    if (target) target.focus();
  }
}

function renderEvents({ status, mode, data, error } = {}) {
  const root = node('div', null, 'student-events');
  // 새 자료(다시 불러오기 포함)가 오면 이전 필터와 상세 선택을 지운다.
  const signature = JSON.stringify({ status, data: data ?? null, error: error ?? null });
  if (signature !== eventsUi.signature) {
    Object.assign(eventsUi, { signature, kind: ALL, app: ALL, access: ALL, selected: null });
  }
  if (MODE_LABEL[mode]) root.append(node('p', MODE_LABEL[mode], 'events-mode'));

  if (status === 'loading' || status == null) {
    root.append(node('p', '불러오는 중', 'events-loading'));
    return root;
  }
  if (status === 'error') {
    const message = error && error.message ? error.message : '확인 불가';
    root.append(node('p', error && error.code === 'CONTRACT_MISMATCH'
      ? `기록 확인 불가(CONTRACT_MISMATCH): ${message}`
      : `기록을 불러오지 못했습니다: ${message}`, 'events-error'));
    return root;
  }
  if (status !== 'ok' || !Array.isArray(data)) {
    root.append(node('p', '기록 확인 불가: 응답 형식을 확인할 수 없습니다.', 'events-error'));
    return root;
  }
  if (data.length === 0) {
    root.append(node('p', '표시할 기록이 없습니다.', 'events-empty'));
    return root;
  }
  const holder = node('div', null, 'events-body');
  drawEvents(holder, data, null);
  root.append(holder);
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
