import 'dotenv/config';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');

const PORT = Number(process.env.PORT || 3100);
const isProduction = process.env.NODE_ENV === 'production';
const siteTitle = process.env.SITE_TITLE || 'Body Tracker';

const defaultDataDir = isProduction ? '/home/ubuntu/body-tracker-data' : path.join(__dirname, 'data');
const dataDir = path.resolve(process.env.BODY_TRACKER_DATA_DIR || defaultDataDir);
const publicDir = path.join(__dirname, 'public');
const dbPath = path.join(dataDir, 'body-tracker.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

console.log(`[body-tracker] data dir: ${dataDir}`);

const adminPassword = process.env.ADMIN_PASSWORD || '';

if (isProduction && !adminPassword) {
  throw new Error('ADMIN_PASSWORD must be set in production.');
}

if (!adminPassword) {
  console.warn('[WARN] ADMIN_PASSWORD is not set. Login will be unavailable until it is configured.');
}

const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : crypto.randomBytes(32).toString('hex'));

if (isProduction && !sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}

if (!process.env.SESSION_SECRET) {
  console.warn('[WARN] SESSION_SECRET is not set. Using a random development secret.');
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_PRUNE_INTERVAL_MS = 1000 * 60 * 5;

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: isProduction,
  path: '/',
  maxAge: SESSION_TTL_MS,
};

const sessionClearCookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: isProduction,
  path: '/',
};

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    height_cm REAL,
    memo TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS about_page (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    intro TEXT NOT NULL DEFAULT '',
    interest TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS home_main_work (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS body_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inbody_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL,
    muscle_kg REAL,
    fat_kg REAL,
    body_fat_percent REAL,
    bmi REAL,
    bmr REAL,
    visceral_fat_level REAL,
    score REAL,
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    part TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    sets INTEGER,
    reps INTEGER,
    weight_kg REAL,
    duration_min REAL,
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS game_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bot_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    feature TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS home_current_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    bullets TEXT NOT NULL DEFAULT '',
    is_current INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.prepare(`
  INSERT OR IGNORE INTO profile (
    id,
    height_cm,
    memo
  ) VALUES (1, NULL, '')
`).run();

const defaultAboutContent = {
  intro: '부산대학교 재학중. 취미로 지피티로 이것저것 만들어보는 중입니다.',
  interest: 'Chess, TETR.IO, Web Tools, Vibe coding',
  focus: '내가 필요한데 없는거 지피티로 만들기',
  site: 'Oracle VM + Node.js + SQLite + Nginx',
};

const defaultHomeCurrentItems = [
  'Chesubu',
  'Kannyan Discord Bot',
  'Nyannyan Problem Bot',
  'Personal Home + Health',
];

const defaultProjects = [
  {
    badge: 'WEB GAME',
    title: 'Chesubu',
    url: '',
    description: '브라우저에서 바로 체스 대국을 진행할 수 있는 온라인 체스 사이트.',
    bullets: [
      '실시간 체스판 조작',
      '합법 수 검증',
      'Stockfish 기반 AI 대국',
      '웹 기반 체스 인터페이스',
    ],
    isCurrent: 1,
  },
  {
    badge: 'DISCORD BOT',
    title: 'Kannyan Discord Bot',
    url: '',
    description: 'Gemini/Gemma 채팅, TETR.IO 도구, 체스 분석 기능을 한곳에 모은 개인 디스코드 봇.',
    bullets: [
      'Gemini/Gemma 대화 응답',
      'TETR.IO 프로필/스탯 카드 생성',
      '체스 이미지 분석 및 Stockfish 연동',
      '일일 체스 퍼즐과 알람 기능',
    ],
    isCurrent: 1,
  },
  {
    badge: 'EDUCATION',
    title: 'Nyannyan Problem Bot',
    url: '',
    description: '과외 문제를 단원별로 정리하고, 정답 선택까지 관리할 수 있는 디스코드 문제 정리 봇.',
    bullets: [
      '문제 이미지 업로드',
      '단원별 채널 자동 정리',
      '1~4번 반응으로 정답 기록',
      '문제 이동 및 재분류 지원',
    ],
    isCurrent: 1,
  },
  {
    badge: 'Web',
    title: 'Personal Home + Health',
    url: '',
    description: '개인 홈페이지와 인바디 기록 관리를 함께 담은 웹사이트.',
    bullets: [
      'Node.js Express 서버',
      'SQLite 기반 데이터 저장',
      '관리자 로그인',
      '체중/골격근량/체지방률 그래프',
    ],
    isCurrent: 1,
  },
];

db.prepare(`
  INSERT OR IGNORE INTO about_page (
    id,
    intro,
    interest,
    focus,
    site
  ) VALUES (1, ?, ?, ?, ?)
`).run(
  defaultAboutContent.intro,
  defaultAboutContent.interest,
  defaultAboutContent.focus,
  defaultAboutContent.site,
);

db.prepare(`
  INSERT OR IGNORE INTO home_main_work (
    id,
    title,
    content
  ) VALUES (1, '메인 작업물', '')
`).run();

function migrateProfileTable() {
  const profileColumns = db.prepare('PRAGMA table_info(profile)').all().map((row) => row.name);
  const legacyColumns = [
    'target_weight_kg',
    'target_muscle_kg',
    'target_body_fat_percent',
  ];

  if (!legacyColumns.some((columnName) => profileColumns.includes(columnName))) {
    return;
  }

  db.exec(`
    CREATE TABLE profile_new (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      height_cm REAL,
      memo TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO profile_new (id, height_cm, memo, updated_at)
    SELECT
      id,
      height_cm,
      COALESCE(memo, ''),
      COALESCE(updated_at, CURRENT_TIMESTAMP)
    FROM profile
    WHERE id = 1;

    DROP TABLE profile;
    ALTER TABLE profile_new RENAME TO profile;
  `);
}

migrateProfileTable();

function migrateProjectsTable() {
  const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map((row) => row.name);

  if (!projectColumns.includes('url')) {
    db.exec(`
      ALTER TABLE projects
      ADD COLUMN url TEXT NOT NULL DEFAULT '';
    `);
  }
}

migrateProjectsTable();

let lastSessionPruneAt = 0;

function pruneExpiredSessions(now = Date.now()) {
  if (now - lastSessionPruneAt < SESSION_PRUNE_INTERVAL_MS) {
    return;
  }

  db.prepare(`
    DELETE FROM sessions
    WHERE expires_at_ms <= ?
  `).run(now);

  lastSessionPruneAt = now;
}

function getSessionExpiryMs(sessionData) {
  const cookie = sessionData?.cookie || {};

  if (cookie.expires) {
    const expiresAt = new Date(cookie.expires).getTime();

    if (Number.isFinite(expiresAt)) {
      return expiresAt;
    }
  }

  const maxAge = Number(cookie.maxAge);

  if (Number.isFinite(maxAge) && maxAge > 0) {
    return Date.now() + maxAge;
  }

  return Date.now() + SESSION_TTL_MS;
}

class BetterSqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.getStmt = this.db.prepare(`
      SELECT data, expires_at_ms AS expiresAtMs
      FROM sessions
      WHERE sid = ?
    `);
    this.setStmt = this.db.prepare(`
      INSERT INTO sessions (sid, data, expires_at_ms, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(sid) DO UPDATE SET
        data = excluded.data,
        expires_at_ms = excluded.expires_at_ms,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.destroyStmt = this.db.prepare(`
      DELETE FROM sessions
      WHERE sid = ?
    `);
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      pruneExpiredSessions(now);

      const row = this.getStmt.get(sid);

      if (!row) {
        callback(null, null);
        return;
      }

      if (row.expiresAtMs <= now) {
        this.destroyStmt.run(sid);
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(row.data));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      pruneExpiredSessions();
      this.setStmt.run(sid, JSON.stringify(sessionData), getSessionExpiryMs(sessionData));
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStmt.run(sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

const sessionStore = new BetterSqliteSessionStore(db);

if (isProduction && sessionStore instanceof session.MemoryStore) {
  throw new Error('Production session store must not use MemoryStore.');
}

function seedHomeCurrentItems() {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM home_current_items
  `).get();

  if (row.count > 0) {
    return;
  }

  const insertCurrentItem = db.prepare(`
    INSERT INTO home_current_items (text, sort_order)
    VALUES (?, ?)
  `);

  defaultHomeCurrentItems.forEach((text, index) => {
    insertCurrentItem.run(text, index);
  });
}

seedHomeCurrentItems();

function seedProjects() {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM projects
  `).get();

  if (row.count > 0) {
    return;
  }

  const insertProject = db.prepare(`
    INSERT INTO projects (badge, title, url, description, bullets, is_current, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultProjects.forEach((project, index) => {
    insertProject.run(
      project.badge,
      project.title,
      project.url,
      project.description,
      project.bullets.join('\n'),
      project.isCurrent,
      index,
    );
  });
}

seedProjects();

function syncHomeCurrentItemsFromProjects(projectRows) {
  const currentTitles = projectRows
    .filter((project) => Number(project.isCurrent) === 1)
    .map((project) => optionalText(project.title, 120))
    .filter(Boolean);

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM home_current_items').run();

    const insertItem = db.prepare(`
      INSERT INTO home_current_items (text, sort_order)
      VALUES (?, ?)
    `);

    currentTitles.forEach((text, index) => {
      insertItem.run(text, index);
    });
  });

  transaction();
}

function getAboutContent() {
  const about = db.prepare(`
    SELECT
      intro,
      interest,
      focus,
      site,
      updated_at AS updatedAt
    FROM about_page
    WHERE id = 1
  `).get();

  return about || {
    ...defaultAboutContent,
    updatedAt: null,
  };
}

function getHomeMainWork() {
  return db.prepare(`
    SELECT
      title,
      content,
      updated_at AS updatedAt
    FROM home_main_work
    WHERE id = 1
  `).get() || {
    title: '메인 작업물',
    content: '',
    updatedAt: null,
  };
}

app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    name: 'bt.sid',
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: sessionCookieOptions,
  }),
);

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "media-src 'self'",
    ].join('; '),
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
});

