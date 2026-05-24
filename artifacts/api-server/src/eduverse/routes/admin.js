import { Router } from 'express';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';
import { deleteGradeDatabaseCascade } from '../utils/gradeDbCascade.js';

const router = Router();
const DEFAULT_TEACHER_PASSWORD = 'teacher123';

const DEFAULT_GRADE_LEVELS = [
  'MATHAYUM 1', 'MATHAYUM 2', 'MATHAYUM 3', 'MATHAYUM 4', 'MATHAYUM 5', 'MATHAYUM 6'
];
router.use((req, res, next) => {
  if (!req.user || req.user.type !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
});

router.get('/teachers', (req, res) => {
  const teachers = db.prepare('SELECT id, user_id, name FROM grade_teachers ORDER BY user_id').all();
  const quizTeachers = db.prepare('SELECT id, username, name, subjects, grade_levels FROM quiz_teachers ORDER BY username').all();
  const permissions = db.prepare('SELECT teacher_user_id, database_id, access_level FROM grade_teacher_permissions').all();
  const byTeacher = {};
  permissions.forEach((p) => {
    const key = String(p.teacher_user_id || '').toLowerCase();
    if (!byTeacher[key]) byTeacher[key] = [];
    byTeacher[key].push({ databaseId: p.database_id, accessLevel: p.access_level });
  });
  const merged = new Map();
  teachers.forEach((t) => {
    const key = String(t.user_id || '').toLowerCase();
    merged.set(key, {
      ...t,
      user_id: t.user_id,
      permissions: byTeacher[key] || [],
      gradeModeEnabled: true,
      quizModeEnabled: false
    });
  });
  quizTeachers.forEach((t) => {
    const key = String(t.username || '').toLowerCase();
    if (merged.has(key)) {
      const existing = merged.get(key);
      existing.quizModeEnabled = true;
      existing.quizSubjects = t.subjects || 'ALL';
      existing.quizGradeLevels = t.grade_levels || '';
      merged.set(key, existing);
    } else {
      merged.set(key, {
        id: `quiz-${t.id}`,
        user_id: t.username,
        name: t.name,
        permissions: [],
        gradeModeEnabled: false,
        quizModeEnabled: true,
        quizSubjects: t.subjects || 'ALL',
        quizGradeLevels: t.grade_levels || ''
      });
    }
  });
  res.json({
    success: true,
    data: Array.from(merged.values()).sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)))
  });
});

router.post('/teachers', (req, res) => {
  const { userId, name, password, teacherMode } = req.body;
  const normalizedUserId = String(userId || '').trim().toLowerCase();
  if (!normalizedUserId) return res.json({ success: false, message: 'userId is required' });
  const normalizedName = String(name || '').trim() || 'Teacher';
  const normalizedPassword = String(password || '').trim() || DEFAULT_TEACHER_PASSWORD;
  const mode = String(teacherMode || 'both').toLowerCase();
  try {
    const txn = db.transaction(() => {
      if (mode === 'grades' || mode === 'both') {
        db.prepare('INSERT OR IGNORE INTO grade_teachers (user_id, name, password) VALUES (?, ?, ?)')
          .run(normalizedUserId, normalizedName, normalizedPassword);
        db.prepare('UPDATE grade_teachers SET name = ?, password = ? WHERE user_id = ?')
          .run(normalizedName, normalizedPassword, normalizedUserId);
      }
      if (mode === 'quiz' || mode === 'both') {
        db.prepare('INSERT OR IGNORE INTO quiz_teachers (username, name, password, subjects, grade_levels) VALUES (?, ?, ?, ?, ?)')
          .run(normalizedUserId, normalizedName, normalizedPassword, 'ALL', 'MATHAYUM 1,MATHAYUM 2,MATHAYUM 3,MATHAYUM 4,MATHAYUM 5,MATHAYUM 6');
        db.prepare('UPDATE quiz_teachers SET name = ?, password = ? WHERE username = ?')
          .run(normalizedName, normalizedPassword, normalizedUserId);
      }
    });
    txn();
    res.json({ success: true, message: 'Teacher account saved' });
  } catch (e) {
    res.json({ success: false, message: e.message.includes('UNIQUE') ? 'Teacher already exists' : e.message });
  }
});

