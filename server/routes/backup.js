import { Router } from 'express';
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.EDUVERSE_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const router = Router();

// ─── List backups ───────────────────────────────────────────────
router.get('/', (req, res) => {
  const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
  res.json({ success: true, data: backups });
});

// ─── Create JSON backup ────────────────────────────────────────
router.post('/json', (req, res) => {
  const { modules } = req.body;
  const backup = {};
  const allModules = modules || ['students', 'grades', 'quizzes', 'settings'];

  if (allModules.includes('students')) {
    backup.grade_students = db.prepare('SELECT * FROM grade_students').all();
    backup.quiz_students = db.prepare('SELECT * FROM quiz_students').all();
    backup.grade_databases = db.prepare('SELECT * FROM grade_databases').all();
    backup.quiz_student_databases = db.prepare('SELECT * FROM quiz_student_databases').all();
  }

  if (allModules.includes('grades')) {
    backup.grading_weights = db.prepare('SELECT * FROM grading_weights').all();
    backup.activity_config = db.prepare('SELECT * FROM activity_config').all();
    backup.student_scores = db.prepare('SELECT * FROM student_scores').all();
    backup.exam_types = db.prepare('SELECT * FROM exam_types').all();
    backup.exam_scores = db.prepare('SELECT * FROM exam_scores').all();
    backup.student_groups = db.prepare('SELECT * FROM student_groups').all();
    backup.grade_admins = db.prepare('SELECT * FROM grade_admins').all();
    backup.grade_teachers = db.prepare('SELECT * FROM grade_teachers').all();
  }

  if (allModules.includes('quizzes')) {
    backup.quizzes = db.prepare('SELECT * FROM quizzes').all();
    backup.questions = db.prepare('SELECT * FROM questions').all();
    backup.quiz_attempts = db.prepare('SELECT * FROM quiz_attempts').all();
    backup.quiz_answers = db.prepare('SELECT * FROM quiz_answers').all();
    backup.quiz_grade_levels = db.prepare('SELECT * FROM quiz_grade_levels').all();
    backup.quiz_teachers = db.prepare('SELECT * FROM quiz_teachers').all();
    backup.retake_requests = db.prepare('SELECT * FROM retake_requests').all();
    backup.deadline_requests = db.prepare('SELECT * FROM deadline_requests').all();
  }

  if (allModules.includes('settings')) {
    backup.settings = db.prepare('SELECT * FROM settings').all();
  }

  backup._meta = {
    version: '1.0.0',
    app: 'EDUVERSE',
    author: 'Joseph Brylle D. Egay',
    createdAt: new Date().toISOString(),
    modules: allModules
  };

  const filename = `eduverse_backup_${Date.now()}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

  const stats = fs.statSync(filepath);
  db.prepare('INSERT INTO backups (type, filename, size) VALUES (?, ?, ?)')
    .run('json', filename, stats.size);

  res.json({ success: true, filename, size: stats.size });
});

// ─── Download backup file ───────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ success: false, message: 'Backup file not found' });
    return;
  }
  res.download(filepath);
});

// ─── Restore from JSON ─────────────────────────────────────────
router.post('/restore/json', (req, res) => {
  const { data, modules } = req.body;
  if (!data) {
    res.json({ success: false, message: 'No backup data provided' });
    return;
  }

  const restoreModules = modules || data._meta?.modules || ['students', 'grades', 'quizzes', 'settings'];

  const transaction = db.transaction(() => {
    if (restoreModules.includes('students') && data.grade_students) {
      db.prepare('DELETE FROM grade_students').run();
      const insert = db.prepare(`
        INSERT INTO grade_students (id, database_id, student_id, thai_name, english_name, section, class_number, password, password_reset_request, password_reset_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of data.grade_students) {
        insert.run(s.id, s.database_id, s.student_id, s.thai_name, s.english_name, s.section, s.class_number, s.password, s.password_reset_request, s.password_reset_date);
      }
    }

    if (restoreModules.includes('students') && data.quiz_students) {
      db.prepare('DELETE FROM quiz_students').run();
      const insert = db.prepare(`
        INSERT INTO quiz_students (id, student_id, thai_name, english_name, section, class_no, grade_level, password, database_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of data.quiz_students) {
        insert.run(s.id, s.student_id, s.thai_name, s.english_name, s.section, s.class_no, s.grade_level, s.password, s.database_id);
      }
    }

    if (restoreModules.includes('students') && data.grade_databases) {
      db.prepare('DELETE FROM grade_databases').run();
      const insert = db.prepare('INSERT INTO grade_databases (id, name, spreadsheet_link, created_at) VALUES (?, ?, ?, ?)');
      for (const d of data.grade_databases) { insert.run(d.id, d.name, d.spreadsheet_link, d.created_at); }
    }

    if (restoreModules.includes('grades') && data.student_scores) {
      db.prepare('DELETE FROM student_scores').run();
      const insert = db.prepare('INSERT INTO student_scores (id, database_id, student_id, period, score_type, slot, score) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const s of data.student_scores) { insert.run(s.id, s.database_id, s.student_id, s.period, s.score_type, s.slot, s.score); }
    }

    if (restoreModules.includes('grades') && data.grading_weights) {
      db.prepare('DELETE FROM grading_weights').run();
      const insert = db.prepare(`
        INSERT INTO grading_weights (id, database_id, midterm_collective, final_initial, final_final, midterm_exam, final_exam,
          pass_midterm, pass_initial, pass_final, pass_overall, freeze_final)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const w of data.grading_weights) {
        insert.run(w.id, w.database_id, w.midterm_collective, w.final_initial, w.final_final, w.midterm_exam, w.final_exam,
          w.pass_midterm, w.pass_initial, w.pass_final, w.pass_overall, w.freeze_final);
      }
    }

    if (restoreModules.includes('grades') && data.exam_scores) {
      db.prepare('DELETE FROM exam_scores').run();
      const insert = db.prepare('INSERT INTO exam_scores (id, database_id, student_id, side, slot, score) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of data.exam_scores) { insert.run(e.id, e.database_id, e.student_id, e.side, e.slot, e.score); }
    }

    if (restoreModules.includes('quizzes') && data.quizzes) {
      db.prepare('DELETE FROM quiz_answers').run();
      db.prepare('DELETE FROM quiz_attempts').run();
      db.prepare('DELETE FROM questions').run();
      db.prepare('DELETE FROM quiz_grade_levels').run();
      db.prepare('DELETE FROM retake_requests').run();
      db.prepare('DELETE FROM deadline_requests').run();
      db.prepare('DELETE FROM quizzes').run();

      const insertQ = db.prepare(`
        INSERT INTO quizzes (id, title, type, subject, grade_level, passing_score, attempts_allowed,
          time_limit, retake_allowed, randomize_questions, randomize_choices, status,
          created_by, start_date, deadline, created_at, question_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const q of data.quizzes) {
        insertQ.run(q.id, q.title, q.type, q.subject, q.grade_level, q.passing_score, q.attempts_allowed,
          q.time_limit, q.retake_allowed, q.randomize_questions, q.randomize_choices, q.status,
          q.created_by, q.start_date, q.deadline, q.created_at, q.question_count);
      }

      if (data.questions) {
        const insertQn = db.prepare(`
          INSERT INTO questions (id, quiz_id, question_text, question_type, choice_a, choice_b, choice_c, choice_d,
            correct_answer, points, question_time_limit, order_num)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const q of data.questions) {
          insertQn.run(q.id, q.quiz_id, q.question_text, q.question_type, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
            q.correct_answer, q.points, q.question_time_limit, q.order_num);
        }
      }

      if (data.quiz_attempts) {
        const insertA = db.prepare(`
          INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, grade_level, section, class_no,
            start_time, end_time, score, total_points, percentage, result, tab_switch_count, submitted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of data.quiz_attempts) {
          insertA.run(a.id, a.quiz_id, a.student_id, a.student_name, a.grade_level, a.section, a.class_no,
            a.start_time, a.end_time, a.score, a.total_points, a.percentage, a.result, a.tab_switch_count, a.submitted);
        }
      }

      if (data.quiz_answers) {
        const insertAn = db.prepare(`
          INSERT INTO quiz_answers (id, attempt_id, question_id, student_answer, is_correct, points_earned)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const a of data.quiz_answers) { insertAn.run(a.id, a.attempt_id, a.question_id, a.student_answer, a.is_correct, a.points_earned); }
      }

      if (data.quiz_grade_levels) {
        const insertGL = db.prepare('INSERT INTO quiz_grade_levels (id, quiz_id, grade_level) VALUES (?, ?, ?)');
        for (const gl of data.quiz_grade_levels) { insertGL.run(gl.id, gl.quiz_id, gl.grade_level); }
      }
    }

    if (restoreModules.includes('settings') && data.settings) {
      for (const s of data.settings) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(s.key, s.value);
      }
    }
  });

  transaction();
  res.json({ success: true, message: 'Backup restored successfully', modules: restoreModules });
});