function safeEqualText(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function requireLogin(req, res, next) {
  if (req.session?.isAdmin) {
    return next();
  }

  return res.status(401).json({
    ok: false,
    error: 'LOGIN_REQUIRED',
    message: '로그인이 필요합니다.',
  });
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({
      ok: false,
      error: 'JSON_REQUIRED',
      message: 'Content-Type: application/json 이 필요합니다.',
    });
  }

  return next();
}

function assertDate(value, fieldName = 'date') {
  const text = String(value ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error(`${fieldName}는 YYYY-MM-DD 형식이어야 합니다.`);
    error.status = 400;
    throw error;
  }

  return text;
}

function optionalText(value, maxLength = 500) {
  const text = String(value ?? '').trim();
  return text.slice(0, maxLength);
}

function requiredText(value, fieldName, maxLength = 100) {
  const text = String(value ?? '').trim();

  if (!text) {
    const error = new Error(`${fieldName} 값이 필요합니다.`);
    error.status = 400;
    throw error;
  }

  return text.slice(0, maxLength);
}

function requiredUrl(value, fieldName = '링크') {
  const text = requiredText(value, fieldName, 1000);

  let parsedUrl;

  try {
    parsedUrl = new URL(text);
  } catch {
    const error = new Error(`${fieldName} 주소 형식이 올바르지 않습니다.`);
    error.status = 400;
    throw error;
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    const error = new Error(`${fieldName} 주소는 http 또는 https 여야 합니다.`);
    error.status = 400;
    throw error;
  }

  return parsedUrl.toString();
}

function optionalUrl(value, fieldName = '링크') {
  const text = optionalText(value, 1000);
  return text ? requiredUrl(text, fieldName) : '';
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    const error = new Error('숫자 형식이 올바르지 않습니다.');
    error.status = 400;
    throw error;
  }

  return number;
}

function requiredNumber(value, fieldName) {
  const number = optionalNumber(value);

  if (number === null) {
    const error = new Error(`${fieldName} 값이 필요합니다.`);
    error.status = 400;
    throw error;
  }

  return number;
}

function optionalInteger(value) {
  const number = optionalNumber(value);

  if (number === null) {
    return null;
  }

  return Math.trunc(number);
}

function calculateBmi(weightKg, heightCm) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) {
    return null;
  }

  const heightM = heightCm / 100;

  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function getProfileHeightCm() {
  const profile = db.prepare(`
    SELECT height_cm AS heightCm
    FROM profile
    WHERE id = 1
  `).get();

  return optionalNumber(profile?.heightCm);
}

function getIdParam(req) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('id 값이 올바르지 않습니다.');
    error.status = 400;
    throw error;
  }

  return id;
}

function handleRoute(fn) {
  return (req, res, next) => {
    const sendError = (error) => {
      if (res.headersSent) {
        next(error);
        return;
      }

      const status = error.status || 500;

      if (status >= 500) {
        console.error(error);
      }

      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'SERVER_ERROR' : 'BAD_REQUEST',
        message: error.message || '서버 오류가 발생했습니다.',
      });
    };

    try {
      const result = fn(req, res, next);

      if (result && typeof result.then === 'function') {
        return result.catch(sendError);
      }

      return result;
    } catch (error) {
      return sendError(error);
    }
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

const loginAttempts = new Map();
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_PURGE_MS = 60 * 60 * 1000;

function getLoginAttemptKey(req) {
  return req.ip || 'unknown';
}

function pruneLoginAttempts(now = Date.now()) {
  for (const [key, state] of loginAttempts) {
    if (now - state.lastSeenAt > LOGIN_ATTEMPT_PURGE_MS) {
      loginAttempts.delete(key);
    }
  }
}

function getLoginAttemptState(req) {
  const key = getLoginAttemptKey(req);
  const now = Date.now();
  let state = loginAttempts.get(key);

  if (!state) {
    state = {
      attempts: [],
      blockedUntil: 0,
      lastSeenAt: now,
    };
    loginAttempts.set(key, state);
    return state;
  }

  state.attempts = state.attempts.filter((timestamp) => now - timestamp <= LOGIN_ATTEMPT_WINDOW_MS);

  if (state.blockedUntil <= now) {
    state.blockedUntil = 0;
  }

  state.lastSeenAt = now;
  pruneLoginAttempts(now);
  return state;
}

function getLoginBlockedState(req) {
  const state = getLoginAttemptState(req);
  return state.blockedUntil > Date.now() ? state : null;
}

function recordLoginFailure(req) {
  const now = Date.now();
  const state = getLoginAttemptState(req);

  state.attempts.push(now);
  state.attempts = state.attempts.filter((timestamp) => now - timestamp <= LOGIN_ATTEMPT_WINDOW_MS);

  if (state.attempts.length >= LOGIN_ATTEMPT_LIMIT) {
    state.blockedUntil = now + LOGIN_ATTEMPT_BLOCK_MS;
    state.attempts = [];
  }

  state.lastSeenAt = now;
  pruneLoginAttempts(now);

  return state;
}

function clearLoginAttempts(req) {
  loginAttempts.delete(getLoginAttemptKey(req));
}