router.delete('/teachers/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  db.prepare('DELETE FROM grade_teacher_permissions WHERE lower(teacher_user_id) = lower(?)').run(userId);
  db.prepare('DELETE FROM grade_teachers WHERE lower(user_id) = lower(?)').run(userId);
  db.prepare('DELETE FROM quiz_teachers WHERE lower(username) = lower(?)').run(userId);
  res.json({ success: true });
});

router.post('/teachers/:userId/permissions', (req, res) => {
  const { permissions } = req.body;
  const userId = String(req.params.userId || '').trim().toLowerCase();
  const upsert = db.prepare(`
    INSERT INTO grade_teacher_permissions (teacher_user_id, database_id, access_level)
    VALUES (?, ?, ?)
    ON CONFLICT(teacher_user_id, database_id) DO UPDATE SET access_level=excluded.access_level
  `);
  const txn = db.transaction(() => {
    for (const p of (permissions || [])) {
      upsert.run(userId, p.databaseId, p.accessLevel || 'NO_ACCESS');
    }
  });
  txn();
  res.json({ success: true });
});

router.get('/assigned-grade-levels', (req, res) => {
  const mode = req.query.mode === 'B' || req.query.mode === 'quiz' ? 'B' : 'A';
  const rows = db.prepare(
    'SELECT DISTINCT grade_level FROM section_database_assignments WHERE mode = ? ORDER BY grade_level'
  ).all(mode);
  const gradeLevels = rows.map((r) => r.grade_level).filter(Boolean);
  res.json({
    success: true,
    gradeLevels: gradeLevels.length > 0 ? gradeLevels : DEFAULT_GRADE_LEVELS
  });
});

router.post('/databases', (req, res) => {
  const { name, spreadsheetLink } = req.body;
  if (!name?.trim()) {
    return res.json({ success: false, message: 'Database name is required' });
  }
  const count = db.prepare('SELECT COUNT(*) as cnt FROM grade_databases').get().cnt;
  if (count >= 5) {
    return res.json({ success: false, message: 'Maximum 5 databases allowed' });
  }
  const result = db.prepare('INSERT INTO grade_databases (name, spreadsheet_link) VALUES (?, ?)')
    .run(name.trim(), spreadsheetLink || '');
  invalidateCache('/api/grades');
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/databases/:id', (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  const spreadsheetLink = req.body?.spreadsheetLink;
  if (!id) return res.json({ success: false, message: 'Invalid database id' });
  if (!name) return res.json({ success: false, message: 'Database name is required' });

  const existing = db.prepare('SELECT id FROM grade_databases WHERE id = ?').get(id);
  if (!existing) return res.json({ success: false, message: 'Database not found' });

  db.prepare('UPDATE grade_databases SET name = ?, spreadsheet_link = COALESCE(?, spreadsheet_link) WHERE id = ?')
    .run(name, spreadsheetLink ?? null, id);
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Database updated' });
});

router.delete('/databases/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM grade_databases WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.json({ success: false, message: 'Database not found' });
    }
    deleteGradeDatabaseCascade(req.params.id);
    invalidateCache('/api/grades');
    invalidateCache('/api/students');
    res.json({ success: true, message: 'Database deleted' });
  } catch (e) {
    res.json({ success: false, message: e.message || 'Delete failed' });
  }
});

router.get('/section-assignments', (req, res) => {
  const rows = db.prepare('SELECT * FROM section_database_assignments ORDER BY mode, grade_level, section').all();
  res.json({ success: true, data: rows });
});

router.post('/section-assignments', (req, res) => {
  const { mode, gradeLevel, section, databaseId } = req.body;
  if (!mode || !gradeLevel || !section?.trim() || !databaseId) {
    return res.json({ success: false, message: 'Mode, grade level, section, and database are required' });
  }
  db.prepare(`
    INSERT INTO section_database_assignments (mode, grade_level, section, database_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(mode, grade_level, section) DO UPDATE SET database_id=excluded.database_id
  `).run(mode, gradeLevel, section, databaseId);
  res.json({ success: true });
});

export default router;
