import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';
import XLSX from 'xlsx';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.EDUVERSE_DATA_DIR || path.join(__dirname, '..', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'quiz-media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});
const ALLOWED_MEDIA = new Set(['image', 'video', 'audio']);
const QUIZ_STUDENT_ORDER_BY = `
  ORDER BY section,
    CASE WHEN TRIM(COALESCE(class_no, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_no, '')) <> ''
      THEN CAST(class_no AS INTEGER) ELSE 999999 END,
    class_no
`;

function mediaTypeFromMime(mime = '') {
  const type = String(mime || '').split('/')[0];
  return ALLOWED_MEDIA.has(type) ? type : '';
}

function safeMediaName(original = '') {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
  return `${Date.now()}-${uuidv4()}${ext}`;
}

router.post('/media/upload', mediaUpload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No media file uploaded' });
  const mediaType = mediaTypeFromMime(req.file.mimetype);
  if (!mediaType) return res.json({ success: false, message: 'Only image, video, and audio files are allowed' });
  const filename = safeMediaName(req.file.originalname);
  fs.writeFileSync(path.join(MEDIA_DIR, filename), req.file.buffer);
  res.json({
    success: true,
    data: {
      url: `/uploads/quiz-media/${filename}`,
      mediaType,
      filename,
      originalName: req.file.originalname,
      size: req.file.size
    }
  });
});

// ─── Teacher login (preserves quiz-spa teacher auth) ────────────
router.post('/teacher/login', (req, res) => {
  const { username, password } = req.body;
  const teacher = db.prepare('SELECT * FROM quiz_teachers WHERE username = ?').get(username);
  if (!teacher || teacher.password !== password) {
    res.json({ success: false, error: 'Invalid username or password' });
    return;
  }
  res.json({
    success: true,
    data: {
      id: teacher.id,
      username: teacher.username,
      name: teacher.name,
      subjects: teacher.subjects,
      gradeLevels: teacher.grade_levels
    }
  });
});

// ─── Student login for quiz (preserves quiz-spa student auth) ───
router.post('/student/login', (req, res) => {
  const { studentId, password, gradeLevel } = req.body;
  const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ? AND grade_level = ?')
    .get(studentId, gradeLevel);
  if (!student || student.password !== (password || 'default')) {
    res.json({ success: false, error: 'Invalid Student ID or Password' });
    return;
  }
  res.json({
    success: true,
    data: {
      studentId: student.student_id,
      englishName: student.english_name,
      thaiName: student.thai_name,
      gradeLevel: student.grade_level,
      section: student.section,
      classNo: student.class_no
    }
  });
});

// ─── Student databases (preserves quiz-spa DB management) ───────
router.get('/student-databases', (req, res) => {
  const dbs = db.prepare('SELECT * FROM quiz_student_databases ORDER BY date_added DESC').all();
  res.json({ success: true, data: dbs });
});