const bodyLogSelect = `
  SELECT
    id,
    date,
    weight_kg AS weightKg,
    memo,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM body_logs
`;

const inbodyLogSelect = `
  SELECT
    id,
    date,
    weight_kg AS weightKg,
    muscle_kg AS muscleKg,
    fat_kg AS fatKg,
    body_fat_percent AS bodyFatPercent,
    bmi,
    bmr,
    visceral_fat_level AS visceralFatLevel,
    score,
    memo,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM inbody_logs
`;

const workoutLogSelect = `
  SELECT
    id,
    date,
    part,
    name,
    sets,
    reps,
    weight_kg AS weightKg,
    duration_min AS durationMin,
    memo,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM workout_logs
`;

const gameLinkSelect = `
  SELECT
    id,
    name,
    nickname,
    url,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM game_links
`;

const botLinkSelect = `
  SELECT
    id,
    name,
    feature,
    url,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM bot_links
`;

const homeCurrentItemSelect = `
  SELECT
    id,
    text,
    sort_order AS sortOrder,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM home_current_items
`;

const projectSelect = `
  SELECT
    id,
    badge,
    title,
    url,
    description,
    bullets,
    is_current AS isCurrent,
    sort_order AS sortOrder,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM projects
`;

const storedProjectsForHomeSync = db.prepare(`
  ${projectSelect}
  ORDER BY sort_order ASC, id ASC
`).all();

if (storedProjectsForHomeSync.length > 0) {
  syncHomeCurrentItemsFromProjects(storedProjectsForHomeSync);
}

app.get(
  '/api/me',
  handleRoute((req, res) => {
    res.json({
      ok: true,
      loggedIn: Boolean(req.session?.isAdmin),
      siteTitle,
    });
  }),
);

app.post(
  '/api/login',
  requireJson,
  handleRoute(async (req, res) => {
    const blockedState = getLoginBlockedState(req);

    if (blockedState) {
      return res.status(429).json({
        ok: false,
        error: 'LOGIN_RATE_LIMITED',
        message: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    const { password } = req.body;

    if (!adminPassword || !safeEqualText(password, adminPassword)) {
      const failureState = recordLoginFailure(req);
      const isBlocked = failureState.blockedUntil > Date.now();

      return res.status(isBlocked ? 429 : 401).json({
        ok: false,
        error: isBlocked ? 'LOGIN_RATE_LIMITED' : 'INVALID_PASSWORD',
        message: isBlocked
          ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
          : '비밀번호가 틀렸습니다.',
      });
    }

    await regenerateSession(req);
    req.session.isAdmin = true;
    await saveSession(req);
    clearLoginAttempts(req);

    return res.json({
      ok: true,
    });
  }),
);

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    res.clearCookie('bt.sid', sessionClearCookieOptions);

    if (error) {
      return res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message: '로그아웃 처리 중 오류가 발생했습니다.',
      });
    }

    return res.json({
      ok: true,
    });
  });
});

app.get(
  '/api/profile',
  handleRoute((req, res) => {
    const profile = db.prepare(`
      SELECT
        id,
        height_cm AS heightCm,
        memo,
        updated_at AS updatedAt
      FROM profile
      WHERE id = 1
    `).get();

    res.json({
      ok: true,
      profile,
    });
  }),
);

app.get(
  '/api/about',
  handleRoute((req, res) => {
    res.json({
      ok: true,
      about: getAboutContent(),
    });
  }),
);

app.get(
  '/api/home-main-work',
  handleRoute((req, res) => {
    res.json({
      ok: true,
      homeMainWork: getHomeMainWork(),
    });
  }),
);

app.put(
  '/api/home-main-work',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    db.prepare(`
      UPDATE home_main_work
      SET
        title = ?,
        content = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      requiredText(req.body.title, '메인 작업물 제목', 120),
      optionalText(req.body.content, 4000),
    );

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/home-current-items',
  handleRoute((req, res) => {
    const items = db.prepare(`
      ${homeCurrentItemSelect}
      ORDER BY sort_order ASC, id ASC
    `).all();

    res.json({
      ok: true,
      items,
    });
  }),
);

app.put(
  '/api/home-current-items',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const sanitizedItems = items
      .map((value) => optionalText(value, 120))
      .filter(Boolean)
      .slice(0, 20);

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM home_current_items').run();

      const insertItem = db.prepare(`
        INSERT INTO home_current_items (text, sort_order)
        VALUES (?, ?)
      `);

      sanitizedItems.forEach((text, index) => {
        insertItem.run(text, index);
      });
    });

    transaction();

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/projects',
  handleRoute((req, res) => {
    const projects = db.prepare(`
      ${projectSelect}
      ORDER BY sort_order ASC, id ASC
    `).all();

    res.json({
      ok: true,
      projects,
    });
  }),
);

app.put(
  '/api/projects',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const inputProjects = Array.isArray(req.body.projects) ? req.body.projects : [];

    const sanitizedProjects = inputProjects
      .map((project, index) => ({
        badge: requiredText(project.badge, '프로젝트 배지', 50),
        title: requiredText(project.title, '프로젝트 제목', 120),
        url: optionalUrl(project.url, '프로젝트 링크'),
        description: requiredText(project.description, '프로젝트 설명', 1000),
        bullets: Array.isArray(project.bullets)
          ? project.bullets.map((item) => optionalText(item, 200)).filter(Boolean).slice(0, 8)
          : [],
        isCurrent: project.isCurrent ? 1 : 0,
        sortOrder: index,
      }))
      .slice(0, 20);

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM projects').run();

      const insertProject = db.prepare(`
        INSERT INTO projects (badge, title, url, description, bullets, is_current, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      sanitizedProjects.forEach((project) => {
        insertProject.run(
          project.badge,
          project.title,
          project.url,
          project.description,
          project.bullets.join('\n'),
          project.isCurrent,
          project.sortOrder,
        );
      });

      syncHomeCurrentItemsFromProjects(sanitizedProjects);
    });

    transaction();

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/game-links',
  handleRoute((req, res) => {
    const gameLinks = db.prepare(`
      ${gameLinkSelect}
      ORDER BY id ASC
    `).all();

    res.json({
      ok: true,
      gameLinks,
    });
  }),
);

