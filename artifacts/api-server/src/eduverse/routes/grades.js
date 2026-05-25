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
  const otherActivitiesMidterm = b.otherActivitiesMidterm ?? b.other_activities_midterm ?? 0;
  const otherActivitiesFinal = b.otherActivitiesFinal ?? b.other_activities_final ?? 0;

  db.prepare(`
    INSERT INTO grading_weights (database_id, midterm_collective, final_initial, final_final, midterm_exam, final_exam,
      pass_midterm, pass_initial, pass_final, pass_overall, freeze_final, custom_formula,
      other_activities_midterm, other_activities_final)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id) DO UPDATE SET
      midterm_collective=excluded.midterm_collective, final_initial=excluded.final_initial,
      final_final=excluded.final_final, midterm_exam=excluded.midterm_exam, final_exam=excluded.final_exam,
      pass_midterm=excluded.pass_midterm, pass_initial=excluded.pass_initial,
      pass_final=excluded.pass_final, pass_overall=excluded.pass_overall, freeze_final=excluded.freeze_final,
      custom_formula=excluded.custom_formula,
      other_activities_midterm=excluded.other_activities_midterm, other_activities_final=excluded.other_activities_final
  `).run(databaseId, midtermCollective || 0, finalInitial || 0, finalFinal || 0,
    midtermExam || 0, finalExam || 0, passMidterm || 0, passInitial || 0,
    passFinal || 0, passOverall || 0, freezeFinal ? 1 : 0, String(customFormula || ''),
    otherActivitiesMidterm || 0, otherActivitiesFinal || 0);

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

// ─── Activity management CRUD + scoring ─────────────────────────
router.get('/activity-config/list', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId required' });
  const rows = db.prepare(
    'SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot'
  ).all(databaseId);
  res.json({ success: true, activities: rows.map(mapActivity) });
});

router.post('/activity-config/upsert', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, period, type, slot, name, maxScore } = req.body;
  if (!databaseId || !period || !type || slot == null)
    return res.json({ success: false, message: 'databaseId, period, type, slot required' });
  db.prepare(`
    INSERT INTO activity_config (database_id, period, type, slot, name, max_score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, period, type, slot) DO UPDATE SET
      name=excluded.name, max_score=excluded.max_score
  `).run(databaseId, period, type, Number(slot), name || '', Number(maxScore) || 0);
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Activity saved' });
});

router.delete('/activity-config/delete', requireGradeWrite(dbIdFromQuery), (req, res) => {
  const { databaseId, period, type, slot } = req.query;
  if (!databaseId || !period || !type || slot == null)
    return res.json({ success: false, message: 'databaseId, period, type, slot required' });
  db.transaction(() => {
    db.prepare('DELETE FROM activity_config WHERE database_id = ? AND period = ? AND type = ? AND slot = ?')
      .run(databaseId, period, type, Number(slot));
    db.prepare('DELETE FROM student_scores WHERE database_id = ? AND period = ? AND score_type = ? AND slot = ?')
      .run(databaseId, period, type, Number(slot));
  })();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Activity and all its scores deleted' });
});

router.get('/activity-scores', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, period, type, slot, section } = req.query;
  if (!databaseId || !period || !type || slot == null)
    return res.json({ success: false, message: 'databaseId, period, type, slot required' });
  let q = 'SELECT * FROM grade_students WHERE database_id = ?';
  const p = [databaseId];
  if (section) { q += ' AND section = ?'; p.push(section); }
  q += ` ${SQL_ORDER_CLASS}`;
  const students = db.prepare(q).all(...p);
  const scoreMap = new Map(
    db.prepare('SELECT student_id, score FROM student_scores WHERE database_id = ? AND period = ? AND score_type = ? AND slot = ?')
      .all(databaseId, period, type, Number(slot))
      .map((s) => [s.student_id, s.score ?? ''])
  );
  res.json({
    success: true,
    students: students.map((st) => ({
      studentId: st.student_id,
      thaiName: st.thai_name || '',
      englishName: st.english_name || '',
      section: st.section || '',
      classNumber: st.class_number || '',
      score: scoreMap.has(st.student_id) ? scoreMap.get(st.student_id) : ''
    }))
  });
});

router.post('/activity-scores/save', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, period, type, slot, scores } = req.body;
  if (!databaseId || !period || !type || slot == null || !Array.isArray(scores))
    return res.json({ success: false, message: 'databaseId, period, type, slot, scores[] required' });
  const upsert = db.prepare(`
    INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, period, score_type, slot) DO UPDATE SET score=excluded.score
  `);
  db.transaction(() => {
    for (const s of scores) upsert.run(databaseId, s.studentId, period, type, Number(slot), Number(s.score) || 0);
  })();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `${scores.length} scores saved` });
});

