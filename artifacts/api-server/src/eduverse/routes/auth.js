import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

router.post('/login', (req, res) => {
  const { mode, role } = req.body;
  const userId = String(req.body?.userId || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!role || !userId || !password) {
    res.json({ success: false, message: 'All fields are required' });
    return;
  }

  if (mode === 'admin') {
    if (role === 'admin') {
      const admin = db.prepare('SELECT * FROM grade_admins WHERE user_id = ?').get(userId);
      if (admin && admin.password === password) {
        const token = uuidv4();
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'admin', admin.user_id, JSON.stringify({ name: admin.name, role: admin.role }), expires);
        res.json({ success: true, token, user: { id: admin.user_id, name: admin.name, role: 'admin', mode: 'admin' } });
        return;
      }
      res.json({ success: false, message: 'Invalid Admin ID or Password' });
      return;
    }
  }

  if (mode === 'grades' || mode === 'A') {
    if (role === 'admin') {
      const admin = db.prepare('SELECT * FROM grade_admins WHERE user_id = ?').get(userId);
      if (admin && admin.password === password) {
        const token = uuidv4();
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'grade_admin', admin.user_id, JSON.stringify({ name: admin.name, role: admin.role }), expires);
        res.json({ success: true, token, user: { id: admin.user_id, name: admin.name, role: admin.role, mode: 'grades' } });
        return;
      }
      res.json({ success: false, message: 'Invalid Admin ID or Password' });
      return;
    }

    if (role === 'teacher') {
      const teacher = db.prepare('SELECT * FROM grade_teachers WHERE user_id = ? COLLATE NOCASE').get(userId);
      if (teacher && teacher.password === password) {
        const permissions = db.prepare(`
          SELECT database_id, access_level
          FROM grade_teacher_permissions
          WHERE lower(teacher_user_id) = lower(?)
        `).all(teacher.user_id);
        const token = uuidv4();
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'grade_teacher', teacher.user_id, JSON.stringify({ name: teacher.name, permissions }), expires);
        res.json({ success: true, token, user: { id: teacher.user_id, name: teacher.name, role: 'teacher', mode: 'grades', permissions } });
        return;
      }
      res.json({ success: false, message: 'Invalid Teacher ID or Password' });
      return;
    }

    if (role === 'student') {
      const student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(userId);
      if (student && student.password === password) {
        const token = uuidv4();
        const expires = Date.now() + 12 * 60 * 60 * 1000;
        const studentData = {
          id: student.student_id,
          thai: student.thai_name,
          english: student.english_name,
          section: student.section,
          class: student.class_number,
          databaseId: student.database_id
        };
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'grade_student', student.student_id, JSON.stringify(studentData), expires);
        res.json({ success: true, token, user: { ...studentData, role: 'student', mode: 'grades' } });
        return;
      }
      res.json({ success: false, message: 'Invalid Student ID or Password' });
      return;
    }
  }

  if (mode === 'quiz' || mode === 'B') {
    if (role === 'teacher') {
      const teacher = db.prepare('SELECT * FROM quiz_teachers WHERE username = ? COLLATE NOCASE').get(userId);
      if (teacher && teacher.password === password) {
        const token = uuidv4();
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        const teacherData = { id: teacher.id, name: teacher.name, subjects: teacher.subjects, gradeLevels: teacher.grade_levels };
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'quiz_teacher', String(teacher.id), JSON.stringify(teacherData), expires);
        const user = { ...teacherData, username: teacher.username, role: 'teacher', mode: 'quiz' };
        res.json({ success: true, token, user, teacher: user });
        return;
      }
      res.json({ success: false, message: 'Invalid username or password' });
      return;
    }

    if (role === 'student') {
      const { gradeLevel } = req.body;
      const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ? AND grade_level = ?').get(userId, gradeLevel);
      if (student && student.password === password) {
        const token = uuidv4();
        const expires = Date.now() + 12 * 60 * 60 * 1000;
        const studentData = {
          id: student.student_id,
          studentId: student.student_id,
          englishName: student.english_name,
          thaiName: student.thai_name,
          gradeLevel: student.grade_level,
          section: student.section,
          classNo: student.class_no,
          role: 'student',
          mode: 'quiz'
        };
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_type, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(token, 'quiz_student', student.student_id, JSON.stringify(studentData), expires);
        res.json({ success: true, token, user: studentData, student: studentData });
        return;
      }
      res.json({ success: false, message: 'Invalid Student ID or Password' });
      return;
    }
  }

  res.json({ success: false, message: 'Invalid login parameters' });
});

router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.json({ success: false, message: 'No token' });
    return;
  }
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  if (!session) {
    res.json({ success: false, message: 'Session expired' });
    return;
  }
  res.json({ success: true, user: { type: session.user_type, id: session.user_id, data: JSON.parse(session.data || '{}') } });
});

router.post('/change-password', (req, res) => {
  const { mode, role, userId, oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 3) {
    res.json({ success: false, message: 'Password must be at least 3 characters' });
    return;
  }

  if (mode === 'grades') {
    if (role === 'student') {
      const student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(userId);
      if (student && student.password === oldPassword) {
        db.prepare('UPDATE grade_students SET password = ? WHERE student_id = ?').run(newPassword, userId);
        res.json({ success: true, message: 'Password updated successfully' });
        return;
      }
      res.json({ success: false, message: 'Current password is incorrect' });
      return;
    }
  }

  if (mode === 'quiz') {
    if (role === 'teacher') {
      const teacher = db.prepare('SELECT * FROM quiz_teachers WHERE username = ?').get(userId);
      if (teacher && teacher.password === oldPassword) {
        db.prepare('UPDATE quiz_teachers SET password = ? WHERE username = ?').run(newPassword, userId);
        res.json({ success: true, message: 'Password updated successfully' });
        return;
      }
      res.json({ success: false, message: 'Current password is incorrect' });
      return;
    }
    if (role === 'student') {
      const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ?').get(userId);
      if (student && student.password === oldPassword) {
        db.prepare('UPDATE quiz_students SET password = ? WHERE student_id = ?').run(newPassword, userId);
        res.json({ success: true, message: 'Password updated successfully' });
        return;
      }
      res.json({ success: false, message: 'Current password is incorrect' });
      return;
    }
  }

  res.json({ success: false, message: 'Invalid parameters' });
});

router.post('/password-reset-request', (req, res) => {
  const { studentId } = req.body;
  const student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(studentId);
  if (!student) {
    res.json({ success: false, message: 'Student ID not found' });
    return;
  }
  db.prepare('UPDATE grade_students SET password_reset_request = ?, password_reset_date = ? WHERE student_id = ?')
    .run('PASSWORD CHANGE REQUEST', new Date().toISOString(), studentId);
  res.json({ success: true, message: 'Password request submitted successfully.' });
});

export default router;