router.post('/student-databases', (req, res) => {
  const { name, gradeLevel, spreadsheetUrl, teacherId } = req.body;
  const result = db.prepare(
    'INSERT INTO quiz_student_databases (name, grade_level, spreadsheet_url, teacher_id) VALUES (?, ?, ?, ?)'
  ).run(name, gradeLevel, spreadsheetUrl || '', teacherId || '');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

router.put('/student-databases/:id', (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  const gradeLevel = String(req.body?.gradeLevel || '').trim();
  const spreadsheetUrl = String(req.body?.spreadsheetUrl || '').trim();
  const teacherId = String(req.body?.teacherId || '').trim();

  if (!id) return res.json({ success: false, message: 'Invalid database id' });
  if (!name) return res.json({ success: false, message: 'Name is required' });
  if (!gradeLevel) return res.json({ success: false, message: 'Grade level is required' });

  const result = db.prepare(`
    UPDATE quiz_student_databases
    SET name = ?, grade_level = ?, spreadsheet_url = ?, teacher_id = ?
    WHERE id = ?
  `).run(name, gradeLevel, spreadsheetUrl, teacherId, id);

  if (result.changes === 0) return res.json({ success: false, message: 'Student database not found' });
  res.json({ success: true, message: 'Student database updated' });
});

router.delete('/student-databases/:id', (req, res) => {
  const result = db.prepare('DELETE FROM quiz_student_databases WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.json({ success: false, message: 'Student database not found' });
  res.json({ success: true, message: 'Student database deleted' });
});

// ─── Import students to quiz system ─────────────────────────────
router.post('/students/import', (req, res) => {
  const { students, databaseId, gradeLevel } = req.body;
  const upsert = db.prepare(`
    INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password, database_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, grade_level) DO UPDATE SET
      thai_name=excluded.thai_name, english_name=excluded.english_name,
      section=excluded.section, class_no=excluded.class_no, database_id=excluded.database_id
  `);

  const transaction = db.transaction(() => {
    for (const s of students) {
      upsert.run(s.studentId, s.thaiName || '', s.englishName || '', s.section || '',
        s.classNo || '', gradeLevel, s.password || 'default', databaseId || null);
    }
  });

  transaction();
  res.json({ success: true, data: { count: students.length } });
});

// ─── Get students by grade level ────────────────────────────────
router.get('/students', (req, res) => {
  const { gradeLevel, section } = req.query;
  let query = 'SELECT * FROM quiz_students WHERE 1=1';
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ` ${QUIZ_STUDENT_ORDER_BY}`;
  const students = db.prepare(query).all(...params);
  res.json({ success: true, data: students });
});

// ─── Quiz CRUD (preserves quiz-spa quiz management) ─────────────
router.get('/list', (req, res) => {
  const { status, gradeLevel, createdBy, type, mode } = req.query;
  let query = 'SELECT * FROM quizzes WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (createdBy) { query += ' AND created_by = ?'; params.push(createdBy); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (mode) { query += ' AND quiz_mode = ?'; params.push(mode); }
  query += ' ORDER BY created_at DESC';

  let quizzes = db.prepare(query).all(...params);

  if (gradeLevel) {
    const quizIds = db.prepare('SELECT quiz_id FROM quiz_grade_levels WHERE grade_level = ?')
      .all(gradeLevel).map(r => r.quiz_id);
    quizzes = quizzes.filter(q => quizIds.includes(q.id));
  }

  res.json({ success: true, data: quizzes });
});

router.get('/:id', (req, res, next) => {
  const reserved = new Set([
    'list', 'types', 'grade-levels', 'grading-sheet', 'student-databases',
    'students', 'retake-requests', 'deadline-requests', 'leaderboard', 'team-groups', 'score-mappings',
    'record-to-mode-a', 'record-entries'
  ]);
  if (reserved.has(String(req.params.id || '').toLowerCase())) return next();
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quiz.id);
  const gradeLevels = db.prepare('SELECT grade_level FROM quiz_grade_levels WHERE quiz_id = ?')
    .all(quiz.id).map(r => r.grade_level);
  res.json({ success: true, data: { ...quiz, questions, gradeLevels } });
});

router.post('/create', (req, res) => {
  const { title, type, period, subject, gradeLevel, passingScore, attemptsAllowed,
    timeLimit, retakeAllowed, randomizeQuestions, randomizeChoices,
    startDate, deadline, createdBy, questions, gradeLevels, quizMode, strictMode } = req.body;

  const singleGradeLevel = (gradeLevel && String(gradeLevel).trim())
    || (Array.isArray(gradeLevels) && gradeLevels.length > 0 ? String(gradeLevels[0]).trim() : '')
    || '';

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO quizzes (id, title, type, period, subject, grade_level, passing_score, attempts_allowed,
        time_limit, retake_allowed, randomize_questions, randomize_choices, status,
        created_by, start_date, deadline, question_count, quiz_mode, strict_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, type || 'QUIZ', period || 'midterm', subject || '', singleGradeLevel,
      passingScore || 50, attemptsAllowed || 1, timeLimit || 0,
      retakeAllowed || 'NO', randomizeQuestions || 'NO', randomizeChoices || 'NO',
      'DRAFT', createdBy || '', startDate || '', deadline || '',
      (questions && questions.length) || 0,
      quizMode || 'NORMAL_QUIZ', strictMode ? 1 : 0);

    if (questions && questions.length > 0) {
      const insertQ = db.prepare(`
        INSERT INTO questions (
          quiz_id, question_text, question_type, media_type, media_url,
          choice_a, choice_a_media_type, choice_a_media_url,
          choice_b, choice_b_media_type, choice_b_media_url,
          choice_c, choice_c_media_type, choice_c_media_url,
          choice_d, choice_d_media_type, choice_d_media_url,
          correct_answer, points, question_time_limit, order_num, extra_data
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const txn = db.transaction(() => {
        questions.forEach((q, i) => {
          const cm = q.choiceMedia || {};
          insertQ.run(id, q.questionText || q.question || '', q.questionType || q.type || 'MCQ',
            q.mediaType || q.media_type || '', q.mediaUrl || q.media_url || '',
            q.choiceA || q.choices?.[0] || '', cm.A?.type || '', cm.A?.url || '',
            q.choiceB || q.choices?.[1] || '', cm.B?.type || '', cm.B?.url || '',
            q.choiceC || q.choices?.[2] || '', cm.C?.type || '', cm.C?.url || '',
            q.choiceD || q.choices?.[3] || '', cm.D?.type || '', cm.D?.url || '',
            q.correctAnswer || q.answer || '', q.points || 1, q.questionTimeLimit || 0, i,
            q.extraData || q.extra_data || '');
        });
      });
      txn();
    }

    if (gradeLevels && gradeLevels.length > 0) {
      const insertGL = db.prepare('INSERT OR IGNORE INTO quiz_grade_levels (quiz_id, grade_level) VALUES (?, ?)');
      gradeLevels.forEach((gl) => insertGL.run(id, gl));
    }

    invalidateCache('/api/quiz');
    res.json({ success: true, data: { id } });
  } catch (e) {
    res.json({ success: false, error: 'Create quiz failed', message: e.message || String(e) });
  }
});

router.put('/:id', (req, res) => {
  const { title, type, period, subject, gradeLevel, passingScore, attemptsAllowed,
    timeLimit, retakeAllowed, randomizeQuestions, randomizeChoices,
    startDate, deadline, status, questions, gradeLevels, quizMode, strictMode } = req.body;

  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }

  db.prepare(`
    UPDATE quizzes SET title=?, type=?, period=?, subject=?, grade_level=?, passing_score=?,
      attempts_allowed=?, time_limit=?, retake_allowed=?, randomize_questions=?,
      randomize_choices=?, start_date=?, deadline=?, status=?, question_count=?,
      quiz_mode=?, strict_mode=?
    WHERE id=?
  `).run(
    title || existing.title, type || existing.type, period || existing.period || 'midterm', subject || existing.subject,
    gradeLevel || existing.grade_level, passingScore ?? existing.passing_score,
    attemptsAllowed ?? existing.attempts_allowed, timeLimit ?? existing.time_limit,
    retakeAllowed || existing.retake_allowed, randomizeQuestions || existing.randomize_questions,
    randomizeChoices || existing.randomize_choices, startDate || existing.start_date,
    deadline || existing.deadline, status || existing.status,
    (questions && questions.length) || existing.question_count,
    quizMode || existing.quiz_mode || 'NORMAL_QUIZ',
    strictMode !== undefined ? (strictMode ? 1 : 0) : existing.strict_mode,
    req.params.id
  );

  if (questions) {
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
    const insertQ = db.prepare(`
      INSERT INTO questions (
        quiz_id, question_text, question_type, media_type, media_url,
        choice_a, choice_a_media_type, choice_a_media_url,
        choice_b, choice_b_media_type, choice_b_media_url,
        choice_c, choice_c_media_type, choice_c_media_url,
        choice_d, choice_d_media_type, choice_d_media_url,
        correct_answer, points, question_time_limit, order_num, extra_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const txn = db.transaction(() => {
      questions.forEach((q, i) => {
        const cm = q.choiceMedia || {};
        insertQ.run(req.params.id, q.questionText || q.question || '', q.questionType || q.type || 'MCQ',
          q.mediaType || q.media_type || '', q.mediaUrl || q.media_url || '',
          q.choiceA || q.choices?.[0] || '', cm.A?.type || '', cm.A?.url || '',
          q.choiceB || q.choices?.[1] || '', cm.B?.type || '', cm.B?.url || '',
          q.choiceC || q.choices?.[2] || '', cm.C?.type || '', cm.C?.url || '',
          q.choiceD || q.choices?.[3] || '', cm.D?.type || '', cm.D?.url || '',
          q.correctAnswer || q.answer || '', q.points || 1, q.questionTimeLimit || 0, i,
          q.extraData || q.extra_data || '');
      });
    });
    txn();
  }

  if (gradeLevels) {
    db.prepare('DELETE FROM quiz_grade_levels WHERE quiz_id = ?').run(req.params.id);
    const insertGL = db.prepare('INSERT OR IGNORE INTO quiz_grade_levels (quiz_id, grade_level) VALUES (?, ?)');
    gradeLevels.forEach(gl => insertGL.run(req.params.id, gl));
  }

  invalidateCache('/api/quiz');
  res.json({ success: true, data: { id: req.params.id } });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Quiz not found', message: 'Quiz not found' });
  }
  db.prepare('DELETE FROM live_game_answers WHERE game_id IN (SELECT id FROM live_games WHERE quiz_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM live_game_players WHERE game_id IN (SELECT id FROM live_games WHERE quiz_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM live_games WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quiz_grade_levels WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM retake_requests WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM deadline_requests WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Quiz deleted' });
});

// ─── Quiz status management (preserves publish/close flow) ──────
function setQuizStatus(req, res, status, message) {
  const existing = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Quiz not found', message: 'Quiz not found' });
  }
  db.prepare('UPDATE quizzes SET status = ? WHERE id = ?').run(status, req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true, message });
}

