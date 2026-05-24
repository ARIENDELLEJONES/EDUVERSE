import React, { useState, useEffect } from 'react';
import { api, downloadFile } from '../api';
import { weightsToApiPayload } from '../utils/gradeWeights';
import GradingSheetEditor from '../components/GradingSheetEditor';
import UnifiedGradingSheet from '../components/UnifiedGradingSheet';
import ActivityManager from '../components/ActivityManager';

export default function GradeAdminDashboard({ user, onLogout, showToast }) {
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState('databases');
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [dbData, setDbData] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [sectionStudents, setSectionStudents] = useState([]);
  const [sectionGrades, setSectionGrades] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [newDbName, setNewDbName] = useState('');
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState({});
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [exportResultFilter, setExportResultFilter] = useState('');
  const [sheetSection, setSheetSection] = useState('');
  const [sheetView, setSheetView] = useState('edit');

  const canEditDb = (dbId) => {
    if (isAdmin) return true;
    const p = (user.permissions || []).find((perm) => Number(perm.database_id) === Number(dbId));
    return p?.access_level === 'EDIT';
  };

  useEffect(() => { loadDatabases(); }, []);

  const loadDatabases = async () => {
    const res = await api.get('/grades/databases');
    if (res.success) setDatabases(res.databases || []);
    else showToast(res.message || 'Failed to load databases', 'error');
  };

  const selectDatabase = async (db) => {
    setSelectedDb(db);
    setLoading(true);
    const res = await api.get(`/grades/database/${db.id}`);
    if (res.success) {
      setDbData(res);
      setWeights(res.weights || {});
    } else {
      showToast(res.message || 'Failed to load database', 'error');
    }
    const secRes = await api.get(`/grades/sections?databaseId=${db.id}`);
    if (secRes.success) setSections(secRes.sections);
    setLoading(false);
  };

  const refreshCurrentView = async () => {
    await loadDatabases();
    if (selectedDb) {
      await selectDatabase(selectedDb);
      if (selectedSection) await loadSectionStudents(selectedSection);
    }
    if (tab === 'passwords') await loadPasswordRequests();
    if (tab === 'search' && searchId.trim()) await searchStudent();
  };

  const createDatabase = async () => {
    if (!newDbName.trim()) return;
    const res = await api.post('/grades/databases', { name: newDbName.trim() });
    if (res.success) {
      showToast('Database created');
      setNewDbName('');
      await loadDatabases();
    } else showToast(res.message || 'Create failed', 'error');
  };

  const deleteDatabase = async (id) => {
    if (!confirm('Delete this database and all students/scores in it?')) return;
    const res = await api.del(`/grades/databases/${id}`);
    if (res.success) {
      showToast(res.message || 'Database deleted');
      if (selectedDb?.id === id) {
        setSelectedDb(null);
        setDbData(null);
        setSections([]);
        setSelectedSection('');
        setSectionStudents([]);
        setSectionGrades([]);
      }
      await loadDatabases();
    } else showToast(res.message || 'Delete failed', 'error');
  };

  const loadSectionStudents = async (section) => {
    if (!selectedDb) return;
    setSelectedSection(section);
    const res = await api.get(`/grades/section/${section}/students?databaseId=${selectedDb.id}`);
    if (res.success) setSectionStudents(res.students);
    const gradesRes = await api.get(`/grades/section/${section}/grades?databaseId=${selectedDb.id}`);
    if (gradesRes.success) setSectionGrades(gradesRes.students);
  };

  const searchStudent = async () => {
    if (!searchId.trim()) return;
    const res = await api.get(`/grades/student/${searchId}/search?databaseId=${selectedDb?.id || ''}`);
    if (res.success) setSearchResult(res);
    else { showToast(res.message, 'error'); setSearchResult(null); }
  };

  const saveWeights = async () => {
    if (!selectedDb) return;
    if (!canEditDb(selectedDb.id)) { showToast('View only — cannot save weights', 'error'); return; }
    const res = await api.post('/grades/weights', weightsToApiPayload(selectedDb.id, weights));
    if (res.success) {
      showToast(res.message || 'Weights saved', 'success');
      await selectDatabase(selectedDb);
    } else showToast(res.message || 'Save failed', 'error');
  };

  const loadPasswordRequests = async () => {
    const res = await api.get('/students/password-requests');
    if (res.success) setPasswordRequests(res.data);
  };

  const resetPassword = async (studentId) => {
    const res = await api.post(`/students/${studentId}/reset-password`, { mode: 'grades' });
    showToast(res.message || (res.success ? 'Password reset' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadPasswordRequests();
  };

  const exportStudentsExcel = async (opts = {}) => {
    if (!selectedDb) return;
    const params = new URLSearchParams({
      mode: 'grades',
      databaseId: String(selectedDb.id)
    });
    if (opts.section || selectedSection) params.set('section', opts.section || selectedSection);
    if (opts.studentId) params.set('studentId', opts.studentId);
    if (opts.resultFilter || exportResultFilter) params.set('resultFilter', opts.resultFilter || exportResultFilter);
    try {
      await downloadFile(`/api/students/export-excel?${params}`, `grades_${selectedDb.id}.xlsx`);
      showToast('Excel downloaded');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const saveScore = async (studentId, period, scoreType, slot, value) => {
    const databaseId = selectedDb?.id || searchResult?.student?.databaseId;
    if (!databaseId) return;
    if (!canEditDb(databaseId)) { showToast('View only — cannot save scores', 'error'); return; }
    const res = await api.post('/grades/student/scores', {
      databaseId, studentId, period, scoreType,
      scores: [{ slot, score: parseFloat(value) || 0 }]
    });
    if (res.success) {
      showToast('Score saved', 'success');
      if (searchResult?.student?.studentId === studentId) {
        const updated = await api.get(`/grades/student/${studentId}/search?databaseId=${databaseId}`);
        if (updated.success) setSearchResult(updated);
      }
      if (selectedSection && selectedDb) await loadSectionStudents(selectedSection);
    } else showToast(res.message || 'Save failed', 'error');
  };

  const saveExamScore = async (studentId, side, slot, value) => {
    const databaseId = selectedDb?.id || searchResult?.student?.databaseId;
    if (!databaseId) return;
    if (!canEditDb(databaseId)) { showToast('View only — cannot save scores', 'error'); return; }
    const res = await api.post('/grades/student/exam-scores', {
      databaseId, studentId, side,
      scores: [{ slot, score: parseFloat(value) || 0 }]
    });
    if (res.success) {
      showToast('Exam score saved', 'success');
      if (searchResult?.student?.studentId === studentId) {
        const updated = await api.get(`/grades/student/${studentId}/search?databaseId=${databaseId}`);
        if (updated.success) setSearchResult(updated);
      }
      if (selectedSection && selectedDb) await loadSectionStudents(selectedSection);
    } else showToast(res.message || 'Save failed', 'error');
  };

  const tabs = [
    { id: 'databases', label: 'Databases' },
    { id: 'students', label: 'Students' },
    { id: 'grades', label: 'Grades' },
    { id: 'search', label: 'Search Student' },
    { id: 'weights', label: 'Grading Weights' },
    { id: 'activities', label: 'Activities' },
    { id: 'grading-sheet', label: 'Grading Sheet' },
    { id: 'passwords', label: 'Password Requests' },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>EDUVERSE — Grade Admin</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {user.name || user.id} | {selectedDb ? `DB: ${selectedDb.name}` : 'Select a database'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={refreshCurrentView} className="btn btn-outline btn-sm" disabled={loading}>Refresh</button>
          <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'passwords') loadPasswordRequests(); }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(108,92,231,0.15)' : 'transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--primary)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'databases' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grade Databases</h3>
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input placeholder="New database name" value={newDbName} onChange={e => setNewDbName(e.target.value)} />
                  <button onClick={createDatabase} className="btn btn-primary btn-sm">Create</button>
                </div>
              )}
              {!isAdmin && (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Databases are created by the system administrator.
                </p>
              )}
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {databases.map(db => (
                  <div key={db.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: selectedDb?.id === db.id ? 'var(--primary)' : 'var(--border)', cursor: 'pointer' }}
                    onClick={() => selectDatabase(db)}>
                    <div>
                      <h4 style={{ color: 'var(--text-bright)' }}>{db.name}</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Created: {db.created_at}</p>
                    </div>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); deleteDatabase(db.id); }} className="btn btn-danger btn-sm">Delete</button>
                    )}
                  </div>
                ))}
                {databases.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No databases yet. Create one to get started.</p>}
              </div>
            </div>
          )}

          {tab === 'students' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Students — {selectedDb.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {sections.map(s => (
                  <button key={s} onClick={() => loadSectionStudents(s)}
                    className={`btn btn-sm ${selectedSection === s ? 'btn-primary' : 'btn-outline'}`}>
                    Section {s}
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                <select value={exportResultFilter} onChange={e => setExportResultFilter(e.target.value)} style={{ maxWidth: 140 }}>
                  <option value="">All students</option>
                  <option value="PASSED">Passed only</option>
                  <option value="FAILED">Failed only</option>
                </select>
                <button onClick={() => exportStudentsExcel()} className="btn btn-secondary btn-sm" title="Export students to Excel">
                  Export Excel{selectedSection ? ` (Sec ${selectedSection})` : ' (All)'}
                </button>
                <button onClick={async () => {
                  try {
                    const q = `databaseId=${selectedDb.id}` + (selectedSection ? `&section=${selectedSection}` : '');
                    await downloadFile(`/api/grades/grading-sheet/export?${q}`, `grading_sheet_${selectedDb.id}.xlsx`);
                    showToast('Grading sheet downloaded');
                  } catch { showToast('Export failed', 'error'); }
                }} className="btn btn-outline btn-sm" title="Detailed grading sheet">Detailed Grading Sheet</button>
                <label className={`btn btn-outline btn-sm ${!canEditDb(selectedDb.id) ? 'disabled' : ''}`} style={{ cursor: canEditDb(selectedDb.id) ? 'pointer' : 'not-allowed', margin: 0, opacity: canEditDb(selectedDb.id) ? 1 : 0.5 }}>
                  Import Excel
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} disabled={!canEditDb(selectedDb.id)} onChange={async (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    if (!canEditDb(selectedDb.id)) { showToast('View only — cannot import', 'error'); return; }
                    const fd = new FormData(); fd.append('file', file); fd.append('mode', 'grades'); fd.append('databaseId', selectedDb.id);
                    const token = localStorage.getItem('eduverse_token');
                    const res = await fetch('/api/students/import-excel', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
                    const data = await res.json();
                    showToast(data.message, data.success ? 'success' : 'error');
                    if (data.success) {
                      const secRes = await api.get(`/grades/sections?databaseId=${selectedDb.id}`);
                      if (secRes.success) setSections(secRes.sections);
                      if (selectedSection) await loadSectionStudents(selectedSection);
                    }
                    e.target.value = '';
                  }} />
                </label>
              </div>
              {sectionStudents.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>#</th><th>Student ID</th><th>Thai Name</th><th>English Name</th><th>Section</th><th>Class No</th><th></th></tr></thead>
                    <tbody>
                      {sectionStudents.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{s.student_id}</td>
                          <td>{s.thai_name}</td>
                          <td>{s.english_name}</td>
                          <td>{s.section}</td>
                          <td>{s.class_number}</td>
                          <td>
                            <button type="button" onClick={() => exportStudentsExcel({ studentId: s.student_id, section: s.section })}
                              className="btn btn-outline btn-sm">Excel</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'grades' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Section Grades — {selectedDb.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {sections.map(s => (
                  <button key={s} onClick={() => loadSectionStudents(s)}
                    className={`btn btn-sm ${selectedSection === s ? 'btn-primary' : 'btn-outline'}`}>
                    Section {s}
                  </button>
                ))}
              </div>
              {sectionGrades.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th><th>English Name</th><th>Section</th>
                        <th>Midterm</th><th>Final Initial</th><th>Final</th>
                        <th>Exam</th><th>Overall</th><th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionGrades.map(s => (
                        <tr key={s.studentId}>
                          <td>{s.studentId}</td>
                          <td>{s.englishName}</td>
                          <td>{s.section}</td>
                          <td>{s.midtermEquivalent}</td>
                          <td>{s.finalInitialEquivalent}</td>
                          <td>{s.finalFinalEquivalent}</td>
                          <td>{s.finalExamEquivalent}</td>
                          <td style={{ fontWeight: 600 }}>{s.overallTotal}</td>
                          <td><span className={`badge ${s.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{s.result}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'search' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Search Student</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input placeholder="Student ID" value={searchId} onChange={e => setSearchId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchStudent()} />
                <button onClick={searchStudent} className="btn btn-primary btn-sm">Search</button>
              </div>
              {searchResult && (
                <div className="card">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Student ID</span><br/><strong>{searchResult.student.studentId}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Thai Name</span><br/><strong>{searchResult.student.thaiName}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>English Name</span><br/><strong>{searchResult.student.englishName}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Section</span><br/><strong>{searchResult.student.section}</strong></div>
                  </div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Activity Scores</h4>
                  <table>
                    <thead><tr><th>Period</th><th>Type</th><th>Slot</th><th>Score</th></tr></thead>
                    <tbody>
                      {(searchResult.scores || []).map((s, i) => (
                        <tr key={i}>
                          <td>{s.period}</td><td>{s.score_type}</td><td>{s.slot}</td>
                          <td>
                            <input type="number" key={`${s.period}-${s.score_type}-${s.slot}-${s.score}`} defaultValue={s.score} style={{ width: 80 }}
                              disabled={!canEditDb(selectedDb?.id || searchResult.student.databaseId)}
                              onBlur={e => saveScore(searchResult.student.studentId, s.period, s.score_type, s.slot, e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h4 style={{ margin: '1rem 0 0.5rem' }}>Exam Scores</h4>
                  <table>
                    <thead><tr><th>Side</th><th>Slot</th><th>Score</th></tr></thead>
                    <tbody>
                      {(searchResult.examScores || []).map((e, i) => (
                        <tr key={i}>
                          <td>{e.side}</td><td>{e.slot}</td>
                          <td>
                            <input type="number" key={`${e.side}-${e.slot}-${e.score}`} defaultValue={e.score} style={{ width: 80 }}
                              disabled={!canEditDb(selectedDb?.id || searchResult.student.databaseId)}
                              onBlur={ev => saveExamScore(searchResult.student.studentId, e.side, e.slot, ev.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'activities' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Activities — {selectedDb.name}</h3>
              <ActivityManager
                databaseId={selectedDb.id}
                databaseName={selectedDb.name}
                sections={sections}
                showToast={showToast}
                canEdit={canEditDb(selectedDb.id)}
              />
            </div>
          )}

          {tab === 'grading-sheet' && selectedDb && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button onClick={() => setSheetView('edit')}
                  className={`btn btn-sm ${sheetView === 'edit' ? 'btn-primary' : 'btn-outline'}`}>
                  Edit Sheet (Mode A)
                </button>
                <button onClick={() => setSheetView('unified')}
                  className={`btn btn-sm ${sheetView === 'unified' ? 'btn-primary' : 'btn-outline'}`}>
                  Unified View (A + B)
                </button>
              </div>
              {sheetView === 'edit' ? (
                <GradingSheetEditor
                  mode="grades"
                  scopeId={selectedDb.id}
                  scopeLabel={selectedDb.name}
                  sections={sections}
                  canEdit={canEditDb(selectedDb.id)}
                  showToast={showToast}
                />
              ) : (
                <UnifiedGradingSheet
                  databaseId={selectedDb.id}
                  databaseName={selectedDb.name}
                  sections={sections}
                  showToast={showToast}
                />
              )}
            </div>
          )}

          {tab === 'weights' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grading Weights — {selectedDb.name}</h3>
              <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <WeightInput label="Midterm Collective (%)" value={weights.midterm_collective} onChange={v => setWeights({ ...weights, midterm_collective: v })} />
                  <WeightInput label="Final Initial (%)" value={weights.final_initial} onChange={v => setWeights({ ...weights, final_initial: v })} />
                  <WeightInput label="Final Final (%)" value={weights.final_final} onChange={v => setWeights({ ...weights, final_final: v })} />
                  <WeightInput label="Midterm Exam (%)" value={weights.midterm_exam} onChange={v => setWeights({ ...weights, midterm_exam: v })} />
                  <WeightInput label="Final Exam (%)" value={weights.final_exam} onChange={v => setWeights({ ...weights, final_exam: v })} />
                  <WeightInput label="Pass Midterm" value={weights.pass_midterm} onChange={v => setWeights({ ...weights, pass_midterm: v })} />
                  <WeightInput label="Pass Initial" value={weights.pass_initial} onChange={v => setWeights({ ...weights, pass_initial: v })} />
                  <WeightInput label="Pass Final" value={weights.pass_final} onChange={v => setWeights({ ...weights, pass_final: v })} />
                  <WeightInput label="Pass Overall" value={weights.pass_overall} onChange={v => setWeights({ ...weights, pass_overall: v })} />
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Custom Formula (optional)</label>
                  <input
                    type="text"
                    value={weights.custom_formula ?? ''}
                    onChange={e => setWeights({ ...weights, custom_formula: e.target.value })}
                    placeholder="(midtermCollective + finalInitial + finalFinal) * 0.4 + (midtermExam + finalExam) * 0.6"
                    style={{ width: '100%' }}
                  />
                </div>
                <button onClick={saveWeights} className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={!canEditDb(selectedDb.id)}>Save Weights</button>
              </div>
            </div>
          )}

          {tab === 'passwords' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Password Reset Requests</h3>
              {passwordRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No pending requests</p>}
              {passwordRequests.map((r, i) => (
                <div key={i} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.studentId}</strong> — {r.englishName || r.thaiName} ({r.section})
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{r.date}</span>
                  </div>
                  <button onClick={() => resetPassword(r.studentId)} className="btn btn-secondary btn-sm">Reset to Default</button>
                </div>
              ))}
            </div>
          )}

          {!selectedDb && tab !== 'search' && tab !== 'databases' && tab !== 'passwords' && tab !== 'grading-sheet' && tab !== 'activities' && (
            <p style={{ color: 'var(--text-dim)' }}>Please select a database from the Databases tab first.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function WeightInput({ label, value, onChange }) {
  return (
    <div>
      <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>{label}</label>
      <input type="number" value={value ?? ''} onChange={e => onChange(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
    </div>
  );
}
