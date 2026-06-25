const $ = (selector) => document.querySelector(selector);

const state = {
  loggedIn: false,
  about: null,
  profile: null,
  inbodyLogs: [],
  gameLinks: [],
  botLinks: [],
  summary: null,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(message) {
  const toast = $('#toast');

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add('show');

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmt(value, suffix = '') {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return `${value}${suffix}`;
}

function numOrEmpty(value) {
  return value === null || value === undefined ? '' : value;
}

function parsePositiveNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function calculateBmi(weightKg, heightCm) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) {
    return null;
  }

  const heightM = heightCm / 100;

  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function calculateBodyFatPercent(bodyFatKg, weightKg) {
  if (!Number.isFinite(bodyFatKg) || !Number.isFinite(weightKg) || bodyFatKg <= 0 || weightKg <= 0) {
    return null;
  }

  return Math.round((bodyFatKg / weightKg) * 1000) / 10;
}

function splitGraphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('ko', {
      granularity: 'grapheme',
    });

    return [...segmenter.segment(text)].map(({ segment }) => segment);
  }

  return Array.from(text);
}

function initHeroTyping() {
  const heading = $('.typing-heading');
  const title = heading?.querySelector('.typing-title');
  const caret = heading?.querySelector('.typing-caret');

  if (!heading || !title || !caret) {
    return;
  }

  const fullText = title.textContent ?? '';
  const shouldUseStatic =
    window.matchMedia('(max-width: 640px)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderStatic = () => {
    heading.classList.remove('is-typing');
    heading.classList.add('is-static');
    title.textContent = fullText;
  };

  if (shouldUseStatic) {
    renderStatic();
    return;
  }

  const titleWidth = title.scrollWidth;
  const caretWidth = caret.getBoundingClientRect().width || 0;
  const gapWidth = 6;

  if (titleWidth + caretWidth + gapWidth > heading.clientWidth) {
    renderStatic();
    return;
  }

  const graphemes = splitGraphemes(fullText);
  let index = 0;

  if (graphemes.length === 0) {
    renderStatic();
    return;
  }

  heading.classList.remove('is-static');
  heading.classList.add('is-typing');
  title.textContent = '';

  const typeNext = () => {
    title.textContent += graphemes[index];
    index += 1;

    if (index < graphemes.length) {
      const nextDelay = graphemes[index - 1] === ' ' ? 45 : 95;
      window.setTimeout(typeNext, nextDelay);
    }
  };

  window.setTimeout(typeNext, 200);
}

async function api(path, options = {}) {
  const { method = 'GET', body } = options;

  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : { ok: res.ok };

  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `요청 실패: ${res.status}`);
  }

  return data;
}

function getFormData(form) {
  const formData = new FormData(form);
  const output = {};

  for (const [key, value] of formData.entries()) {
    output[key] = String(value).trim();
  }

  return output;
}

function setLoggedIn(loggedIn) {
  state.loggedIn = loggedIn;
  document.body.classList.toggle('is-admin', loggedIn);
}

function switchMainTab(tabName, options = {}) {
  const { updateHash = true } = options;

  document.querySelectorAll('.main-tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mainTab === tabName);
  });

  document.querySelectorAll('.main-page').forEach((page) => {
    page.classList.toggle('active', page.id === tabName);
  });

  if (updateHash) {
    history.replaceState(null, '', `#${tabName}`);
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });
}

function switchHealthTab(tabName) {
  document.querySelectorAll('.health-tabs .tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('#health .tab-page').forEach((page) => {
    page.classList.toggle('active', page.id === tabName);
  });

  if (!document.getElementById('health')?.classList.contains('active')) {
    switchMainTab('health');
  }
}

function sortAscByDate(rows) {
  return [...rows].sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    return dateCompare || Number(a.id || 0) - Number(b.id || 0);
  });
}

