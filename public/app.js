const $ = (selector) => document.querySelector(selector);

const state = {
  loggedIn: false,
  about: null,
  profile: null,
  inbodyLogs: [],
  workoutLogs: [],
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

function switchFitnessTab(tabName) {
  document.querySelectorAll('.fitness-tabs .tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('#fitness .tab-page').forEach((page) => {
    page.classList.toggle('active', page.id === tabName);
  });

  if (!document.getElementById('fitness')?.classList.contains('active')) {
    switchMainTab('fitness');
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

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

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

  if (min === max) {
    min -= 1;
    max += 1;
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
  ctx.fillText(`${points[0].date} → ${latest.date}`, padding, height - 14);
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

  $('#weekWorkoutCount').textContent = `${summary.workoutCountThisWeek ?? 0}회`;

  drawLineChart($('#weightChart'), state.inbodyLogs, 'weightKg', 'kg');
  drawLineChart($('#fatChart'), state.inbodyLogs, 'bodyFatPercent', '%');
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

function renderWorkoutTable() {
  $('#workoutTable').innerHTML = state.workoutLogs
    .map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td>${esc(row.part)}</td>
        <td>${esc(row.name)}</td>
        <td>${esc(fmt(row.sets))}</td>
        <td>${esc(fmt(row.reps))}</td>
        <td>${esc(fmt(row.weightKg, 'kg'))}</td>
        <td>${esc(fmt(row.durationMin, '분'))}</td>
        <td>${esc(row.memo)}</td>
        <td class="actions admin-only">
          <button type="button" data-action="edit" data-type="workout" data-id="${row.id}">수정</button>
          <button type="button" class="danger" data-action="delete" data-type="workout" data-id="${row.id}">삭제</button>
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
    form.date.value = today();
    updateInbodyBmi();
  }

  if (form.id === 'workoutForm') {
    form.date.value = today();
  }

  if (form.id === 'aboutForm') {
    renderAbout();
  }
}

function fillForm(form, row) {
  if (!form || !row) {
    return;
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

  const validMainTabs = ['home', 'about', 'projects', 'links', 'fitness'];

  if (validMainTabs.includes(tabName)) {
    switchMainTab(tabName, { updateHash: false });
  }
}

async function loadAll() {
  const [me, aboutData, profileData, inbodyData, workoutData, summaryData] = await Promise.all([
    api('/api/me'),
    api('/api/about'),
    api('/api/profile'),
    api('/api/inbody-logs'),
    api('/api/workout-logs'),
    api('/api/summary'),
  ]);

  setLoggedIn(me.loggedIn);

  document.title = 'Kannyan';
  $('#siteTitle').textContent = me.siteTitle || 'Kannyan';

  state.about = aboutData.about;
  state.profile = profileData.profile;
  state.inbodyLogs = inbodyData.inbodyLogs;
  state.workoutLogs = workoutData.workoutLogs;

  renderAbout();
  renderProfile();
  renderInbodyTable();
  renderWorkoutTable();
  renderDashboard(summaryData.summary);

  resetForm('inbodyForm');
  resetForm('workoutForm');

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

document.querySelectorAll('.fitness-tabs .tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    switchFitnessTab(button.dataset.tab);
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

$('#inbodyForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = getFormData(form);
  const id = data.id;

  delete data.id;

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

$('#workoutForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = getFormData(form);
  const id = data.id;

  delete data.id;

  try {
    await api(id ? `/api/workout-logs/${id}` : '/api/workout-logs', {
      method: id ? 'PUT' : 'POST',
      body: data,
    });

    showToast('운동 기록 저장 완료');
    resetForm('workoutForm');
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
      switchMainTab('fitness');
      switchFitnessTab('inbody');
    }

    if (type === 'workout') {
      const row = state.workoutLogs.find((item) => String(item.id) === String(id));
      fillForm($('#workoutForm'), row);
      switchMainTab('fitness');
      switchFitnessTab('workout');
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
      workout: `/api/workout-logs/${id}`,
    };

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

initHeroTyping();

loadAll().catch((error) => {
  console.error(error);
  showToast('초기 로딩 실패');
});
