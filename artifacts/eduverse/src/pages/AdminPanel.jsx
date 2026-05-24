import React, { useState, useEffect } from 'react';
import { api, downloadFile } from '../api';
import GradingSheetEditor from '../components/GradingSheetEditor';
import UnifiedGradingSheet from '../components/UnifiedGradingSheet';

const DEFAULT_GRADE_LEVELS = ['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'];

export default function AdminPanel({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('system');
  const [systemInfo, setSystemInfo] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [importData, setImportData] = useState('');
  const [syncDirection, setSyncDirection] = useState('grades-to-quiz');
  const [syncDbId, setSyncDbId] = useState('');
  const [syncGradeLevel, setSyncGradeLevel] = useState('');
  const [databases, setDatabases] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherForm, setTeacherForm] = useState({ userId: '', name: '', password: '', teacherMode: 'both' });
  const [assignments, setAssignments] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ mode: 'A', gradeLevel: 'MATHAYUM 1', section: '', databaseId: '' });
  const [newDbName, setNewDbName] = useState('');
  const [editingDbId, setEditingDbId] = useState(null);
  const [editingDbName, setEditingDbName] = useState('');
  const [quizStudentDbs, setQuizStudentDbs] = useState([]);
  const [quizDbForm, setQuizDbForm] = useState({ name: '', gradeLevel: 'MATHAYUM 1', spreadsheetUrl: '', teacherId: '' });
  const [editingQuizDbId, setEditingQuizDbId] = useState(null);
  const [assignedLevelsA, setAssignedLevelsA] = useState(DEFAULT_GRADE_LEVELS);
  const [assignedLevelsB, setAssignedLevelsB] = useState(DEFAULT_GRADE_LEVELS);
  const [exportResultFilter, setExportResultFilter] = useState('');
  const [sheetMode, setSheetMode] = useState('grades');
  const [sheetDbId, setSheetDbId] = useState('');
  const [sheetGradeLevel, setSheetGradeLevel] = useState('');
  const [sheetSections, setSheetSections] = useState([]);
  const [studentMode, setStudentMode] = useState('grades');
  const [studentDbId, setStudentDbId] = useState('');
  const [studentGradeLevel, setStudentGradeLevel] = useState('');
  const [adminStudents, setAdminStudents] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);

  useEffect(() => { loadSystemInfo(); loadBackups(); loadDatabases(); loadTeachers(); loadAssignments(); loadAssignedLevels(); loadQuizStudentDbs(); }, []);

  useEffect(() => {
    if ((sheetMode === 'grades' || sheetMode === 'unified') && sheetDbId) {
      (async () => {
        const res = await api.get(`/grades/sections?databaseId=${sheetDbId}`);
        if (res.success) setSheetSections(res.sections || []);
      })();
    } else if (sheetMode === 'quiz' && sheetGradeLevel) {
      (async () => {
        const res = await api.get(`/quiz/students?gradeLevel=${encodeURIComponent(sheetGradeLevel)}`);
        if (res.success) {
          const secs = [...new Set((res.data || []).map((s) => s.section).filter(Boolean))].sort();
          setSheetSections(secs);
        }
      })();
    } else {
      setSheetSections([]);
    }
  }, [sheetMode, sheetDbId, sheetGradeLevel]);

  const loadAssignedLevels = async () => {
    const [a, b] = await Promise.all([
      api.get('/admin/assigned-grade-levels?mode=A'),
      api.get('/admin/assigned-grade-levels?mode=B')
    ]);
    if (a.success && a.gradeLevels?.length) setAssignedLevelsA(a.gradeLevels);
    if (b.success && b.gradeLevels?.length) setAssignedLevelsB(b.gradeLevels);
  };

  const createDatabase = async () => {
    if (!newDbName.trim()) return;
    const res = await api.post('/admin/databases', { name: newDbName.trim() });
    showToast(res.message || (res.success ? 'Database created' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) { setNewDbName(''); await loadDatabases(); await loadTeachers(); }
  };

  const deleteDatabase = async (id) => {
    if (!confirm('Delete this database and all related grade data?')) return;
    const res = await api.del(`/admin/databases/${id}`);
    if (res.success) {
      showToast(res.message || 'Database deleted');
      await loadDatabases();
      await loadAssignments();
    } else showToast(res.message || 'Delete failed', 'error');
  };

  const startEditDatabase = (db) => {
    setEditingDbId(db.id);
    setEditingDbName(db.name || '');
  };

  const saveDatabaseEdit = async () => {
    if (!editingDbId || !editingDbName.trim()) return;
    const res = await api.put(`/admin/databases/${editingDbId}`, { name: editingDbName.trim() });
    showToast(res.message || (res.success ? 'Database updated' : 'Update failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setEditingDbId(null);
      setEditingDbName('');
      await loadDatabases();
      await loadAssignments();
    }
  };

  const createQuizStudentDb = async () => {
    if (!quizDbForm.name.trim()) return showToast('Student DB name is required', 'error');
    if (!quizDbForm.gradeLevel.trim()) return showToast('Grade level is required', 'error');
    const res = await api.post('/quiz/student-databases', {
      name: quizDbForm.name.trim(),
      gradeLevel: quizDbForm.gradeLevel.trim(),
      spreadsheetUrl: quizDbForm.spreadsheetUrl.trim(),
      teacherId: quizDbForm.teacherId.trim()
    });
    showToast(res.message || (res.success ? 'Student DB created' : 'Create failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setQuizDbForm({ name: '', gradeLevel: assignedLevelsB[0] || 'MATHAYUM 1', spreadsheetUrl: '', teacherId: '' });
      await loadQuizStudentDbs();
    }
  };

  const startEditQuizDb = (db) => {
    setEditingQuizDbId(db.id);
    setQuizDbForm({
      name: db.name || '',
      gradeLevel: db.grade_level || assignedLevelsB[0] || 'MATHAYUM 1',
      spreadsheetUrl: db.spreadsheet_url || '',
      teacherId: db.teacher_id || ''
    });
  };

  const saveQuizDbEdit = async () => {
    if (!editingQuizDbId) return;
    const res = await api.put(`/quiz/student-databases/${editingQuizDbId}`, {
      name: quizDbForm.name.trim(),
      gradeLevel: quizDbForm.gradeLevel.trim(),
      spreadsheetUrl: quizDbForm.spreadsheetUrl.trim(),
      teacherId: quizDbForm.teacherId.trim()
    });
    showToast(res.message || (res.success ? 'Student DB updated' : 'Update failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setEditingQuizDbId(null);
      setQuizDbForm({ name: '', gradeLevel: assignedLevelsB[0] || 'MATHAYUM 1', spreadsheetUrl: '', teacherId: '' });
      await loadQuizStudentDbs();
    }
  };

  const deleteQuizStudentDb = async (id) => {
    if (!confirm('Delete this Mode B student database entry?')) return;
    const res = await api.del(`/quiz/student-databases/${id}`);
    showToast(res.message || (res.success ? 'Student DB deleted' : 'Delete failed'), res.success ? 'success' : 'error');
    if (res.success) await loadQuizStudentDbs();
  };

  const loadSystemInfo = async () => {
    const res = await api.get('/system/info');
    setSystemInfo(res);
  };

  const loadBackups = async () => {
    const res = await api.get('/backup');
    if (res.success) setBackups(res.data);
  };

  const loadDatabases = async () => {
    const res = await api.get('/grades/databases');
    if (res.success) setDatabases(res.databases);
  };
  const loadQuizStudentDbs = async () => {
    const res = await api.get('/quiz/student-databases');
    if (res.success) setQuizStudentDbs(res.data || []);
  };
  const loadTeachers = async () => {
    const res = await api.get('/admin/teachers');
    if (res.success) setTeachers(res.data);
  };
  const loadAssignments = async () => {
    const res = await api.get('/admin/section-assignments');
    if (res.success) setAssignments(res.data);
  };
  const addTeacher = async () => {
    if (!teacherForm.userId?.trim()) {
      showToast('Teacher ID is required', 'error');
      return;
    }
    const res = await api.post('/admin/teachers', {
      ...teacherForm,
      userId: teacherForm.userId.trim()
    });
    showToast(res.message || (res.success ? 'Teacher added' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setTeacherForm({ userId: '', name: '', password: '', teacherMode: 'both' });
      await loadTeachers();
    }
  };
  const removeTeacher = async (userId) => {
    if (!confirm(`Remove teacher ${userId}?`)) return;
    const res = await api.del(`/admin/teachers/${encodeURIComponent(userId)}`);
    if (res.success) {
      showToast('Teacher removed');
      await loadTeachers();
    } else showToast(res.message || 'Remove failed', 'error');
  };
  const savePermission = async (teacherId, databaseId, accessLevel) => {
    const teacher = teachers.find(t => t.user_id === teacherId);
    const existing = teacher?.permissions || [];
    const map = new Map(existing.map(p => [String(p.databaseId), p.accessLevel]));
    map.set(String(databaseId), accessLevel);
    const permissions = Array.from(map.entries()).map(([dbId, level]) => ({ databaseId: parseInt(dbId), accessLevel: level }));
    const res = await api.post(`/admin/teachers/${encodeURIComponent(teacherId)}/permissions`, { permissions });
    showToast(res.success ? 'Permission saved' : 'Failed', res.success ? 'success' : 'error');
    if (res.success) loadTeachers();
  };
  const saveAssignment = async () => {
    if (!assignmentForm.section?.trim() || !assignmentForm.databaseId) {
      showToast('Section and database are required', 'error');
      return;
    }
    const res = await api.post('/admin/section-assignments', {
      ...assignmentForm,
      section: assignmentForm.section.trim(),
      databaseId: parseInt(assignmentForm.databaseId, 10)
    });
    showToast(res.message || (res.success ? 'Assignment saved' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) { await loadAssignments(); await loadAssignedLevels(); }
  };

  const createJsonBackup = async () => {
    setBackupLoading(true);
    const res = await api.post('/backup/json', { modules: ['students', 'grades', 'quizzes', 'settings'] });
    if (res.success) {
      showToast(`Backup created: ${res.filename}`);
      loadBackups();
    } else showToast(res.message || 'Backup failed', 'error');
    setBackupLoading(false);
  };

  const createSqliteBackup = async () => {
    setBackupLoading(true);
    const res = await api.post('/backup/sqlite');
    if (res.success) {
      showToast(`SQLite backup: ${res.filename}`);
      loadBackups();
    } else showToast(res.message || 'Backup failed', 'error');
    setBackupLoading(false);
  };

  const downloadBackup = async (filename) => {
    try {
      await downloadFile(`/api/backup/download/${encodeURIComponent(filename)}`, filename);
      showToast('Backup downloaded');
    } catch {
      showToast('Backup download failed', 'error');
    }
  };

  const deleteBackup = async (id) => {
    if (!confirm('Delete this backup?')) return;
    const res = await api.del(`/backup/${id}`);
    if (res.success) {
      showToast('Backup deleted');
      await loadBackups();
    } else showToast(res.message || 'Delete failed', 'error');
  };

  const restoreFromJson = async () => {
    if (!importData.trim()) { showToast('Paste backup JSON data', 'error'); return; }
    try {
      const data = JSON.parse(importData);
      const res = await api.post('/backup/restore/json', { data });
      showToast(res.message || 'Restored', res.success ? 'success' : 'error');
      if (res.success) {
        setImportData('');
        await loadDatabases();
        await loadTeachers();
        await loadAssignments();
      }
    } catch (e) {
      showToast('Invalid JSON data', 'error');
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => { setImportData(evt.target.result); };
    reader.readAsText(file);
  };

  const syncStudents = async () => {
    if (!syncDbId || !syncGradeLevel) {
      showToast('Select database and grade level', 'error');
      return;
    }
    const res = await api.post('/students/sync', {
      direction: syncDirection,
      databaseId: parseInt(syncDbId, 10),
      gradeLevel: syncGradeLevel
    });
    showToast(res.message || (res.success ? 'Sync complete' : 'Sync failed'), res.success ? 'success' : 'error');
    if (res.success) {
      await loadDatabases();
      await loadAssignments();
    }
  };

  const exportGradesExcel = async () => {
    if (!syncDbId) return;
    const params = new URLSearchParams({ mode: 'grades', databaseId: syncDbId });
    if (exportResultFilter) params.set('resultFilter', exportResultFilter);
    try {
      await downloadFile(`/api/students/export-excel?${params}`, `grades_db_${syncDbId}.xlsx`);
      showToast('Excel downloaded');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const exportQuizExcel = async () => {
    const gl = syncGradeLevel || assignedLevelsB[0] || '';
    const params = new URLSearchParams({ mode: 'quiz' });
    if (gl) params.set('gradeLevel', gl);
    try {
      await downloadFile(`/api/students/export-excel?${params}`, `quiz_students.xlsx`);
      showToast('Excel downloaded');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const downloadStudentTemplate = async () => {
    try {
      await downloadFile('/api/students/template-excel', 'EDUVERSE_Student_Template.xlsx');
      showToast('Template downloaded');
    } catch {
      showToast('Template download failed', 'error');
    }
  };

  const downloadStudentTemplatePdf = async () => {
    try {
      await downloadFile('/api/students/template-pdf', 'EDUVERSE_Student_Template.pdf');
      showToast('PDF template downloaded');
    } catch {
      showToast('Template download failed', 'error');
    }
  };

  const deleteStudent = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Delete student ${student.student_id}?`)) return;
    const mode = studentMode === 'grades' ? 'grades' : 'quiz';
    const res = await api.del(`/students/${student.id}?mode=${mode}`);
    showToast(res.message || (res.success ? 'Student deleted' : 'Delete failed'), res.success ? 'success' : 'error');
    if (res.success) await loadAdminStudents();
  };

  const loadAdminStudents = async () => {
    if (studentMode === 'grades') {
      if (!studentDbId) { setAdminStudents([]); return; }
      const res = await api.get(`/students?mode=grades&databaseId=${studentDbId}&limit=1000`);
      if (res.success) setAdminStudents(res.data || []);
    } else {
      const gl = studentGradeLevel || assignedLevelsB[0] || '';
      if (!gl) { setAdminStudents([]); return; }
      const res = await api.get(`/students?mode=quiz&gradeLevel=${encodeURIComponent(gl)}&limit=1000`);
      if (res.success) setAdminStudents(res.data || []);
    }
  };

  const uploadStudentExcel = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', studentMode === 'grades' ? 'grades' : 'quiz');
    if (studentMode === 'grades') {
      if (!studentDbId) { showToast('Select a database first', 'error'); return; }
      fd.append('databaseId', studentDbId);
    } else {
      const gl = studentGradeLevel || assignedLevelsB[0] || '';
      if (!gl) { showToast('Select a grade level first', 'error'); return; }
      fd.append('gradeLevel', gl);
      if (studentDbId) fd.append('databaseId', studentDbId);
    }
    const token = localStorage.getItem('eduverse_token');
    try {
      const res = await fetch('/api/students/import-excel', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'Upload complete' : 'Upload failed'), data.success ? 'success' : 'error');
      if (data.success) await loadAdminStudents();
    } catch {
      showToast('Upload failed', 'error');
    }
  };

  const saveStudentNames = async () => {
    if (!editingStudent) return;
    const res = await api.put(`/students/${editingStudent.id}`, {
      mode: studentMode === 'grades' ? 'grades' : 'quiz',
      thaiName: editingStudent.thai_name,
      englishName: editingStudent.english_name,
      section: editingStudent.section,
      classNumber: editingStudent.class_number || editingStudent.class_no
    });
    showToast(res.message || (res.success ? 'Student updated' : 'Update failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setEditingStudent(null);
      await loadAdminStudents();
    }
  };

  const tabs = [
    { id: 'system', label: 'System Info' },
    { id: 'backup', label: 'Backup' },
    { id: 'restore', label: 'Restore' },
    { id: 'students', label: 'Students' },
    { id: 'sync', label: 'Student Sync' },
    { id: 'export', label: 'Export' },
    { id: 'teachers', label: 'Teachers' },
    { id: 'assignment', label: 'Mode A/B Assign' },
    { id: 'grading-sheet', label: 'Grading Sheet' },
  ];

  const visibleDatabases = (() => {
    const byId = new Map((databases || []).map((d) => [Number(d.id), d]));
    for (const a of (assignments || [])) {
      const id = Number(a.database_id);
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, name: `[Missing DB #${id}]`, missing: true });
    }
    return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
  })();

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>EDUVERSE — Admin Panel</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>System Management</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={async () => {
            await loadDatabases();
            await loadTeachers();
            await loadAssignments();
            await loadAssignedLevels();
            await loadQuizStudentDbs();
            await loadBackups();
            await loadSystemInfo();
            if (tab === 'students') await loadAdminStudents();
            showToast('Refreshed');
          }} className="btn btn-outline btn-sm">Refresh</button>
          <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'students') loadAdminStudents(); }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(253,121,168,0.15)' : 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'system' && systemInfo && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>System Information</h3>
              <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  <InfoItem label="App Name" value={systemInfo.appName} />
                  <InfoItem label="Version" value={systemInfo.version} />
                  <InfoItem label="Author" value={systemInfo.author} />
                  <InfoItem label="Year" value={systemInfo.year} />
                  <InfoItem label="Port" value={systemInfo.port} />
                  <InfoItem label="Hostname" value={systemInfo.hostname} />
                  <InfoItem label="Platform" value={systemInfo.platform} />
                  <InfoItem label="Uptime" value={`${Math.floor(systemInfo.uptime)}s`} />
                </div>
                {systemInfo.lanAddresses?.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>LAN Access URLs</h4>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Students can connect via WiFi at:</p>
                    {systemInfo.lanAddresses.map((addr, i) => (
                      <div key={i} style={{ padding: '0.4rem 0.8rem', background: 'var(--bg-input)', borderRadius: 6, marginBottom: '0.3rem', fontFamily: 'monospace', color: 'var(--secondary)' }}>
                        {addr}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Create Backup</h3>
              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem' }}>
                <button onClick={createJsonBackup} className="btn btn-primary" disabled={backupLoading}>
                  {backupLoading ? 'Creating...' : 'JSON Backup'}
                </button>
                <button onClick={createSqliteBackup} className="btn btn-secondary" disabled={backupLoading}>
                  {backupLoading ? 'Creating...' : 'SQLite Backup'}
                </button>
              </div>
              <h4 style={{ marginBottom: '0.8rem' }}>Backup History</h4>
              {backups.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No backups yet</p>}
              {backups.map(b => (
                <div key={b.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{b.filename}</strong>
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Type: {b.type} | Size: {(b.size / 1024).toFixed(1)} KB | {b.created_at}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button onClick={() => downloadBackup(b.filename)} className="btn btn-outline btn-sm">Download</button>
                    <button onClick={() => deleteBackup(b.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'restore' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Restore from Backup</h3>
              <div className="card">
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Import backup file</label>
                  <input type="file" accept=".json" onChange={handleFileImport} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Or paste JSON data</label>
                  <textarea value={importData} onChange={e => setImportData(e.target.value)} rows={6} style={{ width: '100%' }} placeholder="Paste backup JSON here..." />
                </div>
                <button onClick={restoreFromJson} className="btn btn-primary">Restore</button>
                <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Warning: This will overwrite existing data for the restored modules.</p>
              </div>
            </div>
          )}

          {tab === 'students' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Student Import &amp; Edit</h3>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <select value={studentMode} onChange={(e) => { setStudentMode(e.target.value); setAdminStudents([]); setEditingStudent(null); }}>
                    <option value="grades">Mode A (Grades DB)</option>
                    <option value="quiz">Mode B (Quiz)</option>
                  </select>
                  {studentMode === 'grades' ? (
                    <select value={studentDbId} onChange={(e) => setStudentDbId(e.target.value)}>
                      <option value="">Select database</option>
                      {visibleDatabases.map((d) => <option key={d.id} value={d.id}>{d.name || `DB #${d.id}`}</option>)}
                    </select>
                  ) : (
                    <select value={studentGradeLevel} onChange={(e) => setStudentGradeLevel(e.target.value)}>
                      <option value="">Select grade level</option>
                      {assignedLevelsB.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                    </select>
                  )}
                  {studentMode === 'quiz' && (
                    <select value={studentDbId} onChange={(e) => setStudentDbId(e.target.value)} title="Optional quiz DB link">
                      <option value="">DB (optional)</option>
                      {databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                  <button onClick={loadAdminStudents} className="btn btn-outline btn-sm">Load Students</button>
                  <button onClick={downloadStudentTemplate} className="btn btn-secondary btn-sm">Download Template</button>
                  <button onClick={downloadStudentTemplatePdf} className="btn btn-outline btn-sm">Template PDF</button>
                  <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    Upload Excel
                    <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { uploadStudentExcel(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                  Template columns: STUDENT ID | THAI NAME | ENGLISH NAME | SECTION | CLASS NUMBER | GRADE LEVEL
                </p>
              </div>
              {editingStudent && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Edit: {editingStudent.student_id}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input placeholder="Thai name" value={editingStudent.thai_name || ''} onChange={(e) => setEditingStudent({ ...editingStudent, thai_name: e.target.value })} />
                    <input placeholder="English name" value={editingStudent.english_name || ''} onChange={(e) => setEditingStudent({ ...editingStudent, english_name: e.target.value })} />
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={saveStudentNames} className="btn btn-primary btn-sm">Save</button>
                    <button onClick={() => setEditingStudent(null)} className="btn btn-outline btn-sm">Cancel</button>
                  </div>
                </div>
              )}
              {adminStudents.length > 0 && (
                <table>
                  <thead><tr><th>ID</th><th>Thai</th><th>English</th><th>Section</th><th>Class</th><th></th><th></th></tr></thead>
                  <tbody>
                    {adminStudents.map((s) => (
                      <tr key={s.id || `${s.student_id}-${s.grade_level}`}>
                        <td>{s.student_id}</td>
                        <td>{s.thai_name}</td>
                        <td>{s.english_name}</td>
                        <td>{s.section}</td>
                        <td>{s.class_number || s.class_no}</td>
                        <td><button onClick={() => setEditingStudent({ ...s })} className="btn btn-outline btn-sm">Edit</button></td>
                        <td><button onClick={() => deleteStudent(s)} className="btn btn-danger btn-sm">Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {adminStudents.length === 0 && <p style={{ color: 'var(--text-dim)' }}>Load students after selecting database or grade level.</p>}
            </div>
          )}

          {tab === 'sync' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Sync Students Between Modes</h3>
              <div className="card">
                <div style={{ display: 'grid', gap: '0.8rem', maxWidth: 400 }}>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Direction</label>
                    <select value={syncDirection} onChange={e => setSyncDirection(e.target.value)} style={{ width: '100%' }}>
                      <option value="grades-to-quiz">Grades → Quiz (Mode A → B)</option>
                      <option value="quiz-to-grades">Quiz → Grades (Mode B → A)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Grade Database</label>
                    <select value={syncDbId} onChange={e => setSyncDbId(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Select database</option>
                      {databases.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Grade Level</label>
                    <select value={syncGradeLevel} onChange={e => setSyncGradeLevel(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Select grade level</option>
                      {assignedLevelsA.map(gl =>
                        <option key={gl} value={gl}>{gl}</option>)}
                    </select>
                  </div>
                  <button onClick={syncStudents} className="btn btn-primary">Sync Students</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'export' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Export Data (Excel)</h3>
              <div style={{ display: 'grid', gap: '0.8rem', maxWidth: 480 }}>
                <div className="card">
                  <h4 style={{ marginBottom: '0.5rem' }}>Export Grade Students</h4>
                  <select value={syncDbId} onChange={e => setSyncDbId(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <option value="">Select database</option>
                    {databases.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={exportResultFilter} onChange={e => setExportResultFilter(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <option value="">All students</option>
                    <option value="PASSED">Passed only</option>
                    <option value="FAILED">Failed only</option>
                  </select>
                  <button onClick={exportGradesExcel} className="btn btn-primary btn-sm" disabled={!syncDbId}>Download .xlsx</button>
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: '0.5rem' }}>Export Quiz Students</h4>
                  <select value={syncGradeLevel} onChange={e => setSyncGradeLevel(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <option value="">All assigned levels</option>
                    {assignedLevelsB.map(gl => <option key={gl} value={gl}>{gl}</option>)}
                  </select>
                  <button onClick={exportQuizExcel} className="btn btn-secondary btn-sm">Download .xlsx</button>
                </div>
              </div>
            </div>
          )}
          {tab === 'teachers' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Teacher Access Management</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                <input placeholder="Teacher ID" value={teacherForm.userId} onChange={e => setTeacherForm({ ...teacherForm, userId: e.target.value })} />
                <input placeholder="Name" value={teacherForm.name} onChange={e => setTeacherForm({ ...teacherForm, name: e.target.value })} />
                <input placeholder="Password" value={teacherForm.password} onChange={e => setTeacherForm({ ...teacherForm, password: e.target.value })} />
                <select value={teacherForm.teacherMode} onChange={e => setTeacherForm({ ...teacherForm, teacherMode: e.target.value })}>
                  <option value="both">Mode A + Mode B</option>
                  <option value="grades">Mode A only</option>
                  <option value="quiz">Mode B only</option>
                </select>
                <button onClick={addTeacher} className="btn btn-primary btn-sm">Add Teacher</button>
              </div>
              {teachers.map((t) => (
                <div key={t.user_id} className="card" style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{t.user_id} - {t.name}</strong>
                    <button onClick={() => removeTeacher(t.user_id)} className="btn btn-danger btn-sm">Remove</button>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                    Login modes: {t.gradeModeEnabled ? 'A' : ''}{t.gradeModeEnabled && t.quizModeEnabled ? ' + ' : ''}{t.quizModeEnabled ? 'B' : ''}
                  </div>
                  {!t.gradeModeEnabled && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                      Mode B-only teacher (no Mode A database permissions needed).
                    </div>
                  )}
                  {t.gradeModeEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.6rem' }}>
                    {databases.map((db) => (
                      <div key={db.id}>
                        <small>{db.name}</small>
                        <select value={(t.permissions.find(p => p.databaseId === db.id)?.accessLevel) || 'NO_ACCESS'} onChange={e => savePermission(t.user_id, db.id, e.target.value)} style={{ width: '100%' }}>
                          <option value="VIEW_ONLY">View Only</option>
                          <option value="EDIT">Edit</option>
                          <option value="NO_ACCESS">No Access</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {tab === 'grading-sheet' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Detailed Grading Sheet</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <select value={sheetMode} onChange={(e) => setSheetMode(e.target.value)}>
                  <option value="grades">Mode A — Edit Sheet</option>
                  <option value="quiz">Mode B — Quiz Sheet</option>
                  <option value="unified">Unified A+B View</option>
                </select>
                {(sheetMode === 'grades' || sheetMode === 'unified') ? (
                  <select value={sheetDbId} onChange={(e) => setSheetDbId(e.target.value)}>
                    <option value="">Select database</option>
                    {databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : (
                  <select value={sheetGradeLevel} onChange={(e) => setSheetGradeLevel(e.target.value)}>
                    <option value="">Select grade level</option>
                    {assignedLevelsB.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                  </select>
                )}
              </div>
              {sheetMode === 'grades' && sheetDbId && (
                <GradingSheetEditor
                  mode="grades"
                  scopeId={Number(sheetDbId)}
                  scopeLabel={databases.find((d) => String(d.id) === String(sheetDbId))?.name}
                  sections={sheetSections}
                  canEdit
                  showToast={showToast}
                />
              )}
              {sheetMode === 'quiz' && sheetGradeLevel && (
                <GradingSheetEditor
                  mode="quiz"
                  scopeId={sheetGradeLevel}
                  scopeLabel={sheetGradeLevel}
                  canEdit
                  showToast={showToast}
                  gradeLevels={assignedLevelsB}
                />
              )}
              {sheetMode === 'unified' && sheetDbId && (
                <UnifiedGradingSheet
                  databaseId={Number(sheetDbId)}
                  databaseName={databases.find((d) => String(d.id) === String(sheetDbId))?.name}
                  sections={sheetSections}
                  showToast={showToast}
                />
              )}
              {((sheetMode === 'grades' && !sheetDbId) || (sheetMode === 'quiz' && !sheetGradeLevel) || (sheetMode === 'unified' && !sheetDbId)) && (
                <p style={{ color: 'var(--text-dim)' }}>Select a database or grade level above.</p>
              )}
            </div>
          )}

          {tab === 'assignment' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grade Databases</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="New database name" value={newDbName} onChange={e => setNewDbName(e.target.value)} />
                <button onClick={createDatabase} className="btn btn-primary btn-sm">Create Database</button>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                  {visibleDatabases.map((db) => (
                    <div key={db.id} className="card" style={{ marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        {editingDbId === db.id ? (
                          <input value={editingDbName} onChange={(e) => setEditingDbName(e.target.value)} />
                        ) : (
                          <>{db.name || `DB #${db.id}`}</>
                        )} <small style={{ color: 'var(--text-dim)' }}>#{db.id}</small>
                      </span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {db.missing ? (
                          <small style={{ color: 'var(--warning)' }}>Referenced by assignments</small>
                        ) : (
                        <>
                        {editingDbId === db.id ? (
                          <>
                            <button onClick={saveDatabaseEdit} className="btn btn-primary btn-sm">Save</button>
                            <button onClick={() => { setEditingDbId(null); setEditingDbName(''); }} className="btn btn-outline btn-sm">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => startEditDatabase(db)} className="btn btn-outline btn-sm">Edit</button>
                        )}
                        <button onClick={() => deleteDatabase(db.id)} className="btn btn-danger btn-sm">Delete</button>
                        </>
                        )}
                      </div>
                    </div>
                  ))}
                {databases.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No databases yet.</p>}
              </div>
              <h3 style={{ marginBottom: '1rem' }}>Mode B Student Databases</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr auto', gap: '0.5rem' }}>
                <input placeholder="Student DB Name" value={quizDbForm.name} onChange={(e) => setQuizDbForm({ ...quizDbForm, name: e.target.value })} />
                <select value={quizDbForm.gradeLevel} onChange={(e) => setQuizDbForm({ ...quizDbForm, gradeLevel: e.target.value })}>
                  {(assignedLevelsB.length ? assignedLevelsB : DEFAULT_GRADE_LEVELS).map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <input placeholder="Spreadsheet URL (optional)" value={quizDbForm.spreadsheetUrl} onChange={(e) => setQuizDbForm({ ...quizDbForm, spreadsheetUrl: e.target.value })} />
                <input placeholder="Teacher ID (optional)" value={quizDbForm.teacherId} onChange={(e) => setQuizDbForm({ ...quizDbForm, teacherId: e.target.value })} />
                {editingQuizDbId ? (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={saveQuizDbEdit} className="btn btn-primary btn-sm">Save</button>
                    <button onClick={() => { setEditingQuizDbId(null); setQuizDbForm({ name: '', gradeLevel: assignedLevelsB[0] || 'MATHAYUM 1', spreadsheetUrl: '', teacherId: '' }); }} className="btn btn-outline btn-sm">Cancel</button>
                  </div>
                ) : (
                  <button onClick={createQuizStudentDb} className="btn btn-primary btn-sm">Create</button>
                )}
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                {quizStudentDbs.map((db) => (
                  <div key={db.id} className="card" style={{ marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{db.name} | {db.grade_level} <small style={{ color: 'var(--text-dim)' }}>#{db.id}</small></span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => startEditQuizDb(db)} className="btn btn-outline btn-sm">Edit</button>
                      <button onClick={() => deleteQuizStudentDb(db.id)} className="btn btn-danger btn-sm">Delete</button>
                    </div>
                  </div>
                ))}
                {quizStudentDbs.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No Mode B student databases yet.</p>}
              </div>
              <h3 style={{ marginBottom: '1rem' }}>Assign Grade Level + Section to DB (Mode A/B)</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                <select value={assignmentForm.mode} onChange={e => {
                  const mode = e.target.value;
                  const levels = mode === 'B' ? assignedLevelsB : assignedLevelsA;
                  setAssignmentForm({ ...assignmentForm, mode, gradeLevel: levels[0] || assignmentForm.gradeLevel });
                }}><option value="A">Mode A</option><option value="B">Mode B</option></select>
                <select value={assignmentForm.gradeLevel} onChange={e => setAssignmentForm({ ...assignmentForm, gradeLevel: e.target.value })}>
                  {(assignmentForm.mode === 'B' ? assignedLevelsB : assignedLevelsA).map(gl => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <input placeholder="Section" value={assignmentForm.section} onChange={e => setAssignmentForm({ ...assignmentForm, section: e.target.value })} />
                <select value={assignmentForm.databaseId} onChange={e => setAssignmentForm({ ...assignmentForm, databaseId: parseInt(e.target.value) })}><option value="">DB</option>{visibleDatabases.map(db => <option key={db.id} value={db.id}>{db.name || `DB #${db.id}`}</option>)}</select>
                <button onClick={saveAssignment} className="btn btn-primary btn-sm">Save Assign</button>
              </div>
              {assignments.map((a) => <div key={`${a.mode}-${a.grade_level}-${a.section}`} className="card" style={{ marginBottom: '0.4rem' }}>{a.mode} | {a.grade_level} | Section {a.section} {'->'} DB {a.database_id}</div>)}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>{label}</span>
      <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>{value || '-'}</span>
    </div>
  );
}
