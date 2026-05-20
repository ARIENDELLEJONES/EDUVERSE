import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';
import { requireGradeWrite } from '../middleware/gradeAccess.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const QUIZ_STUDENT_ORDER_BY = `
  ORDER BY section,
    CASE WHEN TRIM(COALESCE(class_no, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_no, '')) <> ''
      THEN CAST(class_no AS INTEGER) ELSE 999999 END,
    class_no
`;

const DEFAULT_GRADE_LEVELS = [
  'MATHAYUM 1', 'MATHAYUM 2', 'MATHAYUM 3', 'MATHAYUM 4', 'MATHAYUM 5', 'MATHAYUM 6'
];

function buildSimplePdf(lines = []) {
  const sanitized = (lines || []).map((line) => String(line || '').replace(/[()\\]/g, ' ').replace(/[^\x20-\x7E]/g, ''));
  const pageLines = sanitized.slice(0, 70);
  const textOps = pageLines.map((line, i) => `BT /F1 10 Tf 50 ${780 - (i * 11)} Td (${line}) Tj ET`).join('\n');
  const objects = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj');
  const stream = `${textOps}\n`;
  objects.push(`4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}endstream endobj`);
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

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

// --- Get all students (unified across both modes) ---
router.get('/', (req, res) => {
  const { mode, databaseId, gradeLevel, section } = req.query;

  if (mode === 'grades' || mode === 'A') {
    if (!databaseId && gradeLevel && section) {
      const assigned = db.prepare("SELECT database_id FROM section_database_assignments WHERE mode = 'A' AND grade_level = ? AND section = ?").get(gradeLevel, section);
      if (assigned) req.query.databaseId = assigned.database_id;
    }
    let query = 'SELECT * FROM grade_students WHERE 1=1';
    const params = [];
    if (req.query.databaseId || databaseId) { query += ' AND database_id = ?'; params.push(req.query.databaseId || databaseId); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_number';
    const limit = parseInt(req.query.limit, 10);
    if (limit > 0) {
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(Math.min(limit, 2000), offset);
    }
    const students = db.prepare(query).all(...params);
    res.json({ success: true, data: students });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    const effectiveGradeLevel = gradeLevel;
    if (gradeLevel && section) {
      const assigned = db.prepare("SELECT database_id FROM section_database_assignments WHERE mode = 'B' AND grade_level = ? AND section = ?").get(gradeLevel, section);
      if (assigned) {
        const mappedStudents = db.prepare(`SELECT * FROM quiz_students WHERE database_id = ? ${QUIZ_STUDENT_ORDER_BY}`).all(assigned.database_id);
        return res.json({ success: true, data: mappedStudents });
      }
    }
    let query = 'SELECT * FROM quiz_students WHERE 1=1';
    const params = [];
    if (effectiveGradeLevel) { query += ' AND grade_level = ?'; params.push(effectiveGradeLevel); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ` ${QUIZ_STUDENT_ORDER_BY}`;
    const limit = parseInt(req.query.limit, 10);
    if (limit > 0) {
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(Math.min(limit, 2000), offset);
    }
    const students = db.prepare(query).all(...params);
    res.json({ success: true, data: students });
    return;
  }

  const gradeStudents = db.prepare('SELECT * FROM grade_students ORDER BY section, class_number').all();
  const quizStudents = db.prepare(`
    SELECT * FROM quiz_students
    ORDER BY grade_level, section,
      CASE WHEN TRIM(COALESCE(class_no, '')) GLOB '[0-9]*' AND TRIM(COALESCE(class_no, '')) <> ''
        THEN CAST(class_no AS INTEGER) ELSE 999999 END,
      class_no
  `).all();
  res.json({ success: true, data: { gradeStudents, quizStudents } });
});

// --- Add student ---
router.post('/', (req, res) => {
  const { mode, databaseId, studentId, thaiName, englishName, section, classNumber, gradeLevel, password } = req.body;

  if (mode === 'grades' || mode === 'A') {
    try {
      db.prepare(`
        INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(databaseId, studentId, thaiName || '', englishName || '', section || '', classNumber || '', password || 'default');
      invalidateCache('/api/students');
      invalidateCache('/api/grades');
      res.json({ success: true, message: 'Student added' });
    } catch (e) {
      res.json({ success: false, message: e.message.includes('UNIQUE') ? 'Student ID already exists' : e.message });
    }
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    try {
      db.prepare(`
        INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(studentId, thaiName || '', englishName || '', section || '', classNumber || '', gradeLevel, password || 'default');
      invalidateCache('/api/students');
      invalidateCache('/api/quiz');
      res.json({ success: true, message: 'Student added' });
    } catch (e) {
      res.json({ success: false, message: e.message.includes('UNIQUE') ? 'Student ID already exists for this grade level' : e.message });
    }
    return;
  }

  res.json({ success: false, message: 'Mode is required (grades or quiz)' });
});

// --- Update student ---
router.put('/:id', (req, res) => {
  const { mode, thaiName, englishName, section, classNumber, password } = req.body;

  if (mode === 'grades' || mode === 'A') {
    const result = db.prepare(`
      UPDATE grade_students SET thai_name=?, english_name=?, section=?, class_number=?, password=COALESCE(?, password)
      WHERE id=?
    `).run(thaiName, englishName, section, classNumber, password || null, req.params.id);
    if (result.changes === 0) {
      return res.json({ success: false, message: 'Student not found' });
    }
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true, message: 'Student updated' });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    const result = db.prepare(`
      UPDATE quiz_students SET thai_name=?, english_name=?, section=?, class_no=?, password=COALESCE(?, password)
      WHERE id=?
    `).run(thaiName, englishName, section, classNumber, password || null, req.params.id);
    if (result.changes === 0) {
      return res.json({ success: false, message: 'Student not found' });
    }
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true, message: 'Student updated' });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

// --- Delete student ---
router.delete('/:id', (req, res) => {
  const { mode } = req.query;

  if (mode === 'grades' || mode === 'A') {
    const result = db.prepare('DELETE FROM grade_students WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.json({ success: false, message: 'Student not found' });
    }
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true, message: 'Student deleted' });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    const result = db.prepare('DELETE FROM quiz_students WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.json({ success: false, message: 'Student not found' });
    }
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true, message: 'Student deleted' });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

router.post('/:studentId/reset-password', (req, res) => {
  const { mode } = req.body;
  const studentId = req.params.studentId;

  if (mode === 'grades' || mode === 'A') {
    db.prepare('UPDATE grade_students SET password = ?, password_reset_request = ? WHERE student_id = ?')
      .run('default', '', studentId);
    res.json({ success: true, message: 'Password reset to default' });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    db.prepare('UPDATE quiz_students SET password = ? WHERE student_id = ?')
      .run('default', studentId);
    res.json({ success: true, message: 'Password reset to default' });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

router.get('/password-requests', (req, res) => {
  const requests = db.prepare(
    "SELECT * FROM grade_students WHERE password_reset_request != '' AND password_reset_request IS NOT NULL ORDER BY password_reset_date DESC"
  ).all();
  res.json({
    success: true,
    data: requests.map(r => ({
      studentId: r.student_id,
      thaiName: r.thai_name,
      englishName: r.english_name,
      section: r.section,
      request: r.password_reset_request,
      date: r.password_reset_date
    }))
  });
});

router.post('/sync', (req, res) => {
  const { direction, databaseId, gradeLevel } = req.body;

  if (direction === 'grades-to-quiz') {
    const gradeStudents = db.prepare('SELECT * FROM grade_students WHERE database_id = ?').all(databaseId);
    const upsert = db.prepare(`
      INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, grade_level) DO UPDATE SET
        thai_name=excluded.thai_name, english_name=excluded.english_name,
        section=excluded.section, class_no=excluded.class_no
    `);
    const txn = db.transaction(() => {
      for (const s of gradeStudents) upsert.run(s.student_id, s.thai_name, s.english_name, s.section, s.class_number, gradeLevel, s.password);
    });
    txn();
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true, message: `${gradeStudents.length} students synced from grades to quiz` });
    return;
  }

  if (direction === 'quiz-to-grades') {
    const quizStudents = db.prepare('SELECT * FROM quiz_students WHERE grade_level = ?').all(gradeLevel);
    const upsert = db.prepare(`
      INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, student_id) DO UPDATE SET
        thai_name=excluded.thai_name, english_name=excluded.english_name,
        section=excluded.section, class_number=excluded.class_no
    `);
    const txn = db.transaction(() => {
      for (const s of quizStudents) upsert.run(databaseId, s.student_id, s.thai_name, s.english_name, s.section, s.class_no, s.password);
    });
    txn();
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true, message: `${quizStudents.length} students synced from quiz to grades` });
    return;
  }

  res.json({ success: false, message: 'Invalid sync direction' });
});

router.get('/template-excel', (req, res) => {
  const headers = ['STUDENT ID', 'THAI NAME', 'ENGLISH NAME', 'SECTION', 'CLASS NUMBER', 'GRADE LEVEL'];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="EDUVERSE_Student_Template.xlsx"');
  res.send(Buffer.from(buf));
});

router.get('/template-pdf', (req, res) => {
  const lines = [
    'EDUVERSE STUDENT TEMPLATE',
    'Columns:',
    'STUDENT ID | THAI NAME | ENGLISH NAME | SECTION | CLASS NUMBER | GRADE LEVEL',
    'Use this exact column format in Excel for bulk import.'
  ];
  const pdf = buildSimplePdf(lines);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="EDUVERSE_Student_Template.pdf"');
  res.send(pdf);
});

router.get('/export-pdf', (req, res) => {
  const { mode, databaseId, gradeLevel, section } = req.query;
  let students = [];
  if (mode === 'grades') {
    let query = 'SELECT * FROM grade_students WHERE 1=1';
    const params = [];
    if (databaseId) { query += ' AND database_id = ?'; params.push(databaseId); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_number';
    students = db.prepare(query).all(...params);
  } else {
    let query = 'SELECT * FROM quiz_students WHERE 1=1';
    const params = [];
    if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ` ${QUIZ_STUDENT_ORDER_BY}`;
    students = db.prepare(query).all(...params);
  }
  const lines = [
    'EDUVERSE STUDENT LIST',
    `Mode: ${mode || 'all'}`,
    `Total students: ${students.length}`,
    '----------------------------------------',
    ...students.map((s, i) => `${i + 1}. ${s.student_id} | ${s.thai_name || ''} | ${s.english_name || ''} | ${s.section || ''} | ${s.class_number || s.class_no || ''} | ${s.grade_level || gradeLevel || ''}`)
  ];
  const pdf = buildSimplePdf(lines);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="EDUVERSE_Students.pdf"');
  res.send(pdf);
});

// --- Excel Export ---
router.get('/export-excel', (req, res) => {
  const { mode, databaseId, gradeLevel, section, studentId } = req.query;
  let students = [];
  let sheetName = 'Students';

  if (mode === 'grades') {
    let query = 'SELECT * FROM grade_students WHERE 1=1';
    const params = [];
    if (databaseId) { query += ' AND database_id = ?'; params.push(databaseId); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    if (studentId) { query += ' AND student_id = ?'; params.push(studentId); }
    query += ' ORDER BY section, class_number';
    students = db.prepare(query).all(...params);
    sheetName = 'Grade Students';
  } else {
    let query = 'SELECT * FROM quiz_students WHERE 1=1';
    const params = [];
    if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    if (studentId) { query += ' AND student_id = ?'; params.push(studentId); }
    query += ` ${QUIZ_STUDENT_ORDER_BY}`;
    students = db.prepare(query).all(...params);
    sheetName = gradeLevel || 'Quiz Students';
  }

  const rows = students.map(s => ({
    'STUDENT ID': s.student_id,
    'THAI NAME': s.thai_name || '',
    'ENGLISH NAME': s.english_name || '',
    'SECTION': s.section || '',
    'CLASS NUMBER': s.class_number || s.class_no || '',
    'GRADE LEVEL': s.grade_level || gradeLevel || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `EDUVERSE_Students_${(gradeLevel || 'all').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buf));
});

