import { Router } from 'express';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';

const router = Router();

// ─── List performances for a section ────────────────────────────
router.get('/list', (req, res) => {
  const { databaseId, gradeLevel, section } = req.query;
  let query = 'SELECT * FROM performances WHERE 1=1';
  const params = [];
  if (databaseId) { query += ' AND database_id = ?'; params.push(databaseId); }
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ' ORDER BY created_at DESC';
  const performances = db.prepare(query).all(...params);
  res.json({ success: true, data: performances });
});

// ─── Create performance ─────────────────────────────────────────
router.post('/create', (req, res) => {
  const { databaseId, gradeLevel, section, title, lessonNumber, performanceType, maxScore } = req.body;
  if (!databaseId || !gradeLevel || !section || !title || !performanceType) {
    return res.json({ success: false, message: 'Missing required fields' });
  }
  const result = db.prepare(`
    INSERT INTO performances (database_id, grade_level, section, title, lesson_number, performance_type, max_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(databaseId, gradeLevel, section, title, lessonNumber || '', performanceType, maxScore || 100);
  invalidateCache('/api/performance');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

// ─── Update performance ─────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { title, lessonNumber, maxScore } = req.body;
  const existing = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.id);
  if (!existing) return res.json({ success: false, message: 'Performance not found' });
  db.prepare(`
    UPDATE performances SET title = ?, lesson_number = ?, max_score = ? WHERE id = ?
  `).run(title || existing.title, lessonNumber ?? existing.lesson_number, maxScore ?? existing.max_score, req.params.id);
  invalidateCache('/api/performance');
  res.json({ success: true, message: 'Performance updated' });
});

// ─── Delete performance ─────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM performance_scores WHERE performance_id = ?').run(req.params.id);
  db.prepare('DELETE FROM performances WHERE id = ?').run(req.params.id);
  invalidateCache('/api/performance');
  res.json({ success: true, message: 'Performance deleted' });
});

// ─── Get performance with scores ────────────────────────────────
router.get('/:id', (req, res) => {
  const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.id);
  if (!perf) return res.json({ success: false, message: 'Performance not found' });
  const scores = db.prepare('SELECT * FROM performance_scores WHERE performance_id = ?').all(req.params.id);
  res.json({ success: true, data: { ...perf, scores } });
});

// ─── Save score for a student ───────────────────────────────────
router.post('/:id/score', (req, res) => {
  const { studentId, score } = req.body;
  if (!studentId) return res.json({ success: false, message: 'studentId required' });
  const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.id);
  if (!perf) return res.json({ success: false, message: 'Performance not found' });
  db.prepare(`
    INSERT INTO performance_scores (performance_id, student_id, score)
    VALUES (?, ?, ?)
    ON CONFLICT(performance_id, student_id) DO UPDATE SET score = excluded.score, saved_at = datetime('now')
  `).run(req.params.id, studentId, score || 0);
  invalidateCache('/api/performance');
  res.json({ success: true, message: 'Score saved' });
});

// ─── Get all scores for a section's performances ────────────────
router.get('/section-summary', (req, res) => {
  const { databaseId, gradeLevel, section } = req.query;
  if (!databaseId || !gradeLevel || !section) return res.json({ success: false, message: 'Missing params' });
  const performances = db.prepare(
    'SELECT * FROM performances WHERE database_id = ? AND grade_level = ? AND section = ? ORDER BY created_at'
  ).all(databaseId, gradeLevel, section);

  const students = db.prepare(
    `SELECT * FROM quiz_students WHERE grade_level = ? AND section = ?
     ORDER BY CASE WHEN TRIM(COALESCE(class_no,'')) GLOB '[0-9]*' THEN CAST(class_no AS INTEGER) ELSE 999999 END, student_id`
  ).all(gradeLevel, section);

  const scoreStmt = db.prepare('SELECT * FROM performance_scores WHERE performance_id = ?');
  const perfData = performances.map(p => {
    const scores = scoreStmt.all(p.id);
    const scoreMap = {};
    scores.forEach(s => { scoreMap[s.student_id] = s.score; });
    return { ...p, scoreMap };
  });

  const settings = db.prepare('SELECT * FROM performance_settings WHERE database_id = ?').get(databaseId)
    || { allowed_percentage_weight: 100, midterm_slot: -1, final_slot: -1 };

  const totalMaxScore = performances.reduce((sum, p) => sum + (p.max_score || 0), 0);

  const studentSummaries = students.map(s => {
    const totalScore = performances.reduce((sum, p) => {
      const pData = perfData.find(pd => pd.id === p.id);
      return sum + (pData?.scoreMap[s.student_id] || 0);
    }, 0);
    const avgPerformance = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    const avgPerformanceScore = avgPerformance * (settings.allowed_percentage_weight / 100);
    return {
      studentId: s.student_id,
      thaiName: s.thai_name,
      englishName: s.english_name,
      classNo: s.class_no,
      totalScore,
      avgPerformance: avgPerformance.toFixed(2),
      avgPerformanceScore: avgPerformanceScore.toFixed(2),
      perPerformance: perfData.map(p => ({ perfId: p.id, score: p.scoreMap[s.student_id] || 0 }))
    };
  });

  res.json({
    success: true,
    data: {
      performances: perfData.map(p => ({ id: p.id, title: p.title, lessonNumber: p.lesson_number, performanceType: p.performance_type, maxScore: p.max_score })),
      students: studentSummaries,
      settings,
      totalMaxScore,
      highestPossibleScore: settings.allowed_percentage_weight
    }
  });
});

// ─── Update performance settings ────────────────────────────────
router.post('/settings', (req, res) => {
  const { databaseId, allowedPercentageWeight, midtermSlot, finalSlot } = req.body;
  if (!databaseId) return res.json({ success: false, message: 'databaseId required' });
  db.prepare(`
    INSERT INTO performance_settings (database_id, allowed_percentage_weight, midterm_slot, final_slot)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(database_id) DO UPDATE SET
      allowed_percentage_weight = excluded.allowed_percentage_weight,
      midterm_slot = excluded.midterm_slot,
      final_slot = excluded.final_slot
  `).run(databaseId, allowedPercentageWeight || 100, midtermSlot ?? -1, finalSlot ?? -1);
  invalidateCache('/api/performance');
  res.json({ success: true, message: 'Settings updated' });
});

// ─── Record performances to grading sheet ───────────────────────
router.post('/record-to-grades', (req, res) => {
  const { databaseId, gradeLevel, section, period, slot } = req.body;
  if (!databaseId || !gradeLevel || !section) return res.json({ success: false, message: 'Missing params' });

  const performances = db.prepare(
    'SELECT * FROM performances WHERE database_id = ? AND grade_level = ? AND section = ?'
  ).all(databaseId, gradeLevel, section);

  const settings = db.prepare('SELECT * FROM performance_settings WHERE database_id = ?').get(databaseId)
    || { allowed_percentage_weight: 100 };

  const students = db.prepare(
    'SELECT * FROM quiz_students WHERE grade_level = ? AND section = ?'
  ).all(gradeLevel, section);

  const totalMaxScore = performances.reduce((sum, p) => sum + (p.max_score || 0), 0);

  const tx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, student_id, period, score_type, slot)
      DO UPDATE SET score = excluded.score
    `);
    const upsertConfig = db.prepare(`
      INSERT INTO activity_config (database_id, period, type, slot, name, max_score)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, period, type, slot)
      DO UPDATE SET name = excluded.name, max_score = excluded.max_score
    `);

    const targetPeriod = period || 'midterm';
    const targetSlot = slot ?? 0;
    upsertConfig.run(databaseId, targetPeriod, 'individual', targetSlot, 'Live Performance', settings.allowed_percentage_weight);

    for (const s of students) {
      const totalScore = performances.reduce((sum, p) => {
        const sc = db.prepare('SELECT score FROM performance_scores WHERE performance_id = ? AND student_id = ?').get(p.id, s.student_id);
        return sum + (sc?.score || 0);
      }, 0);
      const avgPerformance = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
      const avgPerformanceScore = avgPerformance * (settings.allowed_percentage_weight / 100);
      upsert.run(databaseId, s.student_id, targetPeriod, 'individual', targetSlot, avgPerformanceScore);
    }
  });
  tx();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `Recorded ${students.length} performance scores to grading sheet` });
});

export default router;