router.post('/:id/publish', (req, res) => setQuizStatus(req, res, 'ACTIVE', 'Quiz published'));
router.post('/:id/close', (req, res) => setQuizStatus(req, res, 'CLOSED', 'Quiz closed'));
router.post('/:id/reopen', (req, res) => setQuizStatus(req, res, 'ACTIVE', 'Quiz reopened'));

// ─── Available quizzes for students ─────────────────────────────
router.get('/available/:gradeLevel', (req, res) => {
  const { studentId } = req.query;
  const quizIds = db.prepare('SELECT quiz_id FROM quiz_grade_levels WHERE grade_level = ?')
    .all(req.params.gradeLevel).map(r => r.quiz_id);

  if (quizIds.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const placeholders = quizIds.map(() => '?').join(',');
  const quizzes = db.prepare(`SELECT * FROM quizzes WHERE id IN (${placeholders}) AND status = 'ACTIVE' AND (quiz_mode = 'NORMAL_QUIZ' OR quiz_mode IS NULL) ORDER BY created_at DESC`)
    .all(...quizIds);

  const result = quizzes.map(quiz => {
    let attempts = [];
    if (studentId) {
      attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
        .all(quiz.id, studentId);
    }
    const isExpired = quiz.deadline && new Date(quiz.deadline) < new Date();
    const attemptsUsed = attempts.length;
    const maxAttempts = quiz.attempts_allowed || 1;
    const canTake = !isExpired && attemptsUsed < maxAttempts;
    const bestScore = attempts.length > 0 ? Math.max(...attempts.map(a => a.percentage || 0)) : null;

    return {
      ...quiz,
      attemptsUsed,
      maxAttempts,
      canTake,
      isExpired,
      bestScore,
      lastAttempt: attempts.length > 0 ? attempts[attempts.length - 1] : null
    };
  });

  res.json({ success: true, data: result });
});

// ─── Start quiz attempt (preserves quiz-spa startAttempt) ───────
router.post('/attempt/start', (req, res) => {
  const { quizId, studentId, studentName, gradeLevel, section, classNo } = req.body;

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }
  if (quiz.status !== 'ACTIVE') {
    res.json({ success: false, error: 'Quiz is not active' });
    return;
  }

  const existingAttempts = db.prepare('SELECT COUNT(*) as cnt FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
    .get(quizId, studentId).cnt;
  if (existingAttempts >= (quiz.attempts_allowed || 1)) {
    res.json({ success: false, error: 'Maximum attempts reached' });
    return;
  }

  if (quiz.deadline && new Date(quiz.deadline) < new Date()) {
    res.json({ success: false, error: 'Quiz deadline has passed' });
    return;
  }

  let questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quizId);
  if (quiz.randomize_questions === 'YES') {
    questions = questions.sort(() => Math.random() - 0.5);
  }

  const attemptId = uuidv4();
  db.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, grade_level, section, class_no, total_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attemptId, quizId, studentId, studentName || '', gradeLevel || '', section || '', classNo || '',
    questions.reduce((sum, q) => sum + (q.points || 1), 0));

  const sanitizedQuestions = questions.map((q, i) => {
    const choices = [
      { letter: 'A', text: q.choice_a, mediaType: q.choice_a_media_type || '', mediaUrl: q.choice_a_media_url || '' },
      { letter: 'B', text: q.choice_b, mediaType: q.choice_b_media_type || '', mediaUrl: q.choice_b_media_url || '' },
      { letter: 'C', text: q.choice_c, mediaType: q.choice_c_media_type || '', mediaUrl: q.choice_c_media_url || '' },
      { letter: 'D', text: q.choice_d, mediaType: q.choice_d_media_type || '', mediaUrl: q.choice_d_media_url || '' }
    ].filter(c => c.text);
    const displayChoices = quiz.randomize_choices === 'YES'
      ? choices.sort(() => Math.random() - 0.5) : choices;
    let extraData = null;
    try { extraData = q.extra_data ? JSON.parse(q.extra_data) : null; } catch {}
    return {
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      mediaType: q.media_type || '',
      mediaUrl: q.media_url || '',
      choices: displayChoices,
      points: q.points,
      questionTimeLimit: q.question_time_limit,
      extraData,
      order: i
    };
  });
  // Track attempt start in quiz_student_status
  try {
    db.prepare(`
      INSERT INTO quiz_student_status (quiz_id, attempt_id, student_id, student_name, grade_level, section, status, current_question, is_blocked)
      VALUES (?, ?, ?, ?, ?, ?, 'in_progress', 0, 0)
      ON CONFLICT(quiz_id, student_id) DO UPDATE SET
        attempt_id=excluded.attempt_id, status='in_progress', current_question=0,
        updated_at=datetime('now'), is_blocked=0
    `).run(quizId, attemptId, studentId, studentName || '', gradeLevel || '', section || '');
  } catch {}

  res.json({
    success: true,
    data: {
      attemptId,
      quizTitle: quiz.title,
      timeLimit: quiz.time_limit,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + (q.points || 1), 0),
      questions: sanitizedQuestions
    }
  });
});

