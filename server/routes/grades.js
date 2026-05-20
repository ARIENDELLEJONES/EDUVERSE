import { Router } from 'express';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';
import {
  canReadGradeDatabase,
  requireGradeAdmin,
  requireGradeRead,
  requireGradeWrite
} from '../middleware/gradeAccess.js';
import { deleteGradeDatabaseCascade } from '../utils/gradeDbCascade.js';
import XLSX from 'xlsx';

const router = Router();

/** Numeric sort for class_number (1,2,10 not 1,10,2) */
const SQL_ORDER_CLASS = `ORDER BY section,
  CASE WHEN TRIM(COALESCE(class_number, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_number, '')) <> ''
    THEN CAST(class_number AS INTEGER) ELSE 999999 END,
  class_number`;
const SQL_ORDER_CLASS_IN_SECTION = `ORDER BY
  CASE WHEN TRIM(COALESCE(class_number, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_number, '')) <> ''
    THEN CAST(class_number AS INTEGER) ELSE 999999 END,
  class_number`;

const dbIdFromParams = (req) => req.params.id || req.params.databaseId;
const dbIdFromBody = (req) => req.body?.databaseId;
const dbIdFromQuery = (req) => req.query?.databaseId;
function calcOverall(weights, values) {
  const w = weights || {};
  const defaults = (
    values.midtermTotal * ((w.midterm_collective || 0) / 100) +
    values.finalInitialTotal * ((w.final_initial || 0) / 100) +
    values.finalFinalTotal * ((w.final_final || 0) / 100) +
    values.midtermExamTotal * ((w.midterm_exam || 0) / 100) +
    values.finalExamTotal * ((w.final_exam || 0) / 100)
  );
  const formula = String(w.custom_formula || '').trim();
  if (!formula) return defaults;
  try {
    const fn = new Function(
      'midtermCollective', 'finalInitial', 'finalFinal', 'midtermExam', 'finalExam',
      'midtermWeight', 'finalInitialWeight', 'finalFinalWeight', 'midtermExamWeight', 'finalExamWeight',
      `return (${formula});`
    );
    const val = Number(fn(
      Number(values.midtermTotal || 0), Number(values.finalInitialTotal || 0), Number(values.finalFinalTotal || 0),
      Number(values.midtermExamTotal || 0), Number(values.finalExamTotal || 0),
      Number(w.midterm_collective || 0), Number(w.final_initial || 0), Number(w.final_final || 0),
      Number(w.midterm_exam || 0), Number(w.final_exam || 0)
    ));
    return Number.isFinite(val) ? val : defaults;
  } catch {
    return defaults;
  }
}

// ─── Preserves loginStudent from Student/Code.gs ────────────────
router.post('/login-student', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.json({ success: false, message: 'Student ID and password are required' });
    return;
  }
  const student = db.prepare(`
    SELECT gs.*, gd.name as db_name FROM grade_students gs
    JOIN grade_databases gd ON gs.database_id = gd.id
    WHERE gs.student_id = ?
  `).get(String(username).trim());

  if (!student || String(student.password).trim() !== String(password).trim()) {
    res.json({ success: false, message: 'Invalid Student ID or Password' });
    return;
  }

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(student.database_id);
  const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
    .all(student.database_id, student.student_id);
  const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
    .all(student.database_id, student.student_id);
  const examTypesData = db.prepare('SELECT * FROM exam_types WHERE database_id = ?')
    .all(student.database_id);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ?')
    .all(student.database_id);

  res.json({
    success: true,
    student: {
      id: student.student_id,
      thai: student.thai_name,
      english: student.english_name,
      section: student.section,
      class: student.class_number
    },
    weights: weights || {},
    scores,
    examScores: examScoresData,
    examTypes: examTypesData,
    activities
  });
});

// ─── Preserves requestPasswordReset from Student/Code.gs ────────
router.post('/password-reset', (req, res) => {
  const { studentID } = req.body;
  const student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(String(studentID).trim());
  if (!student) {
    res.json({ success: false, message: 'Student ID not found.' });
    return;
  }
  db.prepare('UPDATE grade_students SET password_reset_request = ?, password_reset_date = ? WHERE student_id = ?')
    .run('PASSWORD CHANGE REQUEST', new Date().toISOString(), student.student_id);
  res.json({ success: true, message: 'Password request submitted successfully.' });
});