app.post(
  '/api/game-links',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const row = {
      name: requiredText(req.body.name, '게임 이름', 100),
      nickname: requiredText(req.body.nickname, '닉네임', 100),
      url: requiredUrl(req.body.url, '게임 링크'),
    };

    const result = db.prepare(`
      INSERT INTO game_links (name, nickname, url)
      VALUES (?, ?, ?)
    `).run(
      row.name,
      row.nickname,
      row.url,
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  }),
);

app.put(
  '/api/game-links/:id',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const row = {
      name: requiredText(req.body.name, '게임 이름', 100),
      nickname: requiredText(req.body.nickname, '닉네임', 100),
      url: requiredUrl(req.body.url, '게임 링크'),
    };

    const result = db.prepare(`
      UPDATE game_links
      SET
        name = ?,
        nickname = ?,
        url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      row.name,
      row.nickname,
      row.url,
      id,
    );

    if (result.changes === 0) {
      const error = new Error('게임 링크를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }

    res.json({
      ok: true,
    });
  }),
);

app.delete(
  '/api/game-links/:id',
  requireLogin,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const result = db.prepare(`
      DELETE FROM game_links
      WHERE id = ?
    `).run(id);

    if (result.changes === 0) {
      const error = new Error('게임 링크를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/bot-links',
  handleRoute((req, res) => {
    const botLinks = db.prepare(`
      ${botLinkSelect}
      ORDER BY id ASC
    `).all();

    res.json({
      ok: true,
      botLinks,
    });
  }),
);

app.post(
  '/api/bot-links',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const row = {
      name: requiredText(req.body.name, '봇 이름', 100),
      feature: requiredText(req.body.feature, '주요 기능', 200),
      url: requiredUrl(req.body.url, '봇 링크'),
    };

    const result = db.prepare(`
      INSERT INTO bot_links (name, feature, url)
      VALUES (?, ?, ?)
    `).run(
      row.name,
      row.feature,
      row.url,
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  }),
);

app.put(
  '/api/bot-links/:id',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const row = {
      name: requiredText(req.body.name, '봇 이름', 100),
      feature: requiredText(req.body.feature, '주요 기능', 200),
      url: requiredUrl(req.body.url, '봇 링크'),
    };

    const result = db.prepare(`
      UPDATE bot_links
      SET
        name = ?,
        feature = ?,
        url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      row.name,
      row.feature,
      row.url,
      id,
    );

    if (result.changes === 0) {
      const error = new Error('봇 링크를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }

    res.json({
      ok: true,
    });
  }),
);

app.delete(
  '/api/bot-links/:id',
  requireLogin,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const result = db.prepare(`
      DELETE FROM bot_links
      WHERE id = ?
    `).run(id);

    if (result.changes === 0) {
      const error = new Error('봇 링크를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }

    res.json({
      ok: true,
    });
  }),
);