// ─── Submit quiz (preserves quiz-spa submitAttempt) ──────────────
router.post('/attempt/submit', (req, res) => {
  const { attemptId, answers, tabSwitchCount } = req.body;

  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId);
  if (!attempt) {
    res.json({ success: false, error: 'Attempt not found' });
    return;
  }
  if (attempt.submitted) {
    res.json({ success: false, error: 'Already submitted' });
    return;
  }

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(attempt.quiz_id);
  const questionMap = {};
  questions.forEach(q => { questionMap[q.id] = q; });

  let totalScore = 0;
  let totalPoints = 0;

  const insertAnswer = db.prepare(`
    INSERT INTO quiz_answers (attempt_id, question_id, student_answer, is_correct, points_earned)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const ans of (answers || [])) {
      const question = questionMap[ans.questionId];
      if (!question) continue;
      const qType = (question.question_type || 'MCQ').toUpperCase();
      let isCorrect = false;
      if (qType === 'RATING_GRID') {
        isCorrect = true; // Survey type — always counted as correct
      } else if (qType === 'MULTIPLE_RESPONSE') {
        const studentSorted = String(ans.answer || '').trim().split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort().join(',');
        const correctSorted = String(question.correct_answer || '').trim().split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort().join(',');
        isCorrect = studentSorted === correctSorted && studentSorted.length > 0;
      } else if (qType === 'MATCHING') {
        // Student answer is JSON: [{left, right}] or "MATCH" if skipped
        try {
          const extra = JSON.parse(question.extra_data || '{}');
          const pairs = extra.pairs || [];
          const studentPairs = JSON.parse(ans.answer || '[]');
          isCorrect = pairs.length > 0 && pairs.every(p => studentPairs.some(sp => String(sp.left || '').trim() === String(p.left || '').trim() && String(sp.right || '').trim() === String(p.right || '').trim()));
        } catch { isCorrect = false; }
      } else if (qType === 'SEQUENCING') {
        const studentOrder = String(ans.answer || '').trim();
        const correctOrder = String(question.correct_answer || '').trim();
        isCorrect = studentOrder === correctOrder && studentOrder.length > 0;
      } else {
        isCorrect = String(ans.answer || '').trim().toUpperCase() ===
          String(question.correct_answer || '').trim().toUpperCase();
      }
      const pointsEarned = isCorrect ? (question.points || 1) : 0;
      totalScore += pointsEarned;
      totalPoints += (question.points || 1);
      insertAnswer.run(attemptId, ans.questionId, ans.answer || '', isCorrect ? 1 : 0, pointsEarned);
    }

    for (const q of questions) {
      if (!answers || !answers.find(a => a.questionId === q.id)) {
        totalPoints += (q.points || 1);
        insertAnswer.run(attemptId, q.id, '', 0, 0);
      }
    }

    const percentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
    const quiz = db.prepare('SELECT passing_score FROM quizzes WHERE id = ?').get(attempt.quiz_id);
    const result = percentage >= (quiz?.passing_score || 50) ? 'PASSED' : 'FAILED';

    db.prepare(`
      UPDATE quiz_attempts SET end_time=?, score=?, total_points=?, percentage=?,
        result=?, tab_switch_count=?, submitted=1
      WHERE id=?
    `).run(new Date().toISOString(), totalScore, totalPoints, percentage.toFixed(2),
      result, tabSwitchCount || 0, attemptId);
    try {
      db.prepare(`UPDATE quiz_student_status SET status='completed', updated_at=datetime('now') WHERE attempt_id=?`).run(attemptId);
    } catch {}
  });

  transaction();
  invalidateCache('/api/quiz');

  const updated = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId);
  const answersResult = db.prepare(`
    SELECT qa.*, q.question_text, q.correct_answer, q.choice_a, q.choice_b, q.choice_c, q.choice_d
    FROM quiz_answers qa
    JOIN questions q ON qa.question_id = q.id
    WHERE qa.attempt_id = ?
  `).all(attemptId);

  res.json({
    success: true,
    data: {
      score: updated.score,
      totalPoints: updated.total_points,
      percentage: updated.percentage,
      result: updated.result,
      tabSwitchCount: updated.tab_switch_count,
      answers: answersResult.map(a => ({
        questionText: a.question_text,
        studentAnswer: a.student_answer,
        correctAnswer: a.correct_answer,
        isCorrect: a.is_correct === 1,
        pointsEarned: a.points_earned
      }))
    }
  });
});

// ─── Auto-save (preserves AnswerSaver pattern) ──────────────────
router.post('/attempt/autosave', (req, res) => {
  const { attemptId, answers, tabSwitchCount } = req.body;
  if (!attemptId) {
    res.json({ success: false, error: 'No attempt ID' });
    return;
  }
  db.prepare('UPDATE quiz_attempts SET tab_switch_count = ? WHERE id = ? AND submitted = 0')
    .run(tabSwitchCount || 0, attemptId);
  res.json({ success: true });
});

// ─── Quiz results for teacher ───────────────────────────────────
router.get('/:id/results', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }

  const attempts = db.prepare(`
    SELECT * FROM quiz_attempts WHERE quiz_id = ? AND submitted = 1 ORDER BY percentage DESC
  `).all(req.params.id);

  const statistics = {
    totalAttempts: attempts.length,
    averageScore: attempts.length > 0 ? (attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length).toFixed(2) : 0,
    highestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.percentage || 0)).toFixed(2) : 0,
    lowestScore: attempts.length > 0 ? Math.min(...attempts.map(a => a.percentage || 0)).toFixed(2) : 0,
    passCount: attempts.filter(a => a.result === 'PASSED').length,
    failCount: attempts.filter(a => a.result === 'FAILED').length
  };

  res.json({ success: true, data: { quiz, attempts, statistics } });
});

// ─── Student quiz history ───────────────────────────────────────
router.get('/student/:studentId/history', (req, res) => {
  const { gradeLevel } = req.query;
  let query = 'SELECT qa.*, q.title as quiz_title, q.type as quiz_type, q.subject FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id WHERE qa.student_id = ? AND qa.submitted = 1';
  const params = [req.params.studentId];
  if (gradeLevel) { query += ' AND qa.grade_level = ?'; params.push(gradeLevel); }
  query += ' ORDER BY qa.end_time DESC';

  const history = db.prepare(query).all(...params);
  res.json({ success: true, data: history });
});

// ─── Attempt details ────────────────────────────────────────────
router.get('/attempt/:attemptId', (req, res) => {
  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(req.params.attemptId);
  if (!attempt) {
    res.json({ success: false, error: 'Attempt not found' });
    return;
  }
  const answers = db.prepare(`
    SELECT qa.*, q.question_text, q.correct_answer, q.choice_a, q.choice_b, q.choice_c, q.choice_d
    FROM quiz_answers qa JOIN questions q ON qa.question_id = q.id
    WHERE qa.attempt_id = ? ORDER BY q.order_num
  `).all(req.params.attemptId);

  res.json({ success: true, data: { ...attempt, answers } });
});

// ─── Retake requests (preserves quiz-spa missed quiz flow) ──────
router.post('/retake-request', (req, res) => {
  const { studentId, studentName, quizId, quizTitle, reason } = req.body;
  db.prepare(`
    INSERT INTO retake_requests (student_id, student_name, quiz_id, quiz_title, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, studentName || '', quizId, quizTitle || '', reason || '');
  res.json({ success: true });
});