// ─── Database Management (preserves loadDatabase logic) ─────────
router.get('/databases', (req, res) => {
  let databases = db.prepare('SELECT * FROM grade_databases ORDER BY id').all();
  if (req.user?.type === 'grade_teacher') {
    const perms = req.user.data?.permissions || [];
    const allowed = new Set(
      perms.filter((p) => p.access_level !== 'NO_ACCESS').map((p) => Number(p.database_id))
    );
    databases = databases.filter((d) => allowed.has(d.id));
  }
  res.json({ success: true, databases });
});

router.post('/databases', requireGradeAdmin, (req, res) => {
  const { name, spreadsheetLink } = req.body;
  const count = db.prepare('SELECT COUNT(*) as cnt FROM grade_databases').get().cnt;
  if (count >= 5) {
    res.json({ success: false, message: 'Maximum 5 databases allowed' });
    return;
  }
  const result = db.prepare('INSERT INTO grade_databases (name, spreadsheet_link) VALUES (?, ?)')
    .run(name, spreadsheetLink || '');
  invalidateCache('/api/grades');
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/databases/:id', requireGradeAdmin, (req, res) => {
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

router.get('/database/:id', requireGradeRead(dbIdFromParams), (req, res) => {
  const database = db.prepare('SELECT * FROM grade_databases WHERE id = ?').get(req.params.id);
  if (!database) {
    res.json({ success: false, message: 'Database not found' });
    return;
  }
  if (req.user && !canReadGradeDatabase(req.user, database.id)) {
    res.status(403).json({ success: false, message: 'No access to this database' });
    return;
  }
  const students = db.prepare(`SELECT * FROM grade_students WHERE database_id = ? ${SQL_ORDER_CLASS}`).all(req.params.id);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(req.params.id);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot').all(req.params.id);
  const examTypes = db.prepare('SELECT * FROM exam_types WHERE database_id = ? ORDER BY side, slot').all(req.params.id);

  res.json({ success: true, database, students, weights: weights || {}, activities, examTypes });
});

// ─── Student search (preserves searchStudentRecords) ────────────
router.get('/student/:studentId/search', (req, res) => {
  const { databaseId } = req.query;
  const studentId = req.params.studentId;

  let student;
  if (databaseId) {
    student = db.prepare('SELECT * FROM grade_students WHERE student_id = ? AND database_id = ?').get(studentId, databaseId);
  } else {
    student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(studentId);
  }

  if (!student) {
    res.json({ success: false, message: 'Student not found' });
    return;
  }

  const dbId = student.database_id;
  const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?').all(dbId, studentId);
  const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?').all(dbId, studentId);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(dbId);
  const examTypes = db.prepare('SELECT * FROM exam_types WHERE database_id = ?').all(dbId);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ?').all(dbId);

  res.json({
    success: true,
    student: {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      databaseId: dbId
    },
    scores,
    examScores: examScoresData,
    weights: weights || {},
    examTypes,
    activities
  });
});

// ─── Save scores (preserves saveStudentScoreBlock) ──────────────
router.post('/student/scores', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, studentId, period, scoreType, scores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, period, score_type, slot)
    DO UPDATE SET score = excluded.score
  `);

  const transaction = db.transaction(() => {
    for (const s of scores) {
      upsert.run(databaseId, studentId, period, scoreType, s.slot, s.score);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Scores saved' });
});

router.post('/student/scores/bulk', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, studentId, scores } = req.body;
  if (!databaseId || !studentId || !Array.isArray(scores)) {
    return res.json({ success: false, message: 'databaseId, studentId, and scores array are required' });
  }
  const upsert = db.prepare(`
    INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, period, score_type, slot)
    DO UPDATE SET score = excluded.score
  `);
  const transaction = db.transaction(() => {
    for (const s of scores) {
      upsert.run(databaseId, studentId, s.period, s.scoreType, s.slot, s.score);
    }
  });
  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Scores saved' });
});

// ─── Save exam scores ───────────────────────────────────────────
router.post('/student/exam-scores', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, studentId, side, scores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO exam_scores (database_id, student_id, side, slot, score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, side, slot)
    DO UPDATE SET score = excluded.score
  `);

  const transaction = db.transaction(() => {
    for (const s of scores) {
      upsert.run(databaseId, studentId, side, s.slot, s.score);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Exam scores saved' });
});

// ─── Sections (preserves getSections) ───────────────────────────
router.get('/sections', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  const sections = db.prepare(
    'SELECT DISTINCT section FROM grade_students WHERE database_id = ? AND section != "" ORDER BY section'
  ).all(databaseId);
  res.json({ success: true, sections: sections.map(s => s.section) });
});

