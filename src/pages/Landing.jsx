import React, { useState, useEffect } from 'react';
import { api } from '../api';

const DEFAULT_GRADE_LEVELS = ['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'];

export default function Landing({ onLogin, showToast }) {
  const [view, setView] = useState('select');
  const [mode, setMode] = useState('');
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [gradeLevels, setGradeLevels] = useState(DEFAULT_GRADE_LEVELS);
  const [loading, setLoading] = useState(false);
  const [resetId, setResetId] = useState('');
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    if (view === 'login' && role === 'student' && mode === 'quiz') {
      api.get('/students/assigned-grade-levels?mode=B').then((res) => {
        if (res.success && res.gradeLevels?.length) setGradeLevels(res.gradeLevels);
      });
    }
  }, [view, role, mode]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { mode, role, userId, password, gradeLevel });
      if (data.success) {
        const user = data.user || data.teacher || data.student || {};
        user.role = user.role || role;
        user.mode = mode;
        onLogin(user, mode, data.token);
      } else {
        showToast(data.message || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!resetId.trim()) { showToast('Enter your Student ID', 'error'); return; }
    const data = await api.post('/auth/password-reset-request', { studentId: resetId });
    showToast(data.message || (data.success ? 'Request submitted' : 'Failed'), data.success ? 'success' : 'error');
    if (data.success) setShowReset(false);
  };

  const selectMode = (m) => { setMode(m); setView('role'); setRole(''); };
  const selectRole = (r) => { setRole(r); setView('login'); };
  const goBack = () => {
    if (view === 'login') { setView('role'); setRole(''); }
    else if (view === 'role') { setView('select'); setMode(''); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, background: 'linear-gradient(135deg, #6c5ce7, #00cec9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>EDUVERSE</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '1rem' }}>Hybrid LAN + Cloud Educational Platform</p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.3rem' }}>by JOSEPH BRYLLE D. EGAY | 2026</p>
      </div>

      {view === 'select' && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <ModeCard title="MODE A" subtitle="Student Grades System" desc="View grades, report cards, academic records" color="#6c5ce7" onClick={() => selectMode('grades')} />
          <ModeCard title="MODE B" subtitle="Quiz / Game System" desc="Take quizzes, educational games, leaderboard" color="#00cec9" onClick={() => selectMode('quiz')} />
          <ModeCard title="ADMIN" subtitle="System Management" desc="Backup, restore, student management, settings" color="#fd79a8" onClick={() => selectMode('admin')} />
        </div>
      )}

      {view === 'role' && (
        <div style={{ maxWidth: 400, width: '100%' }}>
          <button onClick={goBack} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>Back</button>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-bright)' }}>{mode === 'grades' ? 'MODE A — Grades' : mode === 'quiz' ? 'MODE B — Quiz' : 'Admin Panel'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mode !== 'admin' && (
              <RoleCard title="Student" desc={mode === 'grades' ? 'View your grades and records' : 'Take quizzes and games'} onClick={() => selectRole('student')} />
            )}
            <RoleCard title={mode === 'admin' ? 'Administrator' : 'Teacher / Admin'} desc={mode === 'admin' ? 'Full system management' : 'Manage grades, quizzes, students'} onClick={() => selectRole(mode === 'admin' ? 'admin' : 'teacher')} />
          </div>
        </div>
      )}

      {view === 'login' && (
        <div className="card" style={{ maxWidth: 400, width: '100%' }}>
          <button onClick={goBack} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>Back</button>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>
            {mode === 'grades' ? 'Grades' : mode === 'quiz' ? 'Quiz' : 'Admin'} — {role === 'student' ? 'Student' : 'Teacher'} Login
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {role === 'student' ? 'Login with your Student ID' : 'Login with your credentials'}
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {role === 'student' && mode === 'quiz' && (
              <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} required>
                <option value="">Select Grade Level</option>
                {gradeLevels.map(gl => <option key={gl} value={gl}>{gl}</option>)}
              </select>
            )}
            <input type="text" placeholder={role === 'student' ? 'Student ID' : 'Username'} value={userId} onChange={e => setUserId(e.target.value)} required autoFocus />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {role === 'student' && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button onClick={() => setShowReset(!showReset)} style={{ background: 'none', color: 'var(--secondary)', fontSize: '0.85rem' }}>
                Forgot Password?
              </button>
              {showReset && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                  <input type="text" placeholder="Your Student ID" value={resetId} onChange={e => setResetId(e.target.value)} style={{ flex: 1 }} />
                  <button onClick={handlePasswordReset} className="btn btn-secondary btn-sm">Request Reset</button>
                </div>
              )}
              <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Default password: "default" — contact admin/teacher to reset
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeCard({ title, subtitle, desc, color, onClick }) {
  return (
    <div onClick={onClick} className="card" style={{ width: 250, cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s', borderColor: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 25px ${color}40`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}>
      <h3 style={{ color, fontSize: '1.5rem', marginBottom: '0.3rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-bright)', fontWeight: 600, marginBottom: '0.5rem' }}>{subtitle}</p>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{desc}</p>
    </div>
  );
}

function RoleCard({ title, desc, onClick }) {
  return (
    <div onClick={onClick} className="card" style={{ cursor: 'pointer', transition: 'all 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
      <h3 style={{ color: 'var(--text-bright)', marginBottom: '0.3rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{desc}</p>
    </div>
  );
}