router.get('/retake-requests', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM retake_requests';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const requests = db.prepare(query).all(...params);
  res.json({ success: true, data: requests });
});

router.post('/retake-request/:id/approve', (req, res) => {
  db.prepare('UPDATE retake_requests SET status = ? WHERE id = ?').run('APPROVED', req.params.id);
  const request = db.prepare('SELECT * FROM retake_requests WHERE id = ?').get(req.params.id);
  if (request) {
    db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
      .run(request.quiz_id, request.student_id);
  }
  res.json({ success: true });
});

router.post('/retake-request/:id/deny', (req, res) => {
  db.prepare('UPDATE retake_requests SET status = ? WHERE id = ?').run('DENIED', req.params.id);
  res.json({ success: true });
});

// ─── Deadline extension requests ────────────────────────────────
router.post('/deadline-request', (req, res) => {
  const { studentId, studentName, quizId, quizTitle, reason } = req.body;
  db.prepare(`
    INSERT INTO deadline_requests (student_id, student_name, quiz_id, quiz_title, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, studentName || '', quizId, quizTitle || '', reason || '');
  res.json({ success: true });
});

router.get('/deadline-requests', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM deadline_requests';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const requests = db.prepare(query).all(...params);
  res.json({ success: true, data: requests });
});

router.post('/deadline-request/:id/approve', (req, res) => {
  db.prepare('UPDATE deadline_requests SET status = ? WHERE id = ?').run('APPROVED', req.params.id);
  res.json({ success: true });
});

router.post('/deadline-request/:id/deny', (req, res) => {
  db.prepare('UPDATE deadline_requests SET status = ? WHERE id = ?').run('DENIED', req.params.id);
  res.json({ success: true });
});

// ─── Leaderboard ────────────────────────────────────────────────
router.get('/leaderboard', (req, res) => {
  const { gradeLevel, quizId } = req.query;
  let query = `
    SELECT student_id, student_name, grade_level, section,
      COUNT(*) as quizzes_taken,
      AVG(percentage) as avg_score,
      MAX(percentage) as best_score,
      SUM(CASE WHEN result='PASSED' THEN 1 ELSE 0 END) as passed_count
    FROM quiz_attempts WHERE submitted = 1
  `;
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (quizId) { query += ' AND quiz_id = ?'; params.push(quizId); }
  query += ' GROUP BY student_id ORDER BY avg_score DESC LIMIT 100';

  const leaderboard = db.prepare(query).all(...params);
  res.json({ success: true, data: leaderboard });
});

// ─── Grade levels ───────────────────────────────────────────────
router.get('/grade-levels', (req, res) => {
  const assigned = db.prepare(
    "SELECT DISTINCT grade_level FROM section_database_assignments WHERE mode = 'B' ORDER BY grade_level"
  ).all();
  if (assigned.length > 0) {
    res.json({ success: true, data: assigned.map((g) => g.grade_level) });
    return;
  }
  const gradeLevels = db.prepare('SELECT DISTINCT grade_level FROM quiz_students ORDER BY grade_level').all();
  res.json({ success: true, data: gradeLevels.map((g) => g.grade_level) });
});

// ─── Quiz types ─────────────────────────────────────────────────
router.get('/types', (req, res) => {
  const types = db.prepare('SELECT * FROM quiz_types ORDER BY name').all();
  res.json({ success: true, data: types.map(t => t.name) });
});

router.get('/team-groups', (req, res) => {
  const { gradeLevel, section } = req.query;
  let query = 'SELECT * FROM quiz_team_groups WHERE 1=1';
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ' ORDER BY grade_level, section, group_name, student_id';
  const rows = db.prepare(query).all(...params);
  res.json({ success: true, data: rows });
});

router.get('/team-groups/overview', (req, res) => {
  const { gradeLevel, section } = req.query;
  if (!gradeLevel || !section) return res.json({ success: false, message: 'gradeLevel and section are required' });
  const students = db.prepare(
    `SELECT student_id, thai_name, english_name, class_no, section, grade_level
     FROM quiz_students
     WHERE grade_level = ? AND section = ?
     ORDER BY CASE WHEN TRIM(COALESCE(class_no, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_no, '')) <> '' THEN CAST(class_no AS INTEGER) ELSE 999999 END, class_no, student_id`
  ).all(gradeLevel, section);
  const memberRows = db.prepare(
    'SELECT group_name, student_id FROM quiz_team_groups WHERE grade_level = ? AND section = ? ORDER BY group_name, student_id'
  ).all(gradeLevel, section);
  const byId = new Map(students.map((s) => [s.student_id, s]));
  const grouped = {};
  memberRows.forEach((m) => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    const st = byId.get(m.student_id);
    if (st) grouped[m.group_name].push(st);
  });
  const assigned = new Set(memberRows.map((m) => m.student_id));
  const unassigned = students.filter((s) => !assigned.has(s.student_id));
  res.json({
    success: true,
    data: {
      gradeLevel,
      section,
      groups: Object.entries(grouped).map(([groupName, members]) => ({ groupName, members })),
      unassigned
    }
  });
});

router.post('/team-groups/auto', (req, res) => {
  const { gradeLevel, section, groupCount } = req.body;
  const gc = Math.max(1, Number(groupCount) || 1);
  if (!gradeLevel || !section) return res.json({ success: false, message: 'gradeLevel and section are required' });
  const students = db.prepare('SELECT * FROM quiz_students WHERE grade_level = ? AND section = ? ORDER BY class_no').all(gradeLevel, section);
  if (!students.length) return res.json({ success: false, message: 'No students found for section' });
  const shuffled = [...students].sort(() => Math.random() - 0.5);
  const groups = Array.from({ length: gc }, () => []);
  shuffled.forEach((s, i) => groups[i % gc].push(s));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quiz_team_groups WHERE grade_level = ? AND section = ?').run(gradeLevel, section);
    const ins = db.prepare('INSERT INTO quiz_team_groups (grade_level, section, group_name, student_id) VALUES (?, ?, ?, ?)');
    groups.forEach((g, i) => {
      const name = `Team ${i + 1}`;
      g.forEach((st) => ins.run(gradeLevel, section, name, st.student_id));
    });
  });
  tx();
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Groups generated' });
});

router.post('/team-groups/assign', (req, res) => {
  const { gradeLevel, section, studentId, groupName } = req.body;
  if (!gradeLevel || !section || !studentId || !groupName) return res.json({ success: false, message: 'Missing fields' });
  db.prepare(`
    INSERT INTO quiz_team_groups (grade_level, section, group_name, student_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(grade_level, section, student_id) DO UPDATE SET group_name=excluded.group_name
  `).run(gradeLevel, section, groupName, studentId);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Member reassigned' });
});

router.post('/team-groups/remove', (req, res) => {
  const { gradeLevel, section, studentId } = req.body;
  if (!gradeLevel || !section || !studentId) return res.json({ success: false, message: 'Missing fields' });
  db.prepare('DELETE FROM quiz_team_groups WHERE grade_level = ? AND section = ? AND student_id = ?')
    .run(gradeLevel, section, studentId);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Member removed from group' });
});

router.post('/team-groups/delete-group', (req, res) => {
  const { gradeLevel, section, groupName } = req.body;
  if (!gradeLevel || !section || !groupName) return res.json({ success: false, message: 'Missing fields' });
  db.prepare('DELETE FROM quiz_team_groups WHERE grade_level = ? AND section = ? AND group_name = ?')
    .run(gradeLevel, section, groupName);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Group deleted' });
});

router.post('/team-groups/delete-all', (req, res) => {
  const { gradeLevel, section } = req.body;
  if (!gradeLevel || !section) return res.json({ success: false, message: 'Missing fields' });
  db.prepare('DELETE FROM quiz_team_groups WHERE grade_level = ? AND section = ?').run(gradeLevel, section);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'All groups deleted' });
});

router.get('/score-mappings', (req, res) => {
  const { gradeLevel } = req.query;
  let query = 'SELECT * FROM quiz_score_mappings WHERE active = 1';
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  query += ' ORDER BY grade_level, period, score_type, slot';
  res.json({ success: true, data: db.prepare(query).all(...params) });
});

function usedModeASlots(databaseId, period, scoreType) {
  const used = new Set();
  db.prepare('SELECT DISTINCT slot FROM activity_config WHERE database_id = ? AND period = ? AND type = ?')
    .all(databaseId, period, scoreType).forEach((r) => used.add(Number(r.slot)));
  db.prepare('SELECT DISTINCT slot FROM student_scores WHERE database_id = ? AND period = ? AND score_type = ?')
    .all(databaseId, period, scoreType).forEach((r) => used.add(Number(r.slot)));
  db.prepare('SELECT DISTINCT slot FROM quiz_score_mappings WHERE target_database_id = ? AND period = ? AND score_type = ? AND active = 1')
    .all(databaseId, period, scoreType).forEach((r) => used.add(Number(r.slot)));
  return used;
}

router.post('/score-mappings', (req, res) => {
  const { gradeLevel, targetDatabaseId, period, scoreType, slot, sourceType, sourceQuizId, applyMode } = req.body;
  if (!gradeLevel || !targetDatabaseId || !period || !scoreType) return res.json({ success: false, message: 'Missing required fields' });
  const slotNumber = Number(slot);
  if (!Number.isInteger(slotNumber) || slotNumber < 0 || slotNumber > 4) {
    return res.json({ success: false, message: 'Slot must be between 0 and 4 (displayed as slots 1–5)' });
  }
  const used = usedModeASlots(Number(targetDatabaseId), period, scoreType);
  if (used.has(slotNumber)) {
    const free = [0, 1, 2, 3, 4].filter((n) => !used.has(n)).map((n) => n + 1);
    return res.json({ success: false, message: `Slot ${slotNumber + 1} is already used. Available: ${free.join(', ') || 'none'}` });
  }
  const result = db.prepare(`
    INSERT INTO quiz_score_mappings (grade_level, target_database_id, period, score_type, slot, source_type, source_quiz_id, apply_mode, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(gradeLevel, Number(targetDatabaseId), period, scoreType, slotNumber, sourceType || 'QUIZ_ATTEMPT', sourceQuizId || '', applyMode || 'BEST');
  invalidateCache('/api/quiz');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

router.put('/score-mappings/:id', (req, res) => {
  const { period, scoreType, slot, sourceType, sourceQuizId, active } = req.body;
  db.prepare(`
    UPDATE quiz_score_mappings
    SET period = COALESCE(?, period),
        score_type = COALESCE(?, score_type),
        slot = COALESCE(?, slot),
        source_type = COALESCE(?, source_type),
        source_quiz_id = COALESCE(?, source_quiz_id),
        active = COALESCE(?, active)
    WHERE id = ?
  `).run(period || null, scoreType || null, slot ?? null, sourceType || null, sourceQuizId ?? null, active ?? null, Number(req.params.id));
  res.json({ success: true, message: 'Mapping updated' });
});

router.delete('/score-mappings/:id', (req, res) => {
  db.prepare('DELETE FROM quiz_score_mappings WHERE id = ?').run(Number(req.params.id));
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Mapping deleted' });
});

router.get('/record-entries', (req, res) => {
  const { gradeLevel } = req.query;
  const quizAttempts = db.prepare(`
    SELECT qa.id, 'QUIZ_ATTEMPT' AS source_type, qa.quiz_id, q.title AS quiz_title, qa.student_id, qa.student_name,
      qa.grade_level, qa.section, qa.class_no, qa.percentage, qa.end_time AS recorded_at
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.submitted = 1 ${gradeLevel ? 'AND qa.grade_level = ?' : ''}
    ORDER BY qa.end_time DESC
    LIMIT 500
  `).all(...(gradeLevel ? [gradeLevel] : []));
  const liveGames = db.prepare(`
    SELECT lg.id, 'LIVE_GAME' AS source_type, lg.quiz_id, q.title AS quiz_title, '' AS student_id, '' AS student_name,
      '' AS grade_level, '' AS section, '' AS class_no, 0 AS percentage, lg.created_at AS recorded_at
    FROM live_games lg
    JOIN quizzes q ON q.id = lg.quiz_id
    WHERE lg.status IN ('RESULTS', 'ENDED') ${gradeLevel ? "AND EXISTS (SELECT 1 FROM live_game_players p JOIN quiz_students qs ON qs.student_id = p.student_id WHERE p.game_id = lg.id AND qs.grade_level = ?)" : ''}
    ORDER BY lg.created_at DESC
    LIMIT 200
  `).all(...(gradeLevel ? [gradeLevel] : []));
  res.json({ success: true, data: { quizAttempts, liveGames } });
});

router.delete('/record-entries/:sourceType/:id', (req, res) => {
  const sourceType = String(req.params.sourceType || '').toUpperCase();
  const id = req.params.id;
  if (sourceType === 'QUIZ_ATTEMPT') {
    db.prepare('DELETE FROM quiz_answers WHERE attempt_id = ?').run(id);
    db.prepare('DELETE FROM quiz_attempts WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Quiz attempt deleted' });
  }
  if (sourceType === 'LIVE_GAME') {
    db.prepare('DELETE FROM live_game_answers WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM live_game_players WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM live_game_team_question_scores WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM live_games WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Live game record deleted' });
  }
  res.json({ success: false, message: 'Unsupported source type' });
});

router.post('/record-to-mode-a', (req, res) => {
  const { mappingId } = req.body;
  const mapping = db.prepare('SELECT * FROM quiz_score_mappings WHERE id = ? AND active = 1').get(mappingId);
  if (!mapping) return res.json({ success: false, message: 'Mapping not found' });

  let sourceRows = [];
  if ((mapping.source_type || 'QUIZ_ATTEMPT') === 'LIVE_GAME') {
    sourceRows = db.prepare(`
      SELECT lg.quiz_id, lg.id as game_id, lgp.student_id, lgp.total_score as percentage
      FROM live_game_players lgp
      JOIN live_games lg ON lg.id = lgp.game_id
      JOIN quiz_students qs ON qs.student_id = lgp.student_id
      WHERE qs.grade_level = ? AND lg.status IN ('RESULTS','ENDED')
      ${mapping.source_quiz_id ? 'AND lg.quiz_id = ?' : ''}
    `).all(...(mapping.source_quiz_id ? [mapping.grade_level, mapping.source_quiz_id] : [mapping.grade_level]));
  } else {
    sourceRows = db.prepare(`
      SELECT qa.quiz_id, qa.student_id, MAX(qa.percentage) as percentage
      FROM quiz_attempts qa
      JOIN quiz_students qs ON qs.student_id = qa.student_id
      WHERE qa.submitted = 1 AND qs.grade_level = ?
      ${mapping.source_quiz_id ? 'AND qa.quiz_id = ?' : ''}
      GROUP BY qa.quiz_id, qa.student_id
    `).all(...(mapping.source_quiz_id ? [mapping.grade_level, mapping.source_quiz_id] : [mapping.grade_level]));
  }

  const tx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, student_id, period, score_type, slot)
      DO UPDATE SET score = excluded.score
    `);
    sourceRows.forEach((r) => {
      upsert.run(
        mapping.target_database_id,
        r.student_id,
        mapping.period,
        mapping.score_type,
        mapping.slot,
        Number(r.percentage) || 0
      );
    });
  });
  tx();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `Recorded ${sourceRows.length} scores to Mode A` });
});

function buildQuizGradingSheetData(gradeLevel, section) {
  let query = 'SELECT * FROM quiz_students WHERE 1=1';
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ` ${QUIZ_STUDENT_ORDER_BY}`;
  const studentsRaw = db.prepare(query).all(...params);

  const quizzes = db.prepare(
    'SELECT id, title, type, subject, passing_score, question_count FROM quizzes ORDER BY created_at'
  ).all();

  const bestStmt = db.prepare(
    'SELECT MAX(percentage) as best FROM quiz_attempts WHERE student_id = ? AND quiz_id = ? AND submitted = 1'
  );

  const students = studentsRaw.map((s) => {
    const quizScores = {};
    quizzes.forEach((q) => {
      const best = bestStmt.get(s.student_id, q.id);
      quizScores[q.id] = best?.best ?? '';
    });
    return {
      studentId: s.student_id,
      thaiName: s.thai_name || '',
      englishName: s.english_name || '',
      section: s.section || '',
      classNumber: s.class_no || '',
      gradeLevel: s.grade_level || '',
      quizScores
    };
  });

  return {
    weights: { note: 'Quiz scores are percentages (0–100). Passing % shown per quiz column.' },
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title || '',
      type: q.type || 'QUIZ',
      subject: q.subject || '',
      passingScore: q.passing_score ?? 50,
      maxScore: 100,
      questionCount: q.question_count ?? 0
    })),
    students
  };
}

router.get('/grading-sheet', (req, res) => {
  const { gradeLevel, section } = req.query;
  const data = buildQuizGradingSheetData(gradeLevel || '', section || '');
  res.json({ success: true, gradeLevel: gradeLevel || '', section: section || '', ...data });
});

function saveQuizGradingSheetRows(gradeLevel, scores) {
  if (!Array.isArray(scores) || scores.length === 0) {
    return { success: false, message: 'scores array is required' };
  }

  const findBest = db.prepare(`
    SELECT id, percentage FROM quiz_attempts
    WHERE quiz_id = ? AND student_id = ? AND submitted = 1
    ORDER BY percentage DESC LIMIT 1
  `);
  const updateAttempt = db.prepare(`
    UPDATE quiz_attempts SET percentage = ?, score = ?, total_points = 100,
      result = ?, submitted = 1, end_time = COALESCE(end_time, datetime('now'))
    WHERE id = ?
  `);
  const insertAttempt = db.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, grade_level, section, class_no,
      score, total_points, percentage, result, submitted, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, 1, datetime('now'))
  `);
  const quizPassing = db.prepare('SELECT passing_score FROM quizzes WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const row of scores) {
      const { studentId, quizId, score, studentName, section, classNumber } = row;
      if (!studentId || !quizId) continue;
      const pct = Math.min(100, Math.max(0, Number(score) || 0));
      const quiz = quizPassing.get(quizId);
      const passing = quiz?.passing_score ?? 50;
      const result = pct >= passing ? 'PASSED' : 'FAILED';

      const existing = findBest.get(quizId, studentId);
      if (existing) {
        updateAttempt.run(pct, pct, result, existing.id);
      } else {
        const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ?').get(studentId);
        const attemptId = `sheet-${studentId}-${quizId}`;
        insertAttempt.run(
          attemptId, quizId, studentId,
          studentName || student?.english_name || '',
          gradeLevel || student?.grade_level || '',
          section || student?.section || '',
          classNumber || student?.class_no || '',
          pct, pct, result
        );
      }
    }
  });

  transaction();
  invalidateCache('/api/quiz');
  return { success: true, message: 'Quiz grading sheet saved' };
}