// ─── Section students (preserves getSectionStudents) ────────────
router.get('/section/:num/students', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(
    `SELECT * FROM grade_students WHERE database_id = ? AND section = ? ${SQL_ORDER_CLASS_IN_SECTION}`
  ).all(databaseId, req.params.num);
  res.json({ success: true, students });
});

// ─── Section grades (preserves getSectionGrades) ────────────────
router.get('/section/:num/grades', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(
    `SELECT * FROM grade_students WHERE database_id = ? AND section = ? ${SQL_ORDER_CLASS_IN_SECTION}`
  ).all(databaseId, req.params.num);

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => {
      const items = scores.filter(s => s.period === period && s.score_type === type);
      return items.reduce((sum, s) => sum + (s.score || 0), 0);
    };

    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = calcOverall(w, { midtermTotal, finalInitialTotal, finalFinalTotal, midtermExamTotal, finalExamTotal });

    const passScore = w.pass_overall || 50;
    const result = overallTotal >= passScore ? 'PASSED' : 'FAILED';

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      midtermTotal,
      midtermEquivalent: midtermTotal > 0 ? midtermTotal.toFixed(2) : '-',
      finalInitialTotal,
      finalInitialEquivalent: finalInitialTotal > 0 ? finalInitialTotal.toFixed(2) : '-',
      finalFinalTotal,
      finalFinalEquivalent: finalFinalTotal > 0 ? finalFinalTotal.toFixed(2) : '-',
      finalExamTotal,
      finalExamEquivalent: finalExamTotal > 0 ? finalExamTotal.toFixed(2) : '-',
      overallTotal: overallTotal.toFixed(2),
      result
    };
  });

  res.json({ success: true, students: result });
});

// ─── All grades (preserves getAllGrades) ─────────────────────────
router.get('/all', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(`SELECT * FROM grade_students WHERE database_id = ? ${SQL_ORDER_CLASS}`).all(databaseId);

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => {
      return scores.filter(s => s.period === period && s.score_type === type).reduce((sum, s) => sum + (s.score || 0), 0);
    };

    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = calcOverall(w, { midtermTotal, finalInitialTotal, finalFinalTotal, midtermExamTotal, finalExamTotal });
    const passScore = w.pass_overall || 50;

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      midtermTotal: midtermTotal.toFixed(2),
      midtermEquivalent: midtermTotal > 0 ? midtermTotal.toFixed(2) : '-',
      finalInitialTotal: finalInitialTotal.toFixed(2),
      finalInitialEquivalent: finalInitialTotal > 0 ? finalInitialTotal.toFixed(2) : '-',
      finalFinalTotal: finalFinalTotal.toFixed(2),
      finalFinalEquivalent: finalFinalTotal > 0 ? finalFinalTotal.toFixed(2) : '-',
      finalExamTotal: finalExamTotal.toFixed(2),
      finalExamEquivalent: finalExamTotal > 0 ? finalExamTotal.toFixed(2) : '-',
      overallTotal: overallTotal.toFixed(2),
      result: overallTotal >= passScore ? 'PASSED' : 'FAILED'
    };
  });

  res.json({ success: true, students: result });
});

// ─── Grading weights (preserves saveGradingWeights / getSubjectConfig) ──
router.get('/weights/:databaseId', requireGradeRead((req) => req.params.databaseId), (req, res) => {
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(req.params.databaseId);
  res.json({ success: true, weights: weights || {} });
});