app.put(
  '/api/about',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const currentAbout = getAboutContent();
    const about = req.body || {};

    db.prepare(`
      UPDATE about_page
      SET
        intro = ?,
        interest = ?,
        focus = ?,
        site = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      about.intro === undefined ? currentAbout.intro : optionalText(about.intro, 1000),
      about.interest === undefined ? currentAbout.interest : optionalText(about.interest, 500),
      about.focus === undefined ? currentAbout.focus : optionalText(about.focus, 500),
      about.site === undefined ? currentAbout.site : optionalText(about.site, 500),
    );

    res.json({
      ok: true,
    });
  }),
);

app.put(
  '/api/profile',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const profile = {
      heightCm: optionalNumber(req.body.heightCm),
      memo: optionalText(req.body.memo, 1000),
    };

    db.prepare(`
      UPDATE profile
      SET
        height_cm = ?,
        memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      profile.heightCm,
      profile.memo,
    );

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/summary',
  handleRoute((req, res) => {
    const latestBody = db.prepare(`
      ${bodyLogSelect}
      ORDER BY date DESC, id DESC
      LIMIT 1
    `).get() || null;

    const latestInbody = db.prepare(`
      ${inbodyLogSelect}
      ORDER BY date DESC, id DESC
      LIMIT 1
    `).get() || null;

    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const workoutCountThisWeek = db.prepare(`
      SELECT COUNT(*) AS count
      FROM workout_logs
      WHERE date >= ?
    `).get(weekAgo).count;

    const totalWorkoutCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM workout_logs
    `).get().count;

    res.json({
      ok: true,
      summary: {
        latestBody,
        latestInbody,
        workoutCountThisWeek,
        totalWorkoutCount,
      },
    });
  }),
);

app.get(
  '/api/body-logs',
  handleRoute((req, res) => {
    const bodyLogs = db.prepare(`
      ${bodyLogSelect}
      ORDER BY date DESC, id DESC
    `).all();

    res.json({
      ok: true,
      bodyLogs,
    });
  }),
);

app.post(
  '/api/body-logs',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const date = assertDate(req.body.date);
    const weightKg = requiredNumber(req.body.weightKg, '체중');
    const memo = optionalText(req.body.memo, 500);

    const result = db.prepare(`
      INSERT INTO body_logs (date, weight_kg, memo)
      VALUES (?, ?, ?)
    `).run(date, weightKg, memo);

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  }),
);

app.put(
  '/api/body-logs/:id',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const date = assertDate(req.body.date);
    const weightKg = requiredNumber(req.body.weightKg, '체중');
    const memo = optionalText(req.body.memo, 500);

    db.prepare(`
      UPDATE body_logs
      SET
        date = ?,
        weight_kg = ?,
        memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(date, weightKg, memo, id);

    res.json({
      ok: true,
    });
  }),
);

app.delete(
  '/api/body-logs/:id',
  requireLogin,
  handleRoute((req, res) => {
    const id = getIdParam(req);

    db.prepare(`
      DELETE FROM body_logs
      WHERE id = ?
    `).run(id);

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/inbody-logs',
  handleRoute((req, res) => {
    const inbodyLogs = db.prepare(`
      ${inbodyLogSelect}
      ORDER BY date DESC, id DESC
    `).all();

    res.json({
      ok: true,
      inbodyLogs,
    });
  }),
);

app.post(
  '/api/inbody-logs',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const weightKg = optionalNumber(req.body.weightKg);
    const heightCm = optionalNumber(req.body.heightCm) ?? getProfileHeightCm();
    const bmi = calculateBmi(weightKg, heightCm) ?? optionalNumber(req.body.bmi);

    const row = {
      date: assertDate(req.body.date),
      weightKg,
      muscleKg: optionalNumber(req.body.muscleKg),
      fatKg: optionalNumber(req.body.fatKg),
      bodyFatPercent: optionalNumber(req.body.bodyFatPercent),
      bmi,
      bmr: optionalNumber(req.body.bmr),
      visceralFatLevel: optionalNumber(req.body.visceralFatLevel),
      score: optionalNumber(req.body.score),
      memo: optionalText(req.body.memo, 500),
    };

    const result = db.prepare(`
      INSERT INTO inbody_logs (
        date,
        weight_kg,
        muscle_kg,
        fat_kg,
        body_fat_percent,
        bmi,
        bmr,
        visceral_fat_level,
        score,
        memo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.date,
      row.weightKg,
      row.muscleKg,
      row.fatKg,
      row.bodyFatPercent,
      row.bmi,
      row.bmr,
      row.visceralFatLevel,
      row.score,
      row.memo,
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  }),
);

app.put(
  '/api/inbody-logs/:id',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const id = getIdParam(req);
    const weightKg = optionalNumber(req.body.weightKg);
    const heightCm = optionalNumber(req.body.heightCm) ?? getProfileHeightCm();
    const bmi = calculateBmi(weightKg, heightCm) ?? optionalNumber(req.body.bmi);

    const row = {
      date: assertDate(req.body.date),
      weightKg,
      muscleKg: optionalNumber(req.body.muscleKg),
      fatKg: optionalNumber(req.body.fatKg),
      bodyFatPercent: optionalNumber(req.body.bodyFatPercent),
      bmi,
      bmr: optionalNumber(req.body.bmr),
      visceralFatLevel: optionalNumber(req.body.visceralFatLevel),
      score: optionalNumber(req.body.score),
      memo: optionalText(req.body.memo, 500),
    };

    db.prepare(`
      UPDATE inbody_logs
      SET
        date = ?,
        weight_kg = ?,
        muscle_kg = ?,
        fat_kg = ?,
        body_fat_percent = ?,
        bmi = ?,
        bmr = ?,
        visceral_fat_level = ?,
        score = ?,
        memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      row.date,
      row.weightKg,
      row.muscleKg,
      row.fatKg,
      row.bodyFatPercent,
      row.bmi,
      row.bmr,
      row.visceralFatLevel,
      row.score,
      row.memo,
      id,
    );

    res.json({
      ok: true,
    });
  }),
);