function drawLineChart(canvas, rows, valueKey, suffix = '') {
  if (!canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const points = sortAscByDate(rows)
    .map((row) => ({
      date: row.date,
      value: Number(row[valueKey]),
    }))
    .filter((point) => Number.isFinite(point.value));

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui, sans-serif';

  if (points.length === 0) {
    ctx.fillText('아직 기록이 없습니다.', 28, 46);
    return;
  }

  const padding = 42;
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);

  const minSpanByKey = {
    weightKg: 5,
    bodyFatPercent: 8,
    muscleKg: 4,
    bmi: 3,
  };

  const minSpan = minSpanByKey[valueKey] || 1;

  if (min === max) {
    min -= minSpan / 2;
    max += minSpan / 2;
  } else {
    const center = (min + max) / 2;
    const span = Math.max(max - min, minSpan);
    min = center - span / 2;
    max = center + span / 2;
  }

  const xFor = (index) => {
    if (points.length === 1) {
      return width / 2;
    }

    return padding + (index / (points.length - 1)) * (width - padding * 2);
  };

  const yFor = (value) => {
    return height - padding - ((value - min) / (max - min)) * (height - padding * 2);
  };

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i += 1) {
    const y = padding + i * ((height - padding * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  ctx.fillStyle = '#e5e7eb';

  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const latest = points.at(-1);

  ctx.fillStyle = '#e5e7eb';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`${latest.value}${suffix}`, padding, 30);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px system-ui, sans-serif';

  points.forEach((point, index) => {
    const x = xFor(index);
    const label = String(point.date || '').slice(5);
    ctx.fillText(label, x - 12, height - 14);
  });
}

function formatChartDateLabel(dateText) {
  const [year, month, day] = String(dateText || '').split('-');

  if (!year || !month || !day) {
    return String(dateText || '');
  }

  return `${month}-${day}`;
}

function formatAxisValue(value, suffix = '') {
  if (!Number.isFinite(value)) {
    return '';
  }

  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);

  return `${text}${suffix}`;
}

function ensureChartShell(canvas) {
  const existingShell = canvas.closest('.chart-shell');

  if (existingShell) {
    return {
      shell: existingShell,
      yAxis: existingShell.querySelector('.chart-y-axis'),
      plot: existingShell.querySelector('.chart-plot'),
      xAxis: existingShell.querySelector('.chart-x-axis'),
    };
  }

  const shell = document.createElement('div');
  shell.className = 'chart-shell';

  const yAxis = document.createElement('div');
  yAxis.className = 'chart-y-axis';

  const plot = document.createElement('div');
  plot.className = 'chart-plot';

  const xAxis = document.createElement('div');
  xAxis.className = 'chart-x-axis';

  canvas.parentNode.insertBefore(shell, canvas);
  plot.appendChild(canvas);

  shell.appendChild(yAxis);
  shell.appendChild(plot);
  shell.appendChild(xAxis);

  return {
    shell,
    yAxis,
    plot,
    xAxis,
  };
}

function prepareChartCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const cssWidth = Math.max(
    1,
    Math.round(rect.width || canvas.clientWidth || canvas.width || 300),
  );

  const cssHeight = Math.max(
    1,
    Math.round(rect.height || canvas.clientHeight || canvas.height || 220),
  );

  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    width: cssWidth,
    height: cssHeight,
  };
}

function drawMetricLineChart(canvas, rows, valueKey, options = {}) {
  if (!canvas) {
    return;
  }

  const {
    suffix = '',
    minRange = 1,
  } = options;

  const {
    yAxis,
    xAxis,
  } = ensureChartShell(canvas);

  const {
    ctx,
    width,
    height,
  } = prepareChartCanvas(canvas);

  ctx.clearRect(0, 0, width, height);

  // 최신 5개만 표시.
  // 정렬은 오래된 날짜 → 최신 날짜 순서로 유지해서 그래프가 자연스럽게 왼쪽에서 오른쪽으로 흐름.
  const points = sortAscByDate(rows)
    .map((row) => ({
      date: row.date,
      value: Number(row[valueKey]),
    }))
    .filter((point) => Number.isFinite(point.value))
    .slice(-5);

  if (points.length === 0) {
    yAxis.innerHTML = '';
    xAxis.innerHTML = '';

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText('아직 기록이 없습니다.', 12, 32);
    return;
  }

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;

  const baseRange = Math.max(rawRange, minRange);
  const verticalPadding = Math.max(baseRange * 0.12, minRange * 0.05);
  const center = (rawMin + rawMax) / 2;

  let min = center - baseRange / 2 - verticalPadding;
  let max = center + baseRange / 2 + verticalPadding;

  if (min < 0) {
    max += Math.abs(min);
    min = 0;
  }

  const plotPadding = {
    top: 10,
    right: 8,
    bottom: 10,
    left: 8,
  };

  const plotWidth = width - plotPadding.left - plotPadding.right;
  const plotHeight = height - plotPadding.top - plotPadding.bottom;

  const xFor = (index) => {
    if (points.length === 1) {
      return width / 2;
    }

    return plotPadding.left + (index / (points.length - 1)) * plotWidth;
  };

  const yFor = (value) => {
    return plotPadding.top + ((max - value) / (max - min)) * plotHeight;
  };

  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1);
    return max - ratio * (max - min);
  });

  yAxis.innerHTML = yTicks
    .map((value) => `<span>${esc(formatAxisValue(value, suffix))}</span>`)
    .join('');

  xAxis.innerHTML = points
    .map((point) => `<span>${esc(formatChartDateLabel(point.date))}</span>`)
    .join('');

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 1;

  yTicks.forEach((value) => {
    const y = yFor(value);

    ctx.beginPath();
    ctx.moveTo(plotPadding.left, y);
    ctx.lineTo(width - plotPadding.right, y);
    ctx.stroke();
  });

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  ctx.fillStyle = '#e5e7eb';

  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderDashboard(summary) {
  $('#latestWeight').textContent = summary.latestInbody
    ? fmt(summary.latestInbody.weightKg, 'kg')
    : '-';

  $('#latestMuscle').textContent = summary.latestInbody
    ? fmt(summary.latestInbody.muscleKg, 'kg')
    : '-';

  $('#latestBodyFat').textContent = summary.latestInbody
    ? fmt(summary.latestInbody.bodyFatPercent, '%')
    : '-';

  $('#latestInbodyDate').textContent = summary.latestInbody?.date || '-';

  drawMetricLineChart($('#weightChart'), state.inbodyLogs, 'weightKg', {
    suffix: 'kg',
    minRange: 5,
  });

  drawMetricLineChart($('#fatChart'), state.inbodyLogs, 'bodyFatPercent', {
    suffix: '%',
    minRange: 8,
  });
}

