import 'dotenv/config';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import connectSqlite3 from 'connect-sqlite3';
import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3100);
const isProduction = process.env.NODE_ENV === 'production';
const siteTitle = process.env.SITE_TITLE || 'Body Tracker';

const dataDir = path.join(__dirname, 'data');
const publicDir = path.join(__dirname, 'public');
const dbPath = path.join(dataDir, 'body-tracker.sqlite');

const sessionDir = path.join(dataDir, 'sessions');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(sessionDir, { recursive: true });

const SQLiteStore = connectSqlite3(session);

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[WARN] ADMIN_PASSWORD is not set.');
}

if (!process.env.SESSION_SECRET) {
  console.warn('[WARN] SESSION_SECRET is not set. Set a long random string in .env.');
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    height_cm REAL,
    target_weight_kg REAL,
    target_muscle_kg REAL,
    target_body_fat_percent REAL,
    memo TEXT NOT NULL DEFAULT '',
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
`);

db.prepare(`
  INSERT OR IGNORE INTO profile (
    id,
    height_cm,
    target_weight_kg,
    target_muscle_kg,
    target_body_fat_percent,
    memo
  )
  VALUES (1, NULL, NULL, NULL, NULL, '')
`).run();

app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    name: 'bt.sid',
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: sessionDir,
    }),
    secret: process.env.SESSION_SECRET || 'dev-only-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

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
    try {
      return fn(req, res, next);
    } catch (error) {
      const status = error.status || 500;

      if (status >= 500) {
        console.error(error);
      }

      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'SERVER_ERROR' : 'BAD_REQUEST',
        message: error.message || '서버 오류가 발생했습니다.',
      });
    }
  };
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

app.get('/api/me', (req, res) => {
  res.json({
    ok: true,
    loggedIn: Boolean(req.session?.isAdmin),
    siteTitle,
  });
});

app.post(
  '/api/login',
  requireJson,
  handleRoute((req, res) => {
    const { password } = req.body;

    const adminPassword = process.env.ADMIN_PASSWORD || '';

    if (!adminPassword || !safeEqualText(password, adminPassword)) {
      return res.status(401).json({
        ok: false,
        error: 'INVALID_PASSWORD',
        message: '비밀번호가 틀렸습니다.',
      });
    }

    req.session.isAdmin = true;

    return res.json({
      ok: true,
    });
  }),
);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({
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
        target_weight_kg AS targetWeightKg,
        target_muscle_kg AS targetMuscleKg,
        target_body_fat_percent AS targetBodyFatPercent,
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

app.put(
  '/api/profile',
  requireLogin,
  requireJson,
  handleRoute((req, res) => {
    const profile = {
      heightCm: optionalNumber(req.body.heightCm),
      targetWeightKg: optionalNumber(req.body.targetWeightKg),
      targetMuscleKg: optionalNumber(req.body.targetMuscleKg),
      targetBodyFatPercent: optionalNumber(req.body.targetBodyFatPercent),
      memo: optionalText(req.body.memo, 1000),
    };

    db.prepare(`
      UPDATE profile
      SET
        height_cm = ?,
        target_weight_kg = ?,
        target_muscle_kg = ?,
        target_body_fat_percent = ?,
        memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      profile.heightCm,
      profile.targetWeightKg,
      profile.targetMuscleKg,
      profile.targetBodyFatPercent,
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
    const row = {
      date: assertDate(req.body.date),
      weightKg: optionalNumber(req.body.weightKg),
      muscleKg: optionalNumber(req.body.muscleKg),
      fatKg: optionalNumber(req.body.fatKg),
      bodyFatPercent: optionalNumber(req.body.bodyFatPercent),
      bmi: optionalNumber(req.body.bmi),
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

    const row = {
      date: assertDate(req.body.date),
      weightKg: optionalNumber(req.body.weightKg),
      muscleKg: optionalNumber(req.body.muscleKg),
      fatKg: optionalNumber(req.body.fatKg),
      bodyFatPercent: optionalNumber(req.body.bodyFatPercent),
      bmi: optionalNumber(req.body.bmi),
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
        target_weight_kg AS targetWeightKg,
        target_muscle_kg AS targetMuscleKg,
        target_body_fat_percent AS targetBodyFatPercent,
        memo
      FROM profile
      WHERE id = 1
    `).get();

    const bodyLogs = db.prepare(bodyLogSelect).all();
    const inbodyLogs = db.prepare(inbodyLogSelect).all();
    const workoutLogs = db.prepare(workoutLogSelect).all();

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profile,
      bodyLogs,
      inbodyLogs,
      workoutLogs,
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
    const bodyLogs = Array.isArray(input.bodyLogs) ? input.bodyLogs : [];
    const inbodyLogs = Array.isArray(input.inbodyLogs) ? input.inbodyLogs : [];
    const workoutLogs = Array.isArray(input.workoutLogs) ? input.workoutLogs : [];

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM body_logs').run();
      db.prepare('DELETE FROM inbody_logs').run();
      db.prepare('DELETE FROM workout_logs').run();

      db.prepare(`
        UPDATE profile
        SET
          height_cm = ?,
          target_weight_kg = ?,
          target_muscle_kg = ?,
          target_body_fat_percent = ?,
          memo = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        optionalNumber(profile.heightCm),
        optionalNumber(profile.targetWeightKg),
        optionalNumber(profile.targetMuscleKg),
        optionalNumber(profile.targetBodyFatPercent),
        optionalText(profile.memo, 1000),
      );

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

      for (const log of inbodyLogs) {
        insertInbody.run(
          assertDate(log.date),
          optionalNumber(log.weightKg),
          optionalNumber(log.muscleKg),
          optionalNumber(log.fatKg),
          optionalNumber(log.bodyFatPercent),
          optionalNumber(log.bmi),
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
    });

    transaction();

    res.json({
      ok: true,
    });
  }),
);

app.use(express.static(publicDir));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      error: 'NOT_FOUND',
      message: 'API를 찾을 수 없습니다.',
    });
  }

  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[body-tracker] listening on http://127.0.0.1:${PORT}`);
});