app.delete(
  '/api/inbody-logs/:id',
  requireLogin,
  handleRoute((req, res) => {
    const id = getIdParam(req);

    db.prepare(`
      DELETE FROM inbody_logs
      WHERE id = ?
    `).run(id);

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/workout-logs',
  handleRoute((req, res) => {
    const workoutLogs = db.prepare(`
      ${workoutLogSelect}
      ORDER BY date DESC, id DESC
    `).all();

    res.json({
      ok: true,
      workoutLogs,
    });
  }),
);

app.post(
  '/api/workout-logs',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const row = {
      date: assertDate(req.body.date),
      part: optionalText(req.body.part, 50),
      name: requiredText(req.body.name, '운동명', 100),
      sets: optionalInteger(req.body.sets),
      reps: optionalInteger(req.body.reps),
      weightKg: optionalNumber(req.body.weightKg),
      durationMin: optionalNumber(req.body.durationMin),
      memo: optionalText(req.body.memo, 500),
    };

    const result = db.prepare(`
      INSERT INTO workout_logs (
        date,
        part,
        name,
        sets,
        reps,
        weight_kg,
        duration_min,
        memo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.date,
      row.part,
      row.name,
      row.sets,
      row.reps,
      row.weightKg,
      row.durationMin,
      row.memo,
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  }),
);

app.put(
  '/api/workout-logs/:id',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const id = getIdParam(req);

    const row = {
      date: assertDate(req.body.date),
      part: optionalText(req.body.part, 50),
      name: requiredText(req.body.name, '운동명', 100),
      sets: optionalInteger(req.body.sets),
      reps: optionalInteger(req.body.reps),
      weightKg: optionalNumber(req.body.weightKg),
      durationMin: optionalNumber(req.body.durationMin),
      memo: optionalText(req.body.memo, 500),
    };

    db.prepare(`
      UPDATE workout_logs
      SET
        date = ?,
        part = ?,
        name = ?,
        sets = ?,
        reps = ?,
        weight_kg = ?,
        duration_min = ?,
        memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      row.date,
      row.part,
      row.name,
      row.sets,
      row.reps,
      row.weightKg,
      row.durationMin,
      row.memo,
      id,
    );

    res.json({
      ok: true,
    });
  }),
);

app.delete(
  '/api/workout-logs/:id',
  requireLogin,
  handleRoute((req, res) => {
    const id = getIdParam(req);

    db.prepare(`
      DELETE FROM workout_logs
      WHERE id = ?
    `).run(id);

    res.json({
      ok: true,
    });
  }),
);