router.get('/activity-groups/for-activity', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, section, period, slot } = req.query;
  if (!databaseId || !section || !period || slot == null)
    return res.json({ success: false, message: 'databaseId, section, period, slot required' });
  const rows = db.prepare(`
    SELECT sg.group_number, sg.student_id, gs.english_name, gs.thai_name, gs.class_number
    FROM student_groups sg
    LEFT JOIN grade_students gs ON sg.student_id = gs.student_id AND sg.database_id = gs.database_id
    WHERE sg.database_id = ? AND sg.section = ? AND sg.period = ? AND sg.activity_number = ?
    ORDER BY sg.group_number,
      CASE WHEN TRIM(COALESCE(gs.class_number,'')) GLOB '[0-9]*' THEN CAST(gs.class_number AS INTEGER) ELSE 999999 END,
      gs.class_number
  `).all(databaseId, section, period, Number(slot));
  const grouped = {};
  rows.forEach((r) => {
    if (!grouped[r.group_number]) grouped[r.group_number] = [];
    grouped[r.group_number].push({
      studentId: r.student_id, englishName: r.english_name || '',
      thaiName: r.thai_name || '', classNumber: r.class_number || ''
    });
  });
  res.json({
    success: true,
    groups: Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map((gn) => ({
      groupNumber: Number(gn), members: grouped[gn]
    }))
  });
});

router.post('/activity-groups/import-mode-b', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, section, period, slot, gradeLevel } = req.body;
  if (!databaseId || !section || !period || slot == null)
    return res.json({ success: false, message: 'databaseId, section, period, slot required' });
  let q = 'SELECT * FROM quiz_team_groups WHERE section = ?';
  const p = [section];
  if (gradeLevel) { q += ' AND grade_level = ?'; p.push(gradeLevel); }
  q += ' ORDER BY group_name, student_id';
  const rows = db.prepare(q).all(...p);
  if (rows.length === 0)
    return res.json({ success: false, message: 'No Mode B groups found for section ' + section + (gradeLevel ? ` / grade ${gradeLevel}` : '') });
  const nameToNum = {};
  [...new Set(rows.map((r) => r.group_name))].sort().forEach((name, i) => { nameToNum[name] = i + 1; });
  const insert = db.prepare(
    'INSERT INTO student_groups (database_id, section, period, activity_number, group_number, student_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    db.prepare('DELETE FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ?')
      .run(databaseId, section, period, Number(slot));
    for (const r of rows) {
      const st = db.prepare('SELECT student_id FROM grade_students WHERE database_id = ? AND student_id = ?')
        .get(databaseId, r.student_id);
      if (st) insert.run(databaseId, section, period, Number(slot), nameToNum[r.group_name], r.student_id);
    }
  })();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `Imported ${Object.keys(nameToNum).length} groups from Mode B` });
});

router.post('/activity-groups/apply-score', requireGradeWrite(dbIdFromBody), (req, res) => {
  const { databaseId, section, period, slot, groupNumber, score } = req.body;
  if (!databaseId || !section || !period || slot == null || groupNumber == null)
    return res.json({ success: false, message: 'databaseId, section, period, slot, groupNumber required' });
  const members = db.prepare(
    'SELECT student_id FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ? AND group_number = ?'
  ).all(databaseId, section, period, Number(slot), Number(groupNumber));
  if (members.length === 0)
    return res.json({ success: false, message: 'No members in this group for this section' });
  const upsert = db.prepare(`
    INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
    VALUES (?, ?, ?, 'group', ?, ?)
    ON CONFLICT(database_id, student_id, period, score_type, slot) DO UPDATE SET score=excluded.score
  `);
  db.transaction(() => {
    for (const m of members) upsert.run(databaseId, m.student_id, period, Number(slot), Number(score) || 0);
  })();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `Score applied to ${members.length} members` });
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
    customFormula: w.custom_formula || '',
    otherActivitiesMidterm: w.other_activities_midterm ?? 0,
    otherActivitiesFinal: w.other_activities_final ?? 0
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