router.post('/weights', requireGradeWrite(dbIdFromBody), (req, res) => {
  const b = req.body;
  const databaseId = b.databaseId;
  const midtermCollective = b.midtermCollective ?? b.midterm_collective ?? 0;
  const finalInitial = b.finalInitial ?? b.final_initial ?? 0;
  const finalFinal = b.finalFinal ?? b.final_final ?? 0;
  const midtermExam = b.midtermExam ?? b.midterm_exam ?? 0;
  const finalExam = b.finalExam ?? b.final_exam ?? 0;
  const passMidterm = b.passMidterm ?? b.pass_midterm ?? 0;
  const passInitial = b.passInitial ?? b.pass_initial ?? 0;
  const passFinal = b.passFinal ?? b.pass_final ?? 0;
  const passOverall = b.passOverall ?? b.pass_overall ?? 0;
  const freezeFinal = b.freezeFinal ?? b.freeze_final ?? false;
  const customFormula = b.customFormula ?? b.custom_formula ?? '';

  db.prepare(`
    INSERT INTO grading_weights (database_id, midterm_collective, final_initial, final_final, midterm_exam, final_exam,
      pass_midterm, pass_initial, pass_final, pass_overall, freeze_final, custom_formula)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id) DO UPDATE SET
      midterm_collective=excluded.midterm_collective, final_initial=excluded.final_initial,
      final_final=excluded.final_final, midterm_exam=excluded.midterm_exam, final_exam=excluded.final_exam,
      pass_midterm=excluded.pass_midterm, pass_initial=excluded.pass_initial,
      pass_final=excluded.pass_final, pass_overall=excluded.pass_overall, freeze_final=excluded.freeze_final,
      custom_formula=excluded.custom_formula
  `).run(databaseId, midtermCollective || 0, finalInitial || 0, finalFinal || 0,
    midtermExam || 0, finalExam || 0, passMidterm || 0, passInitial || 0,
    passFinal || 0, passOverall || 0, freezeFinal ? 1 : 0, String(customFormula || ''));

  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Grading weights saved' });
});