app.get(
  '/api/export',
  requireLogin,
  handleRoute((req, res) => {
    const profile = db.prepare(`
      SELECT
        height_cm AS heightCm,
        memo
      FROM profile
      WHERE id = 1
    `).get();
    const about = getAboutContent();
    const homeMainWork = getHomeMainWork();

    const bodyLogs = db.prepare(bodyLogSelect).all();
    const inbodyLogs = db.prepare(inbodyLogSelect).all();
    const workoutLogs = db.prepare(workoutLogSelect).all();
    const gameLinks = db.prepare(gameLinkSelect).all();
    const botLinks = db.prepare(botLinkSelect).all();
    const projects = db.prepare(`
      ${projectSelect}
      ORDER BY sort_order ASC, id ASC
    `).all();
    const homeCurrentItems = db.prepare(`
      ${homeCurrentItemSelect}
      ORDER BY sort_order ASC, id ASC
    `).all();

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 6,
      profile,
      about,
      homeMainWork,
      projects,
      homeCurrentItems,
      bodyLogs,
      inbodyLogs,
      workoutLogs,
      gameLinks,
      botLinks,
    };

    const filename = `body-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }),
);

app.post(
  '/api/import',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const input = req.body || {};

    const profile = input.profile || {};
    const about = input.about || null;
    const homeMainWork = input.homeMainWork || null;
    const projects = Array.isArray(input.projects) ? input.projects : [];
    const homeCurrentItems = Array.isArray(input.homeCurrentItems) ? input.homeCurrentItems : [];
    const bodyLogs = Array.isArray(input.bodyLogs) ? input.bodyLogs : [];
    const inbodyLogs = Array.isArray(input.inbodyLogs) ? input.inbodyLogs : [];
    const workoutLogs = Array.isArray(input.workoutLogs) ? input.workoutLogs : [];
    const gameLinks = Array.isArray(input.gameLinks) ? input.gameLinks : [];
    const botLinks = Array.isArray(input.botLinks) ? input.botLinks : [];
    const currentAbout = getAboutContent();

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM body_logs').run();
      db.prepare('DELETE FROM inbody_logs').run();
      db.prepare('DELETE FROM workout_logs').run();
      db.prepare('DELETE FROM game_links').run();
      db.prepare('DELETE FROM bot_links').run();
      db.prepare('DELETE FROM home_current_items').run();
      db.prepare('DELETE FROM projects').run();

      db.prepare(`
        UPDATE profile
        SET
          height_cm = ?,
          memo = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        optionalNumber(profile.heightCm),
        optionalText(profile.memo, 1000),
      );

      if (about) {
        db.prepare(`
          UPDATE about_page
          SET
            intro = ?,
            interest = ?,
            focus = ?,
            site = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `).run(
          about.intro === undefined ? currentAbout.intro : optionalText(about.intro, 1000),
          about.interest === undefined ? currentAbout.interest : optionalText(about.interest, 500),
          about.focus === undefined ? currentAbout.focus : optionalText(about.focus, 500),
          about.site === undefined ? currentAbout.site : optionalText(about.site, 500),
        );
      }

      if (homeMainWork) {
        db.prepare(`
          UPDATE home_main_work
          SET
            title = ?,
            content = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `).run(
          homeMainWork.title === undefined ? '메인 작업물' : requiredText(homeMainWork.title, '메인 작업물 제목', 120),
          homeMainWork.content === undefined ? '' : optionalText(homeMainWork.content, 4000),
        );
      }

      const insertProject = db.prepare(`
        INSERT INTO projects (badge, title, url, description, bullets, is_current, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const importedProjects = projects
        .map((project, index) => ({
          badge: optionalText(project.badge, 50),
          title: optionalText(project.title, 120),
          url: optionalUrl(project.url, '프로젝트 링크'),
          description: optionalText(project.description, 1000),
          bullets: Array.isArray(project.bullets)
            ? project.bullets.map((item) => optionalText(item, 200)).filter(Boolean).slice(0, 8)
            : String(project.bullets ?? '')
                .split(/\r?\n/)
                .map((item) => optionalText(item, 200))
                .filter(Boolean)
                .slice(0, 8),
          isCurrent: project.isCurrent ? 1 : 0,
          sortOrder: index,
        }))
        .filter((project) => project.badge && project.title);

      importedProjects.forEach((project) => {
        insertProject.run(
          project.badge,
          project.title,
          project.url,
          project.description,
          project.bullets.join('\n'),
          project.isCurrent,
          project.sortOrder,
        );
      });

      if (importedProjects.length > 0) {
        syncHomeCurrentItemsFromProjects(importedProjects);
      } else {
        const insertHomeCurrentItem = db.prepare(`
          INSERT INTO home_current_items (text, sort_order)
          VALUES (?, ?)
        `);

        const importedHomeCurrentItems = homeCurrentItems
          .map((item) => optionalText(item.text ?? item, 120))
          .filter(Boolean)
          .slice(0, 20);

        importedHomeCurrentItems.forEach((text, index) => {
          insertHomeCurrentItem.run(text, index);
        });
      }

      const insertBody = db.prepare(`
        INSERT INTO body_logs (date, weight_kg, memo)
        VALUES (?, ?, ?)
      `);

      for (const log of bodyLogs) {
        insertBody.run(
          assertDate(log.date),
          requiredNumber(log.weightKg, '체중'),
          optionalText(log.memo, 500),
        );
      }

      const insertInbody = db.prepare(`
        INSERT INTO inbody_logs (
          date,
          weight_kg,
          muscle_kg,
          fat_kg,
          body_fat_percent,
          bmi,
          bmr,
          visceral_fat_level,
          score,
          memo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const importedHeightCm = optionalNumber(profile.heightCm);

      for (const log of inbodyLogs) {
        const weightKg = optionalNumber(log.weightKg);
        const bmi = calculateBmi(weightKg, importedHeightCm) ?? optionalNumber(log.bmi);

        insertInbody.run(
          assertDate(log.date),
          weightKg,
          optionalNumber(log.muscleKg),
          optionalNumber(log.fatKg),
          optionalNumber(log.bodyFatPercent),
          bmi,
          optionalNumber(log.bmr),
          optionalNumber(log.visceralFatLevel),
          optionalNumber(log.score),
          optionalText(log.memo, 500),
        );
      }

      const insertWorkout = db.prepare(`
        INSERT INTO workout_logs (
          date,
          part,
          name,
          sets,
          reps,
          weight_kg,
          duration_min,
          memo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const log of workoutLogs) {
        insertWorkout.run(
          assertDate(log.date),
          optionalText(log.part, 50),
          requiredText(log.name, '운동명', 100),
          optionalInteger(log.sets),
          optionalInteger(log.reps),
          optionalNumber(log.weightKg),
          optionalNumber(log.durationMin),
          optionalText(log.memo, 500),
        );
      }

      const insertGameLink = db.prepare(`
        INSERT INTO game_links (name, nickname, url)
        VALUES (?, ?, ?)
      `);

      for (const link of gameLinks) {
        insertGameLink.run(
          requiredText(link.name, '게임 이름', 100),
          requiredText(link.nickname, '닉네임', 100),
          requiredUrl(link.url, '게임 링크'),
        );
      }

      const insertBotLink = db.prepare(`
        INSERT INTO bot_links (name, feature, url)
        VALUES (?, ?, ?)
      `);

      for (const link of botLinks) {
        insertBotLink.run(
          requiredText(link.name, '봇 이름', 100),
          requiredText(link.feature, '주요 기능', 200),
          requiredUrl(link.url, '봇 링크'),
        );
      }
    });

    transaction();

    res.json({
      ok: true,
    });
  }),
);

app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(?:css|js|html)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      error: 'NOT_FOUND',
      message: 'API를 찾을 수 없습니다.',
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[body-tracker] listening on http://127.0.0.1:${PORT}`);
});