function getEntryTimestamp(row) {
  return String(row?.createdAt || row?.updatedAt || row?.date || '');
}

function pickLatestRow(rows) {
  return rows.reduce((latest, row) => {
    if (!latest) {
      return row;
    }

    return getEntryTimestamp(row) > getEntryTimestamp(latest) ? row : latest;
  }, null);
}

function renderProfile() {
  const profile = state.profile || {};
  const latestInbody = pickLatestRow(state.inbodyLogs);

  $('#profileView').innerHTML = `
    <div class="profile-item">
      <span>키</span>
      <strong>${esc(fmt(profile.heightCm, 'cm'))}</strong>
    </div>
    <div class="profile-item">
      <span>최근 체중</span>
      <strong>${esc(fmt(latestInbody?.weightKg, 'kg'))}</strong>
    </div>
    <div class="profile-item">
      <span>최근 골격근량</span>
      <strong>${esc(fmt(latestInbody?.muscleKg, 'kg'))}</strong>
    </div>
    <div class="profile-item">
      <span>최근 체지방률</span>
      <strong>${esc(fmt(latestInbody?.bodyFatPercent, '%'))}</strong>
    </div>
  `;

  const form = $('#profileForm');

  if (!form) {
    return;
  }

  form.heightCm.value = numOrEmpty(profile.heightCm);
  form.memo.value = profile.memo || '';
}

function renderAbout() {
  const about = state.about || {};

  const aboutIntro = $('#aboutIntro');
  const aboutInterest = $('#aboutInterest');
  const aboutFocus = $('#aboutFocus');
  const aboutSite = $('#aboutSite');

  if (aboutIntro) {
    aboutIntro.textContent = about.intro || '소개 내용이 없습니다.';
  }

  if (aboutInterest) {
    aboutInterest.textContent = about.interest || '-';
  }

  if (aboutFocus) {
    aboutFocus.textContent = about.focus || '-';
  }

  if (aboutSite) {
    aboutSite.textContent = about.site || '-';
  }

  const form = $('#aboutForm');

  if (!form) {
    return;
  }

  form.intro.value = about.intro || '';
  form.interest.value = about.interest || '';
  form.focus.value = about.focus || '';
  form.site.value = about.site || '';
}

function renderLinkEntries(container, entries, options = {}) {
  if (!container) {
    return;
  }

  const {
    metaKey,
    emptyText,
  } = options;

  if (!entries.length) {
    container.innerHTML = `<div class="link-empty">${esc(emptyText)}</div>`;
    return;
  }

  container.innerHTML = entries
    .map((entry) => `
      <div class="link-entry">
        <div class="link-entry-copy">
          <span class="link-entry-name">${esc(entry.name)}</span>
          <span class="link-entry-meta">${esc(entry[metaKey])}</span>
        </div>
        <a class="link-entry-action" href="${esc(entry.url)}" target="_blank" rel="noreferrer">이동</a>
      </div>
    `)
    .join('');
}