// ─── Exam types (preserves saveExamTypes) ───────────────────────
router.post('/exam-types', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, side, types } = req.body;

  const upsert = db.prepare(`
    INSERT INTO exam_types (database_id, side, slot, type_name, max_score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(database_id, side, slot) DO UPDATE SET
      type_name=excluded.type_name, max_score=excluded.max_score
  `);

  const transaction = db.transaction(() => {
    for (let i = 0; i < types.length; i++) {
      upsert.run(databaseId, side, i, types[i].name || '', types[i].maxScore || 0);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Exam types saved' });
});

// ─── Activity names/scores (preserves saveActivityNamesScores) ──
router.post('/activity-config', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, period, individualNames, individualScores, groupNames, groupScores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO activity_config (database_id, period, type, slot, name, max_score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, period, type, slot) DO UPDATE SET
      name=excluded.name, max_score=excluded.max_score
  `);

  const transaction = db.transaction(() => {
    if (individualNames) {
      for (let i = 0; i < individualNames.length; i++) {
        upsert.run(databaseId, period, 'individual', i, individualNames[i] || '', (individualScores && individualScores[i]) || 0);
      }
    }
    if (groupNames) {
      for (let i = 0; i < groupNames.length; i++) {
        upsert.run(databaseId, period, 'group', i, groupNames[i] || '', (groupScores && groupScores[i]) || 0);
      }
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Activity configuration saved' });
});

// ─── Groups (preserves generateAutoGroups / group management) ───
router.post('/groups/auto', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, section, period, activityNumber, groupCount } = req.body;

  const students = db.prepare(
    `SELECT * FROM grade_students WHERE database_id = ? AND section = ? ${SQL_ORDER_CLASS_IN_SECTION}`
  ).all(databaseId, section);

  if (students.length === 0) {
    res.json({ success: false, message: 'No students found in this section' });
    return;
  }

  const shuffled = [...students].sort(() => Math.random() - 0.5);
  const groups = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((s, i) => groups[i % groupCount].push(s));

  db.prepare('DELETE FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ?')
    .run(databaseId, section, period, activityNumber);

  const insert = db.prepare(
    'INSERT INTO student_groups (database_id, section, period, activity_number, group_number, student_id) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    groups.forEach((group, gi) => {
      group.forEach(student => {
        insert.run(databaseId, section, period, activityNumber, gi + 1, student.student_id);
      });
    });
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({
    success: true,
    groups: groups.map((g, i) => ({
      groupNumber: i + 1,
      members: g.map(s => ({ studentId: s.student_id, englishName: s.english_name, thaiName: s.thai_name }))
    }))
  });
});

router.get('/groups', (req, res) => {
  const { databaseId, section, period, activityNumber } = req.query;
  const groups = db.prepare(
    'SELECT * FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ?'
  ).all(databaseId, section, period, activityNumber);
  res.json({ success: true, groups });
});

// ─── Pass/Fail (preserves getPassFailList) ──────────────────────
router.get('/pass-fail', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(`SELECT * FROM grade_students WHERE database_id = ? ${SQL_ORDER_CLASS}`).all(databaseId);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => scores.filter(s => s.period === period && s.score_type === type).reduce((sum, s) => sum + (s.score || 0), 0);
    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = calcOverall(w, { midtermTotal, finalInitialTotal, finalFinalTotal, midtermExamTotal, finalExamTotal });

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      overallTotal: overallTotal.toFixed(2),
      finalResult: overallTotal >= (w.pass_overall || 50) ? 'PASSED' : 'FAILED'
    };
  });

  res.json({ success: true, students: result });
});

// ─── Import students (batch) ────────────────────────────────────
router.post('/students/import', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, students } = req.body;

  const upsert = db.prepare(`
    INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id) DO UPDATE SET
      thai_name=excluded.thai_name, english_name=excluded.english_name,
      section=excluded.section, class_number=excluded.class_number
  `);

  const transaction = db.transaction(() => {
    for (const s of students) {
      upsert.run(databaseId, s.studentId, s.thaiName || '', s.englishName || '',
        s.section || '', s.classNumber || '', s.password || 'default');
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `${students.length} students imported` });
});

function mapWeightsRow(weights) {
  const w = weights || {};
  return {
    midtermCollective: w.midterm_collective ?? 0,
    finalInitial: w.final_initial ?? 0,
    finalFinal: w.final_final ?? 0,
    midtermExam: w.midterm_exam ?? 0,
    finalExam: w.final_exam ?? 0,
    passMidterm: w.pass_midterm ?? 0,
    passInitial: w.pass_initial ?? 0,
    passFinal: w.pass_final ?? 0,
    passOverall: w.pass_overall ?? 0,
    freezeFinal: Boolean(w.freeze_final),
    customFormula: w.custom_formula || ''
  };
}

function mapActivity(a) {
  return {
    period: a.period,
    type: a.type,
    slot: a.slot,
    name: a.name || '',
    maxScore: a.max_score ?? 0
  };
}

function mapExam(e) {
  return {
    side: e.side,
    slot: e.slot,
    typeName: e.type_name || '',
    maxScore: e.max_score ?? 0
  };
}

function activityKey(period, type, slot) {
  return `${period}|${type}|${slot}`;
}

function examKey(side, slot) {
  return `${side}|${slot}`;
}

function buildGradingSheetData(databaseId, section) {
  let studentQuery = 'SELECT * FROM grade_students WHERE database_id = ?';
  const studentParams = [databaseId];
  if (section) {
    studentQuery += ' AND section = ?';
    studentParams.push(section);
  }
  studentQuery += ` ${SQL_ORDER_CLASS}`;
  const studentsRaw = db.prepare(studentQuery).all(...studentParams);

  const activities = db.prepare(
    'SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot'
  ).all(databaseId);
  const exams = db.prepare(
    'SELECT * FROM exam_types WHERE database_id = ? ORDER BY side, slot'
  ).all(databaseId);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const scoreMap = new Map();
  db.prepare('SELECT * FROM student_scores WHERE database_id = ?').all(databaseId).forEach((s) => {
    scoreMap.set(activityKey(s.period, s.score_type, s.slot) + '|' + s.student_id, s.score ?? 0);
  });
  const examScoreMap = new Map();
  db.prepare('SELECT * FROM exam_scores WHERE database_id = ?').all(databaseId).forEach((e) => {
    examScoreMap.set(examKey(e.side, e.slot) + '|' + e.student_id, e.score ?? 0);
  });

  const students = studentsRaw.map((st) => {
    const activityScores = {};
    activities.forEach((a) => {
      activityScores[activityKey(a.period, a.type, a.slot)] =
        scoreMap.get(activityKey(a.period, a.type, a.slot) + '|' + st.student_id) ?? '';
    });
    const examScores = {};
    exams.forEach((e) => {
      examScores[examKey(e.side, e.slot)] =
        examScoreMap.get(examKey(e.side, e.slot) + '|' + st.student_id) ?? '';
    });
    return {
      studentId: st.student_id,
      thaiName: st.thai_name || '',
      englishName: st.english_name || '',
      section: st.section || '',
      classNumber: st.class_number || '',
      activityScores,
      examScores
    };
  });

  return {
    weights: mapWeightsRow(weights),
    activities: activities.map(mapActivity),
    exams: exams.map(mapExam),
    students
  };
}

/** Free activity slots (0–4) per period/type for mapping UI */
router.get('/slot-hints', requireGradeRead(dbIdFromQuery), (req, res) => {
  const databaseId = req.query.databaseId;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });
  const rows = db.prepare(
    'SELECT DISTINCT period, type, slot FROM activity_config WHERE database_id = ? ORDER BY period, type, slot'
  ).all(databaseId);
  const MAX = 5;
  const result = {};
  for (const period of ['midterm', 'final_initial', 'final_final']) {
    result[period] = {};
    for (const type of ['individual', 'group']) {
      const used = new Set(rows.filter((r) => r.period === period && r.type === type).map((r) => r.slot));
      const free = [];
      for (let i = 0; i < MAX; i++) {
        if (!used.has(i)) free.push(i);
      }
      result[period][type] = {
        slotsInUse: [...used].sort((a, b) => a - b),
        freeSlots: free,
        suggestedSlot: free.length ? free[0] : null
      };
    }
  }
  res.json({ success: true, data: result });
});

router.get('/grading-sheet', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, section } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });
  const data = buildGradingSheetData(databaseId, section || '');
  res.json({ success: true, databaseId: Number(databaseId), section: section || '', ...data });
});

router.post('/grading-sheet/save', requireGradeWrite(dbIdFromBody), (req, res) => {
  const {
    databaseId,
    weights,
    activityUpdates,
    examUpdates,
    scores,
    examScores
  } = req.body;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });

  const transaction = db.transaction(() => {
    if (weights) {
      const b = weights;
      db.prepare(`
        INSERT INTO grading_weights (database_id, midterm_collective, final_initial, final_final, midterm_exam, final_exam,
          pass_midterm, pass_initial, pass_final, pass_overall, freeze_final, custom_formula)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(database_id) DO UPDATE SET
          midterm_collective=excluded.midterm_collective, final_initial=excluded.final_initial,
          final_final=excluded.final_final, midterm_exam=excluded.midterm_exam, final_exam=excluded.final_exam,
          pass_midterm=excluded.pass_midterm, pass_initial=excluded.pass_initial,
          pass_final=excluded.pass_final, pass_overall=excluded.pass_overall, freeze_final=excluded.freeze_final, custom_formula=excluded.custom_formula
      `).run(
        databaseId,
        Number(b.midtermCollective ?? b.midterm_collective ?? 0),
        Number(b.finalInitial ?? b.final_initial ?? 0),
        Number(b.finalFinal ?? b.final_final ?? 0),
        Number(b.midtermExam ?? b.midterm_exam ?? 0),
        Number(b.finalExam ?? b.final_exam ?? 0),
        Number(b.passMidterm ?? b.pass_midterm ?? 0),
        Number(b.passInitial ?? b.pass_initial ?? 0),
        Number(b.passFinal ?? b.pass_final ?? 0),
        Number(b.passOverall ?? b.pass_overall ?? 0),
        (b.freezeFinal ?? b.freeze_final) ? 1 : 0,
        String(b.customFormula ?? b.custom_formula ?? '')
      );
    }

    if (Array.isArray(activityUpdates) && activityUpdates.length) {
      const upsertAct = db.prepare(`
        INSERT INTO activity_config (database_id, period, type, slot, name, max_score)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(database_id, period, type, slot) DO UPDATE SET
          name=excluded.name, max_score=excluded.max_score
      `);
      for (const a of activityUpdates) {
        upsertAct.run(
          databaseId, a.period, a.type, a.slot,
          a.name ?? '', Number(a.maxScore ?? a.max_score ?? 0)
        );
      }
    }

    if (Array.isArray(examUpdates) && examUpdates.length) {
      const upsertExam = db.prepare(`
        INSERT INTO exam_types (database_id, side, slot, type_name, max_score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(database_id, side, slot) DO UPDATE SET
          type_name=excluded.type_name, max_score=excluded.max_score
      `);
      for (const e of examUpdates) {
        upsertExam.run(
          databaseId, e.side, e.slot,
          e.typeName ?? e.type_name ?? '', Number(e.maxScore ?? e.max_score ?? 0)
        );
      }
    }

    if (Array.isArray(scores) && scores.length) {
      const upsertScore = db.prepare(`
        INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(database_id, student_id, period, score_type, slot)
        DO UPDATE SET score = excluded.score
      `);
      for (const s of scores) {
        upsertScore.run(
          databaseId, s.studentId, s.period, s.scoreType ?? s.score_type, s.slot,
          Number(s.score) || 0
        );
      }
    }

    if (Array.isArray(examScores) && examScores.length) {
      const upsertExamScore = db.prepare(`
        INSERT INTO exam_scores (database_id, student_id, side, slot, score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(database_id, student_id, side, slot)
        DO UPDATE SET score = excluded.score
      `);
      for (const e of examScores) {
        upsertExamScore.run(databaseId, e.studentId, e.side, e.slot, Number(e.score) || 0);
      }
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Grading sheet saved' });
});

router.get('/grading-sheet/export', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, section } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });

  let studentQuery = 'SELECT * FROM grade_students WHERE database_id = ?';
  const studentParams = [databaseId];
  if (section) { studentQuery += ' AND section = ?'; studentParams.push(section); }
  studentQuery += ` ${SQL_ORDER_CLASS}`;
  const students = db.prepare(studentQuery).all(...studentParams);

  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot').all(databaseId);
  const exams = db.prepare('SELECT * FROM exam_types WHERE database_id = ? ORDER BY side, slot').all(databaseId);
  const scoreMap = new Map();
  db.prepare('SELECT * FROM student_scores WHERE database_id = ?').all(databaseId).forEach((s) => {
    scoreMap.set(`${s.student_id}|${s.period}|${s.score_type}|${s.slot}`, s.score || 0);
  });
  const examScoreMap = new Map();
  db.prepare('SELECT * FROM exam_scores WHERE database_id = ?').all(databaseId).forEach((e) => {
    examScoreMap.set(`${e.student_id}|${e.side}|${e.slot}`, e.score || 0);
  });

  const rows = students.map((st) => {
    const row = {
      'STUDENT ID': st.student_id,
      'THAI NAME': st.thai_name || '',
      'ENGLISH NAME': st.english_name || '',
      'SECTION': st.section || '',
      'CLASS NUMBER': st.class_number || ''
    };
    activities.forEach((a) => {
      const label = `${String(a.period || '').toUpperCase()} | ${String(a.type || '').toUpperCase()} ${a.slot + 1} ${a.name ? `(${a.name})` : ''} [PERFECT:${a.max_score || 0}]`;
      row[label] = scoreMap.get(`${st.student_id}|${a.period}|${a.type}|${a.slot}`) ?? '';
    });
    exams.forEach((e) => {
      const label = `${String(e.side || '').toUpperCase()} EXAM ${e.slot + 1} ${e.type_name ? `(${e.type_name})` : ''} [PERFECT:${e.max_score || 0}]`;
      row[label] = examScoreMap.get(`${st.student_id}|${e.side}|${e.slot}`) ?? '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ModeA_GradingSheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ModeA_Grading_Sheet_${databaseId}.xlsx"`);
  res.send(Buffer.from(buf));
});

export default router;
