import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function GradeStudentPortal({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('grades');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await api.post('/grades/login-student', { username: user.id, password: localStorage.getItem('eduverse_student_pw') || 'default' });
    if (res.success) {
      setData(res);
      localStorage.setItem('eduverse_grade_cache', JSON.stringify(res));
    } else {
      const cached = localStorage.getItem('eduverse_grade_cache');
      if (cached) {
        setData(JSON.parse(cached));
        showToast(res.message || 'Showing cached data (offline)', 'success');
      } else {
        showToast(res.message || 'Failed to load grades', 'error');
      }
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!oldPw || !newPw) {
      showToast('Enter current and new password', 'error');
      return;
    }
    const res = await api.post('/auth/change-password', { mode: 'grades', role: 'student', userId: user.id, oldPassword: oldPw, newPassword: newPw });
    showToast(res.message || (res.success ? 'Password updated' : 'Update failed'), res.success ? 'success' : 'error');
    if (res.success) {
      localStorage.setItem('eduverse_student_pw', newPw);
      setShowChangePassword(false);
      setOldPw('');
      setNewPw('');
    }
  };

  const getScoreValue = (period, scoreType, slot) => {
    if (!data?.scores) return '-';
    const s = data.scores.find(s => s.period === period && s.score_type === scoreType && s.slot === slot);
    return s ? s.score : '-';
  };

  const getExamScore = (side, slot) => {
    if (!data?.examScores) return '-';
    const s = data.examScores.find(e => e.side === side && e.slot === slot);
    return s ? s.score : '-';
  };

  const getPeriodTotal = (period) => {
    if (!data?.scores) return 0;
    return data.scores.filter(s => s.period === period).reduce((sum, s) => sum + (s.score || 0), 0);
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>EDUVERSE — Student Grades</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Welcome, {user.english || user.thai || user.id}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={loadData} className="btn btn-outline btn-sm" disabled={loading}>Refresh</button>
          <button onClick={() => setShowChangePassword(!showChangePassword)} className="btn btn-outline btn-sm">Change Password</button>
          <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </header>

      {showChangePassword && (
        <div className="card" style={{ margin: '1rem', maxWidth: 400 }}>
          <h3 style={{ marginBottom: '0.8rem' }}>Change Password</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input type="password" placeholder="Current Password" value={oldPw} onChange={e => setOldPw(e.target.value)} />
            <input type="password" placeholder="New Password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <button onClick={handleChangePassword} className="btn btn-primary btn-sm">Update Password</button>
          </div>
        </div>
      )}

      <div style={{ padding: '1rem 1.5rem' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.8rem' }}>
            <InfoItem label="Student ID" value={data?.student?.id} />
            <InfoItem label="Thai Name" value={data?.student?.thai} />
            <InfoItem label="English Name" value={data?.student?.english} />
            <InfoItem label="Section" value={data?.student?.section} />
            <InfoItem label="Class Number" value={data?.student?.class} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {['grades', 'midterm', 'final', 'exams'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-outline'}`}>
              {t === 'grades' ? 'Overview' : t === 'midterm' ? 'Midterm' : t === 'final' ? 'Finals' : 'Exams'}
            </button>
          ))}
        </div>

        {tab === 'grades' && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Grade Overview</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              <ScoreCard title="Midterm Total" score={getPeriodTotal('midterm')} color="var(--primary)" />
              <ScoreCard title="Final Initial Total" score={getPeriodTotal('final_initial')} color="var(--secondary)" />
              <ScoreCard title="Final Total" score={getPeriodTotal('final_final')} color="var(--accent)" />
            </div>
          </div>
        )}

        {tab === 'midterm' && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Midterm Scores</h3>
            <ScoreTable title="Individual Activities" period="midterm" type="individual" getScore={getScoreValue} activities={data?.activities} />
            <ScoreTable title="Group Activities" period="midterm" type="group" getScore={getScoreValue} activities={data?.activities} style={{ marginTop: '1.5rem' }} />
          </div>
        )}

        {tab === 'final' && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Final Scores</h3>
            <ScoreTable title="Final Individual" period="final_initial" type="individual" getScore={getScoreValue} activities={data?.activities} />
            <ScoreTable title="Final Group" period="final_initial" type="group" getScore={getScoreValue} activities={data?.activities} style={{ marginTop: '1.5rem' }} />
            <ScoreTable title="Final 2 Individual" period="final_final" type="individual" getScore={getScoreValue} activities={data?.activities} style={{ marginTop: '1.5rem' }} />
            <ScoreTable title="Final 2 Group" period="final_final" type="group" getScore={getScoreValue} activities={data?.activities} style={{ marginTop: '1.5rem' }} />
          </div>
        )}

        {tab === 'exams' && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Exam Scores</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>Midterm Exam</h4>
                {data?.examTypes?.filter(e => e.side === 'midterm').map((et, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{et.type_name || `Part ${i + 1}`}</span>
                    <span style={{ color: 'var(--text-bright)' }}>{getExamScore('midterm', et.slot)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--secondary)' }}>Final Exam</h4>
                {data?.examTypes?.filter(e => e.side === 'final').map((et, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{et.type_name || `Part ${i + 1}`}</span>
                    <span style={{ color: 'var(--text-bright)' }}>{getExamScore('final', et.slot)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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

function ScoreCard({ title, score, color }) {
  return (
    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '1rem', borderLeft: `3px solid ${color}` }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>{title}</p>
      <p style={{ color: 'var(--text-bright)', fontSize: '1.5rem', fontWeight: 700 }}>{typeof score === 'number' ? score.toFixed(2) : score}</p>
    </div>
  );
}

function ScoreTable({ title, period, type, getScore, activities, style }) {
  const items = (activities || []).filter(a => a.period === period && a.type === type);
  if (items.length === 0) return null;
  return (
    <div style={style}>
      <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-dim)' }}>{title}</h4>
      <table>
        <thead><tr><th>Activity</th><th>Score</th><th>Max</th></tr></thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i}>
              <td>{a.name || `Activity ${a.slot + 1}`}</td>
              <td style={{ color: 'var(--text-bright)' }}>{getScore(period, type, a.slot)}</td>
              <td>{a.max_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