function renderLinkPanels() {
  renderLinkEntries($('#gameLinkList'), state.gameLinks, {
    metaKey: 'nickname',
    emptyText: '아직 추가된 게임 프로필이 없습니다.',
  });

  renderLinkEntries($('#botLinkList'), state.botLinks, {
    metaKey: 'feature',
    emptyText: '아직 추가된 디스코드 봇이 없습니다.',
  });
}

function renderInbodyTable() {
  $('#inbodyTable').innerHTML = state.inbodyLogs
    .map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td>${esc(fmt(row.weightKg, 'kg'))}</td>
        <td>${esc(fmt(row.muscleKg, 'kg'))}</td>
        <td>${esc(fmt(row.bodyFatPercent, '%'))}</td>
        <td>${esc(fmt(row.bmi))}</td>
        <td>${esc(row.memo)}</td>
        <td class="actions admin-only">
          <button type="button" data-action="edit" data-type="inbody" data-id="${row.id}">수정</button>
          <button type="button" class="danger" data-action="delete" data-type="inbody" data-id="${row.id}">삭제</button>
        </td>
      </tr>
    `)
    .join('');
}

function resetForm(formId) {
  const form = document.getElementById(formId);

  if (!form) {
    return;
  }

  form.reset();

  if (form.id === 'inbodyForm') {
    delete form.dataset.editId;
    form.date.value = today();
    updateInbodyBmi();
  }

  if (form.id === 'aboutForm') {
    renderAbout();
  }
}

function fillForm(form, row) {
  if (!form || !row) {
    return;
  }

  if (form.id === 'inbodyForm') {
    form.dataset.editId = String(row.id);
  }

  for (const element of form.elements) {
    if (!element.name) {
      continue;
    }

    element.value = numOrEmpty(row[element.name]);
  }

  if (form.id === 'inbodyForm') {
    updateInbodyBmi();
  }
}

function updateInbodyBmi() {
  const form = $('#inbodyForm');
  const bmiField = form?.bmi;
  const heightField = form?.heightCm;
  const bodyFatPercentField = form?.bodyFatPercent;  // ✅ 추가

  if (!form || !bmiField) {
    return;
  }

  const profileHeightValue = $('#profileForm')?.heightCm?.value.trim();
  const resolvedHeightValue = profileHeightValue || state.profile?.heightCm || '';
  const heightCm = parsePositiveNumber(resolvedHeightValue);
  const weightKg = parsePositiveNumber(form.weightKg?.value);
  const bodyFatKg = parsePositiveNumber(form.bodyFatKg?.value);  // ✅ 추가
  const bmi = calculateBmi(weightKg, heightCm);
  const bodyFatPercent = calculateBodyFatPercent(bodyFatKg, weightKg);  // ✅ 추가

  if (heightField) {
    heightField.value = numOrEmpty(resolvedHeightValue);
  }

  if (bmi !== null) {
    bmiField.value = bmi.toFixed(1);
  }

  // ✅ 체지방률 자동 계산 추가
  if (bodyFatPercent !== null && bodyFatPercentField) {
    bodyFatPercentField.value = bodyFatPercent.toFixed(1);
  }
}

function applyInitialHash() {
  const tabName = location.hash.replace('#', '').trim();

  const validMainTabs = ['home', 'about', 'projects', 'links', 'health'];

  if (validMainTabs.includes(tabName)) {
    switchMainTab(tabName, { updateHash: false });
  }
}

async function loadAll() {
  const [me, aboutData, profileData, inbodyData, summaryData, gameLinksData, botLinksData] = await Promise.all([
    api('/api/me'),
    api('/api/about'),
    api('/api/profile'),
    api('/api/inbody-logs'),
    api('/api/summary'),
    api('/api/game-links'),
    api('/api/bot-links'),
  ]);

  setLoggedIn(me.loggedIn);

  document.title = 'Kannyan';
  $('#siteTitle').textContent = me.siteTitle || 'Kannyan';

  state.about = aboutData.about;
  state.profile = profileData.profile;
  state.inbodyLogs = inbodyData.inbodyLogs;
  state.gameLinks = gameLinksData.gameLinks;
  state.botLinks = botLinksData.botLinks;
  state.summary = summaryData.summary;

  renderAbout();
  renderLinkPanels();
  renderProfile();
  renderInbodyTable();
  renderDashboard(state.summary);

  resetForm('inbodyForm');

  applyInitialHash();
}

document.querySelectorAll('.main-tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    switchMainTab(button.dataset.mainTab);
  });
});

document.querySelectorAll('.main-tab-link').forEach((button) => {
  button.addEventListener('click', () => {
    switchMainTab(button.dataset.mainTabLink);
  });
});

function toggleLinkPanel(panelName) {
  const panelWrap = $('#linkPanels');
  const toggleButtons = document.querySelectorAll('[data-link-panel-toggle]');
  const panels = document.querySelectorAll('.link-subpanel');
  const activePanelName = panelWrap?.dataset.activePanel || '';
  const nextPanelName = activePanelName === panelName ? '' : panelName;

  if (panelWrap) {
    panelWrap.hidden = !nextPanelName;
    panelWrap.dataset.activePanel = nextPanelName;
  }

  toggleButtons.forEach((button) => {
    const isActive = button.dataset.linkPanelToggle === nextPanelName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-expanded', String(isActive));
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.linkPanel !== nextPanelName;
  });
}

document.querySelectorAll('[data-link-panel-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    toggleLinkPanel(button.dataset.linkPanelToggle);
  });
});

document.querySelectorAll('.health-tabs .tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    switchHealthTab(button.dataset.tab);
  });
});

$('#loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await api('/api/login', {
      method: 'POST',
      body: {
        password: $('#loginPassword').value,
      },
    });

    $('#loginPassword').value = '';
    showToast('로그인됨');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#logoutButton')?.addEventListener('click', async () => {
  try {
    await api('/api/logout', {
      method: 'POST',
    });

    showToast('로그아웃됨');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#profileForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await api('/api/profile', {
      method: 'PUT',
      body: getFormData(event.currentTarget),
    });

    showToast('프로필 저장 완료');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#aboutForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await api('/api/about', {
      method: 'PUT',
      body: getFormData(event.currentTarget),
    });

    showToast('소개 저장 완료');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#gameLinkForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;

  try {
    await api('/api/game-links', {
      method: 'POST',
      body: getFormData(form),
    });

    showToast('게임 링크 추가 완료');
    form.reset();
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#botLinkForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;

  try {
    await api('/api/bot-links', {
      method: 'POST',
      body: getFormData(form),
    });

    showToast('봇 링크 추가 완료');
    form.reset();
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#inbodyForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = getFormData(form);
  const id = form.dataset.editId || '';

  try {
    await api(id ? `/api/inbody-logs/${id}` : '/api/inbody-logs', {
      method: id ? 'PUT' : 'POST',
      body: data,
    });

    showToast('인바디 기록 저장 완료');
    resetForm('inbodyForm');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

document.body.addEventListener('click', async (event) => {
  const resetButton = event.target.closest('[data-reset-form]');

  if (resetButton) {
    resetForm(resetButton.dataset.resetForm);
    return;
  }

  const actionButton = event.target.closest('[data-action]');

  if (!actionButton) {
    return;
  }

  const { action, type, id } = actionButton.dataset;

  if (action === 'edit') {
    if (type === 'inbody') {
      const row = state.inbodyLogs.find((item) => String(item.id) === String(id));
      fillForm($('#inbodyForm'), row);
      switchMainTab('health');
      switchHealthTab('inbody');
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });

    return;
  }

  if (action === 'delete') {
    if (!confirm('정말 삭제할까요?')) {
      return;
    }

    const endpointByType = {
      inbody: `/api/inbody-logs/${id}`,
    };

    if (!endpointByType[type]) {
      return;
    }

    try {
      await api(endpointByType[type], {
        method: 'DELETE',
      });

      showToast('삭제 완료');
      await loadAll();
    } catch (error) {
      showToast(error.message);
    }
  }
});

document.body.addEventListener('input', (event) => {
  const target = event.target;

  if (!target || typeof target.closest !== 'function') {
    return;
  }

  if (target.name === 'heightCm' && target.closest('#profileForm')) {
    updateInbodyBmi();
  }

  if ((target.name === 'weightKg' || target.name === 'bodyFatKg') && target.closest('#inbodyForm')) {
  updateInbodyBmi();
}
});

$('#exportButton')?.addEventListener('click', () => {
  window.location.href = '/api/export';
});

$('#importFile')?.addEventListener('change', async (event) => {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  if (!confirm('현재 DB 내용을 지우고 백업 파일로 복원할까요?')) {
    event.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    await api('/api/import', {
      method: 'POST',
      body: data,
    });

    showToast('복원 완료');
    event.target.value = '';
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

window.addEventListener('hashchange', () => {
  applyInitialHash();
});

window.addEventListener('resize', () => {
  if (!state.summary) {
    return;
  }

  renderDashboard(state.summary);
});

initHeroTyping();

loadAll().catch((error) => {
  console.error(error);
  showToast('초기 로딩 실패');
});