/** Slot hints — general overview OR specific period/type with quiz-mapping awareness */
router.get('/slot-hints', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, period, scoreType } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });

  // Specific mode: period + scoreType provided → detail including quiz_score_mappings
  if (period && scoreType) {
    const dbId = Number(databaseId);
    const usedSet = new Set();
    db.prepare('SELECT DISTINCT slot FROM activity_config WHERE database_id = ? AND period = ? AND type = ?')
      .all(dbId, period, scoreType).forEach((r) => usedSet.add(Number(r.slot)));
    db.prepare('SELECT DISTINCT slot FROM student_scores WHERE database_id = ? AND period = ? AND score_type = ?')
      .all(dbId, period, scoreType).forEach((r) => usedSet.add(Number(r.slot)));
    try {
      db.prepare('SELECT DISTINCT slot FROM quiz_score_mappings WHERE target_database_id = ? AND period = ? AND score_type = ? AND active = 1')
        .all(dbId, period, scoreType).forEach((r) => usedSet.add(Number(r.slot)));
    } catch { /* table may not exist in all deployments */ }
    const allSlots = [0, 1, 2, 3, 4];
    const usedSlots = allSlots.filter((s) => usedSet.has(s));
    const freeSlots = allSlots.filter((s) => !usedSet.has(s));
    return res.json({
      success: true, databaseId: dbId, period, scoreType, usedSlots, freeSlots,
      usedSlotsDisplay: usedSlots.map((s) => s + 1),
      freeSlotsDisplay: freeSlots.map((s) => s + 1)
    });
  }

  // General mode: full breakdown by period/type
  const rows = db.prepare(
    'SELECT DISTINCT period, type, slot FROM activity_config WHERE database_id = ? ORDER BY period, type, slot'
  ).all(databaseId);
  const MAX = 5;
  const result = {};
  for (const p of ['midterm', 'final_initial', 'final_final']) {
    result[p] = {};
    for (const t of ['individual', 'group']) {
      const used = new Set(rows.filter((r) => r.period === p && r.type === t).map((r) => r.slot));
      const free = [];
      for (let i = 0; i < MAX; i++) { if (!used.has(i)) free.push(i); }
      result[p][t] = { slotsInUse: [...used].sort((a, b) => a - b), freeSlots: free, suggestedSlot: free.length ? free[0] : null };
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

// ─── Unified grading sheet (Mode A totals + Mode B quiz scores) ──
function buildCombinedSheetData(databaseId, section) {
  let studentQuery = 'SELECT * FROM grade_students WHERE database_id = ?';
  const studentParams = [databaseId];
  if (section) { studentQuery += ' AND section = ?'; studentParams.push(section); }
  studentQuery += ` ${SQL_ORDER_CLASS}`;
  const studentsRaw = db.prepare(studentQuery).all(...studentParams);

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);
  const w = weights || {};

  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot').all(databaseId);
  const examTypes = db.prepare('SELECT * FROM exam_types WHERE database_id = ? ORDER BY side, slot').all(databaseId);

  const allScores = db.prepare('SELECT * FROM student_scores WHERE database_id = ?').all(databaseId);
  const allExamScores = db.prepare('SELECT * FROM exam_scores WHERE database_id = ?').all(databaseId);

  const scoresBySid = {};
  allScores.forEach((s) => {
    if (!scoresBySid[s.student_id]) scoresBySid[s.student_id] = [];
    scoresBySid[s.student_id].push(s);
  });
  const examsBySid = {};
  allExamScores.forEach((e) => {
    if (!examsBySid[e.student_id]) examsBySid[e.student_id] = [];
    examsBySid[e.student_id].push(e);
  });

  const quizColumns = db.prepare(
    'SELECT id, title, type, subject, passing_score FROM quizzes ORDER BY created_at'
  ).all();

  const quizScoreMap = new Map();
  if (studentsRaw.length > 0 && quizColumns.length > 0) {
    const placeholders = studentsRaw.map(() => '?').join(',');
    db.prepare(`
      SELECT student_id, quiz_id, MAX(percentage) as best_pct
      FROM quiz_attempts
      WHERE submitted = 1 AND student_id IN (${placeholders})
      GROUP BY student_id, quiz_id
    `).all(...studentsRaw.map((s) => s.student_id)).forEach((r) => {
      quizScoreMap.set(`${r.student_id}|${r.quiz_id}`, r.best_pct);
    });
  }

  const scoreMap = new Map();
  allScores.forEach((s) => {
    scoreMap.set(`${s.student_id}|${s.period}|${s.score_type}|${s.slot}`, s.score || 0);
  });
  const examScoreMap = new Map();
  allExamScores.forEach((e) => {
    examScoreMap.set(`${e.student_id}|${e.side}|${e.slot}`, e.score || 0);
  });

  const students = studentsRaw.map((st) => {
    const scores = scoresBySid[st.student_id] || [];
    const exams = examsBySid[st.student_id] || [];

    const getTotal = (period, type) =>
      scores.filter((s) => s.period === period && s.score_type === type)
        .reduce((sum, s) => sum + (s.score || 0), 0);

    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = exams.filter((e) => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = exams.filter((e) => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);
    const overallTotal = calcOverall(w, { midtermTotal, finalInitialTotal, finalFinalTotal, midtermExamTotal, finalExamTotal });
    const passScore = w.pass_overall || 50;

    const quizScores = {};
    quizColumns.forEach((q) => {
      const v = quizScoreMap.get(`${st.student_id}|${q.id}`);
      quizScores[q.id] = v !== undefined ? Number(v) : null;
    });

    const activityScores = {};
    activities.forEach((a) => {
      const key = `${a.period}|${a.type}|${a.slot}`;
      activityScores[key] = scoreMap.get(`${st.student_id}|${a.period}|${a.type}|${a.slot}`) ?? 0;
    });

    const examScores = {};
    examTypes.forEach((e) => {
      const key = `${e.side}|${e.slot}`;
      examScores[key] = examScoreMap.get(`${st.student_id}|${e.side}|${e.slot}`) ?? 0;
    });

    return {
      studentId: st.student_id,
      thaiName: st.thai_name || '',
      englishName: st.english_name || '',
      section: st.section || '',
      classNumber: st.class_number || '',
      midtermTotal: midtermTotal.toFixed(2),
      finalInitialTotal: finalInitialTotal.toFixed(2),
      finalFinalTotal: finalFinalTotal.toFixed(2),
      midtermExamTotal: midtermExamTotal.toFixed(2),
      finalExamTotal: finalExamTotal.toFixed(2),
      overallTotal: overallTotal.toFixed(2),
      modeAResult: overallTotal >= passScore ? 'PASSED' : 'FAILED',
      quizScores,
      activityScores,
      examScores
    };
  });

  return {
    quizColumns: quizColumns.map((q) => ({ id: q.id, title: q.title || '', type: q.type || 'QUIZ', subject: q.subject || '', passingScore: q.passing_score ?? 50 })),
    students,
    activities: activities.map(a => ({ period: a.period, type: a.type, slot: a.slot, name: a.name || '', maxScore: a.max_score || 0 })),
    exams: examTypes.map(e => ({ side: e.side, slot: e.slot, typeName: e.type_name || '', maxScore: e.max_score || 0 })),
    weights: w
  };
}

router.get('/grading-sheet/combined', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, section } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });
  const database = db.prepare('SELECT * FROM grade_databases WHERE id = ?').get(databaseId);
  if (!database) return res.json({ success: false, message: 'Database not found' });
  const { quizColumns, students } = buildCombinedSheetData(Number(databaseId), section || '');
  res.json({ success: true, databaseId: Number(databaseId), databaseName: database.name, section: section || '', quizColumns, students });
});