router.post('/grading-sheet/save', (req, res) => {
  const { gradeLevel, scores } = req.body;
  const result = saveQuizGradingSheetRows(gradeLevel, scores);
  res.json(result);
});

router.post('/grading-sheet/save-student', (req, res) => {
  const { gradeLevel, studentId, scores } = req.body;
  if (!studentId) return res.json({ success: false, message: 'studentId is required' });
  if (!Array.isArray(scores) || scores.length === 0) {
    return res.json({ success: false, message: 'scores array is required' });
  }
  const normalized = scores.map((s) => ({ ...s, studentId }));
  const result = saveQuizGradingSheetRows(gradeLevel, normalized);
  res.json(result.success ? { ...result, message: 'Student scores saved' } : result);
});

router.get('/grading-sheet/export', (req, res) => {
  const { gradeLevel, section } = req.query;
  const { students, quizzes } = buildQuizGradingSheetData(gradeLevel || '', section || '');

  const rows = students.map((s) => {
    const row = {
      'STUDENT ID': s.studentId,
      'THAI NAME': s.thaiName,
      'ENGLISH NAME': s.englishName,
      'SECTION': s.section,
      'CLASS NUMBER': s.classNumber,
      'GRADE LEVEL': s.gradeLevel
    };
    quizzes.forEach((q) => {
      row[`QUIZ | ${q.title} [PERFECT:100]`] = s.quizScores[q.id] ?? '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ModeB_GradingSheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ModeB_Grading_Sheet_${gradeLevel || 'ALL'}.xlsx"`);
  res.send(Buffer.from(buf));
});

// ─── Students list (for Live Performance games) ─────────────────
router.get('/students', (req, res) => {
  const { gradeLevel, section } = req.query;
  if (!gradeLevel) return res.json({ success: false, error: 'gradeLevel required' });
  let query = 'SELECT * FROM quiz_students WHERE grade_level = ?';
  const params = [gradeLevel];
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ` ${QUIZ_STUDENT_ORDER_BY}`;
  const students = db.prepare(query).all(...params);
  res.json({ success: true, data: students });
});

// ─── View Sections — live student status for a quiz ─────────────
router.get('/:id/sections-status', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

  const gradeLevels = db.prepare('SELECT grade_level FROM quiz_grade_levels WHERE quiz_id = ?')
    .all(req.params.id).map(r => r.grade_level);
  if (gradeLevels.length === 0 && quiz.grade_level) gradeLevels.push(quiz.grade_level);

  let students = [];
  if (gradeLevels.length > 0) {
    const ph = gradeLevels.map(() => '?').join(',');
    students = db.prepare(`SELECT * FROM quiz_students WHERE grade_level IN (${ph}) ORDER BY section, CASE WHEN TRIM(COALESCE(class_no,'')) GLOB '[0-9]*' THEN CAST(class_no AS INTEGER) ELSE 999999 END, student_id`).all(...gradeLevels);
  }

  const attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ?').all(req.params.id);
  const attemptsByStudent = {};
  attempts.forEach(a => { if (!attemptsByStudent[a.student_id]) attemptsByStudent[a.student_id] = []; attemptsByStudent[a.student_id].push(a); });

  const statusRows = db.prepare('SELECT * FROM quiz_student_status WHERE quiz_id = ?').all(req.params.id);
  const statusByStudent = {};
  statusRows.forEach(s => { statusByStudent[s.student_id] = s; });

  const result = students.map(s => {
    const studentAttempts = attemptsByStudent[s.student_id] || [];
    const statusRow = statusByStudent[s.student_id];
    const submittedAttempt = studentAttempts.find(a => a.submitted === 1);
    const inProgressAttempt = studentAttempts.find(a => a.submitted === 0);
    let status = 'NOT_STARTED';
    if (statusRow?.is_blocked) status = 'BLOCKED';
    else if (submittedAttempt) status = 'COMPLETED';
    else if (inProgressAttempt || statusRow?.status === 'in_progress') status = 'IN_PROGRESS';
    return {
      ...s,
      status,
      score: submittedAttempt ? submittedAttempt.percentage : null,
      result: submittedAttempt ? submittedAttempt.result : null,
      tabSwitchCount: submittedAttempt ? submittedAttempt.tab_switch_count : (inProgressAttempt ? inProgressAttempt.tab_switch_count : 0),
      currentQuestion: statusRow ? statusRow.current_question : 0,
      attemptCount: studentAttempts.filter(a => a.submitted === 1).length
    };
  });

  const sections = {};
  result.forEach(s => {
    const sec = s.section || 'Unknown';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(s);
  });

  res.json({
    success: true,
    data: {
      quiz,
      students: result,
      sections: Object.entries(sections).map(([section, students]) => ({ section, students }))
    }
  });
});

// ─── Force retake — teacher deletes student's attempts ──────────
router.post('/:id/force-retake/:studentId', (req, res) => {
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.json({ success: false, error: 'Quiz not found' });
  db.prepare('DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?)')
    .run(req.params.id, req.params.studentId);
  db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
    .run(req.params.id, req.params.studentId);
  db.prepare('DELETE FROM quiz_student_status WHERE quiz_id = ? AND student_id = ?')
    .run(req.params.id, req.params.studentId);
  invalidateCache('/api/quiz');
  res.json({ success: true, message: 'Retake forced — student can now retake' });
});

// ─── Block / Unblock student during quiz ────────────────────────
router.post('/:id/block-student/:studentId', (req, res) => {
  try {
    db.prepare(`
      INSERT INTO quiz_student_status (quiz_id, attempt_id, student_id, status, is_blocked)
      VALUES (?, '', ?, 'blocked', 1)
      ON CONFLICT(quiz_id, student_id) DO UPDATE SET is_blocked=1, status='blocked', updated_at=datetime('now')
    `).run(req.params.id, req.params.studentId);
    res.json({ success: true, message: 'Student blocked' });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

router.post('/:id/unblock-student/:studentId', (req, res) => {
  db.prepare(`UPDATE quiz_student_status SET is_blocked=0, status='in_progress', updated_at=datetime('now') WHERE quiz_id=? AND student_id=?`)
    .run(req.params.id, req.params.studentId);
  res.json({ success: true, message: 'Student unblocked' });
});

// ─── Student status update (called from student portal) ─────────
router.post('/student-status', (req, res) => {
  const { quizId, attemptId, studentId, currentQuestion, tabSwitchCount } = req.body;
  if (!quizId || !studentId) return res.json({ success: false, error: 'Missing quizId or studentId' });
  try {
    db.prepare(`
      UPDATE quiz_student_status SET current_question=?, tab_switch_count=?, updated_at=datetime('now')
      WHERE quiz_id=? AND student_id=? AND is_blocked=0
    `).run(currentQuestion || 0, tabSwitchCount || 0, quizId, studentId);
    // Check if blocked
    const status = db.prepare('SELECT is_blocked FROM quiz_student_status WHERE quiz_id=? AND student_id=?').get(quizId, studentId);
    res.json({ success: true, isBlocked: status?.is_blocked === 1 });
  } catch { res.json({ success: true, isBlocked: false }); }
});

export default router;

