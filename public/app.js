const $ = (selector) => document.querySelector(selector);

const state = {
  loggedIn: false,
  profile: null,
  bodyLogs: [],
  inbodyLogs: [],
  workoutLogs: [],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(message) {
  const toast = $('#toast');
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

function switchTab(tabName) {
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-page').forEach((page) => {
    page.classList.toggle('active', page.id === tabName);
  });
}

function sortAscByDate(rows) {
  return [...rows].sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    return dateCompare || Number(a.id || 0) - Number(b.id || 0);
  });
}

function drawLineChart(canvas, rows, valueKey, suffix = '') {
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
  $('#latestWeight').textContent = summary.latestBody
    ? fmt(summary.latestBody.weightKg, 'kg')
    : '-';

  $('#latestMuscle').textContent = summary.latestInbody
    ? fmt(summary.latestInbody.muscleKg, 'kg')
    : '-';

  $('#latestBodyFat').textContent = summary.latestInbody
    ? fmt(summary.latestInbody.bodyFatPercent, '%')
    : '-';

  $('#weekWorkoutCount').textContent = `${summary.workoutCountThisWeek ?? 0}회`;

  drawLineChart($('#weightChart'), state.bodyLogs, 'weightKg', 'kg');
  drawLineChart($('#fatChart'), state.inbodyLogs, 'bodyFatPercent', '%');
}

function renderProfile() {
  const profile = state.profile || {};

  $('#profileView').innerHTML = `
    <div class="profile-item">
      <span>키</span>
      <strong>${esc(fmt(profile.heightCm, 'cm'))}</strong>
    </div>
    <div class="profile-item">
      <span>목표 체중</span>
      <strong>${esc(fmt(profile.targetWeightKg, 'kg'))}</strong>
    </div>
    <div class="profile-item">
      <span>목표 골격근량</span>
      <strong>${esc(fmt(profile.targetMuscleKg, 'kg'))}</strong>
    </div>
    <div class="profile-item">
      <span>목표 체지방률</span>
      <strong>${esc(fmt(profile.targetBodyFatPercent, '%'))}</strong>
    </div>
  `;

  const form = $('#profileForm');

  form.heightCm.value = numOrEmpty(profile.heightCm);
  form.targetWeightKg.value = numOrEmpty(profile.targetWeightKg);
  form.targetMuscleKg.value = numOrEmpty(profile.targetMuscleKg);
  form.targetBodyFatPercent.value = numOrEmpty(profile.targetBodyFatPercent);
  form.memo.value = profile.memo || '';
}

function renderBodyTable() {
  $('#bodyTable').innerHTML = state.bodyLogs
    .map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td>${esc(fmt(row.weightKg, 'kg'))}</td>
        <td>${esc(row.memo)}</td>
        <td class="actions admin-only">
          <button type="button" data-action="edit" data-type="body" data-id="${row.id}">수정</button>
          <button type="button" class="danger" data-action="delete" data-type="body" data-id="${row.id}">삭제</button>
        </td>
      </tr>
    `)
    .join('');
}

function renderInbodyTable() {
  $('#inbodyTable').innerHTML = state.inbodyLogs
    .map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td>${esc(fmt(row.weightKg, 'kg'))}</td>
        <td>${esc(fmt(row.muscleKg, 'kg'))}</td>
        <td>${esc(fmt(row.bodyFatPercent, '%'))}</td>
        <td>${esc(fmt(row.score, '점'))}</td>
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
  form.reset();

  if (form.id === 'bodyForm') {
    form.date.value = today();
  }

  if (form.id === 'inbodyForm') {
    form.date.value = today();
  }

  if (form.id === 'workoutForm') {
    form.date.value = today();
  }
}

function fillForm(form, row) {
  for (const element of form.elements) {
    if (!element.name) {
      continue;
    }

    element.value = numOrEmpty(row[element.name]);
  }
}

async function loadAll() {
  const [me, profileData, bodyData, inbodyData, workoutData, summaryData] = await Promise.all([
    api('/api/me'),
    api('/api/profile'),
    api('/api/body-logs'),
    api('/api/inbody-logs'),
    api('/api/workout-logs'),
    api('/api/summary'),
  ]);

  setLoggedIn(me.loggedIn);

  document.title = me.siteTitle || 'Body Tracker';
  $('#siteTitle').textContent = me.siteTitle || 'Body Tracker';

  state.profile = profileData.profile;
  state.bodyLogs = bodyData.bodyLogs;
  state.inbodyLogs = inbodyData.inbodyLogs;
  state.workoutLogs = workoutData.workoutLogs;

  renderProfile();
  renderBodyTable();
  renderInbodyTable();
  renderWorkoutTable();
  renderDashboard(summaryData.summary);

  resetForm('bodyForm');
  resetForm('inbodyForm');
  resetForm('workoutForm');
}

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    switchTab(button.dataset.tab);
  });
});

$('#loginForm').addEventListener('submit', async (event) => {
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

$('#logoutButton').addEventListener('click', async () => {
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

$('#profileForm').addEventListener('submit', async (event) => {
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

$('#bodyForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = getFormData(form);
  const id = data.id;

  delete data.id;

  try {
    await api(id ? `/api/body-logs/${id}` : '/api/body-logs', {
      method: id ? 'PUT' : 'POST',
      body: data,
    });

    showToast('몸무게 기록 저장 완료');
    resetForm('bodyForm');
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#inbodyForm').addEventListener('submit', async (event) => {
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

$('#workoutForm').addEventListener('submit', async (event) => {
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
    if (type === 'body') {
      const row = state.bodyLogs.find((item) => String(item.id) === String(id));
      fillForm($('#bodyForm'), row);
      switchTab('body');
    }

    if (type === 'inbody') {
      const row = state.inbodyLogs.find((item) => String(item.id) === String(id));
      fillForm($('#inbodyForm'), row);
      switchTab('inbody');
    }

    if (type === 'workout') {
      const row = state.workoutLogs.find((item) => String(item.id) === String(id));
      fillForm($('#workoutForm'), row);
      switchTab('workout');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'delete') {
    if (!confirm('정말 삭제할까요?')) {
      return;
    }

    const endpointByType = {
      body: `/api/body-logs/${id}`,
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

$('#exportButton').addEventListener('click', () => {
  window.location.href = '/api/export';
});

$('#importFile').addEventListener('change', async (event) => {
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

loadAll().catch((error) => {
  console.error(error);
  showToast('초기 로딩 실패');
});