router.get('/grading-sheet/combined/export', requireGradeRead(dbIdFromQuery), (req, res) => {
  const { databaseId, section } = req.query;
  if (!databaseId) return res.json({ success: false, message: 'databaseId is required' });
  const database = db.prepare('SELECT * FROM grade_databases WHERE id = ?').get(databaseId);
  if (!database) return res.json({ success: false, message: 'Database not found' });
  const { quizColumns, students } = buildCombinedSheetData(Number(databaseId), section || '');

  const rows = students.map((st) => {
    const row = {
      'STUDENT ID': st.studentId,
      'THAI NAME': st.thaiName,
      'ENGLISH NAME': st.englishName,
      'SECTION': st.section,
      'CLASS NO': st.classNumber,
      'MIDTERM TOTAL': st.midtermTotal,
      'FINAL INITIAL TOTAL': st.finalInitialTotal,
      'FINAL FINAL TOTAL': st.finalFinalTotal,
      'MIDTERM EXAM': st.midtermExamTotal,
      'FINAL EXAM': st.finalExamTotal,
      'OVERALL TOTAL': st.overallTotal,
      'MODE A RESULT': st.modeAResult
    };
    quizColumns.forEach((q) => {
      row[`QUIZ | ${q.title} [PASS:${q.passingScore}%]`] = st.quizScores[q.id] !== null ? st.quizScores[q.id] : '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unified_Sheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const safeName = String(database.name || databaseId).replace(/[^\w]/g, '_').slice(0, 30);
  res.setHeader('Content-Disposition', `attachment; filename="Unified_Sheet_${safeName}.xlsx"`);
  res.send(Buffer.from(buf));
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