function importExcelAuth(req, res, next) {
  const mode = req.body?.mode;
  if (mode === 'grades' || mode === 'A') return requireGradeWrite((r) => r.body?.databaseId)(req, res, next);
  next();
}

router.post('/import-excel', upload.single('file'), importExcelAuth, (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No file uploaded' });

  const { mode, databaseId, gradeLevel } = req.body;
  if (!mode) return res.json({ success: false, message: 'Mode is required (grades or quiz)' });

  try {
    const wb = XLSX.read(req.file.buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (rows.length === 0) return res.json({ success: false, message: 'Excel file is empty' });

    let imported = 0;
    let skipped = 0;

    if (mode === 'grades' || mode === 'A') {
      if (!databaseId) return res.json({ success: false, message: 'databaseId is required for grades mode' });
      const upsert = db.prepare(`
        INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(database_id, student_id) DO UPDATE SET
          thai_name=excluded.thai_name, english_name=excluded.english_name,
          section=excluded.section, class_number=excluded.class_number
      `);
      const txn = db.transaction(() => {
        for (const row of rows) {
          const sid = String(row['STUDENT ID'] || row.student_id || row['Student ID'] || row.StudentID || row.ID || '').trim();
          if (!sid) { skipped++; continue; }
          const thai = String(row['THAI NAME'] || row.thai_name || row['Thai Name'] || row.ThaiName || '').trim();
          const eng = String(row['ENGLISH NAME'] || row.english_name || row['English Name'] || row.EnglishName || row.Name || '').trim();
          const sec = String(row.SECTION || row.section || row.Section || '').trim();
          const cls = String(row['CLASS NUMBER'] || row.class_number || row['Class Number'] || row.ClassNumber || row['Class No'] || '').trim();
          upsert.run(databaseId, sid, thai, eng, sec, cls, 'default');
          imported++;
        }
      });
      txn();
      invalidateCache('/api/students');
      invalidateCache('/api/grades');
    } else if (mode === 'quiz' || mode === 'B') {
      const dbId = databaseId ? parseInt(databaseId, 10) : null;
      const upsert = db.prepare(`
        INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password, database_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, grade_level) DO UPDATE SET
          thai_name=excluded.thai_name, english_name=excluded.english_name,
          section=excluded.section, class_no=excluded.class_no,
          database_id=COALESCE(excluded.database_id, quiz_students.database_id)
      `);
      const txn = db.transaction(() => {
        for (const row of rows) {
          const sid = String(row['STUDENT ID'] || row.student_id || row['Student ID'] || row.StudentID || row.ID || '').trim();
          if (!sid) { skipped++; continue; }
          const thai = String(row['THAI NAME'] || row.thai_name || row['Thai Name'] || row.ThaiName || '').trim();
          const eng = String(row['ENGLISH NAME'] || row.english_name || row['English Name'] || row.EnglishName || row.Name || '').trim();
          const sec = String(row.SECTION || row.section || row.Section || '').trim();
          const cls = String(row['CLASS NUMBER'] || row.class_number || row['Class Number'] || row.ClassNumber || row['Class No'] || row.class_no || '').trim();
          const gl = String(row['GRADE LEVEL'] || row.grade_level || row['Grade Level'] || row.GradeLevel || gradeLevel || '').trim();
          if (!gl) { skipped++; continue; }
          upsert.run(sid, thai, eng, sec, cls, gl, 'default', dbId);
          imported++;
        }
      });
      txn();
      invalidateCache('/api/students');
      invalidateCache('/api/quiz');
    } else {
      return res.json({ success: false, message: 'Invalid mode. Use grades or quiz.' });
    }

    if (imported === 0 && skipped > 0) {
      return res.json({ success: false, message: 'No rows were imported. Check required columns: STUDENT ID and GRADE LEVEL.' });
    }
    res.json({ success: true, message: `Imported ${imported} students, skipped ${skipped} rows`, imported, skipped });
  } catch (e) {
    res.json({ success: false, message: 'Failed to parse Excel file: ' + e.message });
  }
});

export default router;