// ─── SQLite database backup ─────────────────────────────────────
router.post('/sqlite', (req, res) => {
  const filename = `eduverse_backup_${Date.now()}.db`;
  const filepath = path.join(BACKUP_DIR, filename);
  db.backup(filepath).then(() => {
    const stats = fs.statSync(filepath);
    db.prepare('INSERT INTO backups (type, filename, size) VALUES (?, ?, ?)').run('sqlite', filename, stats.size);
    res.json({ success: true, filename, size: stats.size });
  }).catch(err => {
    res.json({ success: false, message: err.message });
  });
});

// ─── Delete backup ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
  if (backup) {
    const filepath = path.join(BACKUP_DIR, backup.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    db.prepare('DELETE FROM backups WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// ─── Export all data as Excel-compatible JSON ───────────────────
router.get('/export/excel', (req, res) => {
  const { databaseId, type } = req.query;

  if (type === 'grades') {
    const students = db.prepare('SELECT * FROM grade_students WHERE database_id = ? ORDER BY section, class_number').all(databaseId);
    const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);
    const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ?').all(databaseId);

    const rows = students.map(student => {
      const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
        .all(databaseId, student.student_id);
      const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
        .all(databaseId, student.student_id);

      const row = {
        'Student ID': student.student_id,
        'Thai Name': student.thai_name,
        'English Name': student.english_name,
        'Section': student.section,
        'Class Number': student.class_number
      };

      for (const s of scores) {
        row[`${s.period}_${s.score_type}_${s.slot}`] = s.score;
      }
      for (const e of examScoresData) {
        row[`exam_${e.side}_${e.slot}`] = e.score;
      }

      return row;
    });

    res.json({ success: true, data: rows, weights, activities });
    return;
  }

  if (type === 'quiz-results') {
    const attempts = db.prepare(`
      SELECT qa.*, q.title as quiz_title, q.subject, q.type as quiz_type
      FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
      WHERE qa.submitted = 1 ORDER BY q.title, qa.percentage DESC
    `).all();

    const rows = attempts.map(a => ({
      'Quiz Title': a.quiz_title,
      'Subject': a.subject,
      'Type': a.quiz_type,
      'Student ID': a.student_id,
      'Student Name': a.student_name,
      'Grade Level': a.grade_level,
      'Section': a.section,
      'Score': a.score,
      'Total Points': a.total_points,
      'Percentage': a.percentage,
      'Result': a.result,
      'Tab Switches': a.tab_switch_count,
      'Date': a.end_time
    }));

    res.json({ success: true, data: rows });
    return;
  }

  res.json({ success: false, message: 'Type parameter required (grades or quiz-results)' });
});

export default router;
